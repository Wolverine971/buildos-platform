import { TaskEventSyncCoordinator } from '@buildos/shared-agent-ops/calendar/task-event-sync';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OntoEventSyncService } from './onto-event-sync.service';

/**
 * Web adapter for the shared task-event coordinator. OntoEventSyncService keeps
 * ownership of web calendar fan-out; the scheduling and edge semantics are now
 * shared with the worker runtime.
 */
export class TaskEventSyncService extends TaskEventSyncCoordinator {
	constructor(supabase: SupabaseClient<Database>) {
		const eventSync = new OntoEventSyncService(supabase);
		super(supabase, {
			createEvent: (userId, request) => eventSync.createEvent(userId, request),
			updateEvent: (userId, request) => eventSync.updateEvent(userId, request),
			deleteEvent: (userId, request) => eventSync.deleteEvent(userId, request)
		});
	}
}
