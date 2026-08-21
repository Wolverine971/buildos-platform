// apps/web/src/lib/tests/agentic-e2e/scenarios/project-organize.scenario.ts
//
// Fuzzy scenario: seed a project with a pile of loose, messily-named documents
// and ask the chat to "get organized". Deterministic check: it took a real
// organizing action in the canonical doc_structure tree without losing source
// documents or content. Quality check: an LLM judge scores the resulting map.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertAnyToolCalled,
	assertToolCalledForExecutionMode,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript,
	normalizeComparableText
} from '../harness/assertions';
import {
	getProjectDocumentTree,
	listDocuments,
	waitForTurnRun,
	type DocumentTreeNode
} from '../harness/telemetry';

const MESSY_DOCS: Array<{ temp_id: string; title: string; body: string }> = [
	{
		temp_id: 'd1',
		title: 'notes',
		body: 'random notes from the kickoff call, mostly about scope'
	},
	{
		temp_id: 'd2',
		title: 'meeting 3-14 raw',
		body: 'raw meeting transcript, action items buried in here somewhere'
	},
	{
		temp_id: 'd3',
		title: 'TODO dump',
		body: '- ship pricing page\n- fix onboarding\n- email the beta list'
	},
	{
		temp_id: 'd4',
		title: 'pricing ideas v2 FINAL',
		body: 'tiered pricing: solo, team, enterprise. still deciding on annual discount.'
	},
	{
		temp_id: 'd5',
		title: 'random thoughts',
		body: 'what if we did a freemium tier? competitor does $12/mo.'
	},
	{
		temp_id: 'd6',
		title: 'customer email draft??',
		body: 'Hi {name}, we noticed you signed up but havent...'
	}
];

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Organize'),
			type_key: 'project.business.product_launch',
			description: 'A launch project whose documents are a disorganized pile.'
		},
		entities: MESSY_DOCS.map((d) => ({
			temp_id: d.temp_id,
			kind: 'document' as const,
			title: d.title,
			body_markdown: d.body
		})),
		relationships: []
	};
}

