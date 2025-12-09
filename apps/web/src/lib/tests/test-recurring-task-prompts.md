<!-- apps/web/src/lib/tests/test-recurring-task-prompts.md -->

# Test Scenarios for Recurring Task Detection

## Test Brain Dump Samples

### Sample 1: Daily Tasks

"I need to check my emails every morning at 9am and review the team dashboard daily. Also, create a new landing page for the product launch next week."

**Expected Output:**

- Task 1: Check emails - recurring, daily pattern, start_date: tomorrow
- Task 2: Review team dashboard - recurring, daily pattern
- Task 3: Create landing page - one_off task

### Sample 2: Weekly Tasks

"Set up a weekly team meeting on Mondays at 2pm. Review code every Friday afternoon. Build the API integration by end of month."

**Expected Output:**

- Task 1: Team meeting - recurring, weekly pattern, start_date: next Monday
- Task 2: Code review - recurring, weekly pattern, start_date: next Friday
- Task 3: API integration - one_off task with deadline

### Sample 3: Monthly Tasks

"Generate monthly reports on the first of each month. Quarterly business review every 3 months. Update documentation whenever we release."

**Expected Output:**

- Task 1: Monthly reports - recurring, monthly pattern
- Task 2: Business review - recurring, quarterly pattern
- Task 3: Update documentation - one_off task (triggered by releases)

### Sample 4: Weekday Tasks

"Daily standup every weekday at 10am. Weekend maintenance checks on Saturdays."

**Expected Output:**

- Task 1: Daily standup - recurring, weekdays pattern
- Task 2: Maintenance checks - recurring, weekly pattern (Saturday)

### Sample 5: Complex Mix

"I need to:

- Send weekly status updates to stakeholders
- Review metrics dashboard daily
- Quarterly planning sessions
- Fix the login bug ASAP
- Monthly team retrospectives
- Update the roadmap (one time)
- Check support tickets every weekday morning"

**Expected Output:**

- Task 1: Status updates - recurring, weekly
- Task 2: Review metrics - recurring, daily
- Task 3: Planning sessions - recurring, quarterly
- Task 4: Fix login bug - one_off, high priority
- Task 5: Team retrospectives - recurring, monthly
- Task 6: Update roadmap - one_off
- Task 7: Check support tickets - recurring, weekdays

## Validation Checklist

For each recurring task, verify:

- [ ] task_type is set to "recurring"
- [ ] start_date is provided (today or appropriate future date)
- [ ] recurrence_pattern matches the frequency mentioned
- [ ] recurrence_ends is optional (null defaults to project end date)
- [ ] Regular one-off tasks don't have recurrence fields

## Edge Cases to Test

1. **Ambiguous frequency**: "Review the code regularly" - should default to one_off
2. **Past tense**: "We used to have daily standups" - should not create recurring
3. **Conditional**: "If needed, weekly sync" - should be one_off
4. **One-time with date**: "Meeting next Tuesday" - should be one_off with start_date
