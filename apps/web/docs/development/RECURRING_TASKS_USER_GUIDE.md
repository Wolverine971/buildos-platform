# Recurring Tasks User Guide

## Overview

Build OS supports powerful recurring task management that integrates seamlessly with your project lifecycle and Google Calendar. This guide will help you understand how to create and manage recurring tasks effectively.

## Creating Recurring Tasks

### Prerequisites

- Task must have a **start date** (recurring tasks without start dates will be converted to one-off tasks)
- Choose from 7 recurrence patterns
- Optionally set an end date (or let it inherit from your project)

### Step-by-Step

1. **Open the Task Modal**
    - Click "Create Task" or edit an existing task

2. **Set a Start Date**
    - This is required for recurring tasks
    - The task type selector will appear after setting a date

3. **Select "Recurring" as Task Type**
    - Default pattern is "Weekly"
    - Choose from: Daily, Weekdays, Weekly, Biweekly, Monthly, Quarterly, or Yearly

4. **Configure End Date** (Optional)
    - **No end date + Project has end date**: Task automatically ends when project ends
    - **No end date + Project has no end date**: Task recurs indefinitely
    - **Specific end date**: Task ends on your chosen date

## Smart Project End Date Sync 🎯

### How It Works

Build OS intelligently manages recurring task end dates based on your project timeline:

#### Automatic Inheritance

When you create a recurring task without setting an end date:

- ✅ If your project has an end date → Task automatically inherits it
- ✅ You'll see: "This task will recur until the project ends on [date]"
- ✅ The task is marked as "project_inherited" in the system

#### Dynamic Updates

When you change your project's end date:

- 🔄 All tasks with inherited end dates update automatically
- 🔄 Tasks with user-specified end dates remain unchanged
- 🔄 Google Calendar events update to reflect the new schedule

#### User Control

You always have control:

- 🎮 Override the inherited date anytime by setting a specific end date
- 🎮 Clear a user-specified date to re-inherit from the project
- 🎮 Visual indicators show when dates are inherited vs. specified

## Visual Indicators

### In Task Lists

- 🔄 **Refresh Icon**: Indicates a recurring task
- Hover over the icon to see the recurrence pattern

### In Task Modal

- **Info Box**: Blue informational message when task will inherit project end date
- **Preview**: Shows next 5 occurrences of the task
- **End Date Reference**: Shows "(Will use project end: [date])" when applicable

## Where Recurring Tasks Appear

### Dashboard (/)

- **Recurring task instances** appear in the appropriate date sections:
    - Past Due: Overdue instances
    - Today: Instances scheduled for today
    - Tomorrow: Instances scheduled for tomorrow
- Each instance shows the 🔄 refresh icon to indicate it's from a recurring task
- Instances are generated 30 days in advance automatically

### Project Pages (/projects/[slug])

#### Phases Section (Overview Tab)

- **Recurring Tasks Section**: Located below the Backlog section
- Shows all recurring tasks for the project with:
    - Recurrence pattern (Daily, Weekly, Monthly, etc.)
    - Next occurrence date
    - End date if specified
    - "Today" badge for tasks with instances today
- Collapsible section (collapsed by default like Backlog)

#### Tasks Tab

- **Recurring Filter**: Click to view only recurring tasks
- Filter button shows count of recurring tasks
- Tasks display with pattern information when filter is active

### Task Management

- **Instance Completion**: Completing a recurring instance marks only that instance as done
- **Pattern Editing**: Edit the parent task to change recurrence pattern
- **Deletion Options**: Delete single instance, future instances, or entire series

## Common Scenarios

### Scenario 1: Project with Fixed Timeline

**Setup**: Project runs Jan 1 - Dec 31
**Create**: Weekly team meeting (recurring)
**Result**: Meeting automatically recurs until Dec 31

### Scenario 2: Ongoing Project

**Setup**: Project has no end date
**Create**: Monthly report (recurring)
**Result**: Report continues indefinitely until you set an end date

### Scenario 3: Project Extension

**Action**: Extend project from June 30 to Sept 30
**Result**: All project-inherited recurring tasks automatically extend to Sept 30

### Scenario 4: Task-Specific End Date

**Need**: Task should end before project
**Action**: Set specific end date on task
**Result**: Task ends on your date, ignores project changes

## Google Calendar Integration

### Automatic Sync

- Recurring tasks with calendar integration create events with proper RRULE
- End dates (inherited or specified) sync to calendar as UNTIL parameter
- Changes to recurrence update calendar automatically

### Manual Calendar Add

1. Save your task first
2. Click "Add to Calendar"
3. Recurrence rules transfer automatically

## Deleting Recurring Tasks

When deleting a recurring task, you have three options:

1. **Delete This Occurrence Only**
    - Removes only the selected instance
    - Other occurrences continue

2. **Delete This and Future Occurrences**
    - Ends the recurrence series at this point
    - Past occurrences remain

3. **Delete All Occurrences**
    - Removes the entire recurring series
    - Cleans up calendar events

## Best Practices

### ✅ DO

- Set start dates for all recurring tasks
- Use project end dates for project-scoped recurring tasks
- Review recurring tasks when extending projects
- Use specific end dates for tasks with known endpoints

### ❌ DON'T

- Create recurring tasks without start dates
- Ignore the info messages about inherited end dates
- Forget to check recurring tasks when project dates change

## Troubleshooting

### Task Won't Recur

**Problem**: Task type keeps reverting to one-off
**Solution**: Ensure task has a start date before setting as recurring

### End Date Not Saving

**Problem**: Recurrence end date doesn't stick
**Solution**: Check if project has an end date - it may be inheriting

### Calendar Not Updating

**Problem**: Changes don't reflect in Google Calendar
**Solution**:

1. Ensure calendar is connected
2. Use "Add to Calendar" after making changes
3. Check for sync errors in task modal

### Wrong End Date Showing

**Problem**: Task shows different end date than expected
**Solution**: Check if date is inherited (blue info box) or user-specified

## FAQ

**Q: What happens if I remove my project's end date?**
A: Tasks with inherited end dates become indefinite. You'll see a notification about this change.

**Q: Can I override an inherited end date?**
A: Yes! Simply set a specific end date on the task. It will be marked as "user_specified" and won't change with the project.

**Q: What if my task end date is before the project end date?**
A: That's fine! Your specified date takes precedence. The task will end when you want it to.

**Q: Do existing recurring tasks get updated?**
A: Yes, when you run the migration. Existing tasks without end dates will inherit from their projects if applicable.

**Q: What happens to tasks without projects?**
A: They continue to work as before - either with specified end dates or indefinitely.

## Technical Details

For developers and power users:

### Database Fields

- `task_type`: 'one_off' | 'recurring'
- `recurrence_pattern`: Pattern type
- `recurrence_ends`: End date (nullable)
- `recurrence_end_source`: 'user_specified' | 'project_inherited' | 'indefinite'

### Migration Scripts

Located in `/scripts/`:

- `migrate-recurring-tasks-calendar-standalone.ts`: Updates Google Calendar
- Database migrations in `/supabase/migrations/`

### API Endpoints

- `POST /api/projects/[id]/tasks`: Creates with inheritance logic
- `PATCH /api/projects/[id]/tasks/[taskId]`: Updates with inheritance logic
- `PATCH /api/projects/[id]/tasks/batch`: Batch updates with inheritance

---

_Last updated: January 2025_
