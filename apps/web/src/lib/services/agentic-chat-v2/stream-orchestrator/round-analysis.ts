// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts
import '$lib/services/agentic-chat/tools/registry/install-loop-catalog';

export {
	buildRoundToolPattern,
	buildToolRoundFingerprint,
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	extractGatewayExecResultData,
	extractGatewayRequiredFieldFailures,
	extractGatewayRequiredFieldFailuresFromValidationIssues,
	extractUnlinkedDocumentIds,
	getDocumentTreeRootCount,
	getGatewayExecOp,
	hasDocumentOrganizationFailureSignal,
	hasDocumentOrganizationValidationIssue,
	isDuplicateWriteSkippedExecution,
	isReadLikeOperation,
	isWriteLikeOperation,
	type GatewayExecResultData,
	type RoundToolPattern
} from '@buildos/agentic-chat-runtime/loop';
