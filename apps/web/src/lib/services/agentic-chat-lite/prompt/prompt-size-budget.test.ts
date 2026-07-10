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
import { getGatewaySurfaceForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { buildPromptCostBreakdown } from '$lib/services/agentic-chat-v2/prompt-cost-breakdown';
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
		expect(breakdown.system_prompt.chars).toBeLessThanOrEqual(20_000);
		expect(breakdown.provider_payload_estimate.chars).toBeLessThanOrEqual(31_500);
		expect(breakdown.provider_payload_estimate.est_tokens).toBeLessThanOrEqual(7_900);
	});
});
