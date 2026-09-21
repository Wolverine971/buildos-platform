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
