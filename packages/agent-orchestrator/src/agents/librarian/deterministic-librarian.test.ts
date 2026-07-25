import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ContextPacketSchema } from '../../contracts';
import { ProjectSnapshotSchema } from '../../testing/harness/corpus-schema';
import { buildContextPacket, runDeterministicLibrarian } from './deterministic-librarian';

const snapshot = ProjectSnapshotSchema.parse(
	JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL('../../testing/harness/fixtures/project-alpha.snapshot.json', import.meta.url)
			),
			'utf8'
		)
	)
);

describe('deterministic librarian', () => {
	it('resolves the short app reference from project entities and expands into relevant docs', () => {
		const input = {
			objective: 'I have an iPhone. Can you research which app I should download for this?',
			snapshot
		};
		const packet = buildContextPacket(input);
		const serialized = JSON.stringify(packet);

		expect(ContextPacketSchema.parse(packet)).toEqual(packet);
		expect(serialized).toContain('PVT reaction-time app');
		expect(serialized).toContain('psychomotor vigilance task');
		expect(serialized).toContain('measurement tool, not a broad training claim');
		expect(buildContextPacket(input)).toEqual(packet);
	});

	it('returns a schema-valid AgentResult with exactly one context packet draft', () => {
		const result = runDeterministicLibrarian({
			objective: 'Which iPhone app should I download for this?',
			snapshot,
			maxFacts: 5,
			maxExcerpts: 3
		});

		expect(result.status).toBe('completed');
		expect(result.artifact_drafts).toHaveLength(1);
		expect(result.artifact_drafts[0]?.artifact_type).toBe('context_packet');
		expect(result.acceptance_results[0]?.status).toBe('passed');
	});

	it('keeps the packet bounded even when callers request larger limits', () => {
		const packet = buildContextPacket({
			objective: 'Summarize all project context.',
			snapshot,
			maxFacts: 1_000,
			maxExcerpts: 1_000
		});
		expect(packet.facts.length).toBeLessThanOrEqual(20);
		expect(packet.excerpts.length).toBeLessThanOrEqual(10);
	});
});
