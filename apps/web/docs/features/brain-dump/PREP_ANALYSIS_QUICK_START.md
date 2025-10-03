# Preparatory Analysis - Quick Start Guide

**For**: Developers and QA testing the new preparatory analysis feature

---

## 🚀 **How to Test It**

### **Prerequisites**
- Existing project with some tasks
- Brain dump interface

### **Test Scenario 1: Tactical Update (Should Skip Context)**

**Brain Dump Input:**
```
Just finished the API integration task. The authentication endpoint is working great.
Database migration is still in progress, should be done by tomorrow.
```

**Expected Behavior:**
1. Analysis runs (check console logs)
2. Classification: `tactical`
3. Context processing: **Skipped** ✅
4. Task processing: **Only relevant tasks** ✅
5. Console shows: `[extractTasks] Filtering tasks based on analysis: 2/47 tasks`

**Console Output to Look For:**
```
[PrepAnalysis] Starting analysis for project: xxx
[PrepAnalysis] Complete: {
  classification: 'tactical',
  needsContext: false,
  relevantTasks: 2,
  newTasks: false,
  confidence: 'high'
}
[extractProjectContext] Skipping context processing based on analysis recommendation
[extractTasks] Filtering tasks based on analysis: 2/47 tasks
```

---

### **Test Scenario 2: Strategic Update (Should Update Context)**

**Brain Dump Input:**
```
After reviewing with the team, we're pivoting the product strategy. Instead of focusing
on B2C, we're going B2B enterprise. This means we need to add SSO, multi-tenancy, and
admin controls. Timeline extended by 2 months.
```

**Expected Behavior:**
1. Analysis runs
2. Classification: `strategic`
3. Context processing: **Runs** ✅
4. Task processing: **May run for new tasks** ✅

**Console Output:**
```
[PrepAnalysis] Complete: {
  classification: 'strategic',
  needsContext: true,
  relevantTasks: 0,
  newTasks: true,
  confidence: 'high'
}
```

---

### **Test Scenario 3: Mixed Update**

**Brain Dump Input:**
```
The API architecture needs a major refactor to support the new scaling requirements
we discussed. Specifically, the authentication service needs to be broken out into
a microservice. Also, I completed the database optimization task and fixed that
caching bug in the user service.
```

**Expected Behavior:**
1. Classification: `mixed`
2. Context processing: **Runs** ✅
3. Task processing: **Relevant tasks only** ✅

---

### **Test Scenario 4: Simple Status Update**

**Brain Dump Input:**
```
Made good progress today. Everything on track.
```

**Expected Behavior:**
1. Classification: `status_update`
2. May skip both context and tasks (depending on recommendations)

---

## 🔍 **How to Monitor**

### **Console Logs**

Look for these log prefixes:
- `[PrepAnalysis]` - Analysis phase
- `[extractProjectContext]` - Context processing decisions
- `[extractTasks]` - Task filtering

### **Activity Logs**

Check the `activities` table for:
```sql
SELECT * FROM activities
WHERE event_type = 'brain_dump_analysis_completed'
ORDER BY created_at DESC
LIMIT 10;
```

### **Processing Time**

Compare processing times:
- **Without analysis**: Baseline time
- **With analysis (tactical)**: Should be faster (skips context + filters tasks)
- **With analysis (strategic)**: Slightly slower (+0.5-1s for analysis)

---

## 📊 **Token Usage Comparison**

### **Before Implementation**

Tactical update with 47 tasks:
```
- Analysis: N/A
- Context: ~3,000 tokens
- Tasks (all 47): ~5,000 tokens
- Total: ~8,000 tokens
```

### **After Implementation**

Same tactical update:
```
- Analysis: ~1,000 tokens (light data)
- Context: SKIPPED ✅
- Tasks (3 relevant): ~2,000 tokens
- Total: ~3,000 tokens
- Savings: 62.5% ✅
```

---

## 🐛 **Troubleshooting**

### **Analysis Not Running**

**Check:**
1. Is this an **existing project**? (Analysis only runs for existing projects)
2. Check console for `[PrepAnalysis]` logs
3. Check for errors in error logging table

### **Analysis Fails**

**Expected Behavior:**
- Should fall back to full processing
- Console shows: `[BrainDumpProcessor] Analysis failed or returned null - will use full processing`
- Processing continues normally

### **Wrong Classification**

**What to Check:**
1. Review the braindump content
2. Check confidence level in logs
3. Examine `context_indicators` and `task_indicators` in analysis result

**To Fix:**
- Update classification criteria in prompt
- Add more examples to prompt
- Adjust confidence thresholds

---

## 🎯 **Success Criteria**

✅ **Feature is Working If:**
1. Analysis runs for existing projects
2. Tactical braindumps skip context processing
3. Task filtering reduces token count
4. Fallback works when analysis fails
5. No errors in type checking
6. Console logs show expected flow

---

## 📈 **Metrics to Track**

| Metric | How to Measure | Target |
|--------|----------------|--------|
| Analysis success rate | Count successes vs failures | >95% |
| Token savings (tactical) | Compare before/after | 40-60% |
| Processing speed | Measure total time | <5s for tactical |
| Accuracy | Manual review of classifications | >90% |

---

## 🔧 **Configuration**

### **Enable/Disable Analysis**

Currently always enabled for existing projects. To disable:

```typescript
// In braindump-processor.ts, line 318:
// Comment out this block:
/*
if (existingProject && selectedProjectId) {
  prepAnalysisResult = await this.runPreparatoryAnalysis(...);
}
*/
```

### **Adjust Model Speed**

```typescript
// In braindump-processor.ts, line 224:
profile: 'fast', // Change to 'balanced' or 'accurate' for better quality
```

---

## 🎓 **Understanding the Classification**

### **Strategic Indicators**
- Vision/mission changes
- Scope changes
- Architectural decisions
- Long-term planning
- Risk identification

### **Tactical Indicators**
- Specific task mentions
- Status updates
- Bug reports
- Implementation details
- Progress reports

### **Classification Examples**

| Braindump | Classification | Reason |
|-----------|---------------|---------|
| "Fixed the auth bug" | `tactical` | Bug fix mention |
| "Pivoting to B2B model" | `strategic` | Vision change |
| "Completed setup, now working on API" | `tactical` | Status update |
| "Refactoring architecture + fixed cache bug" | `mixed` | Both strategic and tactical |
| "Made progress today" | `status_update` | Simple status |
| "My cat is cute" | `unrelated` | Not about project |

---

## 📞 **Need Help?**

- Check logs: `[PrepAnalysis]`, `[extractProjectContext]`, `[extractTasks]`
- Review analysis result structure in activity logs
- Check type errors: `pnpm check`
- Consult implementation summary: `PREP_ANALYSIS_IMPLEMENTATION_SUMMARY.md`

---

_Quick Start Guide - Ready to Test!_ ✅
