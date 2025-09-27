# Monorepo Migration Plan: Unifying build_os and daily-brief-worker

## Executive Summary

After analyzing both projects, I recommend migrating to a **pnpm + Turborepo monorepo** structure. Both projects already use pnpm and share the same Supabase database schema, making them ideal candidates for unification. This will enable shared types, reduce duplication, and improve development velocity.

## Current State Analysis

### build_os (Main Application)
- **Type**: SvelteKit application (Svelte 5 with runes)
- **Purpose**: AI-powered productivity platform for ADHD minds
- **Dependencies**: Supabase, OpenAI, Stripe, Google Calendar
- **Package Manager**: pnpm
- **Key Features**: Brain dump processing, project management, daily briefs UI

### daily-brief-worker (Background Service)
- **Type**: Node.js background worker
- **Purpose**: Async processing for daily briefs generation
- **Dependencies**: Supabase, BullMQ, Express, Node Cron
- **Package Manager**: pnpm
- **Key Features**: Queue processing, scheduled jobs, email delivery

### Shared Elements
- **Database**: Same Supabase instance and schema
- **Dependencies**: @supabase/supabase-js, nodemailer, marked, sanitize-html, date-fns
- **Types**: Database types are duplicated across both projects
- **Purpose**: daily-brief-worker is a backend service for build_os

## Recommended Architecture: pnpm + Turborepo

### Why This Stack?

1. **Performance**: Turborepo provides exceptional caching (30s → 0.2s on cached builds)
2. **Simplicity**: Easier learning curve than Nx, perfect for your team size
3. **pnpm Native**: Both projects already use pnpm, no migration needed
4. **Vercel Integration**: Turborepo (owned by Vercel) works seamlessly with your deployment
5. **Incremental Adoption**: Can be implemented gradually without breaking changes

### Alternative Considered
- **Nx**: More complex, better for enterprise-scale projects
- **Pure pnpm workspaces**: Lacks advanced caching and task orchestration
- **Lerna**: Being phased out in favor of Nx

## Proposed Monorepo Structure

```
buildos-monorepo/
├── apps/
│   ├── web/                    # Current build_os (SvelteKit app)
│   │   ├── src/
│   │   ├── static/
│   │   ├── package.json
│   │   └── svelte.config.js
│   └── worker/                 # Current daily-brief-worker
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── database.ts    # Database schema types
│   │   │   ├── api.ts         # API interfaces
│   │   │   └── index.ts
│   │   └── package.json
│   ├── supabase-client/        # Shared Supabase configuration
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   └── package.json
│   ├── email-templates/        # Shared email templates
│   │   └── package.json
│   └── config/                 # Shared ESLint, Prettier, TypeScript configs
│       ├── eslint/
│       ├── prettier/
│       └── typescript/
├── turbo.json                  # Turborepo configuration
├── pnpm-workspace.yaml         # pnpm workspace configuration
├── package.json                # Root package.json
├── .gitignore
├── .env.example
└── README.md
```

## Migration Strategy

