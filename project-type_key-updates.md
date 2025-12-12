<!-- project-type_key-updates.md -->

# Project Type Key Format Change: Philosophy & Implementation Guide

**Purpose**: This document explains the reasoning behind the project type_key format change and provides guidance for AI agents updating the BuildOS codebase.

**Date**: December 10, 2025
**Status**: Migration Required

---

## Executive Summary

We are changing the project type_key format from:

```
project.{role}.{deliverable}[.{variant}]
```

To:

```
project.{realm}.{deliverable}[.{variant}]
```

**The core insight**: Role describes _who is doing the work_ (the user), while realm describes _what category of value the project creates_. These are orthogonal concepts that were incorrectly conflated.

---

## The Problem: Role ≠ Project Category

### Previous (Incorrect) Format

```
project.writer.book
project.coach.client
project.developer.app
project.founder.startup
```

This format used the person's **role** (writer, coach, developer, founder) as the first segment, implying that the project type is determined by who is working on it.

### Why This Is Wrong

1. **A developer can write a book** → Should be `project.creative.book`, not `project.developer.book`
2. **A writer can build an app** → Should be `project.technical.app`, not `project.writer.app`
3. **A coach can launch a startup** → Should be `project.business.startup`, not `project.coach.startup`
4. **A founder can take a course** → Should be `project.education.course`, not `project.founder.course`

The project's fundamental nature doesn't change based on who is working on it. A book is a creative project whether written by a developer, a coach, or a professional writer.

### The Correct Mental Model

| Concept         | Belongs To  | Answers                                        |
| --------------- | ----------- | ---------------------------------------------- |
| **Realm**       | The Project | "What category of value does this create?"     |
| **Role**        | The User    | "What is this person's professional identity?" |
| **Deliverable** | The Project | "What specific thing is being produced?"       |

---

## The Solution: Realm-Based Taxonomy

### New Format

```
project.{realm}.{deliverable}[.{variant}]
```

### The Six Core Realms

| Realm         | Core Focus                   | Success Metric      | Example Deliverables                                      |
| ------------- | ---------------------------- | ------------------- | --------------------------------------------------------- |
| **creative**  | Original content, expression | Published artifact  | book, article, album, video, brand, design                |
| **technical** | Building functional systems  | Working system      | app, api, feature, infrastructure                         |
| **business**  | Commercial growth & ventures | Revenue/market      | startup, product_launch, campaign, market_research, event |
| **service**   | Delivering value to clients  | Client outcome      | coaching_program, consulting_engagement, workshop         |
| **education** | Acquiring knowledge          | Learning/credential | course, thesis, certification, research                   |
| **personal**  | Self/life improvement        | Personal change     | habit, routine, goal, wellness                            |

> **Edge Cases Folded Into Core Realms**:
>
> - **Research** → `business` (market research), `education` (academic research), or a phase within another project
> - **Operations** → `business` (company ops, hiring, events) or `service` (client operations)
> - **Design** → `creative` (visual/brand design) or `technical` (UX/product design)

### Why Only 6 Realms?

These 6 realms achieve 90%+ classification accuracy from brain dumps because:

1. **Vocabulary is distinctive** - Technical, creative, and business have unmistakable signals
2. **Success metrics are clear** - Each realm has a fundamentally different definition of "done"
3. **Minimal overlap** - Edge cases can be cleanly routed to a core realm

---

## Migration Examples

### Before → After

| Old Type Key                       | New Type Key                                 | Reasoning                     |
| ---------------------------------- | -------------------------------------------- | ----------------------------- |
| `project.writer.book`              | `project.creative.book`                      | Book is creative output       |
| `project.writer.article`           | `project.creative.article`                   | Article is creative output    |
| `project.coach.client`             | `project.service.coaching_program`           | Coaching is service delivery  |
| `project.coach.client.executive`   | `project.service.coaching_program.executive` | Executive variant             |
| `project.developer.app`            | `project.technical.app`                      | App is technical output       |
| `project.developer.app.mobile`     | `project.technical.app.mobile`               | Mobile variant                |
| `project.developer.software`       | `project.technical.app`                      | Normalize to "app"            |
| `project.founder.startup`          | `project.business.startup`                   | Startup is business venture   |
| `project.marketer.campaign`        | `project.business.campaign`                  | Campaign is business activity |
| `project.student.thesis`           | `project.education.thesis`                   | Thesis is educational         |
| `project.personal.morning_routine` | `project.personal.routine`                   | Personal routine              |

### Templates That Need Updates

Any template with `scope: "project"` needs its `type_key` updated:

```typescript
// OLD
{
  type_key: "project.writer.book",
  realm: "writer",  // This was really the role
  // ...
}

// NEW
{
  type_key: "project.creative.book",
  realm: "creative",  // This is the actual realm
  // Role information moves to template metadata or is inferred from user context
}
```

---

## Implementation Checklist

### 1. Database Updates

- [ ] Update `onto_templates` table: Change all project template `type_key` values
- [ ] Update `onto_templates` table: Change `realm` column values for project templates
- [ ] Update `onto_projects` table: Migrate existing project `type_key` values
- [ ] Verify foreign key constraints and indexes

### 2. Code Updates

#### Constants/Enums

- [ ] Update realm constants/enums wherever defined
- [ ] Add `PROJECT_REALMS` array: `['creative', 'technical', 'business', 'service', 'education', 'personal']`
- [ ] Update validation regex patterns

