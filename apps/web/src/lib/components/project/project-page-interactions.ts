// apps/web/src/lib/components/project/project-page-interactions.ts

export type ImageUploadPanelRef = {
	openUploadModal: () => void;
};

export function requestImageUploadOpen(panelRef: ImageUploadPanelRef | null): boolean {
	if (panelRef) {
		panelRef.openUploadModal();
		return false;
	}
	return true;
}

export function flushPendingImageUploadOpen(
	pending: boolean,
	panelRef: ImageUploadPanelRef | null
): boolean {
	if (!pending || !panelRef) {
		return pending;
	}
	panelRef.openUploadModal();
	return false;
}

export type EntityOpenAction =
	| { kind: 'task'; entityId: string }
	| { kind: 'plan'; entityId: string }
	| { kind: 'goal'; entityId: string }
	| { kind: 'document'; entityId: string }
	| { kind: 'milestone'; entityId: string }
	| { kind: 'risk'; entityId: string }
	| { kind: 'event'; entityId: string }
	| { kind: 'project'; entityId: string };

export type EntityOpenResolution =
	| { result: 'opened'; action: EntityOpenAction }
	| { result: 'unsupported' }
	| { result: 'unknown' };

export function resolveEntityOpenAction(entityType: string, entityId: string): EntityOpenResolution {
	switch (entityType) {
		case 'task':
			return { result: 'opened', action: { kind: 'task', entityId } };
		case 'plan':
			return { result: 'opened', action: { kind: 'plan', entityId } };
		case 'goal':
			return { result: 'opened', action: { kind: 'goal', entityId } };
		case 'note':
		case 'document':
			return { result: 'opened', action: { kind: 'document', entityId } };
		case 'milestone':
			return { result: 'opened', action: { kind: 'milestone', entityId } };
		case 'risk':
			return { result: 'opened', action: { kind: 'risk', entityId } };
		case 'event':
			return { result: 'opened', action: { kind: 'event', entityId } };
		case 'project':
			return { result: 'opened', action: { kind: 'project', entityId } };
		case 'requirement':
		case 'source':
			return { result: 'unsupported' };
		default:
			return { result: 'unknown' };
	}
}
