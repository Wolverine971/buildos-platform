# View Transition Fix - Deferred Initialization

## Problem Identified

The view transitions were not smooth because the project detail page was performing heavy initialization immediately during the transition:

- Store reset
- Component loading/unloading
- Data fetching (phases, tasks, notes)
- This caused DOM thrashing during the 300-400ms transition period

## Solution

Deferred the heavy initialization until AFTER the view transition completes:

### Key Changes:

1. **Detect Navigation vs Initial Load** (`+page.svelte:107-139`)
    - Track if this is first load (initialize immediately) or navigation (defer)
    - Use `capturedProjectId === null` to detect initial load

2. **Defer Initialization During Navigation** (`+page.svelte:1185-1189`)
    - Skip initialization if `deferInitialization` flag is true
    - Wait ~450ms (view transition duration + buffer) before initializing
    - Use `requestAnimationFrame` + `setTimeout` for precise timing

3. **Show Data Immediately** (`+page.svelte:149-150`)
    - Use fallback: `storeState?.project || capturedProjectData`
    - Project name shows instantly from server data
    - Store data loads after transition completes

## Expected Behavior Now

### Navigation from `/projects` → `/projects/[id]`:

1. User clicks project card
2. View transition starts (project name morphs smoothly)
3. Page navigation happens
4. Project header shows immediately with server data
5. **After 450ms**: Heavy initialization begins
6. Tasks/phases/etc load in background

### Console Logs You'll See:

```
[View Transition] Starting transition from /projects to /projects/[id]
[Page] Capturing new project data: {id} Previous: null
[Page] Navigation detected - deferring initialization for view transition
[Page] Skipping initialization - deferred for view transition
[Page] View transition complete - starting initialization
[Page] Initialization complete for: {id}
```

## Testing Steps

1. **Clear your browser cache** (the deferred initialization might not trigger on cached pages)

2. **Navigate between projects**:

    ```
    /projects → click project → watch transition
    ```

3. **Look for smooth morph**:
    - Project name should glide from card to header
    - No janky jumps or resets
    - Page should fade smoothly

4. **Check console logs**:
    - Should see "Navigation detected - deferring initialization"
    - Should see "View transition complete - starting initialization" after ~450ms

## Timing Breakdown

| Time      | Event                             |
| --------- | --------------------------------- |
| 0ms       | Click project card                |
| 0ms       | View transition starts            |
| 0-300ms   | Smooth morph animation            |
| 300ms     | View transition ends              |
| 300ms     | Page shows with server data       |
| 450ms     | Heavy initialization begins       |
| 500-800ms | Data loaded, UI fully interactive |

## Performance Impact

- **Before**: Initialization during transition = janky
- **After**: Initialization after transition = smooth

The 450ms delay is imperceptible because:

1. User just saw a smooth animation (cognitive processing)
2. Header/title show immediately (perceived instant)
3. Heavy data loads in background

## Browser Compatibility

Still requires View Transitions API support:

- Chrome/Edge 111+
- Safari 18+
- Falls back gracefully in other browsers

## Troubleshooting

### If still janky:

1. Check console - should see "deferred" log
2. Verify timing - might need to increase from 450ms to 600ms
3. Check for other animations interfering
4. Disable browser extensions

### If delayed too much:

1. Reduce timeout from 450ms to 350ms in line 138
2. Balance between smoothness and speed

### If not working at all:

1. Check browser support for View Transitions
2. Clear cache and hard reload
3. Check for JavaScript errors
4. Verify data is loading from server properly