#### Template Files

- [ ] Update all project template seed files
- [ ] Update template type definitions
- [ ] Update template resolver logic

#### API Endpoints

- [ ] Update `/api/onto/templates` filtering logic
- [ ] Update `/api/onto/projects/instantiate` validation
- [ ] Update any realm-based routing

#### AI Agent / Chat Context

- [ ] Update system prompts that reference project type_keys
- [ ] Update template search examples in prompts
- [ ] Update inference logic for brain dump → project creation
- [ ] Add realm classification signals to prompts

#### UI Components

- [ ] Update template selection UI (if it shows realm categories)
- [ ] Update any hardcoded type_key references
- [ ] Update project creation forms

### 3. Documentation Updates

- [ ] Update TYPE_KEY_TAXONOMY.md (this PR)
- [ ] Update NAMING_CONVENTIONS.md
- [ ] Update INTELLIGENT_PROJECT_CREATION.md examples
- [ ] Update any API documentation

---

## AI Agent Inference Guide

When an AI agent processes a brain dump to create a project, it should:

### Step 1: Detect Deliverable Keywords

| If user mentions...                  | Likely deliverable                        |
| ------------------------------------ | ----------------------------------------- |
| "book", "novel", "manuscript"        | book                                      |
| "app", "application", "software"     | app                                       |
| "article", "blog post", "essay"      | article                                   |
| "client", "engagement", "consulting" | coaching_program or consulting_engagement |
| "startup", "company", "business"     | startup                                   |
| "course", "class", "degree"          | course or certification                   |

### Step 2: Infer Realm from Context

| Strong Signals                                                                            | Realm     |
| ----------------------------------------------------------------------------------------- | --------- |
| "write", "publish", "draft", "content", "story", "design", "brand"                        | creative  |
| "build", "code", "deploy", "API", "feature", "UX", "product"                              | technical |
| "launch", "revenue", "customers", "market", "pitch", "hire", "event", "research" (market) | business  |
| "client", "session", "engagement", "deliverable", "consulting", "workshop"                | service   |
| "learn", "class", "assignment", "thesis", "course", "study" (academic)                    | education |
| "habit", "routine", "goal", "health", "personal", "wellness"                              | personal  |

### Step 3: Disambiguation

If signals are mixed, ask: **"What does success look like?"**

- "I shipped it / it's working" → **technical**
- "The client achieved their goal" → **service**
- "We hit our revenue target" → **business**
- "I learned the skill" → **education**
- "It's published / content is live" → **creative**
- "I'm doing it consistently" → **personal**

### Step 4: Construct Type Key

```typescript
const typeKey = `project.${realm}.${deliverable}`;
// e.g., "project.creative.book", "project.technical.app"
```

---

## Validation Rules

### Type Key Pattern

```typescript
// Project type_key must match:
/^project\.(creative|technical|business|service|education|personal)\.[a-z_]+(\.[a-z_]+)?$/;
```

### Valid Realms

```typescript
const VALID_PROJECT_REALMS = [
	'creative',
	'technical',
	'business',
	'service',
	'education',
	'personal'
] as const;
```

### Validation Function

```typescript
function isValidProjectTypeKey(typeKey: string): boolean {
	const pattern = /^project\.([a-z_]+)\.([a-z_]+)(\.[a-z_]+)?$/;
	const match = typeKey.match(pattern);
	if (!match) return false;

	const realm = match[1];
	return VALID_PROJECT_REALMS.includes(realm as any);
}
```

---

## Role Handling (Post-Migration)

Role is still important but handled differently:

### Option 1: Template Metadata

Templates can be tagged with relevant roles:

```typescript
{
  type_key: "project.creative.book",
  realm: "creative",
  metadata: {
    suggested_roles: ["writer", "author", "content_creator"],
    // Used for template discovery, not taxonomy
  }
}
```

### Option 2: User Profile

Role is stored on the user, influencing which templates are shown:

```typescript
// User profile
{
  roles: ["developer", "founder"],
  // When searching templates, prioritize technical and business realms
}
```

### Option 3: Facet (Future)

Role could become a facet dimension:

```typescript
{
  type_key: "project.creative.book",
  props: {
    facets: {
      context: "personal",
      scale: "large",
      stage: "planning",
      role: "developer"  // Optional: who is doing this project
    }
  }
}
```

---

## Testing Checklist

After migration, verify:

- [ ] All existing projects still load correctly
- [ ] Template search returns correct results for each realm
- [ ] Project creation with brain dump infers correct realm
- [ ] UI displays realm categories correctly
- [ ] No broken foreign key relationships
- [ ] API validation accepts new format, rejects old format
- [ ] Documentation examples match new format

---

## Rollback Plan

If issues are discovered:

1. Database: Keep backup of old type_key values in a migration column
2. Code: Feature flag to toggle between old/new validation
3. Templates: Keep old template files until migration is verified

---

## Questions for Implementation

1. **Existing projects**: Do we migrate existing project type_keys, or grandfather them with the old format?
2. **Template versioning**: Do we version templates or replace in-place?
3. **Role storage**: Which option (metadata, user profile, facet) for handling role?
4. **Validation strictness**: Hard fail on old format, or warn and accept during transition?

---

**Key Takeaway**: This change separates two orthogonal concepts (realm vs role) that were incorrectly conflated. The project's fundamental nature is determined by what it produces (realm + deliverable), not by who is working on it (role).
