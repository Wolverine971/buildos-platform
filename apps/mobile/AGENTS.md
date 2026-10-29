<!-- apps/mobile/AGENTS.md -->

# BuildOS Mobile Agent Instructions

These instructions apply to work under `apps/mobile` (Expo SDK 58, React Native, Expo Router).

- Expo changes every SDK. Read the `expo` major version in `package.json`, then check
  `https://docs.expo.dev/versions/v<major>.0.0/` and `https://docs.expo.dev/llms.txt` before using
  an Expo, EAS or React Native API from memory.
- Add dependencies with `npx expo install <package>` from `apps/mobile` (it resolves SDK-compatible
  versions and runs pnpm). Workspace packages are added with `pnpm --filter @buildos/mobile add`.
- Routes live in `src/app/`; keep components, hooks and libraries outside it.
- The app never queries Supabase tables directly. Use `@buildos/api-client` (`src/lib/api.ts`);
  add or reuse an API route in `apps/web` when a screen needs data the API does not expose, and
  move the web page to that route too.
- Colors come from `src/theme` (generated from the web's Inkprint tokens). Do not hard-code hex
  values in screens.
- Never generate images. Icons and splash art are copied from `apps/web/static`; ask the owner for
  new art.
- Validation: `pnpm --filter @buildos/mobile typecheck` and `pnpm --filter @buildos/mobile test:run`.
  `pnpm --filter @buildos/mobile export` is the Metro smoke test; it is slow, run it once per change
  set, never from parallel subagents.
- Expo Go only ships Expo's bundled native modules. A library with native code (push tokens,
  Google/Apple sign-in) needs a development build; do not add one without a product decision.
