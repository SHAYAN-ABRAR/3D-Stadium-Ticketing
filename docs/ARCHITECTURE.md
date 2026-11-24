# Architecture

A Next.js (App Router) demo site that sells tickets for one stadium. Its centrepiece is a 3D seat picker
built with plain three.js. There is no backend: each visitor's data lives in their own browser (IndexedDB
through Dexie), the checkout is a demo and no email is sent. This file is the map; `docs/DECISIONS.md` records why things
are the way they are.

## Layers

```
src/lib/stadium/      Pure TypeScript layout: seat positions, indices, labels, default prices.
                      No three.js, no DOM. Shared by the server (seed, prices) and the browser.
src/engine/           Client-only three.js engine (StadiumEngine class + build worker). No React.
src/components/       React UI: the picker overlay (panels, tooltips, ticket), site pages and chrome.
src/app/              Routes: pages (no API routes; pages load their data in the browser).
src/data/             The data layer: DataStore interface, LocalStore on Dexie, seed, simulator, demo card.
src/lib/              Pure helpers: events, pricing totals, picker logic, tickets (codes, QR, PDF, .ics), email.
src/config/brand.ts   Venue name, colours, currency, time zone and commercial rules (one file to re-brand).
src/i18n/, messages/  next-intl without locale routing; locale from the NEXT_LOCALE cookie (en, bn).
```

## Key rules

- **Seat indices are permanent IDs.** `src/lib/stadium/` generates them deterministically; the local
  database keeps one status per seat index for each event.
- **Totals come only from the pricing module.** Money is integer minor units (Tk 2,000 = `200000`); times
  are epoch milliseconds (UTC), shown in the venue time zone.
- **Holds and sales change seats only inside a Dexie read-write transaction**, and the changes are broadcast
  to every tab after the commit.
- **The engine owns the canvas, React owns everything else.** The engine emits events (`hover`, `select`,
  `level`, ...) with screen coordinates; React positions tooltips, labels and panels from them. A zustand
  store is the bridge.

## The 3D engine (`src/engine/`)

```
StadiumEngine.ts   Public class: mount/dispose, data setters, navigation (goStand, goBlock, goSeat,
                   goBox, goVip), snapshots, quality, lighting, crowd and wave, events. Owns the frame
                   scheduler (active, ambient up to 30 fps, asleep) and input.
build-client.ts    Runs build.worker.ts (OffscreenCanvas) or falls back to the main thread; caches results.
build-data.ts      CPU-only build: seat matrices/colours, trees, cars, the city, painted ground, shadow mask.
camera.ts          CameraRig: orbit and look views, Bezier flights, lens fitting, UI-aware view offset.
picking.ts         Stand ray-march, GPU id picking (1x1 target), VIP chair raycast.
painter.ts         Seat colours and glow (pick orange, sold grey, dimmed) with partial uploads.
near.ts            Detailed seats near the camera; hides the seat you sit in.
crowd.ts           Match-day crowd: billboarded impostors from a generated atlas, near 3D people (High),
                   idle motion, the Mexican wave, goal cheers, fades and scale-ins.
match-sim.ts       The match on the pitch as plain TypeScript (tested): 4-4-2 shapes, passing, pressing,
                   shots and saves, set pieces, goals, the walk back to kick-off, referees.
match.ts           Draws the match: instanced players with a run cycle in the shader, blob shadows, ball.
post.ts            Composer: render pass, N8AO (High), bloom (Medium+), ACES tone mapping, SMAA, vignette.
lighting.ts        Golden hour / day / blue hour / night presets with 1.5 s blends (sky and its colour
                   grade, sun, fog, night emissives in the stadium, the city and the metro).
snapshots.ts       "Your view" pictures: scissored render + drawImage in the same task, JPEG export; on High
                   2x size, depth of field and the crowd.
quality.ts         Tier table, automatic tiering, localStorage memory, ?quality= override.
world/             Scene builders: park and city-data (worker-safe: the neighbourhood's blocks, roads,
                   rooftops, mosques, trees and street lights), city (its meshes; windows drawn in the
                   shader), metro (MRT Line 6 viaduct, Mirpur 10 station, moving trains), seat data,
                   geometry, textures, boards (LED ribbons, screens), details (procedural pitch, nets,
                   flags, cables, glass, nosings), shading (cloud shadows, tree sway, flag wave patches),
                   sky, interior, scene.
test-api.ts        window.__stadium for E2E tests (NEXT_PUBLIC_E2E=1 or development only).
```

