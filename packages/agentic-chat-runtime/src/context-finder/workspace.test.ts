// packages/agentic-chat-runtime/src/context-finder/workspace.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildWorkspaceCards,
	buildWorkspaceFinderRequest,
	capWorkspaceCards,
	findWorkspaceContext,
	renderWorkspaceContextBlock,
	selectWorkspaceProjects,
	workspaceZoomShare,
	type WorkspaceFinderDecider,
	type WorkspaceProjectInputV1,
	type WorkspaceRankingV1
} from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function project(
	n: number,
	overrides: Partial<WorkspaceProjectInputV1> = {}
): WorkspaceProjectInputV1 {
	return {
		project: {
			id: id(n),
			name: `Project ${n}`,
			description: `About project ${n}.`,
			state_key: 'active',
			next_step_short: `Next for ${n}`,
			updated_at: `2026-09-${String(10 + n).padStart(2, '0')}T00:00:00Z`
		},
		documents: [
			{
				id: id(n * 100 + 1),
				title: `START HERE ${n}`,
				type_key: 'document.context.project',
				content: `# START HERE\n## What this is\nA thing.\n## Current state\nShipping v${n}.\n## Decisions\nNone.`,
				updated_at: '2026-09-20T00:00:00Z'
			},
			{
				id: id(n * 100 + 2),
				title: `Notes ${n}`,
				type_key: 'document.knowledge',
				content: `## Budget\nCosts $${n}00.\n## People\nLogan runs it.`,
				updated_at: '2026-09-19T00:00:00Z'
			}
		],
		tasks: [
			{
				id: id(n * 100 + 3),
				title: `Open task ${n}`,
				state_key: 'todo',
				updated_at: '2026-09-18T00:00:00Z'
			},
			{
				id: id(n * 100 + 4),
				title: `Done task ${n}`,
				state_key: 'done',
				updated_at: '2026-09-17T00:00:00Z'
			}
		],
		goals: [],
		plans: [],
		milestones: [],
		risks: [],
		...overrides
	};
}

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

/** Hop 1 answers from `projectScores` by card name; hop 2 scores records by title. */
function fakeDecider(input: {
	scope: 'projects' | 'portfolio' | 'none';
	projectScores: Record<string, number>;
	recordScores?: Record<string, number>;
	hop1DelayMs?: number;
}): WorkspaceFinderDecider & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async decide(request) {
			const state = request.state as {
				projects?: { ref: string; name: string }[];
				project?: { name: string };
				packets?: { ref: string; title: string; headings?: string[] }[];
			};
			const answers: Record<string, unknown> = {};
			if ('scope' in request.questions) {
				calls.push('projects');
				if (input.hop1DelayMs) await new Promise((r) => setTimeout(r, input.hop1DelayMs));
				calls.push('projects:done');
				answers.scope = {
					type: 'choice',
					choice: input.scope,
					probabilities: { [input.scope]: 0.9 },
					confidence: 0.9
				};
				for (const card of state.projects ?? [])
					answers[`p_${card.ref}`] = {
						type: 'noul',
						noul: input.projectScores[card.name] ?? 0.05
					};
				return { ok: true, answers, receipt };
			}
			calls.push(`records:${state.project?.name}`);
			for (const key of Object.keys(request.questions)) {
				const [, ref, heading] = key.split('_');
				const packet = state.packets?.find((p) => p.ref === ref);
				const title =
					heading === undefined ? packet?.title : packet?.headings?.[Number(heading)];
				answers[key] = { type: 'noul', noul: input.recordScores?.[title ?? ''] ?? 0.05 };
			}
			return { ok: true, answers, receipt };
		}
	};
}

