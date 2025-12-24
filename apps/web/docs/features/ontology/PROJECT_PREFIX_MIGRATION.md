<!-- apps/web/docs/features/ontology/PROJECT_PREFIX_MIGRATION.md -->

# Project Template Prefix Migration

**Date**: December 1, 2025
**Status**: Complete (Code Changes Done - DB Migration Pending)
**Author**: Claude (automated)
**Purpose**: Track the migration from `{domain}.{deliverable}[.{variant}]` to `project.{domain}.{deliverable}[.{variant}]` for project templates

---

## Overview

This document tracks the migration of project template naming conventions to include the `project.` scope prefix, aligning projects with all other entity types in the ontology system.

### The Change

| Before                   | After                            |
| ------------------------ | -------------------------------- |
| `writer.book`            | `project.writer.book`            |
| `developer.app.mobile`   | `project.developer.app.mobile`   |
| `coach.client.executive` | `project.coach.client.executive` |

### Rationale

All other entity types in the ontology use scope prefixes:

- `task.execute`, `task.coordinate.meeting`
- `plan.sprint`, `plan.campaign`
- `goal.outcome`, `goal.metric`
- `document.research`, `document.specification`
- `output.chapter`, `output.article`
- `risk.technical`, `risk.schedule`
- `requirement.functional`, `requirement.constraint`

Projects were the only exception. This migration unifies the naming pattern.

---

## Migration Checklist

### Documentation Updates

- [x] **NAMING_CONVENTIONS.md**
    - [x] Update project format in Quick Reference Table
    - [x] Add `project.` to Reserved Scope Prefixes section
    - [x] Update all project examples
    - [x] Update validation regex pattern for projects

- [x] **TYPE_KEY_TAXONOMY.md**
    - [x] Update Quick Reference table
    - [x] Update project format and examples throughout
    - [x] Update query examples

### Code Updates

- [x] **template-scope.ts** (`/apps/web/src/lib/constants/`)
    - [x] Update `typeKeyPattern` for project scope from `{domain}.{deliverable}[.{variant}]` to `project.{domain}.{deliverable}[.{variant}]`

- [x] **project-template-inference.service.ts** (`/apps/web/src/lib/services/ontology/`)
    - [x] Update `buildTypeKey()` method to prepend `project.` prefix
    - [x] Verify `DEFAULT_PARENT_TEMPLATE_KEY` is correctly prefixed

- [x] **tool-definitions.ts** (`/apps/web/src/lib/services/agentic-chat/tools/core/`)
    - [x] Update `ontology_project.type_key` example
    - [x] Update `ontology_template.type_key` example
    - [x] Update `create_onto_project` description examples
    - [x] Update `suggest_template` description examples
    - [x] Update `list_onto_templates` examples

- [x] **context-prompts.ts** (`/apps/web/src/lib/services/agentic-chat/prompts/config/`)
    - [x] Verify project creation examples use `project.` prefix
    - [x] Update pattern description in project creation guidance

- [x] **project-migration.service.ts** (`/apps/web/src/lib/services/ontology/`)
    - [x] Verify `DEFAULT_PROJECT_TYPE` uses correct prefix (already has `project.`)
    - [x] Update heuristic fallbacks in `resolveProjectTypeKey()` to use domain-based patterns

### Database Migration

- [x] **Create migration file** (`/supabase/migrations/20251201_project_prefix_migration.sql`)
    - [x] Rename existing project templates in `onto_templates`
    - [x] Update `type_key` for all project-scope templates
    - [x] Update existing `onto_projects.type_key` values
    - [x] Create fallback `project.migration.generic` template

### Verification Steps

- [ ] Run `pnpm run typecheck` to verify no type errors
- [ ] Run `pnpm run test` to verify tests pass
- [ ] Run `pnpm run lint:fix` to fix any linting issues
- [ ] Test project creation flow in agentic chat
- [ ] Test template search/filter functionality
- [ ] Test admin migration flow

---

## Files Modified

| File                                    | Type | Status   | Notes                                                   |
| --------------------------------------- | ---- | -------- | ------------------------------------------------------- |
| `NAMING_CONVENTIONS.md`                 | Doc  | Complete | Updated project format, added prefix to reserved scopes |
| `TYPE_KEY_TAXONOMY.md`                  | Doc  | Complete | Updated all project examples and query patterns         |
| `template-scope.ts`                     | Code | Complete | Updated typeKeyPattern for project scope                |
| `project-template-inference.service.ts` | Code | Complete | Updated buildTypeKey() to prepend project. prefix       |
| `tool-definitions.ts`                   | Code | Complete | Updated all project type_key examples                   |
| `context-prompts.ts`                    | Code | Complete | Updated project creation pattern description            |
| `project-migration.service.ts`          | Code | Complete | Updated resolveProjectTypeKey() fallbacks               |
| `20251201_project_prefix_migration.sql` | DB   | Complete | Migration to update existing templates                  |

---

## Rollback Plan

If issues are discovered after deployment:

1. Create rollback migration to revert `type_key` changes
2. Revert code changes via git
3. Update documentation to reflect rollback

---

## Testing Plan

### Unit Tests

- Template validation accepts new format
- Type key builder produces correct output
- Project creation uses correct type_key

### Integration Tests

- Create project with new template type_key
- Search projects by type_key
- Template inheritance works correctly

### Manual Tests

- Agentic chat project creation flow
- Admin migration dashboard
- Template management UI

---

## Related Documentation

- [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md)
- [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md)
- [DATA_MODELS.md](./DATA_MODELS.md)
- [API_ENDPOINTS.md](./API_ENDPOINTS.md)

---

## Progress Log

### December 1, 2025 - Implementation Complete

**Documentation Updates:**

- Updated `NAMING_CONVENTIONS.md` - Added `project.` to reserved scope prefixes, updated project format and examples, updated validation regex
- Updated `TYPE_KEY_TAXONOMY.md` - Updated Quick Reference table, all project examples, query patterns, and code samples

**Code Updates:**

- Updated `template-scope.ts` - Changed `typeKeyPattern` from `{domain}.{deliverable}[.{variant}]` to `project.{domain}.{deliverable}[.{variant}]`
- Updated `project-template-inference.service.ts` - Modified `buildTypeKey()` to prepend `project.` prefix to all generated type keys
- Updated `tool-definitions.ts` - Changed all project type_key examples from `writer.book` to `project.writer.book`
- Updated `context-prompts.ts` - Updated project creation guidance to show `project.` prefix requirement
- Updated `project-migration.service.ts` - Changed fallback type keys to use domain-based naming (e.g., `project.writer.general` instead of `project.writing.general`)

**Database Migration:**

- Created `20251201_project_prefix_migration.sql` that:
    - Updates all project-scope templates to prepend `project.` prefix
    - Updates all existing `onto_projects.type_key` values
    - Creates fallback `project.migration.generic` template

**Next Steps:**

- Run typecheck and tests to verify no regressions
- Deploy database migration
- Test project creation flows manually
