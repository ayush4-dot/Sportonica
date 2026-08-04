"use client";

import { useEffect, useState } from "react";

export type Area = { name: string; lat: number; lng: number };

export type City = {
  slug: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  /** Neighbourhoods people actually name when arranging a game. */
  areas: Area[];
};

/** The places people actually play, largest first. */
export const CITIES: City[] = [
  { slug: "kathmandu",  name: "Kathmandu",  province: "Bagmati",       lat: 27.7172, lng: 85.3240,
    areas: [
      { name: "Thamel", lat: 27.7154, lng: 85.3123 },
      { name: "Baluwatar", lat: 27.728, lng: 85.332 },
      { name: "Naxal", lat: 27.7167, lng: 85.3269 },
      { name: "Maitidevi", lat: 27.706, lng: 85.332 },
      { name: "Dillibazar", lat: 27.706, lng: 85.326 },
      { name: "Putalisadak", lat: 27.706, lng: 85.32 },
      { name: "New Baneshwor", lat: 27.689, lng: 85.34 },
      { name: "Old Baneshwor", lat: 27.697, lng: 85.339 },
      { name: "Koteshwor", lat: 27.678, lng: 85.349 },
      { name: "Sinamangal", lat: 27.696, lng: 85.354 },
      { name: "Chabahil", lat: 27.718, lng: 85.346 },
      { name: "Bouddha", lat: 27.7215, lng: 85.362 },
      { name: "Gongabu", lat: 27.735, lng: 85.312 },
      { name: "Balaju", lat: 27.735, lng: 85.302 },
      { name: "Samakhusi", lat: 27.733, lng: 85.317 },
      { name: "Basundhara", lat: 27.742, lng: 85.33 },
      { name: "Maharajgunj", lat: 27.737, lng: 85.332 },
      { name: "Kalanki", lat: 27.694, lng: 85.281 },
      { name: "Swayambhu", lat: 27.715, lng: 85.29 },
      { name: "Kirtipur", lat: 27.679, lng: 85.277 },
      { name: "Tokha", lat: 27.758, lng: 85.329 },
      { name: "Chandragiri", lat: 27.672, lng: 85.25 },
      { name: "Gaushala", lat: 27.707, lng: 85.345 },
      { name: "Anamnagar", lat: 27.694, lng: 85.323 },
    ] },
  { slug: "lalitpur",   name: "Lalitpur",   province: "Bagmati",       lat: 27.6588, lng: 85.3247,
    areas: [
      { name: "Patan Durbar", lat: 27.673, lng: 85.325 },
      { name: "Pulchowk", lat: 27.679, lng: 85.317 },
      { name: "Jhamsikhel", lat: 27.675, lng: 85.308 },
      { name: "Sanepa", lat: 27.681, lng: 85.308 },
      { name: "Kupondole", lat: 27.684, lng: 85.317 },
      { name: "Ekantakuna", lat: 27.664, lng: 85.306 },
      { name: "Satdobato", lat: 27.658, lng: 85.325 },
      { name: "Imadol", lat: 27.662, lng: 85.345 },
      { name: "Bhaisepati", lat: 27.648, lng: 85.296 },
      { name: "Nakhkhu", lat: 27.66, lng: 85.316 },
      { name: "Lubhu", lat: 27.639, lng: 85.362 },
      { name: "Godawari", lat: 27.596, lng: 85.381 },
    ] },
  { slug: "bhaktapur",  name: "Bhaktapur",  province: "Bagmati",       lat: 27.6710, lng: 85.4298,
    areas: [
      { name: "Durbar Square", lat: 27.672, lng: 85.428 },
      { name: "Suryabinayak", lat: 27.662, lng: 85.43 },
      { name: "Thimi", lat: 27.681, lng: 85.386 },
      { name: "Madhyapur", lat: 27.679, lng: 85.391 },
      { name: "Katunje", lat: 27.67, lng: 85.402 },
      { name: "Sallaghari", lat: 27.674, lng: 85.418 },
      { name: "Dudhpati", lat: 27.676, lng: 85.426 },
      { name: "Jagati", lat: 27.669, lng: 85.442 },
    ] },
  { slug: "pokhara",    name: "Pokhara",    province: "Gandaki",       lat: 28.2096, lng: 83.9856,
    areas: [
      { name: "Lakeside", lat: 28.21, lng: 83.956 },
      { name: "Bagar", lat: 28.234, lng: 83.984 },
      { name: "Chipledhunga", lat: 28.214, lng: 83.984 },
      { name: "Mahendrapul", lat: 28.218, lng: 83.986 },
      { name: "Prithvi Chowk", lat: 28.205, lng: 83.98 },
      { name: "Ranipauwa", lat: 28.24, lng: 83.997 },
      { name: "Bindhyabasini", lat: 28.235, lng: 83.98 },
      { name: "Birauta", lat: 28.183, lng: 83.976 },
      { name: "Hemja", lat: 28.262, lng: 83.906 },
    ] },
  { slug: "chitwan",    name: "Bharatpur",  province: "Bagmati",       lat: 27.6768, lng: 84.4360,
    areas: [
      { name: "Narayangarh", lat: 27.701, lng: 84.43 },
      { name: "Pulchowk", lat: 27.682, lng: 84.434 },
      { name: "Lions Chowk", lat: 27.68, lng: 84.427 },
      { name: "Shivanagar", lat: 27.662, lng: 84.412 },
      { name: "Bharatpur Heights", lat: 27.676, lng: 84.44 },
    ] },
  { slug: "biratnagar", name: "Biratnagar", province: "Koshi",         lat: 26.4525, lng: 87.2718,
    areas: [
      { name: "Main Road", lat: 26.453, lng: 87.273 },
      { name: "Bargachhi", lat: 26.468, lng: 87.283 },
      { name: "Rani", lat: 26.44, lng: 87.286 },
      { name: "Tinpaini", lat: 26.461, lng: 87.276 },
      { name: "Kanchanbari", lat: 26.454, lng: 87.29 },
    ] },
  { slug: "birgunj",    name: "Birgunj",    province: "Madhesh",       lat: 27.0104, lng: 84.8770,
    areas: [
      { name: "Ghantaghar", lat: 27.011, lng: 84.877 },
      { name: "Adarshanagar", lat: 27.018, lng: 84.87 },
      { name: "Powerhouse", lat: 27.005, lng: 84.883 },
      { name: "Chhapkaiya", lat: 27.023, lng: 84.878 },
      { name: "Ranighat", lat: 27.009, lng: 84.89 },
    ] },
  { slug: "dharan",     name: "Dharan",     province: "Koshi",         lat: 26.8065, lng: 87.2846,
    areas: [
      { name: "Bhanu Chowk", lat: 26.813, lng: 87.283 },
      { name: "Putali Line", lat: 26.809, lng: 87.279 },
      { name: "Chatara Line", lat: 26.805, lng: 87.274 },
      { name: "Bijayapur", lat: 26.825, lng: 87.287 },
      { name: "Panbari", lat: 26.802, lng: 87.29 },
    ] },
  { slug: "butwal",     name: "Butwal",     province: "Lumbini",       lat: 27.7006, lng: 83.4484,
    areas: [
      { name: "Traffic Chowk", lat: 27.701, lng: 83.449 },
      { name: "Golpark", lat: 27.696, lng: 83.464 },
      { name: "Milanchowk", lat: 27.689, lng: 83.459 },
      { name: "Deep Nagar", lat: 27.708, lng: 83.453 },
      { name: "Kalikanagar", lat: 27.692, lng: 83.445 },
    ] },
  { slug: "nepalgunj",  name: "Nepalgunj",  province: "Lumbini",       lat: 28.0500, lng: 81.6167,
    areas: [
      { name: "Dhamboji", lat: 28.052, lng: 81.619 },
      { name: "BP Chowk", lat: 28.056, lng: 81.616 },
      { name: "Surkhet Road", lat: 28.062, lng: 81.622 },
      { name: "Tribhuvan Chowk", lat: 28.05, lng: 81.625 },
    ] },
  { slug: "dhangadhi",  name: "Dhangadhi",  province: "Sudurpashchim", lat: 28.6833, lng: 80.6000,
    areas: [
      { name: "Campus Road", lat: 28.69, lng: 80.598 },
      { name: "Hasanpur", lat: 28.702, lng: 80.606 },
      { name: "Attariya", lat: 28.802, lng: 80.554 },
      { name: "Chatakpur", lat: 28.684, lng: 80.612 },
    ] },
  { slug: "janakpur",   name: "Janakpur",   province: "Madhesh",       lat: 26.7288, lng: 85.9266,
    areas: [
      { name: "Ramanand Chowk", lat: 26.73, lng: 85.925 },
      { name: "Bhanu Chowk", lat: 26.727, lng: 85.929 },
      { name: "Station Road", lat: 26.725, lng: 85.921 },
      { name: "Murali Chowk", lat: 26.734, lng: 85.927 },
    ] },
];

