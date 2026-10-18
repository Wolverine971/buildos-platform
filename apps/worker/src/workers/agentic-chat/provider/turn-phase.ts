// apps/worker/src/workers/agentic-chat/provider/turn-phase.ts
//
// The acting turn as a state machine. `nextTurnPhase` is a pure reducer over
// the events the provider observes (tool rounds, disposition controls,
// reviewer decisions, budgets); `surfaceFor` is the one place that decides
// which tools a phase may call. Both are deterministic and fixture-free, so
// the pass ladder for every turn class can be unit-tested without a provider.

import {
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import { isPureReadToolName } from '@buildos/agentic-chat-runtime/loop';
import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatTurnProviderToolV1 } from './contracts';
import {
	MUTATION_BATCH_PROPOSAL_REVISION_TOOL,
	MUTATION_BATCH_REVIEW_APPROVAL_TOOL
} from './review/controls';

/**
 * Where the acting model is in the turn.
 *
 * - `opening` / `reading`: no disposition yet; reads may still be gathered.
 * - `read_only_declared`: the turn was declared read-only (by a reviewer
 *   downgrade or a proposal card).
 * - `batch_withheld`: a proposed mutation batch is held and awaits review.
 * - `batch_approved`: the reviewer approved the exact batch SHA; the held
 *   calls execute next, unchanged.
 * - `mutating`: at least one mutation reached execution this turn.
 * - `clarification`: a clarification control executed; the answer is tool-free.
 * - `synthesis`: the turn was forced tool-free by a budget or ladder floor.
 * - `terminal`: the provider yielded `finish`.
 */
export type TurnPhase =
	| 'opening'
	| 'reading'
	| 'read_only_declared'
	| 'batch_withheld'
	| 'batch_approved'
	| 'mutating'
	| 'clarification'
	| 'synthesis'
	| 'terminal';

export type TurnPhaseEvent =
	/** A tool round of this kind was executed and its results returned. */
	| { type: 'tool_round'; kind: 'read' | 'control' | 'mutation' | 'repair' }
	/** A disposition (clarification or a proposal card's read-only) executed durably. */
	| { type: 'disposition'; decision: 'read_only' | 'clarification' }
	/** A proposed mutation batch was withheld and sent to independent review. */
	| { type: 'withhold_batch' }
	/** An independent reviewer decision executed durably. */
	| {
			type: 'review';
			decision: 'approve_batch' | 'revise_batch' | 'read_only' | 'clarify';
	  }
	/** A budget or ladder floor forced the turn tool-free. */
	| { type: 'budget'; limit: 'force_synthesis' }
	| { type: 'finish' };

/**
 * Pure transition. Unknown combinations keep the phase: the provider only
 * dispatches events it has already executed, so an unexpected event is a
 * no-op rather than a fault.
 */
export function nextTurnPhase(phase: TurnPhase, event: TurnPhaseEvent): TurnPhase {
	if (phase === 'terminal') return phase;
	switch (event.type) {
		case 'finish':
			return 'terminal';
		case 'budget':
			return 'synthesis';
		case 'disposition':
			switch (event.decision) {
				case 'read_only':
					return 'read_only_declared';
				case 'clarification':
					return 'clarification';
			}
			return phase;
		case 'withhold_batch':
			// A batch can be withheld from any pre-mutation phase, and again
			// after a rejected batch sends the actor back to propose new calls.
			return dispositionPending(phase) || phase === 'batch_withheld' || phase === 'mutating'
				? 'batch_withheld'
				: phase;
		case 'review':
			switch (event.decision) {
				case 'approve_batch':
					return phase === 'batch_withheld' ? 'batch_approved' : phase;
				case 'revise_batch':
					// The held calls are void; the actor proposes new ones and they
					// are reviewed again.
					return phase === 'batch_withheld' ? 'reading' : phase;
				case 'read_only':
					return 'read_only_declared';
				case 'clarify':
					return 'clarification';
			}
			return phase;
		case 'tool_round':
			switch (event.kind) {
				case 'mutation':
					return 'mutating';
				case 'read':
					return phase === 'opening' ? 'reading' : phase;
				case 'control':
				case 'repair':
					return phase;
			}
			return phase;
	}
	return phase;
}

