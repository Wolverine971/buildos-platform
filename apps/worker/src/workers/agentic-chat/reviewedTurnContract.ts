// apps/worker/src/workers/agentic-chat/reviewedTurnContract.ts
import {
	type FastToolExecution,
	type TurnContract,
	isCancelTurnContractCall,
	isRequestTurnClarificationCall,
	parseDeclaredTurnContract,
	resolveTurnContractFromExecutions
} from '@buildos/agentic-chat-runtime/loop';
import { DECLARE_TURN_CONTRACT_TOOL_NAME } from '@buildos/agentic-chat-runtime/catalog';
import { contractSha256 } from './provider/validation';
import {
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from './tools/execution-adapter';

/**
 * Replay the worker's typed-review correction path for terminal receipts and
 * carry-forward state. A correction replaces the entire proposal, but only
 * after an approval of that exact SHA is durable. The host-neutral resolver
 * still owns declarations, cancellation and legacy implicit write contracts.
 */
export function resolveReviewedTurnContractFromExecutions(
	toolExecutions: FastToolExecution[] | null | undefined
): TurnContract | null {
	const executions = toolExecutions ?? [];
	let pendingCorrection: TurnContract | null = null;
	let approvedCorrection: TurnContract | null = null;
	let afterApproval = 0;
	for (let index = 0; index < executions.length; index += 1) {
		const execution = executions[index]!;
		const { toolCall, result } = execution;
		if (!result.success) continue;
		if (
			toolCall.function.name === DECLARE_TURN_CONTRACT_TOOL_NAME ||
			isCancelTurnContractCall(toolCall) ||
			isRequestTurnClarificationCall(toolCall)
		) {
			pendingCorrection = null;
			continue;
		}
		if (toolCall.function.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME) {
			pendingCorrection =
				result.result?.status === 'revision_required'
					? parseDeclaredTurnContract(result.result.corrected_contract)
					: null;
			continue;
		}
		if (toolCall.function.name !== APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME) continue;
		if (pendingCorrection && result.result?.status === 'turn_contract_review_approved') {
			const sha = contractSha256(pendingCorrection);
			let args: Record<string, unknown> | null = null;
			try {
				args = JSON.parse(toolCall.function.arguments);
			} catch {
				// A malformed approval cannot replace a durable declaration.
			}
			if (args?.contract_sha256 === sha && result.result.contract_sha256 === sha) {
				approvedCorrection = pendingCorrection;
				afterApproval = index + 1;
			}
		}
		pendingCorrection = null;
	}
	return resolveTurnContractFromExecutions(executions.slice(afterApproval), approvedCorrection);
}
