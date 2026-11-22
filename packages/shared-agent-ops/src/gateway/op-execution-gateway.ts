// packages/shared-agent-ops/src/gateway/op-execution-gateway.ts
//
// Public facade for the BuildOS gateway execution surface. Keep this subpath
// stable: web, worker, and package consumers import from it. Implementation is
// split across focused modules below.
export * from './op-execution-gateway.core';
export * from './op-execution-gateway.mutations';
export * from './op-execution-gateway.validation';
export * from './op-execution-gateway.worker';
export * from './op-execution-gateway.staging';
export * from './op-execution-gateway.document-archive';
export * from './op-execution-gateway.archive-state';
export * from './op-execution-gateway.signal';
export {
	previewGatewayTableRowsUpdate,
	previewTableRowsUpdate,
	tableCsvPath,
	type GatewayTableRowsPreviewResult
} from './op-execution-gateway.tables';
export {
	KNOWLEDGE_ENRICH_INSTRUCTIONS_MAX,
	KNOWLEDGE_ENRICH_MAX_ENTITIES,
	KNOWLEDGE_QUERY_LIMIT_DEFAULT,
	KNOWLEDGE_QUERY_LIMIT_MAX,
	KNOWLEDGE_RECORD_MAX_ENTITIES,
	KNOWLEDGE_RECORD_MAX_FACTS,
	KNOWLEDGE_RECORD_MAX_SOURCES,
	KNOWLEDGE_SEARCH_LIMIT_DEFAULT,
	KNOWLEDGE_SEARCH_LIMIT_MAX,
	KNOWLEDGE_TOOL_SOURCE_TYPES,
	KNOWLEDGE_LENS_GUIDANCE,
	KNOWLEDGE_LENS_RECORD_LIMIT,
	compactKnowledgeEntityDetail,
	knowledgeGrantValueKey,
	lensGrantedValueKeys,
	runKnowledgeEnrich,
	runKnowledgeGet,
	runKnowledgeProjectLens,
	runKnowledgeQuery,
	runKnowledgeRecord,
	runKnowledgeRequestAccess,
	runKnowledgeSearch,
	type KnowledgeOpVia
} from './op-execution-gateway.knowledge';
export {
	KNOWLEDGE_CONNECTION_GROUPS_MAX,
	KNOWLEDGE_CONNECTION_PEOPLE_MAX,
	KNOWLEDGE_CONNECTION_WHERE_KEYS,
	isKnowledgeConnectionQuery,
	runKnowledgeConnectionsQuery
} from './op-execution-gateway.knowledge-connections';
