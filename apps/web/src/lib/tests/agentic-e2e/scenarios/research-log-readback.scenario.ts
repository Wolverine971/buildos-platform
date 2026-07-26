// apps/web/src/lib/tests/agentic-e2e/scenarios/research-log-readback.scenario.ts
//
// The one scenario that proves research SURVIVES a session.
//
// Turn 1 researches; deterministic capture writes a "Research Log" document. Turn 2 runs in a
// COLD session — no threaded session id, no continuity context — and must find that research
// again. If it can only do so by re-searching the web, the log is write-only and useless.
//
// This guards a failure that has already shipped once: `ontology-context-loader.ts` filters any
// type_key containing 'scratch' or 'workspace' out of project context, so the pre-existing
// task scratch pad can be written but never read back. The Research Log deliberately uses
// `document.knowledge.research` to stay visible. Nothing but this test enforces that.
import type { ProjectSpec } from '$lib/types/onto';
import type { Scenario } from '../harness/types';
import { harnessProjectName, seedScenarioProject } from '../harness/seed';
import {
	assertNonEmptyAssistantText,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	researchToolCalls
} from '../harness/assertions';
import { listDocuments, waitForTurnRun } from '../harness/telemetry';
import { RESEARCH_LOG_TITLE } from '$lib/server/research-log.service';

function spec(): ProjectSpec {
	return {
		project: {
			name: harnessProjectName('Research Readback'),
			type_key: 'project.business.product_launch',
			description:
				'A scheduling tool for small service businesses, currently free in beta with no paid tier.'
		},
		entities: [],
		relationships: []
	};
}

function toolCallNames(turn: { toolCalls: Array<{ function?: { name?: string } }> }): string[] {
	return turn.toolCalls.map((call) => call.function?.name ?? '').filter(Boolean);
}

function toolCallArgsBlob(turn: {
	toolCalls: Array<{ function?: { arguments?: string } }>;
}): string {
	return turn.toolCalls.map((call) => call.function?.arguments ?? '').join(' ');
}

export const researchLogReadbackScenario: Scenario = {
	id: 'research-log-readback',
	title: 'Research captured in one session is found again in a cold session',
	category: 'document',
	seed: async (ctx) => seedScenarioProject(ctx, spec()),
	turns: [
		// Turn 1 — do real research. Deterministic capture should leave a Research Log behind.
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'Look into what other scheduling tools for small service businesses charge — ' +
				'I want a sense of the pricing landscape before we put a paid tier together.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const research = researchToolCalls(turn);
				if (research.length < 2) {
					throw new Error(
						`[assert] turn 1 only ran ${research.length} research call(s) ([${research.join(', ')}]); ` +
							'this scenario needs a real research turn to have anything to read back. ' +
							'If the model answered from memory, the prompt or the question needs to push harder.'
					);
				}

				const documents = await listDocuments(ctx.db.admin, seed.projectId!);
				const log = documents.find((doc) => doc.title === RESEARCH_LOG_TITLE);
				if (!log) {
					throw new Error(
						`[assert] no "${RESEARCH_LOG_TITLE}" document after ${research.length} research calls. ` +
							`Deterministic capture did not run. Titles: [${documents.map((d) => d.title).join(', ')}]`
					);
				}
				if (log.type_key !== 'document.knowledge.research') {
					throw new Error(
						`[assert] Research Log has type_key "${log.type_key}". It must not contain ` +
							"'scratch' or 'workspace' — those are filtered out of project context and " +
							'the log would be unreadable in turn 2.'
					);
				}
				const content = log.content ?? '';
				if (!content.includes(`<!-- run:${turn.streamRunId}`)) {
					throw new Error(
						`[assert] Research Log has no entry marker for this turn's run id ` +
							`(${turn.streamRunId}). Idempotency marker missing. Content: "${content.slice(0, 300)}"`
					);
				}
				if (!/- Queries:|- Visited:/.test(content)) {
					throw new Error(
						`[assert] Research Log entry recorded neither queries nor visited URLs. ` +
							`Content: "${content.slice(0, 300)}"`
					);
				}
				seed.notes.researchLogId = log.id;
			}
		},
		// Turn 2 — COLD. No session id, no continuity context. The only way to answer is the log.
		{
			contextType: 'project',
			coldSession: true,
			entityIdFromSeed: (seed) => seed.projectId,
			message: 'What did we already find out about pricing for this?',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));

				const logId = String(seed.notes.researchLogId ?? '');
				const names = toolCallNames(turn);
				const argsBlob = toolCallArgsBlob(turn);

				// The load-bearing assertion: it went to the stored research, not back to the web.
				const openedTheLog = logId.length > 0 && argsBlob.includes(logId);
				const readADocument = names.some(
					(name) => name === 'get_document_outline' || name === 'read_document_section'
				);

				if (!openedTheLog) {
					const research = researchToolCalls(turn);
					throw new Error(
						'[assert] the cold turn never opened the Research Log. ' +
							`Tools called: [${names.join(', ')}]. Research calls this turn: ${research.length}. ` +
							(research.length > 0
								? 'It re-searched the web instead of reading what was already captured — ' +
									'the log is write-only, which is exactly the regression this scenario guards.'
								: 'It answered without consulting the stored research at all.')
					);
				}
				if (!readADocument) {
					throw new Error(
						`[assert] the Research Log id was referenced but no document read tool ran. ` +
							`Tools called: [${names.join(', ')}]`
					);
				}
			}
		}
	]
};
