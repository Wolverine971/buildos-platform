// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/lane-A-sanitizer-false-positive-test.ts
import { sanitizeAssistantFinalText } from '../../../../../packages/agentic-chat-runtime/src/loop/assistant-text-sanitization.ts';
const replies = [
	`Here is where the beta stands:

## Open items
- Confirm the launch date with the design partners (due Friday).
- Finish onboarding flow — in progress, due Apr 20.
- Draft beta invite email — todo.

Existing tasks: 3 open, 0 overdue. Want me to create a task for the pricing decision?`,
	`I updated the task. Structure: the plan now has three phases. End by Friday if possible.`,
	`The document is 4 pages long. It includes: goals, risks, and a timeline. Perfect.`,
	`No changes were made. Do not claim the permit was approved — there is no evidence in the records checked.`
];
for (const r of replies) {
	const out = sanitizeAssistantFinalText(r);
	console.log('--- IN (' + r.length + ' chars)');
	console.log(r);
	console.log('--- OUT (' + out.length + ' chars)');
	console.log(out);
	console.log();
}