### Phase 1: Repository Preparation (Keep Separate Repos)
1. **Create new monorepo repository** on GitHub
2. **Preserve history** using `git subtree` or `git filter-branch`
3. **Setup base structure** with Turborepo and pnpm workspaces
4. **Keep old repos as archives** (don't delete immediately)

### Phase 2: Code Migration (1-2 days)
1. **Move build_os → apps/web/**
   - Update import paths
   - Adjust build scripts
   - Update environment variables

2. **Move daily-brief-worker → apps/worker/**
   - Update import paths
   - Adjust deployment configs

3. **Extract shared code → packages/**
   - Database types
   - Supabase client configuration
   - Common utilities

### Phase 3: Integration (2-3 days)
1. **Setup Turborepo pipelines**
   - Define task dependencies
   - Configure caching strategies
   - Setup parallel execution

2. **Update CI/CD**
   - Modify GitHub Actions workflows
   - Update Vercel configuration
   - Configure Railway deployment for worker

3. **Environment variables**
   - Centralize common variables
   - App-specific overrides

### Phase 4: Testing & Validation (1 day)
1. **Comprehensive testing**
   - Run all test suites
   - Verify builds
   - Test deployments

2. **Team onboarding**
   - Documentation updates
   - Developer workflow guides

## GitHub Repository Approach

### Option 1: New Repository (Recommended)
**Create `buildos-platform` repository**

**Pros:**
- Clean history without merge conflicts
- Proper monorepo structure from start
- Easier CI/CD setup

**Cons:**
- Need to migrate issues/PRs
- Update documentation links

**Migration Steps:**
```bash
# 1. Create new repo on GitHub
# 2. Clone and setup monorepo structure
git clone https://github.com/yourusername/buildos-platform.git
cd buildos-platform

# 3. Add existing repos as remotes
git remote add build_os https://github.com/yourusername/build_os.git
git remote add worker https://github.com/yourusername/daily-brief-worker.git

# 4. Fetch and merge histories
git fetch build_os
git fetch worker

# 5. Use git subtree to preserve history
git subtree add --prefix=apps/web build_os/main
git subtree add --prefix=apps/worker worker/main
```

### Option 2: Transform Existing Repository
**Use `build_os` as base**

**Pros:**
- Preserves issues, stars, watchers
- No link updates needed

**Cons:**
- More complex git history
- Potential merge conflicts

## Implementation Files

### 1. Root package.json
```json
{
  "name": "buildos-platform",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "format": "prettier --write .",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "prettier": "^3.6.2"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

### 2. pnpm-workspace.yaml
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 3. turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".svelte-kit/**", "dist/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 4. packages/shared-types/package.json
```json
{
  "name": "@buildos/shared-types",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.9.2"
  }
}
```

## Benefits After Migration

### Immediate Benefits
1. **Shared Types**: No more type duplication between projects
2. **Atomic Commits**: Changes to both services in single commits
3. **Unified Testing**: Run all tests with single command
4. **Better DX**: Faster builds with Turborepo caching

### Long-term Benefits
1. **Code Reuse**: Extract and share common utilities
2. **Consistent Standards**: Single source of truth for configs
3. **Simplified Dependencies**: Update shared deps once
4. **Easier Onboarding**: One repository to understand

## Deployment Changes

### Vercel (apps/web)
```json
{
  "buildCommand": "cd ../.. && pnpm turbo build --filter=web",
  "outputDirectory": "apps/web/build",
  "installCommand": "pnpm install",
  "framework": "sveltekit"
}
```

### Railway (apps/worker)
```json
{
  "build": {
    "builder": "nixpacks",
    "buildCommand": "pnpm turbo build --filter=worker"
  },
  "deploy": {
    "startCommand": "cd apps/worker && pnpm start",
    "restartPolicyType": "on-failure"
  }
}
```

## Risk Mitigation

1. **Backup Everything**: Keep original repos as archives
2. **Gradual Migration**: Move one service at a time
3. **Feature Flags**: Use flags to toggle between old/new during transition
4. **Rollback Plan**: Keep deployment configs for old repos ready

## Timeline Estimate

- **Week 1**: Setup monorepo structure, migrate code
- **Week 2**: Update CI/CD, testing, documentation
- **Week 3**: Deploy to staging, fix issues
- **Week 4**: Production deployment, monitoring

## Next Steps

1. **Decision**: Approve monorepo migration approach
2. **Repository**: Create new `buildos-platform` repository
3. **Base Setup**: Initialize with Turborepo and pnpm
4. **Migration**: Start with shared types package
5. **Incremental**: Move services one at a time

## Commands for Quick Start

```bash
# Create monorepo from scratch
npx create-turbo@latest buildos-platform --package-manager pnpm
cd buildos-platform

# Add existing code as git subtrees (preserves history)
git subtree add --prefix=apps/web https://github.com/yourusername/build_os.git main
git subtree add --prefix=apps/worker https://github.com/yourusername/daily-brief-worker.git main

# Install dependencies
pnpm install

# Setup shared packages
mkdir -p packages/shared-types/src
mkdir -p packages/supabase-client/src

# Run development
pnpm dev

# Build everything
pnpm build
```

## Questions to Consider

1. **Deployment**: Will both services continue to deploy independently?
2. **Versioning**: How will you handle versioning for the monorepo?
3. **Access Control**: Who needs access to the unified repository?
4. **CI Minutes**: Will GitHub Actions minutes increase significantly?
5. **Secret Management**: How to handle environment variables across environments?

---

This plan provides a clear path forward with minimal risk and maximum benefit. The pnpm + Turborepo combination offers the best balance of performance, simplicity, and features for your use case.