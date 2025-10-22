# Deployment Configuration for Monorepo

This document outlines how to configure deployments for the BuildOS Platform monorepo on Vercel (web app) and Railway (worker).

## 📦 Deployment Architecture

```
buildos-platform/
├── apps/
│   ├── web/     → Deploys to Vercel
│   └── worker/  → Deploys to Railway
└── packages/    → Built during deployment, not deployed directly
```

## 🚀 Vercel Configuration (Web App)

### Initial Setup

1. **Import repository** in Vercel dashboard
2. **Set Framework Preset** to `SvelteKit`
3. **Configure Root Directory** to repository root (not `apps/web`)

### Build & Output Settings

```json
{
	"buildCommand": "pnpm turbo build --filter=@buildos/web",
	"outputDirectory": "apps/web/.svelte-kit",
	"installCommand": "pnpm install --frozen-lockfile"
}
```

### Environment Variables

Add all variables from `apps/web/.env.example`:

```bash
# Public variables (available in browser)
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
PUBLIC_GOOGLE_CLIENT_ID=
PUBLIC_STRIPE_PUBLISHABLE_KEY=
PUBLIC_APP_URL=

# Private variables (server-only)
PRIVATE_SUPABASE_SERVICE_KEY=
GOOGLE_CLIENT_SECRET=
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ENABLE_STRIPE=true
```

### vercel.json (in apps/web/)

```json
{
	"$schema": "https://openapi.vercel.sh/vercel.json",
	"framework": "sveltekit",
	"buildCommand": "cd ../.. && pnpm turbo build --filter=@buildos/web",
	"installCommand": "cd ../.. && pnpm install --frozen-lockfile",
	"outputDirectory": ".svelte-kit"
}
```

### Turbo Remote Caching (Optional)

```bash
# In Vercel environment variables
TURBO_TOKEN=your-turbo-token
TURBO_TEAM=your-team
```

## 🚂 Railway Configuration (Worker)

### Initial Setup

1. **Create new project** in Railway
2. **Connect GitHub repository**
3. **Set Root Directory** to repository root

### Build Configuration

In Railway settings or `railway.toml`:

```toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install --frozen-lockfile && pnpm turbo build --filter=@buildos/worker"
watchPatterns = ["apps/worker/**", "packages/**"]

[deploy]
startCommand = "cd apps/worker && node dist/index.js"
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 3
healthcheckPath = "/health"
healthcheckTimeout = 30

[variables]
NODE_ENV = "production"
PORT = "${{PORT}}"
```

### Environment Variables

```bash
# Supabase
PUBLIC_SUPABASE_URL=
PRIVATE_SUPABASE_SERVICE_KEY=

# Email Configuration
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Queue Configuration
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=5
QUEUE_MAX_RETRIES=3

# Worker Configuration
PORT=3001
NODE_ENV=production
```

### Nixpacks Configuration (optional)

Create `nixpacks.toml` in `apps/worker/`:

```toml
[phases.setup]
nixPkgs = ["nodejs-18_x", "pnpm"]

[phases.install]
cmds = ["cd ../.. && pnpm install --frozen-lockfile"]

[phases.build]
cmds = ["cd ../.. && pnpm turbo build --filter=@buildos/worker"]

[start]
cmd = "node dist/index.js"
```

## 🔄 GitHub Actions CI/CD

### .github/workflows/deploy.yml

```yaml
name: Deploy

on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

jobs:
    build-and-test:
        runs-on: ubuntu-latest

        steps:
            - uses: actions/checkout@v3

            - uses: pnpm/action-setup@v2
              with:
                  version: 9

            - uses: actions/setup-node@v3
              with:
                  node-version: '20'
                  cache: 'pnpm'

            - name: Install dependencies
              run: pnpm install --frozen-lockfile

            - name: Build packages
              run: pnpm turbo build

            - name: Run tests
              run: pnpm turbo test

            - name: Type check
              run: pnpm turbo typecheck

    deploy-web:
        needs: build-and-test
        runs-on: ubuntu-latest
        if: github.ref == 'refs/heads/main'

        steps:
            - name: Deploy to Vercel
              env:
                  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
              run: |
                  npx vercel --prod --token=$VERCEL_TOKEN

    deploy-worker:
        needs: build-and-test
        runs-on: ubuntu-latest
        if: github.ref == 'refs/heads/main'

        steps:
            - name: Deploy to Railway
              env:
                  RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
              run: |
                  npm install -g @railway/cli
                  railway up
```

## 🔍 Monitoring Deployments

### Vercel

- **Build Logs**: Available in Vercel dashboard
- **Function Logs**: Real-time logs for API routes
- **Analytics**: Built-in Web Vitals tracking
- **Alerts**: Set up for failed deployments

### Railway

- **Logs**: Available in Railway dashboard
- **Metrics**: CPU, Memory, Network usage
- **Health Checks**: Configure at `/health` endpoint
- **Alerts**: Set up for crashes and high resource usage

## 🚨 Rollback Procedures

### Vercel

```bash
# List deployments
vercel ls

# Rollback to specific deployment
vercel rollback [deployment-url]

# Or use dashboard UI for instant rollback
```

### Railway

```bash
# Via CLI
railway rollback

# Or use dashboard to redeploy previous version
```

## 🎯 Deployment Checklist

### Before Deploying

- [ ] All tests passing locally
- [ ] Environment variables documented
- [ ] Database migrations prepared
- [ ] Dependencies up to date
- [ ] Build succeeds locally

### After Deploying

- [ ] Health checks passing
- [ ] No errors in logs
- [ ] Core functionality working
- [ ] Performance metrics normal
- [ ] SSL certificates valid

## 📝 Environment-Specific Configurations

### Development

```bash
# apps/web/.env.development
PUBLIC_APP_URL=http://localhost:5173
NODE_ENV=development
```

### Staging

```bash
# apps/web/.env.staging
PUBLIC_APP_URL=https://staging.buildos.app
NODE_ENV=staging
```

### Production

```bash
# apps/web/.env.production
PUBLIC_APP_URL=https://buildos.app
NODE_ENV=production
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Build fails on Vercel

```bash
# Check build command
pnpm turbo build --filter=@buildos/web --log-level=verbose

# Ensure all dependencies are in package.json
pnpm install --frozen-lockfile
```

#### 2. Worker not starting on Railway

```bash
# Check start command
cd apps/worker && node dist/index.js

# Verify build output exists
ls -la apps/worker/dist/
```

#### 3. Shared packages not found

```bash
# Build shared packages first
pnpm turbo build --filter="@buildos/shared-*"

# Check workspace configuration
pnpm ls --depth=0
```

## 🔗 Useful Links

- [Vercel Monorepo Guide](https://vercel.com/docs/monorepos)
- [Railway Monorepo Support](https://docs.railway.app/guides/monorepos)
- [Turborepo Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [pnpm Workspaces](https://pnpm.io/workspaces)

---

Last Updated: 2025-09-27
