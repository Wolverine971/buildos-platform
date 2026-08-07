// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-failure.ts
export {
	buildFailureKey,
	classifyToolFailure,
	isNotFoundFailure,
	isValidationFailure,
	parseInvalidArgumentFailure,
	parseRequiredParameterFailure,
	type ClassifyToolFailureParams,
	type ToolFailure,
	type ToolFailureKind
} from '@buildos/agentic-chat-runtime/loop';
