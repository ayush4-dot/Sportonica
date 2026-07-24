import { getHomeRails } from "@/lib/play/homeRails";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

// Server wrapper: fetches the rail data, then hands it to the (client)
// homepage so the animations and theme hooks keep working.
export default async function Page() {
  const rails = await getHomeRails().catch(() => null);
  return <HomeClient rails={rails ?? undefined} />;
}
