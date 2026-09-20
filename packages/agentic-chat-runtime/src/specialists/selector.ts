// packages/agentic-chat-runtime/src/specialists/selector.ts
import type { SpecialistDefinitionRefV1 } from './registry';
import {
	PROJECT_REVIEW_SPECIALIST_IDS_V1,
	PROJECT_REVIEW_SPECIALISTS_V1
} from './project-review-v1';

export type AgentSelectionInputV1 = Readonly<{
	intent: 'project_review' | 'auto';
	question: string;
	context: Readonly<{ type: string; projectId: string | null }>;
	/** The host has already filtered these by authorization and supported execution contracts. */
	eligibleSpecialists: readonly SpecialistDefinitionRefV1[];
	maxSpecialists: number;
}>;

export type AgentSelectionReceiptV1 = Readonly<{
	version: 'agent_selection_v1';
	selector: Readonly<{ id: string; version: number }>;
	outcome: 'selected' | 'generalist' | 'unavailable';
	reason: string;
	selected: readonly SpecialistDefinitionRefV1[];
}>;

/** Jev can implement this port later. Selection never grants tools, access, or extra budget. */
export interface AgentSelectorV1 {
	select(input: AgentSelectionInputV1, signal?: AbortSignal): Promise<AgentSelectionReceiptV1>;
}

/** Deterministic baseline for previews and the future configurable-run adapter. No model call. */
export class ProjectReviewAgentSelectorV1 implements AgentSelectorV1 {
	async select(
		input: AgentSelectionInputV1,
		signal?: AbortSignal
	): Promise<AgentSelectionReceiptV1> {
		signal?.throwIfAborted();
		const receipt = (
			outcome: AgentSelectionReceiptV1['outcome'],
			reason: string,
			selected: readonly SpecialistDefinitionRefV1[] = []
		): AgentSelectionReceiptV1 =>
			Object.freeze({
				version: 'agent_selection_v1',
				selector: Object.freeze({ id: 'project_review_fixed', version: 1 }),
				outcome,
				reason,
				selected: Object.freeze(selected.map((ref) => Object.freeze({ ...ref })))
			});
		if (input.intent !== 'project_review')
			return receipt('generalist', 'explicit_review_not_requested');
		if (
			input.context.type !== 'project' ||
			!input.context.projectId?.trim() ||
			!input.question.trim()
		) {
			return receipt('unavailable', 'project_review_context_required');
		}
		const selected = PROJECT_REVIEW_SPECIALIST_IDS_V1.map((id) => ({
			id,
			version: PROJECT_REVIEW_SPECIALISTS_V1[id].version
		}));
		if (!Number.isSafeInteger(input.maxSpecialists) || input.maxSpecialists < selected.length) {
			return receipt('unavailable', 'project_review_requires_two_specialists');
		}
		if (
			selected.some(
				(ref) =>
					!input.eligibleSpecialists.some(
						(candidate) => candidate.id === ref.id && candidate.version === ref.version
					)
			)
		) {
			// An explicit review must not silently become ordinary, potentially mutating chat.
			return receipt('unavailable', 'project_review_baseline_unavailable');
		}
		return receipt('selected', 'fixed_project_review_roster', selected);
	}
}
