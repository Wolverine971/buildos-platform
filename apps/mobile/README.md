<!-- apps/mobile/README.md -->

# BuildOS for iPhone (Expo)

The native BuildOS app. A thin client over the same API, accounts and database as the web app;
screens are the only thing it owns. Plan and build order: `docs/specs/MOBILE_APP_PLAN_2026-10-23.md`.
Open work: `tasker/148-mobile-app.md`.

## Run it (Expo Go, no accounts needed)

```sh
pnpm install                                   # from the repo root
pnpm --filter @buildos/api-client build        # the app's typed API client (once, or after changes)
cp apps/mobile/.env.example apps/mobile/.env.local   # fill in the Supabase URL + publishable key
pnpm --filter @buildos/mobile dev              # scan the QR code with Expo Go on your iPhone
```

- `EXPO_PUBLIC_API_URL` defaults to `https://build-os.com`. To hit a local web dev server, use
  the laptop's LAN address (`http://192.168.x.x:5173`); the phone cannot reach `localhost`.
- Sign in with the same email and password as the website. Google and Apple sign-in come with the
  development build (Phase 5 in the plan).

### Use the local backend

When testing API changes before the web app is deployed, start the backend in another terminal:

```sh
pnpm --filter @buildos/web dev --host 0.0.0.0 --port 5199 --strictPort
```

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local` to the Network URL Vite prints (for example,
`http://192.168.1.20:5199`), then fully reload Expo Go. Keep the phone and laptop on the same Wi-Fi
and leave both dev servers running. Supabase stays on the same project, so this uses your existing
BuildOS account and data. The production backend must include mobile bearer authentication before
switching the API URL back to `https://build-os.com`.

## Screens

Routes (`src/app/`):

```
_layout.tsx                    root Stack: sign-in | (tabs) | reader (form sheet over the tab bar)
+native-intent.ts              incoming project links open on the Workspace stack
(tabs)/_layout.tsx             js-tabs with the kit TabBar: (today) "Today" | (workspace) "Workspace"
(tabs)/(today,workspace)/      shared: built once per tab
  _layout.tsx                  that tab's own native Stack (headers off; anchor = the tab's root)
  project/[id].tsx             the project page, pushed on the tab it was opened from
(tabs)/(today)/index.tsx       Today          /
(tabs)/(workspace)/projects.tsx Workspace     /projects
reader.tsx, sign-in.tsx
```

A project keeps the tab bar and stays in its tab: links build group-qualified hrefs with
`projectHref(useTabStack(), id)` (`src/lib/routes.ts`, `src/hooks/use-tab-stack.ts`), never a bare
`/project/<id>` (that resolves by the focused tab, and to Today from the reader or a cold start).
Re-tapping the current tab pops its stack to the root, then scrolls the root to the top.

- **Today** (`src/app/(tabs)/(today)/index.tsx`, pieces in `src/components/today/`): title + date, "N
  events · N tasks", a sideways chip row (overdue, Up next), then All day, Schedule (mono time
  rail with an accent "now" line), Anytime today (Due today / Starts today / In progress, by
  project) and "Here's what's waiting". Tap a row to open the reader and walk the day with
  Prev/Next. Capture box docked at the bottom.
- **Workspace** (`src/app/(tabs)/(workspace)/projects.tsx`; the URL stays `/projects`): search, `LOOSE · N`
  (loose notes, docs and tasks; tap opens the reader), `PROJECTS · N` with Recent | By activity
  and the ⓘ legend, then the 4-column tile grid (`src/components/workspace/`). Long-press a tile
  for the iOS peek (`Link.Preview`) and its Open menu. Capture box docked here too. Data:
  `GET /api/projects/desktop` through `useDesktop()` (`src/hooks/use-desktop.ts`).
- **Project** (`src/app/(tabs)/(today,workspace)/project/[id].tsx`, pieces in
  `src/components/project/`): pushed inside Today's or Workspace's stack with the tab bar under
  it; nav back ("Today" / "Workspace" / parent name, from that stack), Start here and ⋯ (Open on the web) keys; header with the
  project tile, pulse pill, "N open · N done", NEXT STEP and "Inside this project" tiles; sticky
  Tasks | Docs underline tabs; task rows with state glyphs and date chips, docs in tree order.
- **Reader** (`src/app/reader.tsx`, `src/components/reader/`): a native iOS form sheet (66% and
  full height, grabber, 18pt corners). One task or doc: editable title, state switcher, fact tags
  (Priority, Due menu, Updated, Edit), markdown body, and the bottom bar ‹ | Mark done | Close | ›.
  Prev/Next walk the list it was opened from (`src/lib/reader-walk.ts`). Editing grows the sheet
  to full height; nothing unsaved can be swiped away.
