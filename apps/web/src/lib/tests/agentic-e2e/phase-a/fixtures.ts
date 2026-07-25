// apps/web/src/lib/tests/agentic-e2e/phase-a/fixtures.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ProjectSpec } from '$lib/types/onto';
import type { ScenarioContext, SeedResult } from '../harness/types';
import { harnessProjectName, seedScenarioProject } from '../harness/seed';

export interface FrozenAcceptanceCheck {
	validator_id: string;
	description: string;
	required: boolean;
	config: Record<string, unknown>;
}

export interface FrozenPhaseAScenario {
	scenario_id: string;
	class: string;
	request_text: string;
	context_type: 'project' | 'global';
	expected_route: 'direct' | 'workflow' | 'clarify' | 'capability_gap';
	expected_reason_code: string;
	acceptance_checks: FrozenAcceptanceCheck[];
}

interface SnapshotTask {
	id: string;
	title: string;
	description: string;
	state: 'todo' | 'in_progress' | 'blocked' | 'done';
	priority: number;
	start_at: string | null;
	due_at: string | null;
	pillar: string;
}

interface SnapshotDocument {
	id: string;
	title: string;
	state: 'draft' | 'ready';
	content: string;
}

interface SnapshotGoal {
	id: string;
	name: string;
	description: string;
	state: 'draft' | 'active' | 'done';
	target_date: string | null;
}

interface SnapshotPlan {
	id: string;
	name: string;
	description: string;
	state: 'draft' | 'active' | 'done';
}

interface SnapshotEdge {
	source_id: string;
	source_kind: 'goal' | 'plan' | 'task' | 'document';
	target_id: string;
	target_kind: 'goal' | 'plan' | 'task' | 'document';
	relationship: string;
}

interface PhaseAProjectSnapshot {
	snapshot_id: string;
	as_of: string;
	project: {
		id: string;
		name: string;
		description: string;
		state: string;
		stage: string;
		next_step: string;
	};
	tasks: SnapshotTask[];
	documents: SnapshotDocument[];
	goals: SnapshotGoal[];
	plans: SnapshotPlan[];
	edges: SnapshotEdge[];
}

interface FrozenPhaseACorpus {
	corpus_version: string;
	status: 'frozen';
	snapshot_sha256: string;
	scenarios: FrozenPhaseAScenario[];
}

const HARNESS_ROOT = '../../../../../../../packages/agent-orchestrator/src/testing/harness/';

function readFixture<T>(relativePath: string): T {
	return JSON.parse(
		readFileSync(
			fileURLToPath(new URL(`${HARNESS_ROOT}${relativePath}`, import.meta.url)),
			'utf8'
		)
	) as T;
}

export const frozenPhaseACorpus = readFixture<FrozenPhaseACorpus>('corpus/phase-a.json');
export const phaseAProjectSnapshot = readFixture<PhaseAProjectSnapshot>(
	'fixtures/project-alpha.snapshot.json'
);

function tempId(kind: string, sourceId: string): string {
	return `${kind}-${sourceId.slice(-4)}`;
}

export function buildPhaseAProjectSpec(label: string): ProjectSpec {
	const snapshot = phaseAProjectSnapshot;
	const entities: ProjectSpec['entities'] = [];

	for (const goal of snapshot.goals) {
		entities.push({
			temp_id: tempId('goal', goal.id),
			kind: 'goal',
			name: goal.name,
			description: goal.description,
			state_key: goal.state,
			target_date: goal.target_date ?? undefined
		});
	}
	for (const plan of snapshot.plans) {
		entities.push({
			temp_id: tempId('plan', plan.id),
			kind: 'plan',
			name: plan.name,
			description: plan.description,
			state_key: plan.state
		});
	}
	for (const task of snapshot.tasks) {
		entities.push({
			temp_id: tempId('task', task.id),
			kind: 'task',
			title: task.title,
			description: task.description,
			state_key: task.state,
			priority: task.priority,
			start_at: task.start_at ?? undefined,
			due_at: task.due_at ?? undefined,
			props: { pillar: task.pillar }
		});
	}
	for (const document of snapshot.documents) {
		entities.push({
			temp_id: tempId('document', document.id),
			kind: 'document',
			title: document.title,
			body_markdown: document.content,
			state_key: document.state
		});
	}

	return {
		project: {
			name: harnessProjectName(`Phase A ${label}`),
			type_key: 'project.personal.performance_training',
			state_key: snapshot.project.state,
			description:
				`${snapshot.project.description}\n\n` +
				`Fixture alias: ${snapshot.project.name}. Snapshot as of ${snapshot.as_of}. ` +
				`Stage: ${snapshot.project.stage}. Next step: ${snapshot.project.next_step}`,
			props: {
				phase_a_snapshot_id: snapshot.snapshot_id,
				phase_a_snapshot_as_of: snapshot.as_of,
				phase_a_fixture_alias: snapshot.project.name
			}
		},
		entities,
		relationships: snapshot.edges.map((edge) => ({
			from: {
				temp_id: tempId(edge.source_kind, edge.source_id),
				kind: edge.source_kind
			},
			to: {
				temp_id: tempId(edge.target_kind, edge.target_id),
				kind: edge.target_kind
			},
			rel: edge.relationship
		}))
	};
}

export function seedPhaseAProject(ctx: ScenarioContext, scenarioId: string): Promise<SeedResult> {
	return seedScenarioProject(ctx, buildPhaseAProjectSpec(scenarioId));
}
