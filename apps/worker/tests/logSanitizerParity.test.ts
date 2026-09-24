// apps/worker/tests/logSanitizerParity.test.ts
/**
 * The worker's log sanitizer is a port of the web one (see the header of
 * src/lib/logSanitizer.ts). This fails if the redacted keys or the behavior drift apart.
 */
import { describe, expect, it } from 'vitest';
import * as worker from '../src/lib/logSanitizer';
import * as web from '../../web/src/lib/utils/logging-helpers';

const FIXTURE = {
	subject: 'Maya updated Acme rebrand',
	title: 'Acme rebrand',
	summary: 'Therapy with Dr. Lee',
	details: 'Failing row contains (Acme rebrand)',
	userMessage: 'hello',
	access_token: 'secret',
	jobId: '123e4567-e89b-12d3-a456-426614174000',
	briefDate: '2026-09-24',
	note: 'mail person@example.com or call +1 (410) 555-0199, Bearer abc.def',
	nested: { name: 'Launch plan', count: 3, list: Array.from({ length: 30 }, (_, i) => i) },
	error: new Error('boom for person@example.com')
};

describe('worker log sanitizer parity with web', () => {
	it('redacts exactly the same content keys', () => {
		expect([...worker.LOG_REDACT_KEYS].sort()).toEqual([...web.LOG_REDACT_KEYS].sort());
	});

	it('produces identical output for the same input', () => {
		for (const options of [{}, { maxStringLength: 2000, maxDepth: 5, maxEntries: 50 }]) {
			const workerResult = worker.sanitizeLogData(FIXTURE, options) as Record<string, any>;
			const webResult = web.sanitizeLogData(FIXTURE, options) as Record<string, any>;
			// Stack traces name the file that ran; compare everything else.
			delete workerResult.error.stack;
			delete webResult.error.stack;
			expect(workerResult).toEqual(webResult);
		}
		expect(worker.sanitizeLogText(FIXTURE.note)).toBe(web.sanitizeLogText(FIXTURE.note));
	});
});