- **Sign in** (`src/app/sign-in.tsx`): email + password on the kit (wordmark, fields, primary key).

## Look

The website's Inkprint look, drawn in code (no image files). Everything lives in the kit,
`src/components/kit/` (import from `@/components/kit`):

- **Tokens** (`src/theme/index.ts`): Inkprint colors, `typeScale`, radii, pulse colors, ink
  shadows (`boxShadow` strings) and one `Ink` object per scheme; hooks `useInk()`, `useScheme()`,
  `useReducedMotion()` in `src/providers/theme-provider.tsx`.
- `textures.tsx` — graph paper, halftone and seeded bench grain (SVG, accessibility-hidden).
- `key.tsx` — raised `Key` and `RoundKey` (2pt lip, 60ms press, spring release, haptics).
- `label.tsx` — `MicroLabel` and `Stamp` (Menlo, tabular numbers).
- `wordmark.tsx`, `bolt.tsx` — the Build**OS** wordmark; the bolt mark, `BoltSpinner` (every
  loading state) and `BoltScrollView` (pull to refresh charges the bolt).
- `frame.tsx`, `nav-bar.tsx`, `tab-bar.tsx`, `account-key.tsx` — the bench, the sheet, page
  titles, the 54pt nav bar, the tab bar and the account action sheet. `src/components/screen.tsx`
  puts them together (header, sheet, scroll view, docked footer).
- `project-tile.tsx` — the project tile (pulse tint, halftone, D/T meters, overdue badge) and
  `PulsePill`; grouping and sorting are pure helpers in `src/lib/desktop.ts`.
- `icons.ts` — the Lucide icons the app uses, imported one per icon to keep the bundle small.

Rules: every color comes from the theme (no hex in screens), textures never sit under body text
(the capture box's graph paper is the one exception), 44pt minimum targets, and Reduce Motion
drops the bounces.

## How it talks to BuildOS

- **Session** lives in the iOS keychain via `expo-secure-store` (chunked, `src/lib/chunked-storage.ts`)
  and is refreshed on the device.
- **Every API call** sends `Authorization: Bearer <access token>` through `@buildos/api-client`
  (`src/lib/api.ts`). The web server accepts it in `apps/web/src/hooks.server.ts` (bearer path), so
  all existing `/api` routes work for the phone with no per-route changes.
- **Web pages inside the app** (settings, billing, integrations, account deletion) open through a
  session handoff: `POST /api/auth/handoff` → open the returned URL in the in-app browser → the page
  is signed in and renders in app mode (no site navigation).
- **Capture** (the box at the bottom of Today and Workspace) is offline-first: `src/lib/capture-queue.ts` writes
  each jot or recording to the phone first, then walks it through transcribe (voice only,
  `POST /api/transcribe`) → save (`POST /api/workspace/capture`, one idempotency key per capture)
  → sort (`POST /api/workspace/capture/sort`, the web capture box's smart sort, with Undo). Progress
  is saved after every step, so a retry never transcribes twice. Recordings (16 kHz mono AAC,
  ≤ 10 minutes, ~2.4 MB) live in the documents folder until their words are saved. Voice uploads
  need the web change that lets bearer-signed multipart posts past the cross-site guard
  (`apps/web/src/lib/server/csrf.ts`); against an older backend they fail with 403.
- **Workspace tiles** come from `GET /api/projects/desktop` (one request: every project with its
  pulse, D/T bars, task mix and emoji, plus the Workspace's loose items). Until the web is
  deployed with that route, `src/lib/desktop-fallback.ts` builds plain tiles from the project
  list (parents from its `include=hierarchy` read, so nesting shows) and the Workspace read;
  the app rechecks the route every 10 minutes. The fallback list stops at 50 projects.
- **Design tokens** come from the web's Inkprint CSS: `pnpm gen:mobile-theme` regenerates
  `src/theme/inkprint.generated.ts`.

## Checks

```sh
pnpm --filter @buildos/mobile typecheck   # tsc
pnpm --filter @buildos/mobile test:run    # vitest (pure TS: storage, capture queue, kit math, tiles, agenda)
pnpm --filter @buildos/mobile doctor      # expo-doctor
pnpm --filter @buildos/mobile export      # Metro bundle for iOS (the install-layout smoke test)
```

## Rules

- Screens are dumb: anything that decides something lives behind the API.
- API changes are additive. Phone builds lag the web; add fields, never rename or remove without a
  deprecation window.
- `ios/` and `android/` are generated (Continuous Native Generation). Configure native behavior in
  `app.json`, never by hand.
