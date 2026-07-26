// apps/web/src/lib/tests/agentic-e2e/scenarios/entity-resolution-misspelled.scenario.ts
//
// Transcription corruption. Not in the original Tier 1 gap list — it came out of
// DJ's interview (2026-07-25) as a failure he hits regularly and has learned to
// work around, which makes it a higher-signal bug report than anything invented.
//
//   "I'll say 'update the project called Tacemus' and the transcriber gets it
//    wrong — tacemos, tesamus. Then there are problems matching the right
//    project. I know if I'm referencing a project I'll have to spell it right."
//
// He dictates nearly every message, and BuildOS's own voice transcription mangles
// distinctive proper nouns. So the *real* input distribution contains misspelled
// entity names at a meaningful rate, and search is keyword-based (FTS + trigram),
// not semantic — this is exactly where it should be measured.
//
// TWO behaviors pass, matching the clarification policy in
// OPEN_BRIEF_EVAL_METHODOLOGY.md §6.1:
//   (a) resolve the near-match and do the work, or
//   (b) name the candidate and ask ("did you mean Tacemus?"), writing nothing.
// Both are a competent human's response to a typo. What fails:
//   - writing to the unrelated decoy project
//   - creating a NEW project from the misspelling (silent, destructive guessing)
//   - giving up without ever naming the obvious candidate
//
// A decoy project is seeded so that "there was only one project" cannot pass
// this by accident.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario, ScenarioContext, SeedResult } from '../harness/types';
import { harnessProjectName, seedProject } from '../harness/seed';
import {
	assertNonEmptyAssistantText,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript,
	mutatingToolCalls
} from '../harness/assertions';
import { listTasks, waitForTurnRun } from '../harness/telemetry';

/** The correctly-spelled distinctive token seeded into the target project name. */
const TARGET_TOKEN = 'Tacemus';
/** What the voice transcriber actually produces. DJ's real corruption, verbatim. */
const DICTATED_TOKEN = 'tacemos';

function targetSpec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName(TARGET_TOKEN),
			type_key: 'project.technical.software',
			description: 'The Tacemus product build.'
		},
		entities: [
			{
				temp_id: 'existing',
				kind: 'task',
				title: 'Draft the positioning one-pager',
				type_key: 'task.default',
				state_key: 'todo'
			}
		],
		relationships: []
	};
}

function decoySpec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Harbor Metrics Dashboard'),
			type_key: 'project.business.product_launch',
			description: 'An unrelated analytics dashboard project.'
		},
		entities: [],
		relationships: []
	};
}

