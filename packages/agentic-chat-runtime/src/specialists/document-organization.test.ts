// packages/agentic-chat-runtime/src/specialists/document-organization.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildDocumentOrganizationSnapshotV2,
	hashSpecialistSnapshotV2,
	parseSpecialistSnapshotV2,
	SPECIALIST_REGISTRY_V2,
	buildDocumentReadSnapshotV2,
	buildDocumentEvidenceSnapshotV2,
	documentSnapshotMatchesPolicy,
	DOCUMENT_READ_TOOL_ID
} from './document-organization';
import { SPECIALIST_REGISTRY_V1 } from './project-review-v1';

describe('immutable specialist profile', () => {
	it('versions shared evidence without changing the old inventory reviewer', async () => {
		const s = buildDocumentEvidenceSnapshotV2();
		expect(await parseSpecialistSnapshotV2(s, await hashSpecialistSnapshotV2(s))).toEqual(s);
		expect(documentSnapshotMatchesPolicy(s, 'internal-document-organization:v4')).toBe(true);
		expect(documentSnapshotMatchesPolicy(s, 'internal-document-organization:v3')).toBe(false);
		expect(s.slots.risk_reviewer.definition.version).toBe(2);
		expect(s.slots.risk_reviewer.definition.capabilities.allowedToolIds).toEqual([]);
		expect(s.plannerTask).not.toContain('reviewer has inventory evidence only');
		expect(s.editorTask).toContain('[[document:FULL_UUID|Document title]]');
		const old = buildDocumentReadSnapshotV2();
		expect(old.slots.risk_reviewer.definition.version).toBe(1);
		expect(old.plannerTask).toContain('reviewer has inventory evidence only');
		s.slots.risk_reviewer.definition = { ...s.slots.risk_reviewer.definition, version: 1 };
		await expect(
			parseSpecialistSnapshotV2(s, await hashSpecialistSnapshotV2(s))
		).rejects.toThrow();
	});
	it('pins the bounded read tool to organizer v2 and its new policy only', async () => {
		const s = buildDocumentReadSnapshotV2();
		expect(await parseSpecialistSnapshotV2(s, await hashSpecialistSnapshotV2(s))).toEqual(s);
		expect(documentSnapshotMatchesPolicy(s, 'internal-document-organization:v3')).toBe(true);
		expect(documentSnapshotMatchesPolicy(s, 'internal-document-organization:v2')).toBe(false);
		expect(s.slots.project_analyst.definition.instructions.system).not.toContain(
			'You have no tools'
		);
		for (const slot of ['project_analyst', 'risk_reviewer'] as const) {
			const altered = structuredClone(s);
			altered.slots[slot].definition = {
				...altered.slots[slot].definition,
				capabilities: {
					...altered.slots[slot].definition.capabilities,
					allowedToolIds:
						slot === 'risk_reviewer'
							? [DOCUMENT_READ_TOOL_ID]
							: [DOCUMENT_READ_TOOL_ID, 'delete_document']
				}
			};
			await expect(
				parseSpecialistSnapshotV2(altered, await hashSpecialistSnapshotV2(altered))
			).rejects.toThrow();
		}
	});
	it('keeps the v1 catalog stable and restores saved instructions without consulting current definitions', async () => {
		expect(SPECIALIST_REGISTRY_V1.list()).toHaveLength(2);
		expect(SPECIALIST_REGISTRY_V2.list()).toHaveLength(3);
		const snapshot = buildDocumentOrganizationSnapshotV2();
		snapshot.slots.project_analyst.definition = {
			...snapshot.slots.project_analyst.definition,
			instructions: {
				system: 'Saved historical document expertise.',
				defaultAssignment: 'Saved assignment.'
			}
		};
		const hash = await hashSpecialistSnapshotV2(snapshot);
		const restored = await parseSpecialistSnapshotV2(
			JSON.parse(JSON.stringify(snapshot)),
			hash
		);
		expect(restored.slots.project_analyst.definition.instructions.system).toBe(
			'Saved historical document expertise.'
		);
		expect(
			await hashSpecialistSnapshotV2({
				...snapshot,
				selector: { version: 1, id: 'fixed_document_organization' }
			})
		).toBe(hash);
		snapshot.editorTask = 'Tampered';
		await expect(parseSpecialistSnapshotV2(snapshot, hash)).rejects.toThrow();
	});
	it.each(['tools', 'model', 'budget', 'contract', 'slot', 'version', 'size', 'knowledge'])(
		'rejects unsupported %s even with a matching hash',
		async (kind) => {
			const s = buildDocumentOrganizationSnapshotV2() as any;
			const d = s.slots.project_analyst.definition;
			if (kind === 'knowledge')
				d.knowledge = [{ id: 'unloaded', version: 1, source: 'external' }];
			if (kind === 'tools') d.capabilities.allowedToolIds = ['delete_document'];
			if (kind === 'model') d.modelPolicy.primaryModel = 'unpriced-model';
			if (kind === 'budget') d.budgetPolicy.maxSpendMicroUsd *= 2;
			if (kind === 'contract') d.outputContract = 'unknown';
			if (kind === 'slot') d.id = 'project_analyst';
			if (kind === 'version') s.profileVersion = 2;
			if (kind === 'size') s.editorTask = 'x'.repeat(13_000);
			await expect(
				parseSpecialistSnapshotV2(s, await hashSpecialistSnapshotV2(s))
			).rejects.toThrow();
		}
	);
});
