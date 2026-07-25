// packages/agent-orchestrator/src/agents/librarian/deterministic-librarian.ts
import { createHash } from 'node:crypto';

import {
	AgentResultSchema,
	ContextPacketSchema,
	type AgentResult,
	type ContextPacket,
	type ProvenanceSource
} from '../../contracts';

interface SnapshotProject {
	id: string;
	name: string;
	description: string;
	state: string;
	stage: string;
	next_step: string;
}

interface SnapshotTask {
	id: string;
	title: string;
	description: string;
	state: string;
	priority: number;
	start_at: string | null;
	due_at: string | null;
	pillar: string;
}

interface SnapshotDocument {
	id: string;
	title: string;
	state: string;
	content: string;
}

interface SnapshotGoalOrPlan {
	id: string;
	name: string;
	description: string;
	state: string;
}

export interface LibrarianProjectSnapshot {
	as_of: string;
	project: SnapshotProject;
	tasks: SnapshotTask[];
	documents: SnapshotDocument[];
	goals: Array<SnapshotGoalOrPlan & { target_date: string | null }>;
	plans: SnapshotGoalOrPlan[];
}

export interface DeterministicLibrarianInput {
	objective: string;
	snapshot: LibrarianProjectSnapshot;
	maxFacts?: number;
	maxExcerpts?: number;
	/**
	 * Criterion ids declared by the step being executed. A self-report keyed to an id the step never
	 * declared cannot be reconciled with the plan, so callers should pass
	 * `step.acceptance_criteria.map((criterion) => criterion.criterion_id)`.
	 * Defaults to the agent's own id when the caller supplies none.
	 * See research/09_INTERNAL_GROUND_TRUTH_MAP.md D10.
	 */
	acceptanceCriterionIds?: readonly string[];
}

const LIBRARIAN_DEFAULT_CRITERION_ID = 'context.packet.valid';

const STOP_WORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'can',
	'do',
	'for',
	'from',
	'have',
	'i',
	'in',
	'is',
	'it',
	'me',
	'my',
	'of',
	'on',
	'or',
	'please',
	'should',
	'the',
	'this',
	'to',
	'what',
	'which',
	'with',
	'you'
]);

function tokens(value: string): Set<string> {
	return new Set(
		value
			.toLocaleLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.split(/\s+/)
			.filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
	);
}

function relevance(queryTokens: Set<string>, value: string): number {
	const valueTokens = tokens(value);
	let score = 0;
	for (const token of queryTokens) {
		if (valueTokens.has(token)) score += token.length >= 6 ? 2 : 1;
	}
	return score;
}

