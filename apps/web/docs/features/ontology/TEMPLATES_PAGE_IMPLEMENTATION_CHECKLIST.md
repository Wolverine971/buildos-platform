# Ontology Templates Page - Implementation Checklist

**Feature:** `/ontology/templates`
**Spec:** See `TEMPLATES_PAGE_SPEC.md`
**Date:** 2025-11-03
**Status:** Phase 1A Complete - Ready for Testing
**Last Updated:** 2025-11-03

## ✅ Implementation Status

**Phase 1A: Core Structure** - ✅ **COMPLETE**

- All route files created
- Server data loading implemented
- Basic filtering working
- TemplateCard component built with full BuildOS styling
- Navigation link added
- TypeScript errors resolved
- Ready for user testing

**Phase 1B: Enhanced Discovery** - 📋 **PENDING**

- Template detail modal (not yet started)
- Advanced features (not yet started)

---

## 🐛 Bugs Found and Fixed (2025-11-03)

During implementation and code review, the following issues were identified and resolved:

### 1. JSON Parsing Error in Server Load Function

**Error:** `Unexpected token 'p', "personal,c"... is not valid JSON`

**Location:** `/apps/web/src/routes/ontology/templates/+page.server.ts` line 81

**Problem:** Attempted to `JSON.parse()` the `allowed_values` field from `onto_facet_definitions`, but this field is already JSONB (returns as JavaScript array from Supabase, not a JSON string).

**Fix:**

```typescript
// Before (incorrect):
values: JSON.parse(facet.allowed_values);

// After (correct):
values: facet.allowed_values as string[];
```

### 2. TypeScript: Null vs Undefined in RPC Parameters

**Error:** `Type 'string | null' is not assignable to type 'string | undefined'`

**Locations:**

- `/apps/web/src/routes/api/onto/templates/+server.ts` lines 60-62
- `/apps/web/src/routes/ontology/templates/+page.server.ts` lines 29-31

**Problem:** URL search params return `string | null`, but Supabase RPC functions expect `string | undefined`.

**Fix:**

```typescript
// Before (incorrect):
await client.rpc('get_template_catalog', {
	p_scope: scope, // string | null
	p_realm: realm, // string | null
	p_search: search // string | null
});

// After (correct):
await client.rpc('get_template_catalog', {
	p_scope: scope ?? undefined,
	p_realm: realm ?? undefined,
	p_search: search ?? undefined
});
```

### 3. TypeScript: Array Access After Conditional Check

**Error:** `Object is possibly 'undefined'`

**Locations:**

- `/apps/web/src/routes/ontology/templates/+page.server.ts` line 60 (byScope grouping)
- `/apps/web/src/routes/ontology/templates/+page.server.ts` line 106 (facetValueMap)

**Problem:** TypeScript doesn't understand that the conditional check (`if (!acc[key])`) guarantees the array exists before pushing.

**Fix:**

```typescript
// Before (incorrect):
if (!acc[template.scope]) {
	acc[template.scope] = [];
}
acc[template.scope].push(template); // Error: possibly undefined

// After (correct):
if (!acc[template.scope]) {
	acc[template.scope] = [];
}
acc[template.scope]!.push(template); // Non-null assertion
```

### 4. TypeScript: Nullable Database Columns

**Error:** `Type 'string | null' is not assignable to type 'string'`

**Location:** `/apps/web/src/routes/ontology/templates/+page.server.ts` lines 109-111

**Problem:** Database columns `description`, `color`, and `icon` in `onto_facet_values` are nullable, but our type expects non-null strings.

**Fix:**

```typescript
// Before (incorrect):
acc[fv.facet_key]!.push({
	description: fv.description, // string | null
	color: fv.color, // string | null
	icon: fv.icon // string | null
});

// After (correct):
acc[fv.facet_key]!.push({
	description: fv.description ?? '',
	color: fv.color ?? '',
	icon: fv.icon ?? ''
});
```

### 5. TypeScript: Incorrect User Property Reference

**Error:** `Property 'role' does not exist on type ...`

**Location:** `/apps/web/src/routes/ontology/templates/+page.server.ts` line 146

**Problem:** Attempted to access `user.role` but the correct property is `user.is_admin`.

**Fix:**

```typescript
// Before (incorrect):
isAdmin: user.role === 'admin';

// After (correct):
isAdmin: user.is_admin ?? false;
```

### Summary of Fixes

