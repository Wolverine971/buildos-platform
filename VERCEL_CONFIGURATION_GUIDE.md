# Vercel Configuration Guide for BuildOS Platform

## 🚨 CRITICAL ISSUE IDENTIFIED

You have **duplicate vercel.json files** which is causing deployment issues:

- `/vercel.json` (root)
- `/apps/web/vercel.json`

**This causes path confusion and deployment hanging!**

## ✅ CORRECT CONFIGURATION

### Step 1: Fix vercel.json Files

**DELETE** the `/apps/web/vercel.json` file - you only need ONE at the root!

The root `/vercel.json` should remain exactly as is:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm turbo build --filter=@buildos/web",
  "outputDirectory": "apps/web/.vercel/output",
  "framework": "sveltekit",
  "ignoreCommand": "git diff HEAD^ HEAD --quiet -- packages/ apps/web/ turbo.json package.json pnpm-lock.yaml",
  "crons": [...],
  "headers": [...]
}
```

### Step 2: Vercel Dashboard Settings

Go to your Vercel project dashboard → **Settings** → **General**

#### 2.1 Framework Preset

- **Framework Preset**: SvelteKit (v0) ✅ (Already correct in your screenshot)

#### 2.2 Root Directory

- **Root Directory**: Leave EMPTY or use `./`
- **DO NOT** set to `apps/web`

#### 2.3 Build & Development Settings

You have two options:

**OPTION A: Disable All Overrides (RECOMMENDED)**

- Turn OFF the "Override" toggle for:
  - Build Command
  - Output Directory
  - Install Command
  - Development Command
- This will use your `vercel.json` settings automatically

**OPTION B: If Overrides Are Enabled, Set:**

```
Build Command: pnpm turbo build --filter=@buildos/web
Output Directory: apps/web/.vercel/output
Install Command: pnpm install --frozen-lockfile
Development Command: vite dev
```

⚠️ **CRITICAL**: Output Directory MUST be `apps/web/.vercel/output` (NOT `.svelte-kit`)

### Step 3: Environment Variables

Ensure all required environment variables are set in Vercel dashboard.

### Step 4: Node Version

- **Node.js Version**: 20.x or 22.x (you're using nodejs22.x in adapter config)

## 🔍 VERIFICATION CHECKLIST

Before redeploying, verify:

1. ❌ **DELETE** `/apps/web/vercel.json` - Only keep root vercel.json
2. ✅ Root Directory is empty or `./` in Vercel dashboard
3. ✅ Output Directory is `apps/web/.vercel/output` (if overriding)
4. ✅ Build Command uses `--filter=@buildos/web` (if overriding)
5. ✅ Install Command uses `pnpm install --frozen-lockfile`

## 📁 EXPECTED BUILD OUTPUT STRUCTURE

After build completes, files should be in:

```
/apps/web/.vercel/output/
├── config.json         # Vercel deployment config
├── functions/          # Server-side functions
│   └── *.func/
└── static/            # Static assets
    └── _app/
```

## 🚀 HOW TO REDEPLOY

1. **Delete** `/apps/web/vercel.json` file
2. **Commit** the deletion
3. **Push** to your repository
4. Go to Vercel dashboard
5. Either:
   - Wait for automatic deployment from git push
   - Or manually redeploy from Deployments tab

## 🎯 WHY YOUR DEPLOYMENT IS HANGING

The deployment hangs because:

1. **Duplicate vercel.json files** create conflicting configurations
2. **Output directory mismatch**: Build creates files in `apps/web/.vercel/output` but Vercel might be looking elsewhere
3. **Path resolution confusion**: Two vercel.json files cause Vercel to misinterpret relative paths

## 🛠️ TROUBLESHOOTING

### If deployment still hangs after fixing:

1. Clear Vercel build cache: Settings → Advanced → Clear Build Cache
2. Check build logs for "Build Completed in /vercel/output" message
3. Ensure NO override is set or correct override values are used
4. Make sure only ONE vercel.json exists at root

### Build succeeds but site shows 404:

- Output Directory setting is wrong
- Check if override toggles are causing issues
- Verify `apps/web/.vercel/output` path is correct

### Common Mistakes to Avoid:

- ❌ Having vercel.json in both root AND apps/web
- ❌ Setting Root Directory to `apps/web`
- ❌ Using `.svelte-kit` as Output Directory
- ❌ Using absolute paths like `/vercel/output`
- ❌ Mixing settings between vercel.json and dashboard overrides

## 📚 UNDERSTANDING THE ARCHITECTURE

Your setup is a **Turborepo monorepo** with:

- Root `vercel.json` controls the deployment
- SvelteKit app in `apps/web/`
- Adapter-vercel outputs to `.vercel/output/` (relative to app)
- Full path from root: `apps/web/.vercel/output/`

The SvelteKit adapter-vercel v5+ changed from outputting to `.svelte-kit` to `.vercel/output` for better Vercel compatibility.

## ✨ FINAL NOTES

- You only need ONE vercel.json at the repository root
- Let Turborepo handle the monorepo complexity
- The adapter knows where to output files
- Trust the configuration in vercel.json over dashboard overrides
- trying

---

Generated: 2025-09-27
Issue: Deployment hanging after successful build
Solution: Remove duplicate vercel.json, fix output directory path
