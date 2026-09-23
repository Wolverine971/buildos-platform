// apps/worker/src/workers/agentic-chat/mutations/execution-context.ts
//
// The per-execution context and the small receipt helpers shared by
// `argument-normalizers.ts` and `receipt-builders.ts`. Kept separate so neither
// of those modules imports the other.

import { type EntityKind } from '@buildos/shared-agent-ops/ontology/edge-direction';
import { type JsonValue, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import { type MutationInput, uncertainFailure } from './adapter-boundary';

/** Mutable state shared by one table-driven execution. */
export type AgenticChatMutationExecutionContextV1 = {
	toolName: string;
	input: MutationInput;
	/** Arguments as they will reach the runner. Normalizers rewrite this in place. */
	args: Record<string, unknown>;
	/** The resolved project fence, or null for an unfenced write. */
	projectId: string | null;
	/**
	 * Values a normalizer resolved that a receipt builder must prove the
	 * downstream commit against (the canonical edge, a parent title, ...).
	 */
	expected: Record<string, unknown>;
};

export const REVIEWED_LINK_ENTITY_KINDS = Object.freeze([
	'plan',
	'goal',
	'milestone',
	'task',
	'document',
	'risk',
	'metric',
	'source'
] as const satisfies readonly EntityKind[]);

export type ReviewedLinkEntityKind = (typeof REVIEWED_LINK_ENTITY_KINDS)[number];

export type ExpectedEdge = {
	src_kind: ReviewedLinkEntityKind;
	src_id: string;
	dst_kind: ReviewedLinkEntityKind;
	dst_id: string;
	rel: string;
	props: Record<string, unknown>;
};

export function sameJson(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
	return (
		canonicalizeAgenticChatJson(left as JsonValue) ===
		canonicalizeAgenticChatJson(right as JsonValue)
	);
}

export function invalidReceipt(toolName: string, detail: string) {
	return uncertainFailure(`${toolName}_receipt_invalid`, `${toolName} ${detail}`);
}
