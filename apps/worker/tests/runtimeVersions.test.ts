// apps/worker/tests/runtimeVersions.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	describeRuntimeVersions,
	enforceSafeNodeRuntime,
	unsafeNodeRuntimeReason
} from '../src/lib/runtimeVersions';

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

describe('enforceSafeNodeRuntime', () => {
	const exitSpy = () =>
		vi.fn((code: number) => {
			throw new Error(`exit ${code}`);
		}) as unknown as (code: number) => never;

	it('treats a missing version as unsafe', () => {
		expect(unsafeNodeRuntimeReason(undefined)).toMatch(/unrecognised/);
	});

	it.each(['22.19.0', '22.23.3', '24.22.0', '23.11.0', '20.19.5', 'garbage'])(
		'refuses Node %s and exits 1',
		(version) => {
			const exit = exitSpy();
			const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
			expect(unsafeNodeRuntimeReason(version)).not.toBeNull();
			expect(() => enforceSafeNodeRuntime('agentic-chat-worker', version, exit)).toThrow(
				'exit 1'
			);
			expect(exit).toHaveBeenCalledWith(1);
			expect(error.mock.calls[0]?.[0]).toContain('agentic-chat-worker refusing to start');
			error.mockRestore();
		}
	);

	it.each(['22.23.4', '22.24.0', '24.22.1', '26.12.1', '27.0.0'])('allows Node %s', (version) => {
		const exit = exitSpy();
		expect(unsafeNodeRuntimeReason(version)).toBeNull();
		enforceSafeNodeRuntime('libri-worker', version, exit);
		expect(exit).not.toHaveBeenCalled();
	});
});
