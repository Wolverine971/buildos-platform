<!-- docs/specs/MOBILE_APP_PLAN_2026-10-23.md -->

# BuildOS iPhone app: plan

Status: **plan (2026-10-23). Nothing built.** DJ chose Expo + React Native and the "native core +
web pages for the rest" shape. Next step: Phase 0 (server groundwork), which needs no app or
accounts.

## The vision (DJ, 2026-10-23)

> "I want the same functionality on the phone. I have BuildOS set up as a PWA, but it's better if
> we can get it set up as a native Apple app. It's going to be for information capture, saving
> notes, and working on the phone. I like the built-in notification piece."

DJ's concern: maintaining two apps. His answer: unify the APIs and authentication so the phone and
web are two screen layers over one system.

## Decisions

| Decision        | Choice                                    | Why                                                                                                                                               |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Expo + React Native (React)               | Only Expo gives real native (push, share sheet, widgets, keychain). Cadre already runs it. DJ's collaborator knows it. Expo has no Svelte option. |
| Not chosen      | Capacitor, Svelte Native                  | Capacitor = the SSR site in a box (same slow start, Apple 4.2 thin-wrapper risk). Svelte Native = tiny community.                                 |
| Coverage        | Native core + web pages inside the app    | DJ picked it 2026-10-23. Every feature works on day one; screens move to native once they earn it.                                                |
| Platform        | iPhone first                              | Android comes nearly free later from the same code.                                                                                               |
| Capture offline | Save on the phone first, sync when online | Capture must never be lost on a bad connection.                                                                                                   |
| Billing         | Stays on the website                      | Avoids Apple's in-app purchase rules.                                                                                                             |

## Shape: two screen layers, one system

```
 iPhone app (React Native)            Web app (Svelte)
 ─────────────────────────            ────────────────
 native core screens                  all screens
 web pages in the app (signed in) ──► same web pages, "app mode" (no web nav)
            │                                   │
            └──── Authorization: Bearer ────────┤ cookies
                                                ▼
                     SvelteKit /api  (one API, ApiResponse envelope)
                     $lib/server services, worker, agent chat runtime
                                                ▼
                     Supabase: same accounts, same RLS, realtime
```

**One copy, used by both:** database, accounts and permissions, the API and its business logic,
agent chat, the daily brief and worker jobs, the notification engine and its preferences, and the
data types (`@buildos/shared-types`). Design tokens get one source too: Inkprint colors, type and
spacing become a token file that produces CSS variables for web and a theme object for native.

**Two copies:** screens and screen-level state.

**Rules that keep it unified**

1. **Screens are dumb.** Anything that decides something lives behind the API. Today already works
   this way: the page load and `apps/web/src/routes/api/today/+server.ts` both call
   `getTodayFeed`. When a web page assembles its data inside its page load (Projects, project page,
   History, Notifications), porting it means adding or reusing a matching endpoint, and the web page
   moves to that endpoint too.
2. **One typed API client** in a shared package, used by mobile first and adopted by web over time.
   It builds on the `ApiResponseBody` envelope already in `@buildos/shared-types`. A shape change
   shows up as a type error in both apps before it ships.
3. **API changes are additive.** Phone versions can be weeks old; a web deploy updates everyone at
   once. Add fields, never rename or remove them without a deprecation window. Expo over-the-air
   updates (EAS Update) push screen code without App Store review, which narrows the gap but does
   not remove the rule.

## What the codebase already gives us (measured 2026-10-23)

- Only 2 browser components query the database directly (`DashboardBriefWidget`, `AgentChatModal`).
  Everything else goes through `/api` or server page loads backed by shared services.
- Endpoints for every native-core screen already exist: `/api/today`, `/api/onto/projects`,
  `/api/onto/projects/[id]/full`, the task and document routes under `/api/onto`,
  `/api/agent/v2/turns`, `/api/voice-notes`, `/api/transcribe`, `/api/daily-briefs`, `/api/activity`.
- Web Google sign-in already ends in `supabase.auth.signInWithIdToken`, the same call a native Google
  or Apple button makes.
- The worker's notification system already has `push`, `in_app`, `email` and `sms` channels with
  user preferences (`apps/worker/src/workers/notification/notificationWorker.ts`). Web push stores
  subscriptions in `push_subscriptions` (`apps/web/src/lib/services/browser-push.service.ts`).
