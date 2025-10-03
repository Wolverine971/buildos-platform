# Brain Dump Preparatory Analysis - Implementation Plan

**Status**: Ready for Implementation
**Estimated Effort**: ~6-8 hours
**Priority**: High (Token Optimization & User Experience)

---

## 🎯 **Executive Summary**

Implementing a lightweight preparatory LLM analysis step before the main brain dump processing flow for existing projects. This will:

- **Reduce token usage** by 40-60% for existing project updates
- **Improve processing speed** through targeted data loading
- **Enhance user experience** with better progress feedback
- **Maintain processing quality** through intelligent classification

---

## 📋 **Implementation Checklist**

### **Phase 1: Type Definitions & Core Infrastructure** ✅ Ready

- [ ] **1.1** Add `PreparatoryAnalysisResult` interface to brain-dump types
  - Location: `apps/web/src/lib/types/brain-dump.ts`
  - Include all fields from spec: classification, indicators, task IDs, confidence, recommendations

- [ ] **1.2** Add SSE message types for analysis phase
  - Location: `apps/web/src/lib/types/sse-messages.ts`
  - Add `SSEAnalysis` interface
  - Update `StreamingMessage` union type
  - Add type guard `isAnalysis()`

- [ ] **1.3** Update `StreamingState` interface
  - Add `analysisStatus` field
  - Add `analysisResult` field
  - Add `analysisProgress` message field

**Estimated Time**: 1 hour

---

### **Phase 2: Prompt Template & LLM Integration** ✅ Ready

- [ ] **2.1** Create preparatory analysis prompt function
  - Location: `apps/web/src/lib/services/promptTemplate.service.ts`
  - Function: `getPreparatoryAnalysisPrompt(project, tasks)`
  - Prepare "light" project data (exclude full context)
  - Prepare "light" task data (id, title, status, start_date, first 100 chars description)
  - Include classification criteria and output structure

- [ ] **2.2** Validate prompt template
  - Test with sample data structures
  - Ensure JSON schema is clear and unambiguous
  - Review classification criteria with team

**Estimated Time**: 2 hours

**Senior Engineering Considerations**:
- Use fast, cheap model for analysis (profile: 'fast' or equivalent)
- Clear separation of concerns: analysis vs processing
- Prompt should be defensive against edge cases (empty tasks, no context, etc.)

---

### **Phase 3: Brain Dump Processor Updates** ⚠️ Complex

- [ ] **3.1** Add `runPreparatoryAnalysis()` method
  - Location: `apps/web/src/lib/utils/braindump-processor.ts`
  - Input: brainDump text, project, userId
  - Prepare light task data (map existing tasks)
  - Call LLM with 'fast' profile
  - Return typed `PreparatoryAnalysisResult`
  - Add error handling with fallback to full processing

- [ ] **3.2** Modify `processWithStrategy()` for existing projects
  - Add optional `analysisResult` parameter
  - Filter tasks based on `relevant_task_ids` from analysis
  - Skip context processing if `skip_context` recommendation
  - Skip task processing if `skip_tasks` recommendation
  - Fall back to full processing if analysis fails

- [ ] **3.3** Integrate analysis into `processBrainDump()` orchestration
  - Only run analysis for existing projects (not new projects)
  - Run analysis BEFORE dual processing decision
  - Pass analysis result to processing functions
  - Handle analysis errors gracefully (log and continue with full processing)

**Estimated Time**: 3 hours

**Senior Engineering Considerations**:
- **Error Handling**: Analysis failure should NOT block processing - fall back to current behavior
- **Performance**: Analysis adds one extra LLM call but saves tokens on subsequent calls
- **Backwards Compatibility**: New projects should NOT use analysis (too much overhead)
- **Data Filtering**: Only fetch relevant tasks from database after analysis
- **Logging**: Track analysis results for monitoring token savings

---

### **Phase 4: SSE Streaming Integration** ⚠️ Critical Path

- [ ] **4.1** Update streaming endpoint
  - Location: `apps/web/src/routes/api/braindumps/stream/+server.ts`
  - Send `SSEAnalysis` event with "processing" status
  - Send analysis result when complete
  - Update subsequent status messages based on analysis
  - Handle analysis in the streaming flow

- [ ] **4.2** Update progress messages
  - Initial: "Analyzing braindump content..."
  - Complete: "Analysis complete: [classification] content detected"
  - Processing: "Processing [context/tasks] based on analysis..."
  - Show which tasks are being processed (count from analysis)

**Estimated Time**: 1.5 hours

**Senior Engineering Considerations**:
- **User Experience**: Clear progress indicators for each phase
- **Transparency**: Show user what was detected (e.g., "Found 3 relevant tasks")
- **Streaming Order**: Analysis → Context (if needed) → Tasks (if needed) → Complete
- **Error Recovery**: If analysis fails mid-stream, continue with full processing

---

### **Phase 5: Frontend Integration** 🎨 Polish