const KEY = "khelamna-city";
const AKEY = "khelamna-area";

export function cityBySlug(slug: string | null): City | null {
  return CITIES.find((c) => c.slug === slug) ?? null;
}

/** Nearest area within a city, or null if the city has none listed. */
export function nearestArea(city: City, lat: number, lng: number): Area | null {
  if (!city.areas?.length) return null;
  let best = city.areas[0], bestD = Infinity;
  for (const a of city.areas) {
    const d = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/** Nearest listed city to a pair of coordinates. */
export function nearestCity(lat: number, lng: number): City {
  let best = CITIES[0];
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function useCity() {
  const [city, setCityState] = useState<City | null>(null);
  const [area, setAreaState] = useState<Area | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const c = cityBySlug(localStorage.getItem(KEY));
      setCityState(c);
      const an = localStorage.getItem(AKEY);
      setAreaState(c?.areas?.find((a) => a.name === an) ?? null);
    } catch { /* private mode */ }
    setReady(true);

    // Every component using this hook follows the header's choice.
    const onChange = (e: Event) => {
      const { slug, area: an } = (e as CustomEvent<{ slug: string; area: string | null }>).detail;
      const c = cityBySlug(slug);
      setCityState(c);
      setAreaState(c?.areas?.find((a) => a.name === an) ?? null);
    };
    window.addEventListener("city-changed", onChange);
    return () => window.removeEventListener("city-changed", onChange);
  }, []);

  function setCity(c: City, a: Area | null = null) {
    setCityState(c);
    setAreaState(a);
    try {
      localStorage.setItem(KEY, c.slug);
      if (a) localStorage.setItem(AKEY, a.name);
      else localStorage.removeItem(AKEY);
    } catch { /* ignore */ }
    window.dispatchEvent(
      new CustomEvent("city-changed", { detail: { slug: c.slug, area: a?.name ?? null } })
    );
  }

  return { city, area, setCity, ready };
}

