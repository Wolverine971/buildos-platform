# Environment Variables Guide

## Overview

This document explains all environment variables used in the BuildOS Platform monorepo, their purposes, and which services require them.

## Variable Flow Diagram

```
┌─────────────────────┐
│   Vercel (Web App)  │
│                     │
│ Uses:               │
│ - PUBLIC_*          │
│ - PRIVATE_*         │
│ - Stripe keys       │
│ - Google OAuth      │
└──────────┬──────────┘
           │
           │ Webhooks & API calls
           │
           ▼
┌─────────────────────┐
│  Railway (Worker)   │
│                     │
│ Uses:               │
│ - SUPABASE_*        │
│ - Queue settings    │
│ - Email config      │
└─────────────────────┘
           │
           │ Both connect to
           │
           ▼
┌─────────────────────┐
│     Supabase DB     │
└─────────────────────┘
```

## Critical Variables by Service

### 🌐 Vercel (Web App)

#### Required

```bash
# Supabase
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
PUBLIC_SUPABASE_PROJECT_ID
PRIVATE_SUPABASE_SERVICE_KEY

# AI (at least one required)
PRIVATE_OPENAI_API_KEY

# Google OAuth
PUBLIC_GOOGLE_CLIENT_ID
PRIVATE_GOOGLE_CLIENT_ID    # Same value as PUBLIC
PRIVATE_GOOGLE_CLIENT_SECRET

# Application
PUBLIC_APP_URL
PUBLIC_RAILWAY_WORKER_URL   # Your Railway worker URL

# Security
PRIVATE_CRON_SECRET
PRIVATE_BUILDOS_WEBHOOK_SECRET

# Email (current implementation)
PRIVATE_DJ_GMAIL_APP_PASSWORD
PRIVATE_ZACH_GMAIL_APP_PASSWORD
```

#### Optional

```bash
# Stripe Payments
ENABLE_STRIPE
STRIPE_SECRET_KEY
PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID

# Additional AI
PRIVATE_ANTHROPIC_API_KEY
PRIVATE_OPENROUTER_API_KEY

# Brief Polling
PUBLIC_BRIEF_POLLING_INTERVAL
PUBLIC_BRIEF_MAX_POLLING_TIME
```

### 🚂 Railway (Worker)

#### Required

```bash
# Supabase (different naming)
SUPABASE_URL                 # Same as PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY    # Same as PRIVATE_SUPABASE_SERVICE_KEY

# Server
PORT=3001
NODE_ENV=production
```

#### Email Configuration (choose one)

**Option 1: Webhook to Main App (Recommended)**

<!-- double check -->

```bash
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://your-app.vercel.app/webhooks/daily-brief-email
BUILDOS_WEBHOOK_SECRET      # Must match PRIVATE_BUILDOS_WEBHOOK_SECRET
```

**Option 2: Direct SMTP**

```bash
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

#### Optional Queue Settings

```bash
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=5
QUEUE_MAX_RETRIES=3
# ... see .env.example for full list
```

## Variable Naming Inconsistencies

### ⚠️ Same Values, Different Names

These pairs must have the **same value** but use different names:

| Web App Variable               | Worker Variable                | Description            |
| ------------------------------ | ------------------------------ | ---------------------- |
| `PUBLIC_SUPABASE_URL`          | `SUPABASE_URL`                 | Supabase project URL   |
| `PRIVATE_SUPABASE_SERVICE_KEY` | `SUPABASE_SERVICE_ROLE_KEY`    | Service role key       |
| `PUBLIC_GOOGLE_CLIENT_ID`      | `PRIVATE_GOOGLE_CLIENT_ID`     | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET`         | `PRIVATE_GOOGLE_CLIENT_SECRET` | Google OAuth secret    |

## Setting Up Variables

### For Local Development

1. Copy `.env.example` to `.env` in the root:

```bash
cp .env.example .env
```

2. Fill in your values:

```bash
# Edit .env with your actual values
```

3. The monorepo will use these for both apps

### For Vercel Deployment

Add these in Vercel dashboard → Settings → Environment Variables:

