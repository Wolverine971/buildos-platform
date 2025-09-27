# How to Enable Project Calendars Feature

The Project Calendars feature is behind a feature flag for progressive rollout. Here are the different ways to enable it:

## Method 1: Enable Globally (For All Users)

Edit `src/lib/config/features.ts` and change line 19:

```typescript
case 'projectCalendars':
    return true;  // Enable for everyone
```

## Method 2: Enable via Environment Variable

Add this to your `.env` file:

```bash
VITE_ENABLE_PROJECT_CALENDARS=true
```

Then restart your dev server.

## Method 3: Enable for Specific Users

Edit `src/lib/config/features.ts` and add user IDs to the `enabledUsers` array (around line 29):

```typescript
const enabledUsers = [
	'your-user-id-here', // Add your user ID
	'another-user-id'
	// Add more user IDs as needed
];
```

To find your user ID:

1. Go to your profile page
2. Open browser dev tools
3. Check the network tab or console for your user ID
4. Or check the database: `SELECT id FROM auth.users WHERE email = 'your-email@example.com';`

## Method 4: Enable for Specific Email Domains

You can modify the feature flag to check email domains. This requires passing the user's email to the feature check.

## Testing the Feature

Once enabled, you should see:

1. A "Calendar" button in the project header (between History and Context buttons)
2. Clicking it opens the Calendar Settings modal
3. You can create a dedicated Google Calendar for each project
4. Choose from 11 Google Calendar colors
5. Sync tasks to the project calendar

## Progressive Rollout Strategy

Recommended approach:

1. **Phase 1**: Enable for internal team (specific user IDs)
2. **Phase 2**: Enable for beta users (via email domain or user segment)
3. **Phase 3**: Enable via environment variable for staging
4. **Phase 4**: Enable globally for all users

## Monitoring

After enabling, monitor for:

- Calendar creation success rate
- API quota usage
- User engagement with the feature
- Error rates in calendar sync

## Rollback

To disable the feature:

- Set the feature flag to `return false`
- Or remove the environment variable
- The UI will immediately hide the calendar buttons
- Existing calendars remain in Google Calendar
