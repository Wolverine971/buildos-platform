# SvelteKit Environment Variable Conventions

**Date:** 2025-10-01
**Context:** BuildOS Platform - Notification System Implementation

---

## Critical: Always Use SvelteKit's Static Imports

### ✅ CORRECT Pattern

```typescript
// Import from SvelteKit's static environment module
import { PUBLIC_USE_NEW_NOTIFICATIONS } from "$env/static/public";

// Use the imported constant
const isEnabled = PUBLIC_USE_NEW_NOTIFICATIONS === "true";

// Can be used anywhere in the file
if (isEnabled) {
  // ... feature code
}
```

### ❌ WRONG Pattern (Do Not Use)

```typescript
// ❌ Don't use import.meta.env directly
const flag = import.meta.env.PUBLIC_USE_NEW_NOTIFICATIONS;

// ❌ Don't use process.env
const flag = process.env.PUBLIC_USE_NEW_NOTIFICATIONS;
```

---

## Why This Matters

### 1. **Static Analysis at Build Time**

SvelteKit statically analyzes imports from `$env/static/public` during build:

```typescript
// SvelteKit replaces this at build time:
import { PUBLIC_API_URL } from "$env/static/public";
// Becomes:
const PUBLIC_API_URL = "https://api.example.com";
```

This means:

- ✅ Better performance (no runtime lookup)
- ✅ Type safety (TypeScript knows the value)
- ✅ Tree-shaking works correctly
- ✅ No runtime errors from missing env vars

### 2. **Type Safety**

```typescript
// TypeScript knows these exist at compile time
import {
  PUBLIC_USE_NEW_NOTIFICATIONS,
  PUBLIC_SUPABASE_URL,
  PUBLIC_STRIPE_KEY,
} from "$env/static/public";

// TypeScript will error if you typo the name:
// import { PUBLIC_USE_NEW_NOTIFICATINOS } from '$env/static/public';
//                                       ^ Error: not exported
```

### 3. **Consistency Across Codebase**

All BuildOS code should follow this pattern:

```typescript
// ✅ Layout component
import { PUBLIC_USE_NEW_NOTIFICATIONS } from "$env/static/public";

// ✅ Bridge service
import { PUBLIC_USE_NEW_NOTIFICATIONS } from "$env/static/public";

// ✅ Any other file
import { PUBLIC_USE_NEW_NOTIFICATIONS } from "$env/static/public";
```

---

## SvelteKit Environment Modules

### Public (Client-Side) Variables

```typescript
// $env/static/public - Public variables (exposed to client)
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_GOOGLE_CLIENT_ID,
} from "$env/static/public";

// Must start with PUBLIC_ prefix
// Available in browser
// Baked into client bundle at build time
```

### Private (Server-Side) Variables

```typescript
// $env/static/private - Private variables (server-only)
import { OPENAI_API_KEY, STRIPE_SECRET_KEY } from "$env/static/private";

// No PUBLIC_ prefix
// Only available in server code (+page.server.ts, +server.ts, hooks.server.ts)
// Never exposed to client
```

### Dynamic Variables (Runtime)

```typescript
// $env/dynamic/public - Dynamic public variables
import { env } from "$env/dynamic/public";
const url = env.PUBLIC_API_URL;

// $env/dynamic/private - Dynamic private variables
import { env } from "$env/dynamic/private";
const key = env.OPENAI_API_KEY;

// Use dynamic imports only when:
// - You need runtime lookups
// - Working with user-provided env names
// - Most cases should use static imports
```

---

## Configuration File (.env)

### Format

```bash
# Public variables (exposed to client)
PUBLIC_USE_NEW_NOTIFICATIONS=true
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_GOOGLE_CLIENT_ID=your-client-id

# Private variables (server-only)
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_test_...
PRIVATE_SUPABASE_SERVICE_KEY=eyJ...
```

### Loading Order

1. `.env` - Default values (committed to git)
2. `.env.local` - Local overrides (gitignored)
3. Environment variables - Production/deployment overrides

---

## Common Patterns in BuildOS

### Feature Flags

