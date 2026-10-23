<!-- docs/technical/reviews/CADRE_CHAT_INVALID_WORKER_REQUEST_2026-10-16.md -->

# Cadre chat request failure investigation

The reported **“Invalid worker turn request”** is reproducible from the second research reply's saved continuation data. BuildOS generates a `lastTurnContext` packet larger than its own next-request validator accepts. The research turn finishes successfully; the next send carries the oversized packet and fails before a new turn or user message is admitted.

Session: `0919e6e2-e00b-4ae5-80bf-4e9d55193531`. Investigated October 16, 2026, against repository HEAD `5f3e48f76`, the supplied export, and read-only production database records. A local runtime fix is now implemented and validated; it is not deployed. Production data is unchanged.

**The original failure is deterministic.** Before the fix, both the production event payload and a fresh reconstruction using the continuity builder produced the same sizes. An offline replay through the admission schema and `parseJsonRequest` gave:

| Continuation sent with an otherwise identical follow-up | Serialized characters | Result                    |
| ------------------------------------------------------- | --------------------: | ------------------------- |
| First research reply                                    |                15,166 | Accepted                  |
| Second research reply                                   |                35,671 | HTTP 422, `INVALID_FIELD` |
| Optional continuation omitted                           |                     0 | Accepted                  |

The limit is **32,768 characters**, measured with JavaScript `JSON.stringify(value).length`. The second packet exceeds it by 2,903 characters. This is a request-object size limit, not a model context-window or output-token limit. The failing response is:

```json
{
	"success": false,
	"error": "Invalid worker turn request",
	"code": "INVALID_FIELD",
	"details": {
		"issues": [
			{ "path": "lastTurnContext", "message": "Object is too large", "code": "custom" }
		]
	}
}
```

The original rejected browser request is not in the export or the retrieved database records. Its precise submission time and message text remain unverified. The saved server output, client forwarding path, and exact-error reproduction establish a concrete defect that explains the reported failure on continuation.

**The original producer and consumer disagreed about the packet contract.** The application assembled this object from tool results; the model did not author an oversized request field.

1. The [continuity builder](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context.ts:556) collects entity previews from tool results. [Entity insertion](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context.ts:233) deduplicates IDs but has no aggregate count or serialized-size budget. The [plural entity loop](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context.ts:421) traverses entire typed lists; the nearby generic recursion's 25-item slice does not bound those lists.
2. This run's second packet contains **36 projects, 66 tasks, 38 documents, 8 plans, and 2 goals**, plus compatibility ID lists. Workspace-wide results contribute unrelated entities as well as Cadre records.
3. The [existing 30,000-character check](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context.ts:646) only determines whether optional cleanup recall can be appended. It never reduces the ordinary `entities` packet. These were research turns, without cleanup recall.
4. The [stream event handler](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/agent-chat-sse-handler.ts:802) stores the packet, and the [transport client](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts:170) sends it unchanged with the next message.
5. The [admission schema](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.ts:20) rejects the entire request when this optional field exceeds 32,768 characters. [Route validation](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/turns/+server.ts:101) runs before durable admission.

The existing [oversized-recall test](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context.test.ts:92) exercises cleanup recall, not a large inventory accumulated during research. That leaves this cross-component contract untested.

**The audit and error display hide the cause.** Production contains exactly two completed turns: approximately 40.8 seconds and 43.1 seconds, ending at 4:39:34 p.m. and 4:46:33 p.m. Eastern. Both have `finished_reason = stop`, no failure code, and no mutation reservation. All 37 exported tool calls succeeded and were reads. No project merge was attempted. The three involved project rows remain unmerged and unarchived.

The audit's “COMPLETED” outcome describes those admitted turns. A schema rejection happens earlier and leaves no failed turn for that view to display. The queried `error_logs` window also contains no matching user records. In addition, [event export compaction](/Users/djwayne/buildos-platform/apps/web/src/lib/services/admin/chat-session-audit-compact.ts:196) drops `last_turn_context.context`, so even the bundle's `raw/turn_events.json` omits the decisive packet. Production `chat_turn_events` retains it; the supplied full tool results also allow exact reconstruction.

The [client error parser](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/agent-chat-session.ts:278) keeps the generic message and code but discards `details.issues`. That is why the UI says “Invalid worker turn request” instead of identifying the continuation field.

**A separate capability mismatch undermined the research advice.** The assistant repeatedly claimed projects have no parent field and Cadre could only be a sibling of Wayne Strategies. That is false for the live database.

| Capability                                      | Verified state                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Place a project under another project           | Live `parent_project_id`, `onto_project_set_parent_atomic`, and `onto_project_family_v1`; September 30 hierarchy migrations are recorded as applied. The application has a [parent API route](/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/projects/[id]/parent/+server.ts:1). |
| Nest through this chat's tools                  | No nesting tool in either captured tool surface. The global prompt also omits the [project-family section](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-lite/prompt/project-family-section.ts:83).                                                                   |
| Merge all records from one project into another | Fold/unfold SQL exists in the repository, but its migrations are absent from production history and its functions are absent from production. Commit `fcda4220c` explicitly calls the foundation “not applied.” This is not a live end-to-end merge feature.                                   |

