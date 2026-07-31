// apps/web/src/lib/tests/agentic-e2e/scenarios/book-writing-journey.scenario.ts
//
// A long-form creative-work journey. The purpose is not to prove that a model
// can emit pretty prose in one pass; it is to prove that BuildOS becomes a
// durable book workspace as canon arrives over time, then retrieves that canon
// in a brand-new chat before giving story guidance.
//
// Quality misses are checkpoints, not immediate aborts. That lets one paid run
// expose organization, update, retrieval, and restraint problems together.
import type { DocumentRow, DocumentTreeNode } from '../harness/telemetry';
import type { Scenario, SeedResult, TurnResult } from '../harness/types';
import { harnessProjectName, teardownProject } from '../harness/seed';
import {
	assertAnyToolCalled,
	assertCleanText,
	assertExactVisiblyLabeledOptions,
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	excludeSystemDocuments,
	normalizeComparableText
} from '../harness/assertions';
import {
	getProjectDocumentTree,
	listDocuments,
	listGoals,
	listMilestones,
	listPlans,
	listProjectsByExactName,
	listTasks,
	waitForTurnRun
} from '../harness/telemetry';

const PROJECT_NAME = harnessProjectName('Book Journey');
const BOOK_TITLE = "The Cartographer's Debt";

function docsFrom(seed: SeedResult, key: string): DocumentRow[] {
	return (seed.notes[key] as DocumentRow[] | undefined) ?? [];
}

function characterDocs(docs: DocumentRow[], name: string): DocumentRow[] {
	const needle = name.toLowerCase();
	return docs.filter((doc) => doc.title.toLowerCase().includes(needle));
}

function storyDocs(docs: DocumentRow[]): DocumentRow[] {
	return docs.filter(
		(doc) =>
			!/(mara|ilyan)/i.test(doc.title) &&
			(/(plot|story|overview|premise|structure|outline|chapter|beat|bible|part)/i.test(
				doc.title
			) ||
				doc.type_key === 'document.context.project')
	);
}

function combinedContent(docs: DocumentRow[]): string {
	return normalizeComparableText(
		docs.map((doc) => `${doc.title}\n${doc.content ?? ''}`).join('\n')
	);
}

function requireFacts(
	label: string,
	content: string,
	facts: Array<{ label: string; pattern: RegExp }>
): void {
	const missing = facts.filter((fact) => !fact.pattern.test(content)).map((fact) => fact.label);
	if (missing.length > 0) {
		throw new Error(`[assert] ${label} is missing canon: [${missing.join(', ')}]`);
	}
}

/**
 * Remove `## Author canon` sections so an assertion can look at what the model
 * itself wrote. The runtime deterministically injects the author's source
 * sentences under that heading, so canon-section content proves nothing about
 * model propagation.
 */
function stripAuthorCanonSections(content: string): string {
	const kept: string[] = [];
	let inCanonSection = false;
	for (const line of content.split('\n')) {
		if (/^#{1,6}\s/.test(line)) {
			inCanonSection = /^#{1,6}\s*author canon\s*$/i.test(line);
			if (inCanonSection) continue;
		}
		if (!inCanonSection) kept.push(line);
	}
	return kept.join('\n');
}

function changedDocuments(beforeDocs: DocumentRow[], afterDocs: DocumentRow[]): DocumentRow[] {
	const before = new Map(beforeDocs.map((doc) => [doc.id, doc.content ?? '']));
	return afterDocs.filter(
		(doc) => !before.has(doc.id) || before.get(doc.id) !== (doc.content ?? '')
	);
}

function documentFingerprint(docs: DocumentRow[]): string {
	return docs
		.map(
			(doc) =>
				`${doc.id}:${doc.title}:${doc.state_key}:${doc.updated_at}:${doc.content ?? ''}`
		)
		.sort()
		.join('\n---\n');
}

function documentTreeIds(nodes: DocumentTreeNode[], result: string[] = []): string[] {
	for (const node of nodes) {
		result.push(node.id);
		documentTreeIds(node.children, result);
	}
	return result;
}

