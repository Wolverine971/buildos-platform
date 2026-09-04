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
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import {
	type TurnContract,
	getSafeWriteToolNamesForTurnContract,
	isPureReadToolName,
	turnContractCreatesProject
} from '@buildos/agentic-chat-runtime/loop';
import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatTurnProviderToolV1 } from './contracts';
import {
	CONTRACT_PROPOSAL_REVISION_TOOL,
	TURN_CONTRACT_REVIEW_APPROVAL_TOOL
} from './review/controls';
import { withSchedulingSidecar } from './tool-surface';

/**
 * Where the acting model is in the turn.
 *
 * - `opening` / `reading`: no disposition yet; reads may still be gathered.
 * - `disposition_gate`: the model is on the required contract/clarify gate.
 * - `read_only_declared`: the turn was declared read-only (by the model, by a
 *   reviewer downgrade, or because the surface cannot write).
 * - `contract_declared`: a contract is recorded and awaits (or lacks) review.
 * - `contract_reviewed`: the reviewer approved the exact contract SHA.
 * - `contract_carve_out`: the one write-only pass before any mutation ran.
 * - `contract_cancelled`: a disposition was taken but the contract was cancelled.
 * - `mutating`: at least one mutation reached execution this turn.
 * - `completion`: the one bounded pass that finishes untouched outcomes ran.
 * - `clarification`: a clarification control executed; the answer is tool-free.
 * - `synthesis`: the turn was forced tool-free by a budget or ladder floor.
 * - `terminal`: the provider yielded `finish`.
 */
export type TurnPhase =
	| 'opening'
	| 'reading'
	| 'disposition_gate'
	| 'read_only_declared'
	| 'contract_declared'
	| 'contract_reviewed'
	| 'contract_carve_out'
	| 'contract_cancelled'
	| 'mutating'
	| 'completion'
	| 'clarification'
	| 'synthesis'
	| 'terminal';

