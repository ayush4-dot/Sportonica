"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Store, User as UserIcon } from "lucide-react";
import DataTable, { type Column } from "@/components/DataTable";
import { setUserRole } from "@/lib/platform/actions";
import { isActionError } from "@/lib/actionError";

interface UserRow extends Record<string, unknown> {
  id: string;
  display_name: string;
  username: string | null;
  role: string | null;
  trust_score: number | null;
  city: string | null;
}

const COLS: Column<UserRow>[] = [
  { key: "display_name", label: "Name" },
  { key: "username", label: "Handle", render: (u) => u.username ? `@${u.username}` : <span className="dt-dim">—</span> },
  { key: "city", label: "City" },
  {
    key: "role", label: "Role", type: "badge",
    badgeColors: { player: "#8A95A3", venue_owner: "#2E7D5B", super_admin: "#006241" },
  },
  { key: "trust_score", label: "Trust", type: "custom", render: (u) => <span className="dt-mono">{u.trust_score ?? 50}</span> },
];

export default function UsersGrid({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeRole(id: string, role: "player" | "venue_owner") {
    startTransition(async () => {
      const res = await setUserRole(id, role);
      if (isActionError(res)) { alert(res.message); return; }
      router.refresh();
    });
  }

  return (
    <DataTable<UserRow>
      columns={COLS}
      rows={users}
      pageSize={15}
      exportName="sportonica-users"
      empty="No users yet."
      actions={(u) => (
        u.role === "super_admin" ? <span className="dt-dim">—</span> : (
          u.role === "venue_owner" ? (
            <button className="dt-btn" disabled={pending} onClick={() => changeRole(u.id, "player")}>
              <UserIcon size={12} /> Make player
            </button>
          ) : (
            <button className="dt-btn ok" disabled={pending} onClick={() => changeRole(u.id, "venue_owner")}>
              <Store size={12} /> Make venue owner
            </button>
          )
        )
      )}
    />
  );
}
