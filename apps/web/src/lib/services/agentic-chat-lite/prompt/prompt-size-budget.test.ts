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
		const tools = getGatewaySurfaceForContextType('project');
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
		expect(breakdown.system_prompt.chars).toBeLessThanOrEqual(12_850);
		// Postdeploy 2026-09-04: add the executable relationship tool and explicit
		// endpoint references, plus the nested estimate schema. Keep the system
		// prose cap unchanged; the worker defers the contract from opening passes.
		expect(breakdown.provider_payload_estimate.chars).toBeLessThanOrEqual(55_000);
		expect(breakdown.provider_payload_estimate.est_tokens).toBeLessThanOrEqual(13_750);
		// Per-turn multiplier guard: ratchet this down when the pass count drops
		// instead of hiding pass-count drift.
		expect(providerPayloadTokensPerTurn).toBeLessThanOrEqual(41_250);
		expect(toolSchemaTokensPerTurn).toBeLessThanOrEqual(31_200);
		// A single verbose schema can dominate every pass even while the aggregate
		// surface remains under budget. Keep that failure attributable by tool.
		expect(largestToolSchemaTokens).toBeLessThanOrEqual(1_050);
	});
});
