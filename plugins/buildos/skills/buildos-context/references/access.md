<!-- plugins/buildos/skills/buildos-context/references/access.md -->

# Access and edit approvals

## Missing or shared projects

An empty search means the connection found no visible match. A positive `connector_scope.ungranted_project_count` counts other projects without identifying them. If the requested project is missing, offer the returned `connector_scope.grant_url` when present.

On a refusal, follow `error.details.access_needed`. Show its `say_to_user` and use the next action it supplies.

- With `next.open_url`, let the user handle the BuildOS consent prompt or link. Resume after approval.
- With `next.tool` set to `request_project_access`, ask the user before contacting the project owner in their name. On their yes, use the returned `next.args` once. To resume, call `check_project_access` with the project ID and original `intent` (`read` or `write`). Retry the original operation only when ready. Leave a pending request alone and respect a denial.
- With no next action, relay the explanation. If an older response gives only `project_not_granted_to_connector` and a `grant_url`, offer that link to the user.

## One edit for review

For an existing task or document in the user's own project, use the direct update tool when permitted. If the connection supports edit reviews, `request_buildos_permission` takes an exact `proposal` with `kind`, `target_id` and `changes`, plus a stable `idempotency_key`. Only the user can approve it in BuildOS. Never use their browser session to approve your request or perform a refused edit.

Give the user the returned `review_url` for a pending request. On resuming, check `get_buildos_permission_request` with its `request_id`. An applied receipt completes the edit. Stop on a denied, expired or canceled request. For `already_allowed`, use the direct update tool. After a lost response, reuse the same key for the same proposal.

If the user approves ongoing edits, `authorize_buildos_writes` checks whether their OAuth connection needs to reconnect. Follow the client's consent flow when requested, then refresh available tools. Chats using that connection share its permissions. Keep tokens out of chat and tool arguments, and leave client confirmations to the user.
