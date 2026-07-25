// packages/agent-orchestrator/src/application/workflow-engine/workflow-engine.test.ts
import { describe, expect, it } from 'vitest';

import {
	AgentResultSchema,
	RouteDecisionSchema,
	type AgentResult,
	type ModelUsageEvent,
	type WorkflowStageSpec
} from '../../contracts';
import type { AgentExecutorPort, SynthesisModelPort, TransitionModelPort } from '../../ports';
import { executeWorkflow, WorkflowSafetyViolation } from './workflow-engine';

const projectId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

const permissionGrant = {
	mode: 'read_only' as const,
	project_ids: [projectId],
	operations: ['ontology.project.read', 'web.search', 'web.visit', 'artifact.read'],
	network: 'web_read' as const,
	artifact_types_read: ['context_packet', 'research_packet'],
	artifact_types_write: ['context_packet', 'research_packet'],
	expires_at: '2099-01-01T00:00:00.000Z'
};

const projectScope = [
	{
		project_id: projectId,
		project_name: 'Project Alpha',
		role: 'primary' as const,
		reason: 'The request is scoped to the frozen project.'
	}
];

function criterion(id: string) {
	return {
		criterion_id: id,
		description: 'Return the requested bounded artifact.',
		required: true,
		kind: 'judgment' as const,
		validator_id: null,
		validator_config: {}
	};
}

function stage(agentIds: string[]): WorkflowStageSpec {
	return {
		schema_version: 1,
		client_stage_key: agentIds[0] === 'librarian.v0' ? 'gather-context' : 'research',
		label: 'Run bounded specialists',
		purpose: 'Collect evidence for the objective.',
		steps: agentIds.map((agentId, index) => ({
			schema_version: 1,
			client_step_key: `step-${index + 1}`,
			agent_id: agentId,
			goal: 'Research the objective.',
			non_goals: ['Do not mutate data.'],
			input_artifact_ids: [],
			depends_on_step_keys: [],
			deliverable_type: agentId === 'librarian.v0' ? 'context_packet' : 'research_packet',
			acceptance_criteria: [criterion(`step-${index + 1}.valid`)],
			user_visible_label: 'Collecting evidence'
		})),
		join_policy: 'all',
		decision_gate: true,
		failure_policy: 'complete_partial'
	};
}

function route(initialStage: WorkflowStageSpec) {
	return RouteDecisionSchema.parse({
		schema_version: 1,
		route: 'workflow',
		reason_code:
			initialStage.steps[0]?.agent_id === 'librarian.v0'
				? 'context_research_recommendation'
				: 'multi_source_research',
		objective: 'Research and recommend the best current option.',
		project_ids: [projectId],
		confidence: 0.95,
		risk: 'medium',
		initial_stage: initialStage
	});
}

function usage(cost: number): ModelUsageEvent[] {
	return [
		{
			model: 'test-model',
			provider: 'test-provider',
			promptTokens: 100,
			completionTokens: 50,
			totalTokens: 150,
			totalCostUsd: cost,
			billingDisposition: 'settled'
		}
	];
}

function result(artifactType: string): AgentResult {
	return AgentResultSchema.parse({
		schema_version: 1,
		status: 'completed',
		summary: `Completed ${artifactType}.`,
		artifact_drafts: [
			{
				schema_version: 1,
				artifact_type: artifactType,
				summary: `${artifactType} evidence`,
				payload: { content: 'Cited evidence.' },
				provenance: []
			}
		],
		acceptance_results: [],
		open_questions: [],
		assumptions: [],
		residual_risks: [],
		confidence: 0.9,
		capability_gaps: []
	});
}

function synthesisModel(cost = 0.001): SynthesisModelPort {
	return {
		generateText: async () => ({ text: 'Final cited answer.', usage: usage(cost) })
	};
}

