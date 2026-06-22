<!-- docs/plans/AGENTIC_CHAT_SUPERVISOR_FAILED_WRITE_RECOVERY_PLAN_2026-06-18.md -->

# Agentic Chat Supervisor Failed-Write Recovery Plan

Date: 2026-06-18

## Why This Exists

The fantasy-novel scheduling audit exposed a supervisor gap. The assistant tried to call `update_onto_task` with a UUID that belonged to a goal, not a task. The API correctly returned `Task not found`, but the runtime allowed the model to retry the same bad write until the tool repetition limit ended the turn.

The old optional LLM judge would not have been a sufficient fix. It was removed, was disabled by default, received only a compact digest, and could at most choose high-level actions such as ask, stop, or synthesize. It could have braked the loop, but it was not designed to inspect loaded project entities, identify that the id belonged to the wrong entity kind, or block the exact retry.

The right fix is a deterministic semantic recovery layer inside the turn supervisor.

## Strategy

Every failed write should pass through a supervisor recovery checkpoint before the model receives another chance to call tools. The checkpoint should:

1. Classify the failed write by error class.
2. Compare write arguments against a compact index of loaded context entities.
3. Detect wrong-entity-kind mistakes, such as a goal id used as a task id.
4. Inject a precise recovery instruction into the next model pass.
5. Block exact retries of a write payload that has already failed.

The supervisor should repair when the next action is inferable from loaded context, and ask the user only when the target or required value remains ambiguous.

## Implementation Shape

The implementation is deterministic and keeps the existing stream orchestration model:

- Build a compact entity index from the already-loaded prompt context.
- Extend supervisor tool-call observations with an argument fingerprint and UUID-bearing id fields.
- Add a new supervisor decision: `inject_recovery_instruction`.
- On the first failed write, inject a recovery instruction for the next pass.
- On an exact retry of a previously failed write, block the executor call and return a synthetic failed tool result explaining that the retry was blocked.
- Preserve existing finalization guards and validation-repair behavior.

## Recovery Rules

For `not_found` write failures:

- If the id exists in loaded context under another kind, classify it as `wrong_entity_kind`.
- Tell the model which tool/id field was wrong, what kind the id actually belongs to, and what kind the tool expected.
- Instruct the model not to retry the same call.
- Tell the model to either use an id of the expected kind, use the correct tool for the actual kind, or ask one concise clarifying question.

For exact same-argument retry:

- Block execution before it reaches the real tool executor.
- Emit a synthetic failed tool result so the UI and replay history remain coherent.
- Inject a hard instruction that the exact tool/argument payload is forbidden for the rest of the turn.

For other failed writes:

- Inject a generic recovery instruction that treats the tool error as literal feedback and forbids same-argument retry.

## Expected Outcome

In the audited failure mode, the second turn should not burn multiple retries on:

```text
update_onto_task({ task_id: "<goal id>", ... })
```

The runtime should instead tell the model:

- that `task_id` contains an id known as a goal,
- that `update_onto_task` requires a task id,
- that the same call must not be retried,
- and that it should use a real task id, update the goal through the proper goal tool, or ask the user.

This makes the supervisor a practical runtime repair mechanism rather than a passive monitor.
