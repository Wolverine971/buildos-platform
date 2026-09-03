// packages/shared-agent-ops/src/calendar/google-calendar-runtime.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as runtime from './google-calendar-runtime';
import * as credentials from './google-calendar-credential.service';

describe('Google Calendar runtime entry', () => {
	it('keeps source consumers on the same credential and error constructors', () => {
		expect(runtime.GoogleCalendarConnectionError).toBe(
			credentials.GoogleCalendarConnectionError
		);
		expect(runtime.GoogleCalendarCredentialService).toBe(
			credentials.GoogleCalendarCredentialService
		);
	});

	it('publishes the previous credential path as an alias, not a second bundle of error classes', () => {
		// tsup has splitting disabled. Two independent entry files would each
		// embed their own Error constructor and silently break instanceof checks.
		const manifest = JSON.parse(
			readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
		);
		const entry = manifest.exports['./calendar/google-calendar-runtime'];
		expect(entry).toEqual({
			types: './dist/calendar/google-calendar-runtime.d.ts',
			import: './dist/calendar/google-calendar-runtime.mjs',
			require: './dist/calendar/google-calendar-runtime.js'
		});
		expect(manifest.exports['./calendar/google-calendar-credential.service']).toEqual(entry);
	});
});
