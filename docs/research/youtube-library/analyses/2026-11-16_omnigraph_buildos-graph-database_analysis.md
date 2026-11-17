---
title: 'Omnigraph and graph database use in BuildOS'
source_type: youtube_analysis
video_id: 'FeAysJe6FGA'
url: 'https://www.youtube.com/watch?v=FeAysJe6FGA'
channel: 'Roman Pronskiy'
channel_url: 'https://www.youtube.com/@pronskiy'
upload_date: 2026-11-12
duration: '02:16'
views: 88247
library_category: technology-and-agent-systems
library_status: 'analysis, internal-reference'
transcript_status: referenced
analysis_status: available
processing_status: internal_reference
processed: false
buildos_use: internal
skill_candidate: false
skill_priority: backlog
skill_draft: ''
public_article: ''
indexed_date: '2026-11-16'
last_reviewed: '2026-11-16'
path: docs/research/youtube-library/analyses/2026-11-16_omnigraph_buildos-graph-database_analysis.md
---

# Omnigraph and graph database use in BuildOS

BuildOS has strong uses for graph queries. Keep Supabase/Postgres as the source of truth for now, and make its existing graph more useful before adopting another database. The best first feature is impact tracing: show which tasks, milestones, goals, and supporting documents are connected to a proposed change, with the paths that explain the answer.

Omnigraph is worth evaluating if BuildOS needs agents to query and revise an isolated proposed world before publishing it. Its graph-wide branching and merging address a deeper problem than simply storing relationships. The code reviewed already provides graph-shaped storage, hybrid retrieval, and staged writes, so the decision is about capabilities beyond those foundations.

## Video notes

