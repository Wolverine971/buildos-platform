// apps/worker/tests/runtimeVersions.test.ts
import { describe, expect, it } from 'vitest';
import { describeRuntimeVersions } from '../src/lib/runtimeVersions';

describe('describeRuntimeVersions', () => {
	it('reports exact runtime versions and the Railway replica', () => {
		expect(
			describeRuntimeVersions(
				'agentic-chat-worker',
				{ node: '22.23.4', brotli: '1.2.0', undici: '6.25.0', openssl: '3.5.4' },
				' replica-1 '
			)
		).toBe(
			'[runtime] agentic-chat-worker node=v22.23.4 brotli=1.2.0 undici=6.25.0 openssl=3.5.4 replica=replica-1'
		);
	});

	it('marks missing values instead of guessing', () => {
		expect(describeRuntimeVersions('libri-worker', {}, undefined)).toBe(
			'[runtime] libri-worker node=vunknown brotli=n/a undici=n/a openssl=n/a replica=n/a'
		);
	});
});