/** "Good morning" and friends, in Kathmandu time. */
export function greeting(): string {
  const h = Number(
    new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kathmandu" })
  );
  if (h < 5)  return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good evening";
}

/** A line that changes with the hour — the app noticing the time of day. */
export function dayLine(): string {
  const h = Number(
    new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kathmandu" })
  );
  if (h < 5)  return "Late one. Courts open at six.";
  if (h < 9)  return "Early courts are free right now.";
  if (h < 12) return "Good time to lock tonight's game.";
  if (h < 16) return "Afternoon slots are usually quiet.";
  if (h < 19) return "Prime time — book before it fills.";
  if (h < 22) return "Floodlights are on across the valley.";
  return "Tomorrow's slots are already open.";
}

/** Rough km between two points — good enough for "is this in my city". */
export function kmFrom(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * How far out a city's listings reach. Kathmandu, Lalitpur and Bhaktapur sit
 * on top of each other, so a tight radius would hide half the valley — 25km
 * covers a city and its suburbs without bleeding into the next one.
 */
export const CITY_RADIUS_KM = 25;

/** An area is a neighbourhood — people expect a short walk, not a city. */
export const AREA_RADIUS_KM = 3.5;

/** Is this venue in the chosen city? Unknown coordinates always show. */
export function inCity(
  lat: number | null | undefined,
  lng: number | null | undefined,
  city: City | null,
  area: Area | null = null
): boolean {
  if (lat == null || lng == null) return true;
  if (area) return kmFrom(area.lat, area.lng, lat, lng) <= AREA_RADIUS_KM;
  if (!city) return true;
  return kmFrom(city.lat, city.lng, lat, lng) <= CITY_RADIUS_KM;
}