- ✅ Fixed JSON parsing of JSONB database columns
- ✅ Fixed null vs undefined type mismatches for RPC calls
- ✅ Added non-null assertions for TypeScript array access
- ✅ Added null coalescing for nullable database columns
- ✅ Fixed user property reference (role → is_admin)
- ✅ All TypeScript errors resolved
- ✅ No runtime errors expected

**Testing Status:** Ready for user testing at `/ontology/templates`

---

## Quick Start Guide

### What to Build First

**Phase 1A: Minimum Viable Browse (Week 1)**

This gets the page functional with basic browsing:

1. Create route files
2. Load and display templates
3. Basic filtering
4. Template cards
5. Navigation to create flow

**Phase 1B: Enhanced Discovery (Week 2)**

Add polish and usability:

6. Template detail modal
7. Advanced filters
8. Search functionality
9. Responsive design
10. Empty states

---

## Implementation Checklist

### ✅ Prerequisites

- [ ] Verify `/api/onto/templates` endpoint is working
- [ ] Verify `onto_templates` table has seed data
- [ ] Verify `onto_facet_definitions` and `onto_facet_values` are populated
- [ ] Review existing `/ontology/create` page to understand patterns
- [ ] Check if user has necessary permissions

---

### 📁 Phase 1A: Core Structure (4-6 hours)

#### Step 1: Create Route Files (30 minutes)

- [ ] Create `/apps/web/src/routes/ontology/templates/+page.server.ts`
- [ ] Create `/apps/web/src/routes/ontology/templates/+page.svelte`
- [ ] Add route to navigation menu if needed

**Files to create:**

```
apps/web/src/routes/ontology/templates/
├── +page.server.ts
└── +page.svelte
```

#### Step 2: Server Data Loading (1 hour)

**In `+page.server.ts`:**

- [ ] Import necessary types (`Template`, `PageServerLoad`)
- [ ] Check user authentication
- [ ] Fetch templates via `/api/onto/templates` endpoint
- [ ] Group templates by realm
- [ ] Group templates by scope
- [ ] Load facet definitions
- [ ] Load facet values with metadata
- [ ] Parse current filters from URL params
- [ ] Return structured data object

**Test:**

- [ ] Navigate to `/ontology/templates` and verify no errors
- [ ] Check browser console for data object
- [ ] Verify templates are loaded

#### Step 3: Basic Page Layout (1 hour)

**In `+page.svelte`:**

- [ ] Add page header with title and description
- [ ] Show template count
- [ ] Add "New Template" button (admin only)
- [ ] Create basic grid layout for templates
- [ ] Add empty state (no templates)

**Test:**

- [ ] Page renders without errors
- [ ] Header shows correct title
- [ ] Template count displays
- [ ] Admin button shows/hides correctly

#### Step 4: Template Card Component (2 hours)

- [ ] Create `/apps/web/src/lib/components/ontology/templates/TemplateCard.svelte`
- [ ] Display template name
- [ ] Display type_key (monospace)
- [ ] Display description (truncated)
- [ ] Display realm badge
- [ ] Display scope badge
- [ ] Display facet defaults as badges
- [ ] Add "View Details" button
- [ ] Add "Create Project" button (for project templates only)
- [ ] Add hover effects
- [ ] Style with Tailwind (consistent with existing cards)

**Template Card Content:**

```
┌─────────────────────────────────────┐
│ Template Name            [Scope]    │
│ type.key                            │
│ ─────────────────────────────────── │
│ Description text here...            │
│                                     │
│ 🏷️ Realm Badge                      │
│ 🔖 Facet Badges                     │
│                                     │
│ [View Details] [Create Project]     │
└─────────────────────────────────────┘
```

**Test:**

- [ ] Card displays all information
- [ ] Badges render correctly
- [ ] Buttons are clickable
- [ ] Hover effects work
- [ ] Responsive on mobile

#### Step 5: Basic Filtering (1 hour)

- [ ] Add scope filter dropdown
- [ ] Add realm filter dropdown
- [ ] Add "Clear Filters" button
- [ ] Wire filters to URL params
- [ ] Update page on filter change (no page reload)

**Test:**

- [ ] Filters update templates shown
- [ ] URL params update correctly
- [ ] Clear filters works
- [ ] Browser back/forward works

---

### 🎨 Phase 1B: Enhanced Discovery (6-8 hours)

#### Step 6: Template Detail Modal (3 hours)

