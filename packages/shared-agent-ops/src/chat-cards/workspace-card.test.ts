// packages/shared-agent-ops/src/chat-cards/workspace-card.test.ts
//
// The Workspace cards' contract (tasker 146): payloads parse under the shared rail,
// the resolver's argument check matches the tool's own arguments (items as a set,
// target, suggestion, cleaned name), the visibleDigest moves with ids and counts but
// never with titles or timestamps, receipts round-trip through a resolution, and the
// wording never says something moved when it didn't.
import { describe, expect, it } from 'vitest';
import {
	buildProposalCardEnvelopeV1,
	describeProposalCardResolution,
	describeProposalCardUndo,
	parseProposalCardEnvelope,
	parseProposalCardResolution,
	parseProposalCardUndo,
	proposalCardKindForTool,
	proposalCardSpec,
	proposalCardState,
	proposalCardVisibleDigest,
	type WorkspaceFileProposalPayloadV1,
	type WorkspaceProjectProposalPayloadV1
} from './proposal-card';
import {
	cleanWorkspaceProjectName,
	parseWorkspaceItemKeys,
	workspaceFileDigest,
	workspaceProjectDigest
} from './workspace-card';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [CARD, SESSION, WORKSPACE, TARGET, NOTE, DOC, TASK, SUGGESTION, BATCH, NEW_PROJECT] =
	Array.from({ length: 10 }, (_, n) => id(n + 1)) as string[];

function filePayload(
	overrides: Partial<WorkspaceFileProposalPayloadV1> = {}
): WorkspaceFileProposalPayloadV1 {
	return {
		version: 1,
		workspace: { id: WORKSPACE!, name: 'Workspace' },
		target: { id: TARGET!, name: 'BuildOS' },
		items: [
			{ entity: 'document', id: NOTE!, kind: 'note', title: 'Pricing thought' },
			{ entity: 'task', id: TASK!, kind: 'task', title: 'Email Cadre' }
		],
		nested_documents: 0,
		suggestion_id: SUGGESTION!,
		reason: 'Both are about pricing.',
		checked_at: '2026-10-23T12:00:00.000Z',
		...overrides
	};
}

function projectPayload(
	overrides: Partial<WorkspaceProjectProposalPayloadV1> = {}
): WorkspaceProjectProposalPayloadV1 {
	return {
		version: 1,
		workspace: { id: WORKSPACE!, name: 'Workspace' },
		name: 'Kids History Project',
		description: null,
		items: [
			{ entity: 'document', id: DOC!, kind: 'doc', title: 'Reading list' },
			{ entity: 'task', id: TASK!, kind: 'task', title: 'Library visit' }
		],
		nested_documents: 1,
		suggestion_id: null,
		checked_at: '2026-10-23T12:00:00.000Z',
		...overrides
	};
}

function envelope(kind: 'workspace_file' | 'workspace_project', payload: unknown) {
	return JSON.parse(
		JSON.stringify(
			buildProposalCardEnvelopeV1({
				kind,
				cardId: CARD!,
				sessionId: SESSION!,
				proposedAt: '2026-10-23T12:00:00.000Z',
				payload,
				message: 'Needs your choice.'
			})
		)
	);
}

