<!-- apps/web/docs/features/ontology/VERSIONING_IMPLEMENTATION_TASKS.md -->

# Ontology Versioning Implementation Tasks

## Overview

This document tracks all tasks required to implement proper versioning for the ontology system. Tasks are organized by phase with clear dependencies and acceptance criteria.

**Total Estimated Time:** 10 development days
**Priority:** HIGH - Critical for "Palantir of projects" vision
**Start Date:** TBD
**Target Completion:** TBD

---

## Phase 1: Core Versioning Infrastructure (3 days)

### 1.1 Create Versioning Service Layer ⬜

**File:** `/apps/web/src/lib/services/ontology/versioning.service.ts`
**Estimated Time:** 4 hours

**Tasks:**

- [ ] Create OntologyVersioningService class
- [ ] Implement createOutputVersion method
- [ ] Implement createDocumentVersion method
- [ ] Implement getNextVersionNumber logic
- [ ] Implement generateChangeSummary helper
- [ ] Implement createVersionEdges for lineage tracking

**Acceptance Criteria:**

- Service creates versions with sequential numbers
- Versions include proper metadata and snapshots
- Edge relationships created automatically

---

### 1.2 Fix Output Update Endpoints ⬜

**File:** `/apps/web/src/routes/api/onto/outputs/[id]/+server.ts`
**Estimated Time:** 2 hours

**Tasks:**

- [ ] Import versioning service
- [ ] Add version creation before update in PATCH handler
- [ ] Return version number in response
- [ ] Add transaction support for atomicity
- [ ] Handle version creation errors

**Code Location:** Lines 13-112 (PATCH handler)

**Acceptance Criteria:**

- Every update creates a new version
- Version number returned in API response
- Rollback on version creation failure

---

### 1.3 Fix Document Update Endpoints ⬜

**File:** `/apps/web/src/routes/api/onto/documents/[id]/+server.ts`
**Estimated Time:** 2 hours

**Tasks:**

- [ ] Import versioning service
- [ ] Add version creation before update in PATCH handler
- [ ] Return version number in response
- [ ] Add transaction support
- [ ] Handle version creation errors

**Code Location:** Lines 105-195 (PATCH handler)

**Acceptance Criteria:**

- Every document update creates a new version
- Version includes body_markdown content
- Embeddings generated for searchability

---

### 1.4 Fix Output Creation Endpoints ⬜

**Files:**

- `/apps/web/src/routes/api/onto/outputs/create/+server.ts`
- `/apps/web/src/lib/server/fsm/actions/create-output.ts`
- `/apps/web/src/lib/services/ontology/instantiation.service.ts`

**Estimated Time:** 3 hours

**Tasks:**

- [ ] Add initial version creation in create endpoint
- [ ] Add version creation in FSM action
- [ ] Add version creation in instantiation service
- [ ] Ensure version 1 is created for all new outputs

**Acceptance Criteria:**

- New outputs get version 1 automatically
- Version metadata indicates "initial version"
- Consistent across all creation paths

---

### 1.5 Fix Document Creation Endpoints ⬜

**Files:**

- `/apps/web/src/routes/api/onto/documents/create/+server.ts`
- `/apps/web/src/routes/api/onto/tasks/[id]/documents/+server.ts`

**Estimated Time:** 2 hours

**Tasks:**

- [ ] Add initial version creation for new documents
- [ ] Ensure FSM action continues to work
- [ ] Add version creation for task documents
- [ ] Maintain backward compatibility

**Acceptance Criteria:**

- All document creation paths create version 1
- FSM action doesn't create duplicate versions
- Task documents are versioned

---

### 1.6 Data Migration Script ⬜

**File:** `/supabase/migrations/[timestamp]_add_initial_versions.sql`
**Estimated Time:** 3 hours

**Tasks:**

- [ ] Create migration script for existing outputs
- [ ] Create migration script for existing documents
- [ ] Create edge relationships for migrated versions
- [ ] Add indexes for performance
- [ ] Test migration on sample data
- [ ] Create rollback script

**Acceptance Criteria:**

- All existing entities get version 1
- No data loss during migration
- Migration is idempotent
- Can rollback if needed

---

### 1.7 Unit Tests for Versioning Service ⬜

