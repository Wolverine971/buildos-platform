<!-- docs/plans/buildos-knowledge-graph-and-jev_2026-11-16.md -->
<!-- doc-status: proposed -->

# BuildOS knowledge graph and Jev implementation plan

**Status:** Proposed high-level plan, November 16, 2026.

BuildOS should retain useful knowledge from research, conversations, imports, and calculations so Jev can answer new questions from what the user already knows, explain gaps, and research selected gaps. The core loop is **ask → retrieve → identify gaps → enrich → reconcile → reuse**. A task is one entry point into this knowledge, alongside people, companies, applications, documents, and other entities.

Start with a flexible knowledge layer in Postgres, connected to existing BuildOS records. Keep entity types and properties extensible through data definitions. Establish identity, sources, access boundaries, and history in the first version; progressively add Jev's enrichment and reconciliation. A dedicated graph engine remains an option if measured traversal workloads justify it.

## 1. Experiences the system should support

### Find people connected to a target company

User request: “I want to apply to Palantir. Find people in our knowledge base or connected to me who could offer insights, and show their emails.”

Jev resolves the company, searches visible employment relationships, and follows the user's permitted connection paths. It returns a contact list with name, role, available professional email, relationship to the user, evidence, and last checked date. Separate people the user knows, people reachable through a recorded introduction path, and public employees with no known personal connection. A matching employer or a shared event alone does not prove that two people know each other.

Each result should explain its route: “You know Sam → Sam has a recorded connection to Maya → Maya works at this company.” Private paths belonging to another user never become introduction suggestions. If information is missing, Jev can research public sources when requested and save supported findings. Finding contacts and drafting outreach are separate from authorization to send messages.

### Compare companies and research selected gaps

User request: “Show projected revenue for the 30 companies I applied to.”

1. Resolve the user's application records and their company links; deduplicate companies while retaining links to every application.
2. Establish a comparable period and meaning of projected revenue. State a reasonable assumption or ask if fiscal year, scope, or forecast basis materially changes the answer.
3. Return all 30 companies. If one has a usable assessment, show one known and 29 without an accessible assessment, rather than silently dropping 29 rows. Distinguish stale, conflicting, and failed lookups from missing knowledge. Missing revenue is never zero.
4. Offer a focused enrichment action using the exact company set and missing fields already identified.

Follow-up: “Find the top five companies to focus on and research their projected revenue.”

Use the user's criteria—role fit, location, company stage, known connections, and relevant business evidence—to select a provisional shortlist. Do not rank the company with existing revenue data above the others simply because it has more data. If the user wants a defensible top five across all 30, first perform a bounded screening pass across the cohort, then research the five strongest candidates in depth. Explain the remaining uncertainty.

The job state matters: distinguish companies already applied to, companies needing follow-up, and prospective applications. Revenue alone is not a measure of job fit, hiring likelihood, or employment stability.

### Reuse knowledge across other work

| Use case                | Example question                                                                    | Useful connections and facts                                                      |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Sales and partnerships  | Who could introduce me to this prospective customer?                                | People, organizations, permitted connections, interactions, roles                 |
| Vendor selection        | Which providers meet our location, capability, and budget requirements?             | Services, offices, sourced prices, project requirements, prior experience         |
| Meeting preparation     | What do we know about everyone attending?                                           | Attendees, organizations, previous meetings, relevant documents, open commitments |
| Project execution       | Which work might change if this supplier changes its delivery date?                 | Supplier, agreement, delivery, task dependencies, affected-work paths             |
| Market research         | Which competitors serve this segment, and which claims need updating?               | Products, markets, pricing observations, sources, observation dates               |
| Personal administration | Which tasks involve this company or person, and what contact information can I use? | Tasks, contacts, locations, interactions, preferred methods                       |

## 2. Flexible storage model

Use three core concepts, with supporting tables for definitions, evidence links, permissions, revisions, and jobs. These are proposed structures, not implemented migrations.

