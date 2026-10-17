// packages/shared-agent-ops/src/chat-cards/card-fields.ts
//
// Field readers and the digest primitive shared by the proposal-card contract
// (proposal-card.ts) and its per-kind files. Every reader takes structured
// JSON fields only; nothing here reads prose. Client-safe: no Node imports.
import { sha256 } from 'js-sha256';

/** A card can be decided for 24 hours after it was proposed. */
export const PROPOSAL_CARD_TTL_MS = 24 * 60 * 60 * 1000;
/** An applied card can be undone for 7 days after it was applied. */
export const PROPOSAL_CARD_UNDO_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Every list a card carries is capped here (the true total rides along). */
export const PROPOSAL_CARD_LIST_LIMIT = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function uuid(value: unknown): string | null {
	return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}
export function text(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}
export function count(value: unknown): number | null {
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
	// Postgres bigint counts can arrive as numeric strings.
	if (typeof value === 'string' && /^\d{1,15}$/.test(value)) return Number(value);
	return null;
}
export function timestamp(value: unknown): string | null {
	return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
/** A machine code: lowercase snake identifiers only. */
export function code(value: unknown): string | null {
	return typeof value === 'string' && /^[a-z][a-z0-9_.]{0,127}$/.test(value) ? value : null;
}
export function codes(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const out: string[] = [];
	for (const entry of value) {
		const parsed = code(entry);
		if (!parsed) return null;
		out.push(parsed);
	}
	return out;
}

export type ProjectRefV1 = { id: string; name: string };

export function parseProjectRef(value: unknown): ProjectRefV1 | null {
	if (!isRecord(value)) return null;
	const id = uuid(value.id);
	const name = text(value.name);
	return id && name !== null ? { id, name } : null;
}

/** A started duplicate check (WP3), shown as a strip under the card. */
export type ProposalDuplicateCheckRefV1 = {
	run_id: string;
	/** Where the run page lives (/projects/[root]/consolidate/[run]). */
	root_project_id: string;
};

export function parseDuplicateCheckRef(value: unknown): ProposalDuplicateCheckRefV1 | null {
	if (!isRecord(value)) return null;
	const runId = uuid(value.run_id);
	const root = uuid(value.root_project_id);
	return runId && root ? { run_id: runId, root_project_id: root } : null;
}

type DigestValue =
	| string
	| number
	| boolean
	| null
	| DigestValue[]
	| { [key: string]: DigestValue };

function canonical(value: DigestValue): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const keys = Object.keys(value).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
}

/**
 * Order-stable hash of ids, counts and codes. Callers pass only those (never
 * names or timestamps, which the worker localizes and which change without
 * changing what a click would do) and sort any set-like arrays themselves.
 */
export function digestOf(fields: { [key: string]: DigestValue }): string {
	return sha256(canonical(fields));
}

export function sortedStrings(values: readonly string[]): string[] {
	return [...values].sort();
}

/** Capped list plus the true total. */
export function capped<T>(values: readonly T[], limit: number): { items: T[]; total: number } {
	return { items: values.slice(0, limit), total: values.length };
}
