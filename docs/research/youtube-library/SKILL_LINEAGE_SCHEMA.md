<!-- docs/research/youtube-library/SKILL_LINEAGE_SCHEMA.md -->

# Skill Lineage Schema

Status: experimental draft

This schema lets BuildOS model skills as graph-shaped data without adopting a graph
database yet. Each skill can keep a small `lineage.yaml` beside its `SKILL.md`.
The manifest should be easy for humans to edit, useful to agents, and structured
enough to migrate into database tables later.

## Design Principle

Start with files. Model relationships explicitly. Only promote to database tables
or a graph database after the workflow proves that traversal, recommendations, or
impact analysis need it.

A skill lineage manifest answers three questions:

1. What primitive skills compose this larger skill?
2. Which source claims support each primitive?
3. Which operational outputs, guardrails, or scorecard items use each primitive?

## File Convention

```txt
skill-drafts/<skill-slug>/
+-- SKILL.md
+-- lineage.yaml
```

`SKILL.md` remains the agent-facing playbook. `lineage.yaml` is the structured
source and composition map.

## Node Types

- `skill`: a full agent skill or reusable playbook.
- `primitive_skill`: a smaller reusable capability that can compound into larger
  skills.
- `source`: a video, article, book, internal doc, benchmark, transcript, or other
  origin material.
- `source_claim`: a specific claim, framework element, principle, or tactic from a
  source.
- `output_artifact`: an output the skill asks the agent to produce.
- `guardrail`: a behavioral constraint or anti-pattern.
- `evaluation_item`: a rubric item, scorecard question, or testable criterion.

## Edge Types

- `composed_of`: a skill is made from a primitive skill.
- `depends_on`: one primitive needs another to work.
- `cites`: a node cites a source or source claim.
- `informed_by`: a node is shaped by a source but not directly derived from it.
- `derived_from`: a skill or primitive is a fork/adaptation of another skill.
- `operationalizes`: a primitive becomes an output, guardrail, or rubric item.
- `evaluated_by`: a skill or primitive is assessed by a rubric or test.
- `conflicts_with`: a principle may clash with another principle in some contexts.
- `supersedes`: a newer node replaces an older node.

## Minimal Manifest Shape

```yaml
lineage_version: 0.1
updated: YYYY-MM-DD

root_skill:
  id: skill-slug
  name: Human Name
  path: docs/.../SKILL.md
  status: draft

nodes:
  - id: primitive.example
    type: primitive_skill
    name: Example Primitive
    summary: What this primitive helps the agent do.

sources:
  - id: source.example
    type: youtube_analysis
    title: Source title
    creator: Source creator
    url: https://example.com
    local_path: docs/.../source.md

source_claims:
  - id: claim.example
    source_id: source.example
    summary: The specific claim or framework element used by the skill.
    used_for:
      - primitive.example

edges:
  - from: skill-slug
    to: primitive.example
    type: composed_of
    rationale: Why this primitive belongs in the skill.
  - from: primitive.example
    to: claim.example
    type: cites
    rationale: What the source claim contributes.
```

## Authoring Rules

- Do not model every idea. Add a node only when it changes the agent's behavior.
- Prefer claim-level citations over broad "this skill cites this video" links.
- Give every primitive a stable slug. Slugs should survive wording changes.
- Separate source lineage from skill composition. A primitive can cite several
  source claims, and a source claim can support several primitives.
- Mark adjacent or future sources as `candidate_v2_sources` instead of quietly
  importing them into the current skill.
- Keep the graph acyclic where possible for simple authoring, but do not force a
  tree. A primitive can belong to many larger skills.
- If a relationship feels debatable, include `confidence` and `open_questions`.
