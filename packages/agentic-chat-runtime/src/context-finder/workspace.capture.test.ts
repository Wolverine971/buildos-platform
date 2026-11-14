// packages/agentic-chat-runtime/src/context-finder/workspace.capture.test.ts
//
// Capture in global chat: a message that brings new things to save gets likely homes, even
// when the scope answer is "needs no saved records". Cases are shaped like two real turns
// (2026-11-06 and 2026-11-08) that got no project context and asked where to file.
import { describe, expect, it, vi } from 'vitest';
import {
	buildWorkspaceCards,
	buildWorkspaceFinderRequest,
	findWorkspaceContext,
	renderWorkspaceContextBlock,
	selectWorkspaceProjects,
	type WorkspaceFinderDecider,
	type WorkspaceProjectInputV1,
	type WorkspaceRankingV1
} from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function project(n: number, name: string): WorkspaceProjectInputV1 {
	return {
		project: {
			id: id(n),
			name,
			description: `About ${name}.`,
			state_key: 'active',
			next_step_short: `Next for ${name}`,
			updated_at: `2026-11-${String(n).padStart(2, '0')}T00:00:00Z`
		},
		documents: [
			{
				id: id(n * 100 + 1),
				title: `START HERE ${name}`,
				type_key: 'document.context.project',
				content: `# START HERE\n## Current state\n${name} is mid-flight.`,
				updated_at: '2026-11-01T00:00:00Z'
			}
		],
		tasks: [
			{
				id: id(n * 100 + 2),
				title: `Open task in ${name}`,
				state_key: 'todo',
				updated_at: '2026-11-02T00:00:00Z'
			}
		],
		goals: [],
		plans: [],
		milestones: [],
		risks: []
	};
}

const WORKSPACE: WorkspaceProjectInputV1 = {
	project: {
		id: id(9),
		name: 'Workspace',
		description: 'Boilerplate row text',
		state_key: 'active',
		updated_at: '2026-11-08T00:00:00Z',
		kind: 'workspace'
	},
	documents: [],
	tasks: [
		{
			id: id(901),
			title: 'Renew passport',
			state_key: 'todo',
			updated_at: '2026-11-07T00:00:00Z'
		}
	],
	goals: [],
	plans: [],
	milestones: [],
	risks: []
};

const CADRE = project(1, 'The Cadre');
const CONTENT = project(2, 'The Cadre Content Operations');
const OTHER = project(3, 'Fading Crown');
const ALL = [CADRE, CONTENT, OTHER, WORKSPACE];

const receipt = {
	modelRequested: 'jev',
	modelUsed: 'jev',
	requestId: 'r',
	inputTokens: 100,
	outputTokens: 1,
	costUsd: 0.0001,
	durationMs: 10,
	requestBytes: 1,
	questionCount: 1,
	attempts: 1
};

/** Hop 1 only: scope, dig, save (left out when undefined) and a score per card by name. */
function hop1(input: {
	scope: 'projects' | 'portfolio' | 'none';
	save?: number;
	dig?: number;
	scores?: Record<string, number>;
}): WorkspaceFinderDecider & { hop2Calls: number } {
	const decider = {
		hop2Calls: 0,
		async decide(request: Parameters<WorkspaceFinderDecider['decide']>[0]) {
			if (!('scope' in request.questions)) {
				decider.hop2Calls++;
				return { ok: true as const, answers: {}, receipt };
			}
			const state = request.state as { projects: { ref: string; name: string }[] };
			const answers: Record<string, unknown> = {
				scope: {
					type: 'choice',
					choice: input.scope,
					probabilities: { [input.scope]: 0.9 },
					confidence: 0.9
				},
				dig: { type: 'noul', noul: input.dig ?? 0.2 }
			};
			if (input.save !== undefined) answers.save = { type: 'noul', noul: input.save };
			for (const card of state.projects)
				answers[`p_${card.ref}`] = {
					type: 'noul',
					noul: input.scores?.[card.name] ?? 0.05
				};
			return { ok: true as const, answers, receipt };
		}
	};
	return decider as WorkspaceFinderDecider & { hop2Calls: number };
}

const ranking = (input: {
	choice: 'projects' | 'portfolio' | 'none';
	save?: number | null;
	projects: { n: number; p: number; workspace?: true }[];
}): WorkspaceRankingV1 =>
	({
		status: 'ranked',
		scope: { choice: input.choice, probabilities: {}, confidence: 0.9 },
		dig: 0.2,
		...(input.save === undefined ? {} : { save: input.save }),
		projects: input.projects.map(({ n, p, workspace }) => ({
			id: id(n),
			name: `P${n}`,
			ref: `P${n}`,
			p,
			...(workspace ? { workspace } : {})
		})),
		titleCap: 40,
		checked: input.projects.length,
		unchecked: 0,
		requestBytes: 1,
		durationMs: 1,
		costUsd: null,
		stage: {} as WorkspaceRankingV1['stage']
	}) as WorkspaceRankingV1;

