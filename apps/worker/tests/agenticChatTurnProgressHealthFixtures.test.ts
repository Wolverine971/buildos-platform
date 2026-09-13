// apps/worker/tests/agenticChatTurnProgressHealthFixtures.test.ts

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectAgenticChatTurnProgressHealthV1 } from '../src/workers/agentic-chat/deliveryHealth';
import { canonicalAgenticChatTurnProgressHealthCasesV1 } from './fixtures/agenticChatTurnProgressHealthCases';

const fixtures = JSON.parse(
	readFileSync(
		new URL('./fixtures/agentic-chat-turn-progress-health.v1.json', import.meta.url),
		'utf8'
	)
) as Array<{ name: string; meaning: string; input: unknown; projection: unknown }>;

describe('Agentic Chat progress-health UI fixtures', () => {
	it('stay identical to the worker projection', () => {
		expect(fixtures.map((fixture) => fixture.name)).toEqual(
			canonicalAgenticChatTurnProgressHealthCasesV1.map((entry) => entry.name)
		);
		for (const [index, entry] of canonicalAgenticChatTurnProgressHealthCasesV1.entries()) {
			expect(fixtures[index]).toEqual({
				name: entry.name,
				meaning: entry.meaning,
				input: entry.input,
				projection: projectAgenticChatTurnProgressHealthV1(entry.input)
			});
		}
	});

	it('distinguish queue delay, long provider work, delivery trouble, and a stall', () => {
		const byName = new Map(
			canonicalAgenticChatTurnProgressHealthCasesV1.map((entry) => [
				entry.name,
				projectAgenticChatTurnProgressHealthV1(entry.input)
			])
		);
		const summary = (name: string) => {
			const projection = byName.get(name)!;
			return [
				projection.executionState,
				projection.delivery.state,
				projection.delivery.delayed,
				projection.stall.stalled
			];
		};

		expect(summary('queued')).toEqual(['queued', 'not_started', false, false]);
		expect(summary('preparing')).toEqual(['active', 'connected', false, false]);
		expect(summary('long_provider_call')).toEqual([
			'provider_active',
			'connected',
			false,
			false
		]);
		expect(summary('delivery_disconnected')).toEqual([
			'provider_active',
			'disconnected',
			false,
			false
		]);
		expect(summary('delivery_delayed')).toEqual(['provider_active', 'connected', true, false]);
		expect(summary('stalled')).toEqual(['stalled', 'connected', false, true]);
		expect(summary('completed')).toEqual(['terminal', 'finished', false, false]);
	});
});
