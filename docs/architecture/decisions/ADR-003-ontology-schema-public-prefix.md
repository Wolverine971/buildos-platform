# ADR-003: Ontology Schema - Public Schema with onto\_ Prefix

**Date**: 2025-11-01
**Status**: Accepted
**Context**: Ontology System Implementation
**Related Documents**:

- `/thoughts/shared/research/2025-11-01_19-51-42_ontology-schema-architectural-fix.md`
- Migration: `/supabase/migrations/20250601000001_ontology_system.sql`
- Master Plan: `/thoughts/shared/ideas/ontology/buildos-ontology-master-plan.md`

## Context

The BuildOS Ontology System is a meta-project-management system that uses:

- **Templates**: Versioned blueprints with JSON Schema and FSM definitions
- **Projects**: Instances of templates with typed entities (tasks, deliverables, plans, documents)
- **FSM Engine**: Finite state machines for workflow automation
- **Facets**: 3-dimensional taxonomy (context, scale, stage)
- **Graph Relationships**: Edges between entities for complex dependencies

This system requires 24+ database tables to store templates, projects, tasks, deliverables, plans, documents, goals, requirements, sources, milestones, risks, decisions, metrics, edges, and taxonomy data.

### Initial Implementation Problem

The initial implementation created all tables in a custom `onto` schema:

```sql
create schema if not exists onto;
create table onto.projects (...);
create table onto.tasks (...);
create table onto.deliverables (...);
-- etc.
```

This caused several issues:

1. **Supabase TypeScript generation doesn't work well with custom schemas**
2. **RLS policies are more complex across schemas**
3. **Requires constant schema qualification**: `.from('onto.projects')`
4. **Poor IDE autocomplete** for table names
5. **Inconsistent with BuildOS codebase patterns** (uses public schema)

User feedback (verbatim):

> "the database i think is now messed up. Because it is in the onto namspace and not the public namespace. I think we need to update the migration and fix the naming convention to be onto\_ instead of onto."

## Decision

**Use public schema with `onto_` table prefix instead of custom `onto` schema.**

All ontology tables will be named:

- `onto_projects` (not `onto.projects`)
- `onto_tasks` (not `onto.tasks`)
- `onto_deliverables` (not `onto.deliverables`)
- etc.

### Rationale

#### 1. Supabase TypeScript Generation

**Custom Schema (Problems)**:

```typescript
// Types don't generate cleanly
const { data } = await supabase.from('onto.projects').select('*');
// IDE doesn't know what tables exist in 'onto' schema
```

**Public Schema with Prefix (Works)**:

```typescript
// Types generate automatically
const { data } = await supabase.from('onto_projects').select('*');
// IDE autocompletes: onto_projects, onto_tasks, onto_deliverables...
```

Supabase's type generation is optimized for public schema. Custom schemas require manual type definitions and lose autocomplete benefits.

#### 2. Follows BuildOS Patterns

The BuildOS codebase already uses public schema with prefixes for logical grouping:

**Existing examples**:

- `user_notification_preferences`
- `user_timezone_preferences`
- `daily_briefs`
- `agent_*` tables (new agent architecture)

**Consistency principle**: Ontology system should follow established patterns rather than introducing new schema organization.

#### 3. Simpler RLS Policies

**Custom Schema**:

```sql
-- Must specify schema in every policy
alter table onto.projects enable row level security;
create policy "projects_select" on onto.projects for select using (...);
create policy "projects_insert" on onto.projects for insert with check (...);
```

**Public Schema**:

```sql
-- Standard RLS syntax
alter table onto_projects enable row level security;
create policy "projects_select" on onto_projects for select using (...);
```

#### 4. Easier Debugging

**Custom Schema Issues**:

- Must remember to `SET search_path = onto, public;`
- Query tools may not show tables by default
- Error messages less clear: "relation onto.projects not found"

**Public Schema Benefits**:

- All tables visible in standard tools
- Clear error messages
- Standard PostgreSQL conventions

#### 5. Migration and Deployment

**Custom Schema Concerns**:

- Schema must be created before tables
- Order dependencies in migrations
- Production replication may need schema-aware configuration

**Public Schema Benefits**:

- Standard migration patterns
- Works with all Supabase deployment tools
- No special configuration needed

## Alternatives Considered

### Alternative 1: Keep Custom `onto` Schema

**Pros**:

- Logical separation from user-facing tables
- Clear namespace for meta-system
- Can set different permissions at schema level

**Cons**:

- TypeScript generation problems (deal-breaker)
- Inconsistent with BuildOS patterns
- More complex RLS policies
- Poor developer experience (IDE autocomplete)
- User explicitly requested change

**Decision**: ❌ Rejected due to TypeScript issues and user feedback

### Alternative 2: No Prefix in Public Schema

