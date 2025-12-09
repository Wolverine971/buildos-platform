<!-- docs/MONOREPO_GUIDE.md -->

# BuildOS Monorepo Guide

## Overview

BuildOS Platform is built as a **Turborepo monorepo** containing two independently deployed applications and shared packages.

## Monorepo Structure

```
buildos-platform/
├── /apps/                      # Deployable applications
│   ├── /web/                   # SvelteKit web app → Vercel
│   └── /worker/                # Background worker → Railway
├── /packages/                  # Shared packages
│   ├── /shared-types/          # TypeScript type definitions
│   ├── /supabase-client/       # Supabase database client
│   ├── /twilio-service/        # SMS service wrapper
│   └── /config/                # Shared configuration
├── /docs/                      # Cross-cutting documentation
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml         # pnpm workspace config
└── package.json                # Root package.json
```

## Working with the Monorepo

### Package Manager

**Always use `pnpm`** - Never use `npm`. This is enforced by package manager settings.

### Installation

```bash
# Install all dependencies
pnpm install
```

### Development

```bash
# Start all apps in development mode
pnpm dev

# Start specific app
pnpm dev --filter=web      # Web app only
pnpm dev --filter=worker   # Worker only

# Web app fast modes
cd apps/web
pnpm dev:split    # Dev with type checking (recommended)
pnpm dev:fast     # Quick dev without type checking
```

### Building

```bash
# Build everything
pnpm build

# Build specific app
pnpm build --filter=web
pnpm build --filter=worker

# Build with clean cache
pnpm build --force
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in specific app
pnpm test --filter=web
pnpm test --filter=worker

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

### Pipeline Configuration

Defined in `turbo.json`:

```json
{
	"pipeline": {
		"build": {
			"dependsOn": ["^build"],
			"outputs": [".svelte-kit/**", "dist/**"]
		},
		"test": {
			"dependsOn": ["build"]
		}
	}
}
```

### Task Dependencies

- `^build` means "run build in dependencies first"
- Tasks run in parallel when possible
- Results are cached for faster subsequent runs

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
pnpm add package-name --filter=web

# Add to workspace root
pnpm add -w package-name

# Add dev dependency
pnpm add -D package-name --filter=web
```

### Using Shared Packages

Apps reference shared packages in their `package.json`:

```json
{
	"dependencies": {
		"@buildos/shared-types": "workspace:*",
		"@buildos/supabase-client": "workspace:*"
	}
}
```

Turborepo automatically builds dependencies before dependent apps.

## Common Workflows

### Adding a New Feature to Web App

1. Work in `/apps/web/src/`
2. Add types to `/packages/shared-types/` if needed
3. Update `/apps/web/docs/features/` with documentation
4. Test with `cd apps/web && pnpm test`
5. Run `pnpm pre-push` before committing

### Adding a New Background Job

1. Define job type in `/packages/shared-types/src/queue.ts`
2. Create handler in `/apps/worker/src/jobs/`
3. Document in `/apps/worker/docs/features/`
4. Rebuild packages: `pnpm build --filter=shared-types`
5. Test worker: `cd apps/worker && pnpm test`

### Modifying Shared Types

1. Edit in `/packages/shared-types/src/`
2. Rebuild: `pnpm build --filter=shared-types`
3. Both web and worker will pick up changes automatically
4. Run `pnpm typecheck` to verify no breaking changes

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
# Railway automatically deploys from git
# Manual deploy via Railway CLI:
cd apps/worker
railway up
```

See `/apps/worker/docs/RAILWAY_DEPLOYMENT.md` for details.

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
pnpm build --filter=shared-types
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
