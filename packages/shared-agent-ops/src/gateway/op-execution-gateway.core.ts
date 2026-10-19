// packages/shared-agent-ops/src/gateway/op-execution-gateway.core.ts
// Compatibility exports; entity handlers and external dispatch live in focused modules.
export {
	EXTERNAL_CUSTOM_OPS,
	EXTERNAL_WRITE_OP_SCHEMAS,
	withExternalArchiveUpdateParameter
} from './op-execution-gateway.config';
export { clampLimit } from './op-execution-gateway.pagination';
export { summarizeDescription } from './op-execution-gateway.text';
export {
	ExternalToolGatewayError,
	buildExecError,
	extractWriteEntityMeta,
	normalizeGatewayError
} from './op-execution-gateway.responses';
export type {
	CalendarPort,
	ExternalGatewayRegistry,
	ExternalGatewayRegistryEntry,
	GatewayLookupMemo,
	RegistryOp,
	TaskSyncPort,
	ToolExecutionContext
} from './op-execution-gateway.types';
export { previewDocumentUpdate } from './op-execution-gateway.documents';
export {
	EXTERNAL_OP_HANDLERS,
	buildRegistryVersion,
	buildExternalToolDescription,
	buildExternalGatewayRegistry,
	executeGatewayOp,
	loadStageBeforeSnapshot
} from './op-execution-gateway.external';
