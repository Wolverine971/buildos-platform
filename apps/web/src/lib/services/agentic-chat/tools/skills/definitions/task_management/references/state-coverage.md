<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/references/state-coverage.md -->

# Task State Coverage Reference

Use this reference when a user reports real-world progress on an existing task and the correct state transition is easy to miss.

## Mapping

- "I started", "I began", "working on it", or "in progress" -> `state_key: "in_progress"`.
- "I finished", "done", "completed", "shipped", or "sent" -> `state_key: "done"`.
- "Blocked", "stuck", "waiting on", or "cannot proceed" -> `state_key: "blocked"`.
- "Need to do", "add a todo", or future work that has not started -> `state_key: "todo"`.

## Write Rule

When the user reports progress and the exact `task_id` is known, include `state_key` in the same `update_onto_task` call as any description or priority change. Do not update only the description if the task state should move.

Correct:

```json
{
	"task_id": "<task_uuid>",
	"state_key": "done",
	"description": "Chapter 2 is complete. Next step is continuity review."
}
```

Incorrect:

```json
{
	"task_id": "<task_uuid>",
	"description": "Chapter 2 is complete."
}
```

## Ambiguity

If the user says work "changed", "moved", or "got updated" without a clear progress state, preserve the current state unless they explicitly ask to change it. Ask one concise question only when the state is required to proceed safely.
