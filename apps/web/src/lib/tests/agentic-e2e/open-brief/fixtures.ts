// apps/web/src/lib/tests/agentic-e2e/open-brief/fixtures.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { OpenBriefSnapshot } from '../../../../../../../packages/agent-orchestrator/src/testing/harness/open-brief-eval';
import { OpenBriefSnapshotSchema } from '../../../../../../../packages/agent-orchestrator/src/testing/harness/open-brief-eval';
import type { ProjectSpec } from '$lib/types/onto';
import type { ScenarioContext, SeedResult } from '../harness/types';
import { harnessProjectName, seedScenarioProject } from '../harness/seed';

const CORPUS_ROOT = '../../../../../../../docs/architecture/agent-first-orchestration/corpus/';

function readSnapshot(filename: string): OpenBriefSnapshot {
	return OpenBriefSnapshotSchema.parse(
		JSON.parse(
			readFileSync(
				fileURLToPath(new URL(`${CORPUS_ROOT}fixtures/${filename}`, import.meta.url)),
				'utf8'
			)
		)
	);
}

export const openBriefProjectAlpha = readSnapshot('project-alpha.snapshot.json');
export const openBriefProjectBeta = readSnapshot('project-beta.snapshot.json');

/**
 * Positive clarification control. Keep product and execution facts, but remove the documents,
 * goals, plans, and standing-direction fields that would let a contractor infer DJ's vision.
 * This is a cohort fixture transform, not a new production snapshot or durable data model.
 */
export function buildProjectBetaNoDirectionSnapshot(): OpenBriefSnapshot {
	const project = openBriefProjectBeta.project;
	return OpenBriefSnapshotSchema.parse({
		...openBriefProjectBeta,
		snapshot_id: 'open-brief-project-beta-no-direction-v1',
		project: {
			id: project.id,
			name: project.name,
			description: project.description,
			state: project.state,
			stage: project.stage,
			scale: project.scale,
			fixture_note:
				'Cohort-1 blocked control: direction-bearing documents, goals, plans, and standing direction fields were removed.'
		},
		documents: [],
		goals: [],
		plans: [],
		edges: []
	});
}

export function resolveOpenBriefSnapshot(snapshotId: string): OpenBriefSnapshot {
	if (snapshotId === 'project-alpha') return openBriefProjectAlpha;
	if (snapshotId === 'project-beta') return openBriefProjectBeta;
	if (snapshotId === 'project-beta-no-direction') return buildProjectBetaNoDirectionSnapshot();
	throw new Error(`Unknown open-brief snapshot: ${snapshotId}`);
}

function sourceEntityKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

function tempId(kind: string, index: number): string {
	return `${kind}-${index + 1}`;
}

export function buildOpenBriefProjectSpec(snapshot: OpenBriefSnapshot, label: string): ProjectSpec {
	const entities: ProjectSpec['entities'] = [];
	const tempIds = new Map<string, string>();

	for (const [index, goal] of snapshot.goals.entries()) {
		const id = tempId('goal', index);
		tempIds.set(sourceEntityKey('goal', goal.id), id);
		entities.push({
			temp_id: id,
			kind: 'goal',
			name: goal.name,
			description: typeof goal.description === 'string' ? goal.description : '',
			state_key: typeof goal.state === 'string' ? goal.state : 'draft',
			target_date: typeof goal.target_date === 'string' ? goal.target_date : undefined
		});
	}
	for (const [index, plan] of snapshot.plans.entries()) {
		const id = tempId('plan', index);
		tempIds.set(sourceEntityKey('plan', plan.id), id);
		entities.push({
			temp_id: id,
			kind: 'plan',
			name: plan.name,
			description:
				typeof plan.description === 'string'
					? plan.description
					: typeof plan.summary === 'string'
						? plan.summary
						: '',
			state_key: typeof plan.state === 'string' ? plan.state : 'draft'
		});
	}
	for (const [index, task] of snapshot.tasks.entries()) {
		const id = tempId('task', index);
		tempIds.set(sourceEntityKey('task', task.id), id);
		entities.push({
			temp_id: id,
			kind: 'task',
			title: task.title,
			description: typeof task.description === 'string' ? task.description : '',
			state_key: typeof task.state === 'string' ? task.state : 'todo',
			priority: typeof task.priority === 'number' ? task.priority : 3,
			start_at: typeof task.start_at === 'string' ? task.start_at : undefined,
			due_at: typeof task.due_at === 'string' ? task.due_at : undefined,
			props: Object.fromEntries(
				Object.entries(task).filter(
					([key]) =>
						![
							'id',
							'title',
							'description',
							'state',
							'priority',
							'start_at',
							'due_at'
						].includes(key)
				)
			)
		});
	}
	for (const [index, document] of snapshot.documents.entries()) {
		const id = tempId('document', index);
		tempIds.set(sourceEntityKey('document', document.id), id);
		entities.push({
			temp_id: id,
			kind: 'document',
			title: document.title,
			body_markdown: typeof document.content === 'string' ? document.content : '',
			state_key: typeof document.state === 'string' ? document.state : 'ready'
		});
	}

	const edgeInputs = Array.isArray(snapshot.edges) ? snapshot.edges : [];
	const relationships: ProjectSpec['relationships'] = [];
	for (const edge of edgeInputs) {
		if (!edge || typeof edge !== 'object') continue;
		const value = edge as Record<string, unknown>;
		const sourceKind = typeof value.source_kind === 'string' ? value.source_kind : '';
		const targetKind = typeof value.target_kind === 'string' ? value.target_kind : '';
		const sourceId = typeof value.source_id === 'string' ? value.source_id : '';
		const targetId = typeof value.target_id === 'string' ? value.target_id : '';
		const from = tempIds.get(sourceEntityKey(sourceKind, sourceId));
		const to = tempIds.get(sourceEntityKey(targetKind, targetId));
		if (!from || !to || typeof value.relationship !== 'string') continue;
		relationships.push({
			from: { temp_id: from, kind: sourceKind as 'goal' | 'plan' | 'task' | 'document' },
			to: { temp_id: to, kind: targetKind as 'goal' | 'plan' | 'task' | 'document' },
			rel: value.relationship
		});
	}

	return {
		project: {
			name: harnessProjectName(`Open brief ${label}`),
			type_key: 'project.evaluation.open_brief',
			state_key:
				typeof snapshot.project.state === 'string' ? snapshot.project.state : 'active',
			description: `${snapshot.project.description ?? ''}\n\nFrozen snapshot metadata:\n${JSON.stringify(snapshot.project, null, 2)}`,
			props: {
				open_brief_snapshot_id: snapshot.snapshot_id,
				open_brief_snapshot_as_of: snapshot.as_of,
				open_brief_fixture_alias: snapshot.project.name
			}
		},
		entities,
		relationships
	};
}

export function seedOpenBriefProject(params: {
	ctx: ScenarioContext;
	snapshotId: string;
	label: string;
}): Promise<SeedResult> {
	const snapshot = resolveOpenBriefSnapshot(params.snapshotId);
	return seedScenarioProject(params.ctx, buildOpenBriefProjectSpec(snapshot, params.label));
}