export const entityResolutionMisspelledScenario: Scenario = {
	id: 'entity-resolution-misspelled',
	title: 'Resolve a project whose name the voice transcriber got wrong',
	category: 'organization',
	seed: async (ctx): Promise<SeedResult> => {
		const { projectId } = await seedProject(ctx, targetSpec());
		const { projectId: decoyId } = await seedProject(ctx, decoySpec());
		const seeded = await listTasks(ctx.db.admin, projectId);
		return {
			projectId,
			entityIds: { decoy: decoyId },
			notes: { seededTaskIds: seeded.map((t) => t.id) }
		};
	},
	teardown: async (ctx: ScenarioContext, seed: SeedResult) => {
		// The decoy is AE2E-prefixed and the afterAll sweep would eventually get
		// it, but delete it here so a failure mid-suite doesn't leave the next
		// scenario looking at extra projects.
		if (seed.entityIds.decoy) {
			await ctx.db.admin.from('onto_projects').delete().eq('id', seed.entityIds.decoy);
		}
		// A project invented from the misspelling would NOT carry the harness
		// prefix, so the orphan sweep cannot see it. Clean it up explicitly.
		const strays = seed.notes.strayProjectIds;
		if (Array.isArray(strays) && strays.length > 0) {
			await ctx.db.admin
				.from('onto_projects')
				.delete()
				.in('id', strays as string[]);
		}
	},
	turns: [
		{
			// Global context on purpose: the agent has to pick a project, which is
			// where DJ hits this. In project context the referent is already given.
			contextType: 'global',
			message:
				`add a task to the ${DICTATED_TOKEN} project to rewrite the onboarding flow copy, ` +
				'and one to review the pricing page',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				// Record any project the agent invented, for teardown, before asserting.
				const { data: ownedProjects } = await ctx.db.admin
					.from('onto_projects')
					.select('id, name')
					.eq('created_by', ctx.db.actorId);
				const known = new Set([seed.projectId, seed.entityIds.decoy]);
				const strays = (ownedProjects ?? []).filter((p) => !known.has(p.id));
				seed.notes.strayProjectIds = strays.map((p) => p.id);
				if (strays.length > 0) {
					throw new Error(
						`[assert] the agent created ${strays.length} new project(s) from a misspelling ` +
							`instead of matching the existing one: [${strays.map((p) => p.name).join(', ')}]. ` +
							'This is the destructive form of the failure — a typo silently forks the workspace.'
					);
				}

				// Nothing may land in the unrelated project, under any branch.
				const decoyTasks = await listTasks(ctx.db.admin, seed.entityIds.decoy!);
				if (decoyTasks.length > 0) {
					throw new Error(
						`[assert] tasks were written to the unrelated decoy project: ` +
							`[${decoyTasks.map((t) => t.title).join(', ')}]`
					);
				}

				const seededIds = new Set(seed.notes.seededTaskIds as string[]);
				const created = (await listTasks(ctx.db.admin, seed.projectId!)).filter(
					(t) => !seededIds.has(t.id)
				);
				seed.notes.createdTitles = created.map((t) => t.title);

				// Branch (a): it resolved the near-match and did the work.
				if (created.length > 0) {
					const text = created.map((t) => t.title.toLowerCase()).join(' | ');
					if (!/onboarding/.test(text)) {
						throw new Error(
							`[assert] wrote to the right project but not the requested work. ` +
								`Created: [${created.map((t) => t.title).join(', ')}]`
						);
					}
					return;
				}

				// Branch (b): it wrote nothing — then it must have named the candidate
				// and asked, rather than failing silently or shrugging.
				const writes = mutatingToolCalls(turn);
				if (writes.length > 0) {
					throw new Error(
						`[assert] mutation tools ran ([${writes.join(', ')}]) but no task landed in the ` +
							'target project — the write went somewhere unaccounted for'
					);
				}
				const said = turn.assistantText.toLowerCase();
				if (!said.includes(TARGET_TOKEN.toLowerCase())) {
					throw new Error(
						`[assert] the agent neither created the tasks nor named "${TARGET_TOKEN}" as the ` +
							`likely match for "${DICTATED_TOKEN}". A misspelling from voice dictation left it ` +
							`stuck. Assistant text: "${turn.assistantText.slice(0, 400)}"`
					);
				}
				if (!turn.assistantText.includes('?')) {
					throw new Error(
						`[assert] the agent mentioned "${TARGET_TOKEN}" but did not ask whether that was ` +
							'the intended project, and did no work either — it stalled.'
					);
				}
			},
			judge: async (turn, _ctx, seed) => ({
				rubric:
					`The user dictated a request naming the project "${DICTATED_TOKEN}". No project has that ` +
					`name; one is named "${TARGET_TOKEN}" (voice transcription corrupted it), and an ` +
					'unrelated "Harbor Metrics Dashboard" project also exists. A good result is EITHER ' +
					`(a) recognizing "${DICTATED_TOKEN}" as "${TARGET_TOKEN}" and adding the requested tasks ` +
					`there, OR (b) explicitly asking whether "${TARGET_TOKEN}" was meant. Both are competent. ` +
					'Penalize heavily: creating a brand-new project from the misspelling, writing to the ' +
					'unrelated project, or reporting "no project found" without ever surfacing the obvious ' +
					'near-match.',
				threshold: 3,
				transcript: buildTranscript(turn, {
					tasksCreatedInTargetProject: seed.notes.createdTitles ?? []
				})
			})
		}
	]
};
