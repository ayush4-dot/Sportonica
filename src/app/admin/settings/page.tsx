import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "../ui";
import { NAV } from "../nav";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  // Everything the console can do, one tap away — the sidebar collapses
  // into a drawer on phones, so this is also the fastest way to browse
  // the whole console without hunting for the menu button.
  const featureGroups = NAV.filter((g) => g.label !== "Account");

  return (
    <>
      <Topbar title="Settings" crumb="CONSOLE" />
      <div className="adm-body" style={{ maxWidth: 880 }}>
        <div className="adm-card">
          <div className="adm-card-t">Account</div>
          <div className="adm-card-sub">Your Sportonica console login</div>
          <div className="adm-field">
            <label className="adm-label">Email</label>
            <input className="adm-input" defaultValue={user?.email ?? ""} readOnly />
          </div>
          <div className="adm-field">
            <label className="adm-label">Role</label>
            <input className="adm-input mono" defaultValue={user?.user_metadata?.role ?? "venue_owner"} readOnly />
          </div>
        </div>

        <div className="adm-card" style={{ marginTop: 18 }}>
          <div className="adm-card-t">Payout defaults</div>
          <div className="adm-card-sub">Set per venue on the venue page. This is your account-wide preference.</div>
          <div className="adm-field">
            <label className="adm-label">Preferred method</label>
            <select className="adm-select" defaultValue="khalti">
              <option value="khalti">Khalti</option>
              <option value="esewa">eSewa</option>
              <option value="fonepay">FonePay</option>
              <option value="bank">Bank transfer</option>
            </select>
          </div>
          <button className="adm-btn primary sm">Save preferences</button>
        </div>

        <div style={{ marginTop: 34 }}>
          <div className="adm-card-t" style={{ marginBottom: 2 }}>All features</div>
          <div className="adm-card-sub">Every section of the console, in one place.</div>

          {featureGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: 22 }}>
              <div className="adm-navlabel" style={{ padding: "0 0 8px" }}>{group.label}</div>
              <div className="adm-feat-grid">
                {group.items.map((it) => (
                  <Link key={it.href} href={it.href} className="adm-feat">
                    <span className="adm-feat-ic">{it.icon}</span>
                    <span className="adm-feat-body">
                      <span className="adm-feat-l">{it.label}</span>
                      <span className="adm-feat-d">{it.desc}</span>
                    </span>
                    <ArrowRight size={15} className="adm-feat-arrow" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