```typescript
// Always use static imports for feature flags
import { PUBLIC_USE_NEW_NOTIFICATIONS } from "$env/static/public";

const USE_NEW_NOTIFICATION_SYSTEM = PUBLIC_USE_NEW_NOTIFICATIONS === "true";

if (USE_NEW_NOTIFICATION_SYSTEM) {
  // New system
} else {
  // Legacy system
}
```

### API Configuration

```typescript
// Public API URLs
import { PUBLIC_SUPABASE_URL, PUBLIC_STRIPE_KEY } from "$env/static/public";

// Server-side API keys
import { OPENAI_API_KEY } from "$env/static/private";
```

### Conditional Initialization

```typescript
import { PUBLIC_ENABLE_ANALYTICS } from "$env/static/public";

onMount(() => {
  if (PUBLIC_ENABLE_ANALYTICS === "true") {
    initializeAnalytics();
  }
});
```

---

## Troubleshooting

### Problem: "Cannot find module '$env/static/public'"

**Cause:** Using wrong import path or file not in SvelteKit app directory

**Solution:**

```typescript
// ✅ Correct
import { PUBLIC_VAR } from "$env/static/public";

// ❌ Wrong
import { PUBLIC_VAR } from "@env/static/public";
import { PUBLIC_VAR } from "$env/public";
```

### Problem: "Variable is undefined at runtime"

**Cause:** Variable not in .env file or missing PUBLIC\_ prefix

**Solution:**

```bash
# Add to .env or .env.local with PUBLIC_ prefix
PUBLIC_MY_VARIABLE=value
```

### Problem: "Type error: Module has no exported member"

**Cause:** Variable doesn't exist in environment files

**Solution:**

1. Add variable to `.env` or `.env.local`
2. Restart dev server (`pnpm dev`)
3. SvelteKit regenerates type definitions

---

## Best Practices

### ✅ DO

- Use `$env/static/public` for client-side env vars
- Use `$env/static/private` for server-side secrets
- Prefix client-side vars with `PUBLIC_`
- Import at the top of the file
- Use boolean checks: `=== 'true'` or `=== 'false'`

### ❌ DON'T

- Use `import.meta.env` (Vite-specific, bypasses SvelteKit)
- Use `process.env` (Node-specific, doesn't work in browser)
- Forget the `PUBLIC_` prefix for client vars
- Use dynamic imports unless truly necessary
- Store secrets in `PUBLIC_` variables

---

## Migration Guide

### From Vite/Vanilla JS

```typescript
// Before (Vite)
const apiUrl = import.meta.env.VITE_API_URL;

// After (SvelteKit)
import { PUBLIC_API_URL } from "$env/static/public";
const apiUrl = PUBLIC_API_URL;
```

### From Next.js

```typescript
// Before (Next.js)
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// After (SvelteKit)
import { PUBLIC_API_URL } from "$env/static/public";
const apiUrl = PUBLIC_API_URL;
```

### From Create React App

```typescript
// Before (CRA)
const apiUrl = process.env.REACT_APP_API_URL;

// After (SvelteKit)
import { PUBLIC_API_URL } from "$env/static/public";
const apiUrl = PUBLIC_API_URL;
```

---

## References

- **SvelteKit Docs:** https://kit.svelte.dev/docs/modules#$env-static-public
- **BuildOS .env.example:** `apps/web/.env.example`
- **This Project:** Phase 2 Notification System implementation

---

## Quick Reference Card

```typescript
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SVELTEKIT ENVIRONMENT VARIABLES - QUICK REFERENCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ✅ Client-side (public) - Use this 99% of the time
import { PUBLIC_VAR_NAME } from "$env/static/public";

// ✅ Server-side (private) - Use for secrets
import { SECRET_KEY } from "$env/static/private";

// ⚠️ Dynamic (rarely needed) - Runtime lookups
import { env } from "$env/dynamic/public";
const val = env.PUBLIC_VAR_NAME;

// ❌ Never use these in SvelteKit
const bad1 = import.meta.env.VAR_NAME; // ❌ Wrong
const bad2 = process.env.VAR_NAME; // ❌ Wrong

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