export const projectOrganizeScenario: Scenario = {
	id: 'project-organize',
	title: 'Organize a project with messy, loose documents',
	category: 'organization',
	requiredMutationTools: [
		'create_onto_document',
		'move_document_in_tree',
		'update_onto_document'
	],
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		// Project instantiation also creates a managed START HERE document. It may
		// legitimately evolve during organization; only scenario-authored source
		// documents are subject to the content-preservation assertion below.
		const expectedSourceByTitle = new Map(MESSY_DOCS.map((doc) => [doc.title, doc.body]));
		const docsBefore = (await listDocuments(ctx.db.admin, projectId)).filter((doc) =>
			expectedSourceByTitle.has(doc.title)
		);
		if (docsBefore.length !== MESSY_DOCS.length) {
			throw new Error(
				`[seed] expected ${MESSY_DOCS.length} messy source documents, found ${docsBefore.length}`
			);
		}
		for (const doc of docsBefore) {
			if (
				normalizeComparableText(doc.content ?? '') !==
				normalizeComparableText(expectedSourceByTitle.get(doc.title) ?? '')
			) {
				throw new Error(
					`[seed] source document "${doc.title}" content does not match its fixture`
				);
			}
		}
		return {
			projectId,
			entityIds: {},
			notes: {
				docsBefore: docsBefore.map((doc) => ({
					id: doc.id,
					title: doc.title,
					content: doc.content ?? ''
				}))
			}
		};
	},
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				"This project's documents are a mess — loose notes, raw meeting dumps, half-baked ideas, all " +
				'piled at the top level. Help me get it organized into something sensible.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertAnyToolCalled(turn, ['declare_turn_contract']);
				// The worker publishes its semantic review as a durable control-tool call.
				// Legacy has no equivalent tool, so parity is graded on the shared outcome below.
				assertToolCalledForExecutionMode(
					turn,
					'approve_turn_contract_review',
					ctx.executionMode,
					'worker_realtime'
				);
				assertAnyToolCalled(turn, ['move_document_in_tree', 'tool_exec']);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const docsBefore = seed.notes.docsBefore as Array<{
					id: string;
					title: string;
					content: string;
				}>;
				const docsAfter = await listDocuments(ctx.db.admin, seed.projectId!);
				const afterById = new Map(docsAfter.map((doc) => [doc.id, doc]));
				for (const before of docsBefore) {
					const after = afterById.get(before.id);
					if (!after) {
						throw new Error(`[assert] original document "${before.title}" was deleted`);
					}
					if (
						normalizeComparableText(after.content ?? '') !==
						normalizeComparableText(before.content)
					) {
						throw new Error(
							`[assert] original document "${before.title}" content changed during organization`
						);
					}
				}

				const tree = await getProjectDocumentTree(ctx.db.admin, seed.projectId!);
				const parentByChild = collectDocumentParents(tree.root);
				const originalIds = new Set(docsBefore.map((doc) => doc.id));
				const nestedOriginals = [...parentByChild.entries()].filter(([childId]) =>
					originalIds.has(childId)
				);
				if (nestedOriginals.length < 2) {
					const moveCalls = turn.toolCalls
						.filter((call) => call.function.name === 'move_document_in_tree')
						.map((call) => `  - move_document_in_tree(${call.function.arguments})`)
						.join('\n');
					const moveResults = turn.toolResults
						.filter((result) => {
							const name = String(
								(result.tool_name ?? result.name ?? result.tool ?? '') as string
							);
							const blob = name || JSON.stringify(result);
							return blob.includes('move_document_in_tree');
						})
						.map((result) => `  - ${JSON.stringify(result).slice(0, 400)}`)
						.join('\n');
					throw new Error(
						`[assert] only ${nestedOriginals.length} original document(s) were nested; expected at least 2.\n` +
							(moveCalls
								? `Moves the model actually made (a move without new_parent_id goes to root and nests nothing):\n${moveCalls}\n` +
									`Move results (server side):\n${moveResults || '  (no move results captured)'}`
								: 'No move_document_in_tree calls were made.')
					);
				}
				const childrenPerParent = new Map<string, number>();
				for (const [, parentId] of nestedOriginals) {
					childrenPerParent.set(parentId, (childrenPerParent.get(parentId) ?? 0) + 1);
				}
				if (![...childrenPerParent.values()].some((count) => count >= 2)) {
					throw new Error(
						'[assert] no document grouping contains at least 2 original documents'
					);
				}

				seed.notes.docsAfter = docsAfter.map((doc) => ({
					title: doc.title,
					contentPreserved: originalIds.has(doc.id)
				}));
				seed.notes.organizationMap = nestedOriginals.map(([childId, parentId]) => ({
					parent: afterById.get(parentId)?.title ?? parentId,
					child: afterById.get(childId)?.title ?? childId
				}));
			},
			judge: async (turn, _ctx, seed) => ({
				rubric:
					'The user asked the assistant to organize a project whose documents were a disorganized pile ' +
					'(loose notes, a raw meeting dump, a TODO dump, pricing ideas, random thoughts, a customer email ' +
					'draft). A good result groups related material sensibly (e.g. folders/parents for meeting notes, ' +
					'pricing, outreach), gives things clearer structure, and does not lose or mangle content. Judge ' +
					'the quality of the resulting organization, not just that something happened. Penalize no real ' +
					'restructuring, nonsensical grouping, or destroyed content.',
				threshold: 3,
				transcript: buildTranscript(turn, {
					docsBefore: seed.notes.docsBefore,
					docsAfter: seed.notes.docsAfter,
					documentOrganization: seed.notes.organizationMap
				})
			})
		}
	]
};

function collectDocumentParents(
	nodes: DocumentTreeNode[],
	parentId: string | null = null,
	result = new Map<string, string>()
): Map<string, string> {
	for (const node of nodes) {
		if (parentId) result.set(node.id, parentId);
		collectDocumentParents(node.children, node.id, result);
	}
	return result;
}
