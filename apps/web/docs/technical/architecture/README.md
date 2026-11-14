<!-- apps/web/docs/technical/architecture/README.md -->

# 🏗️ Architecture Documentation

This directory contains system architecture documentation for BuildOS.

## 📁 Contents

### Core Architecture Files

- **`overview.md`**: C4 Level 1 System Context diagram and high-level architecture
- **`brain-dump-flow.md`**: Detailed architecture of the core brain dump feature
- **`supabase-design.md`**: Database and authentication architecture patterns
- **`ai-pipeline.md`**: OpenAI integration patterns and processing pipeline
- **`calendar-sync.md`**: Google Calendar integration architecture

### `/decisions/` - Architecture Decision Records (ADRs)

- **`ADR-001-supabase.md`**: Why we chose Supabase over other backends
- **`ADR-002-dual-processing.md`**: Brain dump dual processing architecture
- **`ADR-003-project-calendars.md`**: Per-project Google Calendar design

## 🎯 Purpose

This architecture documentation helps:

- Understand system design decisions
- Plan new feature integration
- Identify technical debt
- Onboard new technical team members
- Make informed architectural changes

## 🔄 ADR Process

When making significant architectural decisions:

1. Create a new ADR file with incrementing number
2. Use the format: `ADR-XXX-short-title.md`
3. Include: Context, Decision, Status, Consequences
4. Review with technical team before implementation

## More architecture notes

- [content-creation-skill-family.md](./content-creation-skill-family.md) — the content-creation skill family in agentic chat
- [AGENTIC_CHAT_LAYER_TAXONOMY_PROPOSAL_2026-06-15.md](./AGENTIC_CHAT_LAYER_TAXONOMY_PROPOSAL_2026-06-15.md) — why layer 2 is called "outcome cards" (implemented proposal)
- [REFLECTION_AI_BETTER_AT_PRODUCT_2026-06-19.md](./REFLECTION_AI_BETTER_AT_PRODUCT_2026-06-19.md) — reflection memo: decision records, per-project glossary (ideas, not built)
