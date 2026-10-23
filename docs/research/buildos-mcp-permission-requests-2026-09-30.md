<!-- docs/research/buildos-mcp-permission-requests-2026-09-30.md -->

# BuildOS MCP permission requests

Research date: September 30, 2026. Status: proposed design, based on current official documentation and the local repository. No production permissions or application behavior were changed, and no live connector behavior was tested.

BuildOS can let a connected agent request additional access, notify the user, and offer approval for one change or ongoing access. MCP supplies a standard OAuth scope upgrade flow. BuildOS must supply the request record, notification, approval UI, precise permission policy, and execution receipt.

The recommended first version combines **Apply this change once** with **Always allow these operations in this project**. The first approves and applies an exact proposal under the user's authority. The second authorizes future direct agent writes, with OAuth reauthorization when needed. This preserves existing read-only token boundaries while delivering the requested notification experience.

## Why the quoted agent only had search and read

There are three independent gates:

1. **Available tools:** the integration must expose the operation to the agent.
2. **BuildOS authorization:** the credential, connector policy, project permissions, and user's own access must permit it.
3. **Client controls:** the hosting application may require its own confirmation or disable tools.

In this research session, the available tool inventory contains both a BuildOS search/fetch connector and a separate BuildOS MCP integration exposing mutation tools. That establishes different available surfaces here; it does not establish which integration the earlier agent used or whether any particular write would succeed.

The repository provides a concrete explanation for this distinction. Its `chatgpt_data_app` profile exposes only `search` and `fetch`, even with a write-authorized credential. The `general` profile exposes tools according to the grant. Therefore, a read-only data profile cannot become an action-capable integration merely by changing a permission row. It needs a different or updated tool surface. [Profile selection and enforcement](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/mcp-connector.service.ts:441).

Keep the search/fetch profile genuinely read-only. Put permission requests in the action-capable integration, including for users whose project access is currently read-only. Do not hide permission-request side effects inside `search` or `fetch`.

## What MCP and the clients support