- [ ] **5.1** Update brain dump processing notification component
  - Location: `apps/web/src/lib/components/brain-dump/BrainDumpProcessingNotification.svelte`
  - Add analysis phase to UI
  - Show analysis classification result
  - Display which processing steps will run
  - Update progress indicators

- [ ] **5.2** Handle new SSE message types
  - Parse `SSEAnalysis` messages
  - Update UI state based on analysis result
  - Show analysis insights to user

**Estimated Time**: 1 hour

---

### **Phase 6: Testing & Validation** 🧪 Critical

- [ ] **6.1** Unit tests
  - Test `runPreparatoryAnalysis()` with various inputs
  - Test classification logic
  - Test task ID extraction
  - Test error handling

- [ ] **6.2** Integration tests
  - Test full flow with analysis enabled
  - Test fallback when analysis fails
  - Test new projects (should skip analysis)
  - Test edge cases (empty tasks, no context, etc.)

- [ ] **6.3** LLM prompt tests
  - Add test cases for preparatory analysis prompt
  - Test with real API (costs money but validates prompt quality)
  - Verify JSON structure and field accuracy

- [ ] **6.4** Manual testing scenarios
  - Strategic braindump → should update context
  - Tactical braindump → should process tasks only
  - Mixed braindump → should process both
  - Status update → might skip both
  - Unrelated braindump → should skip both

**Estimated Time**: 2 hours

---

## 🔧 **Technical Architecture**

### **Data Flow**

```
1. User submits braindump for existing project
2. System runs preparatory analysis
   ├─ Load light project data (no full context)
   ├─ Load light task data (id, title, status, description preview)
   ├─ Send to LLM with "fast" profile
   └─ Receive classification + relevant task IDs
3. Based on analysis:
   ├─ If needs_context_update → Fetch full project, run context extraction
   ├─ If has relevant tasks → Fetch only those tasks, run task extraction
   └─ If skip recommendations → Skip that processing step
4. Merge results as before
5. Return to user
```

### **Key Design Decisions**

**Why "light" data for analysis?**
- Reduces tokens in the analysis call (can be 60-80% smaller)
- Analysis doesn't need full context to classify intent
- Full data only loaded if needed for processing

**Why use a fast model for analysis?**
- Classification is simpler than extraction
- Speed matters for user experience
- Cost optimization (fast models are cheaper)

**Why only for existing projects?**
- New projects need full processing anyway
- Analysis overhead not worth it for creation flow
- Existing projects have more data to filter

**Error handling strategy?**
- Analysis failure → Fall back to current full processing
- Don't block user if analysis fails
- Log failures for monitoring and improvement

---

## 📊 **Success Metrics**

### **Quantitative**
- [ ] **Token Reduction**: 40-60% reduction for tactical braindumps
- [ ] **Processing Speed**: 20-30% faster for task-only updates
- [ ] **Analysis Accuracy**: >90% correct classification
- [ ] **Error Rate**: <1% analysis failures

### **Qualitative**
- [ ] **User Experience**: Clear progress indicators for each phase
- [ ] **Transparency**: Users understand what's being processed
- [ ] **Reliability**: Falls back gracefully when analysis fails

---

## ⚠️ **Risks & Mitigations**

| Risk | Mitigation |
|------|------------|
| Analysis adds latency | Use fast model, show clear progress |
| Analysis fails | Fall back to full processing automatically |
| Incorrect classification | Log results, monitor accuracy, iterate prompt |
| Over-filtering tasks | Be conservative in "relevant_task_ids" detection |
| Breaking existing flow | Only apply to existing projects, extensive testing |

---

## 🚀 **Deployment Strategy**

1. **Feature Flag**: Implement behind a flag for gradual rollout
2. **Monitoring**: Track token usage, processing time, accuracy
3. **Rollback Plan**: Disable flag if issues arise
4. **User Communication**: Update docs to explain new analysis phase

---

## 📝 **Follow-up Work** (Post-MVP)

- [ ] Add analysis result caching (same project + similar braindump)
- [ ] Tune classification criteria based on real usage
- [ ] A/B test different analysis prompts
- [ ] Add user feedback on analysis accuracy
- [ ] Optimize task filtering algorithm
- [ ] Consider semantic search for task matching

---

## 🎓 **Learning & Complexity Notes**

**High Complexity Areas**:
1. **Integration with dual processing** - Need to understand existing flow deeply
2. **SSE streaming order** - Must maintain correct event sequence
3. **Error recovery** - Graceful fallback without user disruption

**Moderate Complexity**:
1. **Type definitions** - Straightforward but need precision
2. **Prompt engineering** - Iterative but well-documented
3. **Frontend updates** - Standard Svelte component work

**Low Complexity**:
1. **Adding new SSE message types** - Template-based
2. **Basic unit tests** - Standard test patterns
3. **Documentation updates** - Clear and concise

---

**Next Steps**: Start with Phase 1 (Type Definitions) and work sequentially through phases.

**Estimated Total Time**: 10.5 hours (with buffer for unknowns and testing)

---

_Last Updated: [Current Date]_
_Owner: Implementation Team_
_Status: Ready for Implementation_ ✅
