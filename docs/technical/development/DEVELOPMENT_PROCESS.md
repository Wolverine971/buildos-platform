# Comprehensive Development Process Guide

This document provides a complete workflow for feature development, bug fixes, and maintenance tasks. Follow this process for any code changes to ensure quality, consistency, and proper version control.

## Table of Contents

1. [Pre-Development Phase](#pre-development-phase)
2. [Planning Phase](#planning-phase)
3. [Implementation Phase](#implementation-phase)
4. [Testing Phase](#testing-phase)
5. [Review and Deployment](#review-and-deployment)
6. [Post-Implementation](#post-implementation)

---

## Pre-Development Phase

### 1. Environment Check

Before starting any development work:

```bash
# Ensure you're on the latest main branch
git checkout main
git pull origin main

# Check project health
pnpm run pre-push
```

### 2. Documentation Review

**Always check latest framework documentation first:**

- [ ] Use **context7 MCP** to verify current versions of:
    - SvelteKit (current: 2.31+)
    - Svelte (current: 5.37+)
    - TailwindCSS
    - TypeScript
    - Supabase client libraries
- [ ] Review any breaking changes or new best practices
- [ ] Check for security updates or vulnerability patches

### 3. Project Context Review

- [ ] Review `CLAUDE.md` for any recent updates
- [ ] Check relevant design documents in `/docs/design/`
- [ ] Review existing similar features in the codebase
- [ ] Understand the current architecture patterns

---

## Planning Phase

### 1. Create Feature Branch

```bash
# Create feature branch with descriptive name
git checkout -b feature/your-feature-name
# or
git checkout -b bugfix/your-bug-description
```

### 2. Create Implementation Plan

**MANDATORY: Create a plan document before any coding:**

1. Copy the template from `/docs/development/templates/FEATURE_PLAN_TEMPLATE.md`
2. Create a new plan file: `docs/development/plans/[YYYY-MM-DD]-[feature-name]-plan.md`
3. Fill out all sections completely:
    - Problem/feature description
    - Technical analysis
    - Implementation steps
    - Testing strategy
    - Success criteria

### 3. Plan Review and Approval

- [ ] Review plan for completeness
- [ ] Consider edge cases and error handling
- [ ] Estimate time and complexity
- [ ] **Get approval before proceeding** (from team lead or stakeholder)

### 4. Sub-Agent Delegation Strategy

For complex features, consider delegating subtasks:

**Use Claude Code sub-agents for:**

- Research tasks (checking existing implementations)
- Documentation generation
- Code review and optimization
- Test case generation
- Configuration file updates

**Keep main agent for:**

- Core feature implementation
- Critical business logic
- Architecture decisions
- Final integration

---

## Implementation Phase

### 1. Initial Commit

```bash
# Commit the plan document first
git add docs/development/plans/[your-plan].md
git commit -m "docs: add implementation plan for [feature-name]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 2. Implementation Workflow

**Follow this cycle for each implementation step:**

#### A. Code Implementation

- Work on one logical unit at a time
- Follow existing code patterns and conventions
- Use TypeScript strictly (no `any` types)
- Follow the service layer patterns documented in `CLAUDE.md`

#### B. Immediate Testing

```bash
# Type checking
pnpm run check

# Unit tests (if applicable)
pnpm run test

# Linting
pnpm run lint
```

#### C. UI Testing (if applicable)

- Use **Playwright MCP** to test UI changes:
    - Visual regression testing
    - Interaction testing
    - Mobile responsiveness
    - Accessibility compliance

#### D. Commit After Each Major Change

```bash
git add -A
git commit -m "feat: implement [specific change description]

- Add [specific functionality]
- Update [specific component/service]
- Fix [specific issue]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 3. Progress Tracking

**Update your plan document continuously:**

- [ ] Mark completed steps with ✅
- [ ] Add timestamps for major milestones
- [ ] Document any deviations from original plan
- [ ] Note any blockers or issues encountered
- [ ] Update testing status

### 4. Integration Points

When integrating with existing systems:

- [ ] Check service dependencies in `/src/lib/services/`
- [ ] Verify database schema changes (if any)
- [ ] Test API endpoints with proper error handling
- [ ] Ensure real-time subscriptions work correctly
- [ ] Verify authentication and authorization

---

## Testing Phase

### 1. Comprehensive Testing Cycle

Follow the testing checklist in `/docs/development/TESTING_CHECKLIST.md`:

#### A. Unit Tests

```bash
# Run standard tests (excludes expensive LLM tests)
pnpm run test

# Run in watch mode during development
pnpm run test:watch
```

#### B. LLM Tests (Use Sparingly)

```bash
# Only run when LLM functionality is modified
pnpm run test:llm
```

#### C. UI/E2E Tests

- Use **Playwright MCP** for comprehensive UI testing
- Test critical user journeys
- Verify mobile responsiveness
- Check accessibility requirements

#### D. Integration Tests

```bash
# Full pre-push validation
pnpm run pre-push
```

### 2. Performance Testing

- [ ] Check bundle size impact: `pnpm run build:analyze`
- [ ] Test with realistic data volumes
- [ ] Monitor memory usage
- [ ] Verify real-time subscription performance

### 3. Security Testing

- [ ] Check for exposed secrets or keys
- [ ] Verify authentication flows
- [ ] Test authorization boundaries
- [ ] Review SQL injection possibilities

---

## Review and Deployment

### 1. Final Quality Check

```bash
# Run complete CI pipeline
pnpm run pre-push

# Build production version
pnpm run build:prod
```

### 2. Code Review

- [ ] Review your own code for:
    - Code clarity and maintainability
    - Error handling completeness
    - Performance considerations
    - Security best practices
- [ ] Use sub-agent for automated code review
- [ ] Check against project conventions in `CLAUDE.md`

### 3. Documentation Updates

- [ ] Update relevant documentation in `/docs/`
- [ ] Add JSDoc comments for new functions/classes
- [ ] Update API documentation if applicable
- [ ] **MANDATORY: Update `CLAUDE.md`** if any of the following changed:
    - Development commands or workflows
    - Architecture patterns or conventions
    - Testing procedures or requirements
    - Build processes or deployment steps
    - Technology stack or dependencies
    - Service patterns or API structures

### 4. Final Commit and Merge Preparation

```bash
# Final commit with summary
git add -A
git commit -m "feat: complete [feature-name] implementation

Summary of changes:
- [Major change 1]
- [Major change 2]
- [Major change 3]

Testing completed:
- ✅ Unit tests passing
- ✅ Integration tests passing
- ✅ UI tests passing
- ✅ Performance verified

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote
git push origin feature/your-feature-name
```

---

## Post-Implementation

### 1. Monitoring

After deployment:

- [ ] Monitor error logs for new issues
- [ ] Check performance metrics
- [ ] Verify user feedback
- [ ] Monitor database performance

### 2. Documentation Cleanup

- [ ] Archive the implementation plan
- [ ] Update project documentation
- [ ] Share learnings with team
- [ ] Document any technical debt created

### 3. Retrospective

- [ ] What went well?
- [ ] What could be improved?
- [ ] Were there any surprises?
- [ ] Update this process document if needed

---

## Quick Reference Commands

### Development

```bash
pnpm run dev:split          # Development with type checking
pnpm run check              # Type checking only
pnpm run check:watch        # Continuous type checking
```

### Testing

```bash
pnpm run test               # Unit tests (no LLM)
pnpm run test:llm           # LLM tests (expensive)
pnpm run test:watch         # Watch mode testing
```

### Quality

```bash
pnpm run lint               # ESLint check
pnpm run lint:fix           # Auto-fix linting issues
pnpm run format             # Prettier formatting
pnpm run pre-push           # Full CI pipeline
```

### Build

```bash
pnpm run build              # Production build
pnpm run build:analyze      # Build with bundle analysis
pnpm run preview            # Preview production build
```

---

## Emergency Procedures

### Rollback Process

If you need to rollback changes:

```bash
# Identify the last good commit
git log --oneline

# Create a revert commit
git revert [commit-hash]

# Or reset to previous state (destructive)
git reset --hard [last-good-commit]
git push --force-with-lease origin feature/your-feature-name
```

### Hotfix Process

For critical production issues:

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue-description

# Make minimal fix
# Test thoroughly
# Fast-track review process

# Merge directly to main after approval
```

---

## Best Practices Summary

1. **Always plan before coding** - Create and approve implementation plans
2. **Commit frequently** - After every major change with descriptive messages
3. **Test continuously** - Don't batch testing to the end
4. **Use sub-agents effectively** - Delegate routine tasks
5. **Document as you go** - Update plans and documentation continuously
6. **Follow conventions** - Check existing patterns before creating new ones
7. **Security first** - Never commit secrets or expose sensitive data
8. **Performance matters** - Consider bundle size and runtime performance
9. **Mobile responsive** - Test on mobile devices and follow modal standards
10. **Accessibility compliance** - Follow WCAG guidelines for UI components

---

_This process is living documentation. Update it based on learnings and team feedback._
