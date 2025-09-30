# View Transition Testing Guide

## What Was Changed

1. **Removed interfering animations**: The pulse animation on project cards was removed as it interferes with view transitions
2. **Added view-transition-name**: Project names now have unique view-transition-name based on project ID
3. **Enabled View Transitions API**: Added `onNavigate` hook in layout to use `document.startViewTransition`
4. **Added custom animations**: Smooth fade and morph animations for project names

## How to Test

### Prerequisites

- **Browser Support**: View Transitions API is currently supported in:
    - Chrome/Edge 111+
    - Opera 97+
    - Safari 18+ (check your version)
    - Firefox: Not yet supported (as of Jan 2025)

### Testing Steps

1. **Open Browser Console**
    - Press F12 or Cmd+Option+I
    - Look for console logs like:
        - `[View Transition] Starting transition from...`
        - If you see `[View Transition] Not supported in this browser`, your browser doesn't support the API yet

2. **Navigate Between Pages**
    - Go to `/projects` page
    - Click on any project card
    - Watch the project name - it should smoothly morph from the card to the header

3. **What to Look For**
    - **Smooth morph**: The project name should appear to move from the card position to the header position
    - **Fade effect**: The page should fade out and in smoothly
    - **No flicker**: There shouldn't be any sudden jumps or flashes

### Browser Compatibility Check

Run this in browser console:

```javascript
console.log('View Transitions supported:', !!document.startViewTransition);
```

If it returns `false`, your browser doesn't support view transitions yet.

### Debugging

1. **Check CSS is applied**:
    - Open DevTools
    - Inspect a project name element
    - It should have `data-project-name` attribute
    - It should have `style="--project-name: project-name-{id}"`

2. **Check View Transition in DevTools**:
    - In Chrome DevTools, go to Rendering panel (Cmd+Shift+P > "Show Rendering")
    - Enable "View Transitions" debugging
    - You'll see transition snapshots and timing

3. **Verify No Conflicts**:
    - The project cards should NOT have opacity changes during click
    - Navigation should happen immediately via `<a>` tag, not JavaScript

## Expected Behavior

- **From Projects List → Project Detail**: Project name should smoothly morph from card to header
- **From Project Detail → Projects List**: Project name should morph back to card position
- **Other navigations**: Should have a subtle cross-fade
- **Reduced motion**: Users with `prefers-reduced-motion: reduce` won't see transitions

## Troubleshooting

### "It's just a normal page load"

- Check browser support (see above)
- Check console for errors
- Verify `data-project-name` attributes are present

### "The transition is janky"

- Remove any other animations that might conflict
- Check if there are layout shifts happening
- Ensure the element sizes are stable

### "Nothing happens"

- View Transitions API might not be supported in your browser
- Try in Chrome 111+ or Edge 111+
- Check for JavaScript errors in console

## Browser Support Table

| Browser    | Version | Support    |
| ---------- | ------- | ---------- |
| Chrome     | 111+    | ✅ Full    |
| Edge       | 111+    | ✅ Full    |
| Safari     | 18+     | ✅ Full    |
| Firefox    | -       | ❌ Not yet |
| Safari iOS | 18+     | ✅ Full    |

## Performance Notes

View Transitions are hardware-accelerated and should be very smooth. If you experience performance issues:

1. Check if you have many other animations running
2. Verify GPU acceleration is enabled
3. Test on a different device