React side (`src/components/picker/`): `StadiumStage` loads `EngineView` with `next/dynamic` and
`ssr: false`; `EngineView` creates one engine per effect run and disposes it in the cleanup (Strict Mode
safe); `store.ts` is the zustand store and the two-way bridge (engine events in, data out). Clicks in 3D
arrive as `select` events and the store decides what happens. `src/components/plan/StadiumPlan.tsx` is
the SVG plan used without WebGL, on the ticket page when no seat view was saved, and on the venue page.

Tickets (`src/components/ticket/`): `Ticket` is the ticket layout (header area, details, stub) on
`TicketShell`, the notched sheet that tilts towards the pointer (react-parallax-tilt; stub on the right,
or at the bottom on phones), and `MatchBanner` its match header: both teams' flags (`public/flags`, looked
up in `src/lib/events/flags.ts`), the venue, the date and the times. The PDF mirrors it, with the flags
drawn into PNG pictures in the browser first (`src/lib/tickets/flag-png.ts`), since pdf-lib can't draw
SVG. `src/components/events/TeamFlag.tsx` puts the flags beside the team names wherever a match is named.

Data flow on the event page: the data store's seats (a full read, then live changes from this tab, other
tabs and the sales simulator) → `StoreBackend` → picker store (`statuses`) → `engine.setStatuses` /
`engine.applyChanges` → painter recolours only the changed seats.

## Data layer (`src/data/`)

```
store.ts           The DataStore interface: events, seats with live updates, holds, views, checkout, orders,
                   tickets, the email outbox, the sales simulator.
local-store.ts     LocalStore: DataStore on Dexie. Seat changes run in read-write transactions; the net
                   changes are published after each commit.
db.ts              The Dexie schema (events, seats, holds, orders, tickets, views, outbox, meta).
channel.ts         Change notices: listeners in this tab at once, other tabs through a BroadcastChannel.
session.ts         The tab's session (sessionStorage): holds belong to it.
seed.ts            The sample events, created in the browser on the first visit.
simulator.ts       Simulated buyers on an open event (one tab at a time, a Web Lock per event).
card.ts            The demo card form's checks; only the brand and last four digits go further.
index.ts, hooks.ts getStore() (one store per tab; window.__data in development and E2E), useStoreQuery().
```

The purchase path (all in the visitor's browser):

```
picker   store.hold() ────────────────► seats held for this tab (transaction), broadcast to other tabs
         "Check out" renders each seat's view and saves it with store.saveViews(), then /checkout
checkout card checked in the form ─────► store.checkout(): held → sold, order and tickets (random tokens,
                                          views copied), hold converted (one transaction); then the email
                                          is rendered into the outbox (never sent)
order    /orders/[code] ──────────────► QR tickets, PDF and .ics made in the browser, "Email me again",
                                          /orders/[code]/email shows the outbox
ticket   /tickets/[token] ────────────► one ticket, big QR code (opens in the browser that bought it)
```

## Site pages

```
/                  Home: the 3D hero (engine in hero mode over a poster), next match, upcoming matches, how it
                   works, the venue with the gates plan, questions (src/components/home/).
/events            Events with month and competition filters (src/components/events/).
/events/[slug]     The seat picker.
/venue, /faq       Venue information and questions (server-rendered text from messages/*.json).
/terms, /privacy   Sample legal pages.
/checkout, /orders/[code], /orders/[code]/email, /orders/lookup, /tickets/[token]
                   The purchase flow, order pages, the email preview and the ticket page.
opengraph-image    Link-preview images (next/og); sitemap.xml and robots.txt.
```

Content pages share `SiteHeader` (links, or a menu sheet below 901 px) and `SiteFooter`.

## Status

Phases 0–7 are in place (tooling, layout module, engine, picker UI, the local data store with live updates
and the sales simulator, demo checkout and tickets, visual upgrades with lighting presets and the crowd, the
site pages in English and Bengali). The sections above grow as phases land.
