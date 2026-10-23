// apps/web/src/lib/server/people/invite-links.ts
//
// Quick invite links (supabase/migrations/20261023190000_project_invite_links.sql).
//
// The database stores only sha256(token). The token itself is derived here from the
// link id with a server secret, so the owner can copy the current link again at any
// time while a database read alone can never rebuild a working link. Resetting a link
// makes a new id, so a new token.

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { PUBLIC_APP_URL } from '$env/static/public';
import { dev } from '$app/environment';
import {
	isAgentAccess,
	isPersonRole,
	type AgentAccess,
	type PersonRole
} from '$lib/components/people/people-copy';

const TOKEN_LENGTH = 32;
/** 32 base64url characters (192 bits). */
export const INVITE_LINK_TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;
export const INVITE_LINK_MAX_DAYS = 30;

export function appBaseUrl(): string {
	return PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
}

/** The link's token: a keyed hash of its id, never stored. */
export function deriveInviteLinkToken(
	linkId: string,
	secret: string | undefined = env.PRIVATE_SUPABASE_SERVICE_KEY
): string {
	if (!secret) throw new Error('Invite links need the server secret');
	return createHmac('sha256', secret)
		.update('project-invite-link\n')
		.update(linkId)
		.digest('base64url')
		.slice(0, TOKEN_LENGTH);
}

/** What the database stores and looks links up by. */
export function hashInviteToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function inviteLinkPath(token: string): string {
	return `/join/${token}`;
}

/** A fresh link id with its token and stored hash. */
export function newInviteLink(): { id: string; token: string; tokenHash: string } {
	const id = randomUUID();
	const token = deriveInviteLinkToken(id);
	return { id, token, tokenHash: hashInviteToken(token) };
}

export type InviteLinkSettings = {
	id: string;
	role_key: PersonRole;
	agent_access: AgentAccess;
	expires_at: string;
	expired: boolean;
	join_count: number;
	last_joined_at: string | null;
	created_at: string | null;
};

export type InviteLinkForOwner = InviteLinkSettings & { url: string };

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** Reads the `link` object the owner RPCs return; null when there is none. */
export function readInviteLinkSettings(value: unknown): InviteLinkSettings | null {
	const row = record(value);
	if (!row || typeof row.id !== 'string' || typeof row.expires_at !== 'string') return null;
	const joins = Number(row.join_count);
	return {
		id: row.id,
		role_key: isPersonRole(row.role_key) ? row.role_key : 'viewer',
		agent_access: isAgentAccess(row.agent_access) ? row.agent_access : 'read',
		expires_at: row.expires_at,
		expired: row.expired === true,
		join_count: Number.isFinite(joins) && joins > 0 ? Math.floor(joins) : 0,
		last_joined_at: typeof row.last_joined_at === 'string' ? row.last_joined_at : null,
		created_at: typeof row.created_at === 'string' ? row.created_at : null
	};
}

/** The owner's view: settings plus the shareable URL, rebuilt from the id. */
export function inviteLinkForOwner(
	settings: InviteLinkSettings,
	baseUrl: string = appBaseUrl()
): InviteLinkForOwner {
	return {
		...settings,
		url: `${baseUrl}${inviteLinkPath(deriveInviteLinkToken(settings.id))}`
	};
}

/** Link length in days from a request body: an integer 1..30, else null. */
export function readInviteLinkDays(value: unknown): number | null {
	const days = typeof value === 'string' ? Number(value) : value;
	if (typeof days !== 'number' || !Number.isInteger(days)) return null;
	return days >= 1 && days <= INVITE_LINK_MAX_DAYS ? days : null;
}

export type InviteLinkPreview =
	| {
			status: 'active';
			project_name: string;
			inviter_name: string | null;
			role_key: PersonRole;
			agent_access: AgentAccess;
			expires_at: string | null;
			already_member: boolean;
			project_id: string | null;
	  }
	| { status: 'expired' | 'reset' | 'turned_off' | 'not_found' };

/** Reads get_project_invite_link_preview output; anything unexpected reads as not found. */
export function readInviteLinkPreview(value: unknown): InviteLinkPreview {
	const row = record(value);
	const status = row?.status;
	if (status === 'expired' || status === 'reset' || status === 'turned_off') {
		return { status };
	}
	if (status !== 'active' || typeof row?.project_name !== 'string') {
		return { status: 'not_found' };
	}
	return {
		status: 'active',
		project_name: row.project_name,
		inviter_name:
			typeof row.inviter_name === 'string' && row.inviter_name.trim()
				? row.inviter_name.trim()
				: null,
		role_key: isPersonRole(row.role_key) ? row.role_key : 'viewer',
		agent_access: isAgentAccess(row.agent_access) ? row.agent_access : 'read',
		expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
		already_member: row.already_member === true,
		project_id: typeof row.project_id === 'string' ? row.project_id : null
	};
}
