// apps/worker/src/workers/agentic-chat/provider/review/grounded-ids.ts
import { isValidUUID } from '@buildos/shared-types';
import type { MutationBatch } from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatTurnProviderRequestV1 } from '../contracts';

const ID_FIELDS = new Set([
	'id',
	'entity_id',
	'document_id',
	'task_id',
	'goal_id',
	'plan_id',
	'project_id',
	'event_id',
	'risk_id',
	'milestone_id',
	'src_id',
	'dst_id'
]);
const OPAQUE_FIELDS = new Set(['props', 'metadata', 'custom_fields']);

function canonicalLoadedId(value: unknown): string | null {
	if (typeof value !== 'string' || !value || value.length > 256 || value.trim() !== value)
		return null;
	// Ontology UUIDs are case-insensitive. External calendar identities are
	// opaque strings and must be copied exactly from their structured receipts.
	return isValidUUID(value) ? value.toLowerCase() : value;
}

/** Read identities from server records, never UUID-looking prose or proposed arguments. */
export function collectLoadedEntityIds(value: unknown): string[] {
	const ids = new Set<string>();
	let remaining = 20000;
	const visit = (node: unknown, depth: number) => {
		if (--remaining < 0 || depth > 32 || !node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) visit(item, depth + 1);
			return;
		}
		for (const [key, field] of Object.entries(node)) {
			const id = ID_FIELDS.has(key) ? canonicalLoadedId(field) : null;
			if (id) {
				ids.add(id);
			} else if (!OPAQUE_FIELDS.has(key)) visit(field, depth + 1);
		}
	};
	visit(value, 0);
	return [...ids];
}

export function groundedMutationReviewIds(
	request: AgenticChatTurnProviderRequestV1,
	batch?: MutationBatch
): ReadonlySet<string> | null {
	// Legacy protocol fixtures have no admission catalog. Production requests
	// always have one (including an empty catalog), and therefore fail closed.
	if (request.loadedEntityIds === undefined) return null;
	const ids = new Set(request.loadedEntityIds);
	for (const call of batch?.calls ?? []) {
		// This sidecar is added by the server before hashing. Actor arguments do
		// not supply grounding; otherwise an invented proposed ID could bless itself.
		const argumentsValue = JSON.parse(call.canonicalArguments);
		for (const id of collectLoadedEntityIds(argumentsValue._archive_review)) ids.add(id);
	}
	return ids;
}

export function reviewerReferencesAreGrounded(
	args: Record<string, unknown>,
	ids: ReadonlySet<string> | null,
	batch?: MutationBatch
): boolean {
	if (ids === null) return true;
	const grounded = (value: unknown) => {
		const id = canonicalLoadedId(value);
		return id !== null && ids.has(id);
	};
	if (Array.isArray(args.reference_candidates)) {
		for (const group of args.reference_candidates) {
			if (!group || typeof group !== 'object' || !Array.isArray(group.candidates))
				return false;
			if (
				group.candidates.some(
					(candidate: { id?: unknown }) => !candidate || !grounded(candidate.id)
				)
			)
				return false;
		}
	}
	if (Array.isArray(args.findings)) {
		// A defect may identify a wrong ID actually held in the proposal. That
		// is rejection evidence, never proof that the target exists or authority
		// to approve it as a reference candidate.
		const findingIds = new Set(ids);
		for (const call of batch?.calls ?? []) {
			for (const id of collectLoadedEntityIds(JSON.parse(call.canonicalArguments)))
				findingIds.add(id);
		}
		for (const finding of args.findings) {
			if (!finding || !Array.isArray(finding.target_ids)) return false;
			if (
				finding.target_ids.some((value: unknown) => {
					const id = canonicalLoadedId(value);
					return id === null || !findingIds.has(id);
				})
			)
				return false;
		}
	}
	// The completion-only checklist may include earlier archived targets absent
	// from active context. It never authorizes a call; the postcondition reader
	// independently verifies those targets before they can earn completion credit.
	return true;
}
