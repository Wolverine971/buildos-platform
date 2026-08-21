// apps/web/src/lib/tests/agentic-e2e/scenarios/task-complete-cold-reference.scenario.ts
//
// The highest-value Tier 1 gap: COLD entity resolution plus the follow-on work.
//
// `document-edit-context` already proves in-session reference resolution ("that
// section you just added") — but that referent lives in the threaded session,
// which is a much easier mechanism. This scenario has NO conversation history.
// Turn 1 of a fresh session names a company that appears only inside a task
// title, so the agent must SEARCH the project to find the referent.
//
// The message is written the way DJ actually talks to BuildOS: dictated, not
// typed. Run-on, no capitalization discipline, filler, and — critically — the
// user states the outcome AND the next step in one breath. Three things follow
// from that and all three are asserted:
//
//   1. The task gets closed. The user said it happened; there is nothing left to
//      confirm, so stalling on "I found it, want me to update it?" is a failure
//      (DJ's reported #2 failure mode). Asserting the mutation landed inside
//      this single turn is what catches that stall.
//   2. The stated next step is carried somewhere durable — a task, a document,
//      an event, or an updated START HERE. Any ONE of the four satisfies it.
//      (Policy set by DJ 2026-07-25 after the first run failed the narrower
//      "must create a task" bar, which he correctly called a bad test: proactive
//      follow-ups often surface later, and the project review cycle backfills
//      some of this outside chat. The real failure is the future landing
//      NOWHERE.)
//   3. The stated-future PATH itself is verifiable (added 2026-07-29 for the
//      Phase 0 baseline gate). If the model authored no surface, the
//      deterministic D1 floor (`$lib/server/stated-future.service`) must have
//      fired, and any capture row it wrote must carry correct ground-truth
//      provenance: props.source = 'stated_future_capture',
//      props.source_stream_run_id = this turn's stream run, verbatim title,
//      at most one row per turn (idempotency). All checked against DB rows and
//      the user's own words — never model-output text patterns.
//
// Assertion order is deliberate: cheapest/most fundamental first, so a failure
// message tells you HOW FAR it got.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNonEmptyAssistantText,
	assertTaskState,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	excludeSystemDocuments,
	buildTranscript,
	normalizeComparableText
} from '../harness/assertions';
import {
	getDocumentByTitle,
	listDocuments,
	listEvents,
	listStatedFutureTasks,
	listTasks,
	waitForTurnRun
} from '../harness/telemetry';

const START_HERE_TITLE = 'START HERE - Job Search';

const START_HERE_CONTENT = `# START HERE - Job Search

## Where this project is right now
Actively interviewing. Three companies in flight, none past the first round yet.

## What's next
- Northwind Systems intro call is the nearest commitment
- Keep the pipeline warm while waiting on responses`;

/** Unrelated tasks that must survive the turn untouched. */
const CONTROL_TASKS = [
	'Update resume with the orchestration work',
	'Prep system design answers for Halcyon Labs'
];

function isoDaysFromNow(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + days);
	date.setUTCHours(15, 0, 0, 0);
	return date.toISOString();
}

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Job Search Cold Ref'),
			type_key: 'project.personal.job_search',
			description: 'An active job search with several interviews in flight.'
		},
		entities: [
			{
				temp_id: 'northwind',
				kind: 'task',
				title: 'Intro call with Northwind Systems',
				description: 'First conversation with the hiring manager about the platform role.',
				type_key: 'task.default',
				state_key: 'todo',
				priority: 2,
				due_at: isoDaysFromNow(-1)
			},
			{
				temp_id: 'control-a',
				kind: 'task',
				title: CONTROL_TASKS[0]!,
				type_key: 'task.default',
				state_key: 'todo',
				due_at: isoDaysFromNow(4)
			},
			{
				temp_id: 'control-b',
				kind: 'task',
				title: CONTROL_TASKS[1]!,
				type_key: 'task.default',
				state_key: 'todo',
				due_at: isoDaysFromNow(6)
			},
			{
				temp_id: 'start-here',
				kind: 'document',
				title: START_HERE_TITLE,
				body_markdown: START_HERE_CONTENT
			}
		],
		relationships: []
	};
}

