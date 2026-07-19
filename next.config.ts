import type { NextConfig } from "next";

const nextConfig: NextConfig = {
<<<<<<< HEAD
  turbopack: {
    root: __dirname,
  },
=======
>>>>>>> f7ffbe7b879f70291023e1d0f4280bb6ad38dbf8
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "unpkg.com" },
      { protocol: "https", hostname: "tile.openstreetmap.org" },
      { protocol: "https", hostname: "*.basemaps.cartocdn.com" },
    ],
  },
};

export default nextConfig;
