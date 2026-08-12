// apps/web/src/lib/components/agent/agent-chat-client-actions.test.ts
import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from './agent-chat.types';
import {
	collectGmailConnectionClientActions,
	extractGmailConnectionClientAction
} from './agent-chat-client-actions';

function activity(
	metadata: Record<string, unknown>,
	status: ActivityEntry['status'] = 'completed'
) {
	return {
		id: crypto.randomUUID(),
		content: 'Preparing Gmail connection',
		timestamp: new Date(),
		activityType: 'tool_call' as const,
		status,
		metadata
	};
}

describe('Gmail chat client actions', () => {
	it('extracts a validated OAuth action from the tool-result envelope', () => {
		const result = extractGmailConnectionClientAction(
			activity({
				result: {
					client_action: {
						kind: 'connect_google_gmail',
						action_id: 'gmail:dj@9takes.com',
						mode: 'connect',
						email_address: 'DJ@9takes.com',
						connection_id: null,
						title: 'Connect Gmail',
						description: 'Continue with Google.',
						button_label: 'Connect dj@9takes.com'
					}
				}
			})
		);

		expect(result).toEqual({
			kind: 'connect_google_gmail',
			actionId: 'gmail:dj@9takes.com',
			mode: 'connect',
			emailAddress: 'dj@9takes.com',
			connectionId: null,
			title: 'Connect Gmail',
			description: 'Continue with Google.',
			buttonLabel: 'Connect dj@9takes.com'
		});
	});

	it('ignores incomplete, failed, and unknown client actions', () => {
		expect(
			extractGmailConnectionClientAction(activity({ result: { client_action: {} } }))
		).toBeNull();
		expect(
			extractGmailConnectionClientAction(
				activity({ result: { client_action: { kind: 'connect_google_gmail' } } }, 'failed')
			)
		).toBeNull();
	});

	it('deduplicates repeated render events by action id', () => {
		const entry = activity({
			result: {
				client_action: {
					kind: 'connect_google_gmail',
					action_id: 'gmail:one',
					mode: 'reconnect',
					email_address: 'one@example.com',
					connection_id: '11111111-1111-4111-8111-111111111111',
					title: 'Reconnect Gmail',
					description: 'Continue with Google.',
					button_label: 'Reconnect one@example.com'
				}
			}
		});
		expect(collectGmailConnectionClientActions([entry, entry])).toHaveLength(1);
	});
});
