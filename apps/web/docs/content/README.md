<!-- apps/web/docs/content/README.md -->

# Content Strategy & Blog Documentation

> **Purpose:** This folder contains content strategy documents for BuildOS blog, positioning, and content planning. For brand strategy and messaging, see [Brand Documentation](/docs/marketing/brand/).

---

## Quick Navigation

| Document                                              | Purpose                              | Status      |
| ----------------------------------------------------- | ------------------------------------ | ----------- |
| [Agentic Chat Positioning](#agentic-chat-positioning) | Product positioning for Project Lens | Active      |
| [Blog Update Master Plan](#blog-update-master-plan)   | Strategic blog content plan          | Active      |
| [Blog Audit 2025](#blog-audit-2025)                   | Content audit and improvements       | Reference   |
| [Blog Drafts](#blog-drafts)                           | Unpublished blog content             | In Progress |

---

## Document Descriptions

### Agentic Chat Positioning

**File:** `AGENTIC_CHAT_POSITIONING.md`

Product positioning document for BuildOS's agentic chat feature (Project Lens). Covers:

- Feature positioning and naming
- Competitive differentiation
- User-facing messaging

**Related:** [Zoom Messaging Guide](/docs/marketing/brand/ZOOM_MESSAGING_GUIDE.md) | [Brand Strategy 2025](/docs/marketing/brand/BRAND_STRATEGY_2025.md)

---

### Blog Update Master Plan

**File:** `BLOG_UPDATE_MASTER_PLAN.md`

Strategic content plan for BuildOS blog. Includes:

- Content calendar and themes
- Jab/Hook content strategy
- Blog topic prioritization
- SEO and conversion goals

**Related:** [Brand Strategy 2025](/docs/marketing/brand/BRAND_STRATEGY_2025.md) (content strategy section)

---

### Blog Audit 2025

**File:** `BLOG_AUDIT_2025.md`

Comprehensive audit of existing blog content. Covers:

- Content quality assessment
- Redundancy analysis
- Improvement recommendations
- Cross-linking opportunities

---

### Blog Drafts

Unpublished blog content ready for review:

| Draft                                          | Topic                                | Status           |
| ---------------------------------------------- | ------------------------------------ | ---------------- |
| `BLOG_DRAFT_10_REASONS_SCOPED_CONVERSATION.md` | Scoped conversation benefits         | Ready for review |
| `BLOG_DRAFT_ZOOM_IN_OUT.md`                    | Zoom as a skill (thought leadership) | Ready for review |

---

## Related Documentation

### Brand Strategy (Moved)

The following documents have been moved to `/docs/marketing/brand/` for centralized brand management:

| Document             | New Location                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Brand Strategy 2025  | [`/docs/marketing/brand/BRAND_STRATEGY_2025.md`](/docs/marketing/brand/BRAND_STRATEGY_2025.md)   |
| Zoom Messaging Guide | [`/docs/marketing/brand/ZOOM_MESSAGING_GUIDE.md`](/docs/marketing/brand/ZOOM_MESSAGING_GUIDE.md) |

### Brand Documentation Hub

**Location:** `/docs/marketing/brand/`

| Document                                                                                | Purpose                                                    |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Brand Strategy 2025](/docs/marketing/brand/BRAND_STRATEGY_2025.md)                     | **Master strategy** - comprehensive 2025 brand positioning |
| [Brand Guide 1-Pager](/docs/marketing/brand/brand-guide-1-pager.md)                     | Quick reference for brand essentials                       |
| [Zoom Messaging Guide](/docs/marketing/brand/ZOOM_MESSAGING_GUIDE.md)                   | How to communicate zoom in/out concept                     |
| [Brand Personality Profile](/docs/marketing/brand/buildos-brand-personality-profile.md) | Voice, tone, and personality traits                        |
| [Communication Guide](/docs/marketing/brand/communication-guide.md)                     | DJ's communication preferences                             |

**Full Marketing Index:** [`/docs/marketing/INDEX.md`](/docs/marketing/INDEX.md)

---

## Published Blog Content

Live blog posts are located in:

```
/apps/web/src/content/blogs/
├── getting-started/
│   ├── daily-brief-guide.md
│   ├── under-the-hood.md
│   └── understanding-life-goals.md
└── productivity-tips/
    ├── context-engineering-101.md
    ├── evolution-of-note-taking.md
    └── task-management-best-practices.md
```

### Content Ownership Matrix

Each blog has a distinct focus to avoid redundancy:

| Blog                     | Authoritative For              | Links To                            |
| ------------------------ | ------------------------------ | ----------------------------------- |
| Under the Hood           | Ontology architecture          | —                                   |
| Context Engineering 101  | Context compounding philosophy | —                                   |
| Daily Brief Guide        | Daily briefs as intelligence   | Under the Hood, Context Engineering |
| Understanding Life Goals | Goal-project alignment         | Under the Hood, Context Engineering |
| Evolution of Note-Taking | Note-taking history            | Under the Hood, Context Engineering |
| Task Management          | Task best practices            | Under the Hood                      |

---

## Content Strategy Principles

From [Brand Strategy 2025](/docs/marketing/brand/BRAND_STRATEGY_2025.md):

### Jab/Hook Content Model

- **Jabs (80%):** Value-first content that helps readers regardless of BuildOS
- **Hooks (20%):** Product-focused content with clear CTAs

### Key Messaging Themes

1. **Build Context That Compounds** - Primary value proposition
2. **Zoom In / Zoom Out** - Core interaction pattern
3. **Rich Context Architecture** - Technical differentiation
4. **Context-First, Not Agent-First** - Market positioning

### CTA Variation

Each blog should have a unique CTA rather than repeating the same tagline:

- Daily Briefs → "Get your first daily brief"
- Under the Hood → "Try the connected approach"
- Goals → "Start with your first goal"
- Context Engineering → "Start building context" (flagship)

---

## Workflow

### Creating New Blog Content

1. Check [Blog Update Master Plan](BLOG_UPDATE_MASTER_PLAN.md) for priorities
2. Review [Brand Strategy 2025](/docs/marketing/brand/BRAND_STRATEGY_2025.md) for messaging alignment
3. Draft in `BLOG_DRAFT_*.md` format
4. Ensure unique focus (see Content Ownership Matrix)
5. Use appropriate CTA variation
6. Move to `/apps/web/src/content/blogs/` when ready

### Updating Existing Content

1. Check [Blog Audit 2025](BLOG_AUDIT_2025.md) for known issues
2. Ensure cross-links to authoritative blogs
3. Remove redundant ontology/compounding explanations
4. Verify CTA uniqueness

---

_Last Updated: January 2025_
_See also: [Marketing Index](/docs/marketing/INDEX.md) | [Brand Strategy](/docs/marketing/brand/BRAND_STRATEGY_2025.md)_
