# Quick Migration Reference Card

## One-Command Migration

```bash
# Test first (DRY RUN - recommended!)
node migrate-to-runes.js --dry-run

# Run the migration
node migrate-to-runes.js
```

## Command Options

| Command                                                 | Description            |
| ------------------------------------------------------- | ---------------------- |
| `node migrate-to-runes.js`                              | Migrate all files      |
| `node migrate-to-runes.js --dry-run`                    | Test without modifying |
| `node migrate-to-runes.js --verbose`                    | Show detailed output   |
| `node migrate-to-runes.js --file 'path/to/file.svelte'` | Single file            |

## Conversion Rules

| Before                 | After                                   |
| ---------------------- | --------------------------------------- |
| `$: x = value`         | `let x = $derived(value);`              |
| `$: if (cond) { ... }` | `$effect(() => { if (cond) { ... } });` |
| `$: { code }`          | `$effect(() => { code });`              |

## Expected Results

- **435 conversions** across **120 files**
- **~90% automation** (minimal manual review)
- **312** `$derived` conversions
- **123** `$effect` conversions

## Verification Steps

```bash
# 1. Type check
pnpm run check

# 2. Run tests
pnpm run test

# 3. Build
pnpm run build

# 4. Test in browser
pnpm run dev
```

## Files Provided

1. `migrate-to-runes.js` - Migration script
2. `MIGRATION_README.md` - Complete overview
3. `MIGRATION_GUIDE.md` - Detailed guide with examples
4. `MIGRATION_SUMMARY.txt` - Statistics and summary
5. `QUICK_MIGRATION_REFERENCE.md` - This file

## Support

- See `MIGRATION_GUIDE.md` for detailed examples
- Run with `--verbose` for detailed conversion info
- Test incrementally with `--file` for complex cases

---

**Ready to migrate?** Start with: `node migrate-to-runes.js --dry-run`
