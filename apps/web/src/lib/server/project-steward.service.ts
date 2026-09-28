// apps/web/src/lib/server/project-steward.service.ts
//
// Project stewards beta (docs/product/project-agents-plan-2026-09-25.md).
// The user's side of a steward: read its status, approve the charter, switch
// it on or off. The approved charter and the on/off switch live in the user's
// `user_project_behavioral_profiles` row, which RLS lets the user read but not
// write; only this service writes it, with the admin client, after the route
// has authenticated the session and checked project access. No chat,
// connector, or worker tool reaches it, which is what lets the chat prompt
// treat the approved charter as instructions.
//
// No project log row (audits and briefs would score it as a project change):
// the profile table's own invalidation trigger applies it from the next message.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import {
	STEWARD_CHARTER_DOCUMENT_TYPE_KEY,
	STEWARD_CHARTER_MAX_CHARS,
	STEWARD_PROFILE_DIMENSION_KEY,
	hashStewardCharterText,
	normalizeStewardCharterText,
	readStewardProfileState
} from '@buildos/agentic-chat-runtime/context';

type Client = SupabaseClient<Database>;

export type ProjectStewardStatus = {
	/** An approved charter exists, so the steward can be switched on. */
	available: boolean;
	/** Project chat speaks as the steward. */
	active: boolean;
	approvedAt: string | null;
	charterDocumentId: string | null;
	charterDocumentTitle: string | null;
	/** The charter document's text differs from the approved copy. */
	pendingEdits: boolean;
	/** Hash of the charter document's normalized text; approving must echo it. */
	charterSha256: string | null;
	/**
	 * The charter document's normalized text, only while there is something to
	 * approve (edits pending, or no approval yet), so the user reviews exactly
	 * what they approve.
	 */
	charterText: string | null;
	/** The approved copy, only alongside pending edits, for a diff. */
	approvedText: string | null;
	/** The charter document is over the length limit and cannot be approved. */
	charterTooLong: boolean;
	charterMaxChars: number;
};

export class ProjectStewardError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 404 | 409
	) {
		super(message);
	}
}

type ProfileRow = {
	id: string;
	agent_instructions: string;
	dimensions: Json;
};

type CharterDocument = {
	id: string;
	title: string | null;
	content: string | null;
	updated_at: string | null;
};

async function readProfile(
	supabase: Client,
	userId: string,
	projectId: string
): Promise<ProfileRow | null> {
	const { data, error } = await supabase
		.from('user_project_behavioral_profiles')
		.select('id, agent_instructions, dimensions')
		.eq('user_id', userId)
		.eq('project_id', projectId)
		.maybeSingle();
	if (error) throw error;
	return (data as ProfileRow | null) ?? null;
}

/**
 * The charter document. Once a charter has been approved, only the approved
 * document counts: a newer charter-typed document (which the chat agent or a
 * connector could create) never becomes approvable by recency. Before any
 * approval it is the project's most recently edited charter-typed document.
 * Read with the user's client, so RLS decides what they can see.
 */
async function findCharterDocument(
	supabase: Client,
	projectId: string,
	approvedDocumentId: string | null
): Promise<CharterDocument | null> {
	const base = () =>
		supabase
			.from('onto_documents')
			.select('id, title, content, updated_at')
			.eq('project_id', projectId)
			.eq('type_key', STEWARD_CHARTER_DOCUMENT_TYPE_KEY)
			.is('deleted_at', null)
			.is('archived_at', null);
	if (approvedDocumentId) {
		const { data, error } = await base().eq('id', approvedDocumentId).maybeSingle();
		if (error) throw error;
		return (data as CharterDocument | null) ?? null;
	}
	const { data, error } = await base().order('updated_at', { ascending: false }).limit(1);
	if (error) throw error;
	return ((data ?? [])[0] as CharterDocument | undefined) ?? null;
}

export async function loadProjectStewardStatus(params: {
	supabase: Client;
	userId: string;
	projectId: string;
}): Promise<ProjectStewardStatus> {
	const profile = await readProfile(params.supabase, params.userId, params.projectId);
	const state = profile ? readStewardProfileState(profile.dimensions) : null;
	const approvedText = normalizeStewardCharterText(profile?.agent_instructions ?? '');
	const available = Boolean(state && approvedText);
	const document = await findCharterDocument(
		params.supabase,
		params.projectId,
		state?.charter_document_id ?? null
	);
	const documentText = document ? normalizeStewardCharterText(document.content ?? '') : '';
	const documentSha = document ? await hashStewardCharterText(documentText) : null;
	const pendingEdits = Boolean(documentText && documentSha !== state?.approved_sha256);
	return {
		available,
		active: available && state?.active !== false,
		approvedAt: state?.approved_at ?? null,
		charterDocumentId: document?.id ?? null,
		charterDocumentTitle: document?.title ?? null,
		pendingEdits,
		charterSha256: documentSha,
		charterText: documentText && (pendingEdits || !available) ? documentText : null,
		approvedText: pendingEdits && available ? approvedText : null,
		charterTooLong: documentText.length > STEWARD_CHARTER_MAX_CHARS,
		charterMaxChars: STEWARD_CHARTER_MAX_CHARS
	};
}

