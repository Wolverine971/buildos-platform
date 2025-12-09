<!-- apps/web/docs/technical/development/GIT_WORKFLOW.md -->

# Git Workflow Guide

This document outlines the git workflow, branching strategy, and commit practices for the Build OS project. Follow these guidelines to maintain a clean, traceable git history and protect your work.

## Table of Contents

1. [Branch Strategy](#branch-strategy)
2. [Commit Guidelines](#commit-guidelines)
3. [Git Workflow Steps](#git-workflow-steps)
4. [Merge and PR Process](#merge-and-pr-process)
5. [Hotfix Workflow](#hotfix-workflow)
6. [Git Best Practices](#git-best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Branch Strategy

### Main Branches

#### `main`

- **Purpose:** Production-ready code
- **Protection:** Protected branch, requires PR approval
- **Deployment:** Automatically deploys to production
- **Direct commits:** Not allowed

### Feature Branches

#### Naming Conventions

Follow these patterns for consistent branch naming:

```bash
# Feature development
feature/[brief-description]
feature/user-dashboard-redesign
feature/recurring-tasks-ui
feature/calendar-integration

# Bug fixes
bugfix/[brief-description]
bugfix/task-dates-validation
bugfix/modal-mobile-rendering
bugfix/authentication-redirect

# Hotfixes (production issues)
hotfix/[critical-issue]
hotfix/security-vulnerability
hotfix/payment-processing-error

# Refactoring work
refactor/[component-or-area]
refactor/project-service-optimization
refactor/modal-system-standardization

# Experimental features
experiment/[feature-name]
experiment/ai-task-suggestions
experiment/new-ui-library
```

#### Branch Lifecycle

```bash
# Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/your-feature-name

# Work on feature with frequent commits
# ... development work ...

# Push to remote for backup
git push -u origin feature/your-feature-name

# Create PR when ready for review
# ... review process ...

# Merge to main via PR
# Delete branch after merge
git checkout main
git pull origin main
git branch -d feature/your-feature-name
```

---

## Commit Guidelines

### Commit Message Format

Follow **Conventional Commits** specification with Claude Code attribution:

```bash
<type>[optional scope]: <description>

[optional body]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Commit Types

Use these standardized types:

- **feat:** New feature implementation
- **fix:** Bug fixes
- **docs:** Documentation updates
- **style:** Code formatting, no logic changes
- **refactor:** Code refactoring without feature changes
- **test:** Adding or updating tests
- **chore:** Build process, dependencies, tooling
- **perf:** Performance improvements
- **security:** Security-related changes

### Commit Examples

#### Feature Implementation

```bash
git commit -m "feat: add recurring task creation modal

- Implement RecurrenceSelector component
- Add pattern validation logic
- Integrate with Google Calendar API
- Include mobile-responsive design

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### Bug Fix

```bash
git commit -m "fix: resolve task date validation in past dates

- Add client-side validation for task start dates
- Update TaskForm component error handling
- Fix timezone conversion edge case
- Add user feedback for invalid dates

Fixes issue where tasks could be created with past dates
causing calendar sync errors.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### Documentation

```bash
git commit -m "docs: add implementation plan for recurring tasks feature

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### Refactoring

```bash
git commit -m "refactor: convert ProjectService to instance-based pattern

- Replace static methods with singleton instance
- Add client-side caching with LRU eviction
- Improve error handling consistency
- Update all service consumers

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Commit Frequency Guidelines

#### Commit After Every Major Change

- **Feature addition:** New component, service, or significant functionality
- **Bug fix:** Resolution of a specific issue
- **Refactoring:** Structural changes to existing code
- **Test additions:** New test suites or significant test updates
- **Documentation:** Major documentation additions or updates

#### When to Commit

✅ **Do commit when:**

- You've completed a logical unit of work
- Tests are passing for the changes made
- Code is in a working state
- You're about to start a different type of work
- End of a work session (for backup purposes)

❌ **Don't commit when:**

- Code doesn't compile or has syntax errors
- Tests are failing due to your changes
- Work is incomplete and would break functionality
- You're just fixing typos in previous commits (use amend instead)

---

## Git Workflow Steps

### 1. Start New Feature/Fix

```bash
# Always start from latest main
git checkout main
git pull origin main

# Create and switch to feature branch
git checkout -b feature/your-feature-name

# Verify you're on the correct branch
git branch --show-current
```

### 2. Development Cycle

#### A. Make Changes

```bash
# Make your changes
# ... code, test, document ...

# Check status regularly
git status
```

#### B. Stage and Commit

```bash
# Review changes before staging
git diff

# Stage changes (review each file)
git add src/lib/components/NewComponent.svelte
git add src/lib/services/FeatureService.ts
# or stage all changes
git add -A

# Commit with descriptive message
git commit -m "feat: implement new component functionality

- Add NewComponent with proper TypeScript types
- Integrate with existing FeatureService
- Include comprehensive unit tests
- Follow mobile-first design patterns

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

#### C. Push for Backup

```bash
# Push to remote for backup (first time)
git push -u origin feature/your-feature-name

# Subsequent pushes
git push
```

### 3. Pre-Push Validation

Before pushing significant changes, run quality checks:

```bash
# Type checking
pnpm run check

# Unit tests
pnpm run test

# Linting
pnpm run lint

# Full CI pipeline
pnpm run pre-push
```

Only push if all checks pass.

### 4. Create Pull Request

When feature is complete:

```bash
# Ensure all changes are committed
git status

# Push final changes
git push

# Create PR via GitHub web interface or CLI
gh pr create --title "feat: your feature description" --body "Detailed description..."
```

---

## Merge and PR Process

### Pull Request Creation

#### PR Title Format

Follow conventional commit format for PR titles:

```
feat: add recurring task management system
fix: resolve calendar sync authentication issues
refactor: optimize ProjectService performance
docs: update development workflow documentation
```

#### PR Description Template

```markdown
## Summary

Brief description of the changes and why they were made.

## Changes Made

- [ ] Feature/fix 1
- [ ] Feature/fix 2
- [ ] Feature/fix 3

## Testing

- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] UI/E2E tests completed
- [ ] Manual testing completed

## Documentation

- [ ] Code documentation updated
- [ ] User-facing documentation updated (if applicable)
- [ ] Breaking changes documented

## Screenshots (if applicable)

[Include before/after screenshots for UI changes]

## Checklist

- [ ] Code follows project conventions
- [ ] No console.log statements left in code
- [ ] No TODO comments (unless intentionally tracked)
- [ ] TypeScript strict mode compliance
- [ ] Mobile-responsive design (if UI changes)
- [ ] Accessibility considerations addressed
```

### Review Process

#### Self-Review Checklist

Before requesting review:

- [ ] **Code quality:** Clean, readable, well-commented code
- [ ] **Performance:** No obvious performance issues
- [ ] **Security:** No exposed secrets or vulnerabilities
- [ ] **Testing:** Adequate test coverage
- [ ] **Documentation:** Code is self-documenting or documented
- [ ] **Consistency:** Follows project patterns and conventions

#### Addressing Review Comments

```bash
# Make requested changes
git add -A
git commit -m "fix: address PR review comments

- Update error handling per review feedback
- Improve variable naming consistency
- Add missing TypeScript types

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push updates
git push
```

### Merge Strategy

#### Squash and Merge (Recommended)

- **When:** Feature branches with multiple commits
- **Benefits:** Clean main branch history, single commit per feature
- **Use for:** Most feature development

#### Merge Commit

- **When:** Preserving detailed commit history is important
- **Benefits:** Full history preserved
- **Use for:** Complex features requiring commit history

#### Rebase and Merge

- **When:** Linear history preferred
- **Benefits:** Clean linear history without merge commits
- **Use for:** Small features with clean commit history

---

## Hotfix Workflow

For critical production issues requiring immediate fixes:

### 1. Create Hotfix Branch

```bash
# Branch directly from main (production code)
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue-description
```

### 2. Implement Minimal Fix

```bash
# Make the smallest possible change to fix the issue
# Focus on resolution, not improvement

git add -A
git commit -m "hotfix: resolve critical production issue

Fix [specific issue] that was causing [impact].

- Minimal change to [affected component]
- Maintains backward compatibility
- Emergency fix for production deployment

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 3. Fast-Track Review and Deploy

```bash
# Push hotfix
git push -u origin hotfix/critical-issue-description

# Create PR with "HOTFIX" label
gh pr create --title "hotfix: critical issue description" --label "hotfix"

# After approval, merge immediately to main
# Deploy to production ASAP
```

### 4. Backport to Feature Branches

Ensure the hotfix doesn't get overwritten by pending features:

```bash
# Switch to main after hotfix merge
git checkout main
git pull origin main

# Merge into active feature branches
git checkout feature/active-feature
git merge main
git push
```

---

## Git Best Practices

### Repository Hygiene

#### Keep Branches Clean

```bash
# Regularly clean up merged branches
git branch --merged main | grep -v main | xargs -n 1 git branch -d

# Remove remote tracking branches for deleted remotes
git remote prune origin
```

#### Use .gitignore Effectively

Ensure these are ignored:

- `node_modules/`
- `.env*` (environment files)
- `dist/` or `build/` (build artifacts)
- `.DS_Store` (macOS)
- `*.log` (log files)
- IDE-specific files (`.vscode/`, `.idea/`)

### Commit Best Practices

#### Atomic Commits

Each commit should represent one logical change:
✅ **Good:** "feat: add user authentication"
❌ **Bad:** "feat: add user auth and fix bug and update docs"

#### Meaningful Messages

Write commit messages for your future self:
✅ **Good:** "fix: resolve calendar sync timeout by increasing retry limit"
❌ **Bad:** "fix stuff"

#### Test Before Committing

```bash
# Always run tests before committing
pnpm run test
pnpm run check
pnpm run lint
```

### Collaboration Best Practices

#### Regular Synchronization

```bash
# Daily sync with main branch
git checkout main
git pull origin main
git checkout feature/your-feature
git merge main
```

#### Communicate Breaking Changes

- Use conventional commit format with `!` for breaking changes
- Document breaking changes in commit message body
- Update migration guides if necessary

#### Backup Important Work

```bash
# Push frequently for backup
git push origin feature/your-feature

# Consider using stash for experimental work
git stash push -m "experimental approach"
```

---

## Troubleshooting

### Common Issues and Solutions

#### Merge Conflicts

```bash
# When merge conflicts occur
git status                    # See conflicted files
# Edit files to resolve conflicts
git add resolved-file.ts      # Stage resolved files
git commit -m "resolve merge conflicts"
```

#### Undo Last Commit (Not Pushed)

```bash
# Undo commit but keep changes
git reset --soft HEAD~1

# Undo commit and discard changes (dangerous!)
git reset --hard HEAD~1
```

#### Fix Commit Message

```bash
# Fix the last commit message (not pushed)
git commit --amend -m "corrected commit message"

# Fix commit that was already pushed (requires force push)
git commit --amend -m "corrected message"
git push --force-with-lease
```

#### Recovery from Accidents

```bash
# See reflog to find lost commits
git reflog

# Recover lost commit
git reset --hard HEAD@{2}

# Recover deleted branch
git checkout -b recovered-branch HEAD@{2}
```

#### Stash Management

```bash
# Save current work temporarily
git stash push -m "work in progress on feature X"

# List stashes
git stash list

# Apply stash
git stash apply stash@{0}

# Apply and remove stash
git stash pop stash@{0}

# Clear all stashes
git stash clear
```

### Windows-Specific Git Issues

#### Line Ending Handling

```bash
# Configure git to handle Windows line endings
git config --global core.autocrlf true

# Check current setting
git config core.autocrlf
```

#### Path Issues

```bash
# Enable long path support in Windows
git config --global core.longpaths true

# Handle spaces in paths properly
git add "path with spaces/file.txt"
```

---

## Git Configuration

### Global Configuration Setup

```bash
# Set user information
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Set default branch name
git config --global init.defaultBranch main

# Enable colored output
git config --global color.ui auto

# Set default editor
git config --global core.editor "code --wait"

# Configure line ending handling (Windows)
git config --global core.autocrlf true
```

### Project-Specific Configuration

```bash
# Set up project-specific settings in repository
git config user.name "Project Name"
git config user.email "project@example.com"

# Configure merge tool
git config merge.tool vscode
git config mergetool.vscode.cmd 'code --wait $MERGED'
```

### Useful Git Aliases

```bash
# Add helpful aliases
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.ci commit
git config --global alias.lg "log --oneline --decorate --all --graph"
git config --global alias.last "log -1 HEAD"
```

---

## Security Considerations

### Sensitive Information

Never commit:

- API keys or secrets
- Database credentials
- Personal access tokens
- Environment configuration files (`.env`)
- User data or test data with PII

### Pre-commit Hooks

Use tools to prevent accidental commits of sensitive data:

```bash
# Install git-secrets
npm install -g git-secrets

# Set up git-secrets
git secrets --install
git secrets --register-aws
```

### GPG Signing (Optional but Recommended)

```bash
# Generate GPG key
gpg --gen-key

# Configure git to use GPG key
git config --global user.signingkey [GPG-KEY-ID]
git config --global commit.gpgsign true

# Sign individual commits
git commit -S -m "signed commit message"
```

---

## Workflow Examples

### Example: Complete Feature Development

```bash
# 1. Start new feature
git checkout main
git pull origin main
git checkout -b feature/user-dashboard

# 2. Initial planning commit
git add docs/development/plans/user-dashboard-plan.md
git commit -m "docs: add user dashboard implementation plan"

# 3. Implement feature in phases
git add src/lib/components/Dashboard.svelte
git commit -m "feat: add basic dashboard component structure"

git add src/lib/services/DashboardService.ts
git commit -m "feat: implement dashboard data service"

git add src/lib/components/DashboardWidget.svelte
git commit -m "feat: add reusable dashboard widget component"

# 4. Add tests
git add src/lib/tests/dashboard/
git commit -m "test: add comprehensive dashboard component tests"

# 5. Final integration
git add src/routes/dashboard/
git commit -m "feat: integrate dashboard into main application"

# 6. Documentation
git add docs/
git commit -m "docs: update component documentation for dashboard"

# 7. Pre-push validation
pnpm run pre-push

# 8. Push and create PR
git push -u origin feature/user-dashboard
gh pr create --title "feat: add user dashboard with widgets"
```

### Example: Bug Fix Workflow

```bash
# 1. Create bugfix branch
git checkout main
git pull origin main
git checkout -b bugfix/calendar-sync-error

# 2. Investigate and fix
git add src/lib/services/CalendarService.ts
git commit -m "fix: resolve calendar sync authentication timeout

- Increase API timeout from 5s to 15s
- Add retry logic for failed requests
- Improve error handling for expired tokens

Fixes issue where long-running calendar syncs would
timeout and leave tasks in inconsistent state."

# 3. Add test for fix
git add src/lib/tests/calendar/
git commit -m "test: add test coverage for calendar sync timeout scenarios"

# 4. Validate fix
pnpm run test
pnpm run pre-push

# 5. Push and create PR
git push -u origin bugfix/calendar-sync-error
gh pr create --title "fix: resolve calendar sync authentication timeout"
```

---

_This workflow guide is living documentation. Update it as the project evolves and new patterns emerge._
