// packages/shared-agent-ops/tsup.config.ts
import { defineConfig } from 'tsup';

// Main barrel entry (`.`) plus dedicated subpath entries for modules that must
// stay path-distinct because they export colliding symbol names (e.g. onto vs
// onto-api both define DocTreeNode/DocumentChildren). Add a subpath entry here
// whenever a moved module collides with the barrel.
export default defineConfig({
	entry: [
		'src/index.ts',
		'src/policy.ts',
		'src/ontology/onto.ts',
		'src/ontology/onto-api.ts',
		'src/ontology/project-graph.types.ts',
		'src/ontology/task-state.ts',
		'src/ontology/document-state.ts',
		'src/ontology/start-here.ts',
		'src/ontology/start-here.service.ts',
		'src/ontology/relationship-resolver.ts',
		'src/ontology/auto-organizer.service.ts',
		'src/ontology/doc-structure.service.ts',
		'src/ontology/project-graph-loader.ts',
		'src/ontology/instantiation.service.ts',
		'src/ontology/ontology-projects.service.ts',
		'src/ontology/edge-direction.ts',
		'src/ontology/containment-organizer.ts',
		'src/ontology/relationship-policy.ts',
		'src/ontology/edge-relationship-resolver.ts',
		'src/ontology/versioning.service.ts',
		'src/ops/update-value-validation.ts',
		'src/ops/async-activity-logger.ts',
		'src/ops/tracked-in-app-notification.service.ts',
		'src/ops/entity-mention-notification.service.ts',
		'src/ops/gateway-op-aliases.ts',
		'src/ops/security-event-logger.ts',
		'src/calendar/agent-run-calendar-port.ts',
		'src/inbox-index.ts',
		'src/project-audits.ts',
		'src/proposal-context/index.ts',
		'src/gateway/agent-call-project-activity.service.ts',
		'src/gateway/write-audit.service.ts',
		'src/gateway/op-execution-gateway.ts',
		'src/utils/project-props-sanitizer.ts',
		'src/utils/markdown-normalization.ts',
		'src/utils/search-filter.ts',
		'src/utils/entity-reference-parser.ts',
		'src/utils/validation-utils.ts',
		'src/utils/document-outline.ts'
	],
	format: ['cjs', 'esm'],
	dts: true,
	clean: true,
	splitting: false,
	sourcemap: false
});