describe('the save question', () => {
	it('asks whether the message brings things to keep, apart from lookups and calendar, email or web actions', () => {
		const request = buildWorkspaceFinderRequest({
			cards: buildWorkspaceCards([CADRE]),
			message: 'hi'
		});
		const save = request.questions.save as { type: string; instructions: { question: string } };
		expect(save.type).toBe('noul');
		expect(save.instructions.question).toContain('new information the user wants kept');
		expect(save.instructions.question).toContain('calendar, email or web');
		// The scope criteria and the policy the eval ran with are untouched.
		const scope = request.questions.scope as { criteria: Record<string, string> };
		expect(scope.criteria.none).toBe(
			'Needs no saved project records: calendar or email lookups, browsing a web page, general knowledge, greetings, thanks or small talk.'
		);
		expect(request.state.policy).toHaveLength(5);
	});
});

describe('selectWorkspaceProjects: capture', () => {
	it('picks homes for a capture the scope called none', () => {
		const selection = selectWorkspaceProjects(
			ranking({
				choice: 'none',
				save: 0.86,
				projects: [
					{ n: 1, p: 0.82 },
					{ n: 2, p: 0.6 },
					{ n: 9, p: 0.3, workspace: true },
					{ n: 3, p: 0.05 }
				]
			})
		);
		expect(selection).toMatchObject({
			scope: 'projects',
			capture: true,
			dig: false,
			zoom: [{ id: id(1) }, { id: id(2) }],
			home: { id: id(9), p: 0.3 }
		});
	});

	it('keeps scope none, with the Workspace as the home, when no project matches', () => {
		const selection = selectWorkspaceProjects(
			ranking({
				choice: 'none',
				save: 0.9,
				projects: [
					{ n: 9, p: 0.35, workspace: true },
					{ n: 1, p: 0.1 }
				]
			})
		);
		expect(selection).toMatchObject({
			scope: 'none',
			capture: true,
			zoom: [],
			home: { id: id(9) }
		});
	});

	it('leaves lookups, small talk and rankings without the answer exactly as before', () => {
		const projects = [
			{ n: 1, p: 0.9 },
			{ n: 9, p: 0.5, workspace: true as const }
		];
		const lookup = selectWorkspaceProjects(ranking({ choice: 'none', save: 0.12, projects }));
		expect(lookup).toEqual({
			policy: 'workspace_v1',
			scope: 'none',
			zoom: [],
			dig: false,
			nearby: [],
			pulse: []
		});
		// A ranking from before the question existed, and a failed answer.
		expect(selectWorkspaceProjects(ranking({ choice: 'none', projects }))).toEqual(lookup);
		expect(selectWorkspaceProjects(ranking({ choice: 'none', save: null, projects }))).toEqual(
			lookup
		);
		// A projects turn that is not a capture carries no capture fields.
		const plain = selectWorkspaceProjects(ranking({ choice: 'projects', save: 0.1, projects }));
		expect(plain).not.toHaveProperty('capture');
		expect(plain).not.toHaveProperty('home');
		expect(plain.zoom.map((pick) => pick.id)).toEqual([id(1)]);
	});

	it('marks a capture on projects and portfolio turns without changing what they pick', () => {
		const projects = [
			{ n: 1, p: 0.9 },
			{ n: 2, p: 0.3 },
			{ n: 9, p: 0.2, workspace: true as const }
		];
		const base = selectWorkspaceProjects(ranking({ choice: 'projects', save: 0.1, projects }));
		const capture = selectWorkspaceProjects(
			ranking({ choice: 'projects', save: 0.8, projects })
		);
		expect(capture).toEqual({ ...base, capture: true, home: { id: id(9), name: 'P9', p: 0.2 } });
		const portfolio = selectWorkspaceProjects(
			ranking({ choice: 'portfolio', save: 0.8, projects })
		);
		expect(portfolio).toMatchObject({
			scope: 'portfolio',
			zoom: [],
			pulse: [{ id: id(1) }],
			capture: true
		});
		// No Workspace card (it was left out of an oversized request): still a capture.
		expect(
			selectWorkspaceProjects(
				ranking({ choice: 'none', save: 0.8, projects: [{ n: 1, p: 0.9 }] })
			)
		).toMatchObject({ capture: true, home: null, zoom: [{ id: id(1) }] });
	});

	it('honors a threshold override for eval sweeps', () => {
		const input = ranking({ choice: 'none', save: 0.6, projects: [{ n: 1, p: 0.9 }] });
		expect(selectWorkspaceProjects(input, { saveThreshold: 0.7 }).zoom).toEqual([]);
		expect(selectWorkspaceProjects(input, { saveThreshold: 0.5 }).zoom).toHaveLength(1);
	});
});

