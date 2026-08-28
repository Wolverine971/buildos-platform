// apps/web/src/lib/tests/agentic-e2e/scenarios/task-multi-update.scenario.ts
//
// Tier 1 gap #5: several distinct mutations in ONE turn.
//
// The handoff phrased this as "mark the first two done and push the third," but
// ordinal reference is a different (and more artificial) test than the one DJ
// actually generates. Every real example he gave is a single dictated breath
// covering several pieces of work, each named by content:
//
//   "the task where I was going to talk to this company, just talked to them. It
//    went well... now the next thing is I'm waiting to hear back."
//
// So this scenario is one run-on sentence with three separate operations against
// three separate tasks, plus a fourth task that must survive untouched. The
// failure it catches is partial application — the agent handles the first clause,
// declares success, and silently drops the rest. That reads as a clean turn
// unless something checks all three.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNonEmptyAssistantText,
	assertNumericPriorityAtMost,
	assertOnlyAllowedRowFieldsChanged,
	assertTaskState,
	assertAnyToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript,
	mutatingToolCalls
} from '../harness/assertions';
import { listTasks, waitForTurnRun, type TaskRow } from '../harness/telemetry';

const RESUME_TITLE = 'Update resume with the orchestration work';
const LINKEDIN_TITLE = 'Refresh the LinkedIn headline and about section';
const HALCYON_TITLE = 'Prep system design answers for Halcyon Labs';
const CONTROL_TITLE = 'Write the take-home postmortem';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Multi Update'),
			type_key: 'project.personal.job_search',
			description: 'A job search with several small pieces of work in flight.'
		},
		entities: [
			{
				temp_id: 'resume',
				kind: 'task',
				title: RESUME_TITLE,
				type_key: 'task.default',
				state_key: 'todo'
			},
			{
				temp_id: 'linkedin',
				kind: 'task',
				title: LINKEDIN_TITLE,
				type_key: 'task.default',
				state_key: 'todo'
			},
			{
				temp_id: 'halcyon',
				kind: 'task',
				title: HALCYON_TITLE,
				type_key: 'task.default',
				state_key: 'todo',
				priority: 4
			},
			{
				temp_id: 'control',
				kind: 'task',
				title: CONTROL_TITLE,
				type_key: 'task.default',
				state_key: 'todo'
			}
		],
		relationships: []
	};
}

