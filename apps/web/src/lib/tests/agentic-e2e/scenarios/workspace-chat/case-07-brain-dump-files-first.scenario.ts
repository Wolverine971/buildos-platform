// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/case-07-brain-dump-files-first.scenario.ts
//
// Workspace chat case 7 — a spoken brain dump is filed first, and the chat can show where
// each phrase went (tasker/157). Modelled on a real global turn (2026-11-08): context about
// one project's week plus errands. That turn got no project context, ran five web lookups
// nobody asked for, saved nothing and asked where to file one task.
//
// Turn 1 (brain dump): context about the bakery's week, one to-do for the bakery, one for
// the community garden, and a "call the airline" errand that fits no project.
// Turn 2 (follow-up, same chat): move a seeded task's due date and mark it in progress.
//
// Hard assertions (stop the case): the three items were saved in this turn, each in its home
// (bakery, garden, Workspace); no web research; no "where should this go?" question; the
// follow-up changed the task row.
// Checkpoints (the next turn still runs; any miss fails the case at the end): the finder
// marked the message as a capture and picked the bakery; every write carries the user's
// words and they are found in the message; the injected context is stored and matches its
// hash; the update shows before → after.
// The judge reads only the reply's wording. Timing, spend and the finder's save score are
// kept in `seed.notes.case07`, which lands in each turn's evidence file.
//
// Finding a saved row by one distinctive word from the item ("mulch") is a test oracle over
// stored rows, like the reference codes in cases 1 and 6. It never reads the reply, and a
// miss fails loudly with the rows it saw.
import { locateSourceQuote } from '@buildos/shared-types';
import type {
	Scenario,
	ScenarioContext,
	SeedResult,
	TurnCheckpoint,
	TurnResult
} from '../../harness/types';
import {
	assertIsoDate,
	assertNonEmptyAssistantText,
	assertTaskState,
	assertToolNotCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript,
	excludeSystemDocuments,
	mutatingToolCalls,
	researchToolCalls
} from '../../harness/assertions';
import { harnessProjectName, seedProject, teardownProject } from '../../harness/seed';
import {
	getContextInjectionRecord,
	getToolExecutions,
	getTurnEvents,
	getTurnRun,
	listDocuments,
	listTasks,
	waitForTurnRun,
	waitForUsageSummary,
	type ToolExecutionRow
} from '../../harness/telemetry';
import { assertWorkerLaneOnly, includesNormalized, requireStreamRunId } from '../cedar-house/guards';
import {
	assertNoCardBypass,
	assertNoNewProjects,
	bakeryProjectName,
	fixtureProjectSpec,
	harnessCivilDate,
	listOwnedProjectIds,
	readableDate,
	seedWorkspaceCase,
	teardownWorkspaceCase,
	type WorkspaceSeed
} from './fixture';
import { buildBrainDumpRubric } from './rubrics';

const CLARIFICATION_TOOL = 'request_turn_clarification';
const UPDATE_TASK_TOOL = 'update_onto_task';

export const GARDEN_PROJECT_LABEL = 'Elm Street Community Garden';
const GARDEN_DESCRIPTION =
	'Synthetic QA project: starting a neighborhood community garden on Elm Street. ' +
	'Raised beds, volunteer work crews, a city greening grant.';

const LEASE_TASK = 'Sign the bakery lease';
const OVEN_TASK = 'Order the deck oven';
const CREWS_TASK = 'Recruit Saturday work crews';
const GRANT_TASK = 'Apply for the city greening grant';

/** New York civil days, fixed when the module loads so the seed and the message agree. */
const OVEN_DUE = harnessCivilDate(3);
const OVEN_NEW_DUE = harnessCivilDate(10);

type HomeKey = 'bakery' | 'garden' | 'workspace';

/** The three things to do, the words that carry each, and where each belongs. */
const ITEMS: ReadonlyArray<{ key: string; phrase: string; token: string; home: HomeKey }> = [
	{
		key: 'inspection',
		phrase: 'I need to book the health inspection before opening week',
		token: 'inspection',
		home: 'bakery'
	},
	{
		key: 'mulch',
		phrase: 'I need to order mulch for the raised beds',
		token: 'mulch',
		home: 'garden'
	},
	{
		key: 'refund',
		phrase: 'I need to call Delta Airlines and get a refund for my checked bag',
		token: 'refund',
		home: 'workspace'
	}
];

