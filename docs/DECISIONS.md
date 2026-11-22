# Decisions

One line per choice: what was chosen and why. Newest entries are added at the end of each section. References such as "PROMPT.md 6.6" (here and in code comments) point to sections of the project brief, which is not part of this repository.

## Installed versions (pinned exactly in package.json; updated 2026-11-22 for version 2)

| Package                              | Version         | Package                     | Version         |
| ------------------------------------ | --------------- | --------------------------- | --------------- |
| next                                 | 16.4.6          | react / react-dom           | 19.3.1          |
| typescript                           | 6.0.3           | @types/node                 | 24.19.2         |
| tailwindcss / @tailwindcss/turbopack | 4.3.5           | eslint / eslint-config-next | 9.39.5 / 16.4.6 |
| three / @types/three                 | 0.187.0         | postprocessing              | 6.39.6          |
| n8ao                                 | 2.1.0           | zustand                     | 5.1.0           |
| zod                                  | 4.6.7           | dexie                       | 4.4.7           |
| next-intl                            | 4.15.3          | qrcode / @types/qrcode      | 1.5.4 / 1.5.6   |
| @zxing/browser / @zxing/library      | 0.2.1 / 0.23.0  | pdf-lib                     | 1.17.1          |
| recharts                             | 3.11.0          | motion                      | 14.14.0         |
| vaul                                 | 1.1.2           | radix-ui                    | 1.8.1           |
| vitest / vite                        | 5.1.1 / 8.3.8   | @playwright/test            | 1.65.1          |
| prettier / eslint-config-prettier    | 3.10.1 / 10.1.8 | fake-indexeddb (tests)      | 6.2.8           |
| rimraf                               | 6.1.4           | cross-env                   | 10.1.0          |
| @formatjs/icu-messageformat-parser   | 3.5.23          |                             |                 |

Version 2 removed `drizzle-orm`, `drizzle-kit`, `@electric-sql/pglite`, `postgres`, `stripe`, `resend`, `tsx` and
`@pdf-lib/fontkit` (never used).

## Phase 0: tooling

