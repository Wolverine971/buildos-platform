# Svelte 4 → Svelte 5 Runes Migration Guide

## Overview

This guide explains how to use the automated migration script to convert Svelte 4 reactive syntax (`$:`) to Svelte 5 runes syntax (`$derived` and `$effect`).

**Current Status:** 436 instances across 120 files need migration

**Target:** 80%+ automation (remaining 20% for manual review)

## Quick Start

### 1. Test the Migration (Dry Run)

Always start with a dry run to see what changes will be made:

```bash
# Test on all files
node migrate-to-runes.js --dry-run

# Test on a specific file
node migrate-to-runes.js --dry-run --file 'src/routes/+error.svelte'

# Test with verbose output to see detailed conversions
node migrate-to-runes.js --dry-run --verbose
```

### 2. Run the Migration

Once you're satisfied with the dry run results:

```bash
# Migrate all files
node migrate-to-runes.js

# Migrate a single file
node migrate-to-runes.js --file 'src/routes/+error.svelte'

# Migrate with verbose output
node migrate-to-runes.js --verbose
```

### 3. Review and Test

After migration:

```bash
# Check for TypeScript errors
pnpm run check

# Run tests
pnpm run test

# Start dev server and spot-check functionality
pnpm run dev
```

## Command Line Options

| Option          | Description                          |
| --------------- | ------------------------------------ |
| `--dry-run`     | Show changes without modifying files |
| `--file <path>` | Process only a specific file         |
| `--verbose`     | Show detailed conversion information |

## Conversion Rules

The script applies these conversion rules:

### 1. Simple Assignments → `$derived`

Reactive statements that assign computed values are converted to `$derived`:

```svelte
<!-- Before -->
$: count = items.length; $: doubled = count * 2; $: filtered = items.filter(i => i.active);

<!-- After -->
let count = $derived(items.length); let doubled = $derived(count * 2); let filtered = $derived(items.filter(i
=> i.active));
```

### 2. Multi-line Objects/Arrays → `$derived`

Complex expressions preserve indentation:

```svelte
<!-- Before -->
$: config = {
  title: 'Hello',
  count: items.length,
  active: true
};

<!-- After -->
let config = $derived({
  title: 'Hello',
  count: items.length,
  active: true
});
```

### 3. Side Effects → `$effect`

Statements with function calls, if statements, or mutations are converted to `$effect`:

```svelte
<!-- Before -->
$: if (isOpen) {
  document.body.style.overflow = 'hidden';
}

$: console.log('Count:', count);

<!-- After -->
$effect(() => { if (isOpen) {
  document.body.style.overflow = 'hidden';
} });

$effect(() => { console.log('Count:', count); });
```

### 4. Block Statements → `$effect`

Multi-statement blocks are converted to `$effect`:

```svelte
<!-- Before -->
$: {
  console.log('Refreshing data');
  loadData();
}

<!-- After -->
$effect(() => {
  console.log('Refreshing data');
  loadData();
});
```

## What the Script Handles

✅ **Automatically Converted:**

- Simple assignments (`$: x = y`)
- Multi-line object/array assignments
- If statements (`$: if (x) { ... }`)
- Function calls (`$: console.log(...)`)
- Block statements (`$: { ... }`)
- Array methods (`.map()`, `.filter()`, `.reduce()`, etc.)
- Chained array access (`[status]`, `[key]`)

✅ **Preserved:**

- Indentation and formatting
- Comments between statements
- Multi-line expressions

## What Requires Manual Review

⚠️ **May Need Manual Review:**

- Complex nested logic
- Statements mixing computed values and side effects
- Edge cases with unusual syntax
- Destructuring assignments (rare)

## Example Conversions

### Example 1: Page Data Binding

```svelte
<!-- Before -->
$: project = data.project; $: tasks = data.tasks; $: isLoading = data.isLoading;

<!-- After -->
let project = $derived(data.project); let tasks = $derived(data.tasks); let isLoading = $derived(data.isLoading);
```

### Example 2: Computed Values

```svelte
<!-- Before -->
$: filteredTasks = tasks.filter(t => t.status === selectedStatus); $: taskCount = filteredTasks.length;
$: hasActiveTasks = taskCount > 0;

<!-- After -->
let filteredTasks = $derived(tasks.filter(t => t.status === selectedStatus)); let taskCount = $derived(filteredTasks.length);
let hasActiveTasks = $derived(taskCount > 0);
```

### Example 3: Side Effects

