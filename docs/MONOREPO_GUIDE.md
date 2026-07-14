<!-- docs/MONOREPO_GUIDE.md -->

# BuildOS Monorepo Guide

## Overview

BuildOS Platform is a **Turborepo monorepo** containing two independently
deployed applications, shared TypeScript packages, repo-level tooling, and
Supabase database assets.

## Monorepo Structure

```
buildos-platform/
|-- apps/                       # Deployable applications
|   |-- web/                    # SvelteKit web app on Vercel
|   `-- worker/                 # Node/Express worker service on Railway
|-- packages/                   # Shared workspace packages
|   |-- shared-types/           # Generated DB types, queue types, API types
|   |-- shared-agent-ops/       # Shared agent ops, ontology, gateway helpers
|   |-- shared-utils/           # Logging, metrics, shared utilities
|   |-- smart-llm/              # Shared LLM abstraction
|   |-- supabase-client/        # Supabase client configuration
|   |-- twilio-service/         # SMS/Twilio integration
|   `-- buildos-mcp-server/     # Local stdio MCP bridge
|-- docs/                       # Cross-cutting documentation
|-- scripts/                    # Generation and repo tooling
|-- supabase/                   # Migrations and local Supabase config
|-- turbo.json                  # Turborepo task config
|-- pnpm-workspace.yaml         # pnpm workspace config
`-- package.json                # Root package.json
```

## Working with the Monorepo

### Package Manager

**Always use `pnpm`**. The root `package.json` pins `pnpm@11.7.0`, Turborepo
`^2.10.5`, and requires Node.js `>=20.19.0`.

### Installation

```bash
# Install all dependencies
pnpm install
```

### TypeScript Compiler Strategy

The monorepo deliberately keeps TypeScript 5.9 and native TypeScript 7 side by side:

| Workspace                     | Build/type pipeline                              | Typecheck compiler                 |
| ----------------------------- | ------------------------------------------------ | ---------------------------------- |
| `apps/web`                    | SvelteKit/Vite with TypeScript 5.9 tooling       | `svelte-check` with TypeScript 5.9 |
| `apps/worker`                 | Native TypeScript 7                              | Native TypeScript 7                |
| `packages/shared-types`       | `tsup`/esbuild + TypeScript 5.9 declarations     | Native TypeScript 7                |
| `packages/buildos-mcp-server` | `tsup`/esbuild with TypeScript 5.9 compatibility | Native TypeScript 7                |
| Other shared packages         | `tsup`/esbuild + TypeScript 5.9 declarations     | TypeScript 5.9                     |

Native TypeScript 7 is declared as `@typescript/native: npm:typescript@^7.0.2` in only the
workspaces that use it. Scripts invoke its local `bin/tsc` path explicitly. This isolates the
performance upgrade from SvelteKit and declaration-generation integrations that still expect
TypeScript 5.x behavior.

### Development

```bash
# Start all configured dev tasks
pnpm dev

# Start a specific app through Turbo
pnpm dev --filter=@buildos/web      # Web app only
pnpm dev --filter=@buildos/worker   # Worker API, queue consumer, and scheduler

# Web app fast modes
cd apps/web
pnpm dev:split    # Dev + type checking side by side (recommended)
pnpm dev          # Dev server only

# Worker service modes
cd apps/worker
pnpm dev          # API + queue consumer + scheduler
pnpm worker       # Queue consumer only
pnpm scheduler    # Scheduler only
```

### Building

```bash
# Build everything
pnpm build

# Build specific app
pnpm build --filter=@buildos/web
pnpm build --filter=@buildos/worker

# Build with clean cache
pnpm build --force
```

### Testing

```bash
# Run all tests in non-watch mode
pnpm test:run

# Run tests in specific app or package through Turbo
pnpm test:run --filter=@buildos/web
pnpm test:run --filter=@buildos/worker

# Web app LLM tests (costs money - real OpenAI API calls)
cd apps/web
pnpm test:llm
```

### Code Quality

```bash
# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Lint with auto-fix
pnpm lint:fix

# Format with Prettier
pnpm format