```bash
# Core (Required)
PUBLIC_SUPABASE_URL=https://xxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
PUBLIC_SUPABASE_PROJECT_ID=xxx
PRIVATE_SUPABASE_SERVICE_KEY=eyJ...
PRIVATE_OPENAI_API_KEY=sk-...

# OAuth
PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
PRIVATE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com  # Same as PUBLIC
PRIVATE_GOOGLE_CLIENT_SECRET=GOCSPX-...

# URLs
PUBLIC_APP_URL=https://your-app.vercel.app
PUBLIC_RAILWAY_WORKER_URL=https://your-worker.railway.app

# Security
PRIVATE_CRON_SECRET=<generate with: openssl rand -hex 32>
PRIVATE_BUILDOS_WEBHOOK_SECRET=<generate with: openssl rand -hex 32>

# Email
PRIVATE_DJ_GMAIL_APP_PASSWORD=<app password>
PRIVATE_ZACH_GMAIL_APP_PASSWORD=<app password>
```

### For Railway Deployment

Add these in Railway dashboard → Variables:

```bash
# Core (Required)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PORT=3001
NODE_ENV=production

# Email via Webhook (Recommended)
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://your-app.vercel.app/webhooks/daily-brief-email
BUILDOS_WEBHOOK_SECRET=<same as PRIVATE_BUILDOS_WEBHOOK_SECRET>

# Queue (Optional - uses defaults if not set)
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=5
```

## Common Issues & Solutions

### Issue: "Module '$env/static/private' has no exported member"

**Cause:** Missing environment variable in Vercel/Railway

**Solution:** Add the missing variable to your deployment environment

### Issue: Worker can't connect to Supabase

**Cause:** Variable naming mismatch

**Solution:** Ensure:

- Worker uses `SUPABASE_URL` (not `PUBLIC_SUPABASE_URL`)
- Worker uses `SUPABASE_SERVICE_ROLE_KEY` (not `PRIVATE_SUPABASE_SERVICE_KEY`)

### Issue: Email sending fails

**Cause:** Email configuration missing or incorrect

**Solution for Web App:**

- Add `PRIVATE_DJ_GMAIL_APP_PASSWORD` and `PRIVATE_ZACH_GMAIL_APP_PASSWORD`
- Or update code to use generic email config

**Solution for Worker:**

- Use webhook method with matching secrets
- Or configure Gmail SMTP directly

### Issue: OAuth login fails

**Cause:** Google client ID mismatch

**Solution:** Ensure both `PUBLIC_GOOGLE_CLIENT_ID` and `PRIVATE_GOOGLE_CLIENT_ID` have the same value

## Generating Secure Secrets

### For webhook secrets and cron secrets:

```bash
# Generate a secure random secret
openssl rand -hex 32
```

### For Gmail app passwords:

1. Go to https://myaccount.google.com/security
2. Enable 2-factor authentication
3. Go to "App passwords"
4. Generate a new app password for "Mail"

## Environment-Specific Configurations

### Development

```env
NODE_ENV=development
PUBLIC_APP_URL=http://localhost:5173
PUBLIC_RAILWAY_WORKER_URL=http://localhost:3001
ENABLE_STRIPE=false
QUEUE_POLL_INTERVAL=2000
QUEUE_BATCH_SIZE=2
```

### Staging

```env
NODE_ENV=staging
PUBLIC_APP_URL=https://staging-buildos.vercel.app
PUBLIC_RAILWAY_WORKER_URL=https://staging-worker.railway.app
ENABLE_STRIPE=false
QUEUE_POLL_INTERVAL=3000
QUEUE_BATCH_SIZE=5
```

### Production

```env
NODE_ENV=production
PUBLIC_APP_URL=https://buildos.app
PUBLIC_RAILWAY_WORKER_URL=https://buildos-worker.railway.app
ENABLE_STRIPE=true
QUEUE_POLL_INTERVAL=5000
QUEUE_BATCH_SIZE=10
```

## Validation Script

To validate your environment variables are set correctly, run:

```bash
# From root directory
node scripts/validate-env.js
```

This will check for:

- Required variables presence
- Variable format validation
- Cross-service consistency
- URL format correctness

---

Last Updated: 2025-09-27
