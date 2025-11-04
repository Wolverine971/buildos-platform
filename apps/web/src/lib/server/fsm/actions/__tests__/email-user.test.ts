// apps/web/src/lib/server/fsm/actions/__tests__/email-user.test.ts
import { describe, expect, it } from 'vitest';
import { defaultBodyTemplate } from '$lib/server/fsm/actions/email-user';

describe('email_user action helpers', () => {
	it('produces fallback body when context lacks data', () => {
		const result = defaultBodyTemplate({});
		expect(result).toContain('Your project');
		expect(result).toContain('state');
	});

	it('includes entity name and state when provided', () => {
		const result = defaultBodyTemplate({
			entity_name: 'Campaign Launch',
			state: 'ready'
		});
		expect(result).toContain('Campaign Launch');
		expect(result).toContain('ready');
	});
});
