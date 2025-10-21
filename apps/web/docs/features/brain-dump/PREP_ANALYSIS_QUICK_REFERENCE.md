# Preparatory Analysis Quick Reference

Quick lookup for understanding how preparatory analysis works in brain dump processing.

## Quick Answers

### Q1: Where is it called?

**Line 378-398** in `processBrainDump()`

- Only for existing projects
- Passed to `processBrainDumpDual()` at line 439

### Q2: What does it return?

Type: `PreparatoryAnalysisResult` (see `/src/lib/types/brain-dump.ts` lines 210-265)

Key fields:

- `braindump_classification` - Type of content (strategic, tactical, mixed, status_update, unrelated)
- `core_dimensions_touched` - 9 project dimensions that may need updates
- `relevant_task_ids` - Tasks related to the braindump
- `processing_recommendation` - Guidance on what to skip

### Q3: How does it impact dual processing?

Three main impacts:

1. **Task Filtering** (line 1174 in extractTasks)
    - Only relevant tasks passed to LLM
    - Saves 20-30% tokens

2. **Context Skip Decision** (line 1019 in extractProjectContext)
    - Skip if tactical/status_update/unrelated
    - Save 5-8 seconds per request

3. **Dimension Hints** (line 1080 in extractProjectContext)
    - Guides LLM to focus on likely-changed dimensions
    - Improves accuracy

### Q4: How long does it take?

- **Prep analysis**: 1-3 seconds (fast model)
- **Full dual processing with prep**: 13-18 seconds
- **Full dual processing without prep**: 20-30 seconds
- **Token savings**: 20%
- **Cost savings**: 15-30%

### Q5: How are results passed?

Flow:

```
runPreparatoryAnalysis()
  → processBrainDumpDual() [line 439]
    → extractProjectContext() [line 915]
    → extractTasks() [line 924]
```

Usage:

- Classification check at line 1019
- Task filtering at line 1174
- Dimension hints at line 1080

---

## Key Code Locations

| What            | Where                                                                         | Lines   |
| --------------- | ----------------------------------------------------------------------------- | ------- |
| Implementation  | `/src/lib/utils/braindump-processor.ts`                                       | 169-343 |
| Type definition | `/src/lib/types/brain-dump.ts`                                                | 210-265 |
| Prompt template | `/docs/prompts/existing-project/preparatory-analysis/prep-analysis-prompt.md` | -       |
| Fast models     | `/src/lib/services/smart-llm-service.ts`                                      | 394     |

---

## Processing Decision Tree

```
prepAnalysisResult is null?
  YES → Full processing (fallback)
  NO → Check classification:

    'strategic' or 'mixed'?
      YES → Process context + tasks with hints
      NO → Skip context, process tasks
```

---

## Performance Impact Summary

| Metric  | Without Prep | With Prep | Savings      |
| ------- | ------------ | --------- | ------------ |
| Latency | 20-30s       | 13-18s    | 30-40%       |
| Tokens  | 12-16k       | 10-14k    | 20%          |
| Cost    | Higher       | Lower     | 15-30%       |
| Quality | Same         | Better    | More focused |

---

## Error Handling

If prep analysis fails:

- Returns `null`
- No exception thrown
- System continues with full processing
- No user impact

---

## Real-World Example

**Input**: "Setting 3-month writing goal with March 31 deadline. Daily 1000-word goal 5-7am."

**Prep Analysis Output**:

- Classification: `strategic`
- Dimensions touched: `core_goals_momentum`, `core_people_bonds`, `core_power_resources`
- Relevant tasks: 2 of 7 tasks
- New tasks detected: `true`

**Processing Result**:

- Context: PROCESSED (strategic classification)
- Tasks: PROCESSED with only relevant 2 tasks
- Time: ~18s instead of 28s
- Tokens: ~11k instead of 14k

---

## See Also

- Full documentation: [PREPARATORY_ANALYSIS_INTEGRATION.md](./PREPARATORY_ANALYSIS_INTEGRATION.md)
- Type definition: `/src/lib/types/brain-dump.ts` (lines 210-265)
- Prompt template: `/docs/prompts/existing-project/preparatory-analysis/`
- Main processor: `/src/lib/utils/braindump-processor.ts`
