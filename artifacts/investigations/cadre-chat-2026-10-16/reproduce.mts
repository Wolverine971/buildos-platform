// Offline only: reads an exported audit bundle and exercises the existing builder and schema.
// Run from apps/web with the source aliases in vitest.config.ts:
// pnpm exec vite-node --config vitest.config.ts ../../artifacts/investigations/cadre-chat-2026-10-16/reproduce.mts /path/to/bundle [saved-production-events.json]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLastTurnContext } from '../../../packages/agentic-chat-runtime/src/last-turn-context.ts';
import { workerAdmissionRequestSchema } from '../../../apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.ts';
import { parseJsonRequest } from '../../../apps/web/src/lib/utils/request-validation.ts';

const bundle = process.argv[2];
if (!bundle) throw new Error('Pass the extracted chat audit bundle directory.');
const read = (name: string) =>
	JSON.parse(readFileSync(resolve(bundle, 'raw', `${name}.json`), 'utf8'));
const turns = read('turn_runs');
const messages = read('messages');
const calls = read('tool_executions');

async function check(context: unknown, label: string) {
	const body = {
		clientTurnId: 'offline-repro',
		streamRunId: 'offline-repro',
		sessionId: read('session').id,
		context: { type: 'global', entityId: null, projectId: null },
		message: 'Continue the research.',
		attachments: [],
		projectFocus: null,
		lastTurnContext: context,
		voiceNoteGroupId: null,
		preparedPromptKey: null
	};
	const result = await parseJsonRequest(
		new Request('http://localhost/api/agent/v2/turns', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		workerAdmissionRequestSchema,
		{ invalidBodyMessage: 'Invalid worker turn request' }
	);
	const outcome = {
		label,
		contextChars: context ? JSON.stringify(context).length : 0,
		accepted: result.ok,
		...(result.ok
			? { admittedContextChars: JSON.stringify(result.data.lastTurnContext ?? null).length }
			: {}),
		...(!result.ok
			? { status: result.response.status, response: await result.response.json() }
			: {})
	};
	console.log(JSON.stringify(outcome));
	return outcome;
}

const outcomes = [];
for (const turn of turns) {
	const context = buildLastTurnContext({
		assistantText: messages.find((m: any) => m.id === turn.assistant_message_id).content,
		userMessage: messages.find((m: any) => m.id === turn.user_message_id).content,
		contextType: turn.context_type,
		timestamp: turn.finished_at,
		toolExecutions: calls
			.filter((call: any) => call.turn_run_id === turn.id)
			.sort((a: any, b: any) => a.sequence_index - b.sequence_index)
			.map((call: any) => ({
				toolCall: {
					id: call.provider_tool_call_id,
					type: 'function',
					function: { name: call.tool_name, arguments: JSON.stringify(call.arguments) }
				},
				result: {
					tool_call_id: call.provider_tool_call_id,
					tool_name: call.tool_name,
					success: call.success,
					result: call.result
				}
			}))
	});
	outcomes.push(await check(context, `turn-${turn.turn_index}-reconstructed`));
}
const control = await check(null, 'same-follow-up-without-continuity');
assert.equal(outcomes[0].accepted, true);
assert.equal(outcomes[1].accepted, true);
assert.equal(control.accepted, true);
// Optional event payloads fetched read-only during the investigation prove that
// the admission fix also recovers packets produced before the builder fix.
if (process.argv[3]) {
	for (const event of JSON.parse(readFileSync(process.argv[3], 'utf8'))) {
		const outcome = await check(event.payload.context, `saved-${event.turn_run_id}`);
		assert.equal(outcome.accepted, true);
	}
}
