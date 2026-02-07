<!-- docs/TASK_INDEX.md -->

# Task-Based Documentation Index

Navigation organized by **what you want to do**, not just what exists.

## Understanding the System

| I want to understand...        | Start Here                                      | Then Read                                     | Code Location                                 |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| The monorepo structure         | [Monorepo Guide](MONOREPO_GUIDE.md)             | [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) | Root `turbo.json`                             |
| How apps deploy                | [Deployment Topology](DEPLOYMENT_TOPOLOGY.md)   | App deployment guides                         | `/apps/*/docs/operations/`                    |
| How brain dumps work           | `/apps/web/docs/features/braindump-context/`    | Brain dump processor code                     | `/apps/web/src/lib/services/`                 |
| How calendar sync works        | `/apps/web/docs/features/calendar-integration/` | Calendar service code                         | `/apps/web/src/lib/services/`                 |
| How daily briefs work          | `/apps/worker/docs/features/daily-briefs/`      | Worker daily brief service                    | `/apps/worker/src/services/`                  |
| How notifications work         | `/apps/web/docs/features/notifications/`        | Notification components                       | `/apps/web/src/lib/components/notifications/` |
| How web and worker communicate | [Deployment Topology](DEPLOYMENT_TOPOLOGY.md)   | Queue job types                               | `/packages/shared-types/`                     |
| How homework system works      | `/docs/specs/homework/`                         | Homework agent orchestration                  | `/docs/specs/homework/`                       |
| How tree agent works           | `/docs/specs/tree-agent/`                       | Tree agent LLM orchestration                  | `/docs/specs/tree-agent/`                     |
| Database schema                | `/apps/web/docs/technical/database/`            | Supabase dashboard                            | Supabase migrations                           |

## Development Tasks

### Setting Up Development Environment

| Task                  | Command                    | Documentation                       |
| --------------------- | -------------------------- | ----------------------------------- |
| Install dependencies  | `pnpm install`             | [Monorepo Guide](MONOREPO_GUIDE.md) |
| Start web app         | `pnpm dev --filter=web`    | `/apps/web/docs/`                   |
| Start worker          | `pnpm dev --filter=worker` | `/apps/worker/docs/`                |
| Run all tests         | `pnpm test`                | [Monorepo Guide](MONOREPO_GUIDE.md) |
| Type check everything | `pnpm typecheck`           | [Monorepo Guide](MONOREPO_GUIDE.md) |

### Implementing Features

| I want to...              | Location                      | Steps                                                                                           |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Add a web feature         | `/apps/web/src/`              | 1. Create spec in `/apps/web/docs/features/` 2. Implement 3. Test 4. Document                   |
| Add a background job      | `/apps/worker/src/jobs/`      | 1. Define type in `shared-types` 2. Create handler 3. Document in `/apps/worker/docs/features/` |
| Add shared types          | `/packages/shared-types/src/` | 1. Add type 2. Build package 3. Update apps                                                     |
| Modify database schema    | Supabase migrations           | 1. Create migration 2. Update RLS policies 3. Regenerate types                                  |
| Add an API endpoint (web) | `/apps/web/src/routes/api/`   | 1. Create route 2. Document in `/apps/web/docs/technical/api/`                                  |
| Add a prompt template     | `/apps/web/docs/prompts/`     | 1. Create prompt 2. Add to prompt service 3. Test with LLM                                      |

### Testing

| Task                        | Command                                 | Documentation                                     |
| --------------------------- | --------------------------------------- | ------------------------------------------------- |
| Run web tests               | `cd apps/web && pnpm test`              | `/apps/web/docs/technical/testing/`               |
| Run worker tests            | `cd apps/worker && pnpm test`           | `/apps/worker/docs/README.md`                     |
| Run LLM tests (costs money) | `cd apps/web && pnpm test:llm`          | `/apps/web/docs/technical/testing/llm-testing.md` |
| Test specific file          | `cd apps/web && pnpm test path/to/file` | Vitest documentation                              |
| Run pre-push validation     | `pnpm pre-push`                         | [Monorepo Guide](MONOREPO_GUIDE.md)               |

## Deployment Tasks

### Deploying to Production

| Target              | Guide                                                                          | Checklist                                                 |
| ------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Web to Vercel       | `/apps/web/docs/operations/deployment/VERCEL_CONFIGURATION_GUIDE.md`           | `/apps/web/docs/operations/deployment/READY_TO_DEPLOY.md` |
| Worker to Railway   | `/apps/worker/docs/README.md`                                                  | Railway deployment checklist                              |
| Environment setup   | [Deployment Env Checklist](operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) | Complete environment variables                            |
| Database migrations | Supabase dashboard                                                             | Migration files in Supabase project                       |

### Environment Configuration

