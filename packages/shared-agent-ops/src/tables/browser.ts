// packages/shared-agent-ops/src/tables/browser.ts
// Browser build of `@buildos/shared-agent-ops/tables` (selected by the
// package.json "browser" export condition, which Vite uses for client
// bundles). Same exports as ./index.ts except the Supabase-backed repository
// (loadTable, listProjectTables, createTableDocument, applyTableChanges),
// which imports Node-only modules (node:crypto). Call those through the
// /api/onto/tables endpoints from the browser.
export * from './table-types';
export * from './table-schema';
export * from './table-query';
export * from './table-csv';
export * from './table-llm-format';
export * from './table-change';
export { TableServiceError } from './table-errors';
export * from './table-ai-fill';
