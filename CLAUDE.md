<!-- CLAUDE.md -->
<!--
CLAUDE.md

Maintenance note (2026-08-30): Claude Code's user-level auto-compact capacity is set to 600,000
tokens at ~/.claude/settings.json -> env.CLAUDE_CODE_AUTO_COMPACT_WINDOW. With the default trigger
percentage, compaction should begin near 570,000 tokens. Change that setting to retune the window.
This HTML comment is stripped when Claude loads project instructions.
-->

@AGENTS.md

# BuildOS Repository Guide

BuildOS is a thinking environment for people making complex things. Users turn messy text or voice
into projects, tasks, context, daily briefs, calendar plans, and agent-assisted work.

## Start here

- Use `pnpm` for every package operation.
- Read the nearest instructions and relevant docs before editing. For web work, start with
  `apps/web/AGENTS.md`; for marketing, start with `docs/marketing/START_HERE.md`.
- Inspect the real implementation and call sites before changing behavior.
- Run the narrowest check that proves the change; use `pnpm pre-push` only when full validation is
  warranted.

Common commands:

```bash
pnpm install
pnpm dev
pnpm test:run
pnpm typecheck
pnpm lint
pnpm build
pnpm pre-push
pnpm gen:all
```

## System map

- `apps/web` — SvelteKit 2/Svelte 5 app on Vercel.
- `apps/worker` — Express queue worker and scheduler on Railway.
- `packages/shared-types` — generated database and API types.
- `packages/smart-llm` — model routing through OpenRouter with provider fallbacks.
- `packages/shared-agent-ops`, `packages/agentic-chat-runtime`, and
  `packages/agent-orchestrator` — shared agent operations, runtime contracts, and orchestration.
- `packages/buildos-mcp-server` — local bridge to the remote BuildOS MCP connector.
- `supabase/migrations` — PostgreSQL schema changes; Supabase Auth and RLS protect user data.

Architecture details live in `docs/architecture/`, `apps/web/docs/technical/architecture/`, and
`apps/worker/docs/`. Generated types live in `packages/shared-types/src/`; regenerate them with
`pnpm gen:all`.

## Repository-wide constraints

- Keep the existing dual TypeScript compiler lanes: TypeScript 5.9 for SvelteKit and `tsup` builds,
  and `@typescript/native` where already configured. Turborepo must remain compatible with pnpm 11's
  flat patched-dependency lockfile.
- Use user-scoped Supabase clients for normal requests and the admin client only for explicit
  privileged operations.
- JSON API endpoints use `ApiResponse` from `$lib/utils/api-response`; protocol responses such as
  SSE, downloads, pixels, and webhooks may return raw responses.
- Use `docs/product/PROJECT_REVIEW_TAXONOMY.md` for Project Review terminology.
- BuildOS marketing leads with relief, not AI. Public category: “thinking environment for people
  making complex things.” Core promise: “turn messy thinking into structured work.”

## Web-specific routing

Before changing `apps/web`, read `apps/web/AGENTS.md`. It contains the current Svelte 5 workflow and
validation gate. The Inkprint design system lives at
`apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`; preserve its tokens, light/dark
support, accessibility conventions, and centralized Lucide exports.

## Deployment

- Web: Vercel, configured by `vercel.json`.
- Worker: Railway, configured by `railway.toml` and `nixpacks.toml`.
- CI: `.github/workflows/ci.yml` runs typecheck, lint, and tests.