export const CASE_07_BRAIN_DUMP =
	"This week I'm in Portland for the bakery launch. I'm at the Harbor Street space doing " +
	'the equipment walkthrough and tasting the opening-week menu. I just got in, and I fly ' +
	`home Friday. For the bakery, ${ITEMS[0]!.phrase}. For the community garden, ` +
	`${ITEMS[1]!.phrase}. And separate from all of that, ${ITEMS[2]!.phrase}, because I ended ` +
	'up with two checked bags and no carry-on.';

export const CASE_07_FOLLOW_UP =
	`Also, push the deck oven order to ${readableDate(OVEN_NEW_DUE)} and mark it in progress.`;

type Case07Seed = WorkspaceSeed & {
	notes: WorkspaceSeed['notes'] & {
		gardenProjectId: string;
		gardenProjectName: string;
		/** Every task and document id in the three homes right after seeding. */
		baselineIds: string[];
		case07: Record<string, unknown>;
	};
};

interface SavedRecord {
	home: HomeKey;
	kind: 'task' | 'note';
	id: string;
	title: string;
	text: string;
}

function homes(seed: Case07Seed): Array<{ key: HomeKey; id: string; label: string }> {
	return [
		{ key: 'bakery', id: seed.projectId, label: 'the Harbor Bakery Launch project' },
		{
			key: 'garden',
			id: seed.notes.gardenProjectId,
			label: 'the Elm Street Community Garden project'
		},
		{ key: 'workspace', id: seed.notes.workspaceId, label: 'the Workspace' }
	];
}

async function readHomes(ctx: ScenarioContext, seed: Case07Seed): Promise<SavedRecord[]> {
	const rows: SavedRecord[] = [];
	for (const home of homes(seed)) {
		const [tasks, docs] = await Promise.all([
			listTasks(ctx.db.admin, home.id),
			listDocuments(ctx.db.admin, home.id)
		]);
		for (const task of tasks) {
			rows.push({
				home: home.key,
				kind: 'task',
				id: task.id.toLowerCase(),
				title: task.title,
				text: `${task.title}\n${task.description ?? ''}`
			});
		}
		for (const doc of excludeSystemDocuments(docs)) {
			rows.push({
				home: home.key,
				kind: 'note',
				id: doc.id.toLowerCase(),
				title: doc.title,
				text: `${doc.title}\n${doc.content ?? ''}`
			});
		}
	}
	return rows;
}

/** Rows that exist now and did not right after seeding: what the chat saved. */
async function savedThisCase(ctx: ScenarioContext, seed: Case07Seed): Promise<SavedRecord[]> {
	const baseline = new Set(seed.notes.baselineIds);
	return (await readHomes(ctx, seed)).filter((row) => !baseline.has(row.id));
}