**File:** `/apps/web/src/lib/services/ontology/versioning.service.test.ts`
**Estimated Time:** 4 hours

**Tasks:**

- [ ] Test version creation for outputs
- [ ] Test version creation for documents
- [ ] Test version number incrementing
- [ ] Test change summary generation
- [ ] Test edge relationship creation
- [ ] Test error handling

**Acceptance Criteria:**

- > 90% code coverage
- All edge cases tested
- Mock Supabase properly

---

## Phase 2: API Layer (2 days)

### 2.1 Version List Endpoints ⬜

**Files:**

- `/apps/web/src/routes/api/onto/outputs/[id]/versions/+server.ts`
- `/apps/web/src/routes/api/onto/documents/[id]/versions/+server.ts`

**Estimated Time:** 3 hours

**Tasks:**

- [ ] Create GET handler for output versions
- [ ] Create GET handler for document versions
- [ ] Implement pagination support
- [ ] Add filtering by tags
- [ ] Add sorting options
- [ ] Return metadata summary

**Acceptance Criteria:**

- Returns paginated version list
- Includes change summaries
- Sorted by version number descending

---

### 2.2 Version Retrieval Endpoints ⬜

**Files:**

- `/apps/web/src/routes/api/onto/outputs/[id]/versions/[number]/+server.ts`
- `/apps/web/src/routes/api/onto/documents/[id]/versions/[number]/+server.ts`

**Estimated Time:** 2 hours

**Tasks:**

- [ ] Create GET handler for specific output version
- [ ] Create GET handler for specific document version
- [ ] Fetch content from storage_uri if needed
- [ ] Return complete version data
- [ ] Handle version not found

**Acceptance Criteria:**

- Returns complete version data
- Handles large content from storage
- Proper 404 for missing versions

---

### 2.3 Version Comparison Endpoints ⬜

**Files:**

- `/apps/web/src/routes/api/onto/outputs/[id]/versions/compare/+server.ts`
- `/apps/web/src/routes/api/onto/documents/[id]/versions/compare/+server.ts`

**Estimated Time:** 4 hours

**Tasks:**

- [ ] Create POST handler for output comparison
- [ ] Create POST handler for document comparison
- [ ] Implement diff generation
- [ ] Calculate diff statistics
- [ ] Optimize for performance

**Acceptance Criteria:**

- Returns field-by-field diffs
- Includes line-level changes
- Summary statistics provided

---

### 2.4 Version Restore Endpoints ⬜

**Files:**

- `/apps/web/src/routes/api/onto/outputs/[id]/restore/[number]/+server.ts`
- `/apps/web/src/routes/api/onto/documents/[id]/restore/[number]/+server.ts`

**Estimated Time:** 3 hours

**Tasks:**

- [ ] Create POST handler for output restore
- [ ] Create POST handler for document restore
- [ ] Create new version for restore operation
- [ ] Update main entity record
- [ ] Add restore metadata
- [ ] Handle restore failures

**Acceptance Criteria:**

- Creates new version with restore metadata
- Updates main entity to restored state
- Maintains audit trail
- Atomic operation

---

### 2.5 API Integration Tests ⬜

**File:** `/apps/web/src/routes/api/onto/versions.test.ts`
**Estimated Time:** 4 hours

**Tasks:**

- [ ] Test version creation on updates
- [ ] Test version list pagination
- [ ] Test version comparison
- [ ] Test version restore
- [ ] Test error scenarios
- [ ] Test permissions

**Acceptance Criteria:**

- All endpoints tested
- Error cases covered
- Performance benchmarks met

---

## Phase 3: UI Components (3 days)

### 3.1 VersionHistoryModal Component ⬜

**File:** `/apps/web/src/lib/components/ontology/VersionHistoryModal.svelte`
**Estimated Time:** 6 hours

**Tasks:**

- [ ] Create modal component structure
- [ ] Implement version list loading
- [ ] Add version navigation controls
- [ ] Integrate DiffView component
- [ ] Add restore functionality
- [ ] Handle loading and error states
- [ ] Add keyboard navigation

**Acceptance Criteria:**

- Shows version history with navigation
- Displays diffs between versions
- Restore button with confirmation
- Responsive design
- Dark mode support

---

### 3.2 VersionIndicator Component ⬜

