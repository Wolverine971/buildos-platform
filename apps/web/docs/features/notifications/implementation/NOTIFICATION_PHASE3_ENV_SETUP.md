# Notification System Phase 3 - Environment Setup

## Required Environment Variables

### Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for browser push notifications.

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys
```

This will output something like:

```
=======================================

Public Key:
BN4GvR_recSC...your_public_key_here...

Private Key:
p_vML5O...your_private_key_here...

=======================================
```

### Step 2: Configure Web App (`apps/web/.env`)

Add the **public key** to your web app environment:

```bash
# Push Notification Configuration (Web Push VAPID Keys)
PUBLIC_VAPID_PUBLIC_KEY=BN4GvR_recSC...your_public_key_here...
```

### Step 3: Configure Worker (`apps/worker/.env`)

Add **both keys** to your worker environment:

```bash
# Push Notification Configuration
VAPID_PUBLIC_KEY=BN4GvR_recSC...your_public_key_here...
VAPID_PRIVATE_KEY=p_vML5O...your_private_key_here...
VAPID_SUBJECT=mailto:support@buildos.com
```

**IMPORTANT:** The `VAPID_PUBLIC_KEY` in the worker MUST match the `PUBLIC_VAPID_PUBLIC_KEY` in the web app.

---

## No Additional Environment Variables Needed

The notification system leverages existing infrastructure:

✅ **Supabase** - Already configured (PUBLIC_SUPABASE_URL, etc.)
✅ **Email** - Uses existing email infrastructure (no new vars)
✅ **Worker** - Uses existing queue system (no new vars)

The only new requirement is the VAPID keys for browser push notifications.

---

## Optional: Disable Push Notifications

If you don't want to support browser push notifications, you can skip the VAPID setup. The system will still work for:

- ✅ Email notifications
- ✅ In-app notifications

Push notifications will simply fail gracefully with a warning in the logs.

---

## Deployment Checklist

- [ ] Generate VAPID keys with `npx web-push generate-vapid-keys`
- [ ] Add `PUBLIC_VAPID_PUBLIC_KEY` to `apps/web/.env`
- [ ] Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to `apps/worker/.env`
- [ ] Verify public keys match in both environments
- [ ] Run Phase 3 migration: `cd apps/web && npx supabase db push`
- [ ] Restart both web and worker services
- [ ] Test browser push subscription (visit `/profile?tab=notifications`)

---

## Verification

### Test VAPID Configuration

**Web App:**

```javascript
// In browser console at /profile?tab=notifications
console.log(import.meta.env.PUBLIC_VAPID_PUBLIC_KEY);
// Should output: "BN4GvR_recSC..."
```

**Worker:**

```bash
# Check worker logs on startup
# Should NOT see: "[NotificationWorker] VAPID keys not configured"
```

### Test Push Subscription

1. Visit `/profile?tab=notifications`
2. Enable push notifications (you'll be prompted for permission)
3. Check browser console for errors
4. Verify subscription in database:
    ```sql
    SELECT * FROM push_subscriptions
    WHERE user_id = 'your-user-id'
    AND is_active = true;
    ```

---

## Troubleshooting

### "VAPID keys not configured" error

- Check that `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set in worker environment
- Restart worker service after adding environment variables

### "VAPID public key not configured" error in browser

- Check that `PUBLIC_VAPID_PUBLIC_KEY` is set in web app environment
- Rebuild web app: `cd apps/web && pnpm build`
- Restart dev server

### Push notifications not working

1. Verify VAPID keys match:

    ```bash
    # Web app
    echo $PUBLIC_VAPID_PUBLIC_KEY

    # Worker
    echo $VAPID_PUBLIC_KEY
    ```

2. Check browser permissions:
    - Browser Settings → Privacy → Notifications
    - Ensure your site has notification permission

3. Check service worker registration:
    ```javascript
    // In browser console
    navigator.serviceWorker.ready.then((reg) => console.log('SW ready:', reg));
    ```

---

## Security Notes

- ✅ VAPID private key should **never** be exposed to the client
- ✅ VAPID public key is safe to expose (it's in the browser anyway)
- ✅ Keep your `.env` files out of version control (already in `.gitignore`)
- ✅ Use different VAPID keys for development and production
- ✅ Store production keys securely (e.g., Vercel/Railway environment variables)

---

## Production Deployment

### Vercel (Web App)

Add environment variable in Vercel dashboard:

```
PUBLIC_VAPID_PUBLIC_KEY=BN4GvR_recSC...
```

### Railway (Worker)

Add environment variables in Railway dashboard:

```
VAPID_PUBLIC_KEY=BN4GvR_recSC...
VAPID_PRIVATE_KEY=p_vML5O...
VAPID_SUBJECT=mailto:support@buildos.com
```

**Redeploy both services after adding environment variables.**

---

## Summary

The notification system requires minimal environment setup:

1. **Generate VAPID keys** (one-time setup)
2. **Add to environments** (web + worker)
3. **Deploy** (both services)

No other environment variables are needed - the system reuses existing infrastructure for email, database, and queue management.
