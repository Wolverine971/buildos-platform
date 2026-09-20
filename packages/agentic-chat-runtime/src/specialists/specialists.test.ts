// packages/agentic-chat-runtime/src/specialists/specialists.test.ts
import { describe, expect, it } from 'vitest';
import {
	AGENTIC_CHAT_WORKFLOW_ADMITTED_MODELS,
	AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS,
	AGENTIC_CHAT_WORKFLOW_POLICY_V1
} from '@buildos/shared-types';
import {
	PROJECT_REVIEW_SPECIALISTS_V1,
	ProjectReviewAgentSelectorV1,
	SPECIALIST_REGISTRY_V1,
	createSpecialistRegistryV1,
	type AgentSelectionInputV1
} from './index';

const analyst = PROJECT_REVIEW_SPECIALISTS_V1.project_analyst;
const input: AgentSelectionInputV1 = {
	intent: 'project_review',
	question: 'What should happen next?',
	context: { type: 'project', projectId: 'project-1' },
	eligibleSpecialists: SPECIALIST_REGISTRY_V1.list().map(({ id, version }) => ({ id, version })),
	maxSpecialists: 2
};

describe('versioned specialist registry', () => {
	it('resolves old definitions exactly when a new version is registered', () => {
		const next = { ...structuredClone(analyst), version: 2, label: 'New analyst' };
		const registry = createSpecialistRegistryV1([analyst, next]);
		expect(registry.resolve({ id: analyst.id, version: 1 }).label).toBe('Project analyst');
		expect(registry.resolve({ id: analyst.id, version: 2 }).label).toBe('New analyst');
		expect(() => registry.resolve({ id: analyst.id, version: 3 })).toThrow(
			'Unknown specialist'
		);
		expect(() => registry.resolve({ id: 'unknown', version: 1 })).toThrow('Unknown specialist');
	});

	it('rejects ambiguous or invalid definition identities and budgets', () => {
		expect(() => createSpecialistRegistryV1([analyst, analyst])).toThrow(
			'Duplicate specialist'
		);
		for (const definition of [
			{ ...analyst, version: 0 },
			{ ...analyst, id: 'bad@id' },
			{ ...analyst, limits: { ...analyst.limits, maxAttempts: Infinity } },
			{ ...analyst, budgetPolicy: { ...analyst.budgetPolicy, maxSpendMicroUsd: 0 } }
		])
			expect(() => createSpecialistRegistryV1([definition])).toThrow('Invalid specialist');
	});

	it('owns immutable copies so edits cannot change already resolved definitions', () => {
		const source = structuredClone(analyst);
		const registry = createSpecialistRegistryV1([source]);
		Reflect.set(source.instructions, 'system', 'Edited outside the registry');
		const resolved = registry.resolve(source);
		expect(resolved.instructions.system).toBe(analyst.instructions.system);
		expect(Reflect.set(resolved.instructions, 'system', 'Changed')).toBe(false);
		expect(Reflect.set(resolved.capabilities.allowedToolIds, '0', 'delete_project')).toBe(
			false
		);
		expect(Reflect.set(registry.list(), '0', source)).toBe(false);
	});

	it('keeps the baseline within the frozen tool-free workflow policy', () => {
		for (const [id, definition] of Object.entries(PROJECT_REVIEW_SPECIALISTS_V1)) {
			expect(definition.capabilities).toEqual({
				domainAccess: 'read_only',
				allowedToolIds: [],
				allowedWorkflowIds: []
			});
			expect([
				definition.modelPolicy.primaryModel,
				...definition.modelPolicy.fallbackModels
			]).toEqual(AGENTIC_CHAT_WORKFLOW_ADMITTED_MODELS);
			expect(definition.limits.maxOutputTokens).toBe(
				AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS[
					id as keyof typeof PROJECT_REVIEW_SPECIALISTS_V1
				]
			);
			expect(definition.limits.maxAttempts).toBe(
				AGENTIC_CHAT_WORKFLOW_POLICY_V1.maxStepAttempts
			);
			expect(definition.budgetPolicy).toEqual({
				scope: 'workflow',
				id: AGENTIC_CHAT_WORKFLOW_POLICY_V1.version,
				maxSpendMicroUsd: AGENTIC_CHAT_WORKFLOW_POLICY_V1.maxSpendMicroUsd,
				wholeRunLifetimeMs: AGENTIC_CHAT_WORKFLOW_POLICY_V1.wholeRunLifetimeMs
			});
		}
	});
});

describe('deterministic selector baseline', () => {
	const selector = new ProjectReviewAgentSelectorV1();
	it('selects the same pinned pair regardless of candidate order, duplicates, or newer versions', async () => {
		const result = await selector.select({
			...input,
			eligibleSpecialists: [
				{ id: 'project_analyst', version: 2 },
				...[...input.eligibleSpecialists].reverse(),
				{ id: 'risk_reviewer', version: 1 },
				{ id: 'unrelated', version: 1 }
			]
		});
		expect(result).toMatchObject({ outcome: 'selected', selected: input.eligibleSpecialists });
		expect(Reflect.set(result.selected[0]!, 'version', 2)).toBe(false);
	});

	it('keeps ordinary chat on the generalist without pretending to infer relevance', async () => {
		expect(await selector.select({ ...input, intent: 'auto' })).toMatchObject({
			outcome: 'generalist',
			selected: []
		});
	});

	it('refuses incomplete eligibility without upgrading versions or silently changing chat mode', async () => {
		for (const eligibleSpecialists of [
			[],
			[input.eligibleSpecialists[0]!],
			[
				{ id: 'project_analyst', version: 2 },
				{ id: 'risk_reviewer', version: 1 }
			]
		])
			expect(await selector.select({ ...input, eligibleSpecialists })).toMatchObject({
				outcome: 'unavailable',
				selected: []
			});
	});

	it('honors context and fan-out bounds before selection', async () => {
		for (const overrides of [
			{ context: { type: 'global', projectId: null } },
			{ context: { type: 'project', projectId: ' ' } },
			{ question: ' ' },
			{ maxSpecialists: 1 },
			{ maxSpecialists: NaN }
		])
			expect(await selector.select({ ...input, ...overrides })).toMatchObject({
				outcome: 'unavailable',
				selected: []
			});
	});

	it('honors cancellation without producing a selection receipt', async () => {
		const controller = new AbortController();
		controller.abort(new Error('cancelled'));
		await expect(selector.select(input, controller.signal)).rejects.toThrow('cancelled');
	});
});
