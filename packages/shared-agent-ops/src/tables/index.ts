// packages/shared-agent-ops/src/tables/index.ts
// `@buildos/shared-agent-ops/tables` — the shared Tables module
// (docs/specs/tables/CONTRACT.md). Server and worker code resolve this entry.
// Browsers resolve `./browser.ts` instead (package.json "browser" condition),
// which is the same surface minus the Supabase-backed repository.
export * from './table-types';
export * from './table-schema';
export * from './table-query';
export * from './table-csv';
export * from './table-llm-format';
export * from './table-change';
export {
	TableServiceError,
	applyTableChanges,
	createTableDocument,
	listProjectTables,
	loadTable,
	type TableDataClient,
	type TableListItem
} from './table-repository';
export * from './table-ai-fill';
