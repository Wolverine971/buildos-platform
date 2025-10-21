# Core Columns Implementation Audit

**Date:** 2025-10-20
**Status:** ⚠️ CRITICAL GAPS IDENTIFIED

## Executive Summary

The 9 new core dimension columns were added to the database schema but are **NOT properly integrated** throughout the web app. Key issues:

1. **CRITICAL**: Data cleaner missing all core columns
2. **HIGH**: ProjectHistoryModal doesn't track core column changes
3. **MEDIUM**: Embedding preparation doesn't include core columns
4. **MEDIUM**: Validation schemas in operations has them but data-cleaner doesn't

## New Columns Added

```typescript
core_context_descriptions: Json | null;
core_goals_momentum: string | null;
core_harmony_integration: string | null;
core_integrity_ideals: string | null;
core_meaning_identity: string | null;
core_opportunity_freedom: string | null;
core_people_bonds: string | null;
core_power_resources: string | null;
core_reality_understanding: string | null;
core_trust_safeguards: string | null;
```

## Gap Analysis

### ✅ PROPERLY IMPLEMENTED

1. **Database Schema** ✓
   - File: `apps/web/src/lib/database.schema.ts:766-795`
   - All 9 core columns properly defined

2. **Validation Schemas** ✓
   - File: `apps/web/src/lib/utils/operations/validation-schemas.ts:35-45`
   - All 9 core columns in tableSchemas

3. **UI Component** ✓
   - File: `apps/web/src/lib/components/project/CoreDimensionsField.svelte`
   - All 9 dimensions with proper UI and metadata

4. **API GET Endpoint** ✓
   - File: `apps/web/src/routes/api/projects/[id]/+server.ts`
   - Uses `select('*')` so fetches all columns

5. **Prompt Templates** ✓
   - File: `apps/web/src/lib/services/promptTemplate.service.ts`
   - Includes all core dimensions in AI prompts

### ❌ CRITICAL GAPS

1. **Data Cleaner Missing Core Columns** 🔴
   - File: `apps/web/src/lib/utils/data-cleaner.ts:144-162`
   - **Issue**: Projects schema doesn't include any of the 9 core columns
   - **Impact**: When projects are updated via API, core columns are NOT cleaned/validated
   - **Impact**: Core columns are stripped during the cleanDataForTable() call in PUT endpoint
   - **Impact**: Embedding preparation doesn't include core columns

   **Current Schema (INCOMPLETE):**

   ```typescript
   projects: {
       id: { type: 'uuid' },
       user_id: { type: 'uuid', required: true },
       name: { type: 'string', maxLength: 255, required: true },
       slug: { type: 'slug', maxLength: 255 },
       description: { type: 'string' },
       context: { type: 'string' },
       executive_summary: { type: 'string' },
       status: { type: 'enum', values: ['active', 'paused', 'completed', 'archived'] },
       start_date: { type: 'date' },
       end_date: { type: 'date' },
       tags: { type: 'array' },
       calendar_color_id: { type: 'string' },
       calendar_settings: { type: 'json' },
       calendar_sync_enabled: { type: 'boolean' },
       created_at: { type: 'timestamp' },
       updated_at: { type: 'timestamp' }
       // ❌ MISSING: all 9 core_* columns
   }
   ```

2. **ProjectHistoryModal Missing Core Columns** 🔴
   - File: `apps/web/src/lib/components/project/ProjectHistoryModal.svelte:56-65`
   - **Issue**: fieldConfig only includes 8 fields
   - **Impact**: History modal won't show changes to any core dimensions
   - **Impact**: User can't see how core dimensions have evolved

   **Current Fields:**

   ```typescript
   (name,
     description,
     context,
     executive_summary,
     status,
     start_date,
     end_date,
     tags);
   // ❌ MISSING: all 9 core_* columns
   ```

3. **Embedding Preparation Missing Core Columns** 🟡
   - File: `apps/web/src/lib/utils/data-cleaner.ts:361-388`
   - **Issue**: cleanDataForEmbedding for projects only uses 6 fields
   - **Impact**: Embeddings won't include core dimension content for semantic search

   **Current Fields:**

   ```typescript
   ["name", "description", "status", "tags", "context", "executive_summary"];
   // ❌ MISSING: all 9 core_* columns
   ```

## Data Flow Analysis

### Current Flow (BROKEN for core columns)

```
1. User edits core dimension in CoreDimensionsField.svelte
2. Update sent to API: PUT /api/projects/[id]
3. ❌ BREAKS HERE: cleanDataForTable('projects', data)
   - data-cleaner.ts processes data
   - core_* columns are NOT in schema
   - core columns are silently dropped/ignored
4. Project saved WITHOUT core columns
5. ProjectHistoryModal shows NO changes
```

### Expected Flow (after fix)

```
1. User edits core dimension in CoreDimensionsField.svelte
2. Update sent to API: PUT /api/projects/[id]
3. ✓ cleanDataForTable('projects', data) processes all fields
   - core_* columns in schema
   - core columns validated and cleaned
4. Project saved WITH core columns
5. ProjectHistoryModal shows changes
6. Search embeddings include core content
```

## Files to Fix

### 1. CRITICAL: data-cleaner.ts

**File:** `apps/web/src/lib/utils/data-cleaner.ts`
**Changes needed:**

- Add all 9 core\_\* columns to projects schema (lines 144-162)
- Add core columns to embedding fields (lines 364-370)

### 2. HIGH: ProjectHistoryModal.svelte

**File:** `apps/web/src/lib/components/project/ProjectHistoryModal.svelte`
**Changes needed:**

- Add all 9 core\_\* columns to fieldConfig (lines 56-65)

### 3. OPTIONAL: Update API response handling

**File:** `apps/web/src/routes/api/projects/[id]/+server.ts`
**Status:** Currently OK (uses `select('*')`)
**Action:** Verify it continues to work with core columns

## Verification Checklist

- [ ] Add all 9 core columns to data-cleaner.ts projects schema
- [ ] Add all 9 core columns to data-cleaner.ts embedding fields
- [ ] Add all 9 core columns to ProjectHistoryModal fieldConfig
- [ ] Test: Edit a core dimension and save
- [ ] Test: Verify core dimension appears in ProjectHistoryModal
- [ ] Test: Verify core dimension is fetched in GET request
- [ ] Test: Verify core dimension in API response
- [ ] Test: Create new project with brain dump and verify core dimensions are populated
- [ ] Test: Edit existing project and verify changes are tracked

## Type Safety Notes

All core columns are properly typed in:

- `@buildos/shared-types` database types
- `apps/web/src/lib/database.schema.ts`
- TypeScript types derived from database.schema.ts

The Project type includes all core columns automatically.

## Recommendation

**URGENT**: Fix data-cleaner.ts immediately. This is silently dropping core column data on every project update.

Priority:

1. 🔴 Fix data-cleaner.ts (blocks all core column updates)
2. 🔴 Fix ProjectHistoryModal (enables audit trail)
3. 🟡 Fix embedding fields (improves search, non-blocking)
