# Braindump Deletion Feature Implementation Plan

## Feature Overview

Enable users to delete braindumps from the `/history` page with proper data cleanup, user confirmation, and audit logging.

## Current State Analysis

### Existing Infrastructure

- **DELETE endpoint exists**: `/api/braindumps/[id]/+server.ts` (lines 119-147)
- **Current functionality**:
    - Deletes `brain_dump_links` records
    - Hard deletes the braindump record
- **Missing functionality**:
    - No UI implementation on `/history` page
    - Incomplete data cleanup (missing `project_questions` handling)
    - No user confirmation dialog
    - No audit logging
    - No soft delete option

### Database Relationships

```sql
-- Direct Foreign Key References to brain_dumps
brain_dump_links.brain_dump_id → brain_dumps.id
project_questions.answer_brain_dump_id → brain_dumps.id
error_logs.brain_dump_id → brain_dumps.id

-- Related Data Created by Braindumps (via parsed_results)
projects (if created)
tasks (if created)
notes (if created)
```

## Implementation Plan

### Phase 1: Backend Improvements ✅ Priority: HIGH

#### 1.1 Update DELETE Endpoint

**File**: `/routes/api/braindumps/[id]/+server.ts`

**Changes Required**:

```typescript
// Add before deletion:
1. Clear project_questions references
2. Add audit logging
3. Return metadata about what was deleted
```

**Specific Updates**:

- [ ] Clear `answer_brain_dump_id` in `project_questions` table
- [ ] Add user activity logging for audit trail
- [ ] Return deletion summary (links cleared, questions affected, etc.)
- [ ] Add proper error handling for cascade failures

#### 1.2 Add Validation Endpoint (Optional)

**File**: `/routes/api/braindumps/[id]/validate-delete/+server.ts`

**Purpose**: Check what will be affected before deletion

- [ ] Count linked items (tasks, notes, projects)
- [ ] Check for answered questions
- [ ] Return warning messages if needed

### Phase 2: Frontend UI Implementation ✅ Priority: HIGH

#### 2.1 Add Delete Button

**Location Options**:

1. **BraindumpCard component** (preferred for quick access)
2. **BraindumpModal component** (for detailed view)
3. **Both locations** (best UX)

**File**: `/lib/components/history/BraindumpCard.svelte`

```svelte
<!-- Add delete button with proper styling -->
<button on:click|stopPropagation={handleDelete} class="delete-btn" aria-label="Delete braindump">
	<Trash2 class="h-4 w-4" />
</button>
```

#### 2.2 Create Confirmation Dialog

**New File**: `/lib/components/history/BraindumpDeleteDialog.svelte`

**Features**:

- [ ] Modal overlay with escape key handling
- [ ] Show braindump title and date
- [ ] Display affected items count
- [ ] Warning message about permanence
- [ ] Cancel and Confirm buttons
- [ ] Loading state during deletion

#### 2.3 Update History Page

**File**: `/routes/history/+page.svelte`

**Updates Required**:

- [ ] Import and use delete dialog component
- [ ] Add delete handler function
- [ ] Remove item from UI after successful deletion
- [ ] Show success/error toast notifications
- [ ] Handle optimistic updates

### Phase 3: Enhanced User Experience ✅ Priority: MEDIUM

#### 3.1 Loading States

- [ ] Disable delete button during operation
- [ ] Show spinner in confirmation dialog
- [ ] Prevent multiple deletion attempts

#### 3.2 Error Handling

- [ ] Specific error messages for different failure types
- [ ] Retry mechanism for network failures
- [ ] Graceful degradation if partial deletion

#### 3.3 Success Feedback

- [ ] Animate item removal from list
- [ ] Show success toast with undo option (if soft delete)
- [ ] Update contribution chart if needed

### Phase 4: Optional Enhancements 🔄 Priority: LOW

#### 4.1 Soft Delete Implementation

**Database Changes**:

```sql
ALTER TABLE brain_dumps ADD COLUMN deleted_at TIMESTAMP;
```