| Concept               | Proposed storage        | Purpose                                                                                                                                |
| --------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Entity                | `knowledge_entities`    | Stable ID, extensible kind, lifecycle and access scope; represents a person, company, place, application, assessment, or another thing |
| Assertion             | `knowledge_assertions`  | One property or relationship: subject, predicate, either a typed value or an object entity ID, qualifiers, scope, status, and dates    |
| Source                | `knowledge_sources`     | Origin and captured evidence: web page version, authorized record, import, user statement, or calculation run                          |
| Definitions           | `knowledge_definitions` | Versioned entity kinds, predicates, allowed endpoint kinds, value shapes, units, cardinality, and useful query/display defaults        |
| Evidence and history  | Supporting records      | Multiple sources per assertion, revisions, derivation dependencies, identity decisions, retractions, and audit receipts                |
| Existing record links | Scoped mapping records  | Connect knowledge entities to tasks, documents, contacts, and other authoritative BuildOS records                                      |

An assertion such as `Maya works_at Company` is a graph edge. An assertion such as `Company website "https://example.com"` is a property. Enforce exactly one object entity or typed value per assertion. Use foreign keys for entity references and ordinary indexed columns for common filters; use validated JSONB for flexible value structures and qualifiers. Postgres supports indexing JSONB as well as querying it. [Postgres JSON documentation](https://www.postgresql.org/docs/current/datatype-json.html).

Keep names and identifiers scoped too: a private person's name must not leak through a public entity directory, autocomplete, or canonical label. Public entities may have shared identities; private entities can remain entirely private. A private alias can point to an established public company without revealing who made the association.

Adding a new kind such as `conference` normally adds a definition and entity records, not a table. New predicates follow the same pattern. Jev can propose definitions; validate and version them before use, and separate local extensions from shared vocabulary. Resolve natural-language synonyms to established predicates through model-controlled structured output, not keyword or regex intent classification.

Entities and assertions can be incomplete. Retain competing assertions with their evidence instead of overwriting one “true” value. Track when a claim was recorded, when its source was observed or published, and the period in which the claim applies. An employment end date and a source capture date are different facts.

Reuse existing contact identities and contact methods through mappings; do not create a competing address book. Keep task state, document bodies, and application workflow state in their authoritative homes. Where applications are currently prose, propose structured application entities linked to the original task and evidence. A mention is a candidate for resolution, not automatic proof of a relationship.

## 3. Information worth capturing first

Capture information that answers a recurring question or supports a decision. Avoid collecting every possible attribute without a purpose.

| Entity or topic      | Initial useful information                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Person               | Names and aliases, professional role, employment periods, professional contact methods, broad location, relevant expertise, known interactions         |
| Company              | Official identity and domain, aliases, industry, products, stage, offices, public contact channels, careers page, parent or subsidiary relationships   |
| Job and application  | Role, employer, posting source, location or remote policy, compensation when available, application state and dates, associated tasks, recruiter links |
| Personal connection  | Who knows whom, how that connection is established, introduction context, last interaction, sharing scope                                              |
| Location and address | Structured address, place type, office association, validity and source; private residential details retain their own restrictions                     |
| Business assessment  | Revenue measure, period, currency, estimate basis, range or scenarios, assumptions, evidence, calculation version                                      |
| Source and research  | Evidence excerpt or permitted snapshot reference, publication and capture dates, source identity, unresolved questions, freshness expectations         |

Use a structured attribute for a simple value. Use a separate entity when something has independent relationships, identity, history, or several facts of its own. A revenue assessment qualifies because it has inputs, scenarios, provenance, and revisions.

## 4. Public knowledge and private additions

Give entities, assertions, sources, aliases, and mappings explicit access rules. Initial audiences are public, one user, and an explicitly shared project or group. Start with existing membership mechanisms rather than inventing a broad new permissions system.

Keep **source availability** separate from **permission to publish or share**. Finding a company on a public website does not make a user's job search, imported contacts, research activity, or private notes public. Source URLs, contributor identity, and access history may themselves require protection.

The visible graph is the union of approved public knowledge, the caller's private knowledge, and knowledge explicitly shared with that caller. Enforce this before search, traversal, ranking, aggregation, and model context assembly. The same rule applies to exports, embeddings, saved results, background jobs, and caches. A result must not reveal hidden record counts, paths, or the existence of another user's private contact.

In Postgres, protect individual assertion rows with RLS and enforce caller scope at the execution boundary. Background service clients that bypass RLS require an explicit scoped access layer; they cannot rely on an admin client being safe by default. [Postgres row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Identity merges never broaden access. Derived conclusions inherit the intersection of the permissions on the evidence they require. If a fact is independently supported by approved public evidence, it can have a separate public assertion; do not publish a private assertion by merely changing its label.

Public contribution is a controlled publication path with evidence validation, deduplication, attribution rules, correction and retraction support. Users can contribute candidates without being able to overwrite shared facts. User confirmation establishes what that user asserted; it does not establish worldwide truth. Reuse public facts across users without sharing their private searches or relationship networks.

Deleting a private import or revoking sharing must invalidate dependent results and refresh affected caches. Preserve a shared public fact only where independent retained public evidence still supports it. A search cannot distinguish “not known to you” from “exists privately elsewhere.”

## 5. Dynamic querying through agentic chat

Jev needs a small set of composable tools, not a tool for every question. Proposed names and boundaries:

| Tool                  | Responsibility                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knowledge.describe`  | Discover visible entity kinds, predicates, value shapes, and supported query operations; return relevant definitions rather than the entire catalog |
| `knowledge.query`     | Resolve/search entities, traverse typed paths, select facts, compare cohorts, aggregate, and report coverage through a validated structured query   |
| `knowledge.record`    | Submit entities, assertions, relationships, and evidence through one authorized, idempotent write path                                              |
| `knowledge.enrich`    | Start a bounded research or calculation job for an explicit entity set and requested gaps                                                           |
| `knowledge.reconcile` | Propose or apply permitted identity and assertion resolutions with evidence, history, and reversible decisions                                      |

Natural language becomes a typed query plan. A deterministic backend checks the plan and compiles it to parameterized SQL. Entity names, relation names, selected columns, units, and operations resolve through the definition registry. Access scope comes from the authenticated caller, never from a model-supplied user ID. Jev can compose new combinations without arbitrary production SQL execution or a custom endpoint for each use case.

Support entity search, incoming and outgoing traversal, bounded multi-step paths, filters on properties and relationship qualifiers, optional matches, batching, grouping, sorting, and missing-field detection. A relationship question first uses keyword/semantic retrieval to resolve candidate entities, then exact IDs and edges to establish connections. Similar text alone does not establish `works_at` or `knows`.

An illustrative query contract for the 30-company case, after resolving an authorized company cohort:

```json
{
	"version": 1,
	"seed": { "result_set_id": "authorized-company-cohort" },
	"select": ["name", "industry"],
	"optional_traversals": [
		{
			"relation": "assesses_company",
			"direction": "incoming",
			"kind": "revenue_assessment",
			"where": {
				"measure": "revenue",
				"period": "FY2027",
				"basis": "forecast"
			},
			"select": ["value", "currency", "range", "method", "as_of"]
		}
	],
	"include": ["evidence", "freshness", "conflicts", "coverage"],
	"preserve_seed_entities": true,
	"limit": 100
}
```

The period is illustrative. Returned cohorts are caller-bound, versioned, expiring references; subsequent requests recheck authorization. Pagination and refresh must retain the cohort's meaning. Return all accessible seed entities, including those with no assessment, and retain multiple conflicting assessments when relevant.

The response contract includes rows or nodes, evidence IDs and readable citations, explanation paths, value units, coverage per requested field, uncertainty, and explicit pagination or truncation. Use distinct outcomes for known, stale, disputed, not found in accessible knowledge, and retrieval failed. A failed lookup cannot become a missing-data assertion. Counts describe the authorized cohort and disclose incomplete traversal.

### Fast retrieval and bounded execution

Aim for one compiled database request for a common resolved query, including batched paths and optional facts. Cache relevant definitions and batch entity resolution to avoid one tool call per person or company. Use authenticated indexes on scope, subject/predicate, object/predicate, aliases, external identifiers, and common typed qualifiers; add specialized projections only when measurements justify them.

Set server-owned depth, expansion, result, execution-time, and output-size limits. Avoid unrestricted path enumeration. Cache keys include access scope and permission/data versions; private results cannot enter shared caches. A cached result still needs valid authorization.

Initial performance target: p95 under one second for a warm common database query at the declared pilot dataset size, excluding model and network latency. Measure end-to-end chat latency separately. This is a target to test, not a current performance claim. Benchmark higher-degree graphs and multi-user scopes before increasing limits or selecting another engine.

## 6. Flexible presentation in chat

Return a semantic result packet that Jev can present through supported components:

- Contact list with emails, relationship explanations, and sources.
- Company or person profile with only visible facts and clear unknowns.
- Comparison table with dynamic requested columns, consistent units, and missing cells.
- Small path view when the connection itself explains the answer.
- Research progress and changes, with evidence inspection and correction actions.

Use structured display specifications validated against result IDs and an allowed component vocabulary. Untrusted sources cannot supply executable UI. Begin with lists, profiles, and tables; a full graph canvas is optional. Preserve citations, private scope, freshness, and uncertainty across every layout.

In the 30-company table, updating one assessment should update that row without resetting the user's selection. Useful actions are “Research these five,” “Show how this was calculated,” “Why this connection?”, and “These are different people.” Every answer should make available what is known, why we believe it, and what remains unresolved.

## 7. Multiple enrichment flows through one write pipeline

Feed the same pipeline from explicit chat statements, task/document extraction, authorized contact or calendar imports, CSV uploads, web research, user edits, calculations, and approved refresh jobs. Adapter-specific parsing ends at a common observation contract; adapters do not independently invent entity identities or write unchecked facts.

The shared flow is:

```text
Observe source → extract typed candidates → resolve identity candidates
→ validate evidence, value shape, and access → commit scoped assertions
→ update search projections → return a receipt and unresolved questions
```

Preserve source identity, capture time, extractor version, record lineage, intended audience, and idempotency keys. Only commit within an authorized destination. Start unknown or ambiguous facts as candidates; do not fabricate values to complete a profile. The write gateway verifies that cited evidence exists and is accessible, that IDs are real, and that qualifiers satisfy the predicate definition. Document text and web pages are evidence, never instructions to tools.

### Spider agents for focused research

Implement a coordinator that accepts exact target entity IDs, requested fields, permitted context, an audience, and an explicit budget. It creates durable child jobs for focused questions. Five companies may produce five jobs, but only a bounded number run concurrently; queue the rest. Begin with at most two research children at a time, within existing account/provider limits.

Each child receives the smallest useful context and returns structured candidate assertions, visited-source evidence, unresolved gaps, and actual usage. Children cannot create unlimited descendants or publish directly to the global graph. The coordinator validates, deduplicates, commits authorized results, and updates the original query's coverage. It can accept successful children while clearly reporting failures and partial completion.

Support restart, cancellation, retries with idempotency, durable progress, root and child budget accounting, and notification of meaningful results. Enforce total provider spend, including paid search and other tools, before dispatch; current model-only ceilings are insufficient. Honor existing user/account research allowances instead of prompting again for every permitted child. Additional scope or spending beyond that allowance requires a new decision.

Avoid repeated public fetches when a fresh authorized source snapshot already exists. Reuse approved public evidence, not another user's private prompt or research packet. A later question should benefit from successful enrichment without rerunning the same work.

## 8. Calculations and projected revenue

Represent an assessment as an entity linked to the company and to the assertions used as inputs. Distinguish reported actual revenue, management guidance, a third-party forecast, and a BuildOS-generated scenario. Preserve conflicting forecasts rather than silently averaging them.

An assessment needs the target fiscal/calendar period, business or subsidiary scope, currency and scale, point estimate or range, as-of date, method, assumptions, input assertion IDs, and calculation version. Record exchange-rate sources and dates for any currency normalization. Keep reported units available alongside normalized values.

For a simple scenario such as `next_year_revenue = base_revenue × (1 + assumed_growth)`, run arithmetic in deterministic code with unit and period checks. Jev proposes the model and explains assumptions; the calculation service executes a validated expression. An assumed growth rate remains an assumption. Do not turn missing private-company revenue into an invented precise value.

Store derivation links so changed or retracted inputs mark dependent assessments stale. Recompute within authorized refresh policies and retain prior versions. A private input keeps a derived estimate restricted to people authorized for that input, even if the company is public.

## 9. Jev reconciliation over time

Begin with reliable ingestion and a queue of unresolved identity or fact conflicts. Add maintenance triggered by new observations, contradictory claims, source changes, stale important facts, or user corrections. Scheduled upkeep is opt-in and budgeted; this plan does not enable any recurring jobs.

Jev compares names and aliases, stable external IDs, company context, employment periods, locations, and relevant permitted relationships. Same-name matches generate candidates rather than forced merges. Automatic resolution is limited to well-supported rules with measured precision; ambiguous cases remain separate or become focused questions when the user next needs them.

Store merge/alias decisions with supporting evidence and a reversible history. Different-scope records can refer to the same public identity without combining their private assertions. Keep local interpretation decisions local unless they qualify for public publication. Resolving a person does not imply publishing their existence or connections.

For conflicting facts, compare period, entity scope, source quality, and observation date before deciding whether the claims actually disagree. A newer page does not automatically invalidate an older historical fact. Mark assertions active, disputed, superseded, or retracted and preserve lineage. User corrections should survive future extraction runs.

The public maintainer processes only public evidence and approved contributions. A private maintainer processes only its authorized user or group scope. Derived summaries and model context must retain those boundaries. Provenance should capture both source evidence and derivations, consistent with the concepts described in [W3C PROV](https://www.w3.org/TR/prov-overview/).

## 10. BuildOS integration points

| Existing foundation                                        | How this plan uses it                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task entity extraction and related-contact reads           | Feed candidate observations with existing quotes and source hashes; resolve to durable knowledge IDs without treating name matching as identity proof |
| User contacts, methods, observations, and merge candidates | Reuse contact ownership, methods, and identity history; add company entities and explicit employment/connection assertions                            |
| Project graph and affected-work prototype                  | Link domain knowledge to work records through a scoped adapter; preserve the current project boundaries of `onto_edges`                               |
| Agentic Chat catalog and shared operation gateway          | Add discoverable knowledge tools, typed schemas, result contracts, and one audited execution boundary                                                 |
| Research capture and visited-page evidence                 | Retain durable evidence versions and attach assertions to actual evidence; the short Research Log remains a human summary                             |
| Ordinary background Agent Runs                             | Adapt durable execution, progress, cancellation, and cost accounting for bounded enrichment jobs                                                      |

The current dispatcher explicitly rejects the retired `deep_research` template. Build enrichment on the maintained ordinary agent-run path; do not revive the retired workflow as an implementation shortcut. Historical research notes contain superseded status claims, so use current code when planning integration. The current `delegate_task` catalog describes its cost ceiling as excluding paid web-tool charges; the enrichment coordinator must account for those charges too.

Source anchors:

- [Task entity store](../../apps/web/src/lib/server/task-entities/task-entity-store.ts)
- [Contact service](../../apps/web/src/lib/server/user-contact.service.ts) and [agent contact/delegation tools](../../packages/agentic-chat-runtime/src/catalog/definitions/utility.ts)
- [Graph entity kinds](../../packages/shared-agent-ops/src/ontology/edge-direction.ts) and [edge access boundary](../../packages/shared-agent-ops/src/gateway/op-execution-gateway.edges.ts)
- [Agentic Chat catalog boundary](../../packages/agentic-chat-runtime/src/catalog/README.md)
- [Research capture](../../packages/agentic-chat-runtime/src/loop/research-capture.ts) and [visited-source evidence](../../apps/worker/src/workers/agent-run/webResearchEvidence.ts)
- [Agent Run dispatcher](../../apps/web/src/lib/server/agent-runs/dispatch.ts#L233) and [retirement guard](../../apps/worker/src/workers/agent-run/agentRunRetirement.ts)
- [Affected-work walkthrough](../technical/affected-work-postgres-graph.md)

## 11. Delivery sequence

| Phase                                  | Deliverable                                                                                                                                  | Proof required before expanding                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. One company and two users           | Generic entity/assertion/source model, initial definitions, permissions, scoped query packet, and a simple contact/profile UI using fixtures | Both users see shared company facts; each sees only their own private contacts and paths; adding a new kind needs no new entity table                             |
| 2. Jev retrieves and records           | Dynamic query compiler, existing-record adapters, company resolution, evidence inspection, explicit saves, and a 30-company comparison       | Jev answers the contact question with paths and citations; all 30 companies remain visible with one assessment and 29 gaps; saved information is reused           |
| 3. Targeted enrichment and assessments | Common ingestion pipeline, bounded company research jobs, calculation service, durable progress, and table updates                           | Five requested targets produce independently traceable results; retries do not duplicate facts or charges; failures remain explicit; estimates retain assumptions |
| 4. Maintenance and correction          | Identity candidates, reversible merges, conflict handling, source refresh, derivation invalidation, and focused Jev questions                | Corrections persist, unrelated same-name people stay separate, changed inputs stale assessments, and no reconciliation broadens access                            |
| 5. Shared public reuse and scale       | Controlled contribution/publication, reuse of verified public evidence, retractions, scoped caching, performance measurement                 | Cross-user reuse reduces repeated research without exposing private activity; scope revocation and deletion propagate; measured workloads meet declared limits    |

Phase 1 should make the core insight visible in the existing task/person/company experience before building a large graph browser. Phases 1 and 2 form the smallest useful release. Phase 3 delivers the five-company research workflow. Security boundaries and provenance are foundations in every phase, not hardening postponed to Phase 5.

## 12. Validation and decisions

Use offline fixtures and mocks first. Cover entity resolution, synonym-to-definition mapping, optional facts, cohort preservation, units and periods, cyclic paths, depth and expansion limits, stable pagination, query validation, and unsupported predicates. Two-user and shared-project tests must cover source metadata, aliases, paths, aggregates, embeddings, cached results, and background execution as well as direct row reads.

Enrichment fixtures should include contradictory sources, missing revenue, fabricated source IDs, unsupported citations, source text containing instructions, duplicate delivery, cancellation, partial batches, and permission revocation during a run. Validate calculations and dependency invalidation independently of model prose. Evaluate identity precision and explainability, citation support, missing-data honesty, retrieval latency, coverage gained, and total research cost.

Rehearse each future migration against the production schema, including standing archive/access checks and role probes, before applying it. Paid model/API validation requires explicit approval for each run under repository policy; initial implementation should be provable with free local checks. Production benchmarks and live model quality cannot be inferred from the task-dependency prototype.

Default decisions for the first build: Postgres storage, private-by-default imports, controlled public publication, a small versioned vocabulary, contact/company/job workflows first, structured query compilation, and bounded enrichment. Set a concrete pilot dataset and performance budget before tuning. Confirm the initial research spending allowance and public contribution policy before enabling those production capabilities.

Revisit a dedicated graph engine only after measuring representative traversals, operational cost, authorization requirements, and the complexity of keeping two stores consistent. The engine decision should follow the demonstrated knowledge workflow.
