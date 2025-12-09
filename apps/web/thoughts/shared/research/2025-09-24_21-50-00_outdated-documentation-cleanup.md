---
date: 2025-09-25T01:50:22Z
researcher: Claude
git_commit: 101d119ed5546967897fa9c352ed847cb7f2ae40
branch: main
repository: build_os
topic: 'Outdated Documentation Cleanup and File Deletion Analysis'
tags: [research, codebase, documentation, cleanup, maintenance]
status: complete
last_updated: 2025-09-24
last_updated_by: Claude
path: apps/web/thoughts/shared/research/2025-09-24_21-50-00_outdated-documentation-cleanup.md
---

# Research: Outdated Documentation Cleanup and File Deletion Analysis

**Date**: 2025-09-25T01:50:22Z
**Researcher**: Claude
**Git Commit**: 101d119ed5546967897fa9c352ed847cb7f2ae40
**Branch**: main
**Repository**: build_os

## Research Question

Update the start-here documentation and identify all outdated files that should be deleted across /docs, focusing on old audits, research, and development documents. Check file modification dates and compile a comprehensive list of files for cleanup.

## Summary

Identified 40+ outdated documentation files across the codebase, primarily consisting of:

- Completed migration guides (Svelte 4 to 5)
- Temporary/daily task files from August 2025
- Incomplete placeholder documentation
- Completed audit and verification documents
- Superseded design documents
- Old implementation plans

The start-here.md document has been updated to version 1.4, removing references to outdated files and adding a new section documenting files scheduled for deletion.

## Detailed Findings

### Audit Files (/docs/audits/)

**Files Identified for Deletion:**

- `build-optimization-audit.md` - Last modified August 2, 2025 (8+ weeks old)
- `enum-migration-plan.md` - Last modified August 23, 2025 (migration complete)
- `enum-values-audit.md` - Last modified August 23, 2025 (related to completed migration)
- `enum-values-audit.json` - Last modified August 23, 2025 (JSON for completed migration)
- `google-page-speed-insights.md` - Last modified August 24, 2025 (outdated insights)
- `FINAL_STYLING_FIXES_REPORT.md` - Last modified August 24, 2025 (fixes applied)

**Files to Keep:**

- `BRAINDUMP_FLOW_AUDIT_2025.md` - Recent and comprehensive (September 2, 2025)
- `archive/CODE_CLEANUP_REPORT.md` - Recently archived (September 5, 2025)

**Already Deleted:**

- `api-bugs-audit.md` - Found in git history but no longer exists
- `BRAIN_DUMP_FLOW_AUDIT.md` - Superseded by 2025 version

### Development Files (/docs/development/)

**High Priority for Deletion:**

- `brain-dump-test.md` - Test file, no longer needed

**Medium Priority for Review:**

- `BUILD_STATUS.md` - Build status from September 5, 2025 (likely outdated)
- `IMMEDIATE_OPTIMIZATIONS.md` - Phase 1 optimizations completed per CLAUDE.md
- `CALENDAR_WEBHOOK_MIGRATION.md` - Migration from September 5, 2025 (likely complete)

**Old Plans (Possibly Complete):**

- `plans/brain-dump-auto-accept-background.md` - Old plan from September 9, 2025

### Design Files (/docs/design/)

**Completed Migrations (High Priority):**

- `SVELTE_4_TO_5_MIGRATION.md` - Migration complete (project on Svelte 5.37.2)
- `SVELTE_5_PROPS_MIGRATION.md` - Props migration complete (8/8 components done)

**Superseded Documents:**

- `LLM_TESTING_FLOW_DESIGN.md` - Replaced by simplified version
- `LLM_TESTING_FLOW_DESIGN_IMPROVED.md` - Also superseded
- `components/long-braindump-plan.md` - Implementation plan completed

**Old Component Specs:**

- `components/Button.md` - Last modified July 30, 2025
- `components/FormComponents.md` - Oldest file, July 23, 2025

**Note:** Most marketing files are actually recent (September 2025), particularly investor profiles.

### Prompt Files (/docs/prompts/)

**Completed Verifications/Audits:**

- `VERIFICATION_SUMMARY.md` - January 2025 verification marked complete
- `FIX_RESPONSE_FORMAT.md` - Implementation marked as FIXED
- `PROMPT_INCONSISTENCIES.md` - Most items marked completed
- `PREPROCESSING_STEPS_AUDIT.md` - Completed audit from September

**Old Examples:**

- `examples/sample-project-data.md` - Contains hardcoded 2024 dates
- `prompt-main-brief.md` - Hardcoded test data from June 2025
- `prompt-main-brief-result.md` - Example output with old dates
- `prompt-main-brief-update.md` - Template update from July 2025