describe('workspace cards', () => {
	it('shows titles, not bodies, and keeps START HERE out of the title list', () => {
		const [card] = buildWorkspaceCards([project(1)]);
		expect(card!.packet).toMatchObject({
			name: 'Project 1',
			state: 'active',
			next_step: 'Next for 1',
			documents: ['Notes 1'],
			open_tasks: ['Open task 1'],
			recently_done: ['Done task 1']
		});
		expect(JSON.stringify(card!.packet)).not.toContain('Logan runs it');
		expect(buildWorkspaceCards([project(1)], 0)[0]!.packet).not.toHaveProperty('documents');
	});

	it('shrinks title lists, then leaves out the least recently active projects', () => {
		const many = Array.from({ length: 12 }, (_, i) =>
			project(i + 1, {
				tasks: Array.from({ length: 40 }, (_, j) => ({
					id: id(5000 + i * 100 + j),
					title: `A fairly long open task title number ${j} for project ${i + 1}`,
					state_key: 'todo'
				}))
			})
		);
		const roomy = capWorkspaceCards(many, 'hi', { maxBytes: 200_000 });
		expect(roomy).toMatchObject({ titleCap: 40, unchecked: 0 });
		const tight = capWorkspaceCards(many, 'hi', { maxBytes: 12_000 });
		expect(tight.titleCap).toBeLessThan(40);
		expect(tight.requestBytes).toBeLessThanOrEqual(12_000);
		const tiny = capWorkspaceCards(many, 'hi', { maxBytes: 3_000 });
		expect(tiny.titleCap).toBe(0);
		expect(tiny.unchecked).toBeGreaterThan(0);
		// The newest projects are the ones kept.
		expect(tiny.cards.map((card) => card.name)).toContain('Project 12');
		expect(tiny.cards.map((card) => card.name)).not.toContain('Project 1');
	});

	it('asks one scope question plus one question per project, with the previous focus as refs', () => {
		const cards = buildWorkspaceCards([project(1), project(2)]);
		const request = buildWorkspaceFinderRequest({
			cards,
			message: 'what about Logan?',
			previousFocus: [id(2), id(999)]
		});
		expect(Object.keys(request.questions)).toEqual(['scope', 'p_P0', 'p_P1']);
		expect(request.questions.scope).toMatchObject({ type: 'choice' });
		expect(request.state.previous_focus).toEqual(['P1']);
	});
});

describe('selectWorkspaceProjects', () => {
	const ranking = (
		choice: 'projects' | 'portfolio' | 'none',
		scores: number[]
	): WorkspaceRankingV1 =>
		({
			status: 'ranked',
			scope: { choice, probabilities: {}, confidence: 0.9 },
			projects: scores.map((p, i) => ({ id: id(i + 1), name: `P${i}`, ref: `P${i}`, p })),
			titleCap: 40,
			checked: scores.length,
			unchecked: 0,
			requestBytes: 1,
			durationMs: 1,
			costUsd: null,
			stage: {} as WorkspaceRankingV1['stage']
		}) as WorkspaceRankingV1;

	it('zooms rank-relatively, at most three, and names the next ones', () => {
		const selection = selectWorkspaceProjects(
			ranking('projects', [0.9, 0.7, 0.6, 0.56, 0.4, 0.2])
		);
		expect(selection.zoom.map((p) => p.p)).toEqual([0.9, 0.7, 0.6]);
		expect(selection.nearby.map((p) => p.p)).toEqual([0.56, 0.4]);
	});

	it('zooms a lone low-scoring match above the floor', () => {
		expect(selectWorkspaceProjects(ranking('projects', [0.35, 0.1])).zoom).toHaveLength(1);
		expect(selectWorkspaceProjects(ranking('projects', [0.2, 0.1])).zoom).toHaveLength(0);
	});

	it('pulses on portfolio requests and loads nothing when no saved work is needed', () => {
		expect(selectWorkspaceProjects(ranking('portfolio', [0.9, 0.8, 0.1]))).toMatchObject({
			zoom: [],
			pulse: [{ p: 0.9 }, { p: 0.8 }]
		});
		expect(selectWorkspaceProjects(ranking('none', [0.9]))).toMatchObject({
			scope: 'none',
			zoom: [],
			pulse: []
		});
	});

	it('splits the evidence budget by rank', () => {
		expect(workspaceZoomShare(0, 1)).toEqual({ budgetChars: 14_000, maxSummaries: 20 });
		expect(workspaceZoomShare(1, 2)).toEqual({ budgetChars: 6_000, maxSummaries: 8 });
		expect(workspaceZoomShare(2, 3)).toEqual({ budgetChars: 4_000, maxSummaries: 4 });
	});
});