describe('findWorkspaceContext: capture', () => {
	// 2026-11-08: "This week I'm in Texas doing a shooting course, the cadre … I need to call
	// Frontier Airlines and get a refund for my checked bag". Scope came back `none`.
	it('names the likely homes with ids and briefs, and the Workspace for the rest', async () => {
		const loadProject = vi.fn();
		const decider = hop1({
			scope: 'none',
			save: 0.88,
			dig: 0.24,
			scores: { 'The Cadre': 0.84, 'The Cadre Content Operations': 0.58, Workspace: 0.3 }
		});
		const context = await findWorkspaceContext({
			projects: ALL,
			loadProject,
			decider,
			message: "This week I'm in Texas doing a shooting course, the cadre."
		});
		expect(context.status).toBe('selected');
		expect(context.selection).toMatchObject({ scope: 'projects', capture: true, dig: false });
		expect(context.zoom.map((entry) => [entry.project.name, entry.hop2])).toEqual([
			['The Cadre', 'skipped'],
			['The Cadre Content Operations', 'skipped']
		]);
		// No record search and no project load: a capture needs homes, not evidence.
		expect(loadProject).not.toHaveBeenCalled();
		expect(decider.hop2Calls).toBe(0);
		const block = renderWorkspaceContextBlock(context)!;
		expect(block).toContain('appears to bring new things to save');
		expect(block).toContain('The projects below are the likely homes, best match first');
		expect(block).toContain(`# Project: The Cadre (project_id ${id(1)})`);
		expect(block).toContain(`# Project: The Cadre Content Operations (project_id ${id(2)})`);
		// What each is, and what already exists there.
		expect(block).toContain('The Cadre is mid-flight.');
		expect(block).toContain(`- task ${id(102)} Open task in The Cadre [todo]`);
		expect(block).toContain(
			`Anything that fits no project goes to the user's Workspace (project_id ${id(9)}).`
		);
		expect(block).not.toContain('Fading Crown');
	});

	// 2026-11-06: a to-do list that belongs to no project.
	it('names the Workspace as the home when no project matches', async () => {
		const context = await findWorkspaceContext({
			projects: ALL,
			loadProject: vi.fn(),
			decider: hop1({ scope: 'none', save: 0.9, scores: { Workspace: 0.3 } }),
			message: 'Todo list for tomorrow: mow the lawn, do laundry.'
		});
		expect(context.status).toBe('selected');
		expect(context.selection.scope).toBe('none');
		expect(context.zoom).toEqual([]);
		const block = renderWorkspaceContextBlock(context)!;
		expect(block).toContain('no project clearly matches them');
		expect(block).toContain(`the user's Workspace (project_id ${id(9)})`);
		expect(block).not.toContain('most likely about the project');
		expect(block).not.toContain('# Project:');
	});

	it('shows the Workspace itself as the home when it is the only match', async () => {
		const context = await findWorkspaceContext({
			projects: ALL,
			loadProject: vi.fn(),
			decider: hop1({ scope: 'projects', save: 0.9, scores: { Workspace: 0.9 } }),
			message: 'Add to my loose list: renew passport.'
		});
		const block = renderWorkspaceContextBlock(context)!;
		expect(block).toContain('no project clearly matches them');
		expect(block).toContain(
			`# The user's Workspace: loose notes and tasks, not a project (project_id ${id(9)})`
		);
		// Its brief lists what is already loose, so a duplicate is visible.
		expect(block).toContain(`- task ${id(901)} Renew passport [todo]`);
	});

	it('still loads nothing for lookups and small talk', async () => {
		for (const save of [0.1, undefined]) {
			const context = await findWorkspaceContext({
				projects: ALL,
				loadProject: vi.fn(),
				decider: hop1({ scope: 'none', save, scores: { 'The Cadre': 0.9 } }),
				message: 'what calendars can you see?'
			});
			expect(context.status).toBe('skipped');
			expect(renderWorkspaceContextBlock(context)).toBeNull();
		}
	});

	it('adds the homes line to a portfolio pulse and leaves a plain projects turn unframed', async () => {
		const pulse = await findWorkspaceContext({
			projects: ALL,
			loadProject: vi.fn(),
			decider: hop1({ scope: 'portfolio', save: 0.8, scores: { 'The Cadre': 0.8 } }),
			message: 'Here is where everything stands, save it all.'
		});
		const pulseBlock = renderWorkspaceContextBlock(pulse)!;
		expect(pulseBlock).toContain('PORTFOLIO PULSE');
		expect(pulseBlock).toContain(
			`each belongs with the project it is about, or with the user's Workspace (project_id ${id(9)}) when none fits`
		);

		const plain = await findWorkspaceContext({
			projects: ALL,
			loadProject: vi.fn(),
			decider: hop1({ scope: 'projects', save: 0.1, scores: { 'The Cadre': 0.9 } }),
			message: "what's going on with the cadre?"
		});
		expect(renderWorkspaceContextBlock(plain)).not.toContain('things to save');
	});
});
