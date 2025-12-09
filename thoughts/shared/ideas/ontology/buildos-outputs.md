<!-- thoughts/shared/ideas/ontology/buildos-outputs.md -->
# BuildOS Project Outputs & Deliverables — Master Reference (v2)

> A comprehensive taxonomy of project deliverables, their primitives, inheritance strategy, and recommended tools for creation.

---

## Overview

In BuildOS, **deliverables** are versioned, tangible outputs that represent concrete progress. Each deliverable has:

- A `type_key` (e.g., `deliverable.chapter`, `deliverable.research_doc.icp`)
- A `state_key` tracked by FSM (draft → review → approved → published)
- Multiple `versions` with `storage_uri` pointing to the actual artifact
- Props specific to that deliverable type (validated by JSON Schema)

This document catalogs all deliverable types, explains the inheritance system, classifies them by primitive, and recommends tools for creation.

---

## Table of Contents

1. [Taxonomy Architecture & Inheritance Strategy](#taxonomy-architecture--inheritance-strategy)
2. [Complete Deliverable Type Catalog](#complete-deliverable-type-catalog)
3. [Deliverable Primitives Classification](#deliverable-primitives-classification)
4. [Storage Architecture Recommendations](#storage-architecture-recommendations)
5. [Seeding Strategy](#seeding-strategy)

---

## Taxonomy Architecture & Inheritance Strategy

### The Core Question

How do **project types** (`marketer.campaign`, `writer.book`, `coach.client`) relate to **deliverable types** (`deliverable.research_doc`, `deliverable.chapter`)?

**Answer:** Use a **three-layer architecture** with template inheritance.

---

### The Three Layers

#### Layer 1: Base Deliverable Templates (Domain-Agnostic Primitives)

These are **abstract** templates that define the core structure any user can extend:

```typescript
// Example: Base research document template
{
  type_key: "deliverable.research_doc",
  name: "Research Document",
  is_abstract: true,              // Cannot be used directly (forces specialization)
  scope: "deliverable",
  metadata: {
    primitive: "TEXT_DOCUMENT",
    output_type: "knowledge",
    description: "General-purpose research document"
  },
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      research_question: { type: "string" },
      findings: { type: "string" },
      sources: { type: "array" }
    },
    required: ["title"]
  },
  fsm: {
    states: ["draft", "review", "approved"],
    transitions: [
      { from: "draft", to: "review", event: "submit" },
      { from: "review", to: "approved", event: "approve" }
    ]
  }
}
```

**Purpose:** Define the minimal shared structure. Most base templates should be `is_abstract: true`.

---

#### Layer 2: Specialized Variants (When Schemas Differ)

Create **variants** that inherit from base templates when domain needs differ significantly:

```typescript
// ICP Research (for marketers/founders)
{
  type_key: "deliverable.research_doc.icp",
  name: "ICP Research Document",
  parent_template_id: "<uuid of deliverable.research_doc>",
  is_abstract: false,
  metadata: {
    primitive: "TEXT_DOCUMENT",
    output_type: "knowledge",
    typical_use_by: ["marketer", "founder", "sales"],
    description: "Ideal Customer Profile research with target segments and buying triggers"
  },
  schema: {
    // Inherits: title, research_question, findings, sources
    // Adds specialized fields:
    properties: {
      target_segment: { type: "string" },
      company_size: { type: "string", enum: ["1-10", "11-50", "51-200", "201-1000", "1000+"] },
      industry: { type: "string" },
      pain_points: { type: "array", items: { type: "string" } },
      buying_triggers: { type: "array", items: { type: "string" } },
      decision_makers: { type: "array" },
      budget_range: { type: "string" },
      competitive_alternatives: { type: "array" }
    },
    required: ["target_segment", "pain_points"]
  },
  fsm: {
    // Extends base FSM with validation state
    states: ["draft", "review", "validated", "approved"],
    transitions: [
      { from: "draft", to: "review", event: "submit" },
      { from: "review", to: "validated", event: "validate" },
      { from: "validated", to: "approved", event: "approve" }
    ]
  }
}

// Academic Research (for students/researchers)
{
  type_key: "deliverable.research_doc.academic",
  name: "Academic Research Paper",
  parent_template_id: "<uuid of deliverable.research_doc>",
  metadata: {
    typical_use_by: ["student", "researcher"],
    description: "Academic research with hypothesis, methodology, and citations"
  },
  schema: {
    // Inherits base, adds:
    properties: {
      hypothesis: { type: "string" },
      methodology: { type: "string", enum: ["qualitative", "quantitative", "mixed-methods"] },
      literature_review: { type: "string" },
      bibliography: { type: "array" },
      citations: { type: "array" },
      keywords: { type: "array" }
    },
    required: ["hypothesis", "methodology"]
  }
}

// User Research (for designers)
{
  type_key: "deliverable.research_doc.user",
  name: "User Research Document",
  parent_template_id: "<uuid of deliverable.research_doc>",
  metadata: {
    typical_use_by: ["designer", "product"],
    description: "User research with interviews, personas, and journey maps"
  },
  schema: {
    properties: {
      participants: { type: "array" },
      interview_transcripts: { type: "array" },
      personas: { type: "array" },
      user_journeys: { type: "array" },
      insights: { type: "array" },
      recommendations: { type: "array" }
    },
    required: ["participants"]
  }
}

// Competitive Research (for business/strategy)
{
  type_key: "deliverable.research_doc.competitive",
  name: "Competitive Analysis",
  parent_template_id: "<uuid of deliverable.research_doc>",
  metadata: {
    typical_use_by: ["marketer", "founder", "consultant"],
    description: "Competitive landscape analysis"
  },
  schema: {
    properties: {
      competitors: { type: "array" },
      swot_analysis: { type: "object" },
      market_positioning: { type: "string" },
      differentiation: { type: "array" }
    }
  }
}
```

---

#### Layer 3: Project Templates Suggest Deliverables

Project templates define **typical deliverables** in their metadata:

```typescript
// Marketer project template
{
  type_key: "marketer.campaign",
  scope: "project",
  metadata: {
    realm: "sales_marketing",
    output_type: "content",
    suggested_deliverables: [
      "deliverable.research_doc.icp",      // Specialized variant
      "deliverable.research_doc.competitive",
      "deliverable.copy",                   // Generic
      "deliverable.social_media",           // Generic
      "deliverable.email_sequence"          // Generic
    ]
  }
}

// Student project template
{
  type_key: "student.research",
  scope: "project",
  metadata: {
    realm: "education",
    suggested_deliverables: [
      "deliverable.research_doc.academic",  // Specialized
      "deliverable.presentation",           // Generic
      "deliverable.paper"                   // Generic
    ]
  }
}

// Designer project template
{
  type_key: "designer.product",
  scope: "project",
  metadata: {
    realm: "creative",
    suggested_deliverables: [
      "deliverable.research_doc.user",      // Specialized
      "deliverable.wireframe",              // Generic
      "deliverable.mockup",                 // Generic
      "deliverable.prototype"               // Generic
    ]
  }
}

// Writer project template
{
  type_key: "writer.book",
  scope: "project",
  metadata: {
    realm: "creative",
    suggested_deliverables: [
      "deliverable.chapter",                // Generic (no variant needed)
      "deliverable.outline",                // Generic
      "deliverable.research_doc"            // Generic base is fine
    ]
  }
}
```

---

### Template Inheritance Mechanics

#### Schema Merging

Child templates **inherit and extend** parent schemas:

```typescript
// Resolution algorithm (pseudo-code)
function resolveTemplate(type_key) {
	const chain = getInheritanceChain(type_key); // [child, parent, grandparent]

	let resolved = {
		schema: { properties: {}, required: [] },
		fsm: {},
		metadata: {},
		facet_defaults: {}
	};

	// Merge from root to leaf (parent first, child overrides)
	for (const template of chain.reverse()) {
		resolved.schema.properties = {
			...resolved.schema.properties,
			...template.schema.properties
		};
		resolved.schema.required = [...resolved.schema.required, ...template.schema.required];
		resolved.fsm = template.fsm; // Child completely overrides
		resolved.metadata = { ...resolved.metadata, ...template.metadata };
		resolved.facet_defaults = { ...resolved.facet_defaults, ...template.facet_defaults };
	}

	return resolved;
}
```

**Example result:**

```typescript
// deliverable.research_doc.icp (resolved)
{
  schema: {
    properties: {
      // From base:
      title: { type: "string" },
      research_question: { type: "string" },
      findings: { type: "string" },
      sources: { type: "array" },

      // From variant:
      target_segment: { type: "string" },
      pain_points: { type: "array" },
      buying_triggers: { type: "array" }
    },
    required: ["title", "target_segment", "pain_points"]
  }
}
```

#### FSM Inheritance

Child can **extend** or **completely override** parent FSM:

```typescript
// Strategy 1: Extend (add states/transitions)
variant_fsm = {
  extends: parent_fsm,
  states: [...parent_fsm.states, "validated"], // adds state
  transitions: [
    ...parent_fsm.transitions,
    { from: "review", to: "validated", event: "validate" }
  ]
}

// Strategy 2: Override (replace completely)
variant_fsm = {
  states: ["new_draft", "in_progress", "done"], // completely different
  transitions: [...]
}
```

---

### When to Create Variants vs Use Generic

**✅ Create a variant when:**

1. **Schema differs significantly**
    - Different required fields
    - Domain-specific properties
    - Example: ICP research needs `buying_triggers`, academic needs `bibliography`

2. **FSM states are domain-specific**
    - Marketing research needs "validated" state
    - Academic research needs "peer_review" state
    - Example: Different approval workflows

3. **Default properties are completely different**
    - Different document structure
    - Different validation rules

4. **Used frequently by specific domain**
    - Marketers always need ICP research
    - Students always need academic papers
    - Worth creating dedicated template

**❌ Use generic + props customization when:**

1. **Schema is mostly the same**
    - Just different values, not different fields
    - Example: Fiction vs non-fiction chapters (same structure)

2. **FSM is identical**
    - Same approval workflow
    - Same states/transitions

3. **One-off or rare use case**
    - Not worth maintaining separate template
    - Can customize via props

4. **Differences are cosmetic**
    - Just naming or labels
    - No structural differences

---

### Decision Matrix

| Scenario                             | Create Variant? | Example                                                                   |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------- |
| Completely different required fields | ✅ Yes          | ICP research (needs `buying_triggers`) vs academic (needs `bibliography`) |
| Different FSM states                 | ✅ Yes          | Marketing research needs "validated", academic needs "peer_review"        |
| Domain-specific validation           | ✅ Yes          | ICP requires `target_segment` + `pain_points`                             |
| Used frequently by domain            | ✅ Yes          | Every marketer needs ICP research                                         |
| Just different field values          | ❌ No           | Fiction vs non-fiction book (same structure, different genre)             |
| Rare one-off use                     | ❌ No           | Custom research for specific client                                       |
| Cosmetic differences only            | ❌ No           | Just labels/naming differences                                            |
| Same approval workflow               | ❌ No           | Use generic with props customization                                      |

---

### Real-World Examples

#### Example 1: Marketer Creating ICP Research

**User brain-dump:**

```
"Need to research our ideal customer profile for enterprise SaaS buyers.
Focus on 50-200 employee companies with recent funding."
```

**AI Agent Process:**

1. Detects domain: `marketer` (keywords: "ICP", "enterprise", "buyers")
2. Matches project type: `marketer.strategy`
3. Checks `metadata.suggested_deliverables`
4. Suggests: `deliverable.research_doc.icp` (specialized variant)

**Result:**

```typescript
{
  project: {
    type_key: "marketer.strategy",
    props: {
      facets: { context: "commercial", scale: "medium", stage: "planning" }
    }
  },
  deliverables: [
    {
      type_key: "deliverable.research_doc.icp",
      name: "Enterprise SaaS ICP Analysis",
      props: {
        target_segment: "B2B SaaS companies, 50-200 employees",
        company_size: "51-200",
        industry: "Software/Technology",
        pain_points: [
          "Manual reporting processes",
          "Data silos across teams",
          "Compliance overhead"
        ],
        buying_triggers: [
          "Recent funding round",
          "Failed audit",
          "New regulations"
        ],
        decision_makers: ["VP Engineering", "CFO", "CTO"],
        budget_range: "$50k-$200k annually"
      }
    }
  ]
}
```

**UI Experience:**

- Form shows ICP-specific fields (not generic research fields)
- FSM shows: draft → review → **validated** → approved
- Validation requires `target_segment` and `pain_points`

---

#### Example 2: Student Creating Research Paper

**User brain-dump:**

```
"Writing a research paper on climate change effects on coral reefs
for Marine Biology 301. Need to do lit review and field observations."
```

**AI Agent Process:**

1. Detects domain: `student` (keywords: "class", "paper", "research")
2. Matches project type: `student.project`
3. Suggests: `deliverable.research_doc.academic`

**Result:**

```typescript
{
  project: {
    type_key: "student.project",
    props: {
      facets: { context: "academic", scale: "medium", stage: "discovery" }
    }
  },
  deliverables: [
    {
      type_key: "deliverable.research_doc.academic",
      name: "Climate Change Impact on Coral Reefs",
      props: {
        course_name: "Marine Biology 301",
        hypothesis: "Rising ocean temperatures correlate with increased coral bleaching events",
        methodology: "mixed-methods",
        literature_review: "Analyzed 50 peer-reviewed studies from 2015-2024...",
        bibliography: [
          "Hughes, T. et al. (2017). Global warming and coral bleaching...",
          "Hoegh-Guldberg, O. (2020). Coral reef ecosystems under climate change..."
        ],
        keywords: ["coral reefs", "climate change", "ocean warming", "bleaching"]
      }
    }
  ]
}
```

**UI Experience:**

- Form shows academic-specific fields (hypothesis, methodology, bibliography)
- FSM shows: draft → review → approved (standard academic workflow)
- Validation requires `hypothesis` and `methodology`

---

#### Example 3: Writer Creating Book Chapter (No Variant Needed)

**User brain-dump:**

```
"Writing chapter 3 of my sci-fi novel about AI consciousness"
```

**AI Agent Process:**

1. Detects domain: `writer`
2. Matches project type: `writer.book`
3. Suggests: `deliverable.chapter` (generic is perfect)

**Result:**

```typescript
{
  project: {
    type_key: "writer.book",
    props: {
      facets: { context: "personal", scale: "large", stage: "execution" },
      genre: "science fiction"
    }
  },
  deliverables: [
    {
      type_key: "deliverable.chapter", // Generic works for all books
      name: "Chapter 3: The Discovery",
      props: {
        chapter_number: 3,
        word_count_target: 5000,
        pov_character: "Sarah",
        setting: "Underwater research station"
      }
    }
  ]
}
```

**Why no variant?**

- All book chapters have the same structure (title, content, word count)
- FSM is identical (draft → revision → final)
- Fiction vs non-fiction is just a `genre` property, not different schema

---

#### Example 4: Designer Creating User Research (Specialized)

**User brain-dump:**

```
"Need to do user interviews for our mobile banking app redesign.
Interview 10 users, create personas."
```

**AI Agent Process:**

1. Detects domain: `designer`
2. Matches project type: `designer.product`
3. Suggests: `deliverable.research_doc.user`

**Result:**

```typescript
{
  project: {
    type_key: "designer.product"
  },
  deliverables: [
    {
      type_key: "deliverable.research_doc.user",
      name: "Mobile Banking App User Research",
      props: {
        participants: [
          { name: "P1", age: 28, occupation: "Software Engineer" },
          { name: "P2", age: 45, occupation: "Small Business Owner" }
        ],
        interview_transcripts: ["..."],
        personas: [
          {
            name: "Tech-Savvy Sam",
            goals: ["Quick transfers", "Investment tracking"],
            pain_points: ["Too many taps", "Confusing navigation"]
          }
        ],
        user_journeys: [...],
        insights: [
          "Users want transfer in <3 taps",
          "Confusion around investment section"
        ],
        recommendations: [
          "Simplify transfer flow",
          "Add guided tour for investments"
        ]
      }
    }
  ]
}
```

---

### AI Agent Matching Logic

**Prompt instructions for Intake Agent:**

```
When proposing deliverables:

1. Check project template's metadata.suggested_deliverables first
2. Match brain-dump keywords to deliverable variants:

   Keywords → Variant Mapping:
   - "ICP", "ideal customer", "target segment" → deliverable.research_doc.icp
   - "user research", "interviews", "personas" → deliverable.research_doc.user
   - "thesis", "academic", "hypothesis" → deliverable.research_doc.academic
   - "competitive", "competitors", "market analysis" → deliverable.research_doc.competitive

3. If brain-dump mentions domain-specific needs, suggest specialized variant
4. If generic needs or no variant exists, use base template
5. Never create new deliverable types on the fly - use existing templates

Examples:
- "research ICP for SaaS" → deliverable.research_doc.icp ✓
- "user interviews for app" → deliverable.research_doc.user ✓
- "write chapter" → deliverable.chapter ✓ (generic is fine)
- "competitive landscape" → deliverable.research_doc.competitive ✓
```

---

### Database Schema for Inheritance

Already in migration:

```sql
-- Templates table has inheritance support
create table onto.templates (
  id uuid primary key,
  type_key text not null,
  parent_template_id uuid references onto.templates(id), -- Inheritance
  is_abstract boolean default false,                      -- Can't instantiate directly
  schema jsonb not null,
  fsm jsonb not null,
  metadata jsonb not null,  -- Stores suggested_deliverables, typical_use_by, etc.
  ...
);
```

**Template resolution query:**

```sql
-- Recursive CTE to get inheritance chain
WITH RECURSIVE template_chain AS (
  -- Start with requested template
  SELECT
    id, type_key, schema, fsm, metadata, facet_defaults,
    parent_template_id, 0 as depth
  FROM onto.templates
  WHERE type_key = 'deliverable.research_doc.icp'

  UNION ALL

  -- Walk up parent chain
  SELECT
    t.id, t.type_key, t.schema, t.fsm, t.metadata, t.facet_defaults,
    t.parent_template_id, tc.depth + 1
  FROM onto.templates t
  JOIN template_chain tc ON t.id = tc.parent_template_id
)
SELECT * FROM template_chain ORDER BY depth DESC;

-- Application layer merges schemas from root (parent) to leaf (child)
```

---

### Summary: The Strategy

**✅ Keep deliverable types domain-agnostic by default**

- Base templates: `deliverable.research_doc`, `deliverable.chapter`, `deliverable.mockup`
- Most are `is_abstract: true` to encourage specialization

**✅ Create specialized variants when schemas truly differ**

- Variants: `deliverable.research_doc.icp`, `deliverable.research_doc.academic`
- Each variant has domain-specific fields and FSM

**✅ Use template inheritance for specialization**

- Child templates inherit base schema/FSM and extend with specifics
- Merge algorithm: parent properties + child properties

**✅ Project templates suggest appropriate deliverable variants**

- `marketer.*` projects → suggest `.icp` variants
- `student.*` projects → suggest `.academic` variants
- AI agent uses suggestions for smart matching

**✅ AI agent matches context to suggest variants**

- Keywords in brain-dump trigger variant selection
- Fall back to generic base if no variant matches
- Never create new types on the fly

**Result:** Flexible, non-exploding taxonomy that captures domain-specific needs while staying DRY (Don't Repeat Yourself).

---

## Complete Deliverable Type Catalog

### Base Templates (Abstract)

These should be marked `is_abstract: true` and serve as parents for variants:

```
deliverable.document          — Generic document (base for all text docs)
deliverable.research_doc      — Research document (base for specialized research)
deliverable.report            — Report (base for different report types)
deliverable.plan              — Plan/strategy document (base for specialized plans)
deliverable.design            — Design asset (base for design types)
deliverable.media             — Media file (base for video/audio)
deliverable.code              — Code artifact (base for software deliverables)
```

### Written Content (Concrete Templates)

```
deliverable.chapter          — Book chapter (generic, no variant needed)
deliverable.article          — Published article/essay
deliverable.blog_post        — Blog post
deliverable.newsletter       — Newsletter edition
deliverable.whitepaper       — Long-form thought leadership
deliverable.case_study       — Customer case study
deliverable.script           — Screenplay/video script
deliverable.copy             — Marketing copy (ads, landing pages)
deliverable.press_release    — PR materials
deliverable.technical_doc    — API docs, user manuals
deliverable.ebook            — Digital book
deliverable.guide            — How-to guide
deliverable.tutorial         — Step-by-step tutorial
deliverable.email_sequence   — Email drip campaign
```

### Research Documents (Variants)

```
deliverable.research_doc.icp          — Ideal Customer Profile research
deliverable.research_doc.academic     — Academic research paper
deliverable.research_doc.user         — User research (UX)
deliverable.research_doc.competitive  — Competitive analysis
deliverable.research_doc.market       — Market research
```

### Design Assets

```
deliverable.design           — Generic design asset (base)
deliverable.logo             — Logo design
deliverable.brand_guide      — Brand guidelines document
deliverable.mockup           — UI/UX mockup
deliverable.wireframe        — Wireframe
deliverable.illustration     — Illustration/digital art
deliverable.infographic      — Infographic
deliverable.presentation     — Pitch deck, slide deck
deliverable.social_media     — Social media graphics
deliverable.packaging        — Package design
deliverable.icon_set         — Icon collection
deliverable.style_guide      — Visual style guide
deliverable.prototype        — Interactive prototype
deliverable.banner           — Banner/header graphics
deliverable.thumbnail        — Video/content thumbnail
```

### Media & Audio-Visual

```
deliverable.video            — Edited video
deliverable.podcast_episode  — Podcast episode
deliverable.audio_track      — Music track/sound
deliverable.album            — Music album
deliverable.photography      — Photo collection/shoot
deliverable.animation        — Animation sequence
deliverable.motion_graphic   — Motion graphics
deliverable.edit             — Video edit (rough cut)
deliverable.render           — Final render
deliverable.soundscape       — Audio environment/ambience
deliverable.voiceover        — Voice recording
deliverable.trailer          — Video trailer/teaser
```

### Software & Technical

```
deliverable.feature          — Software feature
deliverable.module           — Code module/component
deliverable.api              — API endpoint/version
deliverable.release          — Software release
deliverable.deployment       — Deployed application
deliverable.database_schema  — Database design
deliverable.architecture     — System architecture
deliverable.integration      — System integration
deliverable.library          — Code library/package
deliverable.plugin           — Plugin/extension
deliverable.migration        — Database migration
deliverable.test_suite       — Test suite
deliverable.documentation    — Code documentation
```

### Service Outputs

```
deliverable.workout_plan     — Fitness plan
deliverable.meal_plan        — Nutrition plan
deliverable.treatment_plan   — Therapy/medical plan
deliverable.coaching_report  — Session summary/progress
deliverable.assessment       — Client assessment
deliverable.recommendation   — Professional recommendation
deliverable.strategy         — Consulting strategy
deliverable.audit_report     — Audit findings
deliverable.analysis         — Data/business analysis
deliverable.program_design   — Program design
deliverable.session_plan     — Session/class plan
deliverable.progress_report  — Progress tracking report
```

### Events & Experiences

```
deliverable.workshop         — Workshop session
deliverable.webinar          — Webinar
deliverable.course           — Complete course
deliverable.lesson           — Individual lesson
deliverable.training         — Training session
deliverable.conference       — Conference/summit
deliverable.performance      — Live performance
deliverable.exhibition       — Art exhibition
deliverable.retreat          — Retreat/intensive
deliverable.masterclass      — Masterclass session
deliverable.keynote          — Keynote presentation
```

### Research & Knowledge

```
deliverable.research_paper   — Academic paper (alias for .academic)
deliverable.dataset          — Data collection
deliverable.experiment       — Experiment results
deliverable.survey           — Survey results
deliverable.report           — Research/analysis report
deliverable.thesis           — Thesis/dissertation
deliverable.finding          — Key finding/insight
deliverable.model            — Statistical/ML model
deliverable.meta_analysis    — Meta-analysis
deliverable.literature_review — Literature review
deliverable.methodology      — Research methodology
deliverable.visualization    — Data visualization
```

### Physical Products

```
deliverable.prototype        — Physical prototype
deliverable.blueprint        — Architectural blueprint
deliverable.cad_model        — 3D CAD model
deliverable.fabrication      — Fabricated component
deliverable.installation     — Installed system
deliverable.build            — Completed build
deliverable.product          — Manufactured product
deliverable.schematic        — Circuit/system schematic
deliverable.sample           — Product sample
deliverable.pattern          — Sewing/manufacturing pattern
```

### Business & Legal

```
deliverable.contract         — Legal contract
deliverable.policy           — Company policy
deliverable.sop              — Standard operating procedure
deliverable.business_plan    — Business plan
deliverable.financial_model  — Financial projections
deliverable.pitch_deck       — Investor pitch
deliverable.roadmap          — Product/business roadmap
deliverable.proposal         — Business proposal
deliverable.compliance       — Compliance document
deliverable.budget           — Budget document
deliverable.forecast         — Financial forecast
deliverable.charter          — Project charter
deliverable.rfc              — Request for comments
```

### Educational & Certification

```
deliverable.curriculum       — Course curriculum
deliverable.exam             — Test/quiz
deliverable.certificate      — Completion certificate
deliverable.rubric           — Grading rubric
deliverable.syllabus         — Course syllabus
deliverable.exercise         — Practice exercise
deliverable.assignment       — Student assignment
deliverable.portfolio        — Student portfolio
deliverable.credential       — Certification credential
```

---

## Deliverable Primitives Classification

All deliverables fall into **7 fundamental primitives** based on their nature and how they're created/stored:

---

### 1. **TEXT_DOCUMENT** 📝

**Definition:** Text-based content that can be edited in text editors or word processors.

**Characteristics:**

- Can be created/edited natively in BuildOS
- Stored as markdown, HTML, or structured text
- Version control via text diff
- Supports collaborative editing

**Deliverable Types:**

```
✓ deliverable.chapter
✓ deliverable.article
✓ deliverable.blog_post
✓ deliverable.newsletter
✓ deliverable.whitepaper
✓ deliverable.case_study
✓ deliverable.script
✓ deliverable.copy
✓ deliverable.press_release
✓ deliverable.technical_doc
✓ deliverable.ebook
✓ deliverable.guide
✓ deliverable.tutorial
✓ deliverable.email_sequence
✓ deliverable.research_doc (all variants)
✓ deliverable.thesis
✓ deliverable.report
✓ deliverable.sop
✓ deliverable.proposal
✓ deliverable.curriculum
✓ deliverable.syllabus
```

**Recommended Creation Tools:**

- **Native BuildOS editor** (markdown/rich text) ⭐
- **Google Docs** → export to markdown
- **Notion** → export to markdown
- **Microsoft Word** → .docx storage
- **Obsidian/Roam** → markdown
- **Scrivener** (for long-form writing)

**Storage Strategy:**

- `storage_uri: "buildos://documents/{doc_id}/version/{n}"`
- Or external: `"gs://buildos-storage/projects/{project_id}/deliverables/{id}/v{n}.md"`
- Embed content directly in `props.content` for small documents (<100KB)

**BuildOS Native Support:** ✅ **Yes** — Can be created/edited in BuildOS

---

### 2. **DESIGN_FILE** 🎨

**Definition:** Visual assets created in design tools with layers, vectors, or raster graphics.

**Characteristics:**

- Requires specialized design software
- Binary file formats (Figma, Sketch, PSD, AI, SVG)
- Large file sizes
- Needs preview/thumbnail generation
- Version control via snapshots

**Deliverable Types:**

```
✓ deliverable.logo
✓ deliverable.brand_guide (hybrid: doc + design)
✓ deliverable.mockup
✓ deliverable.wireframe
✓ deliverable.illustration
✓ deliverable.infographic
✓ deliverable.presentation (hybrid: doc + design)
✓ deliverable.social_media
✓ deliverable.packaging
✓ deliverable.icon_set
✓ deliverable.style_guide
✓ deliverable.prototype (interactive)
✓ deliverable.banner
✓ deliverable.thumbnail
```

**Recommended Creation Tools:**

**For UI/UX Design:**

- **Figma** ⭐ (best for collaboration, web-based)
    - Embed via `storage_uri: "figma://file/{file_id}/node/{node_id}"`
    - Use Figma API to fetch thumbnails
- **Adobe XD**
- **Sketch** (Mac only)

**For Graphic Design:**

- **Canva** ⭐ (easiest for non-designers)
- **Adobe Illustrator** (vector)
- **Adobe Photoshop** (raster)
- **Affinity Designer** (affordable alternative)

**For Presentations:**

- **Figma** → export to PDF
- **Pitch** (modern presentation tool)
- **Google Slides**
- **Keynote/PowerPoint**

**Storage Strategy:**

- External link: `"figma://file/{id}"` or `"https://www.figma.com/file/{id}"`
- Exported versions: `"gs://buildos-storage/.../v{n}.pdf"` or `".../v{n}.png"`
- Store `props.thumbnail_url` for preview

**BuildOS Native Support:** ❌ **No** — Requires external tools
**Integration Strategy:** Link to external tool + store exported versions

---

### 3. **MEDIA_FILE** 🎬

**Definition:** Audio, video, or animation files requiring media production tools.

**Characteristics:**

- Large binary files (GB+)
- Requires rendering/encoding
- Multiple formats (mp4, mov, mp3, wav)
- Needs transcoding for web delivery
- Preview via player embed

**Deliverable Types:**

```
✓ deliverable.video
✓ deliverable.podcast_episode
✓ deliverable.audio_track
✓ deliverable.album
✓ deliverable.photography (batch of images)
✓ deliverable.animation
✓ deliverable.motion_graphic
✓ deliverable.edit
✓ deliverable.render
✓ deliverable.soundscape
✓ deliverable.voiceover
✓ deliverable.trailer
```

**Recommended Creation Tools:**

**Video Editing:**

- **DaVinci Resolve** ⭐ (free, professional)
- **Adobe Premiere Pro**
- **Final Cut Pro** (Mac)
- **CapCut** (simple, web-based)
- **Descript** (AI-powered, great for podcasts)

**Audio Editing:**

- **Audacity** (free, open source)
- **Adobe Audition**
- **Logic Pro** (Mac, music production)
- **Ableton Live** (music production)
- **Descript** ⭐ (podcast editing)

**Animation:**

- **After Effects** (motion graphics)
- **Blender** (3D animation, free)
- **Rive** (interactive animations)

**Storage Strategy:**

- Host on: **Vimeo** (private), **YouTube** (public), **S3/GCS** (raw files)
- `storage_uri: "vimeo://video/{id}"` or `"https://vimeo.com/{id}"`
- Store transcoded versions: `props.formats = [{ quality: "1080p", url: "..." }]`
- Generate thumbnails/previews automatically

**BuildOS Native Support:** ❌ **No** — Requires external tools
**Integration Strategy:**

- Store on media platform (Vimeo, YouTube, S3)
- Embed player in BuildOS UI
- Track version metadata + links

---

### 4. **CODE_ARTIFACT** 💻

**Definition:** Software code, packages, or executable programs.

**Characteristics:**

- Text-based but specialized (source code)
- Version control via Git
- Needs compilation/build step
- Testing/CI integration
- Deployment pipeline

**Deliverable Types:**

```
✓ deliverable.feature
✓ deliverable.module
✓ deliverable.api
✓ deliverable.release
✓ deliverable.deployment
✓ deliverable.library
✓ deliverable.plugin
✓ deliverable.migration
✓ deliverable.test_suite
✓ deliverable.documentation (code docs)
```

**Recommended Creation Tools:**

- **VS Code** ⭐ (universal IDE)
- **GitHub/GitLab** (version control + CI/CD)
- **Cursor** (AI-powered coding)
- **JetBrains IDEs** (language-specific)
- **Replit** (web-based, collaborative)

**Storage Strategy:**

- `storage_uri: "github://repo/{owner}/{repo}/commit/{sha}"`
- Or: `"github://repo/{owner}/{repo}/releases/tag/{tag}"`
- Link to deployed version: `"https://app.example.com"` + version tag
- Store build artifacts on package registries (npm, PyPI, Docker Hub)

**BuildOS Native Support:** ⚠️ **Partial** — Can track + link, not edit code
**Integration Strategy:**

- GitHub integration for linking commits/PRs
- Track releases as deliverable versions
- Embed deployment status

---

### 5. **DATA_FILE** 📊

**Definition:** Structured data files, spreadsheets, databases, or datasets.

**Characteristics:**

- Tabular or structured data
- Can be queried/analyzed
- Formats: CSV, JSON, SQL, Parquet
- Often large (MB-GB)
- Versioned via snapshots

**Deliverable Types:**

```
✓ deliverable.dataset
✓ deliverable.database_schema
✓ deliverable.financial_model (spreadsheet)
✓ deliverable.budget (spreadsheet)
✓ deliverable.forecast (spreadsheet)
✓ deliverable.survey (results data)
✓ deliverable.model (ML model file)
✓ deliverable.analysis (data + charts)
✓ deliverable.visualization (interactive dashboard)
```

**Recommended Creation Tools:**

**Spreadsheets:**

- **Google Sheets** ⭐ (collaborative)
- **Airtable** (database-spreadsheet hybrid)
- **Excel**
- **Notion databases**

**Data Analysis:**

- **Python/Pandas** (Jupyter notebooks)
- **R/RStudio**
- **Observable** (web-based notebooks)

**Visualization:**

- **Tableau**
- **Looker/Google Data Studio**
- **D3.js** (custom)
- **Plotly/Dash**

**Databases:**

- **Supabase** (Postgres)
- **Airtable**
- **MongoDB**

**Storage Strategy:**

- Small datasets: embed in `props.data`
- Large datasets: `"s3://bucket/datasets/{id}/v{n}.csv"`
- Link to live tools: `"https://docs.google.com/spreadsheets/d/{id}"`
- ML models: `"s3://bucket/models/{id}/v{n}.pkl"`

**BuildOS Native Support:** ⚠️ **Partial** — Can display tables, not full spreadsheet editor
**Integration Strategy:**

- Google Sheets integration (read-only embed)
- CSV upload + preview
- Link to external dashboards

---

### 6. **PHYSICAL_ARTIFACT** 🏗️

**Definition:** Physical objects, prototypes, or built structures.

**Characteristics:**

- Exists in physical world
- Represented digitally via photos/scans/CAD
- Cannot be "stored" digitally (only documentation)
- Version = iterations of physical object

**Deliverable Types:**

```
✓ deliverable.prototype (physical)
✓ deliverable.blueprint
✓ deliverable.cad_model
✓ deliverable.fabrication
✓ deliverable.installation
✓ deliverable.build
✓ deliverable.product (physical)
✓ deliverable.schematic
✓ deliverable.sample
✓ deliverable.pattern
```

**Recommended Creation Tools:**

**CAD/3D Modeling:**

- **Fusion 360** ⭐ (free for hobbyists)
- **SolidWorks** (professional)
- **AutoCAD** (architecture/engineering)
- **SketchUp** (architecture)
- **Blender** (free, open source)
- **Tinkercad** (beginner-friendly)

**Architecture:**

- **AutoCAD**
- **Revit**
- **ArchiCAD**
- **Rhino**

**Circuit Design:**

- **KiCAD** (free, open source)
- **Eagle**
- **Fusion 360** (electronics)

**Storage Strategy:**

- CAD files: `"s3://bucket/cad/{id}/v{n}.step"` or `.dwg`
- Photos: `"s3://bucket/photos/{id}/v{n}/"`
- 3D viewer: embed via **Sketchfab** or **three.js**
- Documentation: photos + specs in props

**BuildOS Native Support:** ❌ **No** — Physical artifacts tracked digitally
**Integration Strategy:**

- Store CAD files + reference photos
- Link to manufacturing/fabrication logs
- Track iterations via photo documentation

---

### 7. **EVENT_EXPERIENCE** 📅

**Definition:** Time-bound events, sessions, or live experiences.

**Characteristics:**

- Temporal (has start/end time)
- May be virtual, in-person, or hybrid
- Recording becomes a media artifact post-event
- Registration/attendance tracking
- Calendar integration

**Deliverable Types:**

```
✓ deliverable.workshop
✓ deliverable.webinar
✓ deliverable.course (if live)
✓ deliverable.lesson
✓ deliverable.training
✓ deliverable.conference
✓ deliverable.performance
✓ deliverable.exhibition
✓ deliverable.retreat
✓ deliverable.masterclass
✓ deliverable.keynote
```

**Recommended Creation Tools:**

**Virtual Events:**

- **Zoom** ⭐ (webinars, workshops)
- **Luma** (event pages + registration)
- **Eventbrite** (ticketing)
- **Hopin** (virtual conferences)
- **StreamYard** (live streaming)

**In-Person:**

- **Luma** (event management)
- **Eventbrite**
- **Partiful** (social events)

**Course Platforms:**

- **Teachable**
- **Thinkific**
- **Kajabi**
- **Circle** (community + courses)

**Storage Strategy:**

- Event metadata: date, location, attendees in `props`
- `storage_uri: "luma://event/{id}"` or `"zoom://meeting/{id}"`
- Recording: separate `deliverable.video` linked via edge
- Slides/materials: separate `deliverable.presentation` linked
- Calendar sync: `props.calendar_event_id`

**BuildOS Native Support:** ⚠️ **Partial** — Can track events, link to platforms
**Integration Strategy:**

- Calendar integration (Google Cal, Cal.com)
- Link to event platform (Zoom, Luma)
- Post-event: link recording + materials

---

## Hybrid Deliverables (Multiple Primitives)

Some deliverables combine multiple primitives:

**deliverable.brand_guide** = TEXT_DOCUMENT + DESIGN_FILE

- Text: guidelines, usage rules
- Design: logo files, color swatches, examples

**deliverable.presentation** = TEXT_DOCUMENT + DESIGN_FILE

- Text: speaker notes, script
- Design: slide visuals

**deliverable.course** = EVENT_EXPERIENCE + TEXT_DOCUMENT + MEDIA_FILE

- Event: live sessions
- Text: curriculum, assignments
- Media: recorded lessons

**deliverable.analysis** = DATA_FILE + TEXT_DOCUMENT

- Data: datasets, queries
- Text: insights, recommendations

**Solution:** Store primary artifact type, link related artifacts via `edges`:

```typescript
{
  deliverable_id: "brand-guide-uuid",
  type_key: "deliverable.brand_guide",
  storage_uri: "gs://bucket/brand-guide-v1.pdf", // primary
  props: {
    design_files: [
      { type: "logo", url: "figma://..." },
      { type: "templates", url: "figma://..." }
    ]
  }
}

// Linked via edges
edges: [
  {
    src_kind: "deliverable",
    src_id: "brand-guide-uuid",
    rel: "includes",
    dst_kind: "deliverable",
    dst_id: "logo-design-uuid"
  }
]
```

---

## Storage Architecture Recommendations

### For BuildOS Implementation:

**Native Storage (BuildOS manages directly):**

1. **TEXT_DOCUMENT** — Store in Supabase as markdown/HTML
    - Use `onto.document_versions.storage_uri = "buildos://..."`
    - Content in `props.content` for small docs
    - Tiptap/ProseMirror editor for rich text

2. **EVENT_EXPERIENCE** — Store event metadata
    - Calendar integration via Supabase
    - Link to external platforms (Zoom, Luma)

**External Storage (Link + Track):**

3. **DESIGN_FILE** → Figma, Canva

- Store: `storage_uri = "figma://file/{id}"`
- Fetch thumbnails via API
- Export PDF/PNG snapshots to S3 for archival

4. **MEDIA_FILE** → Vimeo, YouTube, S3
    - Store: `storage_uri = "vimeo://video/{id}"`
    - Embed player in UI
    - Transcode on S3 for high-res originals

5. **CODE_ARTIFACT** → GitHub
    - Store: `storage_uri = "github://repo/{owner}/{repo}/commit/{sha}"`
    - GitHub webhook for auto-versioning
    - Display commit diff in UI

6. **DATA_FILE** → Google Sheets, S3
    - Store: `storage_uri = "sheets://spreadsheet/{id}"`
    - Sync periodically via API
    - CSV export to S3 for snapshots

7. **PHYSICAL_ARTIFACT** → Photos on S3
    - Store CAD files on S3
    - Photos/documentation on S3
    - 3D preview via Sketchfab embed

### Recommended Storage Stack:

```
BuildOS
├── Text Documents (native)
│   ├── Markdown editor (Tiptap)
│   └── Stored in Supabase
│
├── External Integrations
│   ├── Figma (design files)
│   ├── GitHub (code)
│   ├── Google Sheets (data)
│   ├── Vimeo (video)
│   └── Calendar (events)
│
└── File Storage (S3/GCS)
    ├── Exported versions (PDF, PNG, CSV)
    ├── Media files (video, audio)
    ├── CAD files
    └── Photos/documentation
```

---

## Seeding Strategy

### Phase 1: Base Templates + Common Variants (Immediate)

**Base templates (abstract):**

```sql
deliverable.document (is_abstract: true)
deliverable.research_doc (is_abstract: true)
deliverable.design (is_abstract: true)
deliverable.media (is_abstract: true)
```

**High-priority variants:**

```sql
-- Research variants
deliverable.research_doc.icp
deliverable.research_doc.academic
deliverable.research_doc.user
deliverable.research_doc.competitive

-- Common concrete templates
deliverable.chapter
deliverable.article
deliverable.workout_plan
deliverable.mockup
deliverable.presentation
```

### Phase 2: Domain-Specific Templates (v1.1)

**Writer deliverables:**

```sql
deliverable.chapter (already seeded)
deliverable.article (already seeded)
deliverable.blog_post
deliverable.script
```

**Coach deliverables:**

```sql
deliverable.workout_plan (already seeded)
deliverable.meal_plan
deliverable.progress_report
deliverable.session_plan
```

**Developer deliverables:**

```sql
deliverable.feature
deliverable.release
deliverable.api
deliverable.documentation
```

**Designer deliverables:**

```sql
deliverable.mockup (already seeded)
deliverable.wireframe
deliverable.logo
deliverable.prototype
```

### Phase 3: External Integrations (v1.2)

- Figma integration for design files
- GitHub integration for code artifacts
- Google Sheets integration for data files
- Vimeo/YouTube for media files

### Phase 4: Advanced (v2)

- Hybrid deliverables with multiple artifacts
- Real-time collaboration on documents
- Version diffing across primitives

---

## Summary Matrix

| Primitive         | Native Support | External Tools          | Storage Strategy                   | Seeding Priority |
| ----------------- | -------------- | ----------------------- | ---------------------------------- | ---------------- |
| TEXT_DOCUMENT     | ✅ Yes         | Google Docs, Notion     | Supabase + markdown                | ⭐⭐⭐ Phase 1   |
| DESIGN_FILE       | ❌ No          | Figma, Canva            | External link + exported snapshots | ⭐⭐ Phase 2     |
| MEDIA_FILE        | ❌ No          | Vimeo, DaVinci Resolve  | S3 + streaming platform            | ⭐⭐ Phase 2     |
| CODE_ARTIFACT     | ⚠️ Partial     | GitHub, VS Code         | Git integration                    | ⭐⭐ Phase 2     |
| DATA_FILE         | ⚠️ Partial     | Google Sheets, Airtable | External link + CSV export         | ⭐ Phase 3       |
| PHYSICAL_ARTIFACT | ❌ No          | Fusion 360, photos      | S3 for documentation               | ⭐ Phase 3       |
| EVENT_EXPERIENCE  | ⚠️ Partial     | Zoom, Luma              | Calendar sync + metadata           | ⭐⭐⭐ Phase 1   |

---

**End of Master Reference v2** — This document provides the complete framework for deliverable taxonomy, inheritance, and implementation strategy.
