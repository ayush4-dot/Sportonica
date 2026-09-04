import QRCode from "qrcode";
import {
  getTournament, getDisplayVenueName, listTournamentTeams, getTeamRoster, canManageTournament,
} from "@/lib/tournaments/actions";
import { isActionError } from "@/lib/actionError";
import { FORMAT_LABELS, TEAM_STATUS_LABELS, type TournamentTeam, type TournamentTeamPlayer } from "@/lib/tournaments/types";
import { sportColor } from "@/lib/sports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Printable team dossier(s) — full team profile + roster, styled to save
// straight to PDF from the browser. One team with ?team=<id>, otherwise
// every team in the tournament (each on its own page). Manager-only: the
// sheet carries club address / contact person / coach, which the public
// Teams tab never shows.

const KTM = "Asia/Kathmandu";
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: KTM });
const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: KTM });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));

const ROLE_LABEL: Record<string, string> = { captain: "Captain", player: "Player", substitute: "Substitute" };

type RosterRow = TournamentTeamPlayer & { name: string; username: string | null; avatar_url: string | null };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const tournament = await getTournament(id);
  if (isActionError(tournament) || !tournament) {
    return new Response("Tournament not found.", { status: 404 });
  }
  if (!(await canManageTournament(id))) {
    return new Response("You don't have access to this tournament's team sheets.", { status: 403 });
  }

  const wantTeam = new URL(req.url).searchParams.get("team");

  const [venueName, teamsRes] = await Promise.all([
    getDisplayVenueName(tournament),
    listTournamentTeams(id),
  ]);
  const allTeams = isActionError(teamsRes) ? [] : teamsRes;
  const teams = wantTeam ? allTeams.filter((t) => t.id === wantTeam) : allTeams;

  if (teams.length === 0) {
    return new Response(wantTeam ? "Team not found." : "No teams have registered yet.", { status: 404 });
  }

  const rosters: RosterRow[][] = await Promise.all(
    teams.map(async (t) => {
      const r = await getTeamRoster(t.id);
      return isActionError(r) ? [] : (r as RosterRow[]);
    }),
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sportonica.com";
  const qr = await QRCode.toDataURL(`${siteUrl}/tournaments/${tournament.id}`, {
    margin: 0, width: 200, color: { dark: "#14171E", light: "#FFFFFF" },
  });

  const accent = sportColor(tournament.sport);
  const generated = dateTimeLabel(new Date().toISOString());

  const meta = [tournament.sport, FORMAT_LABELS[tournament.format], venueName]
    .filter(Boolean).map(esc).join(" &middot; ");

  const index =
    teams.length > 1
      ? `<div class="index">
           <div class="index-h">${esc(teams.length)} teams &middot; ${esc(tournament.name)}</div>
           <ol>${teams
             .map((t, i) => `<li><span>${esc(t.name)}</span><span class="dim">${rosters[i].length} player${rosters[i].length === 1 ? "" : "s"}</span></li>`)
             .join("")}</ol>
         </div>`
      : "";

  const body = teams.map((t, i) => teamSection(t, rosters[i], tournament.name, meta, qr, siteUrl, generated)).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(wantTeam ? teams[0].name : tournament.name)} — team ${teams.length > 1 ? "dossiers" : "sheet"}</title>