```svelte
<!-- Before -->
$: if (showModal) {
  document.body.classList.add('modal-open');
} else {
  document.body.classList.remove('modal-open');
}

<!-- After -->
$effect(() => { if (showModal) {
  document.body.classList.add('modal-open');
} else {
  document.body.classList.remove('modal-open');
} });
```

### Example 4: Complex Objects

```svelte
<!-- Before -->
$: errorConfig = {
  401: { title: 'Auth Required', icon: Lock },
  403: { title: 'Forbidden', icon: Shield },
  404: { title: 'Not Found', icon: HelpCircle }
}[status] || { title: 'Error', icon: AlertTriangle };

<!-- After -->
let errorConfig = $derived({
  401: { title: 'Auth Required', icon: Lock },
  403: { title: 'Forbidden', icon: Shield },
  404: { title: 'Not Found', icon: HelpCircle }
}[status] || { title: 'Error', icon: AlertTriangle });
```

## Recommended Workflow

### Phase 1: Test Migration (15-30 minutes)

1. Run dry-run on a sample of files:

    ```bash
    node migrate-to-runes.js --dry-run --verbose --file 'src/routes/+error.svelte'
    node migrate-to-runes.js --dry-run --verbose --file 'src/routes/admin/+page.svelte'
    node migrate-to-runes.js --dry-run --verbose --file 'src/routes/projects/[id]/notes/+page.svelte'
    ```

2. Review the output to ensure conversions look correct

### Phase 2: Migrate by Directory (1-2 hours)

Migrate in batches for easier review:

```bash
# Start with simple routes
node migrate-to-runes.js --file 'src/routes/+error.svelte'
node migrate-to-runes.js --file 'src/routes/+layout.svelte'

# Then components
find src/lib/components/ui -name "*.svelte" -exec node migrate-to-runes.js --file {} \;

# Then route pages
find src/routes -name "+page.svelte" -exec node migrate-to-runes.js --file {} \;
```

### Phase 3: Verify and Fix (1-2 hours)

1. Run type checking:

    ```bash
    pnpm run check
    ```

2. Fix any TypeScript errors manually

3. Run tests:

    ```bash
    pnpm run test
    ```

4. Spot-check in browser:
    ```bash
    pnpm run dev
    ```

## Troubleshooting

### Issue: Script reports errors

**Solution:** Check the error message. Common issues:

- File path doesn't exist (use quotes around paths with `[brackets]`)
- Syntax errors in original file

### Issue: Conversion looks wrong

**Solution:**

- Check the verbose output to see the before/after
- File an issue or manually fix specific cases
- The script is conservative - it may skip ambiguous cases

### Issue: Build fails after migration

**Solution:**

1. Run `pnpm run check` to see specific errors
2. Look for cases where:
    - `$derived` should have been `$effect` (or vice versa)
    - Multi-line statements have syntax issues
3. Manually fix and test

## Statistics Tracking

The script tracks and reports:

- Files processed
- Files modified
- Total conversions
- Breakdown: `$derived` vs `$effect` vs skipped
- Any errors encountered

## Support

If you encounter issues:

1. Run with `--verbose` to see detailed output
2. Check the conversion rules above
3. Manually review complex cases
4. Test incrementally (file by file if needed)

## Advanced Usage

### Process specific directories

```bash
# All UI components
find src/lib/components/ui -name "*.svelte" | while read file; do
  node migrate-to-runes.js --file "$file"
done

# All route pages
find src/routes -name "+page.svelte" | while read file; do
  node migrate-to-runes.js --file "$file"
done
```

### Batch processing with logging

```bash
# Log all conversions to a file
node migrate-to-runes.js --verbose > migration.log 2>&1
```

## Expected Results

Based on testing:

- **Automation Rate:** ~85-90%
- **Manual Review Needed:** ~10-15% of conversions
- **Common Manual Fixes:**
    - Complex nested effects
    - Edge cases with unusual syntax
    - Statements mixing computation and side effects

## Post-Migration Checklist

- [ ] All files migrated (check count: 436 instances across 120 files)
- [ ] `pnpm run check` passes with no errors
- [ ] `pnpm run test` passes
- [ ] `pnpm run build` succeeds
- [ ] Dev server runs without errors
- [ ] Spot-checked key features in browser
- [ ] Git commit with clear message

## Migration Script

The migration script is located at: `migrate-to-runes.js`

See the script source for implementation details and customization options.

---

**Last Updated:** October 21, 2025
**Script Version:** 1.0.0
**Target:** Svelte 5 Runes Migration
