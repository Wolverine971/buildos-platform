<!-- packages/api-client/README.md -->

# @buildos/api-client

The one typed client for the BuildOS API. The iPhone app (`apps/mobile`, Expo / React Native)
uses it first; the Svelte web app adopts it screen by screen. It talks to the existing SvelteKit
routes in `apps/web` with `Authorization: Bearer <Supabase access token>` and never sends cookies.

Plain TypeScript over global `fetch`: no Node built-ins, no DOM-only APIs, so it runs on Hermes,
in browsers and in Node. Metro reads the source directly (`react-native` export condition);
Node and web use the `tsup` build in `dist/`.

## In the app

```ts
import { createBuildOsClient } from '@buildos/api-client';

export const api = createBuildOsClient({
	baseUrl: 'https://build-os.com',
	// Session lives in expo-secure-store via the Supabase client.
	getAccessToken: async () =>
		(await supabase.auth.getSession()).data.session?.access_token ?? null,
	defaultHeaders: { 'X-BuildOS-Client': `ios/${Constants.expoConfig?.version ?? 'dev'}` },
	onUnauthorized: () => signOutAndShowLogin()
});

const { feed } = await api.today.get({ timezone });
await api.tasks.update(taskId, { state_key: 'done' });
```

Every call returns the unwrapped envelope `data` and throws `BuildOsApiError` otherwise:
`error.isUnauthorized()` (sign in again), `error.isUpgradeRequired()` plus `error.upgrade`
(billing gate, workspace is read-only), `error.isNetworkError` with `status === 0` (offline; show
"waiting to send" and retry). `requestWithMeta` also returns the envelope's `warnings`.
`raw()` returns the `Response` itself for streaming or non-JSON routes and throws the same error
on any non-2xx status.

Agent chat: `agent.sendTurn` posts a turn and gets back a JSON admission (202 new, 200 duplicate);
the reply streams over the person's private Supabase realtime channel, not over HTTP. The app opens
that channel with its own Supabase client using `chatUserChannelTopic(userId)`,
`CHAT_USER_CHANNEL_CONFIG` and `CHAT_REALTIME_EVENTS` from this package; `agent.reconcileTurn`
replays what a dropped connection missed, `agent.cancelTurn` is Stop, and `chat.history` loads a
reopened session (messages, tool calls, turn runs, timeline) in one read.

## The additive-API rule

Phone builds can be weeks behind a web deploy, and old versions keep calling the API. So the API
only adds: new fields and new endpoints are fine; renaming or removing a field, changing its type,
or making an optional input required needs a deprecation window and a bump of
`API_CLIENT_CONTRACT_VERSION` (sent as `X-BuildOS-Api-Contract`). The same rule applies to this
package's method names and argument shapes.

## Adding an endpoint

Read the route handler, put the request/response types in `src/types.ts` with a comment naming
the route file (structural, only the fields the handler returns; use `Database` row types where it
returns rows), add the wrapper under `src/endpoints/`, wire it in `src/index.ts`, and cover the
URL, method and body in `src/client.test.ts`.

```bash
pnpm --filter @buildos/api-client typecheck
pnpm --filter @buildos/api-client exec vitest run
pnpm --filter @buildos/api-client build   # apps/mobile resolves types from dist/
```
