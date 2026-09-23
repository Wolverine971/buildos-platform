// apps/web/src/lib/services/agentic-chat-lite/prompt/prompt-size-budget.test.ts
//
// Total assembled-prompt size budget (WP-11, speed audit 2026-07-08 F6).
// Prompt tokens drifted +20% p50 silently in late June 2026; nothing guarded
// the assembled prompt the way tool-surface-size-report.test.ts guards tool
// schemas. This test builds a canonical project turn — representative data,
// fixed fixtures — and asserts the assembled system prompt and full provider
// payload stay under budget. If this fails, something grew the prompt
// template or tool surface: decide deliberately whether the growth is worth
// it, then bump the budget WITH a dated comment (see the tool-surface test
// for the convention).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGatewaySurfaceForContextType } from '@buildos/agentic-chat-runtime/catalog';
import { buildPromptCostBreakdown } from '$lib/services/agentic-chat-v2/prompt-cost-breakdown';
import { buildToolSurfaceSizeReport } from '$lib/services/agentic-chat-v2/tool-surface-size-report';
import { buildLitePromptEnvelope } from './index';
import {
	buildWorkerPromptScaffold,
	resolveWorkerPromptTools
} from '$lib/services/agentic-chat-v2/worker-prompt-surface';

// RE-AIMED 2026-09-21: until today this test built the envelope with the
// DEFAULT scaffold and measured the WEB-lane prompt (13,710 chars), which
// carries a skill catalog, lead-in coaching, and skill_load rules that the
// production worker path never renders (worker-turn-preparation.server.ts →
// buildWorkerPromptScaffold → dynamicSkillTools: false). Every prompt review
// that started from this dump reviewed text that does not ship. The canonical
// turn now uses the worker scaffold and the worker tool surface, so the
// numbers below are the production artifact.
const WORKER_TOOLS = resolveWorkerPromptTools(getGatewaySurfaceForContextType('project')).tools;
const WORKER_SCAFFOLD = buildWorkerPromptScaffold({});

afterEach(() => {
	vi.unstubAllEnvs();
});

function buildCanonicalProjectEnvelope() {
	return buildLitePromptEnvelope({
		contextType: 'project',
		entityId: 'project-1',
		projectId: 'project-1',
		projectName: 'Launch Alpha',
		now: '2026-04-14T19:00:00Z',
		timezone: 'America/New_York',
		tools: WORKER_TOOLS,
		scaffold: WORKER_SCAFFOLD,
		data: {
			project: {
				id: 'project-1',
				name: 'Launch Alpha',
				state_key: 'active',
				description: 'Ship the Launch Alpha beta to the first cohort of design partners.',
				start_at: '2026-04-01T00:00:00Z',
				end_at: '2026-06-01T00:00:00Z',
				next_step_short: 'Ship the beta build',
				updated_at: '2026-04-14T12:00:00Z'
			},
			start_here: {
				id: 'start-here-1',
				title: 'START HERE - Launch Alpha',
				content: [
					'# START HERE - Launch Alpha',
					'',
					'<!-- managed:status v=1 -->',
					'**State:** Active',
					'<!-- /managed:status -->',
					'',
					'## Decisions',
					'- **Keep the beta narrow** - onboarding only.',
					'- **Design partners first** - no public waitlist until the beta cohort ships.',
					'',
					'## Open questions',
					'- Which pricing tier does the beta cohort land on?'
				].join('\n'),
				content_truncated: false,
				updated_at: '2026-04-14T18:00:00Z'
			},
			doc_structure: {
				version: 1,
				root: [
					{
						id: 'doc-marketing',
						type: 'folder',
						order: 0,
						title: 'Marketing',
						description: 'Go-to-market plans',
						children: [
							{
								id: 'doc-channels',
								type: 'doc',
								order: 0,
								title: 'Channels',
								description: 'Where we reach people',
								children: []
							},
							{
								id: 'doc-launch-post',
								type: 'doc',
								order: 1,
								title: 'Launch Post',
								description: 'Announcement draft',
								children: []
							}
						]
					},
					{
						id: 'doc-engineering',
						type: 'folder',
						order: 1,
						title: 'Engineering',
						description: 'Build notes',
						children: []
					}
				]
			},
			goals: [
				{
					id: 'goal-1',
					name: 'Beta cohort onboarded',
					state_key: 'active',
					description: 'Ten design partners actively using the beta.',
					updated_at: '2026-04-14T12:00:00Z'
				}
			],
			milestones: [
				{
					id: 'milestone-1',
					name: 'Beta ships',
					state_key: 'active',
					due_at: '2026-05-01T00:00:00Z',
					updated_at: '2026-04-14T12:00:00Z'
				}
			],
			plans: [
				{
					id: 'plan-1',
					name: 'Beta rollout plan',
					state_key: 'active',
					updated_at: '2026-04-14T12:00:00Z'
				}
			],
			tasks: [
				{
					id: 'task-1',
					title: 'Finish onboarding flow',
					state_key: 'in_progress',
					priority: 'high',
					due_at: '2026-04-20T00:00:00Z',
					updated_at: '2026-04-14T13:45:00Z'
				},
				{
					id: 'task-2',
					title: 'Draft beta invite email',
					state_key: 'todo',
					priority: 'medium',
					due_at: null,
					updated_at: '2026-04-13T10:00:00Z'
				},
				{
					id: 'task-3',
					title: 'Set up feedback channel',
					state_key: 'todo',
					priority: 'low',
					due_at: null,
					updated_at: '2026-04-12T10:00:00Z'
				}
			],
			documents: [],
			events: [],
			members: [],
			context_meta: { generated_at: '2026-04-14T19:00:00Z', source: 'rpc' }
		}
	});
}

