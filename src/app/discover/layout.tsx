import type { Metadata } from "next";

// discover/page.tsx is a client component, which can't export `metadata`
// directly — this layout exists purely to give the route its own title
// instead of inheriting the homepage's generic one.
export const metadata: Metadata = {
  title: "Find a game in Kathmandu — Khelam Na",
  description: "Browse live pickup games, filter by sport and time, and grab the last spot. Futsal, cricket, basketball, badminton and more.",
};

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
