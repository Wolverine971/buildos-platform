<!-- README.md -->

# BuildOS Platform

A unified monorepo for the BuildOS ecosystem, combining the main web application and background worker services.

## Structure

```
buildos-platform/
├── apps/
│   ├── web/        # Main SvelteKit application (formerly build_os)
│   └── worker/     # Background worker service (formerly daily-brief-worker)
├── packages/
│   ├── shared-types/      # Shared TypeScript types
│   ├── supabase-client/   # Shared Supabase configuration
│   └── config/            # Shared configuration files
```

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Web App**: SvelteKit 2 + Svelte 5
- **Worker**: Node.js + Express + BullMQ
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI API
- **Deployment**: Vercel (web) + Railway (worker)

## Getting Started

```bash
# Install dependencies
pnpm install

# Run all apps in development
pnpm dev

# Run specific app
pnpm dev --filter=web
pnpm dev --filter=worker

# Build all apps
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Supabase
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PRIVATE_SUPABASE_SERVICE_KEY=

# OpenAI
OPENAI_API_KEY=

# Google OAuth
PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Stripe (optional)
STRIPE_SECRET_KEY=
PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

## Development Workflow

1. Always use pnpm for package management
2. Run `pnpm dev` to start all services
3. Use `pnpm lint:fix` before committing
4. Run `pnpm pre-push` before pushing

## Design & API Standards (Web App)

**All UI components must:**

- ✅ Be fully responsive (mobile + desktop)
- ✅ Support light & dark modes with `dark:` prefix
- ✅ Follow BuildOS Style Guide (see `/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md`)
- ✅ Use high information density with Apple-inspired design

**All API endpoints must:**

- ✅ Access Supabase via `locals.supabase` in API routes
- ✅ Use `ApiResponse` wrapper from `$lib/utils/api-response` for JSON endpoints
- ✅ Return consistent response format (success/error)
  Protocol endpoints (SSE streams, binary/file downloads, tracking pixels/redirects, MCP/JSON-RPC)
  can return protocol-native responses.

**Contract Drift Quick Check:**

```bash
# Routes that still use raw json() responses (should normally be protocol endpoints only)
rg -l "return json\\(" apps/web/src/routes/api --glob '+server.ts'
```

**Documentation:**

- After making changes, update relevant docs in `/apps/*/docs/`
- Mark progress and document key decisions

**See `/CLAUDE.md` and `/apps/web/CLAUDE.md` for complete guidelines.**

## Project Documentation

- [Web App Documentation](./apps/web/README.md)
- [Worker Documentation](./apps/worker/README.md)
- [Complete Development Guide](./CLAUDE.md) ⭐
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