[Roman Pronskiy's demo](https://www.youtube.com/watch?v=FeAysJe6FGA) was published November 12, 2026 and runs 2:16. These are timestamped paraphrases of the available captions, not a verbatim transcript or an audio-verified transcription.

| Start                                                      | Main point                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| [0:00](https://www.youtube.com/watch?v=FeAysJe6FGA&t=0s)   | Agents need shared organizational context and relationships.              |
| [0:31](https://www.youtube.com/watch?v=FeAysJe6FGA&t=31s)  | Typed schemas reject invalid writes and return repair information.        |
| [0:58](https://www.youtube.com/watch?v=FeAysJe6FGA&t=58s)  | Separate branches support review before changes are merged.               |
| [1:14](https://www.youtube.com/watch?v=FeAysJe6FGA&t=74s)  | Commits expose earlier graph states.                                      |
| [1:28](https://www.youtube.com/watch?v=FeAysJe6FGA&t=88s)  | Queries combine text search, semantic search, and relationship traversal. |
| [1:42](https://www.youtube.com/watch?v=FeAysJe6FGA&t=102s) | Storage ownership and access from different agents are emphasized.        |
| [2:00](https://www.youtube.com/watch?v=FeAysJe6FGA&t=120s) | The closing invitation offers an agent-assisted setup.                    |

## What BuildOS already has

This comparison reflects the local checkout on November 16, 2026. It establishes implemented code paths, not production latency, data completeness, or deployment status.

| Capability                              | Evidence in BuildOS                                                                                                                                                                                             | Implication                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Entities and typed relationships        | `onto_edges` stores source/destination IDs and kinds, relation, project, and properties. [Generated schema](../../../../packages/shared-types/src/database.schema.ts#L3086).                                    | The product already has a graph model in Postgres.                                                                                   |
| Domain-specific relationship vocabulary | `supports_goal`, `targets_milestone`, `depends_on`, `blocks`, `references`, `threatens`, and `mitigates`. [Relationship definitions](../../../../packages/shared-agent-ops/src/ontology/edge-direction.ts#L44). | Useful impact queries can start from existing concepts. They still depend on actual edges being populated accurately.                |
| Keyword and semantic retrieval          | Lexical and semantic channels run concurrently; results are combined with reciprocal rank fusion. [Search implementation](../../../../packages/agentic-chat-runtime/src/tools/ontology-search.ts#L465).         | Hybrid search alone is not a reason to migrate. Semantic availability remains configuration-dependent.                               |
| Relationship reads                      | `getEntityRelationships` reads outgoing and incoming edges, capped at 50 per direction. [Reader](../../../../packages/shared-agent-ops/src/gateway/op-execution-gateway.relationships.ts#L79).                  | This tool is one-hop adjacency, not a bounded multi-hop query returning explanation paths.                                           |
| Whole-project loading                   | The project loader fetches entity tables and edges in parallel. [Loader](../../../../packages/shared-agent-ops/src/ontology/project-graph-loader.ts#L263).                                                      | Good for loading a project view; a focused question should not require transferring the whole project.                               |
| Reviewed mutations                      | Staging validates operations and captures before/after proposal data without applying the write. [Staging](../../../../packages/shared-agent-ops/src/gateway/op-execution-gateway.staging.ts#L92).              | There is already a review workflow. This path does not provide a separately queryable graph branch or general three-way graph merge. |
| Document history                        | Document snapshots can be created or coalesced within a version window. [Versioning](../../../../packages/shared-agent-ops/src/ontology/versioning.service.ts#L9).                                              | Document history is different from a coherent historical snapshot of every entity and edge.                                          |
| Project boundaries                      | The edge write gateway explicitly rejects endpoints in different projects. [Boundary](../../../../packages/shared-agent-ops/src/gateway/op-execution-gateway.edges.ts#L65).                                     | Cross-project reasoning needs a deliberate relationship and access model, whichever engine stores it.                                |

An inexpensive improvement is visible in the relationship reader: it accepts an ID without its entity kind and can try up to eleven kinds sequentially to resolve it. A structured kind plus a batched neighborhood query could reduce avoidable round trips. That is an optimization opportunity, not a measured latency result.

## Where graph capabilities would earn their place

| Priority | User question                                                         | Useful capability                                                                    | Initial approach                                                                                                                                                                       |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | If this task slips, what else might be affected?                      | Follow dependency and milestone/goal paths, returning evidence.                      | Bounded traversal over existing Postgres edges. A path establishes exposure; predicting dates additionally needs scheduling rules and estimates.                                       |
| 2        | Why is Jev recommending this task now?                                | Connect the task to goals, risks, constraints, and source passages.                  | Retrieve a small relevant neighborhood and retain source IDs/anchors for the explanation.                                                                                              |
| 3        | Show how this proposed replan changes the project before I accept it. | Query a proposed state, compare it with current state, and publish reviewed changes. | Extend existing proposal machinery first; evaluate native graph branches if multi-step previews become cumbersome.                                                                     |
| 4        | Which other projects depend on this commitment or decision?           | Traverse shared concepts and commitments across projects.                            | Define explicit cross-project links and authorization before choosing storage. Cross-project search already exists; cross-project edges are a separate capability.                     |
| 5        | If this source claim changes, which skills or decisions need review?  | Trace source-to-claim-to-output provenance.                                          | Start with current skill lineage conventions; promote to a graph service when repeated impact queries justify it. [Existing lineage direction](../SKILL_LINEAGE_HANDOFF.md#core-idea). |

A concrete first experience is an **Affected work** panel or chat response: the user selects a task; BuildOS lists potentially affected work and shows a short reason for each result. For example, a dependent task can support a goal and target a milestone. Follow dependency edges in their documented direction or inverse as appropriate; do not treat every nearby reference as a dependency.

For retrieval, a promising sequence is: hybrid search finds starting entities, bounded traversal collects relevant neighbors, and Jev receives a compact evidence bundle containing entities, paths, source anchors, and any truncation. Semantic similarity proposes useful starting points; an explicitly stored relationship explains the connection. Similarity alone must not become a factual edge.

## What Omnigraph adds and what the demo leaves open

The latest published release checked was [v0.15.0, November 9, 2026](https://github.com/ModernRelay/omnigraph/releases/tag/v0.15.0). Detailed documentation below was reviewed from upstream main at `8ab65713a0894fd5b4514e1b26f95c267daa50f3`; a trial should pin a release and confirm that release's behavior.

**Branching is the strongest differentiator.** A branch can hold successive durable changes and be queried before integration. A merge publishes its result atomically and reports structural conflicts such as incompatible entity updates, orphaned edges, and constraint violations. Multiple commands on a branch are separate commits; a failed later command does not roll back earlier ones. [Branch semantics](https://github.com/ModernRelay/omnigraph/blob/8ab65713a0894fd5b4514e1b26f95c267daa50f3/docs/user/branching/index.md), [merge behavior](https://github.com/ModernRelay/omnigraph/blob/8ab65713a0894fd5b4514e1b26f95c267daa50f3/docs/user/branching/merge.md).

For BuildOS, that could support an agent revising a plan, inspecting the resulting dependency network, and presenting a coherent proposed state. A structurally valid merge still cannot decide whether the plan is sensible. Domain validation and the existing review boundary remain necessary.

**Unified retrieval is useful, but speed needs measurement.** Omnigraph combines graph patterns, full-text ranking, vectors, and rank fusion in one query language. Its search documentation also describes full-text scans and vector candidate expansion or exact-scan fallbacks. One request does not establish lower end-to-end latency or cost than our current implementation. [Search semantics](https://github.com/ModernRelay/omnigraph/blob/8ab65713a0894fd5b4514e1b26f95c267daa50f3/docs/user/search/index.md).

**Authorization is a material integration constraint.** Upstream documents graph/branch-scoped authorization and explicitly says per-entity and per-property authorization are unsupported. A shared graph would need a trusted access layer or partitioning that faithfully represents BuildOS membership and visibility. Direct agent access must not bypass those boundaries. Branch creation also does not force review by itself: permissions must restrict direct writes and merges to protected state. [Authorization model](https://github.com/ModernRelay/omnigraph/blob/8ab65713a0894fd5b4514e1b26f95c267daa50f3/docs/user/operations/policy.md).

**Many agent clients do not imply many independent storage writers.** The release notes describe one active server writer per S3 cluster under a lease. Multiple agents may use that server, but branch workflows are not evidence of unrestricted horizontal write scaling. The notes include recovery fixes and scoped benchmark results; none measures BuildOS's workload. [Release details](https://github.com/ModernRelay/omnigraph/releases/tag/v0.15.0).

**Time travel has limits.** Historical reads use the current schema, with restrictions when properties change; cleanup and branch deletion can remove access to required history. Commit history records when the database changed. Answering when a real-world fact became true additionally requires explicit validity dates and provenance. [Historical reads](https://github.com/ModernRelay/omnigraph/blob/8ab65713a0894fd5b4514e1b26f95c267daa50f3/docs/user/branching/index.md#historical-reads).

**Owning the bucket does not remove operations.** The engine uses open Lance data, but its documentation requires treating graph storage as a managed unit, not editing underlying files directly. S3 compatibility depends on correct conditional-write semantics and qualification of the selected store. A second database also creates synchronization, backup, restore, and deletion-propagation work for BuildOS. [Storage contract](https://github.com/ModernRelay/omnigraph/blob/8ab65713a0894fd5b4514e1b26f95c267daa50f3/docs/user/concepts/storage.md).

## Smallest useful evaluation

Start with one project and a hand-labeled set of questions about dependencies, goal support, risks, and source evidence. Measure existing behavior before introducing an engine.

1. Audit the fixture's edges for completeness and correctness. Missing relationships are a data-model or capture problem; another database cannot supply them automatically.
2. Prototype one bounded Postgres query accepting structured seed IDs/kinds, relation types, direction, depth, and node/edge budgets. Return explanation paths and explicit truncation. Postgres supports recursive CTEs and cycle handling. [Postgres documentation](https://www.postgresql.org/docs/current/queries-with.html).
3. Combine that query with existing retrieval through one agent-facing operation. Enforce access and archived/deleted visibility during expansion, including intermediate nodes. Avoid unsupported promises of a complete impact analysis when the traversal is truncated.
4. Compare answer coverage and precision, explanation-path correctness, database round trips, p50/p95 retrieval latency, context size, and maintenance effort. Use free deterministic fixtures and offline replays first; live model tests require separate approval under repository policy.
5. Trial Omnigraph only if a specific requirement remains expensive: deep recurring traversals, coherent historical graph reads, or queryable multi-step proposed worlds. Use synthetic or sanitized data and a disposable derived graph; keep live writes in Postgres during evaluation.

For a later derived graph, use a versioned event/outbox feed with stable IDs, idempotent application, deletion propagation, a freshness watermark, and a rebuild path. This is a proposed design. Avoid writing both stores independently from application handlers. Before comparing engines, require equivalent access behavior and equivalent graph/query semantics; faster but incomplete answers are not a win.

The decision to adopt should follow a measured product benefit. If bounded Postgres traversal meets the agreed latency and correctness targets, retain it. If queryable branches unlock a valuable workflow that proposal overlays cannot support cleanly, compare the complete branch lifecycle—including review, conflicts, permissions, recovery, and integration costs.

No runtime code, schema, deployment, or production data was changed for this assessment. No database performance benchmark or paid model test was run.
