// apps/web/src/lib/components/agent/external-account-tool-routing.test.ts
import { describe, expect, it } from 'vitest';
import type { UIMessage } from './agent-chat.types';
import { needsLegacyExternalAccountTools } from './external-account-tool-routing';

function message(type: UIMessage['type'], content: string): UIMessage {
	return {
		id: crypto.randomUUID(),
		type,
		content,
		timestamp: new Date()
	};
}

describe('external account tool routing', () => {
	it('keeps a direct exact-address request on the full legacy tool surface', () => {
		expect(needsLegacyExternalAccountTools([], 'Check dj@9takes.com')).toBe(true);
	});

	it('keeps a bare consent reply in the account flow', () => {
		const messages = [
			message(
				'assistant',
				'Do you want me to connect dj@9takes.com with read-only Gmail access?'
			)
		];
		expect(needsLegacyExternalAccountTools(messages, 'yes')).toBe(true);
	});

	it('does not force unrelated consent replies onto legacy transport', () => {
		const messages = [message('assistant', 'Should I rename this project?')];
		expect(needsLegacyExternalAccountTools(messages, 'yes')).toBe(false);
	});
});