async function writeStewardDimensions(params: {
	admin: Client;
	userId: string;
	projectId: string;
	existing: ProfileRow | null;
	steward: Record<string, unknown>;
	agentInstructions?: string;
}): Promise<void> {
	const dimensions =
		params.existing?.dimensions &&
		typeof params.existing.dimensions === 'object' &&
		!Array.isArray(params.existing.dimensions)
			? (params.existing.dimensions as Record<string, Json>)
			: {};
	const row = {
		user_id: params.userId,
		project_id: params.projectId,
		dimensions: { ...dimensions, [STEWARD_PROFILE_DIMENSION_KEY]: params.steward as Json },
		...(params.agentInstructions !== undefined
			? { agent_instructions: params.agentInstructions }
			: {}),
		updated_at: new Date().toISOString()
	};
	const { error } = await params.admin
		.from('user_project_behavioral_profiles')
		.upsert(row, { onConflict: 'user_id,project_id' });
	if (error) throw error;
}

/**
 * Approve the charter document's current text as the steward's standing
 * orders. `expectedSha256` is the hash of the text the user reviewed; if the
 * document changed since, nothing is approved.
 */
export async function approveProjectStewardCharter(params: {
	supabase: Client;
	admin: Client;
	userId: string;
	projectId: string;
	expectedSha256: string;
	nowIso?: string;
}): Promise<ProjectStewardStatus> {
	const profile = await readProfile(params.supabase, params.userId, params.projectId);
	const state = profile ? readStewardProfileState(profile.dimensions) : null;
	const document = await findCharterDocument(
		params.supabase,
		params.projectId,
		state?.charter_document_id ?? null
	);
	if (!document) {
		throw new ProjectStewardError(
			'This project has no steward charter document to approve.',
			404
		);
	}
	const text = normalizeStewardCharterText(document.content ?? '');
	const sha = await hashStewardCharterText(text);
	if (sha !== params.expectedSha256) {
		throw new ProjectStewardError(
			'The charter changed after you opened it. Review the new text, then approve.',
			409
		);
	}
	if (!text) throw new ProjectStewardError('The steward charter is empty.', 400);
	if (text.length > STEWARD_CHARTER_MAX_CHARS) {
		throw new ProjectStewardError(
			`The steward charter is ${text.length} characters; keep it under ${STEWARD_CHARTER_MAX_CHARS}.`,
			400
		);
	}
	const approvedAt = params.nowIso ?? new Date().toISOString();
	await writeStewardDimensions({
		admin: params.admin,
		userId: params.userId,
		projectId: params.projectId,
		existing: profile,
		agentInstructions: text,
		steward: {
			// A first approval switches the steward on; re-approving keeps the
			// user's switch where it was.
			active: state ? state.active : true,
			charter_document_id: document.id,
			approved_sha256: sha,
			approved_at: approvedAt
		}
	});
	return loadProjectStewardStatus(params);
}

/** Switch the steward on or off for this user's project chat. */
export async function setProjectStewardActive(params: {
	supabase: Client;
	admin: Client;
	userId: string;
	projectId: string;
	active: boolean;
}): Promise<ProjectStewardStatus> {
	const profile = await readProfile(params.supabase, params.userId, params.projectId);
	const state = profile ? readStewardProfileState(profile.dimensions) : null;
	if (!state || !normalizeStewardCharterText(profile?.agent_instructions ?? '')) {
		throw new ProjectStewardError(
			'Approve the steward charter before switching the steward on.',
			409
		);
	}
	if (state.active !== params.active) {
		await writeStewardDimensions({
			admin: params.admin,
			userId: params.userId,
			projectId: params.projectId,
			existing: profile,
			steward: {
				active: params.active,
				charter_document_id: state.charter_document_id,
				approved_sha256: state.approved_sha256,
				approved_at: state.approved_at
			}
		});
	}
	return loadProjectStewardStatus(params);
}