**Benefits**:

- Recovery option within grace period
- Audit trail preservation
- Undo functionality

#### 4.2 Bulk Operations

- [ ] Select multiple braindumps
- [ ] Bulk delete with single confirmation
- [ ] Progress indicator for multiple deletions

#### 4.3 Export Before Delete

- [ ] Download braindump content as markdown
- [ ] Include linked items in export
- [ ] Automatic backup option

## Technical Specifications

### API Response Format

```typescript
// DELETE /api/braindumps/[id]
interface DeleteBraindumpResponse {
	success: boolean;
	deleted: {
		braindump_id: string;
		title: string;
		links_cleared: number;
		questions_affected: number;
	};
	warnings?: string[];
}
```

### UI Component Props

```typescript
interface BraindumpDeleteDialogProps {
	braindump: {
		id: string;
		title: string;
		created_at: string;
		content?: string;
	};
	linkedCounts?: {
		projects: number;
		tasks: number;
		notes: number;
		questions: number;
	};
	onConfirm: () => Promise<void>;
	onCancel: () => void;
}
```

## Implementation Steps

### Step 1: Backend Foundation (1-2 hours)

1. Update DELETE endpoint with complete cleanup
2. Add activity logging
3. Test with various braindump states

### Step 2: Basic UI (2-3 hours)

1. Add delete button to BraindumpCard
2. Create confirmation dialog component
3. Wire up deletion flow with basic error handling

### Step 3: Polish & Error Handling (1-2 hours)

1. Add loading states and animations
2. Implement comprehensive error handling
3. Add success notifications

### Step 4: Testing (1 hour)

1. Test deletion of braindumps with various link types
2. Test error scenarios (network failure, permissions)
3. Test UI responsiveness and accessibility

## Edge Cases & Considerations

### Critical Scenarios

1. **Braindump with created projects**: Warn user that projects won't be deleted
2. **Processing braindumps**: Block deletion or show special warning
3. **Braindumps with errors**: Allow deletion but log for debugging
4. **Concurrent deletions**: Prevent race conditions

### Data Integrity

- Orphaned records in `brain_dump_links` (cleaned up)
- Questions losing their answer reference (acceptable)
- Error logs preservation (keep for debugging)

### Performance

- Deletion should complete within 2 seconds
- UI should update optimistically
- Background cleanup for large datasets

## Success Metrics

- Users can successfully delete unwanted braindumps
- No orphaned data in database
- Clear user feedback throughout process
- No data loss for created items (projects, tasks, notes)

## Rollback Plan

If issues arise:

1. Disable delete button in UI (feature flag)
2. Keep existing endpoint functional
3. Manual database cleanup if needed

## Future Considerations

- Batch deletion interface
- Automated cleanup of old braindumps
- Admin tools for braindump management
- Integration with backup/export system

## Dependencies

- Existing braindump API service
- Toast notification system
- Modal/dialog components
- Database foreign key constraints

## Timeline

- **Phase 1**: 2-3 hours (Backend)
- **Phase 2**: 3-4 hours (Frontend)
- **Phase 3**: 2 hours (UX Polish)
- **Phase 4**: Optional, as needed

**Total Estimate**: 7-9 hours for complete implementation

## Testing Checklist

- [ ] Delete braindump with no links
- [ ] Delete braindump with project links
- [ ] Delete braindump with task links
- [ ] Delete braindump with note links
- [ ] Delete braindump that answered questions
- [ ] Delete braindump with error logs
- [ ] Cancel deletion flow
- [ ] Network error during deletion
- [ ] Permission denied scenario
- [ ] Rapid successive deletions
- [ ] Delete from modal view
- [ ] Delete from card view
- [ ] Accessibility testing (keyboard, screen reader)

## Documentation Updates

- [ ] Update API documentation
- [ ] Add deletion flow to user guide
- [ ] Document data retention policy
- [ ] Update troubleshooting guide