function parsedToolArguments(
	turn: TurnResult,
	toolNames: Set<string>
): Array<Record<string, unknown>> {
	return turn.toolCalls.flatMap((call) => {
		if (!toolNames.has(call.function.name)) return [];
		try {
			const value = JSON.parse(call.function.arguments) as unknown;
			return value && typeof value === 'object' && !Array.isArray(value)
				? [value as Record<string, unknown>]
				: [];
		} catch {
			return [];
		}
	});
}

function documentIdsRead(turn: TurnResult): Set<string> {
	const readTools = new Set([
		'get_onto_document_details',
		'get_document_outline',
		'read_document_section'
	]);
	return new Set(
		parsedToolArguments(turn, readTools)
			.map((args) => args.document_id)
			.filter((id): id is string => typeof id === 'string' && id.length > 0)
	);
}

async function captureCreatedProject(
	turn: TurnResult,
	ctx: Parameters<NonNullable<Scenario['seed']>>[0],
	seed: SeedResult
): Promise<string> {
	const exact = await listProjectsByExactName(ctx.db.admin, ctx.db.actorId, PROJECT_NAME);
	const fromContext = turn.lastTurnContext?.entities.projects?.find(
		(project) => project.name === PROJECT_NAME
	)?.id;
	const projectId = exact[0]?.id ?? fromContext;
	if (!projectId) {
		throw new Error(
			`[assert] create turn completed but project "${PROJECT_NAME}" could not be captured for follow-ups`
		);
	}
	seed.projectId = projectId;
	if (exact.length > 1) {
		throw new Error(
			`[assert] create turn produced ${exact.length} projects named "${PROJECT_NAME}"`
		);
	}
	return projectId;
}

function assertOneNamedCharacterDoc(docs: DocumentRow[], name: string): DocumentRow {
	const matches = characterDocs(docs, name);
	if (matches.length !== 1) {
		throw new Error(
			`[assert] expected one dedicated ${name} reference sheet; found ${matches.length}. ` +
				`Titles: [${docs.map((doc) => doc.title).join(', ')}]`
		);
	}
	return matches[0]!;
}

