import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyVenues } from "@/lib/admin/queries";
import { Topbar } from "../ui";

export const dynamic = "force-dynamic";

const ROLE_DESC: Record<string, string> = {
  owner: "Full control — pricing, payouts, staff, everything.",
  manager: "Manages courts, pricing and bookings. No payout access.",
  staff: "Checks players in and blocks slots. Can't touch pricing or money.",
};

export default async function StaffPage({
  searchParams,
}: { searchParams: Promise<{ venue?: string }> }) {
  const { venue } = await searchParams;
  const venues = await getMyVenues();
  const activeVenue = venues.find((v) => v.id === venue) ?? venues[0];

  if (!activeVenue) {
    return (
      <>
        <Topbar title="Staff" crumb="MANAGE" />
        <div className="adm-body">
          <div className="adm-empty">
            <div className="adm-empty-icon"><Users size={22} /></div>
            <h3>No venue yet</h3>
            <p>Add a venue before inviting staff.</p>
            <Link href="/admin/venues/new" className="adm-btn primary">Add venue</Link>
          </div>
        </div>
      </>
    );
  }

  const sb = await createClient();
  const { data: staff } = await sb
    .from("venue_staff")
    .select("id, user_id, role, created_at")
    .eq("venue_id", activeVenue.id);

  return (
    <>
      <Topbar title="Staff" crumb={`MANAGE / ${activeVenue.name.toUpperCase()}`} />
      <div className="adm-body" style={{ maxWidth: 780 }}>
        {venues.length > 1 && (
          <div className="adm-flex" style={{ gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {venues.map((v) => (
              <Link key={v.id} href={`/admin/staff?venue=${v.id}`}
                className={`adm-chip ${v.id === activeVenue.id ? "on" : ""}`}>{v.name}</Link>
            ))}
          </div>
        )}

        <div className="adm-card">
          <div className="adm-between" style={{ marginBottom: 16 }}>
            <div>
              <div className="adm-card-t">Team</div>
              <div className="adm-card-sub" style={{ marginBottom: 0 }}>Who can access this venue&apos;s console</div>
            </div>
            <button className="adm-btn sm primary">Invite staff</button>
          </div>

          <table className="adm-table">
            <thead><tr><th>Member</th><th>Role</th><th>Can do</th></tr></thead>
            <tbody>
              {(staff ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="adm-mono" style={{ fontSize: 12 }}>{s.user_id.slice(0, 8)}…</td>
                  <td><span className={`adm-badge ${s.role === "owner" ? "warn" : "neutral"}`}>{s.role}</span></td>
                  <td className="adm-dim" style={{ fontSize: 12 }}>{ROLE_DESC[s.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="adm-card" style={{ marginTop: 18 }}>
          <div className="adm-card-t">Roles explained</div>
          <div className="adm-card-sub">Small venues run on a family plus one helper — roles keep money safe.</div>
          {Object.entries(ROLE_DESC).map(([role, desc]) => (
            <div key={role} className="adm-flex" style={{ padding: "10px 0", borderBottom: "1px solid var(--a-line)", gap: 14 }}>
              <span className={`adm-badge ${role === "owner" ? "warn" : "neutral"}`} style={{ minWidth: 70 }}>{role}</span>
              <span className="adm-dim" style={{ fontSize: 13 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