- **Node 26.3.0 locally; `engines` is `>=22.12`.** The brief targets 22 or 24 LTS; Vitest 5 needs `^22.12 || ^24 || >=26`, so 22.12 is the real floor. Node 26 is newer than the 20.19 minimum, so no stop was needed.
- **TypeScript 6.0.3, not 7.0.2.** 7.0 (the native compiler) is "latest", but typescript-eslint 8.73 (used by eslint-config-next) supports `typescript <6.1.0`.
- **ESLint 9.39.5, not 10.** eslint-config-next 16.4.6 depends on eslint-plugin-react, -import and -jsx-a11y, which declare ESLint ≤ 9 as peers. npm marks 9.x as unsupported; revisit when those plugins support 10.
- **`cacheComponents` and `partialPrefetching` turned off** (create-next-app 16.4 turns them on). With Cache Components, Next 16 rejects `export const dynamic` and `export const runtime`, which PROMPT.md 9.1 (version 1) required on database routes. Every page reads the locale cookie anyway, so pages are request-time rendered; in version 2 all data loads in the browser.
- **Tailwind through `@tailwindcss/turbopack`** (the scaffold's default for Next 16.4) instead of a PostCSS config. Tokens are in `src/app/globals.css` under `@theme`; no v3-style config file.
- **`npm run typecheck` is `next typegen && tsc --noEmit`.** Next 16 generates global route types (`LayoutProps`, `PageProps`) into `.next/types`; on a fresh clone they don't exist until typegen runs.
- **Vitest config is `vitest.config.mts`.** Vite 8 warns about ESM syntax in a `.ts` config inside a CommonJS package; `.mts` fixes that without `"type": "module"`.
- **`AGENTS.md` stays out of git.** `next dev` generates it (a pointer to Next's bundled docs) and restores it when deleted.
- **npm 11 install-script allowlist left as is.** `@parcel/watcher` and `@swc/core` (pulled in by next-intl's optional message-extraction tooling) ship prebuilt platform binaries as optional dependencies, so nothing needs compiling and their install scripts stay unapproved.
- **`npm audit`:** version 1 accepted 4 moderate advisories inside drizzle-kit's dev-only loader; with drizzle-kit removed in version 2, `npm audit` reports 0 vulnerabilities (2026-11-22).
- **No shadcn CLI.** UI primitives come from `radix-ui` (Dialog, Popover, Slider, ...) and `vaul`, styled by hand with Tailwind so the paper-and-ticket design stays exact; nothing generated needs maintaining.
- **Fonts via `next/font/google`** (self-hosted at build time): Barlow (400–700), Barlow Condensed (600, 700), Noto Sans Bengali (variable, `preload: false` so English pages never download it; Bengali glyphs fall back to it per glyph).
- **English formatting uses `en-GB`** (dates like "Sat 12 Dec 2026", like the prototype), Bengali uses `bn-BD` (Bengali digits). All times use the venue time zone from `src/config/brand.ts`.
- **E2E web server isolation:** Playwright starts `next dev` on port 3100 with `NEXT_DIST_DIR=.next-e2e`, so it can run next to `npm run dev` without sharing its build folder. (Version 1 also gave it its own PGlite folder.)
- **Playwright 1.65 has no `toHaveScreenshot` timeout setting;** screenshot calls pass `timeout: 120_000` themselves.
- **Git:** the repository was created when the finished project was first published (Phase 10); `.gitignore` and `.gitattributes` were set up in Phase 0.

## Phase 1: layout module

- **Exact parity with the prototype is tested, not assumed.** `tests/fixtures/prototype-layout.json` was extracted from the running prototype (every block's id, stand, tier, first seat, row lengths, gate, price and s-range; every skybox; every 997th seat's position, normal, row and number; the sum of all positions). The port reproduces all of it bit for bit.
- **Seat counts depend only on `+ - * /`** (arc lengths, `realLen`, `sAtLen`), never on `Math.sin/cos`, so seat indices are identical in every JavaScript engine. Positions use trig and may differ by an ulp between browsers, which only affects rendering. The client will still compare its seat count with the server's.
- **Typed arrays cover the 79,556 bowl seats; VIP chairs are index ranges** (`bowlSeatCount + box * 8 + chair`) with positions from `vipChairWorld()`. The layout also exports `planS` (each seat's loop parameter) for the Mexican wave and nearest-skybox lookups.
- **"Every second lower-tier block" = the odd-numbered ones (101, 103, ...),** starting with the first. Each has wheelchair spaces at row 1 seats 1–2 and the last two, with companion seats 3 and n−2.
- **Wheelchair spaces are left out of "N seats together" runs and Best available** unless the visitor turns on "Accessible spaces" (`RunOptions.wheelchair`).
- **Restricted-view pricing:** "one category lower" means the next cheaper category among the event's categories (with the default categories, 950 → 850, 800 → 750, 650 → 550, 550 → 450); the cheapest category stays as it is. The seed's "Restricted view" category (code `RV`) has an automatic price by default; if it is given a fixed price, restricted seats use it, capped at the block's own price. This reconciles PROMPT.md 5 (a relative rule) with 9.3 (a seeded category), since categories are assigned per block and restricted view is per seat.
- **2D plan polygons are schematic bands** (lower, middle, skybox ring, upper) that don't overlap; in a true top view each tier overhangs the one below, which would make blocks unreadable.
- **Block 232 stays visibly available:** as in the prototype (which pinned it at 58% sold), a block holding protected seats is capped at 58% sold in sample events below 90% sell-through.
- **Sold pattern for sample events:** the prototype's clustered pattern (desirable blocks sell more, seats sell in noise-shaped clusters), seeded by the event slug, scaled by a binary search to hit the target sell-through. About 6% of blocks sell out (weighted by desirability); a `scatter` option gives the 97% derby scattered single seats. About 30% of skyboxes stay entirely free (so "Book the whole box" is possible) and, as in the prototype, chairs 5–6 stay free when the target is below 90%.

## Phase 2: engine port

- **three r159 → r187 changes that touched the port:** `PCFSoftShadowMap` is removed in r187 (it falls back with a warning), so the sun uses `PCFShadowMap`, whose new 5-tap Vogel-disk filter honours `shadow.radius` (2). `Clock` is deprecated (r183); the engine uses `performance.now()`. Imports are ES modules (`three`). `addUpdateRange`, `PMREMGenerator.fromScene(scene, sigma, near, far)`, the `onBeforeCompile` chunk names and colour management were checked against the installed source and are unchanged.
- **Overlapping ground layers are cut, not offset.** The painted ground plane has holes under the pitch and the lake, and the far grass plane has a hole under the painted ground, so no coplanar surfaces overlap. A polygon offset first fixed depth-fighting in the skybox view (5 cm near plane) but broke the phone overview (the offset scales with depth slope and pushed the ground under the far grass). Depth was confirmed to be 24-bit in SwiftShader, so precision was never the problem.
- **Painted shadows live in their own single-channel mask** (pitfall 14), uploaded as a `RedFormat` `DataTexture` and multiplied into the ground by a strength uniform that lighting presets can fade.
- **Build worker:** seat matrices and colours, tree and car placement, the ground, shadow mask and pitch are generated in `build.worker.ts` on `OffscreenCanvas` and transferred as `ImageBitmap`s and typed arrays. ImageBitmaps can't be flipped at upload, so the worker draws them upside down and textures use `flipY = false`. Without workers or `OffscreenCanvas`, the same code runs on the main thread in chunks. Results are cached per tab, so a second mount skips generation.
- **The engine never navigates on its own.** Clicks become `select` events; the picker store decides (fly in, refuse a sold-out block, select a run). This keeps purchase rules in one place and lets the list panel and the 3D view share them.
- **The scheduler stops requesting frames when idle** instead of running an empty `requestAnimationFrame` loop: rendering is on demand, ambient motion (idle orbit now; boards and crowd in Phase 6) is capped at 30 fps and stops 30 s after the last input, and hidden or off-screen canvases render nothing. Verified: 0 frames while idle.
- **Wheelchair spaces** are separate instanced platforms with a pictogram decal; their chairs are scaled to zero in the seat mesh, and the GPU picker gets a platform pick mesh carrying the seat indices.
- **Tree density (60% on Low) is decided when the stadium is built.** An automatic switch to Low later changes pixel ratio and shadows but not trees, so painted tree shadows never lose their trees.
- **Reduced motion:** flights become a 300 ms cross-fade (the last frame, copied to a canvas inside the engine's container, fades over the new view).
- **Phase 2 renders directly with the renderer's own MSAA and ACES tone mapping** (prototype parity). Phase 6 moves every tier to the post-processing composer with `antialias: false`, as PROMPT.md 6.6 asks.
- **The 2D plan's block colours:** plenty (≥ 35% free), limited (≥ 10%), few, sold out (grey), closed (hatched), "not enough together" (pale). Colour is never the only signal: every interactive block has an accessible label with its numbers.

## Phase 3: picker UI

- **One set of picking rules.** The store's actions (goStand, goBlock, chooseRun, toggleChair, holdSelection, back, ...) are called by the 3D view, the list panel, the ticket, the keyboard and the tour alike. Without WebGL the same actions move a 2D navigation state, so the no-WebGL picker completes the same flow.
- **Touch:** a tap previews (the run lights up) and opens a vaul bottom sheet with "Fly in" / "Select these seats". The phone ticket is a custom fixed sheet (open while seated, collapsible to look around) rather than vaul: a non-dismissible drawer over the canvas would compete with the canvas for drags.
- **VIP chairs** toggle into the selection up to the ticket quantity; "Book the whole box" appears when all 8 chairs are free and is priced as a whole box.
- **Header:** "Take the tour" only shows at the overview and stand levels (it starts from the overview); on phones the tour and the language switch live in the view-settings popover so the header stays one row; long breadcrumb trails scroll in place.
- **The intro plays once per event per browser** (localStorage, guarded); deep links skip it and open instantly. URL parameters: `stand`, `block`, `row`, `seat`, `box`, `chair`, kept in step with `history.replaceState`.
- **Esc goes back one level**, unless a popover, sheet or the Best available panel handles it first.
- **Bengali numbers:** block, row, seat and gate identifiers stay in Latin digits, as printed on the stadium's signage and tickets; counts, prices and dates use Bengali digits through `Intl` (`bn-BD`).
- **`@formatjs/icu-messageformat-parser` (3.5.23, dev only)** parses every message in the i18n test, so English and Bengali must use the same ICU arguments; a regex could not tell plural branch text from arguments.
- **Arbitrary Tailwind values are kept** where they reproduce the prototype's measurements exactly (the editor suggests scale names for some; both compile to the same CSS).

## Phase 4: database and live availability (version 1, replaced by the version 2 section below)

- **Turbopack bundles PGlite as is** (verified through the dev server and the API), so `serverExternalPackages` was not needed.
- **PGlite migrates itself on first use and seeds when empty** (about 12 s for the six sample events and ~255,000 sold-seat rows), so a fresh clone runs with `npm install` and `npm run dev` alone. Postgres (`DATABASE_URL`) is migrated and seeded explicitly (`npm run db:migrate`, `npm run db:seed`). `getDb()` is cached on `globalThis`.
- **`block_id` in `block_categories` and `block_closures` is the public block number** (232), readable for admins and independent of the layout's internal order.
- **The "Restricted view" category's `price_minor` is nullable**: null means automatic (one category lower).
- **Hold expiry uses the database clock** (`now() + make_interval(mins => 10)`), the same clock the lazy expiry compares against, so app-server clock drift can't shorten or stretch holds.
- **One availability version per mutation, net changes only.** A transaction that releases a session's old hold and takes new seats logs each seat once with its final status, so the log's primary key (event, version, seat) holds. Versions are contiguous; a `since` request falls back to the full payload when it predates the oldest logged version, is ahead of the server (database reset), or would return more than 5,000 changes. The log is trimmed to about the newest 20,000 rows every 25 versions.
- **Sessions:** `sid` = 18 random bytes (base64url) + "." + HMAC-SHA256(SESSION_SECRET, id), verified with a constant-time comparison; httpOnly, SameSite=Lax, Secure in production, 30 days.
- **Rate limits** are in-memory sliding windows kept on `globalThis` (one process). The per-IP limit is skipped for local addresses in development and when `NEXT_PUBLIC_E2E=1`.
- **Origin check on mutations:** a present `Origin` must be this request's origin, `SITE_URL`, or the forwarded host; requests without one (server-to-server) are not a cross-site risk and pass.
- **Startup validation in `src/instrumentation.ts`:** in production a missing `SESSION_SECRET`, `TICKET_SECRET` or `ADMIN_PASSWORD` stops the server; not during `next build`.
- **E2E isolation:** `POST /api/test/reset` (404 unless `NEXT_PUBLIC_E2E=1`) frees every hold and every seat sold by a test order before each spec, so specs don't depend on each other's leftovers.
- **Scripts load env files with `@next/env`'s named export** (the default import is undefined under tsx's CommonJS transform).

## Phase 5: checkout and tickets (version 1; the server parts were replaced in version 2)

- **Orders snapshot their lines.** Checkout prices every seat on the server (`seatPricesMinor`, which splits a whole-box price over its 8 chairs so the lines sum to the total) and stores `lines` (seat, price, holder name) on the pending order (migration `0001`). Finalize turns exactly those lines into tickets, so a price change during payment can't change what was charged.
- **Finalize locks the order row** (`SELECT ... FOR UPDATE`), so a webhook and a return racing each other finalize once; the second sees `paid` and does nothing. When the sold rows don't match the order's lines, the transaction rolls back, the order becomes `failed` ("hold expired") and, if money was taken, it is refunded (`refunded`).
- **A new checkout for the same hold replaces the earlier pending order** (cancelled, "replaced"); its Stripe session is expired, best effort. If money still arrives for a replaced order while its seats are held, it is finalized (the money was taken); a mock "Decline" can't be paid afterwards.
- **Stripe:** the Checkout Session lives 31 minutes (Stripe's minimum is 30) and the hold is extended to the session's expiry plus 2 minutes, so a payment completed at the last second still finds its seats. Besides the webhook, the order page asks Stripe for a pending order's session status (at most every 5 s per order), so a missing webhook (local testing without the Stripe CLI) doesn't leave a paid order pending. The SDK is imported only when `STRIPE_SECRET_KEY` is set. Stripe has no Bengali checkout, so Bengali visitors get Stripe's automatic locale. The Stripe adapter is written against the installed SDK's types (23.2.0) but could not be run without keys.
- **Who sees an order:** the session that created it; a browser that passed `/orders/lookup` (code + email, compared case-insensitively in constant time; a signed `orders` cookie with the last 10 codes); or a link from the email carrying a signed key (`/api/orders/[code]/open?k=` sets the cookie; the PDF and calendar links accept the key directly). Unknown codes and wrong emails get the same answer. A ticket page is reachable by its token alone (the token is the secret, as on a paper ticket).
- **Seat views:** "Check out" renders each held seat's view (at most 6 s in all), keeps the JPEGs in IndexedDB, and the order page uploads them after payment, one per request. Seats of the same row (or skybox) that weren't rendered in time share a rendered neighbour's picture, as their views are practically identical. Uploads must be whole 640 × 400 JPEGs of 1–120 KB (start/end markers, frame size and a scan segment are checked); a ticket keeps its first picture. The PDF embeds only pictures that pass the same check, otherwise it draws the plan.
- **PDF in English** (PROMPT.md 9.7): pdf-lib can't shape Bengali script. It uses the standard Helvetica fonts (no font files to ship); characters they can't encode are dropped from names, and a name that would lose most of its letters is left out. One A6 page per ticket: header, event, picture (cropped to keep its 16:10 shape), seat, perforation and a stub with a vector QR code, gate and price.
- **QR codes** are drawn from the `qrcode` module matrix: one SVG path built on the server for pages, vector squares in the PDF. The email links to each ticket page instead of embedding a QR image (mail clients block SVG and data-URI images).
- **Email:** table layout with inline styles; every user-supplied value is HTML-escaped; written in the order's language. Without `RESEND_API_KEY` the `file` provider writes `.data/outbox/<time>-<code>.html`, and in development the order page links to the latest one ("Open email preview"). With Resend and no `EMAIL_FROM`, Resend's shared test sender is used. "Email me again" is limited to 3 an hour per order.
- **Calendar file:** UTC `DTSTART`/`DTEND` (2 hours), a `VTIMEZONE` for the venue zone plus `X-WR-TIMEZONE`, text escaped and lines folded at 75 octets.
- **Order codes** are `LP-` plus 6 characters without look-alikes (no 0/O, 1/I/L); typed codes are normalised ("lp 7f3k9q" → `LP-7F3K9Q`).
- **The confirmation animation is CSS only** (a full-screen overlay: the ticket prints out of a slot, the stub tears off, then the page rises in); with `prefers-reduced-motion` the overlay isn't shown. `?new=1` plays it once and is removed from the address so a reload doesn't print again.
- **E2E reset** also cancels orders whose seats it frees and voids their tickets, so the test database stays consistent between specs.
- **Deep links wait for the availability** before choosing the run of seats around the linked seat. On a cold dev server the 3D view could be ready before the first availability response, and the link then selected the linked seat alone, ignoring the ticket quantity.
- **Countdowns read the clock while rendering** (`useClock`, a `useSyncExternalStore` ticking each second), so the header chip, the ticket stamp and the checkout agree from their first render; the header's own state used to show a stale time for up to a second after a hold.
- **The live spec's 8-second clock starts when A's hold has succeeded**, not before the request: on a cold dev server the first `POST /api/holds` also compiles the route.

## Version 2: browser-only data (2026-11-22)

- **Scope:** the project became a browser-only portfolio demo: no backend, data in the visitor's browser, a demo checkout, no email sent, deployed on Vercel. The two sections above describe the replaced server layer; their decisions about the PDF, QR codes, email template, calendar file, order codes, the confirmation animation, deep links and countdowns still hold.
- **`DataStore` / `LocalStore` on Dexie 4.4.7.** Every read and write goes through the interface in `src/data/store.ts`; components and the engine never touch Dexie. The database is `stadium-tickets` in IndexedDB.
- **One status array per event** (`seats` table, a `Uint8Array` of 80,180 bytes) instead of one row per seat: a hold or a sale reads and writes one row inside its transaction. Closed blocks are applied when read.
- **Cross-tab safety comes from IndexedDB:** read-write transactions over the same table run one after another, across tabs; the unit test races 25 tabs on overlapping seats.
- **Changes are broadcast after the commit** on the BroadcastChannel `stadium-tickets:changes`, with a version per event; a listener that sees a gap (or a "reload" notice after seeding) reads the whole event again, as does a tab that becomes visible.
- **A tab is a session** (an id in sessionStorage): holds belong to it, a reload keeps it, and two tabs can't take each other's held seats, as two visitors couldn't on a server. Orders belong to the whole browser.
- **Expiry:** lazily on reads and writes, plus a 15-second sweep in every open tab. Simulated holds complete when they expire (bought or released), so they finish even after the simulating tab closes.
- **Sales simulator:** while an event page is open, one tab per event (a Web Lock `stadium-sim:<event>`) adds a buyer every 2-7 s (mean 4.5 s): 1-4 adjacent free seats in a block chosen by price and centrality, held 15-60 s, then bought (70%) or released. At most 6 at once; never the protected seats or closed blocks; stops at 98.5% sell-through. Off when `NEXT_PUBLIC_E2E=1`; tests start it through `window.__data`.
- **Sample data in the browser:** created on the first visit with kick-offs counted from that visit; rebuilt after 14 days so the events stay in the future, unless the visitor has orders (purchases are never wiped). Another tab that seeded first wins (checked inside the transaction).
- **Demo card:** Luhn, length per brand, expiry valid through the end of its month, 3-digit code (4 for American Express) and a name, checked in the browser. 4242 4242 4242 4242 is the test card; 4000 0000 0000 0002 is always declined. The store receives only the brand, the last four digits and the form's verdict, so a full number is never stored or logged. A 0.9 s "processing" pause makes the button's state visible.
- **Ticket tokens are 128 random bits** (base64url) instead of HMAC signatures: without a server there is no secret to sign with, and an unguessable token is what a QR code needs. A ticket opens only in the browser that bought it.
- **Email:** after the sale commits, the store renders the confirmation in the order's language (messages loaded on demand) and writes it to the `outbox` table; nothing is sent. The preview page shows it in a frame sandboxed without scripts (links open in a new tab). The email links to the order and ticket pages; the PDF and calendar downloads live on the order page.
- **PDF and calendar files are made in the browser** when the visitor clicks (pdf-lib and the builders load on demand).
- **Seat views:** "Check out" saves the rendered views in the store; the sale copies them onto the tickets in the same transaction, so there is no upload step.
- **Pages:** server components render the shell and metadata; client components read the store after mount (`useStoreQuery`). An unknown event shows "Event not found" in the browser.
- **E2E:** each test gets a fresh browser context, so a fresh local database (no reset endpoint). "Another visitor" in the specs is another tab of the same browser, since data never leaves a browser. `window.__data` (E2E and development only) lets a test act as that tab.
- **Working files stay out of git:** the project brief, working notes, reference material and `docs/PROGRESS.md` are listed in `.gitignore`.
- **The engine ignores repeated identical insets** (`setInsets`): UI re-renders report the same panel sizes, and each used to wake the sleeping scheduler for one frame (seen once in the idle check of the engine spec).

## Phase 6: visual upgrades

- **Post-processing with pmndrs `postprocessing` 6.39.6** on half-float buffers: render pass, N8AO (High, half resolution), then one effect pass with bloom (Medium and up) and tone mapping, then SMAA (medium preset) with a subtle vignette. The renderer has `antialias: false`, `stencil: false` and `NoToneMapping`, so tone mapping happens once (pitfall 2). Passes are rebuilt only when the tier's bloom/AO switches change, with fresh effects (an effect pass disposes its effects).
- **ACES Filmic, not AgX.** Side by side, AgX desaturated the red seats and the warm golden-hour light that the colours were tuned for; ACES keeps them.
- **Bloom threshold 4.5 (linear luminance).** Sunlit white roof panels reach about 3.3 at golden hour and must not glow; at night the floodlight strips (×10), LED ribbons and screens (×5.5), lit windows (5.5) and the roof-edge strip (×8) sit well above it.
- **Sky: three's `Sky` addon with its clouds,** plus an injected `skyGain` uniform (the addon's radiance is far brighter than the scene's exposure). It follows the camera like a skybox. Each preset's PMREM environment is rendered from the same sky at the end of a transition and cached. Stars (points) and a moon (a disc that blooms) fade in at night.
- **Lighting presets** blend every value over 1.5 s with smoothstep (instant with reduced motion or from the test API). Day: sun 58° high, neutral, less environment light (a bright midday sky as environment flattened the contrast). Night: the directional light becomes a dim blue moon; six pitch spot lights (no shadows) and one point light above the pitch stand in for the floodlights' spill so seat colours stay readable. All lights exist from the start and only their intensity changes (pitfall 7). Golden hour and day share the sun's azimuth, so the painted shadows (faded to 30% by day, off at night) never point the wrong way (pitfall 14).
- **Boards:** the LED ribbons and pitch boards scroll (texture offset); ribbons cycle event / countdown / welcome every 8 s, the big screens alternate fixture and countdown every 7 s. Phases change on whole seconds and the countdown ticks once a second, so each canvas is redrawn at most once a second. Board text stays in the venue language (English).
- **Ambient animation has three modes:** animate (up to 30 fps), pause (the scheduler sleeps after 30 s without input, off screen or hidden: everything freezes in place) and static (Low tier, reduced motion, `?freeze=1`: fixed board content, no motion). Mouse hover counts as input for the 30-second timer.
- **The pitch is drawn per pixel in a shader:** box-filtered mowing stripes (no moiré from far away), three octaves of noise whose fine grain fades with the pixel footprint, and every marking as a distance field with exact pixel coverage, so lines stay crisp in seat views and thin out smoothly with distance. The 2048 px painted pitch and its worker step were removed (less build time, about 11 MB less GPU memory with mipmaps).
- **Goal nets** use an alpha-tested net texture that is also blended (`alphaTest` 0.02, transparent): with mipmaps, a pure 0.5 alpha test averages the twine away and the net vanishes beyond a few metres.
- **Glass balustrades:** on the middle and upper tiers the solid parapet now stops at 0.4 m and glass with a steel rail continues it to the old 1.0 m top, so sightlines from the front rows are unchanged. The lower tier keeps its wall.
- **Aisle nosings:** a thin yellow strip on the front edge of every tread at every block boundary (the aisles are the 1.2 m gaps between blocks), one instanced mesh.
- **Roof:** 88 radial tension cables plus two ring cables as line segments just above the membrane; the membrane's underside has its own material whose emissive term (through the membrane texture, so seams stay darker) lets a little sky light through by day and fades at night.
- **Cloud shadows** (Medium and up): two-dimensional noise, projected along the sun to the ground so one cloud darkens park, stands and roof consistently, multiplies only the directional light inside a patched `lights_fragment_begin` chunk. Strength per preset (0.32 golden, 0.38 day, 0 at night); the noise drifts at about 4 m/s. Shader patches chain `onBeforeCompile` and extend `customProgramCacheKey` (pitfall 5), and throw if a three.js upgrade moves an anchor.
- **Trees sway on High** (canopies and cones, vertex shader, a few decimetres at the top, each tree with its own phase); **28 flags on the roof ring** (home, away and white) and four corner flags wave in a vertex shader with analytic normals.
- **Crowd atlas:** 512 × 1024 px, 8 × 8 cells of 64 × 128 px: 16 variants × front/back × arms down/up, drawn at load time with the event's team colours. Variants 0–6 wear home colours, 7–10 away, 11–15 neutral; the West stand is the away end. A seat's variant comes from a hash of its index, so it never changes.
- **One impostor per bowl seat, in seat-index order,** with a visibility attribute: a sale updates one float, scale-ins need no re-sorting, and unsold seats collapse to zero-size quads. Alpha is sharpened by mip level so distant spectators don't thin out.
- **Spectators within about 3–4 m of the camera are hidden,** so a seat view shows the pitch instead of the backs of the nearest heads (they looked like blurry giants up close). Fades and this clear zone thin the crowd person by person (each has a threshold) instead of dithering pixels, so nobody is ever drawn half-dissolved.
- **Near 3D people on High:** up to 1,500 sold seats within 25 m in seat and box views become 174-triangle people (torso, head, hair or cap, legs, arms that rise for the wave) in the same colours as their impostors.
- **The wave** runs along `s` at 30 m/s for one lap (about 12 s), starting just before the stand opposite the camera; people rise 0.55 m, stand 25% taller and raise their arms. It runs on every tier because the visitor asks for it (view settings, or the tour after sitting down).
- **Tests and reduced motion:** crowd fades and scale-ins are instant, so software WebGL doesn't spend frames on them.
- **"Your view" snapshots on High** render at twice the size into a render target with depth, then a 24-tap gather depth of field (focus on the pitch) tone-maps them onto the canvas corner; they show the crowd as impostors. Low and Medium snapshots keep the direct path without crowd.
- **Statistics count every pass of a frame** (`renderer.info.autoReset = false`, reset at the start of each rendered frame); with the composer, the default counted only the last full-screen pass.
- **Visual checks run headless Chromium on the real GPU** (`--use-angle=d3d11`, an Intel UHD here) to see animation and timing; the E2E suite stays on SwiftShader.
- **The purchase spec waits for the view to settle** (`idle`) and for the hover tooltip before clicking a block or seat: after a flight the UI framing eases for a few frames, and software rendering stretches that over seconds.

## Phase 7: site pages and languages

- **Hero mode in the engine** (`hero: true`): golden hour, the crowd (Medium and up), a slow orbit, no intro, no picking and `pointer-events: none` on the canvas so the page scrolls over it. Activity anywhere on the page keeps the orbit awake; it sleeps after 30 s like the picker. The hero loads the next match's seats from the store, so the crowd sits in that match's sold seats.
- **The poster is rendered by the engine itself** (High tier, golden hour, frozen orbit) and served through `<picture>`: a landscape image from 901 px, a portrait one below, where the camera aims lower so the bowl sits above the headline. The 3D view starts when the page is idle and fades in over it; without WebGL (or with `?webgl=0`) the poster stays.
- **Events and the next match load in the browser** (the data store), with skeletons; filters live in the address (`?month=`, `?competition=`).
- **Open Graph images use the poster with the fixture**, in English (link previews have no visitor locale, and the stadium's own boards are English too). Event images carry no date: sample dates are counted from each visitor's first visit.
- **Accessible orange:** white text on the brand orange `#ff6a13` is 2.86:1, below AA. Orange surfaces with white text or a white thumb (buttons, chips, switches, the hold countdown) use `pick-strong` `#c74909` (4.8:1); `#ff6a13` stays for seats in 3D, meters, dots and accents, and `#a83c00` for orange text on paper.
- **Bengali headings in the display face get a line height of 1.25** (unlayered CSS beats the tight leading utilities), because Bengali vowel signs rise above the line.
- **English pages don't download the Bengali web font:** the "বাং" label of the language switch uses the system's Bengali fonts.
- **Lighthouse on the pages without 3D:** first-visit seeding builds one event's pattern per task, the order pages skip seeding (orders only exist after a purchase, which happens after seeding), and the email template and sales simulator are loaded on demand, so pages that only list events don't download them.
- **The site address** for metadata, the sitemap and Open Graph URLs comes from `NEXT_PUBLIC_SITE_URL`, else Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, else localhost.
- **Footer on content pages, not in the purchase flow:** checkout, order and ticket pages keep only the header, to stay focused.
