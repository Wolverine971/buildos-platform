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

- **Today** (`src/app/(tabs)/index.tsx`): the day's tasks; tap one to open the reader and walk the
  day with Prev/Next. Capture bar at the bottom (type, or tap the mic).
- **Projects** (`src/app/(tabs)/projects.tsx`) → **project** (`src/app/project/[id].tsx`): tasks
  grouped like the website's board, docs in the website's tree order.
- **Reader** (`src/app/reader.tsx`, a sheet): one task or doc, with quick edits; Prev/Next walk the
  list it was opened from (`src/lib/reader-walk.ts`).

## How it talks to BuildOS

- **Session** lives in the iOS keychain via `expo-secure-store` (chunked, `src/lib/chunked-storage.ts`)
  and is refreshed on the device.
- **Every API call** sends `Authorization: Bearer <access token>` through `@buildos/api-client`
  (`src/lib/api.ts`). The web server accepts it in `apps/web/src/hooks.server.ts` (bearer path), so
  all existing `/api` routes work for the phone with no per-route changes.
- **Web pages inside the app** (settings, billing, integrations, account deletion) open through a
  session handoff: `POST /api/auth/handoff` → open the returned URL in the in-app browser → the page
  is signed in and renders in app mode (no site navigation).
- **Capture** (the bar at the bottom of Today) is offline-first: `src/lib/capture-queue.ts` writes
  each jot or recording to the phone first, then walks it through transcribe (voice only,
  `POST /api/transcribe`) → save (`POST /api/workspace/capture`, one idempotency key per capture)
  → sort (`POST /api/workspace/capture/sort`, the web capture box's smart sort, with Undo). Progress
  is saved after every step, so a retry never transcribes twice. Recordings (16 kHz mono AAC,
  ≤ 10 minutes, ~2.4 MB) live in the documents folder until their words are saved. Voice uploads
  need the web change that lets bearer-signed multipart posts past the cross-site guard
  (`apps/web/src/lib/server/csrf.ts`); against an older backend they fail with 403.
- **Design tokens** come from the web's Inkprint CSS: `pnpm gen:mobile-theme` regenerates
  `src/theme/inkprint.generated.ts`.

## Checks

```sh
pnpm --filter @buildos/mobile typecheck   # tsc
pnpm --filter @buildos/mobile test:run    # vitest (pure TS: config, storage, capture queue)
pnpm --filter @buildos/mobile doctor      # expo-doctor
pnpm --filter @buildos/mobile export      # Metro bundle for iOS (the install-layout smoke test)
```

## Rules

- Screens are dumb: anything that decides something lives behind the API.
- API changes are additive. Phone builds lag the web; add fields, never rename or remove without a
  deprecation window.
- `ios/` and `android/` are generated (Continuous Native Generation). Configure native behavior in
  `app.json`, never by hand.