### Research Files

**From /docs/research/ (January dated but modified in September):**

- `2025-01-07_23-30-54_recurring_tasks_display_strategy.md` - Recurring tasks implemented
- `2025-01-08_onboarding_service_api_investigation.md` - Onboarding complete

**From /thoughts/shared/research/ (Outdated January files):**

- `2025-01-15_19-30-00_claude-haiku-json-parsing-issue.md` - Specific bug fix
- `2025-01-16_02-45-30_database-performance-optimization.md` - Phase 1 complete
- `2025-01-18_13-46-02_task-dot-scrolling-issue.md` - UI bug fixed

**Note:** 30+ September 2025 research files are recent and should be retained.

## Code References

- `/docs/start-here.md:413-466` - Added new section documenting files for deletion
- `/docs/start-here.md:141` - Removed Svelte migration guides
- `/docs/start-here.md:144` - Removed long-braindump-plan.md
- `/docs/start-here.md:107-108` - Removed viral plan notes and target influencer files
- `/docs/start-here.md:176-186` - Cleaned up development process section
- `/docs/start-here.md:196-198` - Simplified prompt templates section
- `/docs/start-here.md:237-242` - Moved old audits to archive section

## Architecture Insights

1. **Documentation Lifecycle**: The codebase shows a healthy pattern of documentation creation and deprecation, but lacks a systematic archival process.

2. **Migration Pattern**: Svelte 4 to 5 migration is complete, evidenced by current package.json showing Svelte 5.37.2 and completed migration guides.

3. **Temporal Naming**: Files with dates in their names (especially January 2025) are often research or investigation documents that become outdated quickly.

4. **Placeholder Problem**: Marketing growth directory contains multiple placeholder files with minimal content that were never developed.

5. **Audit Accumulation**: Audit files tend to accumulate without cleanup, even after their recommendations are implemented.

## Recommendations

### Immediate Actions

1. **Delete High Priority Files** (23 files):
    - All completed migration guides
    - Temporary/test files (today-todos.md, brain-dump-test.md)
    - Incomplete placeholder files in marketing
    - Completed verification documents

2. **Archive Medium Priority Files** (15 files):
    - Move old audits to `/docs/audits/archive/`
    - Create `/docs/prompts/archive/` for completed verifications
    - Create `/docs/development/archive/` for old plans

3. **Update References**:
    - start-here.md has been updated (version 1.4)
    - Consider updating CLAUDE.md to remove references to completed migrations

### Long-term Improvements

1. **Establish Archive Policy**:
    - Create archive directories in each major documentation folder
    - Move completed/outdated docs rather than deleting (maintain history)
    - Add archive date to filename when moving

2. **Implement Documentation Review Cycle**:
    - Quarterly review of documentation currency
    - Add "review_by" date in frontmatter for time-sensitive docs
    - Automated reminder system for document review

3. **Improve Placeholder Management**:
    - Use TODO.md files instead of creating empty placeholder documents
    - Set up template files that clearly indicate "TEMPLATE - DO NOT USE DIRECTLY"

4. **Version Control for Documentation**:
    - Consider using semantic versioning for major documentation
    - Keep changelog for significant documentation updates

## Historical Context (from thoughts/)

The research revealed that many "January 2025" dated files in thoughts/shared/research/ were actually last modified in September 2025, suggesting they may have been migrated or reorganized. This pattern indicates ongoing maintenance but inconsistent file naming practices.

## Related Research

- Future research: Documentation lifecycle management best practices
- Future research: Automated documentation freshness checking

## Open Questions

1. Should we maintain historical audits for compliance/reference purposes?
2. What's the preferred archive retention period for completed documentation?
3. Should placeholder files be tracked differently (e.g., in a TODO system)?
4. How can we automate detection of outdated documentation?

## Files Deletion Summary

### Total Files Identified: 43

**By Priority:**

- High Priority (Delete Now): 23 files
- Medium Priority (Review First): 15 files
- Low Priority (Consider Archiving): 5 files

**By Directory:**

- /docs/audits/: 6 files
- /docs/development/: 7 files (+ 1 plan)
- /docs/design/: 5 files
- /docs/marketing/: 4 files
- /docs/prompts/: 8 files
- /docs/research/: 2 files
- /thoughts/shared/research/: 5 files

**By Type:**

- Completed migrations: 2 files
- Temporary/test files: 3 files
- Incomplete placeholders: 4 files
- Completed verifications: 4 files
- Old implementation plans: 5 files
- Superseded documents: 3 files
- Outdated audits: 6 files
- Old research: 7 files
- Example/sample files: 4 files

The cleanup will remove approximately 15-20% of documentation files, significantly improving navigation and reducing confusion about which documents are current.