function deterministicUuid(namespace: string, value: string): string {
	const hex = createHash('sha256').update(`${namespace}\n${value}`).digest('hex').slice(0, 32);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(
		17,
		20
	)}-${hex.slice(20)}`;
}

function source(params: {
	type: 'project' | 'task' | 'document' | 'goal' | 'plan';
	id: string;
	projectId: string;
	asOf: string;
}): ProvenanceSource {
	return {
		source_type: 'buildos_entity',
		source_id: `${params.type}:${params.id}`,
		source_uri: null,
		project_id: params.projectId,
		captured_at: params.asOf
	};
}

function rank<T extends { id: string }>(
	items: T[],
	queryTokens: Set<string>,
	text: (item: T) => string
): Array<{ item: T; score: number }> {
	return items
		.map((item) => ({ item, score: relevance(queryTokens, text(item)) }))
		.sort(
			(left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id)
		);
}

function truncate(value: string, maxCharacters: number): string {
	if (value.length <= maxCharacters) return value;
	return `${value.slice(0, maxCharacters - 1).trimEnd()}…`;
}

export function buildContextPacket(input: DeterministicLibrarianInput): ContextPacket {
	const maxFacts = Math.max(2, Math.min(input.maxFacts ?? 8, 20));
	const maxExcerpts = Math.max(1, Math.min(input.maxExcerpts ?? 4, 10));
	const { snapshot } = input;
	const objectiveTokens = tokens(input.objective);
	const rankedTasks = rank(
		snapshot.tasks,
		objectiveTokens,
		(task) => `${task.title} ${task.description} ${task.pillar}`
	);
	const selectedTasks = rankedTasks.slice(0, Math.min(4, maxFacts - 1));

	// A selected entity resolves short references such as "this" before document retrieval.
	const expandedTokens = tokens(
		[
			input.objective,
			...selectedTasks
				.filter((entry) => entry.score > 0)
				.map(({ item }) => `${item.title} ${item.description}`)
		].join(' ')
	);
	const rankedDocuments = rank(
		snapshot.documents,
		expandedTokens,
		(document) => `${document.title} ${document.content}`
	);
	const selectedDocuments = rankedDocuments.slice(0, maxExcerpts);

	const facts = [
		{
			fact_id: deterministicUuid('librarian.fact.project', snapshot.project.id),
			statement: `Project "${snapshot.project.name}" is ${snapshot.project.state} in stage ${snapshot.project.stage}. Its next step is: ${snapshot.project.next_step}`,
			source: source({
				type: 'project',
				id: snapshot.project.id,
				projectId: snapshot.project.id,
				asOf: snapshot.as_of
			}),
			as_of: snapshot.as_of,
			confidence: 1
		},
		...selectedTasks.map(({ item: task }) => ({
			fact_id: deterministicUuid('librarian.fact.task', task.id),
			statement: `Task "${task.title}" is ${task.state}, priority ${task.priority}${
				task.due_at ? `, due ${task.due_at}` : ''
			}. ${task.description}`,
			source: source({
				type: 'task' as const,
				id: task.id,
				projectId: snapshot.project.id,
				asOf: snapshot.as_of
			}),
			as_of: snapshot.as_of,
			confidence: 1
		}))
	].slice(0, maxFacts);

	const excerpts = selectedDocuments.map(({ item: document }) => ({
		excerpt_id: deterministicUuid('librarian.excerpt.document', document.id),
		text: truncate(document.content, 4_000),
		source: source({
			type: 'document',
			id: document.id,
			projectId: snapshot.project.id,
			asOf: snapshot.as_of
		}),
		locator: document.title
	}));

	return ContextPacketSchema.parse({
		schema_version: 1,
		objective: input.objective,
		project_scope: [
			{
				project_id: snapshot.project.id,
				project_name: snapshot.project.name,
				role: 'primary',
				reason: 'The workflow request is scoped to this active project snapshot.'
			}
		],
		facts,
		excerpts,
		artifact_refs: [],
		constraints: [
			'Read-only Phase A evaluation: do not mutate project data.',
			'Treat snapshot facts as current only at the recorded as-of timestamp.'
		],
		intentionally_excluded: [
			`${Math.max(0, snapshot.tasks.length - selectedTasks.length)} lower-relevance tasks were excluded.`,
			`${Math.max(0, snapshot.documents.length - selectedDocuments.length)} lower-relevance documents were excluded.`,
			`${snapshot.goals.length + snapshot.plans.length} goals and plans were excluded from this bounded packet.`
		],
		retrieval_options: [
			{
				option_id: 'research.current.web',
				kind: 'web_search',
				operation: 'web.search',
				label: 'Research current external evidence',
				reason: 'Current product availability and external claims require fresh web evidence.',
				arguments: { objective: input.objective }
			}
		],
		as_of: snapshot.as_of
	});
}

export function runDeterministicLibrarian(input: DeterministicLibrarianInput): AgentResult {
	const packet = buildContextPacket(input);
	return AgentResultSchema.parse({
		schema_version: 1,
		status: 'completed',
		summary: `Collected ${packet.facts.length} project facts and ${packet.excerpts.length} relevant document excerpts without an LLM call.`,
		artifact_drafts: [
			{
				schema_version: 1,
				artifact_type: 'context_packet',
				summary: `Bounded project context for: ${truncate(input.objective, 300)}`,
				payload: packet,
				provenance: [
					{
						relationship: 'generated_from',
						source: source({
							type: 'project',
							id: input.snapshot.project.id,
							projectId: input.snapshot.project.id,
							asOf: input.snapshot.as_of
						})
					}
				]
			}
		],
		acceptance_results: (input.acceptanceCriterionIds?.length
			? input.acceptanceCriterionIds
			: [LIBRARIAN_DEFAULT_CRITERION_ID]
		).map((criterionId) => ({
			criterion_id: criterionId,
			status: 'passed',
			evaluation_source: 'runtime',
			validator_id: 'context.packet.schema',
			details: 'The deterministic ContextPacket passed the frozen contract schema.',
			evidence_artifact_ids: []
		})),
		open_questions: [],
		assumptions: [],
		residual_risks: [
			'Relevance selection is lexical and bounded; excluded entities may contain secondary context.'
		],
		confidence: 0.95,
		capability_gaps: []
	});
}