export type TurnPhaseEvent =
	/** A tool round of this kind was executed and its results returned. */
	| { type: 'tool_round'; kind: 'read' | 'control' | 'mutation' | 'repair' }
	/** The semantic disposition gate was mounted for the next pass. */
	| { type: 'gate' }
	/** An acting-model disposition control executed durably. */
	| { type: 'disposition'; decision: 'contract' | 'read_only' | 'clarification' | 'cancel' }
	/** An independent reviewer decision executed durably. */
	| {
			type: 'review';
			decision:
				| 'approve_contract'
				| 'revise_contract'
				| 'correct_contract'
				| 'read_only'
				| 'clarify';
	  }
	/** The write-only carve-out or the completion continuation was mounted. */
	| { type: 'carve_out' }
	| { type: 'completion' }
	/** A budget or ladder floor forced the turn tool-free. */
	| { type: 'budget'; limit: 'force_synthesis' | 'validation_repairs' | 'rounds' }
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
			if (event.limit === 'force_synthesis') return 'synthesis';
			return phase;
		case 'gate':
			return dispositionPending(phase) ? 'disposition_gate' : phase;
		case 'disposition':
			switch (event.decision) {
				case 'contract':
					return 'contract_declared';
				case 'read_only':
					return 'read_only_declared';
				case 'clarification':
					return 'clarification';
				case 'cancel':
					return contractPresent(phase) ? 'contract_cancelled' : phase;
			}
			return phase;
		case 'review':
			switch (event.decision) {
				case 'approve_contract':
					return phase === 'contract_declared' ? 'contract_reviewed' : phase;
				case 'revise_contract':
					// The contract is void; the model must re-declare through the gate.
					return contractPresent(phase) ? 'reading' : phase;
				case 'correct_contract':
					// A typed correction is recorded and re-reviewed as a declaration.
					return contractPresent(phase) ? 'contract_declared' : phase;
				case 'read_only':
					return 'read_only_declared';
				case 'clarify':
					return 'clarification';
			}
			return phase;
		case 'carve_out':
			return phase === 'contract_declared' || phase === 'contract_reviewed'
				? 'contract_carve_out'
				: phase;
		case 'completion':
			return phase === 'mutating' ? 'completion' : phase;
		case 'tool_round':
			switch (event.kind) {
				case 'mutation':
					return phase === 'completion' ? phase : 'mutating';
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

/** No disposition has been taken: the pre-mutation gates are still available. */
export function dispositionPending(phase: TurnPhase): boolean {
	return phase === 'opening' || phase === 'reading' || phase === 'disposition_gate';
}

/** A declared contract is on record and no mutation has executed yet. */
export function contractPending(phase: TurnPhase): boolean {
	return phase === 'contract_declared' || phase === 'contract_reviewed';
}

/** A mutation reached execution this turn (successful or not). */
export function mutationReached(phase: TurnPhase): boolean {
	return phase === 'mutating' || phase === 'completion';
}

function contractPresent(phase: TurnPhase): boolean {
	return contractPending(phase) || phase === 'contract_carve_out';
}

export type TurnSurface = {
	tools: readonly AgenticChatTurnProviderToolV1[];
	toolChoice: 'none' | 'auto' | 'required';
};

/** The reviewer lane has its own surface; it is not an acting phase. */
export type ReviewerLane = 'contract_review';

export type TurnSurfaceContext = {
	/** Tools the opening pass mounted (admitted minus any deferred contract schema). */
	openingTools?: readonly AgenticChatTurnProviderToolV1[];
	/** Tools on the request being repaired; a repair restores exactly these on gate and shell passes. */
	requestTools?: readonly AgenticChatTurnProviderToolV1[];
	contextType?: string;
	/** The declared (carve-out) or unfinished (completion) contract that scopes write tools. */
	contract?: TurnContract | null;
	/** The reviewer approved a contract; repairs after approval restore the approved surface. */
	contractApproved?: boolean;
	/** Whether pure reads stay callable on the gate (false for the project-create opening gate). */
	allowReads?: boolean;
	/** Reviewer lanes: whether the proposal may still be returned for revision. */
	allowRevision?: boolean;
	/** Contract review: whether the reviewer may still downgrade to read-only. */
	allowReadOnlyCorrection?: boolean;
	/** A surface repair restores what the phase owns, which can differ from the pass surface. */
	repair?: boolean;
};

/**
 * The one decision of "which tools" for a phase. Returns null when the phase
 * cannot be mounted (no gate controls, no safe write tool for the contract).
 * Tool order always follows the admitted surface, so request JSON is stable.
 */
export function surfaceFor(
	phase: TurnPhase | ReviewerLane,
	admitted: readonly AgenticChatTurnProviderToolV1[],
	context: TurnSurfaceContext = {}
): TurnSurface | null {
	switch (phase) {
		case 'opening':
		case 'reading':
		case 'contract_cancelled': {
			if (context.repair) return autoSurface(admitted);
			return autoSurface(context.openingTools ?? admitted);
		}
		case 'disposition_gate': {
			if (context.repair)
				return { tools: context.requestTools ?? [], toolChoice: 'required' };
			const allowReads = context.allowReads !== false;
			const gateNames = new Set([
				DECLARE_TURN_CONTRACT_TOOL_NAME,
				REQUEST_TURN_CLARIFICATION_TOOL_NAME
			]);
			const tools = admitted.filter(
				(tool) =>
					gateNames.has(tool.function.name) ||
					(allowReads && isPureReadToolName(tool.function.name))
			);
			if (
				!Array.from(gateNames).every((name) =>
					tools.some((tool) => tool.function.name === name)
				)
			) {
				return null;
			}
			return { tools, toolChoice: 'required' };
		}
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
		case 'contract_declared':
		case 'contract_reviewed':
		case 'mutating':
		case 'completion': {
			if (context.repair)
				return { tools: approvedRepairSurface(admitted, context), toolChoice: 'auto' };
			if (phase === 'completion') {
				const contract = context.contract;
				if (!contract) return null;
				return writeSurface(admitted, getSafeWriteToolNamesForTurnContract(contract));
			}
			return autoSurface(admitted);
		}
		case 'contract_carve_out': {
			if (context.repair)
				return { tools: approvedRepairSurface(admitted, context), toolChoice: 'auto' };
			const contract = context.contract;
			if (!contract) return null;
			const safeToolNames = new Set(getSafeWriteToolNamesForTurnContract(contract));
			// Child creates require the durable project id returned by the shell. Keep
			// the first approved mutation phase structurally incapable of inventing that
			// id or racing goal/task calls alongside create_onto_project. Completion
			// routing mounts only the unresolved child tools after the shell succeeds.
			const firstPhaseToolNames = safeToolNames.has('create_onto_project')
				? new Set(['create_onto_project'])
				: safeToolNames;
			return writeSurface(admitted, firstPhaseToolNames);
		}
		case 'clarification':
		case 'synthesis':
		case 'terminal':
			return { tools: [], toolChoice: 'none' };
		case 'contract_review': {
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
					TURN_CONTRACT_REVIEW_APPROVAL_TOOL,
					...(readOnlyDispositionTool ? [readOnlyDispositionTool] : []),
					...(context.allowRevision ? [CONTRACT_PROPOSAL_REVISION_TOOL] : []),
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

function writeSurface(
	admitted: readonly AgenticChatTurnProviderToolV1[],
	safeToolNames: Iterable<string>
): TurnSurface | null {
	const names = safeToolNames instanceof Set ? safeToolNames : new Set(safeToolNames);
	const writeTools = admitted.filter((tool) => names.has(tool.function.name));
	if (writeTools.length === 0) return null;
	// Scheduling sidecars (call_ref/after) exist only for multi-write passes;
	// the carve-out and completion passes are the two places they are legal.
	return { tools: withSchedulingSidecar(writeTools), toolChoice: 'auto' };
}

/**
 * After approval a repair restores the approved surface. The project-create
 * shell carve-out is structurally narrow so child creates cannot race the
 * shell; keep that surface rather than the full admitted one.
 */
function approvedRepairSurface(
	admitted: readonly AgenticChatTurnProviderToolV1[],
	context: TurnSurfaceContext
): readonly AgenticChatTurnProviderToolV1[] {
	if (
		context.contractApproved &&
		(context.contextType === 'project_create' || turnContractCreatesProject(context.contract))
	) {
		return context.requestTools ?? admitted;
	}
	return admitted;
}