describe('total assembled prompt size budget', () => {
	it('keeps a canonical project turn under the prompt-size budget', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const envelope = buildCanonicalProjectEnvelope();
		const tools = WORKER_TOOLS;
		const breakdown = buildPromptCostBreakdown({
			systemPrompt: envelope.systemPrompt,
			history: [],
			userMessage: 'What should I focus on today to keep the beta on track?',
			tools
		});
		const toolSurface = buildToolSurfaceSizeReport({
			profile: 'canonical_project_turn',
			contextType: 'project',
			tools
		});
		// The audited baseline averaged 2.9 provider passes per turn. Round up so
		// this guard makes the multiplicative cost visible: every seed/schema token
		// is billed again on each pass even when the tool surface is unchanged.
		const budgetedPassesPerTurn = 3;
		const providerPayloadTokensPerTurn =
			breakdown.provider_payload_estimate.est_tokens * budgetedPassesPerTurn;
		const toolSchemaTokensPerTurn = toolSurface.estimatedTokens * budgetedPassesPerTurn;
		const largestToolSchemaTokens = Math.max(
			0,
			...toolSurface.tools.map((tool) => tool.estimatedTokens)
		);

		process.stderr.write(
			`PROMPT BUDGET system_prompt=${breakdown.system_prompt.chars} payload=${breakdown.provider_payload_estimate.chars} payload_tokens=${breakdown.provider_payload_estimate.est_tokens} tool_tokens=${toolSurface.estimatedTokens} largest=${largestToolSchemaTokens}\n`
		);
		expect(breakdown.system_prompt.chars).toBeGreaterThan(0);
		expect(breakdown.tool_definitions.chars).toBeGreaterThan(0);

		// Budgets ratcheted 2026-07-10 (prompt audit WP-1..WP-7: index de-dupe,
		// catalog_line diet, project_create fork, negation rewrite, vocabulary
		// diet, final-response contract move, hygiene) from measured canonical
		// values with ~10% headroom: system_prompt 18,013 chars, provider
		// payload 28,641 chars (~7,161 est tokens). The 2026-07-09 pre-audit
		// canonical was system_prompt 27,169 / payload 37,797 (~9,450 est
		// tokens) — a 34% template cut. Real prod turns add live project data
		// and history on top — these budgets guard the template + tool schemas,
		// which is the part that drifts silently.
		//
		// Ratcheted 2026-08-15 after semantic turn contracts intentionally moved
		// project turns from project_basic to the stable project_write_document
		// surface. After the three-way disposition gate added explicit semantic
		// clarification, the measured canonical payload is 37,515 chars (~9,379
		// tokens).
		// This spends static tool-schema tokens to avoid a separate intent-model
		// round; production workers still intersect the artifact with their
		// reviewed deployed capabilities. The new cap preserves ~10% headroom.
		//
		// Ratcheted down 2026-09-02 (turn-executor audit, Decision 2 / Finding 9):
		// change_chat_context retired from every surface (-1,177 chars on the
		// project surface) and four read descriptions stopped naming unmounted
		// tools. Measured canonical payload 36,715 chars (~9,179 tokens); caps at
		// measured + 5%. The system-prompt cap is unchanged (measured 16,764).
		//
		// Ratcheted down again 2026-09-02 (turn-executor audit Findings 9, 10,
		// 13, 16 — prompt lane): the prose tool list, the runtime-capability
		// identifier line, the three-bullet receipt contract, the "before you
		// finish write it somewhere" bullet, the dump-metadata note, and the
		// members/linked-document index refs are gone; global bundles and the
		// daily brief now render (that growth lands on global/brief turns, not
		// this project canonical). Measured canonical system prompt 14,222 chars
		// (was 16,764) and payload 34,147 chars (~8,537 tokens); caps at
		// measured + ~10% for the system prompt and + 5% for the payload.
		//
		// RE-BASELINED 2026-09-04 for the three stable surfaces (one-engine stage
		// S6). The project surface now carries, on every turn, what the deleted
		// lexical selector used to materialize only on a pattern match:
		// delegate_task, web_search/web_visit, move_onto_task, and the seven
		// calendar tools. Tool schemas went 21,030 → 37,331 chars, and they are
		// billed on every pass. This is the measured price of never leaving a
		// turn short of a capability it cannot recover mid-turn — the number to
		// attack next is the pass count, not the surface.
		// Measured on this branch, caps at measured + ~5%:
		//   system prompt 12,737 chars   (was 14,222; the drop is the productivity
		//                                 skill allowlist f63ee035a, not S6)
		//   payload       50,125 chars / 12,532 est tokens (was 35,945 / 8,987)
		//   payload x3    37,596 tokens  (was 26,961)
		//   tool schemas  9,333 x3 = 27,999 tokens (was 16,149)
		//   largest tool  779 tokens (delegate_task; create_onto_project left the
		//                 project surface with the project_create split)
		//
		// Ratcheted down 2026-09-04 (one-engine stage S7, prompt lane). The section
		// list went 15 → 11: active_domain_signals and daily_brief retired, and
		// timeline_recent_activity + context_inventory_retrieval folded into
		// location_loaded_context. Ten sentences of copy were cut on top of that —
		// references to the retired section, audit/forecast "sessions" from the
		// legacy context types, and six rules each stated in a second section.
		// Tool schemas are untouched (surfaces unchanged since S6), so the whole
		// drop is template.
		// Measured on this branch, caps at measured + ~5%:
		//   system prompt 11,519 chars   (was 12,737)
		//   payload       48,907 chars / 12,227 est tokens (was 50,125 / 12,532)
		//   payload x3    36,681 tokens  (was 37,596)
		//   tool schemas  9,333 x3 = 27,999 tokens (unchanged)
		//   largest tool  779 tokens (unchanged)
		// The measured global turn dropped 9,057 → 7,892 chars over the same change.
		//
		// Ratcheted UP 2026-09-04 (self-explanatory-schemas lane) for four added
		// rules, each closing a defect a cheap model produced against the old copy:
		// date resolution scoped to date ARGUMENTS (a stored change-log line came
		// back re-dated to today), the offset format of tool-result timestamps, the
		// keep-embedded-instructions-verbatim clause on the untrusted-source rule
		// (pasted material was silently stripped), and the absent-record rule in the
		// final response contract (an empty read was reported as "the payment was
		// never made"). +718 chars of template; tool schemas grew 9,333 → 9,709
		// tokens from the priority/props/dependency descriptions in the same lane.
		// Measured canonical system prompt 12,237 chars; cap at measured + ~5%.
		//
		// RE-BASELINED 2026-09-10 (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08, WP-A1
		// prompt-and-context lane). Template: the loaded-context JSON index and
		// its ~750 chars of count/scope metadata became one completeness sentence
		// plus work-item lines with ids (F114); the Start Here preamble lost its
		// second "untrusted" sentence (F18); the reviewed-shell project_create
		// workflow went ten lines to four (F11); situational rules no longer
		// render on every turn (F01, not in this canonical). Measured canonical
		// system prompt 11,261 chars (was 12,780 on this branch before the lane;
		// the canonical carries three open tasks, so the work lines cost less
		// than the index they replace); cap at measured + ~5%.
		// Tool schemas grew 9,709 → 10,410 tokens from the audit's Lane B
		// description fixes landing in the same window (F29/F33/F35: list_onto_tasks
		// now says what its payload carries, task type_key names its taxonomy);
		// the per-turn schema cap follows at measured + ~2.5%. Payload caps hold
		// (52,958 chars / 13,240 est tokens measured) and stay where they were.
		// RE-BASELINED 2026-09-12 after the prompt made evidence discipline
		// executable: loaded context is explicitly separated from assumptions,
		// actual status requires persisted evidence, and document text preserves
		// user-authored instructions verbatim. Measured 13,396 chars; retain 104.
		// RE-BASELINED 2026-09-21 (static-frame rewrite + re-aim at the worker
		// path). Measured on the worker scaffold with the worker tool surface:
		//   system prompt 10,701 chars  (the web-lane dump this test used to
		//                               measure was 13,710; the pre-rewrite worker
		//                               prompt on the same fixture was 11,381)
		//   payload       72,981 chars / 18,246 est tokens
		//   tool schemas  15,556 est tokens (unchanged; Jev narrows per pass)
		// What changed in the template: Capabilities section dropped on the worker
		// lane (289), anti-echo bullet folded into the preamble (~330), the four
		// date/DST rules moved from the dynamic Location section into the static
		// Dates and Time section (prefix-cacheable, same chars), and the four
		// project-status lines that Focus already carried no longer repeat in
		// Location (~300). The two "actual status" contract bullets were tried as
		// one concise bullet (9,849 chars) and RESTORED verbatim the same day
		// after case 14 regressed to 3/6 on the Pareto route; measured with them
		// back: system prompt 10,701 chars. Caps at measured + ~5%.
		// RE-BASELINED 2026-09-23 (tasker 97): two Final Response Contract
		// bullets, on picking a project back up and on interviewing (+419 chars,
		// 11,020 → 11,439). Book-loop evidence: t13 answered "where are we?" with
		// a task table and never named the book; t08/t09 asked 10-11 questions a
		// turn. Cap at measured + ~2.5%; the payload cap below binds first (76,588
		// of 76,600 measured).
		expect(breakdown.system_prompt.chars).toBeLessThanOrEqual(11_700);
		// Postdeploy 2026-09-04: add the executable relationship tool and explicit
		// endpoint references, plus the nested estimate schema. Keep the system
		// prose cap unchanged; the worker defers the contract from opening passes.
		// RE-BASELINED 2026-09-18 (planning layer + Jev tool selection): the canonical
		// project surface grew to the full planning catalog (tool schemas 10,410 →
		// 15,762 est tokens; payload 76,814 chars / 19,204 est tokens). These caps now
		// bound the unnarrowed catalog, which a Jev fallback or surface repair pays;
		// Jev-selected opening passes carried ~40% of it on the live eval
		// (docs/research/jev-tool-selection-2026-09-18). Caps at measured + ~5%.
		expect(breakdown.provider_payload_estimate.chars).toBeLessThanOrEqual(76_600);
		expect(breakdown.provider_payload_estimate.est_tokens).toBeLessThanOrEqual(19_150);
		// Per-turn multiplier guard: ratchet this down when the pass count drops
		// instead of hiding pass-count drift.
		expect(providerPayloadTokensPerTurn).toBeLessThanOrEqual(57_450);
		expect(toolSchemaTokensPerTurn).toBeLessThanOrEqual(49_000);
		// A single verbose schema can dominate every pass even while the aggregate
		// surface remains under budget. Keep that failure attributable by tool.
		// 2026-09-10: the batch lane removed the contract DSL from acting-model
		// surfaces. update_onto_task is now the largest mounted schema at 796
		// estimated tokens. Pin its identity and retain about 5% headroom.
		// 2026-09-12: reviewed task evidence/recurrence guidance raises it to 854;
		// keep its identity pinned and 46 estimated tokens of headroom.
		expect(
			toolSurface.tools.find((tool) => tool.estimatedTokens === largestToolSchemaTokens)?.name
		).toBe('update_onto_task');
		expect(largestToolSchemaTokens).toBeLessThanOrEqual(900);
	});
});