/** No disposition has been taken and no batch is held: a write may still be proposed. */
export function dispositionPending(phase: TurnPhase): boolean {
	return phase === 'opening' || phase === 'reading';
}

export type TurnSurface = {
	tools: readonly AgenticChatTurnProviderToolV1[];
	toolChoice: 'none' | 'auto' | 'required';
};

/** The reviewer lane has its own surface; it is not an acting phase. */
export type ReviewerLane = 'mutation_batch_review';

export type TurnSurfaceContext = {
	/** Tools on the request being repaired; a repair of a held batch restores exactly these. */
	requestTools?: readonly AgenticChatTurnProviderToolV1[];
	/** Reviewer lane: whether the proposal may still be returned for revision. */
	allowRevision?: boolean;
	/** Reviewer lane: whether the reviewer may still downgrade to read-only. */
	allowReadOnlyCorrection?: boolean;
	/** A surface repair restores what the phase owns, which can differ from the pass surface. */
	repair?: boolean;
};

/**
 * The one decision of "which tools" for a phase. Returns null when the phase
 * cannot be mounted (no clarification control for the reviewer). Tool order
 * always follows the admitted surface, so request JSON is stable.
 */
export function surfaceFor(
	phase: TurnPhase | ReviewerLane,
	admitted: readonly AgenticChatTurnProviderToolV1[],
	context: TurnSurfaceContext = {}
): TurnSurface | null {
	switch (phase) {
		case 'opening':
		case 'reading':
		case 'mutating':
			// The opening pass itself is built by request-builders; the reducer
			// only ever re-mounts the admitted surface here, on a repair.
			return autoSurface(admitted);
		case 'read_only_declared': {
			if (context.repair) {
				return {
					tools: admitted.filter(
						(tool) =>
							isPureReadToolName(tool.function.name) ||
							tool.function.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME
					),
					toolChoice: 'auto'
				};
			}
			return autoSurface(admitted.filter((tool) => isPureReadToolName(tool.function.name)));
		}
		case 'batch_withheld':
			// The batch is held by the harness, not re-proposed by the model, so
			// this phase mounts no acting surface. A repair restores whatever the
			// interrupted request had.
			return context.repair
				? { tools: context.requestTools ?? [], toolChoice: 'auto' }
				: { tools: [], toolChoice: 'none' };
		case 'batch_approved':
			// Execution runs the held calls directly. Nothing is asked of the
			// model between approval and execution, which is the whole point:
			// the executed arguments are the approved arguments.
			return { tools: [], toolChoice: 'none' };
		case 'clarification':
		case 'synthesis':
		case 'terminal':
			return { tools: [], toolChoice: 'none' };
		case 'mutation_batch_review': {
			const clarificationTool = admitted.find(
				(tool) => tool.function.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME
			);
			const readOnlyDispositionTool = context.allowReadOnlyCorrection
				? (admitted.find(
						(tool) => tool.function.name === DECLARE_READ_ONLY_TURN_TOOL_NAME
					) ?? READ_ONLY_DISPOSITION_TOOL)
				: undefined;
			if (!clarificationTool) return null;
			return {
				tools: [
					MUTATION_BATCH_REVIEW_APPROVAL_TOOL,
					...(readOnlyDispositionTool ? [readOnlyDispositionTool] : []),
					...(context.allowRevision ? [MUTATION_BATCH_PROPOSAL_REVISION_TOOL] : []),
					clarificationTool
				],
				toolChoice: 'required'
			};
		}
	}
	return null;
}

const READ_ONLY_DISPOSITION_TOOL: AgenticChatTurnProviderToolV1 = {
	type: 'function',
	function: {
		name: DECLARE_READ_ONLY_TURN_TOOL_DEFINITION.function.name,
		description: DECLARE_READ_ONLY_TURN_TOOL_DEFINITION.function.description,
		parameters: DECLARE_READ_ONLY_TURN_TOOL_DEFINITION.function
			.parameters as unknown as JsonObject
	}
};

function autoSurface(tools: readonly AgenticChatTurnProviderToolV1[]): TurnSurface {
	return { tools, toolChoice: tools.length > 0 ? 'auto' : 'none' };
}
