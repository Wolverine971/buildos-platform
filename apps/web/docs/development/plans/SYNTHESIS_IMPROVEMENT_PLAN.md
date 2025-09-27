# Project Synthesis Improvement Plan

**Created**: 2025-09-14
**Status**: Ready for Implementation
**Priority**: High

## Executive Summary

The synthesis feature requires critical bug fixes and performance optimizations. This plan prioritizes data integrity fixes, then performance improvements, followed by UX enhancements.

## Critical Bugs to Fix (P0 - Immediate)

### 1. Fix DELETE Endpoint Data Loss Bug

**File**: `src/routes/api/projects/[id]/synthesize/+server.ts:177-218`
**Issue**: Deletes ALL synthesis records instead of the most recent
**Fix**: Add ID parameter or use specific record selection
**Effort**: 1 hour

### 2. Fix PUT Endpoint Wrong Record Update

**File**: `src/routes/api/projects/[id]/synthesize/+server.ts:119-174`
**Issue**: Updates arbitrary "most recent" record without ID validation
**Fix**: Require synthesis ID in request body and validate ownership
**Effort**: 1 hour

### 3. Fix GET Endpoint Duplicate Handling

**File**: `src/routes/api/projects/[id]/synthesize/+server.ts:71-116`
**Issue**: Uses `maybeSingle()` which fails if duplicates exist
**Fix**: Use `.limit(1)` with proper ordering or handle duplicates gracefully
**Effort**: 30 minutes

### 4. Add Database Transaction Support

**Files**: `src/lib/services/projectSynthesis.service.ts:314-360`
**Issue**: Operations can partially fail without rollback
**Fix**: Wrap executeOperations in database transaction
**Effort**: 2 hours

### 5. Fix Memory Leak in Date Cache

**File**: `src/lib/components/project/ProjectSynthesis.svelte:94-101`
**Issue**: Cache never fully clears, only reduces to 25 items
**Fix**: Implement proper LRU cache or use WeakMap
**Effort**: 1 hour

## High Priority Performance Fixes (P1 - This Week)

### 6. Implement LLM Response Caching

**File**: `src/lib/services/llm-pool.ts`
**Implementation**:

- Add cache layer with 5-minute TTL
- Key by prompt hash + options
- Expected improvement: 50-80% latency reduction for regenerations
  **Effort**: 4 hours

### 7. Optimize Heavy Reactive Statements

**File**: `src/lib/components/project/ProjectSynthesis.svelte:111-131`
**Fix**:

- Split complex reactive chains
- Use explicit dependencies
- Add memoization for expensive computations
  **Effort**: 2 hours

### 8. Add Database Indexes for Synthesis

**Implementation**:

```sql
CREATE INDEX idx_project_synthesis_lookup
ON project_synthesis(project_id, user_id, status, created_at DESC);

CREATE INDEX idx_tasks_synthesis
ON tasks(project_id, user_id, status)
WHERE deleted_at IS NULL;
```

**Effort**: 1 hour

### 9. Batch Database Operations

**File**: `src/lib/services/projectSynthesis.service.ts:329-357`
**Fix**: Group operations by type and execute in batches
**Expected improvement**: 40-60% faster execution
**Effort**: 3 hours

### 10. Add Component Memoization

**File**: `src/lib/components/synthesis/TaskMappingView.svelte:39-85`
**Fix**: Memoize expensive consolidation/update calculations
**Effort**: 2 hours

## Medium Priority Improvements (P2 - Next Sprint)

### 11. Replace Alert() with Toast Notifications

**Files**: Multiple locations in ProjectSynthesis.svelte
**Fix**: Use consistent toast notifications for all user feedback
**Effort**: 2 hours

### 12. Add User-Isolated localStorage Drafts

**File**: `src/lib/components/project/ProjectSynthesis.svelte:361-368`
**Fix**: Include user ID in localStorage key
**Effort**: 1 hour

### 13. Implement Synthesis Locking

