# View Transition Debugging Guide

## Recent Fixes Applied

1. ✅ Removed pulse animation that interfered with transitions
2. ✅ Fixed CSS selector (removed invalid pseudo-element rules)
3. ✅ Fixed data loading (now uses `data.project` as fallback)
4. ✅ Reverted problematic deferred initialization
5. ✅ Added better logging to onNavigate hook

## Step-by-Step Debugging

### Step 1: Verify Browser Support

Open browser console and run:

```javascript
console.log('View Transitions:', !!document.startViewTransition);
```

**Expected**: `true` (Chrome 111+, Edge 111+, Safari 18+)
**If false**: Your browser doesn't support View Transitions API yet

### Step 2: Check Console Logs During Navigation

Navigate from `/projects` to any project. You should see these logs in order:

```
[View Transition] Starting from /projects to /projects/[id]
[Page] Capturing new project data: {project-id} Previous: null
[Page] Project switch detected - will trigger cleanup and re-initialization
[View Transition] Navigation complete, transition finishing
[View Transition] Transition finished successfully
[Page] Initialization complete for: {project-id}
```

**If you don't see "Transition finished successfully"**: The transition is failing. Check for errors.

### Step 3: Inspect DOM Elements

#### On Projects List Page (`/projects`):

1. Open DevTools → Elements
2. Find a project card
3. Look for the `<h3>` element with project name
4. Verify it has:
    - Attribute: `data-project-name`
    - Inline style: `style="--project-name: project-name-{some-id}"`

Example:

```html
<h3
	class="..."
	data-project-name
	style="--project-name: project-name-114488d7-7a45-4c23-bf72-3319cd7c3e0d;"
>
	Project Name
</h3>
```

#### On Project Detail Page (`/projects/[id]`):

1. Find the `<h1>` element in the header
2. Verify it has:
    - Attribute: `data-project-name`
    - Inline style: `style="--project-name: project-name-{SAME-id}"`
    - **The ID must match the project you clicked!**

### Step 4: Check Computed Styles

1. Select the `<h3>` element on projects page
2. In DevTools → Computed tab
3. Search for `view-transition-name`
4. **Expected**: `project-name-{id}` (not `none`, not empty)

If it shows `none` or is missing:

- The CSS isn't being applied
- Check for CSS conflicts
- Check media query (must not have `prefers-reduced-motion: reduce` set)

### Step 5: Monitor View Transition in DevTools

#### Chrome DevTools Method:

1. Open DevTools
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
3. Type "Show Rendering"
4. In Rendering panel, find "View Transitions"
5. Check "Capture view transition screenshots"
6. Navigate between pages
7. You should see transition snapshots in the Rendering panel

### Step 6: Check for CSS Conflicts

Search your CSS for any rules that might override `view-transition-name`:

```bash
# In terminal
grep -r "view-transition-name" apps/web/src
```

Make sure no other rules are setting it to `none` or auto.

### Step 7: Test with Simplified Case

Create a test by adding this temporarily to both pages:

```html
<!-- Add to projects list -->
<div data-project-name style="--project-name: test-element;">TEST ELEMENT - Projects List</div>

<!-- Add to project detail -->
<div data-project-name style="--project-name: test-element;">TEST ELEMENT - Project Detail</div>
```

If these elements morph but the project names don't, there's an issue with the dynamic IDs.

## Common Issues & Solutions

### Issue: "Transition finished successfully" but no visible animation

**Possible Causes:**

1. Elements don't have matching `view-transition-name` values
2. CSS animation duration is 0
3. Elements are position:fixed or in different stacking contexts

**Solution:**

- Verify IDs match exactly
- Check CSS animation-duration
- Ensure elements are in normal document flow

### Issue: Elements "jump" instead of morphing

**Possible Causes:**

1. Transition happening but too fast to notice
2. Elements have transforms/transitions that conflict
3. Layout shifts during transition

**Solution:**

- Increase animation duration to 1s temporarily to see if it's working
- Remove any other CSS transitions on the elements
- Ensure no layout changes during navigation

### Issue: Only page fades, project name doesn't morph

**Possible Causes:**

1. `view-transition-name` not unique or not set
2. One element not found (e.g., header not rendered yet)
3. CSS specificity issues

**Solution:**

- Check both elements exist before and after navigation
- Verify computed style shows view-transition-name
- Check z-index and stacking context

### Issue: Console shows errors about View Transition

**Common Errors:**

- `DOMException: The operation was aborted`: Navigation interrupted
- `Duplicate view-transition-name`: Two elements have same name
- `Invalid view-transition-name`: Name contains invalid characters

**Solutions:**

- Ensure IDs are unique per project
- Check for special characters in project IDs
- Ensure only one element per page has each name

## Manual Testing Checklist

- [ ] Browser supports View Transitions API
- [ ] Console logs show transition starting
- [ ] Console logs show transition finishing
- [ ] No JavaScript errors in console
- [ ] Project data loads on detail page
- [ ] `data-project-name` attribute present on both pages
- [ ] `--project-name` CSS variable set correctly
- [ ] IDs match between pages
- [ ] Computed style shows `view-transition-name`
- [ ] No CSS conflicts overriding the name
- [ ] Elements visible before navigation starts
- [ ] No layout shifts during transition

## Next Steps if Still Not Working

1. **Simplify**: Remove all custom CSS animations temporarily
2. **Hard-code**: Test with hard-coded IDs instead of dynamic ones
3. **Compare**: Test transition between two static pages
4. **Browser**: Try in different browser (Chrome vs Edge vs Safari)
5. **Extensions**: Disable browser extensions that might interfere
6. **Cache**: Clear browser cache and hard reload (Cmd+Shift+R)

## Success Criteria

When working correctly, you should see:

- ✨ Project name smoothly morphs from card to header
- 🎬 Slight fade effect on the rest of the page
- 📍 No jarring jumps or layout shifts
- ⚡ Transition completes in ~350ms
- 🎯 Animation feels native and smooth

## Performance Notes

If transitions feel janky:

- Check CPU usage during transition
- Reduce animation duration
- Simplify CSS on transitioning elements
- Ensure hardware acceleration is enabled
