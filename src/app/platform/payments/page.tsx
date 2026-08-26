import { getPaymentMethodsAdmin, getPaymentOverviewStats, listPendingPayments } from "@/lib/payments/adminActions";
import { isActionError } from "@/lib/actionError";
import PaymentSettingsCards from "./PaymentSettingsCards";
import PendingPaymentsTable from "./PendingPaymentsTable";

export const dynamic = "force-dynamic";

const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

export default async function PlatformPaymentsPage() {
  const [methods, stats, pending] = await Promise.all([
    getPaymentMethodsAdmin(),
    getPaymentOverviewStats(),
    listPendingPayments(),
  ]);
  if (isActionError(methods) || isActionError(stats) || isActionError(pending)) {
    const message =
      (isActionError(methods) && methods.message) ||
      (isActionError(stats) && stats.message) ||
      (isActionError(pending) && pending.message) || "Couldn't load payments.";
    return (
      <>
        <h1 className="plt-h1">Payments</h1>
        <p style={{ color: "#ef4444", fontSize: 14, marginTop: 16 }}>{message} — refresh the page to try again.</p>
      </>
    );
  }

  return (
    <>
      <h1 className="plt-h1">Payments</h1>
      <p className="plt-sub2">
        Sportonica&apos;s own eSewa/Khalti merchant QR codes, and manual verification of every payment
        submitted against a booking. A screenshot is evidence, not proof — always confirm the merchant,
        amount and transaction ID before approving.
      </p>

      <div className="plt-sec-t">Payment Methods</div>
      <PaymentSettingsCards initialMethods={methods} />

      <div className="plt-sec-t">Payment Overview</div>
      <div className="plt-stats">
        <div className="plt-stat">
          <div className={`plt-stat-v ${stats.pending > 0 ? "warn" : ""}`}>{stats.pending}</div>
          <div className="plt-stat-l">Pending</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{stats.approvedToday}</div>
          <div className="plt-stat-l">Approved today</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{stats.rejectedToday}</div>
          <div className="plt-stat-l">Rejected today</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{money(stats.totalCollected)}</div>
          <div className="plt-stat-l">Total collected</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{stats.esewaCount}</div>
          <div className="plt-stat-l">eSewa payments</div>
        </div>
        <div className="plt-stat">
          <div className="plt-stat-v">{stats.khaltiCount}</div>
          <div className="plt-stat-l">Khalti payments</div>
        </div>
      </div>

      <div className="plt-sec-t">Payment Verification Center</div>
      <PendingPaymentsTable initialPayments={pending} />
    </>
  );
}
