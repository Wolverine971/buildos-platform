// apps/web/src/lib/tests/agentic-e2e/scenarios/project-create-contract.scenario.ts
// Worker regression for reviewed-batch project creation.
//
// This reproduces PC1 with an isolated, sweepable project name. It verifies the
// independent batch review, bounded shell adapter, durable context shift,
// requested goal/tasks, and a follow-up mutation in the newly created project.
//
// The scenario id keeps its historical "contract" name; the write lane it now
// proves is the mutation batch lane. `create_onto_project` is contract_required
// in the worker's mutation catalog, so the acting model's proposed call is held,
// the independent reviewer approves the exact batch with
// `approve_mutation_batch_review`, and only then does the worker execute it. The
// goal and tasks follow in later reviewed stages using the returned project id.
import { APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME } from '@buildos/agentic-chat-runtime/catalog';
import type { ToolExecutionRow } from '../harness/telemetry';
import type { Scenario, SeedResult, TurnResult } from '../harness/types';
import { harnessProjectName, teardownProject } from '../harness/seed';
import {
	assertCleanText,
	assertToolCalled,
	assertToolNotCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../harness/assertions';
import {
	getToolExecutions,
	listDocuments,
	listGoals,
	listProjectsByExactName,
	listTasks,
	waitForTurnRun
} from '../harness/telemetry';

const PROJECT_NAME = harnessProjectName('Project Create Contract');
const GOAL_DATE = '2026-09-15';
const INITIAL_TASK_PATTERNS = [
	/define.*show.*format/i,
	/book.*(?:first\s*)?(?:3|three).*guests?/i,
	/record.*trailer/i
];
const FOLLOWUP_TASK_PATTERN = /research.*distribution.*channels?/i;

function requireStreamRunId(turn: TurnResult): string {
	if (!turn.streamRunId) throw new Error('[assert] turn did not expose a stream_run_id');
	return turn.streamRunId;
}

function requireSuccessfulExecutions(
	executions: ToolExecutionRow[],
	toolName: string,
	expectedCount: number
): void {
	const matching = executions.filter((execution) => execution.tool_name === toolName);
	if (matching.length !== expectedCount) {
		throw new Error(
			`[assert] expected exactly ${expectedCount} ${toolName} execution(s), found ${matching.length}`
		);
	}
	const failed = matching.filter((execution) => !execution.success);
	if (failed.length > 0) {
		throw new Error(
			`[assert] ${failed.length} ${toolName} execution(s) failed: ${failed
				.map((execution) => JSON.stringify(execution.result))
				.join(' | ')}`
		);
	}
}

/**
 * The first successful `toolName` execution ran after a successful batch
 * approval in the same turn. Durable sequence order proves the write went
 * through independent review instead of the direct lane.
 */
function requireApprovedBeforeExecution(executions: ToolExecutionRow[], toolName: string): void {
	const executed = executions.find(
		(execution) => execution.tool_name === toolName && execution.success
	);
	if (!executed || executed.sequence_index === null) {
		throw new Error(`[assert] no sequenced successful ${toolName} execution was persisted`);
	}
	const approvedBefore = executions.some(
		(execution) =>
			execution.tool_name === APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME &&
			execution.success &&
			execution.sequence_index !== null &&
			execution.sequence_index < executed.sequence_index!
	);
	if (!approvedBefore) {
		throw new Error(
			`[assert] ${toolName} executed without a prior ${APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME}; ` +
				`executions: [${executions
					.map((execution) => `${execution.sequence_index}:${execution.tool_name}`)
					.join(', ')}]`
		);
	}
}

function assertNoRedundantConfirmation(turn: TurnResult): void {
	const clarificationEvents = turn.rawEvents.filter(
		(event) => event.type === 'clarifying_questions'
	);
	if (clarificationEvents.length > 0) {
		throw new Error('[assert] fully specified project creation emitted clarifying questions');
	}
	const confirmationPatterns = [
		/\bmay i (?:proceed|create|go ahead)\b/i,
		/\bshall i (?:proceed|create|go ahead)\b/i,
		/\bplease confirm\b/i,
		/\b(?:do|would) you (?:want|like) me to (?:proceed|create|go ahead)\b/i
	];
	const matched = confirmationPatterns.find((pattern) => pattern.test(turn.assistantText));
	if (matched) {
		throw new Error(
			`[assert] fully specified project creation asked for redundant confirmation: "${turn.assistantText.slice(0, 400)}"`
		);
	}
}

function assertProjectContextShift(turn: TurnResult, projectId: string): void {
	const shift = turn.rawEvents.find((event) => {
		if (event.type !== 'context_shift') return false;
		const payload = event.context_shift;
		return (
			payload !== null &&
			typeof payload === 'object' &&
			!Array.isArray(payload) &&
			(payload as Record<string, unknown>).new_context === 'project' &&
			(payload as Record<string, unknown>).entity_id === projectId
		);
	});
	if (!shift) {
		throw new Error(`[assert] no project context_shift targeted created project ${projectId}`);
	}
}

function taskMatches(title: string, pattern: RegExp): boolean {
	return pattern.test(title);
}

async function requireExactCreatedProject(
	ctx: Parameters<NonNullable<Scenario['seed']>>[0]
): Promise<string> {
	const projects = await listProjectsByExactName(ctx.db.admin, ctx.db.actorId, PROJECT_NAME);
	if (projects.length !== 1) {
		throw new Error(
			`[assert] expected exactly one project named "${PROJECT_NAME}", found ${projects.length}`
		);
	}
	return projects[0]!.id;
}

async function assertRequestedProjectStructure(
	ctx: Parameters<NonNullable<Scenario['seed']>>[0],
	projectId: string
): Promise<{ taskIds: string[] }> {
	const [documents, goals, tasks] = await Promise.all([
		listDocuments(ctx.db.admin, projectId),
		listGoals(ctx.db.admin, projectId),
		listTasks(ctx.db.admin, projectId)
	]);
	const contextDocument = documents.find(
		(document) =>
			document.type_key === 'document.context.project' &&
			document.title === `${PROJECT_NAME} Context Document`
	);
	if (!contextDocument) {
		throw new Error('[assert] created project is missing its generated Context document');
	}

	if (goals.length !== 1) {
		throw new Error(`[assert] expected one requested goal, found ${goals.length}`);
	}
	const goal = goals[0]!;
	if (!/publish.*(?:first\s*)?(?:3|three).*podcast.*episodes?/i.test(goal.name)) {
		throw new Error(
			`[assert] project goal did not preserve the requested outcome: "${goal.name}"`
		);
	}
	if (goal.target_date?.slice(0, 10) !== GOAL_DATE) {
		throw new Error(
			`[assert] project goal target date was ${goal.target_date ?? 'missing'}, expected ${GOAL_DATE}`
		);
	}

	if (tasks.length !== INITIAL_TASK_PATTERNS.length) {
		throw new Error(
			`[assert] expected exactly ${INITIAL_TASK_PATTERNS.length} requested tasks, found ${tasks.length}: ` +
				`[${tasks.map((task) => task.title).join(', ')}]`
		);
	}
	for (const pattern of INITIAL_TASK_PATTERNS) {
		if (!tasks.some((task) => taskMatches(task.title, pattern))) {
			throw new Error(
				`[assert] requested task ${pattern} was not persisted. Titles: [${tasks
					.map((task) => task.title)
					.join(', ')}]`
			);
		}
	}
	return { taskIds: tasks.map((task) => task.id) };
}

export const projectCreateContractScenario: Scenario = {
	id: 'project-create-contract',
	title: 'Create a fully specified project through an independently reviewed batch',
	category: 'project',
	timeoutMs: 720_000,
	requiredMutationTools: ['create_onto_project', 'create_onto_goal', 'create_onto_task'],
	seed: async (): Promise<SeedResult> => ({ entityIds: {}, notes: {} }),
	teardown: async (ctx, seed) => {
		// Capture failures and duplicate creates without widening deletion beyond
		// this run's exact name and actor.
		const projects = await listProjectsByExactName(ctx.db.admin, ctx.db.actorId, PROJECT_NAME);
		for (const project of projects) {
			if (project.id !== seed.projectId) await teardownProject(ctx.db, project.id);
		}
	},
	turns: [
		{
			label: 'create the project and requested initial structure',
			contextType: 'project_create',
			message:
				`Create a project called ${PROJECT_NAME}. The goal is to publish the first 3 podcast ` +
				`episodes by September 15, 2026. Tasks I already know about: define the show format, ` +
				`book the first 3 guests, and record the trailer.`,
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertCleanText(turn);
				assertNoRedundantConfirmation(turn);
				assertToolCalled(turn, APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME);
				assertToolCalled(turn, 'create_onto_project');

				const streamRunId = requireStreamRunId(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, streamRunId));
				const executions = await getToolExecutions(ctx.db.admin, streamRunId);
				requireSuccessfulExecutions(executions, 'create_onto_project', 1);
				requireApprovedBeforeExecution(executions, 'create_onto_project');
				requireSuccessfulExecutions(executions, 'create_onto_goal', 1);
				requireSuccessfulExecutions(executions, 'create_onto_task', 3);

				const projectId = await requireExactCreatedProject(ctx);
				seed.projectId = projectId;
				assertProjectContextShift(turn, projectId);
				const structure = await assertRequestedProjectStructure(ctx, projectId);
				seed.notes.initialTaskIds = structure.taskIds;

				if (!turn.sessionId)
					throw new Error('[assert] project-create turn lost its session id');
				const { data: session, error } = await ctx.db.admin
					.from('chat_sessions')
					.select('context_type, entity_id')
					.eq('id', turn.sessionId)
					.eq('user_id', ctx.db.userId)
					.single();
				if (error || !session) {
					throw new Error(
						`[assert] failed to read shifted session: ${error?.message ?? 'missing row'}`
					);
				}
				if (session.context_type !== 'project' || session.entity_id !== projectId) {
					throw new Error(
						`[assert] session context was ${session.context_type}/${session.entity_id}, expected project/${projectId}`
					);
				}
			},
			evidenceChecks: [
				{
					name: 'stream-health',
					category: 'transport',
					check: (turn) => assertTurnSucceeded(turn)
				},
				{
					name: 'batch-approved-before-project-create',
					category: 'contract',
					check: async (turn, ctx) => {
						assertToolCalled(turn, APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME);
						requireApprovedBeforeExecution(
							await getToolExecutions(ctx.db.admin, requireStreamRunId(turn)),
							'create_onto_project'
						);
					}
				},
				{
					name: 'project-create-executed-once',
					category: 'mutation',
					check: async (turn, ctx) => {
						requireSuccessfulExecutions(
							await getToolExecutions(ctx.db.admin, requireStreamRunId(turn)),
							'create_onto_project',
							1
						);
					}
				},
				{
					name: 'project-and-structure-persisted',
					category: 'effect',
					check: async (_turn, ctx) => {
						await assertRequestedProjectStructure(
							ctx,
							await requireExactCreatedProject(ctx)
						);
					}
				},
				{
					name: 'context-shift-emitted',
					category: 'effect',
					check: async (turn, ctx) => {
						assertProjectContextShift(turn, await requireExactCreatedProject(ctx));
					}
				},
				{
					name: 'no-redundant-confirmation',
					category: 'collateral',
					check: (turn) => assertNoRedundantConfirmation(turn)
				}
			]
		},
		{
			label: 'continue inside the newly created project',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message: 'Add one more task to research distribution channels.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertCleanText(turn);
				assertToolNotCalled(turn, 'create_onto_project');
				// One explicitly named new task inside the durable focused project is
				// the bounded direct-write lane (write-routing.ts: a new_entity create
				// scoped to the focused project). Requiring review here would test
				// against the worker's routing and add avoidable reviewer latency.
				assertToolNotCalled(turn, APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME);
				assertToolCalled(turn, 'create_onto_task');

				const streamRunId = requireStreamRunId(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, streamRunId));
				requireSuccessfulExecutions(
					await getToolExecutions(ctx.db.admin, streamRunId),
					'create_onto_task',
					1
				);

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				const initialTaskIds = new Set(seed.notes.initialTaskIds as string[]);
				const created = tasks.filter((task) => !initialTaskIds.has(task.id));
				if (
					created.length !== 1 ||
					!taskMatches(created[0]?.title ?? '', FOLLOWUP_TASK_PATTERN)
				) {
					throw new Error(
						`[assert] follow-up was not grounded as one distribution-research task in the new project. ` +
							`New titles: [${created.map((task) => task.title).join(', ')}]`
					);
				}
				await requireExactCreatedProject(ctx);
			},
			evidenceChecks: [
				{
					name: 'follow-up-stream-health',
					category: 'transport',
					check: (turn) => assertTurnSucceeded(turn)
				},
				{
					name: 'follow-up-used-focused-project-direct-lane',
					category: 'contract',
					check: (turn) => {
						assertToolNotCalled(turn, APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME);
					}
				},
				{
					name: 'follow-up-task-executed',
					category: 'mutation',
					check: async (turn, ctx) => {
						requireSuccessfulExecutions(
							await getToolExecutions(ctx.db.admin, requireStreamRunId(turn)),
							'create_onto_task',
							1
						);
					}
				},
				{
					name: 'follow-up-grounded-in-created-project',
					category: 'effect',
					check: async (_turn, ctx, seed) => {
						const tasks = await listTasks(ctx.db.admin, seed.projectId!);
						if (!tasks.some((task) => taskMatches(task.title, FOLLOWUP_TASK_PATTERN))) {
							throw new Error(
								'distribution-research task is missing from created project'
							);
						}
					}
				},
				{
					name: 'no-duplicate-project',
					category: 'collateral',
					check: async (_turn, ctx) => {
						await requireExactCreatedProject(ctx);
					}
				}
			]
		}
	]
};
