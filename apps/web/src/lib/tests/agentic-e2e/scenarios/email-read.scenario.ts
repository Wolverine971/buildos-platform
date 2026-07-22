// apps/web/src/lib/tests/agentic-e2e/scenarios/email-read.scenario.ts
//
// Tier 1 Gmail read tools, end-to-end over the real stream endpoint.
//
// Skipped by default (like calendar-move): it needs the test user to have a
// connected, read-enabled Gmail account (a one-time manual OAuth step) AND the
// EMAIL_CHAT_TOOLS_ENABLED flag turned on for the dev server. When those are in
// place, set AGENTIC_TEST_EMAIL_READY=true to run it. It asserts the agent lists
// accounts, searches, opens a message, and performs ZERO Gmail writes (there is
// no Gmail write tool in any tier — this is a defense-in-depth guard).
import type { Scenario, TurnResult } from '../harness/types';
import {
	assertAnyToolCalled,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../harness/assertions';
import { waitForTurnRun } from '../harness/telemetry';

// Any tool whose name could imply a Gmail mutation. None exist in the registry;
// this list makes the "read-only" guarantee an explicit, failing assertion if a
// future change ever introduces one.
const GMAIL_WRITE_TOOL_PATTERN =
	/(send|save|create|update|delete|modify|label|archive|trash|draft|propose)_.*email|email_.*(send|save|draft)/i;

function assertNoGmailWrite(turn: TurnResult): void {
	const offenders = turn.toolCalls
		.map((call) => call.function.name)
		.filter((name) => GMAIL_WRITE_TOOL_PATTERN.test(name));
	if (offenders.length > 0) {
		throw new Error(
			`[assert] expected zero Gmail writes; the agent called: [${offenders.join(', ')}]`
		);
	}
}

function isEmailReadReady(): boolean {
	return process.env.AGENTIC_TEST_EMAIL_READY === 'true';
}

export const emailReadScenario: Scenario = {
	id: 'email-read',
	title: 'Search connected Gmail and open a message (read-only)',
	category: 'email',
	// Requires a connected Gmail account + EMAIL_CHAT_TOOLS_ENABLED on the server.
	skip: () => !isEmailReadReady(),
	turns: [
		{
			contextType: 'global',
			message:
				'Search my connected email for anything about the contract this week, then open the most relevant message and tell me what it says. Do not send or change anything.',
			assert: async (turn, ctx) => {
				assertTurnSucceeded(turn);
				// The agent must discover accounts, search, and open a message.
				assertToolCalled(turn, 'list_email_accounts');
				assertToolCalled(turn, 'search_email_messages');
				assertAnyToolCalled(turn, ['get_email_message']);
				// Read-only guarantee: no Gmail mutation of any shape.
				assertNoGmailWrite(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
			}
		}
	]
};
