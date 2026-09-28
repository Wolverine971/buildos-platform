// apps/web/src/lib/services/agentic-chat-lite/prompt/steward-prompt.test.ts
//
// Project stewards beta (docs/product/project-agents-plan-2026-09-25.md). A
// steward packet in the loaded project context turns project chat into the
// project's steward: its sections replace the generic identity, the START HERE
// excerpt's machine-owned regions, and the Knowledge Map. Without a packet the
// prompt is untouched.
import { describe, expect, it } from 'vitest';
import type { ProjectStewardPacket } from '@buildos/agentic-chat-runtime/context';
import { getGatewaySurfaceForContextType } from '@buildos/agentic-chat-runtime/catalog';
import {
	buildWorkerPromptScaffold,
	resolveWorkerPromptTools
} from '$lib/services/agentic-chat-v2/worker-prompt-surface';
import { buildLitePromptEnvelope } from './index';
import { formatStewardDate } from './steward-sections';

const WORKER_TOOLS = resolveWorkerPromptTools(getGatewaySurfaceForContextType('project')).tools;
const WORKER_SCAFFOLD = buildWorkerPromptScaffold({});
const NOW = '2026-09-26T16:00:00Z';

const CHARTER = [
	'Purpose: keep Launch Alpha moving and keep its record true.',
	'',
	'## Rules',
	'1. Nothing goes out (email, DM, post) without the owner’s send. (Kickoff doc, Sep 2)',
	'2. Pricing claims cite the pricing doc. (Pricing doc, Sep 10)'
].join('\n');

// Sized like a real mid-size project: a ~6K-char authored START HERE plus its
// machine-owned status and map regions, and a document tree with a large
// folder.
function authoredSection(heading: string, sentences: number): string {
	return [
		`## ${heading}`,
		'',
		...Array.from(
			{ length: sentences },
			(_, index) =>
				`- ${heading} note ${index + 1}: the beta cohort needs onboarding help before pricing is settled, and the design partners asked for weekly check-ins.`
		)
	].join('\n');
}

const MANAGED_MAP_LINES = Array.from(
	{ length: 24 },
	(_, index) =>
		`- Reference doc ${index + 1} - Long description of what this reference covers for the team [id: map-doc-${index + 1}]`
);

const START_HERE_CONTENT = [
	'# START HERE - Launch Alpha',
	'',
	'<!-- managed:status v=1 -->',
	'**State:** active · **Scale:** large · **Stage:** execution',
	'**Next step:** Post on social daily.',
	'<!-- /managed:status -->',
	'',
	authoredSection('What this is', 4),
	'',
	authoredSection('Current state', 12),
	'',
	authoredSection('Decisions and guardrails', 8),
	'',
	authoredSection('Vocabulary and mental model', 5),
	'',
	authoredSection('Open questions', 4),
	'',
	'<!-- managed:map v=1 -->',
	'## Where the detail lives',
	...MANAGED_MAP_LINES,
	'<!-- /managed:map -->'
].join('\n');

const DOC_STRUCTURE = {
	version: 1,
	root: [
		{
			id: 'doc-start-here',
			type: 'doc',
			order: 0,
			title: 'START HERE - Launch Alpha',
			children: []
		},
		{
			id: 'doc-beta',
			type: 'doc',
			order: 1,
			title: 'Beta plan',
			description: 'How the beta runs',
			children: [
				{ id: 'doc-beta-kit', type: 'doc', order: 0, title: 'Beta Kit', children: [] }
			]
		},
		{
			id: 'doc-pipeline',
			type: 'folder',
			order: 2,
			title: 'Content Pipeline',
			description: 'Runbooks and prompt snapshots for the content pipeline',
			children: Array.from({ length: 9 }, (_, index) => ({
				id: `doc-pipeline-${index + 1}`,
				type: 'doc',
				order: index,
				title: `Pipeline step ${index + 1}`,
				description: 'A runbook for one pipeline stage with inputs, outputs and gates',
				children: []
			}))
		},
		...Array.from({ length: 16 }, (_, index) => ({
			id: `doc-ref-${index + 1}`,
			type: 'doc',
			order: 3 + index,
			title: `Reference doc ${index + 1}`,
			description: 'Long description of what this reference covers for the team',
			children: []
		}))
	]
};

