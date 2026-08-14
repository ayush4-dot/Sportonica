"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { actionError, isActionError, type ActionError } from "@/lib/actionError";

async function requireUser() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

// Pull lat/lng out of a full Google Maps URL. Handles the common formats:
//   .../@27.7172,85.3240,15z         → after the @
//   ...!3d27.7172!4d85.3240          → place data
//   ?q=27.7172,85.3240  or  ?ll=...  → query param
function extractCoords(url: string): { lat: number; lng: number } | null {
  // @lat,lng
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };

  // !3dLAT!4dLNG (embedded place coordinates — most precise)
  const bang = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (bang) return { lat: parseFloat(bang[1]), lng: parseFloat(bang[2]) };

  // q= or ll= or query=  lat,lng
  const q = url.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };

  return null;
}

// Short links (maps.app.goo.gl / goo.gl/maps) don't contain coordinates.
// We follow the redirect server-side to get the real URL, then parse that.
async function expandShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "follow", method: "GET" });
    return res.url || url;
  } catch {
    return url;
  }
}

// Parse a pasted Google Maps link into coordinates. Returns coords + the
// canonical URL to store (used for the "open in Google Maps" tap-through).
export async function parseMapsUrl(rawUrl: string): Promise<{
  lat: number; lng: number; url: string;
} | ActionError> {
  const url = rawUrl.trim();
  if (!/^https?:\/\//.test(url)) return actionError("Paste a full Google Maps link (starting with https://).");

  let coords = extractCoords(url);
  let finalUrl = url;

  // If it's a short link or coords weren't found, follow the redirect.
  if (!coords || /goo\.gl|app\.goo\.gl/.test(url)) {
    finalUrl = await expandShortLink(url);
    coords = extractCoords(finalUrl) ?? coords;
  }

  if (!coords) {
    return actionError("Couldn't find a location in that link. On Google Maps, tap Share → Copy link, or use a link that shows the place.");
  }
  if (Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180) {
    return actionError("That link's coordinates look off. Try copying the link again.");
  }
  return { ...coords, url: finalUrl };
}

// Save a venue's location from a pasted Google Maps link.
export async function saveVenueLocation(venueId: string, rawUrl: string) {
  const { sb, user } = await requireUser();
  if (!user) return actionError("UNAUTHORIZED");
  const parsed = await parseMapsUrl(rawUrl);
  if (isActionError(parsed)) return parsed;
  const { lat, lng, url } = parsed;

  const { error } = await sb
    .from("venues")
    .update({ lat, lng, maps_url: url })
    .eq("id", venueId);
  if (error) return actionError(error.message);

  revalidatePath(`/admin/venues/${venueId}`);
  return { lat, lng, url };
}
