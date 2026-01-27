<!-- NEXT_STEPS_IMPLEMENTATION_FIXES.md -->

# Next Steps Implementation Fixes

## Summary

Fixed HTML escaping and entity reference sanitization issues in the daily brief next steps generation and display flow. These fixes ensure that next steps with entity references (links to tasks, goals, milestones, plans) are properly formatted and securely rendered.

## Issues Fixed

### 1. **XSS Vulnerability - HTML Escaping in Display Components**

**Problem:** Entity reference display text was not being HTML-escaped before insertion into HTML, allowing potential XSS attacks if display text contained HTML characters.

**Files Fixed:**

- `apps/web/src/lib/components/project/NextStepDisplay.svelte`
- `apps/web/src/lib/components/project/ProjectCardNextStep.svelte`

**Changes:**

- Added `escapeHtml()` helper function to properly escape HTML special characters (`<`, `>`, `"`, `'`, `&`)
- Updated `renderLongContent()` in NextStepDisplay to escape all dynamic content (type, id, displayText)
- Updated `formatWithEntityRefs()` in ProjectCardNextStep to escape displayText before rendering

**Example:**

```javascript
// Before (vulnerable):
return `<button>${displayText}</button>`;

// After (secure):
const safeText = escapeHtml(displayText);
return `<button>${safeText}</button>`;
```

### 2. **Entity Reference Parsing Ambiguity - Display Text Sanitization**

**Problem:** Entity reference display text could contain special characters (`[`, `]`, `|`) that are used as delimiters in the reference format, potentially creating parsing ambiguities or malformed references.

**Files Fixed:**

- `apps/worker/src/workers/brief/projectNextStepGenerator.ts`

**Changes:**

- Added `sanitizeEntityRefText()` function that removes delimiter characters from display text
- Updated `formatTaskRef()` to sanitize task titles
- Updated `formatGoal()` to sanitize goal names
- Updated `formatMilestone()` to sanitize milestone titles
- Updated inline plan references to sanitize plan names

**Example:**

```javascript
// Before (potential parsing issues):
return `[[task:${task.id}|${task.title}]]`;

// After (sanitized):
const sanitizedTitle = sanitizeEntityRefText(task.title);
return `[[task:${task.id}|${sanitizedTitle}]]`;
```

## Test Results

All escaping and sanitization functions pass security and functionality tests:

✅ HTML Escaping Tests (all pass)

- Normal text: correctly rendered
- Script tags: escaped to `&lt;script&gt;`
- Quotes: escaped to `&quot;`
- Ampersands: escaped to `&amp;`
- Apostrophes: escaped to `&#39;`

✅ Entity Reference Sanitization Tests (all pass)

- Square brackets removed: `[document]` → `document`
- Pipes removed: `Task | Subtask` → `Task  Subtask`
- Normal text unchanged: `Normal task` → `Normal task`
- Complex cases handled: `[Complete] this | item [now]` → `Complete this  item now`

## Data Flow

### Worker → Database

1. Worker generates entity references with sanitized display text
2. Example: `[[task:abc-123|Fix bug]] (active, due Jan 15)`
3. Stored in `onto_projects.next_step_short` and `next_step_long`

### Database → Frontend

1. Web app loads next steps from database
2. NextStepDisplay.svelte and ProjectCardNextStep.svelte render them
3. Entity references are parsed and converted to interactive elements
4. Display text is HTML-escaped before rendering

### Security Properties

- ✅ Display text properly escaped before HTML injection
- ✅ Entity reference format delimiters sanitized at source
- ✅ No XSS vulnerability via display text
- ✅ No parsing ambiguities from special characters
- ✅ Full backward compatibility with existing next steps

## Files Modified

1. `/apps/web/src/lib/components/project/NextStepDisplay.svelte`
    - Added escapeHtml() helper function
    - Updated renderLongContent() to escape dynamic content

2. `/apps/web/src/lib/components/project/ProjectCardNextStep.svelte`
    - Added escapeHtml() helper function
    - Updated formatWithEntityRefs() to escape displayText

3. `/apps/worker/src/workers/brief/projectNextStepGenerator.ts`
    - Added sanitizeEntityRefText() helper function
    - Updated formatTaskRef(), formatGoal(), formatMilestone() to sanitize display text
    - Updated inline plan references to sanitize names

## Verification

Run the following commands to verify the fixes:

```bash
# Type checking
pnpm typecheck

# Build
pnpm build

# Tests (if applicable)
pnpm test
```

All commands pass successfully with no errors or warnings.

## Impact

- **No breaking changes** - All changes are internal implementation details
- **Improved security** - XSS vulnerabilities eliminated
- **Better reliability** - Entity reference parsing no longer ambiguous
- **Consistent behavior** - Matches existing entity reference parser implementation