**File:** `/apps/web/src/lib/components/ontology/VersionIndicator.svelte`
**Estimated Time:** 2 hours

**Tasks:**

- [ ] Create indicator component
- [ ] Show version number and timestamp
- [ ] Add click handler to open history
- [ ] Style for different states
- [ ] Add loading state
- [ ] Support compact and expanded views

**Acceptance Criteria:**

- Shows current version number
- Displays last update time
- Clickable to open history
- Responsive sizing

---

### 3.3 Enhanced DiffView for Ontology ⬜

**File:** `/apps/web/src/lib/components/ontology/OntologyDiffView.svelte`
**Estimated Time:** 4 hours

**Tasks:**

- [ ] Extend base DiffView component
- [ ] Add field-specific formatting
- [ ] Handle JSON/markdown content
- [ ] Add syntax highlighting
- [ ] Optimize for long content
- [ ] Add expand/collapse for fields

**Acceptance Criteria:**

- Clear visual diff display
- GitHub-like appearance
- Handles all field types
- Performance with large diffs

---

### 3.4 Integration in Output Views ⬜

**Files:**

- `/apps/web/src/routes/ontology/projects/[id]/outputs/+page.svelte`
- Output detail components

**Estimated Time:** 3 hours

**Tasks:**

- [ ] Add VersionIndicator to output headers
- [ ] Add VersionHistoryModal to output views
- [ ] Wire up version refresh on restore
- [ ] Update output loading to include version
- [ ] Add version to breadcrumbs
- [ ] Test integration

**Acceptance Criteria:**

- Version indicator visible on all outputs
- History modal accessible
- Restore refreshes view
- No regression in existing features

---

### 3.5 Integration in Document Views ⬜

**Files:**

- Document editor components
- Document viewer components

**Estimated Time:** 3 hours

**Tasks:**

- [ ] Add VersionIndicator to document headers
- [ ] Add VersionHistoryModal to document views
- [ ] Wire up version refresh on restore
- [ ] Update document loading to include version
- [ ] Maintain editor state through version changes
- [ ] Test integration

**Acceptance Criteria:**

- Version indicator visible on all documents
- History modal accessible
- Editor handles version changes
- No data loss on version switch

---

### 3.6 E2E Tests for UI Flows ⬜

**File:** `/tests/e2e/ontology-versioning.spec.ts`
**Estimated Time:** 4 hours

**Tasks:**

- [ ] Test version indicator display
- [ ] Test history modal opening
- [ ] Test version navigation
- [ ] Test diff display
- [ ] Test restore functionality
- [ ] Test error handling
- [ ] Test on mobile viewports

**Acceptance Criteria:**

- All UI flows tested
- Works on desktop and mobile
- Handles edge cases
- Performance benchmarks met

---

## Phase 4: Advanced Features (2 days)

### 4.1 Storage URI Implementation ⬜

**File:** `/apps/web/src/lib/services/storage/version-storage.service.ts`
**Estimated Time:** 4 hours

**Tasks:**

- [ ] Create storage service for large content
- [ ] Implement S3/Supabase storage adapter
- [ ] Add content compression
- [ ] Implement storage cleanup
- [ ] Add storage metrics
- [ ] Handle storage failures

**Acceptance Criteria:**

- Large content stored externally
- Automatic threshold detection
- Compression for efficiency
- Cleanup for old versions

---

### 4.2 Version Branching Support ⬜

**Estimated Time:** 4 hours

**Tasks:**

- [ ] Design branch schema
- [ ] Implement branch creation
- [ ] Add branch navigation UI
- [ ] Support branch merging
- [ ] Handle conflicts
- [ ] Add branch visualization

**Acceptance Criteria:**

- Can create version branches
- Navigate between branches
- Merge branches
- Conflict resolution

---

### 4.3 Batch Version Operations ⬜

**File:** `/apps/web/src/routes/api/onto/versions/batch/+server.ts`
**Estimated Time:** 3 hours

**Tasks:**

- [ ] Batch version creation
- [ ] Batch version comparison
- [ ] Batch version restore
- [ ] Bulk version export
- [ ] Performance optimization

**Acceptance Criteria:**

- Handle 100+ versions efficiently
- Atomic batch operations
- Progress reporting

---

