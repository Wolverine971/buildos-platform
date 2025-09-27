# Test Scenarios for Short Braindump Streaming

## Test Case 1: Short braindump with tasks only (< 500 chars)

**Input**: "Add login page with OAuth integration. Fix the navbar bug on mobile."
**Expected**:

- Shows single column with TasksNotesPreview
- Creates 2 tasks
- No context panel shown

## Test Case 2: Short braindump triggering context update

**Input**: "The project scope has changed. We're now focusing on B2B instead of B2C. Need to update authentication flow accordingly."
**Expected**:

- Shows TasksNotesPreview first
- Then expands to show ProjectContextPreview
- Updates project context
- Creates related tasks

## Test Case 3: Short braindump with question answers

**Input**: "Yes, we'll use React Native for mobile. Target launch date is March 2025."
**Expected**:

- Shows TasksNotesPreview
- May trigger context update if answers affect project scope
- Updates question status

## Manual Testing Steps:

1. Open Brain Dump Modal
2. Select an existing project
3. Enter text < 500 characters
4. Click Process
5. Verify:
    - TasksNotesPreview appears first (single column)
    - If context update needed, panel expands to dual view
    - Processing completes successfully
    - Results transition to ParseResultsDiffView

## Key Behaviors to Verify:

- [ ] Single column layout for tasks-only processing
- [ ] Dynamic expansion to dual column when context needed
- [ ] Proper streaming of task results
- [ ] Context panel only appears when requiresContextUpdate is true
- [ ] Smooth transition to final results view
- [ ] Error handling if context fails but tasks succeed
