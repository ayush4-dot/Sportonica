import { allBookingsForPlatform } from "@/lib/platform/actions";
import { isActionError } from "@/lib/actionError";
import BookingsGrid from "./BookingsGrid";

export const dynamic = "force-dynamic";

export default async function PlatformBookingsPage() {
  const bookings = await allBookingsForPlatform();
  if (isActionError(bookings)) throw new Error(bookings.message);
  return (
    <>
      <h1 className="plt-h1">Bookings</h1>
      <p className="plt-sub2">Every court booking across the platform.</p>
      <BookingsGrid bookings={bookings} />
    </>
  );
}
