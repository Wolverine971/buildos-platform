<!-- apps/web/docs/technical/components/brain-dump/BRAIN_DUMP_AUTO_ACCEPT_SIMPLE.md -->

# Brain Dump Auto-Accept Feature (Simplified)

## Overview

A simple auto-accept feature for brain dumps that allows users to automatically apply parsed operations without manual verification. The preference is stored in browser local storage for simplicity.

## Implementation Date

September 9, 2025

## How It Works

### User Flow

1. User parses a brain dump normally
2. In the verification modal (ParseResultsDiffView), there's a checkbox: **"Auto-accept next time"**
3. If checked, the preference is saved to local storage
4. Next time, if auto-accept is enabled and conditions are met, operations are automatically applied

### Auto-Accept Conditions

- Auto-accept is enabled in local storage
- No operations have errors
- Operation count ≤ 20 (safety limit)

If any condition fails, normal verification UI is shown with an explanation.

## Components

### 1. Local Storage Store

**File**: `src/lib/stores/brainDumpPreferences.ts`

- Simple boolean preference stored in local storage
- Key: `brain-dump-auto-accept`
- Methods:
    - `enable()`: Turn on auto-accept
    - `disable()`: Turn off auto-accept
    - `toggle()`: Switch state
    - `shouldAutoAccept()`: Check if should auto-accept

### 2. BrainDumpModal Integration

**File**: `src/lib/components/brain-dump/BrainDumpModal.svelte`

- `checkAndHandleAutoAccept()` function checks conditions
- If auto-accept enabled and safe, applies operations automatically
- Shows toast notification when auto-accepting
- Falls back to manual review if needed

### 3. ParseResultsDiffView Toggle

**File**: `src/lib/components/brain-dump/ParseResultsDiffView.svelte`

- Checkbox in footer: "Auto-accept next time"
- Directly toggles local storage preference
- Visible during every verification

## Technical Details

### Local Storage

```javascript
// Storage key
const STORAGE_KEY = 'brain-dump-auto-accept';

// Check if enabled
const enabled = localStorage.getItem(STORAGE_KEY) === 'true';

// Enable
localStorage.setItem(STORAGE_KEY, 'true');

// Disable
localStorage.setItem(STORAGE_KEY, 'false');
```

### Safety Limits

- Maximum 20 operations for auto-accept
- No operations with errors
- Clear user notifications

### UI Elements

- Checkbox in ParseResultsDiffView footer
- Toast notifications for auto-accept actions
- Warning messages when auto-accept is skipped

## Benefits

### Simplicity

- No database tables or migrations
- No API endpoints
- No backend changes
- User preference persists per browser/device

### Speed

- Instant preference changes
- No network requests
- Minimal code footprint

### User Control

- Easy to enable/disable
- Visible toggle in verification UI
- Clear feedback on auto-accept behavior

## Testing

1. **Enable Auto-Accept**:
    - Parse a brain dump
    - Check "Auto-accept next time" in verification modal
    - Apply changes

2. **Test Auto-Accept**:
    - Create another brain dump
    - Parse it
    - Should auto-apply if conditions met
    - Should show manual review if conditions fail

3. **Disable Auto-Accept**:
    - Uncheck the checkbox in verification modal
    - Next parse should require manual review

## Future Enhancements

- Add operation type filtering (only auto-accept creates)
- Add project-specific preferences
- Add confidence scoring
- Add undo mechanism
- Sync preference across devices (would require backend)

## Rollback

If issues occur:

1. Users can uncheck the auto-accept checkbox
2. Clear local storage: `localStorage.removeItem('brain-dump-auto-accept')`
3. Feature automatically disabled on errors