**OAuth scope upgrades are standard.** When a token lacks permission, an MCP server can return HTTP 403 with an `insufficient_scope` challenge identifying the required scopes. The client can reauthorize with the combined scope set and retry. This supports asking for write access after connecting with read access; it does not define a BuildOS notification or a single-use permission. [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#step-up-authorization-flow).

**OpenAI documents a tool-level authentication path.** Its authentication guide describes tool `securitySchemes`, protected-resource metadata, and error results carrying `_meta["mcp/www_authenticate"]` to trigger ChatGPT's linking UI. Implement the documented adapter alongside generic HTTP challenges, then test it in the actual target client. [OpenAI authentication guide](https://developers.openai.com/plugins/build/auth#triggering-authentication-ui).

**URL elicitation is not the replacement for this OAuth upgrade.** MCP explicitly distinguishes third-party authorization from the MCP client's access to the MCP server. Use normal MCP authorization for expanding access to BuildOS itself. A normal tool response can carry a BuildOS review link, but the link must require the signed-in owner and must not grant permission merely by being opened. [MCP elicitation specification](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation#url-mode-elicitation-requests).

**Tool discovery can change with authorization.** MCP permits tool lists to depend on the request's credentials and defines tool-list change notifications. Client refresh behavior still needs verification. Codex's official documentation establishes remote HTTP OAuth support, but the documentation reviewed does not prove automatic continuation of this particular flow in every Codex or ChatGPT configuration. [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

BuildOS approval also cannot override a host application's own tool restrictions or confirmation settings. Design for a portable request/status API and a clear reconnect or retry fallback.

## Existing BuildOS foundations

| Foundation           | What exists                                                                                                                     | What the feature needs                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| OAuth scopes         | `buildos.read`, `buildos.write`, and `offline_access`; consent can narrow requested scopes                                      | Operation-specific upgrade challenges tied to permission requests                  |
| Token scope boundary | Access-token authorization intersects the token's original mode with the current grant                                          | Preserve this boundary; examine refresh behavior before expanding grants           |
| Owner settings       | OAuth settings explicitly reject widening an existing read-only grant without reconnection                                      | A guided reauthorization state instead of an unexplained failure                   |
| Project permissions  | Explicit project grants and membership checks, including separate writable projects                                             | Optional operation limits per project and a request linked to the decision         |
| Approval destination | Signed-in owners can grant projects at `/profile/agent-keys/[callerId]/grant`                                                   | Exact change preview, one-time approval, ongoing scope choice, and request history |
| Denial links         | Project access errors already carry a `grant_url`                                                                               | Structured permission-required reasons for missing write access                    |
| Notifications        | A shared helper records events, deliveries, and persistent user notifications with action URLs                                  | Permission event types, a review link, deduplication, and delivery recovery        |
| Tool discovery       | Grant-filtered tools; both protocol paths advertise `listChanged: false`; modern tool lists have a 60-second private cache hint | Explicit refresh/invalidation behavior and a stable request/status surface         |

Evidence: [OAuth scopes](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:37), [token boundary](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:1411), [settings restriction](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/caller-provisioning.service.ts:1194), [project authorization](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/project-access.service.ts:38), [owner grant route](/Users/djwayne/buildos-platform/apps/web/src/routes/profile/agent-keys/[callerId]/grant/+page.server.ts:1), [grant links](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/external-tool-gateway.ts:422), [notification helper](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/ops/tracked-in-app-notification.service.ts:46), [discovery settings](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/mcp-connector.service.ts:1062).

The inspected external-agent code does not currently provide an agent-facing permission request lifecycle or single-use grant. Existing project grants are a useful starting point, but they do not by themselves upgrade a read-only OAuth token.

## Proposed user experience

An agent preparing a document update calls `request_buildos_permission` with a structured proposed operation. BuildOS creates one durable request and a notification:

> **Your Codex connection wants to update Launch plan**
>
> Project: Website launch
>
> Requested action: Update this document
>
> Change: Review the proposed edits
>
> Agent-provided reason: Save the revisions you requested
>
> **Apply once** · **Always allow document updates in this project** · **Deny**

These titles are illustrative. The real UI resolves project/entity titles from the database. It identifies the connection from authenticated records; any agent-provided reason or run label is clearly distinguished from verified identity.

| Choice       | Meaning                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apply once   | Apply this exact reviewed change once. No standing write access is created.                                                                              |
| Always allow | Authorize the displayed operations for this connection in the displayed project until revoked. The UI says whether this also applies the pending change. |
| Deny         | Close this request without changing project data or granting access. Suppress automatic repeat prompts for the same request.                             |

Recommend that **Always allow** also applies the displayed pending change through the approval executor, then separately shows whether future direct writes need reconnection. Both consequences must be explicit in the button's supporting text.

The review page shows a field-level or document diff, current access, requested access, expiry, and connection identity. Ongoing permissions remain visible and revocable in connector settings. Treat destructive operations and external effects as separate permissions; “update documents” should not imply deletion, publishing, calendar sync, or access to every project.

“This agent” usually means the authenticated connection. Multiple chats or agents using the same credential share that identity. Per-run trust requires independently bound run credentials; a caller-supplied chat ID or name is insufficient.

## How approval should execute

### Apply once

For the first version, make this a user-approved proposal workflow:

1. The authenticated connector submits an exact operation and arguments. It can create a request, but cannot execute or approve it.
2. The server validates the operation schema, resolves its targets, stores the proposed arguments and their canonical digest, and renders the preview.
3. The signed-in owner approves that version through a protected POST action. Opening a link or reading a notification does nothing.
4. A server executor applies only the stored operation under the explicit user decision, using existing gateway validation and audit machinery with a narrowly constructed authorization context.
5. `get_buildos_permission_request` returns the execution receipt to the requesting connection. Retrying returns the same receipt rather than applying the update again.

This is deliberately an approval-and-apply workflow. It does not turn the agent's read token into a write token. It also does not depend on the client discovering a newly available write tool. Start with one internal document or task update per request; external effects and batches complicate recovery.

Bind approval to the target's reviewed version. If the document changed after the preview, require a new review rather than silently applying stale edits. Use atomic request claiming and transactionally coupled consumption/mutation where possible. For operations that cannot share a transaction, retain a durable execution key and reconcile uncertain outcomes before retrying.

If the product specifically requires the **agent** to perform the subsequent write itself, implement a restricted execution credential or OAuth authorization plus a single-use server grant. That is a larger variant: the grant must match the exact operation, arguments, connection, project, and expiry, and it must not override a read-only OAuth token. Do not approximate “once” with a short interval of unrestricted write access.

### Ongoing access

Persist the user-approved policy. For OAuth callers lacking `buildos.write`, complete client-initiated OAuth authorization and issue an appropriately scoped credential before permitting direct writes. A BuildOS approval page can record intent, but cannot replace the client's state/PKCE exchange or install a new token into the client by itself.

Model the request as `approved_pending_authorization` until the credential and policy both permit the operation. An existing write-capable OAuth token needing only a project grant can use the live project-permission path. Agent-key callers use their server-side caller policy and do not perform an OAuth flow.

Store permission tuples such as connection + project + operation set. The existing global `allowed_ops` plus per-project read/write mode cannot express every per-project operation combination: granting document updates in project A and task updates in project B must not accidentally grant both operations in both projects.

## Proposed request contract and storage

These are proposed names, not existing tools:

- `get_buildos_permissions`: reports effective operations, project boundaries, and whether the integration supports action requests.
- `request_buildos_permission`: accepts an exact operation, arguments, reason, proposed ongoing operation set, and idempotency key. Returns request ID, status, review URL, expiry, and any reauthorization requirement.
- `get_buildos_permission_request`: reports pending, denied, expired, authorization-needed, executing, applied, or failed state and any receipt.

Expose the request tools to trusted connections before granting project writes. Treat submitting an approval request as an explicit control capability, documented separately from data-edit permissions. The submission tool has side effects and must be annotated `readOnlyHint: false`. It never grants access merely because the agent called it.

Derive owner, caller, OAuth client, grant, and resource from validated credentials. Do not accept them as authoritative tool arguments. Check request ownership on status reads and decisions. No approval endpoint is available as an agent tool.

Suggested persistence:

- `agent_permission_requests`: authenticated connection boundary; exact operation and arguments; reviewed target version; proposed continuing scope; status; expiry; decision actor/time; idempotency key; execution key; outcome receipt.
- Existing grants plus, if needed, a scoped policy table keyed by connection, project, and operation set for ongoing access.
- Existing security audit records linked to request ID for creation, decision, execution, and revocation.

Keep notification state separate from authorization state. Marking a notification read must not resolve its pending request. A notification delivery failure must leave a recoverable request in the approval inbox. Deduplicate request creation and notification delivery independently; rate-limit requests per connection and owner.

Add `agent.permission.requested` and decision event types to shared types and database constraints. The existing helper performs multiple inserts, so request creation and notification delivery need transactional or outbox recovery rather than assuming all writes succeed together. [Notification event types](/Users/djwayne/buildos-platform/packages/shared-types/src/notification.types.ts:17), [event constraint migration](/Users/djwayne/buildos-platform/supabase/migrations/20260426000012_fix_project_activity_batched_event_constraint.sql:27).

Use the existing in-app notification channel first. Link to a durable owner-only review page. Push notifications can be added through existing user preferences; they are not required to prove the core flow.

## Implementation hazards discovered during research

**Ordinary scope denials do not currently provide the complete upgrade path.** The connector has HTTP challenge helpers for authentication failures, but denied write tools generally return a wrapped `FORBIDDEN` result. The `toMcpTool` adapter also does not currently declare the OpenAI auth metadata described above. Add structured denial categories and client-specific challenges without treating revoked or blocked connections as eligible for automatic approval requests. [Tool denial](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/external-tool-gateway.ts:622), [tool metadata](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/mcp-connector.service.ts:293).

**Audit refresh-token scope before shipping upgrades.** Static inspection shows that `exchangeOAuthRefreshToken` loads the current grant and passes it to `issueOAuthTokens`, which writes `grant.scope` into new tokens. The presented refresh token's original `scope` is not used to cap issuance in that path. Because re-consent updates an existing active grant, an older read-only refresh-token family appears able to acquire the later grant's write scope. This is a code-level finding to reproduce with a focused offline test, not a verified production incident. Clamp refresh issuance to the original credential's authorization and current policy; require a new authorization flow for expansion. [Refresh exchange](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:1234), [token issuance](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:994), [grant update](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/oauth-connector.service.ts:775). OAuth refresh requests cannot expand beyond the original authorization. [RFC 6749 section 6](https://www.rfc-editor.org/rfc/rfc6749#section-6).

**Tool refresh and agent continuation are separate from notification delivery.** After approval, a client may need to refresh discovery, reconnect, or receive a user continuation message. Support bounded status checks while an agent is active; do not promise that a completed chat wakes automatically. Keep the request/status tools stable so a missing write tool cannot make an approval unreachable.

**Update the BuildOS skill with the new recovery path.** Its current writing guidance tells agents to report a scope failure and offer a read-only summary. The proposed behavior should instead explain when to request access, how to report the pending request, how to retrieve the receipt, and when to stop after denial. Explicitly discourage using an already-signed-in browser to work around a denied connector permission. [Plugin skill](/Users/djwayne/buildos-platform/plugins/buildos/skills/buildos-context/SKILL.md:36).

## Recommended delivery order and validation

1. Build an inspectable notification and review screen for a single document update, including a real diff and the three decisions.
2. Add durable request creation/status tools and the owner approval executor. Support the general MCP profile with either OAuth or an agent key. Keep the data profile read-only.
3. Add ongoing project/operation policies, OAuth upgrade adapters, refresh-scope protection, and explicit authorization-needed states.
4. Verify discovery refresh and continuation in each target client, then update plugin instructions and integration metadata.

Focused free tests should establish: the agent cannot approve; another owner/connection cannot read or consume the request; altered arguments and stale previews fail; concurrent approvals and retries apply once; denied/expired/revoked requests do not execute; current project membership still limits writes; notification failures recover; old OAuth access and refresh credentials do not gain scope; persistent policies do not leak across projects; both supported MCP protocol paths produce correct challenges; and search/fetch remains free of approval side effects.

Rehearse any implementation migration using the repository's required production-schema rehearsal, including role probes for new grants or policies. Follow the repository's worker caps and paid-test approval rule. No tests were run for this research-only change.

The largest remaining uncertainty is the exact reconnection and continuation experience in each hosting client. The BuildOS notification, durable request, owner approval, and one-time application can be implemented within BuildOS independently of that uncertainty.
