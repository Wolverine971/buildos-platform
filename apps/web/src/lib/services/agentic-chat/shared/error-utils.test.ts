// apps/web/src/lib/services/agentic-chat/shared/error-utils.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeToolError } from './error-utils';

describe('normalizeToolError', () => {
	it('does not expose Postgres details or hints to the model', () => {
		const message = normalizeToolError(
			{
				code: '23505',
				message: 'duplicate key value violates unique constraint with victim@example.com',
				details: 'Key (email)=(victim@example.com) already exists.',
				hint: 'Try the private tenant identifier tenant-secret'
			},
			'create_contact'
		);

		expect(message).toBe("Tool 'create_contact' failed: database error 23505");
		expect(message).not.toContain('victim@example.com');
		expect(message).not.toContain('tenant-secret');
	});

	it('does not stringify arbitrary object fields into a tool error', () => {
		const message = normalizeToolError({ private_value: 'secret' }, 'read_record');

		expect(message).toBe("Tool 'read_record' failed: Unknown error");
		expect(message).not.toContain('secret');
	});
});