# Pre-push validation (runs typecheck, test, lint, build)
pnpm pre-push
```

## Turborepo Concepts

The repo uses Turborepo 2.10.5. Do not downgrade below 2.9.7: older releases cannot fully parse
pnpm 11 lockfiles with flat-string patched dependency entries, which degrades workspace-aware
caching and dependency resolution.

### Task Configuration

Defined in `turbo.json`:

```json
{
	"tasks": {
		"build": {
			"dependsOn": ["^build"],
			"outputs": [".vercel/**", ".svelte-kit/**", "dist/**", "build/**", ".tsbuildinfo"]
		},
		"dev": {
			"cache": false,
			"persistent": true
		},
		"test": {
			"dependsOn": ["^build"],
			"cache": false
		},
		"test:run": {
			"dependsOn": ["^build"]
		},
		"typecheck": {
			"dependsOn": ["^build"],
			"outputs": []
		}
	}
}
```

### Task Dependencies

- `^build` means "run build in dependencies first"
- Tasks run in parallel when possible
- Results are cached for faster subsequent runs
- `.env` and `.env.*local` files are global cache dependencies
- Environment variables listed in `turbo.json` `globalEnv` are available to tasks

### Cache Management

```bash
# Force rebuild (bypass cache)
pnpm build --force

# Clear turbo cache
rm -rf .turbo
```

## Workspace Dependencies

### Adding Dependencies

```bash
# Add to specific app
pnpm --filter @buildos/web add package-name

# Add to workspace root
pnpm add -w package-name

# Add dev dependency
pnpm --filter @buildos/web add -D package-name
```

### Using Shared Packages

Apps reference shared packages in their `package.json`:

```json
{
	"dependencies": {
		"@buildos/shared-agent-ops": "workspace:*",
		"@buildos/shared-types": "workspace:*",
		"@buildos/shared-utils": "workspace:*",
		"@buildos/smart-llm": "workspace:*",
		"@buildos/supabase-client": "workspace:*"
	}
}
```

Root Turbo scripts automatically build dependencies before dependent apps for
tasks configured with `dependsOn`.

## Common Workflows

### Adding a New Feature to Web App

1. Work in `/apps/web/src/`
2. Add shared contracts to `/packages/shared-types/` if needed
3. Update `/apps/web/docs/features/` with documentation
4. Test with `pnpm test:run --filter=@buildos/web`
5. Run `pnpm pre-push` before committing

### Adding a New Background Job

1. Add job metadata/result contracts in `/packages/shared-types/src/queue-types.ts`
2. Update metadata validation in `/packages/shared-types/src/validation.ts`
3. Create the processor under `/apps/worker/src/workers/<domain>/`
4. Register it in `/apps/worker/src/worker.ts` with `queue.process(jobType, handler)`
5. Add or update the producer in the web server route/service that enqueues the job
6. Document the flow in `/apps/worker/docs/features/` or `/apps/worker/docs/WORKER_JOBS_AND_FLOWS.md`
7. Test shared types and worker behavior:

```bash
pnpm build --filter=@buildos/shared-types
pnpm test:run --filter=@buildos/worker
```

### Modifying Shared Types

1. Edit in `/packages/shared-types/src/`
2. Rebuild: `pnpm build --filter=@buildos/shared-types`
3. Both web and worker will pick up changes automatically
4. Run `pnpm typecheck` to verify no breaking changes

When database types or schema docs have drifted, use the root generation
scripts instead:

```bash
pnpm gen:types
pnpm gen:schema
pnpm gen:all
```

## Deployment

### Web App (Vercel)

```bash
# Vercel automatically deploys from git
# Manual deploy:
cd apps/web
vercel deploy
```

See `/apps/web/docs/operations/deployment/` for details.

### Worker (Railway)

```bash
# Railway automatically deploys from git using repo-root config.
# The Railway service root directory must remain `/`.
# Manual deploy via Railway CLI should run from the monorepo root:
railway up
```

See `/apps/worker/docs/deployment/RAILWAY_DEPLOYMENT.md` for details.

## Troubleshooting

### "Workspace not found" errors

```bash
# Reinstall dependencies
rm -rf node_modules
pnpm install
```

### Build failures

```bash
# Clear all caches and rebuild
rm -rf .turbo node_modules apps/*/node_modules packages/*/node_modules
pnpm install
pnpm build --force
```

### Type errors after updating shared types

```bash
# Rebuild shared packages first
pnpm build --filter=@buildos/shared-types
pnpm typecheck
```

## Best Practices

1. **Always run `pnpm pre-push` before pushing** - Catches issues early
2. **Use `--filter` for targeted operations** - Faster than running everything
3. **Document changes** - Update relevant README files
4. **Test locally** - Don't rely on CI to catch basic errors
5. **Keep packages focused** - Each package should have a single responsibility

## Related Documentation

- [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) - How apps interact
- [Web App Docs](/apps/web/docs/) - Web application documentation
- [Worker Docs](/apps/worker/docs/) - Worker service documentation
- [Task Index](TASK_INDEX.md) - Task-based navigation
