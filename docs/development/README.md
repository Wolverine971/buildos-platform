# Development Documentation

This directory contains comprehensive development process documentation for the Build OS project. Use these documents to ensure consistent, high-quality development practices.

## Quick Start

For any development work, follow this process:

1. **Read the main process guide:** [`DEVELOPMENT_PROCESS.md`](./DEVELOPMENT_PROCESS.md)
2. **Create an implementation plan:** Use template from [`templates/FEATURE_PLAN_TEMPLATE.md`](./templates/FEATURE_PLAN_TEMPLATE.md)
3. **Follow testing procedures:** Reference [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md)
4. **Use proper git workflow:** Follow guidelines in [`GIT_WORKFLOW.md`](./GIT_WORKFLOW.md)

## Documentation Structure

### 📋 Core Process Documentation

- **[`DEVELOPMENT_PROCESS.md`](./DEVELOPMENT_PROCESS.md)** - Main development workflow guide
    - Pre-development checks with context7 MCP integration
    - Planning phase with mandatory approval gates
    - Implementation workflow with frequent git commits
    - Testing cycles including Playwright UI testing
    - Sub-agent delegation strategies
    - Version control best practices

- **[`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md)** - Comprehensive testing procedures
    - Unit testing with dual Vitest configurations
    - Integration testing strategies
    - UI/E2E testing with Playwright MCP
    - LLM testing guidelines (cost-aware)
    - Performance and security testing
    - Cross-platform testing requirements

- **[`GIT_WORKFLOW.md`](./GIT_WORKFLOW.md)** - Version control best practices
    - Branch naming conventions and lifecycle
    - Commit message standards with Claude Code attribution
    - Merge and PR processes
    - Hotfix workflows for production issues
    - Troubleshooting and recovery procedures

### 📝 Templates

- **[`templates/FEATURE_PLAN_TEMPLATE.md`](./templates/FEATURE_PLAN_TEMPLATE.md)** - Comprehensive planning template
    - Problem statement and success criteria
    - Technical analysis with framework compatibility checks
    - Implementation strategy with sub-agent delegation
    - Detailed step-by-step implementation plan
    - Testing strategy and rollback procedures
    - Progress tracking and approval checkpoints

### 📁 Implementation Plans

- **[`plans/`](./plans/)** - Active and completed implementation plans
    - Use naming convention: `[YYYY-MM-DD]-[feature-name]-plan.md`
    - Track progress continuously in these documents
    - Archive completed plans for reference

## Key Features of This Development Process

### 🔧 MCP Integration

- **context7 MCP**: Always check latest framework documentation before development
- **Playwright MCP**: Comprehensive UI testing and iteration
- **Sub-agent delegation**: Efficient task distribution for research and routine tasks

### ✅ Quality Assurance

- **Mandatory planning**: No coding without approved implementation plans
- **Frequent commits**: Version control after every major change
- **Comprehensive testing**: Multi-layer testing approach
- **Pre-push validation**: Quality gates prevent broken deployments

### 📊 Progress Tracking

- **Living documentation**: Plans continuously updated during development
- **Clear milestones**: Track progress against defined checkpoints
- **Approval gates**: Stakeholder approval before implementation
- **Post-implementation review**: Document learnings and improvements

## Command Reference

### Development Commands

```bash
pnpm run dev:split          # Development with type checking
pnpm run check              # Type checking only
pnpm run check:watch        # Continuous type checking
```

### Testing Commands

```bash
pnpm run test               # Unit tests (excludes expensive LLM tests)
pnpm run test:llm           # LLM tests (use sparingly - costs money)
pnpm run test:watch         # Watch mode testing
```

### Quality Commands

```bash
pnpm run lint               # ESLint check
pnpm run lint:fix           # Auto-fix linting issues
pnpm run format             # Prettier formatting
pnpm run pre-push           # Full CI pipeline
```

### Build Commands

```bash
pnpm run build              # Production build
pnpm run build:analyze      # Build with bundle analysis
pnpm run preview            # Preview production build
```

## Best Practices Summary

1. **📋 Always plan first** - Use the feature plan template before any development
2. **💾 Commit frequently** - After every major change with descriptive messages
3. **🧪 Test continuously** - Don't batch testing to the end of development
4. **🤖 Use sub-agents effectively** - Delegate research and routine tasks
5. **📝 Document as you go** - Update plans and documentation continuously
6. **🔒 Security first** - Never commit secrets or expose sensitive data
7. **⚡ Performance matters** - Consider bundle size and runtime performance
8. **📱 Mobile responsive** - Test on mobile devices, follow modal standards
9. **♿ Accessibility compliance** - Follow WCAG guidelines for UI components
10. **🔄 Follow conventions** - Check existing patterns before creating new ones

## Emergency Procedures

### Hotfix Process

For critical production issues:

1. Create hotfix branch: `hotfix/critical-issue-description`
2. Make minimal fix with proper testing
3. Fast-track review and deployment
4. Backport to active feature branches

### Rollback Process

If deployment issues occur:

1. Identify last stable commit: `git log --oneline`
2. Create revert commit: `git revert [commit-hash]`
3. Test rollback thoroughly
4. Deploy and monitor

## Getting Help

- **Process questions**: Refer to the main [`DEVELOPMENT_PROCESS.md`](./DEVELOPMENT_PROCESS.md)
- **Testing issues**: Check [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md)
- **Git problems**: See troubleshooting section in [`GIT_WORKFLOW.md`](./GIT_WORKFLOW.md)
- **Template usage**: Copy and customize [`templates/FEATURE_PLAN_TEMPLATE.md`](./templates/FEATURE_PLAN_TEMPLATE.md)

## Maintenance

This documentation is living and should be updated based on:

- **Team feedback**: Incorporate learnings from development experiences
- **Process improvements**: Update workflows as they evolve
- **Tool changes**: Reflect changes in development tools and practices
- **Project evolution**: Adapt to changing project requirements

---

**Remember**: The goal is consistent, high-quality development that protects your work through proper version control while maintaining efficiency through automation and clear processes.

_Last updated: January 2025_