Example: `projects`, `tasks`, `deliverables` (without `onto_`)

**Pros**:

- Shorter table names
- Less typing

**Cons**:

- Name collisions (BuildOS may add `projects` table later)
- Unclear which tables belong to ontology system
- Hard to distinguish from user data

**Decision**: ❌ Rejected due to namespace collision risk

### Alternative 3: Different Prefix (e.g., `ontology_`)

**Pros**:

- More descriptive
- Clearer purpose

**Cons**:

- Longer to type
- User specifically requested `onto_` prefix

**Decision**: ❌ Rejected (user specified `onto_`)

## Implementation

### Migration Changes

**Before** (custom schema):

```sql
create schema if not exists onto;
create table onto.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- ...
);
```

**After** (public schema with prefix):

```sql
create table onto_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- ...
);
```

### Code Changes

**Before**:

```typescript
import { getAdminClient } from '$lib/server/db';
const client = getAdminClient();
const { data } = await client.from('onto.projects').select('*');
```

**After**:

```typescript
import { createAdminSupabaseClient } from '$lib/supabase/admin';
const client = createAdminSupabaseClient();
const { data } = await client.from('onto_projects').select('*');
```

### Files Updated

**Migration** (1 file):

- `supabase/migrations/20250601000001_ontology_system.sql` (rewritten)

**Backend Code** (8 files):

- `apps/web/src/lib/server/fsm/engine.ts`
- `apps/web/src/routes/api/onto/templates/+server.ts`
- `apps/web/src/routes/api/onto/projects/instantiate/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/+server.ts`
- `apps/web/src/routes/api/onto/fsm/transition/+server.ts`
- `apps/web/src/routes/ontology/+page.server.ts`
- `apps/web/src/routes/ontology/create/+page.server.ts`
- `apps/web/src/routes/ontology/projects/[id]/+page.server.ts`

**Deleted**:

- `apps/web/src/lib/server/db.ts` (unnecessary abstraction)

## Consequences

### Positive

✅ **TypeScript autocomplete works perfectly**

- IDE shows all `onto_*` tables
- Type safety for column names
- Better developer experience

✅ **Follows BuildOS patterns**

- Consistent with existing codebase
- Easier for team to understand
- Reduces cognitive load

✅ **Simpler RLS policies**

- Standard PostgreSQL syntax
- Easier to debug access issues
- Clear permission boundaries

✅ **Better tooling support**

- All Supabase dashboard features work
- Standard PostgreSQL tools work
- No special configuration needed

✅ **Easier onboarding**

- New developers understand pattern immediately
- No need to explain schema namespacing
- Reduces documentation burden

### Negative (Minimal)

⚠️ **Longer table names**

- `onto_projects` vs `onto.projects` (1 character longer)
- Mitigated by: IDE autocomplete makes typing fast

⚠️ **No schema-level permissions**

- Can't set permissions on all ontology tables at once
- Mitigated by: RLS policies are more granular anyway

⚠️ **All tables in public schema**

- Could feel cluttered with 24+ onto\_ tables
- Mitigated by: Prefix makes grouping clear in tools

### Neutral

➡️ **No performance impact** (schema vs prefix is identical at query level)
➡️ **No security impact** (RLS still applies the same way)
➡️ **No data model impact** (relationships unchanged)

## Compliance

This decision aligns with:

- ✅ **BuildOS CLAUDE.md guidelines**: Follow existing patterns
- ✅ **Supabase best practices**: Use public schema for TypeScript generation
- ✅ **User feedback**: Explicit request to use `onto_` prefix
- ✅ **PostgreSQL conventions**: Prefixes are standard for logical grouping

## Monitoring

### Success Metrics

1. **TypeScript compilation succeeds** without manual type definitions
2. **IDE autocomplete works** for all onto\_ tables
3. **Developers can find** ontology tables easily
4. **No schema-related bugs** in production

### Rollback Plan

If this decision proves problematic:

1. Create new migration to move tables to `onto` schema
2. Update all code to use `onto.xxx` syntax
3. Add manual TypeScript type definitions
4. Document schema in CLAUDE.md

**Likelihood of rollback**: Very low (user explicitly requested this pattern)

## References

- [Supabase Schema Design](https://supabase.com/docs/guides/database/schema)
- [PostgreSQL Schema Best Practices](https://www.postgresql.org/docs/current/ddl-schemas.html)
- BuildOS CLAUDE.md documentation guidelines
- User feedback from implementation review

## Notes

This decision was made mid-implementation after user review identified the architectural issue. The quick identification and correction prevented shipping a pattern that would have required a large refactor later.

**Key lesson**: Always verify schema design matches codebase patterns and tooling expectations before implementing large migrations.

---

**Approved by**: User (explicit request)
**Implemented**: 2025-11-01
**Status**: Code complete, testing pending
