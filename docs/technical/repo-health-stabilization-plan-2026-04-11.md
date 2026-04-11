<!-- docs/technical/repo-health-stabilization-plan-2026-04-11.md -->

<!-- docs/technical/repo-health-stabilization-plan-2026-04-11.md -->

# Repo Health Stabilization Plan - 2026-04-11

## Current Goal

Get `pnpm run gen:all` stable without broad, unrelated cleanup.

## Stabilization Checklist

### Phase 1 - `gen:all` Stability

- [x] Reproduce the literal `pnpm run gen all` failure from a clean command path.
- [x] Keep Turbo in `stream` UI mode so package tasks do not require PTY allocation.
- [x] Add a `gen` command dispatcher so `pnpm run gen all` routes to `gen:all`.
- [x] Make stale Supabase type generation skip cleanly when the local Supabase CLI is missing.
- [ ] Make the final validation step in `gen:all` run the checks the repo actually relies on.
- [ ] Avoid running full-repo formatting until the existing dirty worktree is understood.
- [ ] Document any remaining non-blocking warnings separately from build-stopping errors.

### Phase 2 - Turbo Task Graph

- [ ] Align root task names with package scripts, especially `typecheck` versus `check`.
- [ ] Decide whether `test:run` should include `@buildos/web`; add or rename scripts accordingly.
- [ ] Decide whether shared packages should have lint scripts or be intentionally excluded.
- [ ] Remove duplicate dependency builds from `@buildos/web` when building through Turbo.
- [ ] Narrow Turbo build outputs by package type instead of using the same broad output list for every package.
- [ ] Reduce global cache invalidation from `.env` files and move env handling into task-scoped `env` or passthrough env.

### Phase 3 - Vercel Deployment Health

- [ ] Add `CRON_SECRET` to Vercel and keep it aligned with cron handler expectations.
- [ ] Add Vercel project env vars missing from `turbo.json` strict env configuration.
- [ ] Remove `--force` from the Vercel Turbo build command after cache correctness is verified.
- [ ] Align Node versions across `.nvmrc`, package `engines`, Vercel project settings, and Vercel function runtime.
- [ ] Add a specific no-cache header for `/sw.js` before broad immutable JavaScript caching.
- [ ] Guard or disable Husky `prepare` during Vercel installs.

### Phase 4 - Dependency And Type Health

- [ ] Fix `pnpm audit --prod` findings, starting with `path-to-regexp` and `@sveltejs/kit`.
- [ ] Resolve current `@buildos/web` `svelte-check` errors.
- [ ] Update stale Browserslist data.
- [ ] Decide whether Svelte warnings should fail CI or stay informational.

## Verification Commands

Use these as stabilization gates:

```bash
pnpm run gen:all
pnpm run gen all
pnpm exec turbo typecheck --force
pnpm --filter=@buildos/web check
pnpm audit --prod
vercel project inspect build-os
vercel env ls
```