export const taskCompleteColdReferenceScenario: Scenario = {
	id: 'task-complete-cold-reference',
	title: 'Close a task named only by company, cold, and carry the next step forward',
	category: 'task',
	requiredMutationTools: ['update_onto_task'],
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, spec());
		const tasks = await listTasks(ctx.db.admin, projectId);
		const northwind = tasks.find((t) => /northwind/i.test(t.title));
		if (!northwind) throw new Error('[seed] failed to seed the Northwind task');
		const startHere = await getDocumentByTitle(ctx.db.admin, projectId, START_HERE_TITLE);
		if (!startHere) throw new Error('[seed] failed to seed the START HERE document');
		const docs = await listDocuments(ctx.db.admin, projectId);
		return {
			projectId,
			entityIds: { northwind: northwind.id, startHere: startHere.id },
			notes: {
				seededTaskIds: tasks.map((t) => t.id),
				seededDocIds: docs.map((d) => d.id),
				// seedProject creates the generated project-context START HERE before this
				// scenario adds its purpose-built START HERE - Job Search fixture. The agent
				// may correctly update either document, so retain ground-truth snapshots of
				// every pre-existing START HERE surface instead of watching only one id.
				seededStartHereDocuments: docs
					.filter((d) => /\bstart here\b/i.test(d.title))
					.map((d) => ({ id: d.id, title: d.title, content: d.content ?? '' }))
			}
		};
	},
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			// Dictated, not typed. Verbatim register from DJ, 2026-07-25: outcome
			// and next step stated together, referent given only as a company name.
			message:
				'hey so the task where i was gonna talk to that company northwind, just talked to them, ' +
				'it went well, they liked the agent orchestration stuff. now the next thing is ' +
				"i'm just waiting to hear back from them",
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				// DJ's failure #1: the turn burns its budget on tool calls and hands
				// back nothing. A `done` event alone does not prove it answered.
				assertNonEmptyAssistantText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				// It resolved a referent it could only have found by searching, and
				// it acted in THIS turn rather than asking permission to act.
				assertToolCalled(turn, 'update_onto_task');

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				const northwind = tasks.find((t) => t.id === seed.entityIds.northwind);
				if (!northwind) throw new Error('[assert] the Northwind task vanished');
				assertTaskState(northwind.state_key, 'done', 'Northwind intro call task');

				// The unrelated tasks are collateral damage detection.
				for (const title of CONTROL_TASKS) {
					const control = tasks.find((t) => t.title === title);
					if (!control) throw new Error(`[assert] control task "${title}" vanished`);
					assertTaskState(control.state_key, 'todo', `control task "${title}"`);
				}

				// ---------------------------------------------------------------
				// FORWARD-CARRY. Policy set by DJ, 2026-07-25, after the first run
				// failed this on the narrower "must create a follow-up task" bar:
				//
				//   "if we mention something about the future upcoming, it should
				//    create a task for it, document it, create an event for it, at
				//    least update the start here document so we can note what's
				//    coming next."
				//
				// So any ONE of the four surfaces satisfies it. The original
				// assertion demanded a task specifically, which DJ flagged as a bad
				// test — proactive follow-ups legitimately surface later, and the
				// project review cycle backfills some of this independently of chat.
				// What is NOT acceptable is the future landing nowhere at all: the
				// user said what happens next and the system kept no record of it.
				//
				// The satisfying surface is reported on failure AND stashed for the
				// judge, because WHICH one it picks is the interesting signal.
				// ---------------------------------------------------------------
				const seededIds = new Set(seed.notes.seededTaskIds as string[]);
				const newTasks = tasks.filter((t) => !seededIds.has(t.id));
				const forwardTask = newTasks.find((t) => {
					const text = normalizeComparableText(`${t.title} ${t.description ?? ''}`);
					return /wait|hear back|follow.?up|response/.test(text);
				});

				const documents = await listDocuments(ctx.db.admin, seed.projectId!);
				const seededDocIds = new Set(seed.notes.seededDocIds as string[]);
				// An auto-captured Research Log must not count as a forward-carry surface — that
				// would turn this real 0/12 failure green without the stated next step ever being
				// recorded.
				const newDocs = excludeSystemDocuments(documents).filter(
					(d) => !seededDocIds.has(d.id)
				);

				const events = await listEvents(ctx.db.admin, seed.projectId!);

				const startHereSnapshots = seed.notes.seededStartHereDocuments as Array<{
					id: string;
					title: string;
					content: string;
				}>;
				const changedStartHereDocuments = startHereSnapshots.filter((snapshot) => {
					const current = documents.find((document) => document.id === snapshot.id);
					if (!current) {
						throw new Error(
							`[assert] START HERE document "${snapshot.title}" vanished`
						);
					}
					return (
						normalizeComparableText(current.content ?? '') !==
						normalizeComparableText(snapshot.content)
					);
				});
				const startHereChanged = changedStartHereDocuments.length > 0;

				const surfaces = {
					task: forwardTask ? `"${forwardTask.title}"` : null,
					document: newDocs.length > 0 ? `"${newDocs[0]!.title}"` : null,
					event: events.length > 0 ? `"${events[0]!.title}"` : null,
					startHereUpdated: startHereChanged
						? changedStartHereDocuments
								.map((document) => `"${document.title}"`)
								.join(', ')
						: null
				};
				seed.notes.forwardCarrySurfaces = surfaces;

				const satisfiedBy = Object.entries(surfaces)
					.filter(([, value]) => value !== null)
					.map(([key, value]) => `${key}=${value}`);
				if (satisfiedBy.length === 0) {
					throw new Error(
						'[assert] the stated next step ("waiting to hear back") was carried nowhere. ' +
							'None of the four forward-carry surfaces changed:\n' +
							`  - no follow-up task (new tasks: [${newTasks.map((t) => t.title).join(', ') || 'none'}])\n` +
							'  - no new document\n' +
							'  - no new event\n' +
							'  - START HERE unchanged\n' +
							'The user said what happens next and the system kept no record of it.'
					);
				}
				console.info(`[agentic-e2e] forward-carry satisfied by: ${satisfiedBy.join(', ')}`);

				// ---------------------------------------------------------------
				// STATED-FUTURE PATH (added 2026-07-29 — Phase 0 baseline gate,
				// AGENTIC_CHAT_WORKER_PHASE_0_BASELINE_2026-07-29). The four-surface
				// check above proves the future landed SOMEWHERE but cannot see WHICH
				// mechanism carried it: a task written by the deterministic D1 floor
				// (`stated-future.service`) satisfies the `task` surface exactly like a
				// model-authored one. So a run where the floor wrote a broken record —
				// linked to the wrong stream run, paraphrased instead of verbatim, or
				// double-fired past its idempotency key — still went green. This block
				// asserts the path itself, entirely from ground truth (onto_tasks.props
				// provenance + the user's own words), never model-output text.
				//
				// The model keeps first refusal (D1): when it authored a durable record
				// the floor correctly stays silent, so a missing capture row is only a
				// failure when the model ALSO carried nothing.
				// ---------------------------------------------------------------
				const statedFutureTasks = await listStatedFutureTasks(
					ctx.db.admin,
					seed.projectId!
				);

				// One turn ran, and the capture is keyed `stated_future_capture:<streamRunId>`
				// through onto_task_create_atomic — a second row means idempotency broke.
				if (statedFutureTasks.length > 1) {
					throw new Error(
						`[assert] found ${statedFutureTasks.length} stated-future capture tasks after a ` +
							'single turn; the idempotent replay contract allows at most one: ' +
							statedFutureTasks.map((t) => `"${t.title}"`).join(', ')
					);
				}
				const capture = statedFutureTasks[0] ?? null;
				if (capture) {
					const capturedStreamRunId = capture.props?.source_stream_run_id;
					if (capturedStreamRunId !== turn.streamRunId) {
						throw new Error(
							`[assert] stated-future capture "${capture.title}" has ` +
								`props.source_stream_run_id="${String(capturedStreamRunId ?? 'unset')}"; ` +
								`expected this turn's stream run "${turn.streamRunId}". The record must be ` +
								'auditable back to the turn that produced it.'
						);
					}
					// The service titles from the user's verbatim clause, never a paraphrase
					// — for this message the clause necessarily contains "waiting to hear
					// back" (asserted against the user's words, not model output).
					if (!/waiting to hear back/i.test(capture.title)) {
						throw new Error(
							`[assert] stated-future capture title "${capture.title}" does not contain ` +
								'the user\'s verbatim words ("waiting to hear back"); the deterministic ' +
								'write must title from what the user actually said'
						);
					}
					assertTaskState(
						capture.state_key,
						'todo',
						`stated-future capture "${capture.title}"`
					);
				}

				// Which mechanism carried the future: any surface NOT written by the floor
				// is model-authored. (Docs are already system-filtered above; tasks are
				// classified here by provenance props, not by title.)
				const statedFutureIds = new Set(statedFutureTasks.map((t) => t.id));
				const modelForwardTask = newTasks.find((t) => {
					if (statedFutureIds.has(t.id)) return false;
					const text = normalizeComparableText(`${t.title} ${t.description ?? ''}`);
					return /wait|hear back|follow.?up|response/.test(text);
				});
				const modelCarried =
					Boolean(modelForwardTask) ||
					newDocs.length > 0 ||
					events.length > 0 ||
					startHereChanged;

				if (!modelCarried && !capture) {
					throw new Error(
						'[assert] the model authored no forward-carry surface AND the deterministic ' +
							'stated-future floor never fired: no onto_tasks row with ' +
							'props.source="stated_future_capture" exists for this project. The D1 ' +
							'last-resort write is the guarantee that a stated future cannot land ' +
							'nowhere; it did not run, or it wrote without provenance.'
					);
				}

				seed.notes.statedFutureCapture = capture
					? {
							taskId: capture.id,
							title: capture.title,
							carriedBy: modelCarried ? 'model_and_floor' : 'deterministic_floor'
						}
					: { taskId: null, title: null, carriedBy: 'model' };
				console.info(
					`[agentic-e2e] stated-future path: ${JSON.stringify(seed.notes.statedFutureCapture)}`
				);
			},
			judge: async (turn, _ctx, seed) => ({
				rubric:
					'In a brand-new chat with no history, the user said (by voice) that they had just ' +
					'completed the "Intro call with Northwind Systems" task, that it went well, and that ' +
					'the next thing is waiting to hear back. A good result: the assistant found that task ' +
					'without being told its exact title, marked it done, recorded the stated next step ' +
					'somewhere durable (a follow-up task, a document, an event, or an updated START HERE ' +
					'— any one of these is fine), and told the user plainly what it did and what that ' +
					'means for the project. Penalize heavily: asking "I found the task, do you want me to ' +
					'update it?" (the user already said it happened — there is nothing to confirm), ' +
					'touching unrelated tasks, or claiming updates that did not occur. Leaving the stated ' +
					'next step only in chat prose, with nothing recorded anywhere, is the core failure.',
				threshold: 3,
				transcript: buildTranscript(turn, {
					forwardCarrySurfaces: seed.notes.forwardCarrySurfaces ?? '(none)',
					// WHICH mechanism carried the future (model vs deterministic floor) is
					// the interesting signal for the judge, not just that one did.
					statedFutureCapture: seed.notes.statedFutureCapture ?? '(none)'
				})
			})
		}
	]
};
