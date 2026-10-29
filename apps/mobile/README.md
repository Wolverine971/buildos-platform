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

## How it talks to BuildOS

- **Session** lives in the iOS keychain via `expo-secure-store` (chunked, `src/lib/chunked-storage.ts`)
  and is refreshed on the device.
- **Every API call** sends `Authorization: Bearer <access token>` through `@buildos/api-client`
  (`src/lib/api.ts`). The web server accepts it in `apps/web/src/hooks.server.ts` (bearer path), so
  all existing `/api` routes work for the phone with no per-route changes.
- **Web pages inside the app** (settings, billing, integrations, account deletion) open through a
  session handoff: `POST /api/auth/handoff` → open the returned URL in the in-app browser → the page
  is signed in and renders in app mode (no site navigation).
- **Design tokens** come from the web's Inkprint CSS: `pnpm gen:mobile-theme` regenerates
  `src/theme/inkprint.generated.ts`.

## Checks

```sh
pnpm --filter @buildos/mobile typecheck   # tsc
pnpm --filter @buildos/mobile test:run    # vitest (pure TS: config, storage)
pnpm --filter @buildos/mobile doctor      # expo-doctor
pnpm --filter @buildos/mobile export      # Metro bundle for iOS (the install-layout smoke test)
```

## Rules

- Screens are dumb: anything that decides something lives behind the API.
- API changes are additive. Phone builds lag the web; add fields, never rename or remove without a
  deprecation window.
- `ios/` and `android/` are generated (Continuous Native Generation). Configure native behavior in
  `app.json`, never by hand.