describe('workspace card kinds', () => {
	it('registers both tools on the rail', () => {
		expect(proposalCardKindForTool('propose_workspace_filing')).toBe('workspace_file');
		expect(proposalCardKindForTool('propose_workspace_project')).toBe('workspace_project');
		expect(proposalCardKindForTool('list_workspace_suggestions')).toBeNull();
		for (const kind of ['workspace_file', 'workspace_project'] as const) {
			const spec = proposalCardSpec(kind);
			expect(spec.choices).toEqual(['apply', 'cancel']);
			expect(spec.hasPreview).toBe(false);
			expect(spec.hasUndoPreview).toBe(false);
		}
	});

	it('parses a filing card envelope and keeps the payload intact', () => {
		const card = parseProposalCardEnvelope(envelope('workspace_file', filePayload()));
		expect(card?.kind).toBe('workspace_file');
		expect(card?.client_action.payload).toEqual(filePayload());
		expect(card?.model_view).toMatchObject({
			target: { id: TARGET, name: 'BuildOS' },
			suggestion_id: SUGGESTION
		});
		expect(proposalCardState(card!)).toBe('pending');
	});

	it('refuses payloads that would move the wrong thing', () => {
		const spec = proposalCardSpec('workspace_file');
		expect(
			spec.parsePayload(filePayload({ target: { id: WORKSPACE!, name: 'Workspace' } }))
		).toBeNull();
		expect(spec.parsePayload(filePayload({ items: [] }))).toBeNull();
		const duplicate = filePayload().items[0]!;
		expect(spec.parsePayload(filePayload({ items: [duplicate, duplicate] }))).toBeNull();
		// A task can't pose as a note.
		expect(
			spec.parsePayload(
				filePayload({ items: [{ entity: 'task', id: TASK!, kind: 'note', title: 'x' }] })
			)
		).toBeNull();
		const tooMany = Array.from({ length: 21 }, (_, n) => ({
			entity: 'task' as const,
			id: id(100 + n),
			kind: 'task' as const,
			title: `Task ${n}`
		}));
		expect(spec.parsePayload(filePayload({ items: tooMany }))).toBeNull();
		// The project name must already be the cleaned one the tool stored.
		expect(
			proposalCardSpec('workspace_project').parsePayload(
				projectPayload({ name: '  Kids   History ' })
			)
		).toBeNull();
	});

	it('matches the tool arguments as a set, with the same target and suggestion', () => {
		const spec = proposalCardSpec('workspace_file');
		const payload = filePayload();
		const args = {
			target_project_id: TARGET!.toUpperCase(),
			suggestion_id: SUGGESTION,
			items: [
				{ entity: 'task', id: TASK },
				{ entity: 'document', id: NOTE },
				{ entity: 'task', id: TASK }
			]
		};
		expect(spec.argumentsMatch(args, payload)).toBe(true);
		expect(spec.argumentsMatch({ ...args, target_project_id: id(99) }, payload)).toBe(false);
		expect(spec.argumentsMatch({ ...args, suggestion_id: undefined }, payload)).toBe(false);
		expect(
			spec.argumentsMatch({ ...args, items: [{ entity: 'task', id: TASK }] }, payload)
		).toBe(false);
		expect(
			spec.argumentsMatch(
				{ ...args, items: [...args.items, { entity: 'document', id: DOC }] },
				payload
			)
		).toBe(false);

		const project = proposalCardSpec('workspace_project');
		const projectArgs = {
			name: ' Kids  History Project ',
			items: [
				{ entity: 'document', id: DOC },
				{ entity: 'task', id: TASK }
			]
		};
		expect(project.argumentsMatch(projectArgs, projectPayload())).toBe(true);
		expect(project.argumentsMatch({ ...projectArgs, name: 'Other' }, projectPayload())).toBe(
			false
		);
		expect(
			project.argumentsMatch({ ...projectArgs, suggestion_id: SUGGESTION }, projectPayload())
		).toBe(false);
	});

	it('digests ids and counts only', () => {
		const base = workspaceFileDigest(filePayload());
		expect(proposalCardVisibleDigest('workspace_file', filePayload())).toBe(base);
		// Titles, names, reasons and timestamps don't change what the click does.
		expect(
			workspaceFileDigest(
				filePayload({
					target: { id: TARGET!, name: 'Renamed' },
					items: filePayload().items.map((item) => ({ ...item, title: 'Renamed' })),
					reason: null,
					checked_at: '2026-10-23T13:00:00.000Z'
				})
			)
		).toBe(base);
		// Order doesn't matter; a missing item, a nested doc or another target does.
		expect(
			workspaceFileDigest(filePayload({ items: [...filePayload().items].reverse() }))
		).toBe(base);
		expect(workspaceFileDigest(filePayload({ items: filePayload().items.slice(1) }))).not.toBe(
			base
		);
		expect(workspaceFileDigest(filePayload({ nested_documents: 2 }))).not.toBe(base);
		expect(
			workspaceFileDigest(filePayload({ target: { id: id(99), name: 'BuildOS' } }))
		).not.toBe(base);
		const projectBase = workspaceProjectDigest(projectPayload());
		expect(workspaceProjectDigest(projectPayload({ description: 'Changed' }))).toBe(
			projectBase
		);
		expect(
			workspaceProjectDigest(projectPayload({ items: projectPayload().items.slice(0, 1) }))
		).not.toBe(projectBase);
	});

	it('round-trips resolutions and undos, and words them plainly', () => {
		const fileCard = parseProposalCardEnvelope(envelope('workspace_file', filePayload()))!;
		const applied = parseProposalCardResolution(
			{
				version: 1,
				card_id: CARD,
				kind: 'workspace_file',
				choice: 'apply',
				outcome: 'applied',
				resolved_at: '2026-10-23T12:01:00.000Z',
				reason_code: null,
				receipt: {
					target_project_id: TARGET,
					batch_id: BATCH,
					moved: 2,
					suggestion_id: SUGGESTION,
					suggestion_updated: true
				}
			},
			{ cardId: CARD!, kind: 'workspace_file' }
		);
		expect(applied?.receipt).toMatchObject({ batch_id: BATCH, moved: 2 });
		expect(describeProposalCardResolution(fileCard, applied!)).toEqual({
			text: 'Filed 2 items into BuildOS',
			href: `/projects/${TARGET}`
		});
		const stale = { ...applied!, outcome: 'stale' as const, reason_code: 'items_moved' };
		expect(describeProposalCardResolution(fileCard, stale).text).toBe(
			'These items already left the Workspace, so nothing moved.'
		);
		const cancelled = { ...applied!, choice: 'cancel', outcome: 'cancelled' as const };
		expect(describeProposalCardResolution(fileCard, cancelled).text).toBe(
			'Not now. Nothing moved.'
		);
		const undo = parseProposalCardUndo(
			{
				version: 1,
				card_id: CARD,
				kind: 'workspace_file',
				outcome: 'undone',
				undone_at: '2026-10-23T12:02:00.000Z',
				reason_code: null,
				receipt: { batch_id: BATCH }
			},
			{ cardId: CARD!, kind: 'workspace_file' }
		);
		expect(describeProposalCardUndo(fileCard, undo!).text).toBe(
			'Undone. The items are back in your Workspace.'
		);

		const projectCard = parseProposalCardEnvelope(
			envelope('workspace_project', projectPayload())
		)!;
		const started = parseProposalCardResolution({
			version: 1,
			card_id: CARD,
			kind: 'workspace_project',
			choice: 'apply',
			outcome: 'applied',
			resolved_at: '2026-10-23T12:01:00.000Z',
			reason_code: null,
			receipt: {
				project_id: NEW_PROJECT,
				project_name: 'Kids History Project',
				batch_id: BATCH,
				moved: 2,
				suggestion_id: null,
				suggestion_updated: false
			}
		});
		expect(describeProposalCardResolution(projectCard, started!)).toEqual({
			text: 'Started Kids History Project with 2 items',
			href: `/projects/${NEW_PROJECT}`
		});
		const kept = parseProposalCardUndo({
			version: 1,
			card_id: CARD,
			kind: 'workspace_project',
			outcome: 'undone',
			undone_at: '2026-10-23T12:02:00.000Z',
			reason_code: null,
			receipt: { project_id: NEW_PROJECT, batch_id: BATCH, project_removed: false }
		});
		expect(describeProposalCardUndo(projectCard, kept!).text).toContain(
			'Kids History Project stays'
		);
	});

	it('cleans names and item references the way graduateItems and the suggestions table do', () => {
		expect(cleanWorkspaceProjectName('  Kids \n History  ')).toBe('Kids History');
		expect(cleanWorkspaceProjectName('   ')).toBeNull();
		expect(cleanWorkspaceProjectName('x'.repeat(200))).toHaveLength(120);
		expect(
			parseWorkspaceItemKeys([
				{ kind: 'document', id: NOTE!.toUpperCase() },
				{ entity: 'task', id: TASK },
				{ entity: 'document', id: NOTE }
			])
		).toEqual([
			{ entity: 'document', id: NOTE },
			{ entity: 'task', id: TASK }
		]);
		expect(parseWorkspaceItemKeys([{ entity: 'goal', id: TASK }])).toBeNull();
	});
});