- **The gap:** every API route identifies the user from cookies only. `apps/web/src/hooks.server.ts`
  builds `locals.supabase` from cookies, and routes call `safeGetSession`. One bearer-token path
  there makes all ~457 routes phone-ready.

## Screens

**Native (v1):** Today · Capture (type or talk) · Projects · Project reader with tasks and docs ·
Task and doc view/edit · Agent chat · Notifications · Daily briefs.

**Web pages inside the app, already signed in:** Profile and settings · Billing · Calendar and Gmail
connect · Agent keys · Invites · Onboarding extras · Account deletion (Apple requires it to be
reachable in the app).

**Promotion rule:** a web-in-app screen moves to native when DJ uses it often enough to feel the
difference.

## Build order

### Phase 0: server groundwork (free, testable now, no app needed)

1. **Bearer auth.** In `hooks.server.ts`, when a request carries `Authorization: Bearer <Supabase
access token>`, build `locals.supabase` with that token instead of cookies. Leave agent tokens
   (`boca_`, `bo_`) and their existing routes untouched. Keep the live-auth check for sensitive
   routes and mutations. Cover it with tests: valid token, expired token, agent token on a user
   route, cookie path unchanged.
2. **Shared API client package** with typed calls for the native-core endpoints.
3. **App mode for web pages.** A query flag or header hides web navigation when a page opens
   inside the app.
4. **Session handoff.** The phone exchanges its bearer token for a one-time, short-lived code. The
   in-app browser opens a handoff URL that sets the web session cookie and redirects. Tokens never
   appear in URLs.
5. **Native push plumbing.** A device-registration endpoint, a new table for native push tokens
   (rehearse the migration), and a worker delivery path that sends through Expo's push service. It
   reuses the existing push channel and preferences, so the daily brief arrives on the phone with no
   new settings.
6. **Universal links.** Host Apple's app-site-association file on build-os.com, so build-os.com
   links open in the app when it is installed.

### Phase 1: app shell

- Scaffold `apps/mobile/` from the Cadre pattern: Expo Router, the Supabase session in iOS keychain
  storage (chunked), TanStack Query, and query cache keyed by user ID.
- **Install spike first** (see Landmines).
- Sign in with email and password. Today read-only. Runs in Expo Go on DJ's phone.

### Phase 2: capture

- Type or talk. Voice recorded natively, sent to the existing transcription and voice-note
  endpoints. Confirm the web's current capture path before wiring it.
- Offline queue: captures save locally and sync on reconnect, with a visible "waiting to send"
  state.

### Phase 3: projects

Projects list → project reader → task and doc view/edit, against the existing `/api/onto` routes.

### Phase 4: agent chat

Same turn endpoints and live channel as web. Expo's `fetch` supports streaming responses.

### Phase 5: notifications and sign-in (needs the Apple Developer account)

- Development build (no longer Expo Go): native push, notification tap → the right screen,
  notifications inbox.
- Sign in with Google (native button → `signInWithIdToken`) and Sign in with Apple. Apple requires
  a privacy-focused login next to Google.

### Phase 6: the rest and launch

Web pages inside the app, TestFlight for DJ and testers, App Store listing and privacy labels, a
demo account for App Review, then submission.

## Landmines

- **pnpm install layout.** Expo has supported pnpm's isolated installs since SDK 54, but some React
  Native libraries still break. Cadre had to switch to hoisted installs (on bun) to avoid duplicate
  native modules. Here, pnpm's hoisted mode is repo-wide and would touch web and worker too. Test
  this first. Fallback: the app lives in its own repo and imports shared types as a package.
- **Account deletion.** Apple rejects apps that let people create an account but not delete it in
  the app. A 2026-09-30 note says account deletion was broken in prod. Verify before submission.
- **Version lag.** See rule 3. Old app versions keep calling the API after web ships.
- **Google OAuth.** The phone needs an iOS OAuth client ID in the same Google project, added to
  Supabase's allowed client IDs. Sign-in scopes only; Calendar and Gmail connect stay on the web
  pages inside the app.

## Needs DJ

- **Apple Developer account ($99/yr).** Decide the seller name shown on the App Store: enrolling as
  an individual shows your personal name; enrolling as a company needs a D-U-N-S number, which can
  take a couple of weeks. Start this early.
- **Expo account** (free tier is enough to start).
- **Bundle ID**, for example `com.buildos.app` (permanent once published).
- Whether the Cadre collaborator works on this app.
