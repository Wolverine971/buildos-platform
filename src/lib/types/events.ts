// src/lib/types/events.ts

// Standardized event callback types for all modals and components

// Base callback types
export type OnCloseCallback = () => void;
export type OnDeleteCallback<T = string> = (id: T) => void;

// Entity-specific callback types
export interface TaskCallbacks {
	onUpdate?: ((task: any) => void) | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}

export interface NoteCallbacks {
	onUpdate?: ((note: any) => void) | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}

export interface ProjectCallbacks {
	onUpdate?: ((project: any) => void) | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}

export interface PhaseCallbacks {
	onUpdate?: ((phase: any) => void) | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
	onPhasesUpdate?: ((phases: any[]) => void) | null;
	onTasksUpdate?: ((taskUpdates: any) => void) | null;
	onProjectUpdate?: ((updates: any) => void) | null;
}

// Generic modal callback interface
export interface ModalCallbacks<T = any> {
	onUpdate?: ((item: T) => void) | null;
	onDelete?: OnDeleteCallback | null;
	onClose: OnCloseCallback;
}

// Event data structures for consistent event emissions
export interface EventData<T = any> {
	type: 'create' | 'update' | 'delete';
	entity: 'task' | 'note' | 'project' | 'phase';
	data: T;
	id?: string;
	timestamp: string;
}

// Helper function to create standardized event data
export function createEventData<T>(
	type: EventData['type'],
	entity: EventData['entity'],
	data: T,
	id?: string
): EventData<T> {
	return {
		type,
		entity,
		data,
		id,
		timestamp: new Date().toISOString()
	};
}