function stewardPacket(
	overrides: Partial<ProjectStewardPacket['charter']> = {}
): ProjectStewardPacket {
	return {
		version: 1,
		computed_at: NOW,
		charter: {
			text: CHARTER,
			approved_at: '2026-09-26T12:00:00Z',
			document_id: 'doc-charter',
			pending_edits_at: null,
			...overrides
		},
		facts: {
			goals: [
				{
					id: 'goal-1',
					name: 'Beta cohort onboarded',
					state: 'active',
					target_date: '2026-10-31',
					milestones: [
						{
							id: 'milestone-1',
							title: 'First paid session',
							state: 'pending',
							due_at: null
						}
					],
					plans: [],
					tasks: { open: 4, done: 2 }
				}
			],
			goals_omitted: 0,
			other_milestones: [],
			other_plans: [
				{
					id: 'plan-1',
					name: 'Marketing Plan',
					state: 'active',
					start_date: '2026-07-27',
					end_date: '2026-09-21',
					tasks: { open: 8, done: 10 }
				}
			],
			other_plans_completed: 4,
			tasks: {
				open: 37,
				todo: 30,
				in_progress: 5,
				blocked: 2,
				done: 23,
				overdue: 11,
				oldest_overdue_due_at: '2026-05-25T16:00:00Z',
				done_last_7_days: 1,
				unlinked_open: 12
			},
			in_progress: [
				{
					id: 'task-1',
					title: 'Deploy the talk page',
					due_at: null,
					updated_at: '2026-09-24T18:00:00Z'
				}
			],
			blocked: [],
			upcoming: [],
			changes_last_7_days: {
				total: 22,
				by_source: [
					{ source: 'Codex', count: 21 },
					{ source: 'BuildOS chat', count: 1 }
				],
				latest: [
					{
						source: 'Codex',
						entity_type: 'document',
						title: 'Beta Kit',
						at: '2026-09-25T14:00:00Z'
					},
					{
						source: 'BuildOS chat',
						entity_type: 'document',
						title: 'Thinking log',
						at: '2026-09-23T14:00:00Z'
					}
				]
			},
			document_updated_at: {
				'doc-ref-16': '2026-09-25T14:00:00Z',
				'doc-beta-kit': '2026-09-24T14:00:00Z'
			}
		}
	};
}

function projectData(steward: ProjectStewardPacket | null) {
	return {
		project: {
			id: 'project-1',
			name: 'Launch Alpha',
			state_key: 'active',
			description: 'Ship the Launch Alpha beta to the first cohort of design partners.',
			start_at: null,
			end_at: null,
			next_step_short: 'Send the outreach email by 7:30 PM today',
			updated_at: '2026-09-25T12:00:00Z'
		},
		start_here: {
			id: 'doc-start-here',
			title: 'START HERE - Launch Alpha',
			content: START_HERE_CONTENT,
			content_truncated: false,
			updated_at: '2026-09-26T12:00:00Z'
		},
		doc_structure: DOC_STRUCTURE,
		goals: [
			{
				id: 'goal-1',
				name: 'Beta cohort onboarded',
				state_key: 'active',
				description: 'Ten design partners actively using the beta.',
				target_date: '2026-10-31',
				updated_at: '2026-09-14T12:00:00Z'
			}
		],
		milestones: [
			{
				id: 'milestone-1',
				title: 'First paid session',
				state_key: 'pending',
				due_at: null,
				updated_at: '2026-09-14T12:00:00Z'
			}
		],
		plans: [
			{
				id: 'plan-1',
				name: 'Marketing Plan',
				state_key: 'active',
				updated_at: '2026-08-14T12:00:00Z'
			}
		],
		tasks: [
			{
				id: 'task-1',
				title: 'Deploy the talk page',
				state_key: 'in_progress',
				updated_at: '2026-09-24T18:00:00Z'
			},
			{
				id: 'task-2',
				title: 'Mark up the beta kit',
				state_key: 'todo',
				updated_at: '2026-09-24T18:00:00Z'
			}
		],
		documents: [],
		events: [],
		members: [],
		...(steward ? { steward } : {})
	};
}

