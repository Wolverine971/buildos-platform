// apps/worker/src/workers/agentic-chat/shared/tool-scheduling.ts
import type { JsonObject } from '@buildos/shared-types';

/**
 * Same-response scheduling sidecar fields. `call_ref` names a call and `after`
 * lists the refs it waits for inside one provider response. They order
 * execution only, so they are removed before domain validation, adapter
 * dispatch, and read identity.
 */
export const SCHEDULING_SIDECAR_KEYS = ['call_ref', 'after'] as const;
const SCHEDULING_SIDECAR_KEY_SET: ReadonlySet<string> = new Set(SCHEDULING_SIDECAR_KEYS);

/** The call's domain arguments: every field except the scheduling sidecar, in original order. */
export function stripSchedulingSidecar(arguments_: JsonObject): JsonObject {
	return Object.fromEntries(
		Object.entries(arguments_).filter(([key]) => !SCHEDULING_SIDECAR_KEY_SET.has(key))
	) as JsonObject;
}