- [ ] Create `TemplateDetailModal.svelte`
- [ ] Add tabbed interface (Overview, FSM, Schema)
- [ ] **Overview tab:**
    - [ ] Show full description
    - [ ] Show metadata (realm, output_type, typical_scale, keywords)
    - [ ] Show facet defaults
    - [ ] Show inheritance info (if has parent)
    - [ ] Show usage stats (number of projects)
- [ ] **FSM tab:**
    - [ ] List states
    - [ ] List transitions with from/to/event
    - [ ] Show guards for each transition
    - [ ] Show actions for each transition
    - [ ] Visual diagram (simple text-based first, then SVG)
- [ ] **Schema tab:**
    - [ ] Show JSON schema properties
    - [ ] Format nicely (not raw JSON)
    - [ ] Highlight required fields
- [ ] Add "Create Project" button in modal
- [ ] Add close button
- [ ] Add keyboard shortcuts (Escape to close)
- [ ] Handle modal focus management

**Test:**

- [ ] Modal opens from card
- [ ] All tabs work
- [ ] Data displays correctly
- [ ] Create project button works
- [ ] Escape key closes modal
- [ ] Focus returns to trigger element

#### Step 7: Advanced Filters (2 hours)

- [ ] Create `TemplateFilters.svelte` component
- [ ] Add search input with debounce
- [ ] Add facet filters (context, scale, stage)
- [ ] Add multi-select support for facets
- [ ] Add filter count badges
- [ ] Add "View Mode" toggle (realm vs scope grouping)
- [ ] Style filter panel (can be sidebar or top bar)
- [ ] Make filters collapsible on mobile

**Test:**

- [ ] Search filters templates instantly
- [ ] Facet filters work
- [ ] Multiple facets can be selected
- [ ] Filter counts update
- [ ] View mode toggle works
- [ ] Responsive on mobile

#### Step 8: Search Functionality (1 hour)

- [ ] Implement client-side search (for speed)
- [ ] Search across: name, type_key, description, keywords
- [ ] Highlight search terms in results
- [ ] Show "No results" message
- [ ] Add search suggestions (optional)

**Test:**

- [ ] Search finds correct templates
- [ ] Search is case-insensitive
- [ ] Search updates in real-time
- [ ] No results message shows
- [ ] Cleared search shows all templates

#### Step 9: Polish & Responsive (1 hour)

- [ ] Test on mobile devices
- [ ] Test on tablets
- [ ] Fix any layout issues
- [ ] Add loading states
- [ ] Add error states
- [ ] Add animations/transitions
- [ ] Test dark mode

**Test:**

- [ ] Works on iPhone
- [ ] Works on Android
- [ ] Works on iPad
- [ ] Loading spinners show
- [ ] Errors display nicely
- [ ] Dark mode looks good

#### Step 10: Edge Cases & Error Handling (1 hour)

- [ ] Handle no templates in database
- [ ] Handle API failures gracefully
- [ ] Handle slow network (show loading)
- [ ] Handle invalid filter combinations
- [ ] Handle very long template names/descriptions
- [ ] Handle missing metadata fields
- [ ] Add error boundaries

**Test:**

- [ ] Empty database shows message
- [ ] API errors show user-friendly message
- [ ] Loading states work
- [ ] Long text truncates properly
- [ ] Missing data doesn't break page

---

### 🔧 Phase 2: Admin Features (Later)

#### Template Management

- [ ] Create `/ontology/templates/new` route
- [ ] Create template creation form
- [ ] Add JSON schema builder UI
- [ ] Add FSM visual editor
- [ ] Add template validation
- [ ] Create `/ontology/templates/[id]/edit` route
- [ ] Add edit functionality
- [ ] Add template promotion (draft → active)
- [ ] Add template deprecation

#### Analytics

- [ ] Add usage statistics to template cards
- [ ] Create template analytics dashboard
- [ ] Track template popularity
- [ ] Monitor template health

---

## Testing Checklist

### Unit Tests

- [ ] TemplateCard renders correctly
- [ ] TemplateFilters updates URL correctly
- [ ] Search function filters correctly
- [ ] Modal opens/closes correctly

### Integration Tests

- [ ] Full page loads with data
- [ ] Filtering works end-to-end
- [ ] Navigation to create flow works
- [ ] Modal → Create flow works

### E2E Tests (Playwright)

- [ ] User can browse templates
- [ ] User can filter by scope
- [ ] User can search templates
- [ ] User can open template detail
- [ ] User can create project from template

### Performance Tests

