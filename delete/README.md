# Documentation Pending Deletion

## ⚠️ Review Before Deleting

This folder contains documentation that appears to be outdated or superseded. **Please review before permanently deleting.**

## Contents

### `/apps/web/` - Web App Documentation (Outdated)

The following folders were moved from `/apps/web/docs/` to `/delete/apps/web/` during the October 2025 documentation reorganization:

| Folder                  | Original Location                      | Reason for Deletion                     | Review Notes                                                                    |
| ----------------------- | -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| `archive/`              | `/apps/web/docs/archive/`              | Already archived in Sept 2025           | Contains outdated development summaries, CI/CD implementation docs from Sept 27 |
| `audits-archive/`       | `/apps/web/docs/audits/archive/`       | Archived audit reports                  | Code cleanup and duplication reports from Sept 2025                             |
| `agents/`               | `/apps/web/docs/agents/`               | Claude Code command templates           | Appears to be development tooling docs that may be outdated                     |
| `research/`             | `/apps/web/docs/research/`             | Empty research folder                   | `investigations/` subfolder was empty                                           |
| `migrations-completed/` | `/apps/web/docs/migrations/completed/` | Completed migration docs from Sept 2025 | Migration fix summaries and post-migration steps                                |
| `start-here.md`         | `/apps/web/docs/start-here.md`         | Outdated documentation index            | Superseded by `/docs/README.md` and app-specific README files                   |

## What Was Moved to `/docs/`

The following were **moved** (not deleted) from `/apps/web/docs/` to `/docs/` as they are monorepo-wide concerns:

- ✅ `business/` → `/docs/business/` (business strategy, war room)
- ✅ `marketing/` → `/docs/marketing/` (brand, growth, investors)
- ✅ `blogs/` → `/docs/blogs/` (content marketing)
- ✅ `philosophy/` → `/docs/philosophy/` (product philosophy)
- ✅ `user-guide/` → `/docs/user-guide/` (end-user docs)
- ✅ `writing/` → `/docs/writing/` (writing resources)

## What Stayed in `/apps/web/docs/`

Web-specific documentation that remains:

- ✅ `/features/` - Web feature specs
- ✅ `/design/` - Web design system
- ✅ `/development/` - Web development guides
- ✅ `/operations/` - Web deployment and ops
- ✅ `/migrations/active/` - Active migrations
- ✅ `/integrations/` - Web integrations
- ✅ `/prompts/` - LLM prompts
- ✅ `/technical/` - Web technical docs
- ✅ `/audits/` - Current audits (non-archive)

## Recommendation

**Before deleting:**

1. Review each folder to ensure no critical information will be lost
2. Check if any docs need to be preserved for historical reference
3. Verify that active systems don't reference these docs
4. Consider archiving in git history instead of moving to separate archive folder

**After review, you can safely:**

```bash
# Delete the entire /delete folder
rm -rf /delete
```

---

**Documentation Reorganization Date:** October 3, 2025
**Performed by:** Documentation cleanup process
