// apps/web/src/lib/components/knowledge/sharing-types.ts
//
// Shapes for knowledge in shared projects (tasker 168), shared by the server (sharing.server.ts)
// and the cards. They mirror the jsonb the knowledge_* sharing functions return.

export type LensFact = {
	id: string;
	predicate: string;
	value: string | null;
	object_name: string | null;
	object_kind: string | null;
	qualifiers: Record<string, unknown> | null;
	/** First public web source, when there is one. */
	source_url: string | null;
	via: 'shared' | 'grant';
};

export type LensEntry = {
	owner: { user_id: string; name: string };
	entity: { id: string; kind: string; name: string; summary: string | null };
	record_ids: string[];
	quotes: string[];
	facts: LensFact[];
	hidden: { contact: number; other: number };
	ask: { id: string; status: 'requested' | 'declined'; created_at: string } | null;
	grant: { id: string; what: string; duration: string; expires_at: string | null } | null;
};

export type EntityShares = {
	projects: Array<{
		project_id: string;
		project_name: string;
		members: Array<{ user_id: string; name: string }>;
	}>;
	shares: Array<{
		id: string;
		status: 'requested' | 'granted' | 'declined' | 'canceled' | 'revoked';
		what: 'contact' | 'all' | 'picked';
		predicates: string[];
		duration: 'membership' | 'always' | 'until';
		expires_at: string | null;
		project_id: string | null;
		project_name: string | null;
		grantee: { user_id: string; name: string } | null;
		requested_by: { user_id: string; name: string } | null;
		created_at: string;
		decided_at: string | null;
		live: boolean;
	}>;
};

export type ShareInboxItem = {
	id: string;
	what: 'contact' | 'all';
	via: 'web' | 'agent';
	created_at: string;
	entity: { id: string; kind: string; name: string };
	project: { id: string | null; name: string | null };
	requested_by: { user_id: string; name: string };
};

export type ShareTerms = {
	what: 'contact' | 'all' | 'picked';
	predicates?: string[];
	duration: 'membership' | 'always' | 'until';
	expiresAt?: string | null;
};

export type AskResult = {
	status: 'requested' | 'declined' | 'already_shared' | 'not_found' | 'rate_limited';
	id?: string;
	merged?: boolean;
};

/** Predicates that count as contact details (the default "Ask" and "Share contact details"). */
export const CONTACT_PREDICATES = ['email', 'phone', 'address'] as const;
