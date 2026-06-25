// packages/shared-agent-ops/src/index.ts
//
// @buildos/shared-agent-ops — the BuildOS agent operation layer shared by the
// web agent-call gateway and the worker Agent Run runner. One source of truth for
// op policy/scope (and, in later slices, the op handlers themselves).
export * from './policy';

// Shared pure utilities
// NOTE: ./ontology/onto and ./ontology/onto-api are NOT in the barrel — they export
// colliding names (DocTreeNode/DocumentChildren) and are exposed only via subpath
// (@buildos/shared-agent-ops/ontology/onto[-api]) so each resolves to the right type.
export * from './utils/project-props-sanitizer';
export * from './utils/markdown-normalization';
export * from './ops/update-value-validation';
export * from './ops/gateway-op-aliases';

// Task/document state normalizers. project-graph.types is subpath-only (EntityKind collision).
export * from './ontology/task-state';
export * from './ontology/document-state';
export * from './ontology/start-here';
export * from './ontology/start-here.service';

// Search and activity utilities
export * from './utils/search-filter';
export * from './ops/async-activity-logger';

// Notifications and validation utilities
export * from './utils/entity-reference-parser';
export * from './utils/validation-utils';
export * from './ops/tracked-in-app-notification.service';
export * from './ops/entity-mention-notification.service';

// Ontology mutation core
export * from './ontology/relationship-resolver';
export * from './ontology/auto-organizer.service';
export * from './ontology/doc-structure.service';
export * from './ontology/project-graph-loader';
export * from './ontology/instantiation.service';
export * from './ontology/ontology-projects.service';

// Worker-safe op execution
export * from './gateway/op-execution';

// Worker-safe calendar capability for Agent Runs (no SvelteKit imports)
export * from './calendar/agent-run-calendar-port';

// Staged-mutation commit
export * from './gateway/change-set';

// AI Inbox denormalized index maintenance
export * from './inbox-index';

// Project Review Loop helpers
export * from './project-loops';

// Document outline extraction (pure; used by versioning)
export * from './utils/document-outline';

// Ontology relationship/edge logic (pure; used by op handlers and the worker runner)
export * from './ontology/edge-direction';
export * from './ontology/containment-organizer';
export * from './ontology/relationship-policy';
export * from './ontology/edge-relationship-resolver';

// Document versioning (takes a supabase client as a param)
export * from './ontology/versioning.service';
