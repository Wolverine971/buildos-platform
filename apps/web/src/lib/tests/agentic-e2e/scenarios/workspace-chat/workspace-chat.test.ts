// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/workspace-chat.test.ts
//
// Static guard for the Workspace chat battery (tasker/146). The live run is paid and
// writes to production as the harness account, so registration, case shape, the
// card reader and the destructive-reset account guard are checked here for free.
import { describe, expect, it } from 'vitest';
import type { TurnResult } from '../../harness/types';
import { scenarioCatalog } from '../catalog';
import { selectBattery } from '../../harness/battery';
import {
	WORKSPACE_RESET_ACCOUNT,
	findReadyProposalCard,
	harnessCivilDate,
	readyCardsForTool
} from './fixture';
import { RECAP_RULE, buildBroadOpenerRubric, buildWorkspaceListingRubric } from './rubrics';

const BATTERY = selectBattery(scenarioCatalog, 'workspace-chat');

/** Must match WORKSPACE_CHAT_SCENARIO_IDS in scripts/agentic/prod-battery-policy.ts. */
const EXPECTED: Array<[number, string, 'global' | 'project']> = [
	[1, 'workspace-01-save-note', 'global'],
	[2, 'workspace-02-whats-in-workspace', 'global'],
	[3, 'workspace-03-file-card', 'global'],
	[4, 'workspace-04-project-card', 'global'],
	[5, 'workspace-05-broad-opener', 'global'],
	[6, 'workspace-06-project-chat-stash', 'project']
];

const CARD = {
	card_rail: 'proposal_v1',
	status: 'proposal_ready',
	requires_user_action: true,
	saved: false,
	card_id: 'c1',
	kind: 'workspace_file',
	client_action: {
		kind: 'proposal_card',
		card_kind: 'workspace_file',
		card_id: 'c1',
		session_id: 's1',
		expires_at: '2026-10-26T00:00:00.000Z',
		payload: {
			version: 1,
			target: { id: 'P1', name: 'Harbor Bakery Launch' },
			items: [{ entity: 'document', id: 'ABC', kind: 'note', title: 'Flour' }]
		}
	},
	model_view: {},
	message: 'Needs your choice'
};

function turnWith(toolResults: Array<Record<string, unknown>>): TurnResult {
	return { toolResults, toolCalls: [], streamRunId: null } as unknown as TurnResult;
}

describe('workspace-chat battery registration', () => {
	it('registers the six cases in order with the ids the prod battery maps', () => {
		expect(BATTERY.map((scenario) => [scenario.batteryCase, scenario.id])).toEqual(
			EXPECTED.map(([number, id]) => [number, id])
		);
	});

	it('runs each case as one turn in the intended chat, with seed and cleanup', () => {
		for (const scenario of BATTERY) {
			const [, , context] = EXPECTED.find(([number]) => number === scenario.batteryCase)!;
			expect(scenario.category).toBe('workspace-chat');
			expect(scenario.title).toMatch(/^Workspace \d — /);
			expect(typeof scenario.seed).toBe('function');
			expect(typeof scenario.teardown).toBe('function');
			expect(scenario.turns).toHaveLength(1);
			expect(scenario.turns[0]!.contextType).toBe(context);
			expect(scenario.turns[0]!.message.trim().length).toBeGreaterThan(20);
		}
		const project = BATTERY.find((scenario) => scenario.batteryCase === 6)!;
		expect(
			project.turns[0]!.entityIdFromSeed?.({ projectId: 'p', entityIds: {}, notes: {} })
		).toBe('p');
	});

	it('declares write tools only on the two save cases and judges only the two prose cases', () => {
		expect(
			BATTERY.filter((scenario) => (scenario.requiredMutationTools ?? []).length > 0).map(
				(scenario) => scenario.batteryCase
			)
		).toEqual([1, 6]);
		expect(
			BATTERY.filter((scenario) => scenario.turns.some((turn) => turn.judge)).map(
				(scenario) => scenario.batteryCase
			)
		).toEqual([2, 5]);
	});

	it('keeps ids unique across the whole catalog', () => {
		const ids = scenarioCatalog.map((scenario) => scenario.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe('workspace-chat fixture', () => {
	it('resets the Workspace only for dedicated harness accounts', () => {
		expect(WORKSPACE_RESET_ACCOUNT.test('agentic-e2e-harness@example.com')).toBe(true);
		expect(WORKSPACE_RESET_ACCOUNT.test('agentic-e2e@example.com')).toBe(true);
		expect(WORKSPACE_RESET_ACCOUNT.test('djwayne35@gmail.com')).toBe(false);
		expect(WORKSPACE_RESET_ACCOUNT.test('agentic-e2e-harness@example.com.evil.io')).toBe(false);
	});

	it('finds a ready card however the transport nests it, and only a ready one', () => {
		expect(findReadyProposalCard({ tool_name: 'x', result: CARD })).toBe(CARD);
		expect(findReadyProposalCard({ result: { data: CARD } })).toBe(CARD);
		expect(findReadyProposalCard({ result: { ...CARD, status: 'blocked' } })).toBeNull();
		expect(findReadyProposalCard({ result: { message: 'Nothing changed.' } })).toBeNull();
	});

	it('reads the card kind and lowercased item keys from the live tool result', async () => {
		const cards = await readyCardsForTool(
			turnWith([
				{ tool_name: 'list_workspace_suggestions', result: { suggestions: [] } },
				{ tool_name: 'propose_workspace_filing', result: CARD }
			]),
			{} as never,
			'propose_workspace_filing'
		);
		expect(cards).toHaveLength(1);
		expect(cards[0]!.kind).toBe('workspace_file');
		expect(cards[0]!.itemKeys).toEqual(['document:abc']);
		expect((cards[0]!.payload.target as { id: string }).id).toBe('P1');
	});

	it('resolves civil dates in the harness time zone', () => {
		const now = new Date('2026-10-25T03:30:00.000Z'); // 23:30 on Oct 24 in New York
		expect(harnessCivilDate(0, now)).toBe('2026-10-24');
		expect(harnessCivilDate(-2, now)).toBe('2026-10-22');
		expect(harnessCivilDate(1, now)).toBe('2026-10-25');
	});
});

describe('workspace-chat rubrics', () => {
	it('fails a listing that drops, invents or misfiles an item', () => {
		const rubric = buildWorkspaceListingRubric({
			looseItems: [
				{ kind: 'note', title: 'A' },
				{ kind: 'task', title: 'B', detail: 'due in 5 days' }
			],
			projectName: 'P',
			projectTasks: ['C']
		});
		expect(rubric).toContain('exactly these 2 loose items');
		expect(rubric).toContain('- task: "B" (due in 5 days)');
		expect(rubric).toContain('it omits a loose item');
		expect(rubric).toContain('presents a project task as a Workspace item');
	});

	it('carries the seeded facts and the no-recap rule into the broad-opener rubric', () => {
		const rubric = buildBroadOpenerRubric({
			projectName: 'P',
			overdueTask: { title: 'Lease', due: 'Thursday' },
			dueTomorrowTask: { title: 'Oven', due: 'Sunday' },
			undatedTask: 'Menu',
			workspaceTaskDueToday: { title: 'Passport', due: 'Saturday' },
			workspaceNote: 'Pottery',
			pastConversationTopic: 'a flyer'
		});
		expect(rubric).toContain('"Lease" was due Thursday and is OVERDUE');
		expect(rubric).toContain('task "Passport" is due Saturday (today)');
		expect(rubric).toContain(RECAP_RULE);
	});
});
