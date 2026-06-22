// packages/shared-agent-ops/src/gateway/op-execution-gateway.mutations.ts
//
// Shared metadata for gateway write ops. Runtime handlers still live in the
// execution core; this module describes the entity/action semantics that staging,
// change-set commit, project activity logging, and worker summaries need.
import type {
	BuildosAgentWriteOp,
	EntityAction,
	ProjectLogAction,
	ProjectLogEntityType,
	ProposedChange,
	ProposedChangeAction
} from '@buildos/shared-types';

export type GatewayMutationEntityKind = ProjectLogEntityType | 'calendar';

export type GatewayMutationActivityConfig = {
	entityType: ProjectLogEntityType;
	action: ProjectLogAction;
};

export type GatewayMutationCommand = {
	entityKind: GatewayMutationEntityKind;
	proposedChangeAction: ProposedChangeAction;
	activity?: GatewayMutationActivityConfig;
};

export const PROPOSED_CHANGE_ACTION_TO_ENTITY_ACTION: Record<ProposedChangeAction, EntityAction> = {
	create: 'created',
	update: 'updated',
	delete: 'deleted'
};

export const GATEWAY_MUTATION_COMMANDS: Record<BuildosAgentWriteOp, GatewayMutationCommand> = {
	'onto.task.create': {
		entityKind: 'task',
		proposedChangeAction: 'create',
		activity: { entityType: 'task', action: 'created' }
	},
	'onto.task.update': {
		entityKind: 'task',
		proposedChangeAction: 'update',
		activity: { entityType: 'task', action: 'updated' }
	},
	'onto.task.docs.create_or_attach': {
		// Staging/audit inference historically groups this under the task op family;
		// activity logging records the created document explicitly below.
		entityKind: 'task',
		proposedChangeAction: 'create',
		activity: { entityType: 'document', action: 'created' }
	},
	'onto.document.create': {
		entityKind: 'document',
		proposedChangeAction: 'create',
		activity: { entityType: 'document', action: 'created' }
	},
	'onto.document.update': {
		entityKind: 'document',
		proposedChangeAction: 'update',
		activity: { entityType: 'document', action: 'updated' }
	},
	'onto.document.tree.move': {
		entityKind: 'document',
		proposedChangeAction: 'update',
		activity: { entityType: 'document', action: 'updated' }
	},
	'onto.project.create': {
		entityKind: 'project',
		proposedChangeAction: 'create',
		activity: { entityType: 'project', action: 'created' }
	},
	'onto.project.update': {
		entityKind: 'project',
		proposedChangeAction: 'update',
		activity: { entityType: 'project', action: 'updated' }
	},
	'onto.goal.create': {
		entityKind: 'goal',
		proposedChangeAction: 'create',
		activity: { entityType: 'goal', action: 'created' }
	},
	'onto.goal.update': {
		entityKind: 'goal',
		proposedChangeAction: 'update',
		activity: { entityType: 'goal', action: 'updated' }
	},
	'onto.plan.create': {
		entityKind: 'plan',
		proposedChangeAction: 'create',
		activity: { entityType: 'plan', action: 'created' }
	},
	'onto.plan.update': {
		entityKind: 'plan',
		proposedChangeAction: 'update',
		activity: { entityType: 'plan', action: 'updated' }
	},
	'onto.milestone.create': {
		entityKind: 'milestone',
		proposedChangeAction: 'create',
		activity: { entityType: 'milestone', action: 'created' }
	},
	'onto.milestone.update': {
		entityKind: 'milestone',
		proposedChangeAction: 'update',
		activity: { entityType: 'milestone', action: 'updated' }
	},
	'onto.risk.create': {
		entityKind: 'risk',
		proposedChangeAction: 'create',
		activity: { entityType: 'risk', action: 'created' }
	},
	'onto.risk.update': {
		entityKind: 'risk',
		proposedChangeAction: 'update',
		activity: { entityType: 'risk', action: 'updated' }
	},
	'onto.edge.link': {
		entityKind: 'edge',
		proposedChangeAction: 'create',
		activity: { entityType: 'edge', action: 'created' }
	},
	'onto.edge.unlink': {
		entityKind: 'edge',
		proposedChangeAction: 'delete',
		activity: { entityType: 'edge', action: 'updated' }
	},
	'cal.event.create': {
		entityKind: 'event',
		proposedChangeAction: 'create',
		activity: { entityType: 'event', action: 'created' }
	},
	'cal.event.update': {
		entityKind: 'event',
		proposedChangeAction: 'update',
		activity: { entityType: 'event', action: 'updated' }
	},
	'cal.event.delete': {
		entityKind: 'event',
		proposedChangeAction: 'delete',
		activity: { entityType: 'event', action: 'deleted' }
	},
	'cal.project.set': {
		entityKind: 'calendar',
		proposedChangeAction: 'update',
		activity: { entityType: 'project', action: 'updated' }
	}
};

export function getGatewayMutationCommand(op: string): GatewayMutationCommand | undefined {
	return (GATEWAY_MUTATION_COMMANDS as Record<string, GatewayMutationCommand | undefined>)[op];
}

export function entityActionFromProposedChangeAction(action: ProposedChangeAction): EntityAction {
	return PROPOSED_CHANGE_ACTION_TO_ENTITY_ACTION[action] ?? 'updated';
}

export function proposedChangeActionForGatewayOp(op: string): ProposedChangeAction {
	const command = getGatewayMutationCommand(op);
	if (command) return command.proposedChangeAction;
	if (op.endsWith('.create')) return 'create';
	if (op.endsWith('.delete')) return 'delete';
	return 'update';
}

export function entityActionForGatewayOp(op: string): EntityAction {
	return entityActionFromProposedChangeAction(proposedChangeActionForGatewayOp(op));
}

export function activityConfigForGatewayOp(op: string): GatewayMutationActivityConfig | undefined {
	return getGatewayMutationCommand(op)?.activity;
}

export function entityKindFromGatewayOp(op: string): string | null {
	const command = getGatewayMutationCommand(op);
	if (command) return command.entityKind;

	const parts = op.split('.');
	if (parts[0] === 'onto' && parts[1]) return parts[1];
	if (parts[0] === 'cal' && parts[1] === 'event') return 'event';
	if (parts[0] === 'cal' && parts[1] === 'project') return 'calendar';
	return null;
}

export function buildGatewayProjectUrl(projectId?: string | null): string | null {
	return projectId ? `/projects/${projectId}` : null;
}

export function buildGatewayEntityUrl(
	kind: string,
	entityId: string,
	projectId?: string | null
): string | null {
	if (kind === 'project') return `/projects/${entityId}`;
	if (!projectId) return null;
	if (kind === 'task') return `/projects/${projectId}/tasks/${entityId}`;
	if (kind === 'document') return `/projects/${projectId}/documents/${entityId}`;
	return `/projects/${projectId}?entity=${encodeURIComponent(kind)}&id=${encodeURIComponent(entityId)}`;
}

export function titleFromGatewayChange(
	change: Pick<ProposedChange, 'after' | 'before'>
): string | null {
	const readTitle = (value: unknown): string | null => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		const record = value as Record<string, unknown>;
		for (const key of ['title', 'name', 'summary'] as const) {
			const candidate = record[key];
			if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
		}
		return null;
	};
	return readTitle(change.after) ?? readTitle(change.before);
}