describe('findWorkspaceContext', () => {
	const projects = [project(1), project(2), project(3)];
	const byId = new Map(projects.map((p) => [p.project.id, p]));

	it('loads only the zoomed projects and ranks START HERE like any record', async () => {
		const decider = fakeDecider({
			scope: 'projects',
			projectScores: { 'Project 2': 0.9 },
			recordScores: { 'Notes 2': 0.8, People: 0.9, 'START HERE 2': 0.7 }
		});
		const loadProject = vi.fn(async (projectId: string) => byId.get(projectId)!);
		const context = await findWorkspaceContext({
			projects,
			loadProject,
			decider,
			message: 'who runs the Logan thing?'
		});
		expect(loadProject.mock.calls.map(([projectId]) => projectId)).toEqual([id(2)]);
		expect(context.status).toBe('selected');
		const full = context.zoom[0]!.evidence!.full;
		expect(full.map((item) => item.title)).toEqual(['Notes 2', 'START HERE 2']);
		expect(full[0]!.excerpts[0]!.heading).toBe('People');
		const block = renderWorkspaceContextBlock(context)!;
		expect(block).toContain(`# Project: Project 2 (project_id ${id(2)})`);
		expect(block).toContain('Logan runs it.');
		expect(context.costUsd).toBeGreaterThan(0);
	});

	it('starts the previous focus speculatively and reuses it when hop 1 agrees', async () => {
		const decider = fakeDecider({
			scope: 'projects',
			projectScores: { 'Project 1': 0.9 },
			recordScores: { 'Notes 1': 0.8 },
			hop1DelayMs: 5
		});
		const loadProject = vi.fn(async (projectId: string) => byId.get(projectId)!);
		const context = await findWorkspaceContext({
			projects,
			loadProject,
			decider,
			message: 'and the budget?',
			previousFocus: [id(1)],
			speculate: true
		});
		expect(loadProject).toHaveBeenCalledTimes(1);
		// Hop 2 for the guessed project ran while hop 1 was still in flight.
		expect(decider.calls.indexOf('records:Project 1')).toBeLessThan(
			decider.calls.indexOf('projects:done')
		);
		expect(context.zoom[0]!.evidence!.full[0]!.title).toBe('Notes 1');
	});

	it('says nothing matched instead of loading weak guesses', async () => {
		const context = await findWorkspaceContext({
			projects,
			loadProject: vi.fn(),
			decider: fakeDecider({ scope: 'projects', projectScores: {} }),
			message: 'quantum entanglement?'
		});
		expect(context.status).toBe('empty');
		expect(renderWorkspaceContextBlock(context)).toContain('None clearly matches');
	});

	it('pulses current state for portfolio requests and skips requests needing no saved work', async () => {
		const pulse = await findWorkspaceContext({
			projects,
			loadProject: vi.fn(),
			decider: fakeDecider({
				scope: 'portfolio',
				projectScores: { 'Project 3': 0.8, 'Project 1': 0.6 }
			}),
			message: "what's going on with my projects?"
		});
		expect(pulse.pulse.map((item) => item.name)).toEqual(['Project 3', 'Project 1']);
		expect(pulse.pulse[0]!.text).toContain('Shipping v3.');
		expect(renderWorkspaceContextBlock(pulse)).toContain('WORKSPACE PULSE');

		const loadProject = vi.fn();
		const skipped = await findWorkspaceContext({
			projects,
			loadProject,
			decider: fakeDecider({ scope: 'none', projectScores: { 'Project 1': 0.9 } }),
			message: 'what calendars can you see?'
		});
		expect(skipped.status).toBe('skipped');
		expect(loadProject).not.toHaveBeenCalled();
		expect(renderWorkspaceContextBlock(skipped)).toBeNull();
	});

	it('keeps the other projects when one zoomed project fails to load', async () => {
		const context = await findWorkspaceContext({
			projects,
			loadProject: async (projectId) => {
				if (projectId === id(1)) throw new Error('gone');
				return byId.get(projectId)!;
			},
			decider: fakeDecider({
				scope: 'projects',
				projectScores: { 'Project 1': 0.9, 'Project 2': 0.85 },
				recordScores: { 'Notes 2': 0.8 }
			}),
			message: 'compare them'
		});
		expect(context.zoom.map((entry) => entry.error)).toEqual(['Error', null]);
		expect(context.status).toBe('selected');
		expect(renderWorkspaceContextBlock(context)).toContain('unavailable; read it with tools');
	});
});