### 4.4 Performance Optimization ⬜

**Estimated Time:** 5 hours

**Tasks:**

- [ ] Add database indexes
- [ ] Implement version caching
- [ ] Optimize diff algorithms
- [ ] Add lazy loading for history
- [ ] Implement virtual scrolling
- [ ] Add query optimization

**Acceptance Criteria:**

- < 200ms version creation
- < 500ms diff generation
- < 1s history load (100 versions)
- Smooth UI scrolling

---

## Testing & Documentation

### Documentation Updates ⬜

**Estimated Time:** 4 hours

**Tasks:**

- [ ] Update API documentation
- [ ] Create user guide for versioning
- [ ] Document migration process
- [ ] Add architecture diagrams
- [ ] Create troubleshooting guide
- [ ] Update ontology README

**Files to Update:**

- `/apps/web/docs/features/ontology/README.md`
- `/apps/web/docs/features/ontology/API_ENDPOINTS.md`
- `/apps/web/docs/features/ontology/CURRENT_STATUS.md`
- `/apps/web/docs/technical/api/onto-versioning.md`

---

### Performance Testing ⬜

**Estimated Time:** 3 hours

**Tasks:**

- [ ] Load test version creation
- [ ] Benchmark diff generation
- [ ] Test with 1000+ versions
- [ ] Memory usage analysis
- [ ] Database query profiling
- [ ] UI rendering performance

**Acceptance Criteria:**

- Meets performance targets
- No memory leaks
- Scales to 10,000+ versions

---

## Risk Mitigation

### Rollback Plan ⬜

**Tasks:**

- [ ] Create rollback migration script
- [ ] Document rollback procedure
- [ ] Test rollback on staging
- [ ] Create data backup before deployment

### Monitoring ⬜

**Tasks:**

- [ ] Add version creation metrics
- [ ] Monitor API endpoint performance
- [ ] Set up error alerts
- [ ] Create dashboard for version stats

---

## Dependencies

### External Dependencies

- Supabase database access
- DiffView component (existing)
- Modal component (existing)
- diff.ts utilities (existing)

### Team Dependencies

- Database migration approval
- API design review
- UI/UX review of components
- Security review of restore functionality

---

## Definition of Done

### For Each Task:

- [ ] Code implemented and tested
- [ ] Unit tests written and passing
- [ ] Integration tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No console errors or warnings
- [ ] Responsive design verified
- [ ] Dark mode verified
- [ ] Accessibility checked

### For Each Phase:

- [ ] All tasks completed
- [ ] E2E tests passing
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Documentation complete
- [ ] Demo prepared

### For Overall Implementation:

- [ ] All phases completed
- [ ] Full regression testing passed
- [ ] Performance targets met
- [ ] Documentation complete
- [ ] User training materials created
- [ ] Deployment successful
- [ ] Monitoring in place
- [ ] Rollback plan tested

---

## Progress Tracking

### Phase Status

- **Phase 1:** ⬜ Not Started (0/7 tasks)
- **Phase 2:** ⬜ Not Started (0/5 tasks)
- **Phase 3:** ⬜ Not Started (0/6 tasks)
- **Phase 4:** ⬜ Not Started (0/4 tasks)

**Total Progress:** 0/22 primary tasks completed

### Daily Standup Template

```
Yesterday: [What was completed]
Today: [What will be worked on]
Blockers: [Any impediments]
```

### Weekly Review Template

```
Completed This Week:
- [List of completed tasks]

In Progress:
- [Tasks being worked on]

Next Week:
- [Planned tasks]

Risks/Issues:
- [Any concerns or blockers]
```

---

## Notes

### Implementation Order

1. Start with Phase 1 - Core infrastructure is critical
2. Phase 2 can begin once 1.1-1.3 are complete
3. Phase 3 UI can be developed in parallel with Phase 2
4. Phase 4 is optional and can be deferred

### Critical Path

1.1 → 1.2/1.3 → 2.1 → 3.1 → 3.4/3.5

### Quick Wins

- 1.2 and 1.3 (Fix update endpoints) - Immediate value
- 3.2 (Version indicator) - Visual feedback
- 2.1 (Version list) - Basic history viewing

---

**Last Updated:** 2025-11-24
**Next Review:** TBD
**Owner:** Development Team
