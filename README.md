# Sportonica

Kathmandu's sports booking platform — find games and book courts.

---

## Branches

This is a single repo. Long-lived branches hold the non-web parts:

| Branch | Contents |
|--------|----------|
| **`main`** | Web app (Next.js). Also carries `ios/` and `android/` as git subtrees. |
| [`ios`](https://github.com/ayush4-dot/Sportonica/tree/ios) | iOS Capacitor shell, standalone (files at branch root). Source of truth for the `ios/` subtree on `main`. |
| [`android`](https://github.com/ayush4-dot/Sportonica/tree/android) | Android Capacitor shell, standalone. Source of truth for the `android/` subtree on `main`. |
| [`changes`](https://github.com/ayush4-dot/Sportonica/tree/changes) | Changelog, database scripts (`supabase/`), conventions (`CONTRIBUTING.md`), planning docs. |

Work on a native shell by checking out its branch (a `git worktree` is handy),
then run `git subtree pull --prefix=ios origin ios --squash` on `main` to bring
the change across. See
[`docs/subtrees.md` on the `changes` branch](https://github.com/ayush4-dot/Sportonica/blob/changes/docs/subtrees.md).
Database SQL lives on the `changes` branch, not `main`.
Workflow rules: [`CONTRIBUTING.md` on `changes`](https://github.com/ayush4-dot/Sportonica/blob/changes/CONTRIBUTING.md).

---

## Current State

Two live pages:
- `/` — Home
- `/discover` — Discover events

---

## Tech Stack

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.2.9 | Framework — App Router |
| `react` / `react-dom` | 19.2.4 | UI |
| `typescript` | ^5 | Type safety |
| `tailwindcss` | ^4 | Global CSS (minimal use — inline styles preferred) |
| `@supabase/supabase-js` | ^2 | Database, auth, storage |
| `@supabase/ssr` | ^0.12 | Server-side auth, middleware cookies |
| `framer-motion` | ^12 | All animations |
| `three` | ^0.184 | 3D engine |
| `@react-three/fiber` | ^9 | React renderer for Three.js |
| `@react-three/drei` | ^10 | Three.js helpers (Float, Sparkles) |
| `@react-three/postprocessing` | ^3 | Bloom, Vignette effects |
| `leaflet` + `react-leaflet` | ^1.9 / ^5 | Real maps — CartoDB Dark Matter, no API key |
| `@types/leaflet` | ^1.9 | Leaflet TypeScript types |
| `lucide-react` | ^1.23 | Icons |
| `gsap` | ^3.15 | Available for animations |
| `@studio-freight/lenis` | ^1.0 | Smooth scroll — available |
| `zustand` | ^5 | State management — available |
| `@tanstack/react-query` | ^5 | Data fetching — available |
| `react-hook-form` | ^7 | Forms — available |
| `zod` | ^4 | Validation — available |

---

## Project Structure

```
sportonica/
│
├── public/
│   └── hero.mp4                        ← Sports video for home page hero
│
├── src/
│   ├── app/
│   │   ├── page.tsx                    ← HOME — video hero, sports panels, featured events, stats
│   │   ├── discover/page.tsx           ← DISCOVER — event list + Leaflet map + BookingModal
│   │   ├── layout.tsx                  ← Root layout — fonts, NavWrapper
│   │   ├── globals.css                 ← CSS variables, keyframes, body styles
│   │   └── favicon.ico
│   │
│   ├── components/
│   │   ├── AnimatedBackground.tsx      ← Canvas orbs + dot grid (position:fixed, on every page)
│   │   ├── BookingModal.tsx            ← Full booking flow — details → payment → confirmation
│   │   ├── SportonicaMap.tsx           ← Leaflet map — dark tiles, pins, pick-mode
│   │   ├── NavWrapper.tsx              ← Body padding class manager
│   │   ├── SportSculpture.tsx          ← Morphing 3D sports sculpture (Three.js)
│   │   ├── ThreeScene.tsx              ← Legacy Three.js scene (kept, unused)
│   │   ├── BackgroundProvider.tsx      ← Legacy (unused)
│   │   │
│   │   ├── hero/                       ← Hero sub-components
│   │   │   ├── CameraRig.tsx
│   │   │   ├── HeroScene.tsx
│   │   │   ├── Lights.tsx
│   │   │   ├── Particles.tsx
│   │   │   └── SportsOrb.tsx
│   │   │
│   │   ├── venues/                     ← Venue listing components
│   │   │   ├── VenueCard.tsx
│   │   │   ├── VenueDetailPanel.tsx
│   │   │   ├── VenueVisual.tsx
│   │   │   ├── SportFilterPanel.tsx
│   │   │   ├── SportGlyph.tsx
│   │   │   └── Stars.tsx
│   │   │
│   │   ├── layout/
│   │   │   └── SiteNav.tsx             ← Shared sticky nav
│   │   │
│   │   └── ui/
│   │       ├── CursorGlow.tsx
│   │       └── MagneticButton.tsx
│   │
│   ├── lib/
│   │   ├── hooks/
│   │   │   ├── useEvents.ts            ← Fetch events from events_with_counts view
│   │   │   ├── useProfile.ts           ← Current user profile
│   │   │   ├── useBookingFlow.ts       ← Booking logic — slots, waitlist, duplicates, cancel
│   │   │   ├── useAdminData.ts         ← Venue/slots/bookings/revenue hooks
│   │   │   └── useBooking.ts           ← Legacy booking hook
│   │   │
│   │   ├── supabase/
│   │   │   ├── client.ts               ← createBrowserClient (client components)
│   │   │   └── server.ts               ← createServerClient (middleware / server)
│   │   │
│   │   ├── theme/palette.ts            ← Design tokens
│   │   └── venues/
│   │       ├── types.ts                ← Venue TypeScript types
│   │       └── helpers.ts              ← pitchKind(), formatHours()
│   │
│   ├── hooks/useVenues.ts              ← Fetch venues from Supabase
│   ├── shaders/sportsOrb.ts            ← GLSL shaders for 3D sculpture
│   └── constants/particles.ts          ← Particle config
│
├── middleware.ts                       ← Auth guard
├── next.config.ts                      ← turbopack.root, image remote patterns
└── .env.local                          ← Supabase keys
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Home — editorial video hero (`hero.mp4`), animated sports panels, featured events from Supabase, live player/game stats |
| `/discover` | Discover — event list filtered by sport, real Leaflet map with event pins, BookingModal for booking |

---

## Components

### `AnimatedBackground`
Canvas-based animated background. 5 radial orbs in brand colors (pink, gold, green) drifting with mouse parallax. Dot grid that glows near orbs. Scan line. Vignette. Runs on every page via `position: fixed`.

### `BookingModal`
Full real-world booking flow:
1. **Details** — player name, phone, address (required), notes
2. **Payment** (paid events only) — Khalti / eSewa (paste txn ID) / Cash
3. **Confirmation** — booking summary, confirmed or waitlisted

Edge cases: slot full → waitlist, already booked → detected, not logged in → redirects, cancel → auto-promotes waitlisted player.

### `SportonicaMap`
Leaflet wrapper with CartoDB Dark Matter tiles. Supports pick-mode (click to drop pin + get lat/lng), custom colored pins, and dark-themed popups. No API key required.

### `SportSculpture`
Three.js morphing sculpture. Vertex shader morphs between 5 sport shapes (football, basketball, cricket, tennis, shuttlecock). Mouse parallax tilt. Orbit rings. Energy pulse rings. Sparkles. `position: fixed` canvas.

---

## Database (Supabase)

### Tables

| Table | Purpose |
|---|---|
| `auth.users` | Built-in Supabase auth |
| `profiles` | Per-user — full_name, role, trust_score, games_played |
| `events` | Hosted events — sport, venue, date, lat/lng, flash flag, sport_color |
| `bookings` | Player ↔ event joins — status, amount, player details, payment ref |
| `venues` | Venue profiles — name, address, lat/lng, sports[], amenities[], hours, photos[], price_per_hour |
| `court_slots` | Time slots per venue — start/end, price, status, recurring |
| `flash_matches` | Flash matches — urgency timer, slots_needed, slots_filled |
| `payouts` | Payout method per venue (Khalti / eSewa) |

### Views

| View | Purpose |
|---|---|
| `events_with_counts` | Events + confirmed_count, slots_remaining, total_count |

---

## Design Tokens

| Token | Value | Usage |
|---|---|---|
| `ink` | `#0B0D11` | Page background |
| `inkSoft` | `#13161C` | Card surface |
| `inkMid` | `#1C2029` | Elevated surface |
| `paper` | `#F2EDE6` | Primary text |
| `pink` | `#DE3163` | Brand accent, CTAs |
| `flood` | `#FFC93C` | Yellow — floodlight accent |
| `turf` | `#2E7D5B` | Green accent |
| `slate` | `#8A95A3` | Secondary text |

**Fonts:** `Bricolage Grotesque` (display) · `Inter` (body) · `JetBrains Mono` (mono/numbers)

---

## SQL — Run in Supabase

All database scripts live on the
[`changes` branch, in `supabase/`](https://github.com/ayush4-dot/Sportonica/tree/changes/supabase).

```sql
-- 1. Run supabase/admin_schema.sql   (from the changes branch)
-- 2. Run supabase/add_columns.sql    (from the changes branch)
-- 3. Then run these:

-- Public can read open venues
create policy "Anyone can read open venues"
  on public.venues for select using (status = 'open');

-- event_id optional in bookings (venue bookings don't have an event)
alter table public.bookings alter column event_id drop not null;

-- Allow pending/waitlist status
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('confirmed','pending','cancelled','waitlist'));

-- Player details on bookings
alter table public.bookings
  add column if not exists player_name    text,
  add column if not exists player_phone   text,
  add column if not exists player_address text,
  add column if not exists payment_ref    text,
  add column if not exists notes          text;

-- Venue photos + pricing
alter table public.venues
  add column if not exists photos         text[]        default '{}',
  add column if not exists price_per_hour numeric(10,2) default 0,
  add column if not exists rating         numeric(3,1)  default 4.0,
  add column if not exists reviews        int           default 0,
  add column if not exists updated_at     timestamptz   default now();

-- Min players on events
alter table public.events add column if not exists min_players int default 2;
```

**Storage:** Create bucket `venue-photos` → set to **Public**.

---

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxx
```

---

## Run Locally

```bash
npm install
npm run dev
# http://localhost:3000
```

---

## Auth Notes

- Disable email confirmation for dev: Supabase → Authentication → Providers → Email → off
- Sign in errors show exact message (wrong password, unconfirmed email, etc.)