| Task                     | File/Location               | Documentation                           |
| ------------------------ | --------------------------- | --------------------------------------- |
| Configure Supabase       | `.env` + Supabase dashboard | `/packages/supabase-client/docs/`       |
| Configure OpenAI API     | `.env` (OPENAI_API_KEY)     | `/apps/web/docs/technical/services/`    |
| Configure Google OAuth   | `.env` + Google Console     | `/apps/web/docs/`                       |
| Configure Stripe         | `.env` + Stripe dashboard   | `/docs/integrations/stripe/setup.md`    |
| Configure Email (Worker) | `.env` (EMAIL\_\* vars)     | `/apps/worker/docs/EMAIL_SETUP.md`      |

## Debugging Tasks

### Troubleshooting Issues

| Issue Type           | Check                   | Location                                                                    |
| -------------------- | ----------------------- | --------------------------------------------------------------------------- |
| Web app broken       | Vercel logs             | `/apps/web/docs/technical/deployment/runbooks/`                             |
| Worker jobs failing  | Railway logs            | `/apps/worker/docs/README.md`                                               |
| Database errors      | Supabase dashboard logs | Supabase dashboard                                                          |
| Build failures       | Clear cache, reinstall  | [Monorepo Guide](MONOREPO_GUIDE.md)                                         |
| Type errors          | Rebuild shared packages | [Monorepo Guide](MONOREPO_GUIDE.md)                                         |
| API errors           | Check error logs        | `/apps/web/docs/technical/api/`                                             |
| Calendar sync issues | Check webhook logs      | `/apps/web/docs/technical/deployment/runbooks/calendar-webhook-failures.md` |
| Payment failures     | Check Stripe dashboard  | `/docs/integrations/stripe/runbooks/webhook-failures.md`                    |

### Performance Debugging

| Issue                 | Check                      | Documentation                                                          |
| --------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Slow page loads       | Vercel analytics           | `/apps/web/docs/technical/deployment/runbooks/performance-issues.md`   |
| Database slow queries | Supabase query performance | `/apps/web/docs/technical/database/indexes.md`                         |
| API rate limiting     | OpenAI usage dashboard     | `/apps/web/docs/technical/deployment/runbooks/openai-rate-limiting.md` |
| Worker job delays     | Queue status in Supabase   | `/apps/worker/docs/README.md`                                          |

## Documentation Tasks

### Updating Documentation

| Task                        | Location                                  | Guidelines                        |
| --------------------------- | ----------------------------------------- | --------------------------------- |
| Document new web feature    | `/apps/web/docs/features/[feature]/`      | Create README.md with overview    |
| Document new worker feature | `/apps/worker/docs/features/[feature]/`   | Create README.md with overview    |
| Update API docs             | `/apps/web/docs/technical/api/endpoints/` | Document request/response schemas |
| Add ADR                     | `/docs/architecture/decisions/`           | Use ADR template                  |
| Update prompt templates     | `/apps/web/docs/prompts/`                 | Document prompt purpose and usage |
| Add runbook                 | `/apps/*/docs/operations/runbooks/`       | Document incident response steps  |

### Finding Documentation

| I'm looking for...  | Location                     | Alternative Search                            |
| ------------------- | ---------------------------- | --------------------------------------------- |
| Web app docs        | `/apps/web/docs/`            | `/apps/web/docs/README.md`                    |
| Worker docs         | `/apps/worker/docs/`         | `/apps/worker/docs/README.md`                 |
| Shared package docs | `/packages/*/docs/`          | Package README.md files                       |
| Deployment guides   | `/**/operations/deployment/` | [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) |
| Business strategy   | `/docs/business/`            | Business README.md                            |
| Marketing materials | `/docs/marketing/`           | Marketing INDEX.md                            |
| Research library    | `/research-library/`         | Research Library README.md                    |

## Quick Reference

### Most Common Commands

```bash
# Development
pnpm dev                      # Start all apps
pnpm dev --filter=web         # Web app only

# Testing
pnpm test                     # All tests
pnpm pre-push                 # Pre-commit validation

# Building
pnpm build                    # Build everything
pnpm build --filter=web       # Web only

# Quality
pnpm typecheck                # Type check all
pnpm lint:fix                 # Auto-fix linting
```

### Most Accessed Documentation

1. [Monorepo Guide](MONOREPO_GUIDE.md) - How to work with the monorepo
2. [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) - System architecture
3. `/apps/web/docs/features/brain-dump/` - Brain dump feature
4. `/apps/web/docs/technical/api/` - API documentation
5. [Deployment Env Checklist](operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) - Environment setup

## Related Documentation

- [Monorepo Guide](MONOREPO_GUIDE.md) - Turborepo workflows
- [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) - System architecture
- `/apps/web/docs/` - Web app documentation
- `/apps/worker/docs/` - Worker service documentation
