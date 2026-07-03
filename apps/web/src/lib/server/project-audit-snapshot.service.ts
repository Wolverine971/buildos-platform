// apps/web/src/lib/server/project-audit-snapshot.service.ts
//
// Re-export shim: the complete-audit snapshot and trigger gate helpers are
// shared with the worker scheduler.
export {
	buildProjectAuditMaturitySnapshot,
	buildProjectAuditSnapshotFingerprint,
	classifyProjectAuditSize,
	isProjectAuditBaselineEligible,
	loadProjectAuditSnapshot
} from '@buildos/shared-agent-ops/project-audits';
export type {
	ProjectAuditActivityRow,
	ProjectAuditGraphEntity,
	ProjectAuditSnapshot
} from '@buildos/shared-agent-ops/project-audits';
