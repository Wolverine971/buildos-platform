<!-- thoughts/shared/ideas/project-context-sub-node-design.md -->
# Project Context Sub-node System - Feature Overview

## Problem Statement

Currently, projects have a single large `context` field containing markdown documentation that describes the project's scope, strategy, technical details, and other important information. These context documents can grow very large (10,000+ characters), making them:

- Difficult to load efficiently
- Hard to update specific sections without affecting others
- Challenging to search through or reference specific parts
- Unwieldy for AI/LLM processing due to context window limitations
- Problematic for focused editing of individual sections

## Solution: Smart Context Chunking

We're implementing an intelligent system that automatically breaks down large context documents into smaller, manageable "sub-nodes" while preserving the document's structure and maintaining easy access to both the full document and individual sections.

## Core Concept

Think of it like turning a long book into chapters that can be:

- Read independently (focused view)
- Quickly summarized (overview with previews)
- Assembled back into the full book (reconstruction)

The system analyzes the markdown structure and applies smart rules to determine when and how to break up the content.

## Breaking Rules

The system uses intelligent thresholds to decide when to create sub-nodes:

1. **Small Documents (<3000 chars)**: Keep as single node - no breaking needed
2. **Medium Documents (3000-10000 chars)**: Optional breaking - only break if individual sections are >2000 chars
3. **Large Documents (>10000 chars)**: Mandatory breaking - must split into sub-nodes

This ensures we don't over-fragment small documents while properly handling large ones.

## How It Works

### Original State

```
projects.context = "entire 15,000 character markdown document"
```

### After Migration

```
projects.context = "overview with ### headers and 100-char previews of large sections"
projects.context_structure = {
  "sub_nodes": {
    "technical-architecture": { "id": "uuid", "content_length": 3400, "tags": ["technical"] },
    "project-strategy": { "id": "uuid", "content_length": 2100, "tags": ["strategy"] }
  }
}

sub_contexts table:
- Row 1: Full "technical-architecture" section (3400 chars)
- Row 2: Full "project-strategy" section (2100 chars)
```

## Three Access Patterns

1. **Overview Mode** (Fast)
    - Read `projects.context` directly
    - See document structure with previews
    - Perfect for quick scanning

2. **Full Document Mode** (Complete)
    - Call `get_full_project_context()` function
    - Reconstructs original document by replacing previews with full content
    - Used when you need everything

3. **Focused Mode** (Targeted)
    - Query specific `sub_contexts` rows
    - Edit individual sections without loading entire document
    - Ideal for targeted updates

## Key Benefits

### Performance

- Load 500-char overview instead of 15,000-char document
- Fetch only the sections you need
- Parallel processing of different sections

### Editing

- Update a single section without affecting others
- Multiple people can edit different sections simultaneously
- Track changes at section level

### AI/LLM Processing

- Right-sized chunks for embedding and vector search
- Fits within context windows
- Can process sections independently then combine results

### Search & Discovery

- Search within specific tagged sections (e.g., "find all technical sections")
- Build knowledge graphs across projects
- Surface relevant sections without full document scan

## Data Structure

### Parent Document (projects.context)

Contains the structure with previews:

```markdown
## Project Overview

This is the full overview text that stayed in parent...

## Technical Architecture

_[Content extracted to sub-node: This section describes our microservices architecture using...]_

## Implementation Timeline

_[Content extracted to sub-node: Phase 1 begins in January with the API development...]_
```

### Sub-nodes (sub_contexts table)

Each extracted section stored separately with:

- Full content
- Auto-generated tags
- Position/order information
- Metadata for reconstruction

### Metadata (projects.context_structure)

JSONB tracking of all sub-nodes:

```json
{
	"total_length": 15000,
	"has_subnodes": true,
	"sub_nodes": {
		"technical-architecture": {
			"id": "uuid-1234",
			"content_length": 3400,
			"tags": ["technical", "architecture"]
		}
	}
}
```

## Migration Approach

We're building this as a non-destructive migration that:

1. Preserves all original content (backup first)
2. Analyzes existing markdown structure
3. Applies smart breaking rules
4. Creates sub-nodes for large sections
5. Updates parent with previews
6. Maintains bidirectional references

## Use Cases

### For Product Teams

- Quick overview of project scope without information overload
- Easy updates to specific sections like timeline or requirements
- Better organization of project documentation

### For Engineering

- Load only technical sections when reviewing architecture
- Update implementation details without touching business context
- Faster API responses when fetching project data

### For AI/Automation

- Process large documents in chunks
- Generate embeddings for semantic search
- Build relationships between similar sections across projects

## Important Considerations

1. **Non-Destructive**: Original content can always be reconstructed
2. **Backward Compatible**: Projects without sub-nodes continue working normally
3. **Flexible Thresholds**: Can adjust breaking rules based on usage patterns
4. **Smart Tags**: Auto-generated tags enable cross-project knowledge graphs
5. **Preview System**: Parent document remains readable with section previews

## Success Metrics

- Reduce average context load time from 500ms to 50ms for large documents
- Enable focused editing of sections >2000 characters
- Support semantic search across project sections
- Maintain 100% content fidelity (full reconstruction = original)

## Technical Stack

- **Database**: PostgreSQL with JSONB for flexible metadata
- **Tables**: `projects` (enhanced), `sub_contexts` (new)
- **Functions**: `get_full_project_context()` for reconstruction
- **Language**: TypeScript for parsing and migration logic
- **Framework**: Supabase for database operations

This system transforms monolithic project documentation into an intelligent, graph-like structure that preserves simplicity while enabling powerful new capabilities for reading, writing, and processing project information.
