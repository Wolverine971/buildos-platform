// packages/agent-orchestrator/src/application/route-mode/world-card.ts
export const WORLD_CARD_VERSION = 'phase-a-world-card-v1' as const;
export const WORLD_CARD_MAX_ESTIMATED_TOKENS = 1_600;

export interface WorldCardSnapshotInput {
	project: {
		id: string;
		name: string;
		description: string;
		state: string;
		stage: string;
		next_step: string;
	};
	tasks: readonly unknown[];
	documents: readonly unknown[];
	goals: readonly unknown[];
	plans: readonly unknown[];
	edges: readonly unknown[];
}

export interface PhaseAWorldCard {
	world_card_version: typeof WORLD_CARD_VERSION;
	token_budget: typeof WORLD_CARD_MAX_ESTIMATED_TOKENS;
	estimated_tokens: number;
	object_model: {
		types: readonly string[];
		relationship_summary: string;
	};
	current_project: {
		id: string;
		name: string;
		description: string;
		state: string;
		stage: string;
		next_step: string;
		entity_counts: Record<string, number>;
	};
	direct_capabilities: readonly {
		capability_id: string;
		description: string;
		constraints: string;
	}[];
	agent_catalog: readonly {
		agent_id: string;
		role: string;
		capabilities: readonly string[];
		permission_ceiling: string;
		produces: readonly string[];
	}[];
	workflow_grammar: {
		routes: Record<string, string>;
		max_stages: number;
		max_replans: number;
		max_parallel_steps: number;
		mutation_policy: string;
	};
	permission_ceiling: {
		mode: 'read_only';
		project_ids: readonly string[];
		operations: readonly string[];
		network: 'web_read';
	};
	artifact_types: readonly string[];
}

function utf8ByteLength(value: string): number {
	let bytes = 0;
	for (let index = 0; index < value.length; index += 1) {
		const codePoint = value.charCodeAt(index);
		if (codePoint < 0x80) bytes += 1;
		else if (codePoint < 0x800) bytes += 2;
		else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (next >= 0xdc00 && next <= 0xdfff) {
				bytes += 4;
				index += 1;
			} else bytes += 3;
		} else bytes += 3;
	}
	return bytes;
}

export function estimateWorldCardTokens(serialized: string): number {
	return Math.ceil(utf8ByteLength(serialized) / 4);
}

export function serializeWorldCard(card: PhaseAWorldCard): string {
	return JSON.stringify(card);
}

export function buildPhaseAWorldCard(snapshot: WorldCardSnapshotInput): PhaseAWorldCard {
	const card: PhaseAWorldCard = {
		world_card_version: WORLD_CARD_VERSION,
		token_budget: WORLD_CARD_MAX_ESTIMATED_TOKENS,
		estimated_tokens: 0,
		object_model: {
			types: ['project', 'goal', 'plan', 'task', 'document', 'relationship'],
			relationship_summary:
				'A project scopes goals, plans, tasks, and documents; typed edges connect those entities.'
		},
		current_project: {
			id: snapshot.project.id,
			name: snapshot.project.name,
			description: snapshot.project.description,
			state: snapshot.project.state,
			stage: snapshot.project.stage,
			next_step: snapshot.project.next_step,
			entity_counts: {
				goals: snapshot.goals.length,
				plans: snapshot.plans.length,
				tasks: snapshot.tasks.length,
				documents: snapshot.documents.length,
				relationships: snapshot.edges.length
			}
		},
		direct_capabilities: [
			{
				capability_id: 'project.read',
				description: 'Read project identity and a bounded set of project entities.',
				constraints: 'BuildOS data only; no external research or mutation.'
			},
			{
				capability_id: 'project.status_summary',
				description: 'Summarize current project status from existing BuildOS records.',
				constraints: 'Read-only; may combine a bounded set of project records.'
			}
		],
		agent_catalog: [
			{
				agent_id: 'librarian.v0',
				role: 'Build a bounded context packet from the current project snapshot.',
				capabilities: [
					'project context retrieval',
					'entity selection',
					'source provenance'
				],
				permission_ceiling: 'read_only; current project only; no network',
				produces: ['context_packet']
			},
			{
				agent_id: 'researcher.v0',
				role: 'Perform bounded external web research and return cited findings.',
				capabilities: ['single-source analysis', 'multi-source research', 'comparison'],
				permission_ceiling: 'read_only; web_read; no BuildOS mutation',
				produces: ['research_packet']
			}
		],
		workflow_grammar: {
			routes: {
				direct: 'One bounded read-only BuildOS operation or project status summary.',
				workflow:
					'External research, multiple independent sources, or context then research then recommendation.',
				clarify: 'A missing scope or referent prevents a safe and useful plan.',
				capability_gap:
					'The requested capability is absent from the cards or permission ceiling.'
			},
			max_stages: 5,
			max_replans: 2,
			max_parallel_steps: 4,
			mutation_policy: 'Phase A is read-only. Never route to a mutation.'
		},
		permission_ceiling: {
			mode: 'read_only',
			project_ids: [snapshot.project.id],
			operations: ['project.read', 'project.status_summary', 'web.read'],
			network: 'web_read'
		},
		artifact_types: ['context_packet', 'research_packet', 'recommendation', 'status_summary']
	};

	// The estimate is part of the serialized payload, so converge it to a self-consistent value.
	for (let pass = 0; pass < 4; pass += 1) {
		const estimate = estimateWorldCardTokens(serializeWorldCard(card));
		if (estimate === card.estimated_tokens) break;
		card.estimated_tokens = estimate;
	}
	if (card.estimated_tokens > WORLD_CARD_MAX_ESTIMATED_TOKENS) {
		throw new Error(
			`World card exceeds ${WORLD_CARD_MAX_ESTIMATED_TOKENS} estimated tokens: ${card.estimated_tokens}`
		);
	}

	return card;
}
