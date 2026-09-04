// apps/web/src/lib/services/ontology/onto-event.service.ts
// Re-export shim: the ontology event row CRUD moved to shared-agent-ops so the
// shared calendar write service can create/update events on the worker too.
export {
	OntoEventService,
	type CreateOntoEventInput,
	type OntoEventOwner,
	type OntoEventOwnerType,
	type OntoEventQueryParams,
	type UpdateOntoEventInput
} from '@buildos/shared-agent-ops/calendar/onto-event.service';