export const bookWritingJourneyScenario: Scenario = {
	id: 'book-writing-journey',
	title: 'Grow a book from brain dump to grounded story guidance',
	category: 'creative',
	timeoutMs: 720_000,
	seed: async (): Promise<SeedResult> => ({
		entityIds: {},
		notes: {}
	}),
	teardown: async (ctx, seed) => {
		// The runner removes the captured primary project. This catches a duplicate
		// create or a failed capture while staying exact-name + actor scoped.
		const matches = await listProjectsByExactName(ctx.db.admin, ctx.db.actorId, PROJECT_NAME);
		for (const project of matches) {
			if (project.id !== seed.projectId) await teardownProject(ctx.db, project.id);
		}
	},
	turns: [
		{
			label: 'Create workspace from the opening brain dump',
			contextType: 'project_create',
			message:
				`Create a new book workspace named exactly "${PROJECT_NAME}". The working title is ` +
				`"${BOOK_TITLE}". I want this chat to be the ongoing room for the novel, so as I drop ` +
				`canon and ideas, keep them organized into a useful book reference instead of leaving ` +
				`everything buried in chat. Here's the opening brain dump: Bellwether is a canal city where ` +
				`official maps decide what the city remembers; erase a street from the atlas and people forget ` +
				`it existed. Mara Venn is an apprentice cartographer who alone remembers the erased Drowned ` +
				`Ward, and she wants to restore it before Archivist Senn removes it forever. Ilyan Rook is a ` +
				`harbor customs clerk whose older brother disappeared after an official border was redrawn. ` +
				`The book has three parts: Part I, The Missing Street; Part II, The Salt Archive; and Part III, ` +
				`A Map That Refuses to Burn. The emotional spine is whether recovering a stolen past is worth ` +
				`destroying the life people built after forgetting it.`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertCleanText(turn);
				assertNonEmptyAssistantText(turn);
				assertToolCalled(turn, 'create_onto_project');
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
				const projectId = await captureCreatedProject(turn, ctx, seed);
				const docs = excludeSystemDocuments(await listDocuments(ctx.db.admin, projectId));
				seed.notes.turn1Docs = docs;
				seed.notes.turn1Tree = await getProjectDocumentTree(ctx.db.admin, projectId);
				const [goals, plans, tasks, milestones] = await Promise.all([
					listGoals(ctx.db.admin, projectId),
					listPlans(ctx.db.admin, projectId),
					listTasks(ctx.db.admin, projectId),
					listMilestones(ctx.db.admin, projectId)
				]);
				seed.notes.turn1OperationalScaffolding = { goals, plans, tasks, milestones };
			},
			checkpoints: [
				{
					name: 'separate character reference sheets',
					check: (_turn, _ctx, seed) => {
						const docs = docsFrom(seed, 'turn1Docs');
						if (docs.length < 3 || docs.length > 8) {
							throw new Error(
								`[assert] opening brain dump produced ${docs.length} authored documents; expected 3-8`
							);
						}
						const mara = assertOneNamedCharacterDoc(docs, 'Mara');
						const ilyan = assertOneNamedCharacterDoc(docs, 'Ilyan');
						requireFacts('Mara reference sheet', combinedContent([mara]), [
							{
								label: 'apprentice cartographer',
								pattern: /apprentice.*cartograph|cartograph.*apprentice/
							},
							{ label: 'Drowned Ward', pattern: /drowned ward/ }
						]);
						requireFacts('Ilyan reference sheet', combinedContent([ilyan]), [
							{
								label: 'harbor customs clerk',
								pattern: /harbor.*customs|customs.*clerk/
							},
							{ label: 'older brother', pattern: /older brother|brother.*disappear/ },
							{ label: 'redrawn border', pattern: /border.*redraw|redrawn.*border/ }
						]);
					}
				},
				{
					name: 'plot and part structure persisted',
					check: (_turn, _ctx, seed) => {
						const candidates = storyDocs(docsFrom(seed, 'turn1Docs'));
						if (candidates.length === 0) {
							throw new Error(
								'[assert] no plot, overview, story, or chapter-structure document exists'
							);
						}
						requireFacts('story reference', combinedContent(candidates), [
							{
								label: 'maps control memory',
								pattern: /map.*(remember|memory)|forget.*street/
							},
							{ label: 'Archivist Senn', pattern: /archivist senn/ },
							{
								label: 'Part I — The Missing Street',
								pattern: /part i.*missing street/
							},
							{
								label: 'Part II — The Salt Archive',
								pattern: /part ii.*salt archive/
							},
							{
								label: 'Part III — A Map That Refuses to Burn',
								pattern: /part iii.*refuses to burn/
							}
						]);
					}
				},
				{
					name: 'authored documents are navigable in the document tree',
					check: (_turn, _ctx, seed) => {
						const tree = seed.notes.turn1Tree as { root: DocumentTreeNode[] };
						const treeIds = new Set(documentTreeIds(tree.root));
						const missing = docsFrom(seed, 'turn1Docs').filter(
							(document) => !treeIds.has(document.id)
						);
						if (missing.length > 0) {
							throw new Error(
								`[assert] authored documents are missing from the project tree: [${missing
									.map((document) => document.title)
									.join(', ')}]`
							);
						}
					}
				},
				{
					name: 'no invented operational scaffolding for story canon',
					check: (_turn, _ctx, seed) => {
						const scaffolding = seed.notes.turn1OperationalScaffolding as Record<
							string,
							unknown[]
						>;
						const invented = Object.entries(scaffolding)
							.filter(([, rows]) => rows.length > 0)
							.map(([kind, rows]) => `${kind}=${rows.length}`);
						if (invented.length > 0) {
							throw new Error(
								`[assert] the canon-only brain dump created unrequested operational scaffolding: ${invented.join(', ')}`
							);
						}
					}
				}
			]
		},
		{
			label: 'Fold a new character detail into canon',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`One more thing about Ilyan: he keeps his brother's contraband brass whistle in the evidence ` +
				`drawer and lies that it was confiscated from a sailor. When he feels cornered, he gets more ` +
				`procedural and starts quoting regulations instead of acting impulsively.`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertCleanText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
				seed.notes.turn2Docs = excludeSystemDocuments(
					await listDocuments(ctx.db.admin, seed.projectId!)
				);
			},
			checkpoints: [
				{
					name: 'character detail became a durable write',
					check: (turn) => {
						assertAnyToolCalled(turn, ['update_onto_document', 'create_onto_document']);
					}
				},
				{
					name: 'existing Ilyan sheet updated without duplication',
					check: (_turn, _ctx, seed) => {
						const before = docsFrom(seed, 'turn1Docs');
						const after = docsFrom(seed, 'turn2Docs');
						const beforeIlyan = assertOneNamedCharacterDoc(before, 'Ilyan');
						const afterIlyan = assertOneNamedCharacterDoc(after, 'Ilyan');
						if (afterIlyan.id !== beforeIlyan.id) {
							throw new Error(
								'[assert] Ilyan canon moved to a new duplicate document instead of updating the original'
							);
						}
						if (afterIlyan.content === beforeIlyan.content) {
							throw new Error(
								'[assert] the existing Ilyan reference sheet did not change'
							);
						}
						requireFacts(
							'updated Ilyan reference sheet',
							combinedContent([afterIlyan]),
							[
								{
									label: 'older brother (preserved)',
									pattern: /older brother|brother.*disappear/
								},
								{ label: 'customs role (preserved)', pattern: /customs/ },
								{ label: 'contraband brass whistle', pattern: /brass whistle/ },
								{ label: 'evidence drawer', pattern: /evidence drawer/ },
								{
									label: 'procedural under pressure',
									pattern: /procedur|quot.*regulation/
								}
							]
						);
						if (after.length > before.length + 1) {
							throw new Error(
								`[assert] one character detail created ${after.length - before.length} new documents`
							);
						}
					}
				}
			]
		},
		{
			label: 'Propagate a beat into character and chapter structure',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`I think the last beat of Part I happens at the end of chapter 4: Ilyan catches Mara hiding ` +
				`a forbidden map and chooses not to report her. Mara reads that as loyalty, but privately he ` +
				`is using her to reach the Salt Archive because he thinks his brother's erased record is there. ` +
				`Chapter 5 opens Part II on the morning after that choice.`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertCleanText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
				const docs = excludeSystemDocuments(
					await listDocuments(ctx.db.admin, seed.projectId!)
				);
				seed.notes.turn3Docs = docs;
				seed.notes.beforeAdviceFingerprint = documentFingerprint(docs);
				const [goals, plans, tasks, milestones] = await Promise.all([
					listGoals(ctx.db.admin, seed.projectId!),
					listPlans(ctx.db.admin, seed.projectId!),
					listTasks(ctx.db.admin, seed.projectId!),
					listMilestones(ctx.db.admin, seed.projectId!)
				]);
				seed.notes.turn3OperationalScaffolding = { goals, plans, tasks, milestones };
			},
			checkpoints: [
				{
					// Ground truth from the hosted rows, not tool-call counting: a
					// rejected create plus one update is two calls but one durable
					// projection, and that must fail here.
					name: 'chapter beat produced two distinct durable projections',
					check: (_turn, _ctx, seed) => {
						const changed = changedDocuments(
							docsFrom(seed, 'turn2Docs'),
							docsFrom(seed, 'turn3Docs')
						);
						if (changed.length < 2) {
							throw new Error(
								`[assert] chapter beat changed ${changed.length} durable document(s) ` +
									`[${changed.map((doc) => doc.title).join(', ')}]; expected the character sheet and the story structure`
							);
						}
					}
				},
				{
					// The runtime injects the author's sentences under `## Author
					// canon`, so the structure-content checkpoint below can be
					// satisfied by the server alone. This checkpoint looks only at
					// model-authored content: if the model stopped projecting beats
					// entirely and shipped bare canon dumps, this catches it.
					name: 'model-authored beat projection beyond injected author canon',
					check: (_turn, _ctx, seed) => {
						const changedStory = changedDocuments(
							docsFrom(seed, 'turn2Docs'),
							docsFrom(seed, 'turn3Docs')
						).filter((doc) => storyDocs([doc]).length > 0);
						const authored = normalizeComparableText(
							changedStory
								.map((doc) => stripAuthorCanonSections(doc.content ?? ''))
								.join('\n')
						);
						const beatSignals = [
							/chapter 5/,
							/not report|doesn.t report|chooses not to/,
							/mara.*(loyal|misread)|loyal.*mara/
						];
						if (!beatSignals.some((pattern) => pattern.test(authored))) {
							throw new Error(
								'[assert] no model-authored beat projection found outside the injected Author canon sections — the deterministic server floor is doing all of the structure work'
							);
						}
					}
				},
				{
					name: 'Ilyan motivation propagated to his reference sheet',
					check: (_turn, _ctx, seed) => {
						const before = assertOneNamedCharacterDoc(
							docsFrom(seed, 'turn2Docs'),
							'Ilyan'
						);
						const after = assertOneNamedCharacterDoc(
							docsFrom(seed, 'turn3Docs'),
							'Ilyan'
						);
						if (after.id !== before.id || after.content === before.content) {
							throw new Error(
								'[assert] the Part I beat did not update the existing Ilyan reference sheet'
							);
						}
						requireFacts('Ilyan motivation', combinedContent([after]), [
							{ label: 'Mara', pattern: /mara/ },
							{ label: 'Salt Archive', pattern: /salt archive/ },
							{
								label: 'using Mara / concealed motive',
								pattern:
									/using (?:her|mara)|use mara|private|conceal|motive|secret agenda/
							}
						]);
					}
				},
				{
					// Server-floor regression checkpoint: these facts are also
					// guaranteed by the deterministic Author-canon augmentation, so
					// this asserts the shipped preservation feature end-to-end. The
					// model-authored checkpoint above covers the model's own share.
					name: 'chapter and part structure stayed current',
					check: (_turn, _ctx, seed) => {
						const candidates = storyDocs(docsFrom(seed, 'turn3Docs'));
						requireFacts('chapter structure', combinedContent(candidates), [
							{ label: 'Chapter 4', pattern: /chapter 4/ },
							{
								label: 'Ilyan does not report Mara',
								pattern: /not report|doesn.t report|chooses not to report/
							},
							{
								label: 'Mara misreads the choice',
								pattern: /mara.*(loyal|misread)|loyal.*mara/
							},
							{
								label: 'Chapter 5 opens Part II',
								pattern: /chapter 5.*part ii|part ii.*chapter 5/
							},
							{ label: 'Salt Archive motive', pattern: /salt archive/ }
						]);
					}
				},
				{
					name: 'story artifacts use creative-domain document types',
					check: (_turn, _ctx, seed) => {
						const plotDocs = docsFrom(seed, 'turn3Docs').filter((doc) =>
							/(plot|story|chapter|beat|outline)/i.test(doc.title)
						);
						const wrongDomain = plotDocs.filter((doc) =>
							/(product|software|business)/i.test(doc.type_key)
						);
						if (wrongDomain.length > 0) {
							throw new Error(
								`[assert] creative story documents received unrelated type keys: ${wrongDomain
									.map((doc) => `${doc.title}=${doc.type_key}`)
									.join(', ')}`
							);
						}
					}
				},
				{
					name: 'ongoing organization avoided document bloat',
					check: (_turn, _ctx, seed) => {
						const openingCount = docsFrom(seed, 'turn1Docs').length;
						const currentCount = docsFrom(seed, 'turn3Docs').length;
						if (currentCount > openingCount + 2) {
							throw new Error(
								`[assert] two canon additions grew the workspace from ${openingCount} to ${currentCount} documents`
							);
						}
					}
				},
				{
					// Creation-time restraint is checked on turn 1; this extends the
					// same floor across the follow-up turns so a later beat cannot
					// quietly become a milestone or task.
					name: 'later canon turns invented no operational scaffolding',
					check: (_turn, _ctx, seed) => {
						const scaffolding = seed.notes.turn3OperationalScaffolding as Record<
							string,
							unknown[]
						>;
						const invented = Object.entries(scaffolding)
							.filter(([, rows]) => rows.length > 0)
							.map(([kind, rows]) => `${kind}=${rows.length}`);
						if (invented.length > 0) {
							throw new Error(
								`[assert] follow-up canon turns created unrequested operational scaffolding: ${invented.join(', ')}`
							);
						}
					}
				}
			]
		},
		{
			label: 'Cold-session story guidance from durable canon',
			contextType: 'project',
			coldSession: true,
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`I'm at the end of chapter 4. What should happen with Ilyan in chapter 5? Give me three ` +
				`distinct options and explain how each one moves his character arc without breaking what ` +
				`we've already established. Don't choose one for me yet.`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertCleanText(turn);
				assertNonEmptyAssistantText(turn, 180);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
				seed.notes.afterAdviceDocs = excludeSystemDocuments(
					await listDocuments(ctx.db.admin, seed.projectId!)
				);
			},
			checkpoints: [
				{
					name: 'options remained proposals rather than new canon',
					check: (turn, _ctx, seed) => {
						assertNoMutations(
							turn,
							'the user asked for options and explicitly did not choose one'
						);
						const after = documentFingerprint(docsFrom(seed, 'afterAdviceDocs'));
						if (after !== seed.notes.beforeAdviceFingerprint) {
							throw new Error(
								'[assert] durable book documents changed while the user was only comparing options'
							);
						}
					}
				},
				{
					name: 'cold chat read both character and story canon',
					check: (turn, _ctx, seed) => {
						assertAnyToolCalled(turn, [
							'get_onto_document_details',
							'get_document_outline',
							'read_document_section'
						]);
						const readIds = documentIdsRead(turn);
						const ilyan = assertOneNamedCharacterDoc(
							docsFrom(seed, 'turn3Docs'),
							'Ilyan'
						);
						const storyIds = new Set(
							storyDocs(docsFrom(seed, 'turn3Docs')).map((doc) => doc.id)
						);
						if (
							!readIds.has(ilyan.id) ||
							![...readIds].some((id) => storyIds.has(id))
						) {
							throw new Error(
								`[assert] cold turn read document ids [${[...readIds].join(', ')}]; expected ` +
									`Ilyan sheet ${ilyan.id} and at least one story/structure document`
							);
						}
					}
				},
				{
					name: 'three grounded character-arc options',
					check: (turn) => {
						// The request says exactly three — a 1-option card with three
						// field bullets or a 5-option sprawl must both fail.
						assertExactVisiblyLabeledOptions(turn, 3);
						const text = normalizeComparableText(turn.assistantText);
						// The user already supplied the chapter scope. Requiring the answer
						// to parrot "Chapter 5" rejects otherwise direct, grounded options;
						// the named character plus the canon signals below measure whether
						// the response actually answered the scoped request.
						if (!text.includes('ilyan')) {
							throw new Error('[assert] guidance did not center Ilyan');
						}
						const groundingSignals = [
							/mara/,
							/salt archive/,
							/brother/,
							/brass whistle/,
							/procedur|regulation|customs/,
							/using her|use mara|hidden motive|conceal/
						];
						const grounded = groundingSignals.filter((pattern) =>
							pattern.test(text)
						).length;
						if (grounded < 4) {
							throw new Error(
								`[assert] options used ${grounded}/6 established Ilyan/plot signals; expected at least 4`
							);
						}
					}
				}
			]
		}
	]
};
