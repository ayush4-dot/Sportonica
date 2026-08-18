import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Payment-proof screenshots (src/components/payments/PaymentStep.tsx)
    // are validated client-side up to 5MB, a real size for an unedited
    // phone camera screenshot — but Server Actions default to a 1MB body
    // limit, so anything over 1MB was silently failing production requests
    // with a generic "Error occurred in the Server Components render"
    // (actual cause only visible in server logs: "Body exceeded 1 MB
    // limit"). Raised to match the client-side check, plus headroom for
    // multipart/base64 encoding overhead on top of the raw file bytes.
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "unpkg.com" },
      { protocol: "https", hostname: "tile.openstreetmap.org" },
      { protocol: "https", hostname: "*.basemaps.cartocdn.com" },
    ],
  },
};

export default nextConfig;
