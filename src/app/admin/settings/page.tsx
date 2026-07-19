import { createClient } from "@/lib/supabase/server";
import { Topbar } from "../ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  return (
    <>
      <Topbar title="Settings" crumb="CONSOLE" />
      <div className="adm-body" style={{ maxWidth: 640 }}>
        <div className="adm-card">
          <div className="adm-card-t">Account</div>
          <div className="adm-card-sub">Your Khelum Na console login</div>
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
      </div>
    </>
  );
}