- [ ] Page loads < 2 seconds with 100 templates
- [ ] Filter response < 100ms
- [ ] Search response < 300ms

### Accessibility Tests

- [ ] Keyboard navigation works
- [ ] Screen reader announces correctly
- [ ] Focus management in modal
- [ ] Color contrast meets WCAG AA

---

## File Checklist

### Routes

```
✅ apps/web/src/routes/ontology/templates/
   ├── ✅ +page.server.ts
   ├── ✅ +page.svelte
   ├── ⬜ new/+page.server.ts (Phase 2)
   ├── ⬜ new/+page.svelte (Phase 2)
   └── ⬜ [id]/
       ├── ⬜ +page.server.ts (Phase 2)
       ├── ⬜ +page.svelte (Phase 2)
       └── ⬜ edit/
           ├── ⬜ +page.server.ts (Phase 2)
           └── ⬜ +page.svelte (Phase 2)
```

### Components

```
✅ apps/web/src/lib/components/ontology/templates/
   ├── ✅ TemplateCard.svelte
   ├── ✅ TemplateFilters.svelte
   ├── ✅ TemplateDetailModal.svelte
   ├── ⬜ TemplateFSMDiagram.svelte
   ├── ⬜ TemplateSchemaView.svelte
   ├── ⬜ TemplateInheritance.svelte
   ├── ⬜ CreateTemplateForm.svelte (Phase 2)
   └── ⬜ EditTemplateForm.svelte (Phase 2)
```

### Services

```
⬜ apps/web/src/lib/services/ontology/
   ├── ⬜ template.service.ts (if needed)
   └── ⬜ fsm-diagram.service.ts (for visualization)
```

### Tests

```
⬜ apps/web/src/lib/components/ontology/templates/
   ├── ⬜ TemplateCard.test.ts
   ├── ⬜ TemplateFilters.test.ts
   └── ⬜ TemplateDetailModal.test.ts

⬜ apps/web/tests/e2e/
   └── ⬜ ontology-templates.spec.ts
```

---

## Dependencies

### External Packages (if needed)

```bash
# For FSM visualization (optional)
pnpm add d3 @types/d3

# For JSON schema rendering (optional)
pnpm add react-json-view
```

### Internal Dependencies

- ✅ `/api/onto/templates` - Already exists
- ✅ `$lib/types/onto.ts` - Already exists
- ✅ `createAdminSupabaseClient` - Already exists
- ✅ Existing Tailwind theme - Already configured

---

## Quick Commands

```bash
# Start development
pnpm run dev:split

# Test the page
open http://localhost:5173/ontology/templates

# Run tests
pnpm test

# Type check
pnpm check

# Build
pnpm build
```

---

## Success Criteria

**Phase 1A Complete When:**

- [ ] User can navigate to `/ontology/templates`
- [ ] User sees list of templates grouped by realm
- [ ] User can filter by scope
- [ ] User can click "Create Project" from a template card
- [ ] User is redirected to create flow with pre-selected template

**Phase 1B Complete When:**

- [ ] User can view template details in modal
- [ ] User can search templates
- [ ] User can filter by multiple facets
- [ ] Page is responsive on mobile
- [ ] All edge cases handled gracefully

**Ready for Production When:**

- [ ] All Phase 1A + 1B items complete
- [ ] All tests passing
- [ ] Performance metrics met
- [ ] Accessibility requirements met
- [ ] Code review approved
- [ ] Documentation updated

---

## Next Steps After Implementation

1. **Monitor Usage:**
    - Track which templates are viewed most
    - Track template → project conversion rate
    - Gather user feedback

2. **Iterate:**
    - Add most-requested features from Phase 2
    - Improve based on usage patterns
    - Refine filters based on user behavior

3. **Expand:**
    - Add template creation UI (admin)
    - Add template analytics dashboard
    - Build template marketplace

---

## Support & Questions

**If you need help:**

- Review the full spec: `TEMPLATES_PAGE_SPEC.md`
- Check existing patterns in `/ontology/create`
- Reference the master plan: `/thoughts/shared/ideas/ontology/buildos-ontology-master-plan.md`
- Look at API docs: `/thoughts/shared/ideas/ontology/endpoint-stubs.md`

**Common Issues:**

- Templates not loading? Check database has seed data
- Filters not working? Check URL param handling
- Modal not opening? Check event handlers and state management
- Styles broken? Verify Tailwind classes match existing patterns

---

**Last Updated:** 2025-11-03
**Status:** Ready for development
