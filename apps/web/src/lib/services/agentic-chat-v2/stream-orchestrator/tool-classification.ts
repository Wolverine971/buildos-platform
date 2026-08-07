// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-classification.ts
import '$lib/services/agentic-chat/tools/registry/install-loop-catalog';

export {
	classifyToolExecution,
	classifyToolTraceName,
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	didToolExecutionReachWriteExecutor,
	doesToolExecutionRequireUserAction,
	extractCanonicalOp,
	extractGatewayExecResultData,
	getGatewayExecOp,
	isDiscoveryToolName,
	isDuplicateWriteSkippedExecution,
	isLikelyReadToolName,
	isLikelyWriteToolName,
	isPureReadToolName,
	isReadLikeOperation,
	isWebResearchToolName,
	isWriteLedgerToolExecution,
	isWriteLikeOperation,
	resolveToolOperationName,
	type GatewayExecResultData,
	type ToolExecutionClassification
} from '@buildos/agentic-chat-runtime/loop';