**Fix**: Add pessimistic locking to prevent concurrent synthesis
**Implementation**: Use database advisory locks or synthesis status checks
**Effort**: 3 hours

### 14. Add Request Cancellation Support

**Files**: API endpoints and frontend
**Implementation**: Use AbortController for fetch requests
**Effort**: 2 hours

### 15. Split Large Components

**File**: `src/lib/components/project/ProjectSynthesis.svelte`
**Fix**: Extract phases into separate components
**Effort**: 4 hours

## Long-term Enhancements (P3 - Future)

### 16. Implement Streaming LLM Responses

**Implementation**:

- Use Server-Sent Events or WebSockets
- Show progressive synthesis generation
  **Effort**: 8 hours

### 17. Add WebSocket Real-time Updates

**Implementation**:

- Real-time synthesis progress
- Live operation application status
  **Effort**: 12 hours

### 18. Create Synthesis History/Versioning

**Implementation**:

- Track all synthesis versions
- Allow comparison and rollback
  **Effort**: 8 hours

### 19. Add Background Processing Queue

**Implementation**:

- Move synthesis to background jobs
- Notify user when complete
  **Effort**: 16 hours

### 20. Implement Multi-level Caching

**Implementation**:

- CDN caching for static synthesis UI
- API response caching with ETags
- Database query result caching
  **Effort**: 12 hours

## Testing Requirements

### Unit Tests Needed

- [ ] API endpoint validation tests
- [ ] Operation execution with rollback tests
- [ ] Cache invalidation tests
- [ ] Reactive statement performance tests

### Integration Tests Needed

- [ ] Full synthesis flow with large projects
- [ ] Concurrent synthesis handling
- [ ] Error recovery scenarios
- [ ] Auto-save and draft restoration

### Performance Tests Needed

- [ ] Load testing with 100+ tasks
- [ ] Memory usage profiling
- [ ] LLM response time benchmarks
- [ ] Database query performance

## Success Metrics

### Performance Targets

- **LLM Response Time**: Reduce from 15-40s to 5-15s with caching
- **UI Responsiveness**: Eliminate 2-3s blocking during updates
- **Database Queries**: 40% improvement with indexes
- **Bundle Size**: 25% reduction through code splitting
- **Memory Usage**: 30% reduction with proper cleanup

### Quality Metrics

- **Zero data loss** from API operations
- **100% transaction consistency**
- **No UI freezing** during synthesis
- **Graceful error handling** for all failures

## Implementation Order

### Phase 1: Critical Fixes (Week 1)

1. Fix DELETE/PUT/GET endpoint bugs (#1-3)
2. Add transaction support (#4)
3. Fix memory leak (#5)

### Phase 2: Performance (Week 2)

1. Implement LLM caching (#6)
2. Optimize reactive statements (#7)
3. Add database indexes (#8)
4. Batch operations (#9)

### Phase 3: UX Improvements (Week 3)

1. Replace alerts with toasts (#11)
2. Fix localStorage isolation (#12)
3. Add cancellation support (#14)

### Phase 4: Architecture (Week 4+)

1. Component splitting (#15)
2. Streaming responses (#16)
3. Background processing (#19)

## Risk Mitigation

### Risks

1. **Data Migration**: Existing synthesis records may need cleanup
2. **Breaking Changes**: API changes need versioning
3. **Performance Regression**: Need benchmarks before optimization
4. **User Experience**: Changes should be gradual

### Mitigation Strategies

1. Add data migration scripts
2. Version API endpoints (v1/v2)
3. Create performance benchmarks first
4. Feature flag major changes

## Dependencies

### Technical Dependencies

- Supabase transaction support
- Toast notification system
- LRU cache implementation
- WebSocket infrastructure (for streaming)

### Team Dependencies

- Database admin for index creation
- DevOps for monitoring setup
- QA for comprehensive testing
- Product for UX decisions

## Notes

- Priority should be given to data integrity fixes
- Performance improvements should be measured
- Consider feature flags for gradual rollout
- Document all API changes thoroughly