function describeSaved(rows: readonly SavedRecord[]): string {
	return rows.map((row) => `${row.kind} "${row.title}" in ${row.home}`).join('; ') || '(nothing)';
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function note(seed: Case07Seed, turnKey: string): Record<string, unknown> {
	const all = seed.notes.case07;
	const existing = asRecord(all[turnKey]);
	if (existing) return existing;
	const created: Record<string, unknown> = {};
	all[turnKey] = created;
	return created;
}

/**
 * Timing, spend and the finder's answers for one turn. Kept in the seed notes, which the
 * runner writes into the turn's evidence file. Never fails the case.
 */
async function recordEvidence(
	turn: TurnResult,
	ctx: ScenarioContext,
	seed: Case07Seed,
	turnKey: string
): Promise<void> {
	const record = note(seed, turnKey);
	try {
		record.seconds =
			typeof turn.timing.totalDurationMs === 'number'
				? Math.round(turn.timing.totalDurationMs / 100) / 10
				: null;
		record.tools = turn.toolCalls.map((call) => call.function.name);
		if (!turn.streamRunId) return;
		const usage = await waitForUsageSummary(ctx.db.admin, turn.streamRunId);
		record.modelUsd = Number(usage.totalCostUsd.toFixed(5));
		record.modelCalls = usage.requestCount;
		record.models = usage.models;
		const selection = (
			await getTurnEvents(ctx.db.admin, turn.streamRunId, 'context_selection')
		).at(-1)?.payload;
		const workspace = asRecord(selection?.workspace);
		record.finder = selection
			? {
					status: selection.status ?? null,
					injected: selection.injected ?? null,
					scope: workspace?.scope ?? null,
					capture: workspace?.capture ?? null,
					save_p: workspace?.save_p ?? null,
					dig_p: workspace?.dig_p ?? null,
					projects: Array.isArray(selection.projects)
						? selection.projects.map((project) => {
								const entry = asRecord(project);
								return { id: entry?.id ?? null, name: entry?.name ?? null, p: entry?.p ?? null };
							})
						: [],
					injection: selection.injection ?? null,
					elapsed_ms: selection.elapsed_ms ?? null
				}
			: null;
	} catch (error) {
		record.evidenceError = error instanceof Error ? error.message : String(error);
	}
}

interface WriteCall {
	toolName: string;
	toolCallId: string | null;
	quote: string | null;
	execution: ToolExecutionRow | null;
}

/** This turn's write calls, each with the words the model said it came from. */
async function writeCalls(turn: TurnResult, ctx: ScenarioContext): Promise<WriteCall[]> {
	const streamRunId = requireStreamRunId(turn);
	const writeNames = new Set(mutatingToolCalls(turn));
	const [events, executions] = await Promise.all([
		getTurnEvents(ctx.db.admin, streamRunId, 'tool_call'),
		getToolExecutions(ctx.db.admin, streamRunId)
	]);
	const calls: WriteCall[] = [];
	for (const event of events) {
		const call = asRecord(event.payload.tool_call);
		const toolName = String(asRecord(call?.function)?.name ?? '');
		if (!writeNames.has(toolName)) continue;
		const toolCallId = typeof call?.id === 'string' ? call.id : null;
		const quote = event.payload.source_quote;
		calls.push({
			toolName,
			toolCallId,
			quote: typeof quote === 'string' && quote.trim() ? quote : null,
			execution:
				executions.find(
					(row) => toolCallId !== null && row.provider_tool_call_id === toolCallId
				) ?? null
		});
	}
	return calls;
}

function storedQuote(execution: ToolExecutionRow | null): string | null {
	const first = asRecord(execution?.affected_entities[0]);
	return typeof first?.source_quote === 'string' && first.source_quote.trim()
		? first.source_quote
		: null;
}

/** Every write names the user's words, and those words are in `message`. */
function sourceQuoteCheckpoint(message: string, turnKey: string): TurnCheckpoint {
	return {
		name: "every write carries the user's words, found in the message",
		check: async (turn, ctx, rawSeed) => {
			const calls = await writeCalls(turn, ctx);
			note(rawSeed as Case07Seed, turnKey).quotes = calls.map((call) => ({
				tool: call.toolName,
				quote: call.quote,
				found: call.quote ? locateSourceQuote(message, call.quote)?.match ?? null : null,
				stored: storedQuote(call.execution)
			}));
			if (!calls.length) throw new Error('the turn has no stored write call to check');
			const problems: string[] = [];
			for (const call of calls) {
				if (!call.quote) {
					problems.push(`${call.toolName}: the tool_call event has no source_quote`);
					continue;
				}
				if (!locateSourceQuote(message, call.quote)) {
					problems.push(
						`${call.toolName}: quote "${call.quote.slice(0, 120)}" is not in the message`
					);
				}
				// A change waiting on the person's choice touched nothing, so it stores no quote.
				if (call.execution?.affected_entities.length && !storedQuote(call.execution)) {
					problems.push(
						`${call.toolName}: the stored execution has no affected_entities[0].source_quote`
					);
				}
			}
			if (problems.length) throw new Error(problems.join('; '));
		}
	};
}

/**
 * The exact text the finder added is filed on the turn's prompt snapshot and matches the
 * hash the chat was sent. `requireInjected` is the brain dump: its homes must have gone in.
 * Otherwise the stored record only has to agree with the event.
 */
function injectionRecordCheckpoint(requireInjected: boolean): TurnCheckpoint {
	return {
		name: 'the injected context is stored on the prompt snapshot and matches its hash',
		check: async (turn, ctx) => {
			const streamRunId = requireStreamRunId(turn);
			const selection = (
				await getTurnEvents(ctx.db.admin, streamRunId, 'context_selection')
			).at(-1)?.payload;
			const eventInjection = asRecord(selection?.injection);
			const injected =
				selection?.injected === true && typeof eventInjection?.sha256 === 'string';
			if (requireInjected && !injected) {
				throw new Error(
					'the context_selection event reports no injection ' +
						`(${JSON.stringify({ injected: selection?.injected, injection: selection?.injection })})`
				);
			}
			const turnRun = await getTurnRun(ctx.db.admin, streamRunId);
			if (!turnRun) throw new Error('the turn run row is missing');
			const record = await getContextInjectionRecord(ctx.db.admin, turnRun.id, {
				timeoutMs: injected ? 8_000 : 2_000
			});
			if (!injected) {
				if (record?.injected === true) {
					throw new Error('the snapshot stores an injection the event does not report');
				}
				return;
			}
			if (!record) {
				throw new Error('chat_prompt_snapshots has no prompt_sections.context_injection');
			}
			if (record.injected !== true || record.sha256 !== eventInjection?.sha256) {
				throw new Error(
					`stored record injected=${String(record.injected)} sha256=${String(record.sha256)}; ` +
						`the event says ${String(eventInjection?.sha256)}`
				);
			}
		}
	};
}

/** `field_changes` wherever the receipt nested it. */
function fieldChanges(value: unknown, depth = 0): Array<Record<string, unknown>> {
	const record = asRecord(value);
	if (!record || depth > 3) return [];
	if (Array.isArray(record.field_changes)) {
		return record.field_changes
			.map((entry) => asRecord(entry))
			.filter((entry): entry is Record<string, unknown> => entry !== null);
	}
	return [...fieldChanges(record.result, depth + 1), ...fieldChanges(record.data, depth + 1)];
}

export const workspaceCase07BrainDumpFilesFirstScenario: Scenario = {
	id: 'workspace-07-brain-dump-files-first',
	title: 'Workspace 7 — a brain dump is filed first, each item in its home',
	category: 'workspace-chat',
	batteryCase: 7,
	timeoutMs: 600_000,
	requiredMutationTools: ['create_onto_task', UPDATE_TASK_TOOL],
	seed: async (ctx) => {
		const seed = (await seedWorkspaceCase(ctx, {
			projectName: bakeryProjectName(),
			projectTasks: [
				{ slug: 'lease', title: LEASE_TASK },
				{ slug: 'oven', title: OVEN_TASK, dueDate: OVEN_DUE }
			]
		})) as Case07Seed;
		const gardenProjectName = harnessProjectName(GARDEN_PROJECT_LABEL);
		const { projectId: gardenProjectId } = await seedProject(
			ctx,
			fixtureProjectSpec({
				name: gardenProjectName,
				typeKey: 'project.service.construction',
				description: GARDEN_DESCRIPTION,
				tasks: [
					{ slug: 'crews', title: CREWS_TASK },
					{ slug: 'grant', title: GRANT_TASK }
				]
			})
		);
		seed.notes.gardenProjectId = gardenProjectId;
		seed.notes.gardenProjectName = gardenProjectName;
		// The second project is seeded, not created by the chat.
		seed.notes.projectIdsBefore = await listOwnedProjectIds(ctx);
		seed.notes.case07 = { dates: { ovenDue: OVEN_DUE, ovenNewDue: OVEN_NEW_DUE } };
		seed.notes.baselineIds = (await readHomes(ctx, seed)).map((row) => row.id);
		return seed;
	},
	teardown: async (ctx, seed) => {
		const gardenProjectId = (seed.notes as Partial<Case07Seed['notes']>).gardenProjectId;
		await teardownProject(ctx.db, gardenProjectId);
		await teardownWorkspaceCase(ctx, seed);
	},
	turns: [
		{
			label: 'brain dump',
			contextType: 'global',
			message: CASE_07_BRAIN_DUMP,
			assert: async (turn, ctx, rawSeed: SeedResult) => {
				const seed = rawSeed as Case07Seed;
				assertTurnSucceeded(turn);
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);
				await recordEvidence(turn, ctx, seed, 'turn1');
				assertNonEmptyAssistantText(turn, 10);

				const research = researchToolCalls(turn);
				if (research.length) {
					throw new Error(
						`[assert] nobody asked for a lookup, but the agent called [${research.join(', ')}]`
					);
				}
				assertToolNotCalled(turn, CLARIFICATION_TOOL);
				assertNoCardBypass(turn);

				const saved = await savedThisCase(ctx, seed);
				note(seed, 'turn1').saved = saved.map(({ home, kind, title }) => ({
					home,
					kind,
					title
				}));
				const problems: string[] = [];
				for (const item of ITEMS) {
					const carriers = saved.filter((row) => includesNormalized(row.text, item.token));
					if (!carriers.some((row) => row.home === item.home)) {
						problems.push(`the ${item.key} item was not saved in ${item.home}`);
					}
					const misfiled = carriers.filter((row) => row.home !== item.home);
					if (misfiled.length) {
						problems.push(
							`the ${item.key} item also landed in ${misfiled.map((row) => row.home).join(', ')}`
						);
					}
				}
				if (problems.length) {
					throw new Error(
						`[assert] ${problems.join('; ')}. Saved this turn: ${describeSaved(saved)}`
					);
				}

				await assertNoNewProjects(ctx, seed);
				await assertWorkerLaneOnly(turn, ctx);
			},
			checkpoints: [
				{
					name: 'the finder marked the message as a capture and picked the bakery',
					check: async (turn, ctx, rawSeed) => {
						const seed = rawSeed as Case07Seed;
						const selection = (
							await getTurnEvents(
								ctx.db.admin,
								requireStreamRunId(turn),
								'context_selection'
							)
						).at(-1)?.payload;
						const workspace = asRecord(selection?.workspace);
						const projectIds = Array.isArray(selection?.projects)
							? selection.projects.map((project) =>
									String(asRecord(project)?.id ?? '').toLowerCase()
								)
							: [];
						const problems: string[] = [];
						if (workspace?.capture !== true) problems.push('workspace.capture is not true');
						if (typeof workspace?.save_p !== 'number')
							problems.push('workspace.save_p is not a number');
						if (!projectIds.includes(seed.projectId.toLowerCase()))
							problems.push('projects does not include the bakery');
						if (problems.length) {
							throw new Error(
								`${problems.join('; ')} (${JSON.stringify({ workspace, projectIds })})`
							);
						}
					}
				},
				sourceQuoteCheckpoint(CASE_07_BRAIN_DUMP, 'turn1'),
				injectionRecordCheckpoint(true)
			],
			judge: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as Case07Seed;
				const labels = new Map(homes(seed).map((home) => [home.key, home.label]));
				const saved = (await savedThisCase(ctx, seed)).map((row) => ({
					kind: row.kind,
					title: row.title,
					home: labels.get(row.home) ?? row.home
				}));
				return {
					rubric: buildBrainDumpRubric({
						saved,
						lookupTopic: "the airline's checked-bag refund"
					}),
					threshold: 3,
					transcript: buildTranscript(turn, { saved })
				};
			}
		},
		{
			label: 'follow-up update',
			contextType: 'global',
			message: CASE_07_FOLLOW_UP,
			assert: async (turn, ctx, rawSeed: SeedResult) => {
				const seed = rawSeed as Case07Seed;
				assertTurnSucceeded(turn);
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);
				await recordEvidence(turn, ctx, seed, 'turn2');
				assertNonEmptyAssistantText(turn, 10);
				assertToolNotCalled(turn, CLARIFICATION_TOOL);

				const ovenId = seed.entityIds.oven!;
				const oven = (await listTasks(ctx.db.admin, seed.projectId)).find(
					(task) => task.id.toLowerCase() === ovenId
				);
				if (!oven) throw new Error(`[assert] "${OVEN_TASK}" is no longer in the bakery project`);
				assertTaskState(oven.state_key, 'in_progress', `"${OVEN_TASK}"`);
				assertIsoDate(oven.due_at, OVEN_NEW_DUE, `"${OVEN_TASK}" due`);

				await assertNoNewProjects(ctx, seed);
				await assertWorkerLaneOnly(turn, ctx);
			},
			checkpoints: [
				{
					name: 'the update reports what it touched, with before → after',
					check: async (turn, ctx, rawSeed) => {
						const seed = rawSeed as Case07Seed;
						const ovenId = seed.entityIds.oven!;
						const updates = (
							await getToolExecutions(ctx.db.admin, requireStreamRunId(turn))
						).filter(
							(row) =>
								row.tool_name === UPDATE_TASK_TOOL &&
								row.success &&
								row.affected_entities.some(
									(entity) => String(entity.id ?? '').toLowerCase() === ovenId
								)
						);
						if (!updates.length) {
							throw new Error(
								`no successful ${UPDATE_TASK_TOOL} names "${OVEN_TASK}" in affected_entities`
							);
						}
						const changes = updates.flatMap((row) => fieldChanges(row.result));
						note(seed, 'turn2').fieldChanges = changes;
						const problems: string[] = [];
						for (const field of ['due_at', 'state_key']) {
							const change = changes.find((entry) => entry.field === field);
							if (!change) problems.push(`field_changes has no ${field}`);
							else if (change.before === change.after)
								problems.push(`${field} shows the same value before and after`);
						}
						const touched = updates
							.flatMap((row) => row.affected_entities)
							.find((entity) => String(entity.id ?? '').toLowerCase() === ovenId);
						if (touched?.kind !== 'task' || touched.operation !== 'updated') {
							problems.push(
								`affected entity is ${String(touched?.kind)}/${String(touched?.operation)}, not task/updated`
							);
						}
						if (problems.length) {
							throw new Error(`${problems.join('; ')} (${JSON.stringify(changes)})`);
						}
					}
				},
				sourceQuoteCheckpoint(CASE_07_FOLLOW_UP, 'turn2'),
				injectionRecordCheckpoint(false)
			]
		}
	]
};
