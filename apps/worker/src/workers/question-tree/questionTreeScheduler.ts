// apps/worker/src/workers/question-tree/questionTreeScheduler.ts
import type { QuestionTreeNode, QuestionTreeProposal } from './questionTreeContracts';

export interface QuestionTreeScheduleResult {
	selectedIds: string[];
	belowThresholdIds: string[];
	scores: Record<string, number>;
}

function tokenSet(value: string): Set<string> {
	return new Set(
		value
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((token) => token.length > 2)
	);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const token of a) {
		if (b.has(token)) intersection += 1;
	}
	return intersection / (a.size + b.size - intersection);
}

function findRootBranchId(node: QuestionTreeNode, byId: Map<string, QuestionTreeNode>): string {
	let current = node;
	while (current.parent_node_id) {
		const parent = byId.get(current.parent_node_id);
		if (!parent || parent.node_kind === 'root') return current.id;
		current = parent;
	}
	return current.id;
}

export function scoreQuestionTreeFrontier(params: {
	proposals: QuestionTreeProposal[];
	nodes: QuestionTreeNode[];
	remainingSlots: number;
	batchLimit?: number;
	minScore?: number;
}): QuestionTreeScheduleResult {
	const batchLimit = Math.max(0, Math.min(10, params.batchLimit ?? 10, params.remainingSlots));
	const minScore = params.minScore ?? 0.48;
	const byId = new Map(params.nodes.map((node) => [node.id, node]));
	const answeredQuestions = params.nodes
		.filter((node) => node.status === 'completed')
		.map((node) => tokenSet(node.question));
	const spawnedByParent = new Map<string, number>();
	for (const node of params.nodes) {
		if (node.parent_node_id) {
			spawnedByParent.set(
				node.parent_node_id,
				(spawnedByParent.get(node.parent_node_id) ?? 0) + 1
			);
		}
	}

	const informationGain = { low: 0.08, medium: 0.24, high: 0.4 } as const;
	const purposeValue = {
		frame: 0.08,
		strengthen: 0.12,
		resolve_unknown: 0.2,
		falsify: 0.24
	} as const;

	const candidates = params.proposals
		.filter((proposal) => proposal.status === 'proposed' || proposal.status === 'not_selected')
		.map((proposal) => {
			const source = byId.get(proposal.source_node_id);
			const questionTokens = tokenSet(proposal.question);
			const maxSimilarity = answeredQuestions.reduce(
				(max, existing) => Math.max(max, jaccard(questionTokens, existing)),
				0
			);
			const noveltyPenalty = maxSimilarity >= 0.72 ? 0.28 : maxSimilarity >= 0.55 ? 0.12 : 0;
			const depthBonus = Math.min((source?.depth ?? 0) * 0.035, 0.17);
			const siblingPenalty = Math.max(
				0,
				((spawnedByParent.get(proposal.source_node_id) ?? 0) - 1) * 0.035
			);
			const modelPriority = proposal.model_priority ?? 0.5;
			const score = Math.max(
				0,
				Math.min(
					1,
					informationGain[proposal.expected_information_gain] +
						purposeValue[proposal.purpose] +
						modelPriority * 0.18 +
						depthBonus -
						noveltyPenalty -
						siblingPenalty
				)
			);
			return {
				proposal,
				score,
				rootBranchId: source ? findRootBranchId(source, byId) : proposal.source_node_id
			};
		})
		.sort(
			(a, b) =>
				b.score - a.score || a.proposal.created_at.localeCompare(b.proposal.created_at)
		);

	const scores = Object.fromEntries(
		candidates.map((candidate) => [candidate.proposal.id, candidate.score])
	);
	const viable = candidates.filter((candidate) => candidate.score >= minScore);
	const belowThresholdIds = candidates
		.filter((candidate) => candidate.score < minScore)
		.map((candidate) => candidate.proposal.id);

	if (batchLimit === 0 || viable.length === 0) {
		return { selectedIds: [], belowThresholdIds, scores };
	}

	const selected = viable.slice(0, batchLimit);
	if (batchLimit >= 3 && selected.length === batchLimit) {
		const dominantBranch = selected[0]?.rootBranchId;
		const hasDiversity = selected.some(
			(candidate) => candidate.rootBranchId !== dominantBranch
		);
		if (!hasDiversity) {
			const alternate = viable.find(
				(candidate) =>
					candidate.rootBranchId !== dominantBranch &&
					!selected.some((entry) => entry.proposal.id === candidate.proposal.id)
			);
			if (alternate) selected[selected.length - 1] = alternate;
		}
	}

	return {
		selectedIds: selected.map((candidate) => candidate.proposal.id),
		belowThresholdIds,
		scores
	};
}
