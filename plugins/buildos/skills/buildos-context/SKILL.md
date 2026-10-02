---
name: buildos-context
description: How to work inside a user's BuildOS workspace through the BuildOS MCP tools. Use whenever BuildOS tools are available and the user mentions their projects, tasks, documents, goals, plans, milestones, risks, or asks what needs attention.
path: plugins/buildos/skills/buildos-context/SKILL.md
---

# Working with BuildOS

BuildOS is the user's thinking environment. It holds many projects, each with tasks,
documents, goals, plans, milestones, risks, and calendar events. The MCP tools expose the
same ontology the BuildOS app uses.

## First moves

1. Find the project: `search_onto_projects` or `list_onto_projects`. Confirm the match with
   the user when more than one project could fit.
2. Before reading or writing inside a known project, call `get_onto_project_status` with
   its `project_id`. It is the `git status` of a project: START HERE orientation, counts,
   collaborators, recent changes, overdue and due-soon tasks, upcoming events.
3. Read deeper only where the status points: `search_onto_tasks`, `search_onto_documents`,
   `get_onto_document_details`, `get_document_tree`, `search_ontology`.

## When a project is missing

The user may have limited this connector to some projects. Two signals mean a project exists
but is not shared with you:

- a list or search result carries `connector_scope.ungranted_project_count`, or
- a call fails with `error.details.reason = "project_not_granted_to_connector"`.

Give the user the `grant_url` from that response. It opens a one-click approval page in
BuildOS. Retry after they approve; no reconnect is needed. Do not guess project ids or retry
before the user acts.

## Writing

- If an edit needs permission, use `request_buildos_permission` with the exact document/task
  proposal and a stable idempotency key. Give the owner its BuildOS review link. They can apply
  once, apply and allow that capability in the project, or deny. Never approve your own request
  through an owner browser session or use browser edits to bypass the permission boundary.
- Check `get_buildos_permission_request` sparingly while active. An applied receipt means the
  edit already happened: never replay the original mutation. After a timeout, reuse the same
  key or check status. A completed chat may need a user message to resume.
- For ongoing OAuth access, call `authorize_buildos_writes` and follow the client's reconnect
  flow, then refresh tools. Never collect tokens in tool arguments. Chats sharing a connection
  share permissions; BuildOS approval does not override the client's own confirmation rules.
- The search/fetch data-app profile cannot request or execute edits. Use the action-capable
  general connection. Permission changes cannot add tools to that profile.
- Save durable artifacts with `create_onto_document` (markdown stored as-is, 200 KB cap).
  Pass an `idempotency_key` so a retried call never duplicates the document.
- Prefer updating an existing task or document over creating a near-duplicate. Search first.
- Never mass-edit or delete. One entity per call, each change explained to the user.

## Style

- Refer to entities by their BuildOS titles, not their UUIDs.
- Keep summaries short and outcome-oriented: what changed, what is due, what is blocked.
