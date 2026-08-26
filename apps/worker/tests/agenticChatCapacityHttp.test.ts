// apps/worker/tests/agenticChatCapacityHttp.test.ts

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_CAPACITY_PATH,
	respondWithAgenticChatCapacity
} from '../src/http/agenticChatCapacity';
import type { AgenticChatWorkerCapacityEvidenceV1 } from '../src/workers/agentic-chat/capacity';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function evidence(): AgenticChatWorkerCapacityEvidenceV1 {
	return {
		observedAtMs: 10_000,
		queue: { oldestReadyJobAgeMs: 20 },
		provider: { available: true },
		publisher: { healthy: true, pendingBytes: 0 }
	};
}

function responseHarness() {
	const headers = new Map<string, string>();
	let status = 0;
	let body: unknown;
	const response = {
		setHeader(name: string, value: string) {
			headers.set(name.toLowerCase(), value);
		},
		status(code: number) {
			status = code;
			return response;
		},
		json(value: unknown) {
			body = value;
			return response;
		}
	};
	return {
		response,
		result: () => ({ status, body, headers })
	};
}

describe('Agentic Chat worker capacity HTTP boundary', () => {
	it('keeps the production path private and mounted only on the dedicated service', () => {
		const indexSource = readFileSync(join(SRC, 'index.ts'), 'utf8');
		const workerSource = readFileSync(join(SRC, 'worker.ts'), 'utf8');
		const chatServiceSource = readFileSync(join(SRC, 'lib', 'chatWorkerService.ts'), 'utf8');

		expect(AGENTIC_CHAT_CAPACITY_PATH).toBe('/agentic-chat/capacity');
		expect(indexSource).toContain("const publicWorkerPaths = new Set(['/health'])");
		expect(indexSource).not.toContain('AGENTIC_CHAT_CAPACITY_PATH');
		expect(workerSource).not.toContain('collectAgenticChatWorkerCapacityEvidence');
		expect(chatServiceSource).toContain('app.get(AGENTIC_CHAT_CAPACITY_PATH');
		expect(chatServiceSource).toContain('this.options.bootstrap.collectCapacityEvidence()');
	});

	it('rejects an unauthorized request before collecting and never permits caching', async () => {
		const collect = vi.fn(async () => evidence());
		const harness = responseHarness();

		await respondWithAgenticChatCapacity(
			{ headers: { authorization: 'Bearer wrong' } },
			harness.response,
			{ collect, isAuthorized: () => false }
		);

		expect(collect).not.toHaveBeenCalled();
		expect(harness.result()).toMatchObject({
			status: 401,
			body: { error: 'Unauthorized' }
		});
		expect(harness.result().headers.get('cache-control')).toBe('private, no-store');
	});

	it('returns only exact live evidence to an authorized caller', async () => {
		const liveEvidence = evidence();
		const harness = responseHarness();

		await respondWithAgenticChatCapacity(
			{ headers: { authorization: 'Bearer valid' } },
			harness.response,
			{ collect: async () => liveEvidence, isAuthorized: () => true }
		);

		expect(harness.result()).toMatchObject({ status: 200, body: liveEvidence });
		expect(harness.result().headers.get('cache-control')).toBe('private, no-store');
		expect(harness.result().headers.get('pragma')).toBe('no-cache');
		expect(harness.result().headers.get('vary')).toBe('Authorization');
	});

	it('fails closed for missing, failed, or non-exact evidence', async () => {
		for (const collect of [
			async () => null,
			async () => {
				throw new Error('database detail must stay private');
			},
			async () =>
				({ ...evidence(), model: 'must-not-leak' }) as AgenticChatWorkerCapacityEvidenceV1
		]) {
			const harness = responseHarness();
			await respondWithAgenticChatCapacity(
				{ headers: { authorization: 'Bearer valid' } },
				harness.response,
				{ collect, isAuthorized: () => true }
			);
			expect(harness.result()).toMatchObject({
				status: 503,
				body: { error: 'Agentic Chat capacity evidence unavailable' }
			});
			expect(harness.result().headers.get('retry-after')).toBe('2');
		}
	});

	it('bounds an unresponsive collector', async () => {
		const harness = responseHarness();
		await respondWithAgenticChatCapacity(
			{ headers: { authorization: 'Bearer valid' } },
			harness.response,
			{
				collect: () => new Promise(() => undefined),
				isAuthorized: () => true,
				timeoutMs: 5
			}
		);

		expect(harness.result().status).toBe(503);
	});
});