function envelopeFor(
	steward: ProjectStewardPacket | null,
	patch: (data: ReturnType<typeof projectData>) => void = () => {}
) {
	const data = projectData(steward);
	patch(data);
	return buildLitePromptEnvelope({
		contextType: 'project',
		entityId: 'project-1',
		projectId: 'project-1',
		projectName: 'Launch Alpha',
		now: NOW,
		timezone: 'America/New_York',
		userDisplayName: 'DJ',
		tools: WORKER_TOOLS,
		scaffold: WORKER_SCAFFOLD,
		data
	});
}

function sectionContent(steward: ProjectStewardPacket | null, id: string): string {
	return envelopeFor(steward).sections.find((section) => section.id === id)?.content ?? '';
}

function occurrences(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

describe('project steward prompt', () => {
	it('leaves project chat untouched when there is no steward packet', () => {
		const envelope = envelopeFor(null);
		const ids = envelope.sections.map((section) => section.id);
		expect(ids).not.toContain('steward_charter');
		expect(ids).not.toContain('steward_live_facts');
		expect(ids).toContain('project_knowledge_map');
		expect(envelope.systemPrompt).toContain('You are a proactive project assistant');
		expect(envelope.systemPrompt).toContain('Saved next step (may predate recent work)');
	});

	it('speaks as the steward: identity, charter, narration, and Live Facts replace generic text', () => {
		const envelope = envelopeFor(stewardPacket());
		const ids = envelope.sections.map((section) => section.id);
		expect(ids[0]).toBe('identity_mission');
		expect(ids[1]).toBe('steward_charter');
		expect(ids.indexOf('steward_live_facts')).toBe(ids.indexOf('project_start_here') + 1);
		expect(ids).not.toContain('project_knowledge_map');

		const prompt = envelope.systemPrompt;
		expect(prompt).toContain('You are the Launch Alpha steward');
		expect(prompt).not.toContain('proactive project assistant');
		expect(prompt).toContain('Keep the goals true.');

		// The charter renders as instructions, with its heading demoted.
		const charter = envelope.sections.find((section) => section.id === 'steward_charter');
		expect(charter?.content).toContain('approved by the user on Sep 26');
		expect(charter?.content).toContain('**Rules**');
		expect(charter?.content).not.toContain('## Rules');
		expect(charter?.content).toContain('Pricing claims cite the pricing doc.');

		// Narration: START HERE without its machine-owned regions.
		const narration = envelope.sections.find((section) => section.id === 'project_start_here');
		expect(narration?.content).toContain('Your narration: START HERE');
		expect(narration?.content).toContain('## Current state');
		expect(narration?.content).not.toContain('Where the detail lives');
		expect(narration?.content).not.toContain('Post on social daily');

		// Live Facts: goals with ids, counts, sources, and the document map.
		const facts = envelope.sections.find((section) => section.id === 'steward_live_facts');
		expect(facts?.content).toContain(
			'- Beta cohort onboarded (active, target Oct 31) [id: goal-1] — tasks: 4 open, 2 done'
		);
		expect(facts?.content).toContain(
			'  - milestone: First paid session (pending) [id: milestone-1]'
		);
		expect(facts?.content).toContain(
			'Marketing Plan (active, window ended Sep 21) [id: plan-1]'
		);
		expect(facts?.content).toContain('37 open (30 to do, 5 in progress, 2 blocked)');
		expect(facts?.content).toContain('11 overdue, the oldest due May 25');
		expect(facts?.content).toContain('22 changes (Codex 21, BuildOS chat 1)');
		expect(facts?.content).toContain('- Content Pipeline [id: doc-pipeline] (9 inside)');
		expect(facts?.content).toContain('  - Beta Kit [id: doc-beta-kit]');

		// The stale saved next step and one-line digest picks give way.
		expect(prompt).not.toContain('Saved next step');
		expect(prompt).not.toContain('Send the outreach email by 7:30 PM today');
	});

	it('leads the document map with what was edited most recently', () => {
		const facts =
			envelopeFor(stewardPacket()).sections.find(
				(section) => section.id === 'steward_live_facts'
			)?.content ?? '';
		const lines = facts.split('\n');
		const mapLines = lines.slice(lines.findIndex((line) => line.startsWith('Documents (')));
		// START HERE and the charter render in their own sections, not the map.
		expect(mapLines[0]).toBe('Documents (28, most recently edited first):');
		expect(facts).not.toContain('doc-start-here');
		expect(mapLines[1]).toBe('- Reference doc 16 [id: doc-ref-16] (edited Sep 25)');
		// A folder sorts by its most recently edited child.
		expect(mapLines[2]).toBe('- Beta plan [id: doc-beta]');
		expect(mapLines[3]).toBe('  - Beta Kit [id: doc-beta-kit] (edited Sep 24)');
		expect(mapLines.at(-1)).toMatch(/^- \d+ more, inside folders or older: get_document_tree/);
	});

	it('renders each id Live Facts shows only once', () => {
		const prompt = envelopeFor(stewardPacket()).systemPrompt;
		for (const id of ['goal-1', 'milestone-1', 'plan-1', 'task-1', 'doc-beta-kit']) {
			expect(occurrences(prompt, `[id: ${id}]`) + occurrences(prompt, `"${id}"`)).toBe(1);
		}
		// Open work Live Facts doesn't list still renders below.
		expect(prompt).toContain('task-2');
	});

	it('flags unapproved charter edits without following them', () => {
		const envelope = envelopeFor(stewardPacket({ pending_edits_at: '2026-09-26T15:00:00Z' }));
		const charter = envelope.sections.find((section) => section.id === 'steward_charter');
		expect(charter?.content).toContain(
			"The charter document [id: doc-charter] has edits the user hasn't approved (saved Sep 26)"
		);
		expect(charter?.content).toContain("They are proposals: don't follow them");
		// DJ 2026-09-27: the steward offered to "take" pending edits it can't approve.
		expect(charter?.content).toContain(
			"Only the user's Approve in the chat header adopts them"
		);
	});

	it('ignores a malformed steward packet', () => {
		const malformed = { ...stewardPacket(), version: 2 } as unknown as ProjectStewardPacket;
		const envelope = envelopeFor(malformed);
		expect(envelope.sections.map((section) => section.id)).not.toContain('steward_charter');
		expect(envelope.systemPrompt).toContain('You are a proactive project assistant');
	});

	it('lets the story win on decisions and names what no tool can reach', () => {
		const identity = sectionContent(stewardPacket(), 'identity_mission');
		expect(identity).toContain(
			'Facts win on counts, dates, and recent changes; the story wins on decisions.'
		);
		expect(identity).toContain("don't record it yet");
		expect(identity).toContain('delegate_task starts a BuildOS agent, not them');
		expect(identity).toContain('never say it was sent, released, or underway');
		expect(identity).not.toContain('say what connecting it would unlock');
	});

	it('keeps the evidence rule but drops the construction exemplars and the three-question interview', () => {
		const classic = sectionContent(null, 'final_response_contract');
		const steward = sectionContent(stewardPacket(), 'final_response_contract');
		expect(classic).toContain('Permits approved: Unknown');
		expect(classic).toContain('ask at most three questions');
		expect(steward).not.toContain('Permits approved');
		expect(steward).not.toContain('ask at most three questions');
		expect(steward).toContain(
			'Separate what the records show from what happened in the world.'
		);
		// Measured 2026-09-27: classic 2,931 chars, steward 1,519.
		expect(steward.length).toBeLessThan(classic.length - 1_300);
	});

	it('drops the digest status block, whose saved next step goes stale, from Location', () => {
		const withIntelligence = (data: ReturnType<typeof projectData>) => {
			Object.assign(data, {
				project_intelligence: {
					generated_at: '2026-09-26T15:00:00Z',
					timezone: 'America/New_York',
					projects: [
						{
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							overdue_count: 1,
							due_soon_count: 0,
							upcoming_count: 0,
							recent_change_count: 3,
							next_step_short: 'Deploy the booking page',
							overdue_items: [
								{
									kind: 'task',
									id: 'task-2',
									title: 'Mark up the beta kit',
									due_at: '2026-09-20T16:00:00Z',
									state_key: 'todo'
								}
							],
							recent_changes: [
								{
									entity_type: 'document',
									entity_id: 'doc-beta-kit',
									title: 'Beta Kit',
									action: 'updated',
									changed_at: '2026-09-25T14:00:00Z'
								}
							]
						}
					]
				}
			});
		};
		const classic = envelopeFor(null, withIntelligence).sections.find(
			(section) => section.id === 'location_loaded_context'
		)?.content;
		const steward = envelopeFor(stewardPacket(), withIntelligence).sections.find(
			(section) => section.id === 'location_loaded_context'
		)?.content;
		expect(classic).toContain('Project status:');
		expect(steward).not.toContain('Project status:');
		expect(steward).not.toContain('Deploy the booking page');
		// The overdue task keeps its line with its id among the loaded work.
		expect(steward).toContain('task-2');
	});

	it('drops custom narration sections before Decisions when the story outgrows its budget', () => {
		const story = [
			'# START HERE - Launch Alpha',
			'',
			authoredSection('What this is', 4),
			'',
			authoredSection('The story so far', 30),
			'',
			authoredSection('Current state', 6),
			'',
			authoredSection('Decisions', 6)
		].join('\n');
		const narration =
			envelopeFor(stewardPacket(), (data) => {
				data.start_here.content = story;
			}).sections.find((section) => section.id === 'project_start_here')?.content ?? '';
		expect(narration).toContain('## Decisions');
		expect(narration).toContain('Decisions note 6');
		expect(narration).not.toContain('The story so far note 1');
		expect(narration).toContain('omitted sections: ## The story so far');
	});

	it('says which records failed to load instead of reporting them empty', () => {
		const packet = stewardPacket();
		packet.facts = { ...packet.facts, goals: [], unavailable: ['goals'] };
		const facts = sectionContent(packet, 'steward_live_facts');
		expect(facts).toContain('Not loaded this time (the read failed): goals.');
		expect(facts).not.toContain('Goals: none open');
	});

	it('reads midnight-UTC due dates as calendar dates', () => {
		const clock = { nowIso: NOW, timezone: 'America/New_York' };
		expect(formatStewardDate('2026-05-25T00:00:00+00:00', clock)).toBe('May 25');
		expect(formatStewardDate('2026-05-25T00:00:00.000Z', clock)).toBe('May 25');
		// A real instant still renders in the user's zone.
		expect(formatStewardDate('2026-05-25T02:00:00Z', clock)).toBe('May 24');
	});

	it('costs less than the generic project prompt on the same project', () => {
		const classic = envelopeFor(null).systemPrompt.length;
		const steward = envelopeFor(stewardPacket()).systemPrompt.length;
		// Measured 2026-09-26 on this fixture: classic 21,009 chars, steward
		// 18,404 (-12%). The steward's own sections (identity 1,940, charter 431,
		// Live Facts 1,668) are paid for by the Knowledge Map (2,694), the START
		// HERE map and status regions (8,106 -> 5,415), and the digest and work
		// lines Live Facts absorbs. On 9takes' real records with its 1.8K charter
		// the two come out even (22,971 vs 22,472); the cap leaves that room.
		expect(steward).toBeLessThan(classic);
		const stewardOwn = envelopeFor(stewardPacket())
			.sections.filter((section) =>
				['identity_mission', 'steward_charter', 'steward_live_facts'].includes(section.id)
			)
			.reduce((sum, section) => sum + section.chars, 0);
		expect(stewardOwn).toBeLessThanOrEqual(5_600);
	});
});
