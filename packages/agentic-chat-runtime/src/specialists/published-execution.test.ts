// packages/agentic-chat-runtime/src/specialists/published-execution.test.ts
import { describe, expect, it } from 'vitest';
import {
	compileSpecialistWorkbenchVersionV1,
	createSpecialistWorkbenchDraftV1,
	hashSpecialistWorkbenchValue
} from './workbench';
import {
	buildPublishedSpecialistSnapshotV3,
	hashExecutableSpecialistSnapshot,
	parseExecutableSpecialistSnapshot,
	publishedSpecialistReferencePrompt
} from './published-execution';
import { parseSpecialistSnapshotV2 } from './document-organization';

async function catalog(read = true) {
	const draft = createSpecialistWorkbenchDraftV1();
	draft.documentReadEnabled = read;
	draft.examples = draft.examples.filter((e) => read || !e.requiresDocumentRead);
	const snapshot = await compileSpecialistWorkbenchVersionV1({
		draftId: 'ad000000-0000-4000-8000-000000000001',
		draftRevision: 1,
		version: 1,
		draft
	});
	return { snapshot, snapshotHash: await hashSpecialistWorkbenchValue(snapshot) };
}
describe('explicit published specialist execution', () => {
	it.each([false, true])(
		'pins a complete recoverable version with evidence handoff=%s',
		async (evidenceHandoff) => {
			const published = await catalog();
			const snapshot = await buildPublishedSpecialistSnapshotV3({
				...published,
				evidenceHandoff
			});
			const hash = await hashExecutableSpecialistSnapshot(snapshot);
			published.snapshot.knowledgePacket.notes[0]!.text = 'Later edit';
			expect(await parseExecutableSpecialistSnapshot(snapshot, hash)).toEqual(snapshot);
			expect(publishedSpecialistReferencePrompt(snapshot)).not.toContain('Later edit');
			expect(snapshot.profileVersion).toBe(evidenceHandoff ? 3 : 2);
			await expect(parseSpecialistSnapshotV2(snapshot, hash)).rejects.toThrow();
		}
	);
	it('preserves an explicitly empty tool capability', async () => {
		const snapshot = await buildPublishedSpecialistSnapshotV3(await catalog(false));
		expect(snapshot.slots.project_analyst.definition.capabilities.allowedToolIds).toEqual([]);
		expect(
			await parseExecutableSpecialistSnapshot(
				snapshot,
				await hashExecutableSpecialistSnapshot(snapshot)
			)
		).toEqual(snapshot);
	});
	it('accepts a frozen recommendation and rejects an altered inner receipt on recovery', async () => {
		const published = await catalog();
		const candidate = {
			draftId: published.snapshot.draftId,
			version: 1,
			draftRevision: 1,
			snapshotHash: published.snapshotHash,
			name: published.snapshot.definition.label,
			createdAt: '2026-09-22T00:00:00Z',
			description: published.snapshot.definition.description,
			expertise: [...published.snapshot.definition.expertise],
			documentReadEnabled: true
		};
		const input = {
			version: 'specialist_recommendation_input_v1' as const,
			policy: 'jev_specialist_choice_v1' as const,
			projectId: 'ad000000-0000-4000-8000-000000000002',
			question: 'Review our saved research.',
			candidates: [candidate]
		};
		const result = {
			status: 'selected' as const,
			selected: candidate,
			ranking: [
				{ draftId: candidate.draftId, version: 1, name: candidate.name, probability: 0.9 }
			],
			confidence: 0.9,
			margin: 0.8,
			reason: 'Best fit',
			durationMs: 20,
			costUsd: 0.0001,
			provider: {
				model: 'typesafe/jev-1.13',
				requestId: 'mock',
				inputTokens: 20,
				outputTokens: 4,
				attempts: 1
			}
		};
		const recommendation = {
			id: 'ad000000-0000-4000-8000-000000000003',
			input,
			inputHash: await hashSpecialistWorkbenchValue(input),
			result,
			resultHash: await hashSpecialistWorkbenchValue(result)
		};
		const snapshot = await buildPublishedSpecialistSnapshotV3({ ...published, recommendation });
		expect(snapshot.editorTask).toContain('Answer the user question directly');
		expect(
			await parseExecutableSpecialistSnapshot(
				snapshot,
				await hashExecutableSpecialistSnapshot(snapshot)
			)
		).toEqual(snapshot);
		snapshot.recommendation!.result.selected!.snapshotHash = '0'.repeat(64);
		await expect(
			parseExecutableSpecialistSnapshot(
				snapshot,
				await hashExecutableSpecialistSnapshot(snapshot)
			)
		).rejects.toThrow('Invalid specialist recommendation receipt');
	});
	it.each(['modelPolicy', 'budgetPolicy', 'limits', 'capabilities', 'inputContract'])(
		'rejects a rehashed catalog with escalated %s',
		async (key) => {
			const v = await catalog();
			(v.snapshot.definition as any)[key] =
				key === 'inputContract' ? 'arbitrary' : { hacked: true };
			v.snapshotHash = await hashSpecialistWorkbenchValue(v.snapshot);
			await expect(buildPublishedSpecialistSnapshotV3(v)).rejects.toThrow();
		}
	);
	it('rejects substituted slots and altered knowledge even when the outer hash is recomputed', async () => {
		const snapshot = await buildPublishedSpecialistSnapshotV3(await catalog());
		(snapshot.slots.project_analyst.definition as any).instructions.system = 'Changed';
		await expect(
			parseExecutableSpecialistSnapshot(
				snapshot,
				await hashExecutableSpecialistSnapshot(snapshot)
			)
		).rejects.toThrow();
		const other = await buildPublishedSpecialistSnapshotV3(await catalog());
		other.published.snapshot.knowledgePacket.notes[0]!.text = 'Changed';
		await expect(
			parseExecutableSpecialistSnapshot(other, await hashExecutableSpecialistSnapshot(other))
		).rejects.toThrow();
	});
});