export const taskMultiUpdateScenario: Scenario = {
	id: 'task-multi-update',
	title: 'Apply three operations from one dictated sentence',
	category: 'task',
	requiredMutationTools: ['update_onto_task'],
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		const tasks = await listTasks(ctx.db.admin, projectId);
		const byTitle = (title: string) => {
			const found = tasks.find((t) => t.title === title);
			if (!found) throw new Error(`[seed] failed to seed "${title}"`);
			return found.id;
		};
		return {
			projectId,
			entityIds: {
				resume: byTitle(RESUME_TITLE),
				linkedin: byTitle(LINKEDIN_TITLE),
				halcyon: byTitle(HALCYON_TITLE),
				control: byTitle(CONTROL_TITLE)
			},
			notes: { seededTaskIds: tasks.map((t) => t.id), seededTasks: tasks }
		};
	},
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			// One breath, three operations, referents given by content not by title.
			message:
				'ok so i knocked out the resume update and the linkedin thing this morning, ' +
				'and the halcyon prep needs to be top priority now, they moved the onsite up',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				const byId = (id: string | undefined, label: string) => {
					const found = tasks.find((t) => t.id === id);
					if (!found) throw new Error(`[assert] the ${label} task vanished`);
					return found;
				};

				// All three clauses must land. Collect every failure before throwing,
				// so one run tells you whether it dropped one clause or all of them —
				// partial application is the whole point of this scenario.
				const failures: string[] = [];

				const resume = byId(seed.entityIds.resume, 'resume');
				if (resume.state_key !== 'done') {
					failures.push(
						`clause 1: "${RESUME_TITLE}" is "${resume.state_key}", expected done`
					);
				}
				const linkedin = byId(seed.entityIds.linkedin, 'linkedin');
				if (linkedin.state_key !== 'done') {
					failures.push(
						`clause 2: "${LINKEDIN_TITLE}" is "${linkedin.state_key}", expected done`
					);
				}
				const halcyon = byId(seed.entityIds.halcyon, 'halcyon');
				if (typeof halcyon.priority !== 'number' || halcyon.priority > 2) {
					failures.push(
						`clause 3: "${HALCYON_TITLE}" priority is ${halcyon.priority ?? 'unset'}, expected 1-2 (seeded at 4)`
					);
				}
				if (failures.length > 0) {
					throw new Error(
						`[assert] ${failures.length} of 3 operations from one sentence did not land:\n  - ` +
							failures.join('\n  - ')
					);
				}
				// Belt and braces on the priority direction (lower number = higher).
				assertNumericPriorityAtMost(halcyon.priority, 2, `"${HALCYON_TITLE}"`);

				const control = byId(seed.entityIds.control, 'control');
				assertTaskState(control.state_key, 'todo', `control task "${CONTROL_TITLE}"`);

				if (ctx.executionMode === 'worker_realtime') {
					if (!turn.sessionId) {
						throw new Error('[assert] worker turn did not expose a chat session ID');
					}
					const expectedActivityEntityIds = new Set([
						seed.entityIds.resume,
						seed.entityIds.linkedin,
						seed.entityIds.halcyon
					]);
					const { data: activityRows, error: activityError } = await ctx.db.admin
						.from('onto_project_logs')
						.select(
							'id, action, entity_type, entity_id, chat_session_id, agent_call_session_id'
						)
						.eq('project_id', seed.projectId!)
						.eq('chat_session_id', turn.sessionId)
						.eq('entity_type', 'task')
						.eq('action', 'updated');
					if (activityError) {
						throw new Error(
							`[assert] failed to read worker activity attribution: ${activityError.message}`
						);
					}
					const mutationActivityRows = (activityRows ?? []).filter((row) =>
						expectedActivityEntityIds.has(row.entity_id)
					);
					if (mutationActivityRows.length !== 3) {
						throw new Error(
							`[assert] expected 3 chat-attributed task activity rows, received ${mutationActivityRows.length}`
						);
					}
					for (const row of mutationActivityRows) {
						if (
							row.chat_session_id !== turn.sessionId ||
							row.agent_call_session_id !== null
						) {
							throw new Error(
								`[assert] task activity ${row.id} mixed internal chat and external agent-call attribution`
							);
						}
					}
				}

				const seededIds = new Set(seed.notes.seededTaskIds as string[]);
				const created = tasks.filter((t) => !seededIds.has(t.id));
				if (created.length > 0) {
					throw new Error(
						`[assert] updates created ${created.length} new task(s): ` +
							`[${created.map((t) => t.title).join(', ')}]`
					);
				}

				const before = seed.notes.seededTasks as TaskRow[];
				assertOnlyAllowedRowFieldsChanged(
					before,
					tasks,
					{
						[seed.entityIds.resume!]: ['state_key', 'completed_at', 'updated_at'],
						[seed.entityIds.linkedin!]: ['state_key', 'completed_at', 'updated_at'],
						[seed.entityIds.halcyon!]: ['priority', 'updated_at'],
						[seed.entityIds.control!]: []
					},
					'task-multi-update seeded tasks'
				);
			},
			evidenceChecks: [
				{
					name: 'stream-health',
					category: 'transport',
					check: (turn) => assertTurnSucceeded(turn)
				},
				{
					name: 'worker-contract-approved',
					category: 'contract',
					applies: (ctx) => ctx.executionMode === 'worker_realtime',
					check: (turn) => {
						assertAnyToolCalled(turn, ['approve_turn_contract_review']);
					}
				},
				{
					name: 'task-mutation-executed',
					category: 'mutation',
					check: (turn) => {
						const writes = mutatingToolCalls(turn);
						if (writes.length === 0) {
							throw new Error('no canonical ontology mutation tool was observed');
						}
					}
				},
				{
					name: 'resume-done',
					category: 'effect',
					check: async (_turn, ctx, seed) => {
						const tasks = await listTasks(ctx.db.admin, seed.projectId!);
						const task = tasks.find(
							(candidate) => candidate.id === seed.entityIds.resume
						);
						assertTaskState(task?.state_key, 'done', RESUME_TITLE);
					}
				},
				{
					name: 'linkedin-done',
					category: 'effect',
					check: async (_turn, ctx, seed) => {
						const tasks = await listTasks(ctx.db.admin, seed.projectId!);
						const task = tasks.find(
							(candidate) => candidate.id === seed.entityIds.linkedin
						);
						assertTaskState(task?.state_key, 'done', LINKEDIN_TITLE);
					}
				},
				{
					name: 'halcyon-top-priority',
					category: 'effect',
					check: async (_turn, ctx, seed) => {
						const tasks = await listTasks(ctx.db.admin, seed.projectId!);
						const task = tasks.find(
							(candidate) => candidate.id === seed.entityIds.halcyon
						);
						assertNumericPriorityAtMost(task?.priority ?? null, 2, HALCYON_TITLE);
					}
				},
				{
					name: 'collateral-preserved',
					category: 'collateral',
					check: async (_turn, ctx, seed) => {
						assertOnlyAllowedRowFieldsChanged(
							seed.notes.seededTasks as TaskRow[],
							await listTasks(ctx.db.admin, seed.projectId!),
							{
								[seed.entityIds.resume!]: [
									'state_key',
									'completed_at',
									'updated_at'
								],
								[seed.entityIds.linkedin!]: [
									'state_key',
									'completed_at',
									'updated_at'
								],
								[seed.entityIds.halcyon!]: ['priority', 'updated_at'],
								[seed.entityIds.control!]: []
							},
							'task-multi-update seeded tasks'
						);
					}
				}
			],
			judge: async (turn) => ({
				rubric:
					'In one dictated sentence the user reported finishing two tasks (the resume update and ' +
					'the LinkedIn refresh) and raised the priority of a third (Halcyon Labs system design ' +
					'prep). A good result: the assistant applied all three changes and reported back which ' +
					'ones it made, briefly. Penalize: handling only some clauses while implying everything ' +
					'was done, asking permission for changes the user already stated as fact, or a long ' +
					'recap that obscures whether all three landed.',
				threshold: 3,
				transcript: buildTranscript(turn)
			})
		}
	]
};