describe('in-memory Phase A workflow engine', () => {
	it('runs independent specialists concurrently, transitions, and synthesizes', async () => {
		let active = 0;
		let maximumActive = 0;
		let release: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const agentExecutor: AgentExecutorPort = {
			execute: async () => {
				active += 1;
				maximumActive = Math.max(maximumActive, active);
				if (active === 2) release?.();
				await gate;
				active -= 1;
				return {
					result: result('research_packet'),
					usage: usage(0.001),
					toolCostUsd: 0.001,
					toolCalls: [
						{ operation: 'web.search', effect: 'read', succeeded: true, error: null }
					]
				};
			}
		};
		const transitionModel: TransitionModelPort = {
			generateJson: async () => ({
				value: {
					schema_version: 1,
					action: 'complete',
					reason_code: 'objective_satisfied',
					rationale: 'Both research packets are ready.'
				},
				usage: usage(0.0005)
			})
		};

		const workflow = await executeWorkflow({
			routeDecision: route(stage(['researcher.v0', 'researcher.v0'])),
			permissionGrant,
			projectScope,
			agentExecutor,
			transitionModel,
			synthesisModel: synthesisModel(),
			runId,
			maxUsd: 0.05
		});

		expect(maximumActive).toBe(2);
		expect(workflow.status).toBe('completed');
		expect(workflow.output).toBe('Final cited answer.');
		expect(workflow.stages[0]?.steps).toHaveLength(2);
		expect(workflow.artifacts).toHaveLength(2);
		expect(workflow.totalCostUsd).toBeCloseTo(0.0045);
	});

	it('executes librarian then contextual research as two bounded stages', async () => {
		let transitionCalls = 0;
		let researcherSawContext = false;
		const agentExecutor: AgentExecutorPort = {
			execute: async (request) => {
				const librarian = request.step.agent_id === 'librarian.v0';
				if (!librarian) researcherSawContext = request.inputArtifacts.length === 1;
				return {
					result: result(librarian ? 'context_packet' : 'research_packet'),
					usage: librarian ? [] : usage(0.001),
					toolCostUsd: 0,
					toolCalls: []
				};
			}
		};
		const transitionModel: TransitionModelPort = {
			generateJson: async () => {
				transitionCalls += 1;
				return {
					value:
						transitionCalls === 1
							? {
									schema_version: 1,
									action: 'append_research',
									reason_code: 'more_research_required',
									rationale:
										'The reference is resolved; current evidence is still needed.'
								}
							: {
									schema_version: 1,
									action: 'complete',
									reason_code: 'objective_satisfied',
									rationale: 'The research packet is ready.'
								},
					usage: usage(0.0005)
				};
			}
		};

		const workflow = await executeWorkflow({
			routeDecision: route(stage(['librarian.v0'])),
			permissionGrant,
			projectScope,
			agentExecutor,
			transitionModel,
			synthesisModel: synthesisModel(),
			runId
		});
		expect(workflow.status).toBe('completed');
		expect(workflow.stageCount).toBe(2);
		// Both gates on this path leave exactly one legal action, so neither reaches the model.
		// See PHASE_A_AUDIT_2026-07-25.md S1.
		expect(transitionCalls).toBe(0);
		expect(workflow.transitionModelCalls).toBe(0);
		expect(workflow.forcedTransitions).toBe(2);
		expect(workflow.transitions.map((decision) => decision.action)).toEqual([
			'append_stage',
			'complete'
		]);
		expect(researcherSawContext).toBe(true);
		expect(workflow.replanCount).toBe(0);
	});

	it('reaches the transition model only when the gate has more than one legal action', async () => {
		// A partial stage may legally complete_partial or fail, so this gate is a real decision and
		// must not be decided in code. See PHASE_A_AUDIT_2026-07-25.md S1.
		let transitionCalls = 0;
		const partialResult = AgentResultSchema.parse({
			...result('research_packet'),
			status: 'partial',
			summary: 'Partial research.'
		});
		const workflow = await executeWorkflow({
			routeDecision: route(stage(['researcher.v0'])),
			permissionGrant,
			projectScope,
			agentExecutor: {
				execute: async () => ({
					result: partialResult,
					usage: [],
					toolCostUsd: 0,
					toolCalls: []
				})
			},
			transitionModel: {
				generateJson: async () => {
					transitionCalls += 1;
					return {
						value: {
							schema_version: 1,
							action: 'complete_partial',
							reason_code: 'partial_objective_satisfied',
							rationale: 'The evidence is incomplete but usable.'
						},
						usage: usage(0.0005)
					};
				}
			},
			synthesisModel: synthesisModel(),
			runId
		});

		expect(transitionCalls).toBe(1);
		expect(workflow.transitionModelCalls).toBe(1);
		expect(workflow.forcedTransitions).toBe(0);
		expect(workflow.status).toBe('partial');
	});

	it('stops immediately when an agent reports a write tool call', async () => {
		const agentExecutor: AgentExecutorPort = {
			execute: async () => ({
				result: result('research_packet'),
				usage: [],
				toolCostUsd: 0,
				toolCalls: [
					{
						operation: 'ontology.task.update',
						effect: 'write',
						succeeded: true,
						error: null
					}
				]
			})
		};
		await expect(
			executeWorkflow({
				routeDecision: route(stage(['researcher.v0'])),
				permissionGrant,
				projectScope,
				agentExecutor,
				transitionModel: {
					generateJson: async () => {
						throw new Error('must not transition');
					}
				},
				synthesisModel: synthesisModel(),
				runId
			})
		).rejects.toBeInstanceOf(WorkflowSafetyViolation);
	});

	it('fails closed when a completed stage exhausts the in-memory USD budget', async () => {
		let transitionCalls = 0;
		const workflow = await executeWorkflow({
			routeDecision: route(stage(['researcher.v0'])),
			permissionGrant,
			projectScope,
			agentExecutor: {
				execute: async () => ({
					result: result('research_packet'),
					usage: usage(0.02),
					toolCostUsd: 0,
					toolCalls: []
				})
			},
			transitionModel: {
				generateJson: async () => {
					transitionCalls += 1;
					return { value: {}, usage: [] };
				}
			},
			synthesisModel: synthesisModel(),
			runId,
			maxUsd: 0.01
		});
		expect(workflow.status).toBe('failed');
		expect(workflow.budgetExceeded).toBe(true);
		expect(workflow.output).toBe('');
		expect(transitionCalls).toBe(0);
	});
});
