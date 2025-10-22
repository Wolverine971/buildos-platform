# Operations & Deployment Documentation

This directory contains deployment procedures, operational guides, and runbooks for the BuildOS web application deployment to Vercel.

## 📚 Key Documents

### Deployment Configuration

- **[deployment/VERCEL_CONFIGURATION_GUIDE.md](deployment/VERCEL_CONFIGURATION_GUIDE.md)** - Complete Vercel setup and configuration
- **[deployment/READY_TO_DEPLOY.md](deployment/READY_TO_DEPLOY.md)** - Pre-deployment readiness verification
- **[deployment/VERCEL_DEPLOYMENT_FIX.md](deployment/VERCEL_DEPLOYMENT_FIX.md)** - Troubleshooting deployment issues

## 📂 Directory Structure

```
/operations/
├── README.md (this file)
└── /deployment/
    ├── VERCEL_CONFIGURATION_GUIDE.md
    ├── READY_TO_DEPLOY.md
    └── VERCEL_DEPLOYMENT_FIX.md
```

## 🚀 Deployment Workflow

### Before Deploying

1. **Verify Readiness**: Follow [READY_TO_DEPLOY.md](deployment/READY_TO_DEPLOY.md)
    - All tests passing
    - No type errors
    - Code reviewed
    - Performance acceptable

2. **Review Configuration**: Check [VERCEL_CONFIGURATION_GUIDE.md](deployment/VERCEL_CONFIGURATION_GUIDE.md)
    - Environment variables set
    - Build settings correct
    - Deployment target verified

3. **Prepare Deployment**:
    - Create deployment branch
    - Tag release
    - Notify team

### Deploying

1. Push to deployment branch (usually `main` for Vercel auto-deploy)
2. Vercel automatically triggers build
3. Monitor build logs
4. Verify deployment succeeds

### After Deployment

1. Run smoke tests
2. Check error logs
3. Verify key features working
4. Monitor metrics

## ⚠️ Troubleshooting

If deployment fails:

1. Check [VERCEL_DEPLOYMENT_FIX.md](deployment/VERCEL_DEPLOYMENT_FIX.md)
2. Review build logs in Vercel dashboard
3. Check environment variables
4. Verify dependencies installed correctly

## 🔗 Related Documentation

- **Deployment Topology**: `/docs/DEPLOYMENT_TOPOLOGY.md` - System-wide deployment architecture
- **Environment Variables**: `/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md` - Complete env setup
- **Build Process**: `/apps/web/docs/technical/deployment/BUILD.md`
- **Deployment Checklist**: `/apps/web/docs/technical/deployment/DEPLOYMENT_CHECKLIST.md`
- **Runbooks**: `/apps/web/docs/technical/deployment/runbooks/` - Common issues and solutions

## 📋 Operations Checklist

### Pre-Deployment

- [ ] All tests passing (`pnpm test`)
- [ ] No type errors (`pnpm typecheck`)
- [ ] Linting clean (`pnpm lint`)
- [ ] Build succeeds locally (`pnpm build`)
- [ ] Environment variables set
- [ ] Code reviewed and approved
- [ ] Feature flags set correctly

### Deployment

- [ ] Deploy to staging (if applicable)
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Monitor error logs
- [ ] Verify key features working
- [ ] Check performance metrics

### Post-Deployment

- [ ] Monitor error rates
- [ ] Check user feedback
- [ ] Verify analytics data
- [ ] Plan rollback if needed
- [ ] Document any issues

## 🔧 Key Configuration Files

The following files control Vercel deployment:

| File                  | Location     | Purpose                       |
| --------------------- | ------------ | ----------------------------- |
| `vercel.json`         | Project root | Vercel build configuration    |
| `.env.example`        | Project root | Environment variable template |
| `pnpm-workspace.yaml` | Project root | Monorepo configuration        |

## 📝 Notes

- Vercel auto-deploys from `main` branch
- Environment variables managed in Vercel dashboard
- Build command: `pnpm turbo build --filter=@buildos/web`
- Output directory: `apps/web/.svelte-kit`
- All deployments run full test suite first

---

**Last Updated**: October 20, 2025
**See Also**: [Technical Deployment](../technical/deployment/) | [Environment Setup](/docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md)