The nesting feature supports one parent/child level and requires admin access to both projects when attaching. Thus `Wayne Strategies → Cadre` is a supported structural shape; a third level beneath Cadre is not. Nesting and merging are distinct operations.

The misleading schema evidence came from [curated field metadata](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/tools/entity-field-info.ts:12). `get_field_info` is described as authoritative but actually returns a static list of commonly used fields. It omits `parent_project_id`. The assistant treated that omission, plus the absence of a chat mutation tool, as proof that the product itself cannot nest projects. The correct response would distinguish product support, chat-tool availability, and merge readiness.

The follow-up audit checked both complete prompt snapshots: system prompts, model messages, context payloads, tool definitions, and all 37 tool results. None contains `parent_project_id`, `project_family`, or the hierarchy RPC names. Neither system prompt describes project hierarchy or sub-projects. The existing hierarchy prompt builder only runs for `project`/`ontology` context and then only when a parent or readable children exist; both captured turns are `global`. Consequently, the added hierarchy context in the code **did not reach this model run**. Flag this as a product-context integration gap, not only a model-reasoning mistake. The second turn also inherited the first assistant reply's incorrect limitation claim.

**The proposed keep/drop inventory needs more evidence before any cleanup.** The second turn directly listed only 50 of DJ Internal's 89 tasks; 47 of those returned tasks were open. Its overview included work updated October 8 and October deadlines. Searching documents for “Cadre” returned metadata for 15 of 29 internal documents and 17 of 24 Content Operations documents, rather than a complete inventory. These reads can support a preliminary layout, but not a broad conclusion that most tasks are stale or safe to drop. The privacy distinction between the private internal project and the shared Content Operations project was correctly identified and still matters for any actual consolidation.

**Local repair and measured result.** [last-turn-context-budget.ts](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/last-turn-context-budget.ts) provides one shared 30,000-character budget, leaving room beneath admission's 32,768-character maximum for the committed timestamp. The worker builder, admission schema, and prewarm schema use it.

- Small packets remain unchanged. Oversized packets first shed entity descriptions, retaining IDs and names. The original Cadre packet falls from **35,671 to 18,410 characters**, preserving all 150 entity previews and their names/IDs.
- Larger inventories retain bounded prefixes across entity kinds with consistent legacy ID lists. The packet marks incomplete entity recall, and the model is told to retrieve records before treating it as the complete scope. No free-text intent classification is used.
- Pending cleanup recall stays whole while ordinary entity recall is reduced. An optional hint whose non-entity metadata cannot fit is omitted entirely; no partial cleanup receipt is passed off as complete.
- Admission repairs packets already issued by older workers. Prewarming applies the same transformation so prepared history and ordinary admission use consistent recall.

Both newly reconstructed turns now pass admission. The **original saved 35,671-character production event also passes**, normalized to 18,410 characters. The no-continuity control passes as before. The limit was not increased.

**Remaining flags.** Safe admission diagnostics and continuation size/count metadata in the export would improve future incident detection. Global chat still needs accurate hierarchy capability information; no hierarchy tools or permissions were added in this patch. Whole-project merge remains unavailable pending its separate implementation and deployment.

Until deployment, a new chat bypasses the oversized continuation packet. No existing session data was cleared.

**Reproduction and validation.** [reproduce.mts](/Users/djwayne/buildos-platform/artifacts/investigations/cadre-chat-2026-10-16/reproduce.mts) reads the supplied export, reconstructs both packets with the current builder, and now asserts both pass admission. An optional second file argument accepts the saved production continuation events to verify old-packet recovery. It makes no network requests or model calls and does not alter the bundle or production.

From `/Users/djwayne/buildos-platform/apps/web`:

```sh
pnpm exec vite-node --config vitest.config.ts ../../artifacts/investigations/cadre-chat-2026-10-16/reproduce.mts /Users/djwayne/Downloads/csa-have-few-projects-multiple-20261016T204953Z
```

Free validation: 13 runtime tests, 29 admission-route tests, 3 new admission-schema tests, and 8 prewarm-route tests passed (53 total). The budget helper passed a focused strict TypeScript check. The real-bundle reconstruction and both saved production events passed the updated local boundary. Tests covered JSON escaping, large inventories, cleanup preservation, consistent IDs, unrepairable optional metadata, and unchanged validation of the actual user message. Heavy checks ran serially through `test-gate` with one Vitest worker.

No paid tests, live chat replays, schema migrations, or production changes were performed. An optional PostHog lookup during the original investigation was blocked by automatic approval review because the destination was unverified and the request included user-identifying incident details; no PostHog evidence is used here.