<style>
  :root { --accent: ${accent}; --ink: #14171E; --dim: #5b6572; --line: #e4e0d8; --bg: #ffffff; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f4f1ea; color: var(--ink); }
  body { font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 12px; line-height: 1.5; }

  .toolbar {
    position: sticky; top: 0; z-index: 10; display: flex; gap: 12px; align-items: center;
    padding: 12px 20px; background: #14171E; color: #f4f1ea;
  }
  .toolbar button {
    font: inherit; font-weight: 700; cursor: pointer; border: 0; border-radius: 8px;
    padding: 8px 16px; background: var(--accent); color: #fff;
  }
  .toolbar .hint { font-size: 11px; opacity: .7; }

  .wrap { max-width: 210mm; margin: 0 auto; padding: 20px; }

  .index {
    background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin-bottom: 18px;
  }
  .index-h { font-weight: 800; font-size: 13px; margin-bottom: 8px; }
  .index ol { margin: 0; padding-left: 20px; }
  .index li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-bottom: 1px dashed var(--line); }
  .index li:last-child { border-bottom: 0; }

  .team {
    background: var(--bg); border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
    margin-bottom: 18px;
  }

  .hero {
    display: flex; align-items: center; gap: 16px; padding: 22px 24px;
    background:
      radial-gradient(120% 160% at 0% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 62%),
      linear-gradient(180deg, #fbfaf7, #fff);
    border-bottom: 3px solid var(--accent);
  }
  .crest {
    width: 62px; height: 62px; border-radius: 14px; flex-shrink: 0; object-fit: cover;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent); color: #fff; font-weight: 800; font-size: 24px;
  }
  .hero-main { flex: 1; min-width: 0; }
  .eyebrow { font-size: 9.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
  .team-name { font-size: 22px; font-weight: 800; letter-spacing: -.4px; margin: 2px 0 3px; }
  .hero-meta { font-size: 11px; color: var(--dim); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .tag {
    font-size: 9.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent);
  }
  .tag.plain { background: #eee9e0; color: var(--dim); }

  .section-h {
    font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--dim);
    padding: 16px 24px 0;
  }

  .profile { padding: 8px 24px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 28px; }
  .row { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 11.5px; }
  .row .k { width: 88px; flex-shrink: 0; color: var(--dim); font-weight: 700; text-transform: uppercase; font-size: 9.5px; letter-spacing: .04em; padding-top: 1px; }
  .row .v { flex: 1; }
  .row .v.empty { color: #a9a29a; }

  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
    color: var(--dim); padding: 8px 24px; background: color-mix(in srgb, var(--accent) 8%, transparent);
    border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
  }
  tbody td { padding: 8px 24px; border-bottom: 1px solid var(--line); font-size: 11.5px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #faf8f4; }
  tbody tr.captain td { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  td.num { font-variant-numeric: tabular-nums; font-weight: 700; width: 34px; }
  td.dim, .dim { color: var(--dim); }
  .mini-tag { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; padding: 1px 5px; border-radius: 4px; background: #eee9e0; color: var(--dim); }
  .roster-empty { padding: 16px 24px 22px; color: #a9a29a; font-size: 11.5px; }

  .foot {
    display: flex; align-items: center; gap: 14px; padding: 16px 24px; border-top: 1px solid var(--line); background: #fbfaf7;
  }
  .foot img { width: 54px; height: 54px; }
  .foot .f-main { flex: 1; }
  .foot .f-title { font-weight: 800; font-size: 11px; }
  .foot .f-sub { font-size: 10px; color: var(--dim); }

  @page { size: A4; margin: 12mm; }
  @media print {
    html, body { background: #fff; }
    .toolbar { display: none; }
    .wrap { max-width: none; margin: 0; padding: 0; }
    .team { border: 0; border-radius: 0; margin: 0; break-inside: avoid-page; }
    .team + .team { break-before: page; }
    .index { break-after: page; }
    thead { display: table-header-group; }
    tbody tr { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print / Save as PDF</button>
    <span class="hint">Use your browser's “Save as PDF” for a file. Generated ${esc(generated)} (NPT).</span>
  </div>
  <div class="wrap">
    ${index}
    ${body}
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function teamSection(
  t: TournamentTeam, roster: RosterRow[], tournamentName: string, meta: string,
  qr: string, siteUrl: string, generated: string,
): string {
  const monogram = (t.name.trim()[0] || "?").toUpperCase();
  const crest = t.logo_url
    ? `<img class="crest" src="${esc(t.logo_url)}" alt="">`
    : `<div class="crest">${esc(monogram)}</div>`;

  const tags = [
    `<span class="tag">${esc(TEAM_STATUS_LABELS[t.status] ?? t.status)}</span>`,
    t.is_walkin ? `<span class="tag plain">Walk-in</span>` : "",
    t.seed != null ? `<span class="tag plain">Seed ${esc(t.seed)}</span>` : "",
    t.group_name ? `<span class="tag plain">Group ${esc(t.group_name)}</span>` : "",
  ].filter(Boolean).join("");

  const contact = [t.contact_person_name, t.contact_phone, t.contact_email].filter(Boolean).map(esc).join(" &middot; ");
  const rows = [
    ["Club", t.club_name],
    ["Address", t.club_address],
    ["Manager", join(t.manager_name, t.manager_phone)],
    ["Coach", join(t.coach_name, t.coach_phone)],
    ["Contact", contact],
    ["Registered", t.created_at ? dayLabel(t.created_at) : ""],
    ["Players", String(roster.length)],
  ]
    .map(([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v ${v ? "" : "empty"}">${v ? esc(v) : "—"}</span></div>`)
    .join("");

  const rosterBlock = roster.length
    ? `<table>
         <thead><tr>
           <th style="width:34px">#</th><th>Player</th><th>Position</th><th>Role</th><th>Phone</th><th>Email</th>
         </tr></thead>
         <tbody>
           ${roster.map((p) => {
             const linked = p.user_id != null;
             const acct = linked ? ` <span class="mini-tag">account</span>` : "";
             return `<tr class="${p.role === "captain" ? "captain" : ""}">
               <td class="num">${p.jersey_number != null ? esc(p.jersey_number) : "—"}</td>
               <td>${esc(p.name)}${acct}</td>
               <td class="${p.position ? "" : "dim"}">${p.position ? esc(p.position) : "—"}</td>
               <td>${esc(ROLE_LABEL[p.role] ?? p.role)}</td>
               <td class="${p.guest_phone ? "" : "dim"}">${p.guest_phone ? esc(p.guest_phone) : (linked ? "on file" : "—")}</td>
               <td class="${p.guest_email ? "" : "dim"}">${p.guest_email ? esc(p.guest_email) : (linked ? "on file" : "—")}</td>
             </tr>`;
           }).join("")}
         </tbody>
       </table>`
    : `<div class="roster-empty">No players on the roster yet.</div>`;

  return `<section class="team">
    <div class="hero">
      ${crest}
      <div class="hero-main">
        <div class="eyebrow">${esc(tournamentName)}</div>
        <div class="team-name">${esc(t.name)}</div>
        <div class="hero-meta">${meta}</div>
        <div class="tags">${tags}</div>
      </div>
    </div>
    <div class="section-h">Team details</div>
    <div class="profile">${rows}</div>
    <div class="section-h">Roster</div>
    ${rosterBlock}
    <div class="foot">
      <img src="${qr}" alt="">
      <div class="f-main">
        <div class="f-title">${esc(tournamentName)}</div>
        <div class="f-sub">${esc(siteUrl.replace(/^https?:\/\//, ""))}/tournaments &middot; generated ${esc(generated)} NPT</div>
      </div>
    </div>
  </section>`;
}

function join(a: string | null, b: string | null): string {
  return [a, b].filter(Boolean).join(" · ");
}
