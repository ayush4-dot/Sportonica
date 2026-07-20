"use client";

import { useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown, Download, ChevronLeft, ChevronRight } from "lucide-react";

// ================================================================
// Reusable data grid for the platform console.
// Client-side: search, sort, pagination, CSV export, typed columns
// (text / badge / date / money / custom render / actions).
// ================================================================

export type Row = Record<string, unknown>;

export interface Column<T extends Row> {
  key: string;
  label: string;
  type?: "text" | "badge" | "date" | "money" | "custom";
  sortable?: boolean;             // default true
  searchable?: boolean;           // default true for text
  badgeColors?: Record<string, string>;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

export default function DataTable<T extends Row>({
  columns, rows, pageSize = 10, actions, empty = "Nothing here yet.", exportName,
}: {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
  actions?: (row: T) => React.ReactNode;   // rendered in a trailing column
  empty?: string;
  exportName?: string;                     // enables CSV export button
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);

  // ── search ──
  const searched = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    const keys = columns.filter((c) => c.searchable !== false).map((c) => c.key);
    return rows.filter((r) =>
      keys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle))
    );
  }, [q, rows, columns]);

  // ── sort ──
  const sorted = useMemo(() => {
    if (!sortKey) return searched;
    return [...searched].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  }, [searched, sortKey, sortDir]);

  // ── paginate ──
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const slice = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(1); }
  }

  function exportCsv() {
    const head = columns.map((c) => c.label).join(",");
    const lines = sorted.map((r) =>
      columns.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${exportName ?? "export"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function cell(col: Column<T>, row: T): React.ReactNode {
    if (col.render) return col.render(row);
    const v = row[col.key];
    if (v == null || v === "") return <span className="dt-dim">—</span>;
    switch (col.type) {
      case "badge": {
        const s = String(v);
        const color = col.badgeColors?.[s] ?? "#8A95A3";
        return (
          <span className="dt-badge" style={{ color, borderColor: `${color}55`, background: `${color}14` }}>
            {s.replace(/_/g, " ")}
          </span>
        );
      }
      case "date":
        return new Date(String(v)).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kathmandu",
        });
      case "money":
        return <span className="dt-mono">Rs {Number(v).toLocaleString("en-IN")}</span>;
      default:
        return String(v);
    }
  }

  return (
    <div className="dt">
      {/* toolbar */}
      <div className="dt-bar">
        <div className="dt-search">
          <Search size={14} />
          <input
            placeholder="Search…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
          />
        </div>
        <div className="dt-bar-right">
          <span className="dt-count">{sorted.length} row{sorted.length !== 1 ? "s" : ""}</span>
          {exportName && (
            <button className="dt-btn" onClick={exportCsv}><Download size={13} /> CSV</button>
          )}
        </div>
      </div>

      {/* table */}
      <div className="dt-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={c.sortable === false ? "" : "sortable"}
                  onClick={() => c.sortable !== false && toggleSort(c.key)}
                >
                  <span>
                    {c.label}
                    {sortKey === c.key && (sortDir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
              {actions && <th style={{ width: 1 }} />}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr><td colSpan={columns.length + (actions ? 1 : 0)} className="dt-empty">{empty}</td></tr>
            ) : (
              slice.map((row, i) => (
                <tr key={String(row.id ?? i)}>
                  {columns.map((c) => <td key={c.key}>{cell(c, row)}</td>)}
                  {actions && <td className="dt-actions">{actions(row)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {pages > 1 && (
        <div className="dt-pages">
          <button className="dt-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span className="dt-count">Page {safePage + 1} of {pages}</span>
          <button className="dt-btn" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
