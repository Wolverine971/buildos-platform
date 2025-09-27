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

## Project Documentation

- [Web App Documentation](./apps/web/README.md)
- [Worker Documentation](./apps/worker/README.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Migration Guide](./MIGRATION_GUIDE.md)
