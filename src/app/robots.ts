import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sportonica.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing behind these paths is meant to be publicly indexed —
        // logged-in-only areas, and the venue/platform consoles.
        disallow: ["/admin", "/platform", "/messages", "/players", "/profile", "/my-games", "/welcome"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
