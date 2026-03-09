// apps/web/src/lib/server/public-page.service.ts
import { updateDocNodeMetadata } from '$lib/services/ontology/doc-structure.service';
import {
	runPublicPageContentReview,
	type PublicPageReviewAttempt
} from '$lib/server/public-page-content-review.service';

type SupabaseLike = any;

export const PUBLIC_PAGE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PUBLIC_PAGE_SLUG_PREFIX_MAX_LENGTH = 24;
export const PUBLIC_PAGE_SLUG_BASE_MAX_LENGTH = 48;

const RESERVED_PUBLIC_PAGE_SLUGS = new Set([
	'admin',
	'api',
	'auth',
	'blogs',
	'docs',
	'help',
	'integrations',
	'p',
	'pricing',
	'profile',
	'projects',
	'road-map',
	'signup'
]);

export type PublicPageSlugSuggestion = {
	slug_prefix: string | null;
	slug_base: string;
	slug: string;
	deduped: boolean;
};

export class PublicPageSlugConflictError extends Error {
	code = 'SLUG_TAKEN' as const;
	status = 409 as const;
	suggestion: PublicPageSlugSuggestion;

	constructor(suggestion: PublicPageSlugSuggestion) {
		super('That public URL is already taken');
		this.name = 'PublicPageSlugConflictError';
		this.suggestion = suggestion;
	}
}

export type PublicPageState = {
	id: string;
	project_id: string;
	document_id: string;
	slug: string;
	slug_prefix: string | null;
	slug_base: string;
	url_path: string;
	title: string;
	summary: string | null;
	status: 'draft' | 'published' | 'unpublished' | 'archived';
	public_status: 'not_public' | 'pending_confirmation' | 'live' | 'unpublished' | 'archived';
	visibility: 'public' | 'unlisted';
	noindex: boolean;
	live_sync_enabled: boolean;
	published_at: string | null;
	last_live_sync_at: string | null;
	last_live_sync_error: string | null;
	is_live_public: boolean;
};

export type PublicPagePreview = {
	slug: string;
	slug_prefix: string | null;
	slug_base: string;
	slug_was_deduped: boolean;
	url_path: string;
	title: string;
	summary: string | null;
	content: string;
	visibility: 'public' | 'unlisted';
	noindex: boolean;
	live_sync_enabled: boolean;
};

export type PublicPageLiveSyncResult = {
	isLivePublic: boolean;
	synced: boolean;
	blocked: boolean;
	page: PublicPageState | null;
	error: string | null;
	review: PublicPageReviewAttempt | null;
};

type DocumentLike = {
	id: string;
	project_id: string;
	title: string | null;
	description: string | null;
	content: string | null;
	props: Record<string, unknown> | null;
	state_key: string | null;
	updated_at?: string | null;
};

type ConfirmPublicPageInput = {
	slug?: string | null;
	slug_base?: string | null;
	title?: string | null;
	summary?: string | null;
	visibility?: 'public' | 'unlisted';
	noindex?: boolean;
	live_sync_enabled?: boolean;
};

function toUrlPath(slug: string): string {
	return `/p/${slug}`;
}

function toStringOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeSlugToken(
	input: string,
	maxLength: number,
	fallback: string | null = null
): string {
	const normalized = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/[\s-]+/g, '-')
		.replace(/^-|-$/g, '');

	const truncated = normalized.slice(0, maxLength).replace(/-+$/g, '').replace(/^-+/g, '');
	if (truncated) return truncated;
	if (fallback) return normalizeSlugToken(fallback, maxLength, null);
	return '';
}

function stripMarkdown(value: string): string {
	return value
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]+`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
		.replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
		.replace(/[#>*_~\-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function deriveSummary(
	content: string | null,
	description: string | null,
	explicit?: string | null
): string | null {
	if (explicit && explicit.trim()) return explicit.trim();
	if (description && description.trim()) return description.trim();
	if (!content || !content.trim()) return null;
	const plain = stripMarkdown(content);
	if (!plain) return null;
	return plain.length > 220 ? `${plain.slice(0, 217).trim()}...` : plain;
}

export function normalizePublicPageSlug(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/[\s-]+/g, '-')
		.replace(/^-|-$/g, '');
}

export function normalizePublicPageSlugPrefix(input: string, fallback = 'user'): string {
	return normalizeSlugToken(input, PUBLIC_PAGE_SLUG_PREFIX_MAX_LENGTH, fallback);
}

export function normalizePublicPageSlugBase(input: string, fallback = 'page'): string {
	return normalizeSlugToken(input, PUBLIC_PAGE_SLUG_BASE_MAX_LENGTH, fallback);
}

export function composePublicPageSlug(slugPrefix: string | null, slugBase: string): string {
	const normalizedBase = normalizePublicPageSlugBase(slugBase);
	const normalizedPrefix = slugPrefix ? normalizePublicPageSlugPrefix(slugPrefix) : null;
	const composed = normalizedPrefix ? `${normalizedPrefix}-${normalizedBase}` : normalizedBase;
	return normalizePublicPageSlug(composed);
}

export function splitPublicPageSlugForDisplay(
	slug: string,
	slugPrefix?: string | null
): { slug_prefix: string | null; slug_base: string } {
	const normalizedSlug = normalizePublicPageSlug(slug);
	const normalizedPrefix = slugPrefix ? normalizePublicPageSlugPrefix(slugPrefix) : null;
	if (
		normalizedPrefix &&
		normalizedSlug.startsWith(`${normalizedPrefix}-`) &&
		normalizedSlug.length > normalizedPrefix.length + 1
	) {
		return {
			slug_prefix: normalizedPrefix,
			slug_base: normalizedSlug.slice(normalizedPrefix.length + 1)
		};
	}

	return {
		slug_prefix: normalizedPrefix,
		slug_base: normalizedSlug || normalizePublicPageSlugBase('page')
	};
}

export function isValidPublicPageSlug(slug: string): boolean {
	if (!PUBLIC_PAGE_SLUG_REGEX.test(slug)) return false;
	return !RESERVED_PUBLIC_PAGE_SLUGS.has(slug);
}

function toPublicPageState(row: Record<string, any>): PublicPageState {
	const status = (row.status ?? 'draft') as PublicPageState['status'];
	const publicStatus = (row.public_status ?? 'not_public') as PublicPageState['public_status'];
	const visibility = (row.visibility ?? 'public') as PublicPageState['visibility'];
	const noindex = row.noindex === true;
	const liveSyncEnabled = row.live_sync_enabled !== false;
	const isLivePublic =
		status === 'published' &&
		publicStatus === 'live' &&
		visibility === 'public' &&
		!row.deleted_at;
	const slug = String(row.slug);
	const storedSlugPrefix = toStringOrNull(row.slug_prefix);
	const storedSlugBase = toStringOrNull(row.slug_base);
	const displayParts = splitPublicPageSlugForDisplay(slug, storedSlugPrefix);

	return {
		id: String(row.id),
		project_id: String(row.project_id),
		document_id: String(row.document_id),
		slug,
		slug_prefix: displayParts.slug_prefix,
		slug_base: storedSlugBase ?? displayParts.slug_base,
		url_path: toUrlPath(slug),
		title: String(row.title ?? ''),
		summary: toStringOrNull(row.summary),
		status,
		public_status: publicStatus,
		visibility,
		noindex,
		live_sync_enabled: liveSyncEnabled,
		published_at: toStringOrNull(row.published_at),
		last_live_sync_at: toStringOrNull(row.last_live_sync_at),
		last_live_sync_error: toStringOrNull(row.last_live_sync_error),
		is_live_public: isLivePublic
	};
}

function getDocumentContent(document: DocumentLike): string {
	if (typeof document.content === 'string') return document.content;
	const markdown = document.props?.body_markdown;
	return typeof markdown === 'string' ? markdown : '';
}

function buildPublishedSnapshot(
	document: DocumentLike,
	existingProps: Record<string, unknown> | null,
	input: ConfirmPublicPageInput
) {
	const content = getDocumentContent(document);
	const title = toStringOrNull(input.title) ?? toStringOrNull(document.title) ?? 'Untitled';
	const summary = deriveSummary(
		content,
		toStringOrNull(document.description),
		input.summary ?? null
	);
	const publishedProps = {
		...(existingProps ?? {}),
		document_state: document.state_key ?? 'draft'
	};

	return {
		title,
		summary,
		content,
		description: toStringOrNull(document.description),
		publishedProps
	};
}

async function syncDocTreePublicMetadata(
	supabase: SupabaseLike,
	projectId: string,
	documentId: string,
	state: PublicPageState | null,
	actorId: string
) {
	const isPublic = Boolean(state?.is_live_public);
	const publicStatus = state?.public_status ?? 'not_public';
	const publicSlug = state?.slug ?? null;

	await updateDocNodeMetadata(
		supabase,
		projectId,
		documentId,
		{
			is_public: isPublic,
			public_slug: publicSlug,
			public_status: publicStatus
		},
		actorId
	);
}

async function resolvePublicPageSlugPrefix(
	supabase: SupabaseLike,
	actorId: string,
	existingState: PublicPageState | null
): Promise<string> {
	if (existingState?.slug_prefix) {
		return normalizePublicPageSlugPrefix(existingState.slug_prefix);
	}

	const { data, error } = await (supabase as any).rpc('resolve_onto_public_page_slug_prefix', {
		p_actor_id: actorId
	});
	if (error) {
		throw error;
	}

	return normalizePublicPageSlugPrefix(typeof data === 'string' ? data : 'user');
}

function resolveRequestedSlugBase(
	input: Partial<ConfirmPublicPageInput>,
	existingState: PublicPageState | null,
	slugPrefix: string,
	document: DocumentLike
): string {
	const explicitBase = toStringOrNull(input.slug_base);
	if (explicitBase) {
		return normalizePublicPageSlugBase(explicitBase);
	}

	const explicitLegacySlug = toStringOrNull(input.slug);
	if (explicitLegacySlug) {
		const parts = splitPublicPageSlugForDisplay(explicitLegacySlug, slugPrefix);
		return normalizePublicPageSlugBase(parts.slug_base);
	}

	if (existingState?.slug_base) {
		return normalizePublicPageSlugBase(existingState.slug_base);
	}

	return normalizePublicPageSlugBase(toStringOrNull(document.title) ?? 'page');
}

export async function suggestAvailablePublicPageSlug(
	supabase: SupabaseLike,
	options: {
		slugPrefix: string | null;
		slugBase: string;
		excludePublicPageId?: string | null;
	}
): Promise<PublicPageSlugSuggestion> {
	const { data, error } = await (supabase as any).rpc('suggest_onto_public_page_slug', {
		p_slug_prefix: options.slugPrefix,
		p_slug_base: options.slugBase,
		p_exclude_page_id: options.excludePublicPageId ?? null
	});
	if (error) {
		throw error;
	}

	const row = Array.isArray(data) ? data[0] : data;
	const slugPrefix =
		typeof row?.slug_prefix === 'string' && row.slug_prefix.trim()
			? normalizePublicPageSlugPrefix(row.slug_prefix)
			: null;
	const slugBase = normalizePublicPageSlugBase(
		typeof row?.slug_base === 'string' ? row.slug_base : options.slugBase
	);
	const slug =
		typeof row?.slug === 'string' && row.slug.trim()
			? normalizePublicPageSlug(row.slug)
			: composePublicPageSlug(slugPrefix, slugBase);

	return {
		slug_prefix: slugPrefix,
		slug_base: slugBase,
		slug,
		deduped: row?.deduped === true
	};
}

function isUniqueViolationError(error: unknown): error is { code: string } {
	return Boolean(error && typeof error === 'object' && (error as any).code === '23505');
}

async function assertPublicPageSlugAvailable(
	supabase: SupabaseLike,
	options: {
		slugPrefix: string | null;
		slugBase: string;
		excludePublicPageId?: string | null;
	}
) {
	const submittedSlug = composePublicPageSlug(options.slugPrefix, options.slugBase);
	if (!isValidPublicPageSlug(submittedSlug)) {
		throw new Error('Invalid or reserved slug');
	}

	const suggestion = await suggestAvailablePublicPageSlug(supabase, options);
	if (suggestion.slug !== submittedSlug) {
		throw new PublicPageSlugConflictError(suggestion);
	}
}

export async function getDocumentPublicPageState(
	supabase: SupabaseLike,
	documentId: string
): Promise<PublicPageState | null> {
	const { data, error } = await (supabase as any)
		.from('onto_public_pages')
		.select('*')
		.eq('document_id', documentId)
		.is('deleted_at', null)
		.maybeSingle();

	if (error || !data) return null;
	return toPublicPageState(data as Record<string, any>);
}

export async function prepareDocumentPublicPagePreview(
	supabase: SupabaseLike,
	document: DocumentLike,
	existingState: PublicPageState | null,
	actorId: string,
	input: Partial<ConfirmPublicPageInput> = {}
): Promise<PublicPagePreview> {
	const slugPrefix = await resolvePublicPageSlugPrefix(supabase, actorId, existingState);
	const requestedSlugBase = resolveRequestedSlugBase(input, existingState, slugPrefix, document);
	const suggestedSlug = await suggestAvailablePublicPageSlug(supabase, {
		slugPrefix,
		slugBase: requestedSlugBase,
		excludePublicPageId: existingState?.id ?? null
	});

	const content = getDocumentContent(document);
	const title = toStringOrNull(input.title) ?? toStringOrNull(document.title) ?? 'Untitled';
	const summary = deriveSummary(
		content,
		toStringOrNull(document.description),
		input.summary ?? null
	);

	return {
		slug: suggestedSlug.slug,
		slug_prefix: suggestedSlug.slug_prefix,
		slug_base: suggestedSlug.slug_base,
		slug_was_deduped: suggestedSlug.deduped,
		url_path: toUrlPath(suggestedSlug.slug),
		title,
		summary,
		content,
		visibility: input.visibility ?? existingState?.visibility ?? 'public',
		noindex: input.noindex ?? existingState?.noindex ?? false,
		live_sync_enabled: input.live_sync_enabled ?? existingState?.live_sync_enabled ?? true
	};
}

export async function confirmDocumentPublicPage(
	supabase: SupabaseLike,
	document: DocumentLike,
	actorId: string,
	input: ConfirmPublicPageInput
): Promise<PublicPageState> {
	const existingState = await getDocumentPublicPageState(supabase, document.id);
	const slugPrefix = await resolvePublicPageSlugPrefix(supabase, actorId, existingState);
	const slugBase = resolveRequestedSlugBase(input, existingState, slugPrefix, document);
	await assertPublicPageSlugAvailable(supabase, {
		slugPrefix,
		slugBase,
		excludePublicPageId: existingState?.id ?? null
	});

	const slug = composePublicPageSlug(slugPrefix, slugBase);
	const snapshot = buildPublishedSnapshot(
		document,
		(document.props as Record<string, unknown> | null) ?? null,
		input
	);
	const nowIso = new Date().toISOString();
	const visibility = input.visibility ?? existingState?.visibility ?? 'public';
	const liveSyncEnabled = input.live_sync_enabled ?? existingState?.live_sync_enabled ?? true;
	const noindex = input.noindex ?? existingState?.noindex ?? false;

	const baseUpdate = {
		slug,
		slug_prefix: slugPrefix,
		slug_base: slugBase,
		title: snapshot.title,
		summary: snapshot.summary,
		status: 'published',
		public_status: 'live',
		visibility,
		noindex,
		published_content: snapshot.content,
		published_description: snapshot.description,
		published_props: snapshot.publishedProps,
		live_sync_enabled: liveSyncEnabled,
		last_live_sync_at: nowIso,
		last_live_sync_error: null,
		published_at: nowIso,
		published_by: actorId,
		updated_by: actorId
	};

	let row: Record<string, any> | null = null;
	if (existingState) {
		const { data, error } = await (supabase as any)
			.from('onto_public_pages')
			.update(baseUpdate)
			.eq('id', existingState.id)
			.select('*')
			.single();
		if (error || !data) {
			if (isUniqueViolationError(error)) {
				const suggestion = await suggestAvailablePublicPageSlug(supabase, {
					slugPrefix,
					slugBase,
					excludePublicPageId: existingState.id
				});
				throw new PublicPageSlugConflictError(suggestion);
			}
			throw error ?? new Error('Failed to update public page');
		}
		row = data as Record<string, any>;
	} else {
		const { data, error } = await (supabase as any)
			.from('onto_public_pages')
			.insert({
				project_id: document.project_id,
				document_id: document.id,
				created_by: actorId,
				...baseUpdate
			})
			.select('*')
			.single();
		if (error || !data) {
			if (isUniqueViolationError(error)) {
				const suggestion = await suggestAvailablePublicPageSlug(supabase, {
					slugPrefix,
					slugBase
				});
				throw new PublicPageSlugConflictError(suggestion);
			}
			throw error ?? new Error('Failed to create public page');
		}
		row = data as Record<string, any>;
	}

	const state = toPublicPageState(row);
	await syncDocTreePublicMetadata(supabase, document.project_id, document.id, state, actorId);
	return state;
}

export async function setDocumentPublicPageLiveSync(
	supabase: SupabaseLike,
	document: DocumentLike,
	actorId: string,
	liveSyncEnabled: boolean
): Promise<PublicPageState | null> {
	const existing = await getDocumentPublicPageState(supabase, document.id);
	if (!existing) return null;

	const { data, error } = await (supabase as any)
		.from('onto_public_pages')
		.update({
			live_sync_enabled: liveSyncEnabled,
			updated_by: actorId,
			last_live_sync_error: liveSyncEnabled ? null : existing.last_live_sync_error
		})
		.eq('id', existing.id)
		.select('*')
		.single();

	if (error || !data) {
		throw error ?? new Error('Failed to update live sync setting');
	}

	return toPublicPageState(data as Record<string, any>);
}

export async function syncLivePublicPageForDocument(
	supabase: SupabaseLike,
	document: DocumentLike,
	actorId: string,
	actorUserId?: string | null
): Promise<PublicPageLiveSyncResult> {
	const existing = await getDocumentPublicPageState(supabase, document.id);
	if (!existing || !existing.is_live_public || !existing.live_sync_enabled) {
		return {
			isLivePublic: Boolean(existing?.is_live_public),
			synced: false,
			blocked: false,
			page: existing,
			error: null,
			review: null
		};
	}

	let review: PublicPageReviewAttempt | null = null;
	try {
		review = await runPublicPageContentReview({
			supabase,
			document,
			actorId,
			actorUserId,
			source: 'live_sync',
			publicPageId: existing.id
		});
	} catch (reviewError) {
		const message = 'Failed to run public page content review';
		await (supabase as any)
			.from('onto_public_pages')
			.update({
				last_live_sync_error: message,
				updated_by: actorId
			})
			.eq('id', existing.id);
		return {
			isLivePublic: true,
			synced: false,
			blocked: false,
			page: {
				...existing,
				last_live_sync_error: message
			},
			error:
				reviewError instanceof Error && reviewError.message
					? `${message}: ${reviewError.message}`
					: message,
			review: null
		};
	}
	if (review.status === 'flagged') {
		const message =
			review.reasons[0] ?? 'Public page live update blocked by content policy review';
		const { data: blockedRow } = await (supabase as any)
			.from('onto_public_pages')
			.update({
				last_live_sync_error: message,
				updated_by: actorId
			})
			.eq('id', existing.id)
			.select('*')
			.maybeSingle();
		const blockedState = blockedRow
			? toPublicPageState(blockedRow as Record<string, any>)
			: ({
					...existing,
					last_live_sync_error: message
				} as PublicPageState);
		return {
			isLivePublic: true,
			synced: false,
			blocked: true,
			page: blockedState,
			error: message,
			review
		};
	}

	const snapshot = buildPublishedSnapshot(
		document,
		(document.props as Record<string, unknown> | null) ?? null,
		{
			slug: existing.slug,
			slug_base: existing.slug_base,
			title: existing.title,
			summary: existing.summary,
			visibility: existing.visibility,
			noindex: existing.noindex,
			live_sync_enabled: existing.live_sync_enabled
		}
	);

	const nowIso = new Date().toISOString();
	const { data, error } = await (supabase as any)
		.from('onto_public_pages')
		.update({
			title: snapshot.title,
			summary: snapshot.summary,
			published_content: snapshot.content,
			published_description: snapshot.description,
			published_props: snapshot.publishedProps,
			last_live_sync_at: nowIso,
			last_live_sync_error: null,
			updated_by: actorId
		})
		.eq('id', existing.id)
		.select('*')
		.single();

	if (error || !data) {
		const message = error?.message ?? 'Failed to sync live public page';
		await (supabase as any)
			.from('onto_public_pages')
			.update({
				last_live_sync_error: message,
				updated_by: actorId
			})
			.eq('id', existing.id);
		return {
			isLivePublic: true,
			synced: false,
			blocked: false,
			page: existing,
			error: message,
			review
		};
	}

	const syncedState = toPublicPageState(data as Record<string, any>);
	await syncDocTreePublicMetadata(
		supabase,
		document.project_id,
		document.id,
		syncedState,
		actorId
	);

	return {
		isLivePublic: true,
		synced: true,
		blocked: false,
		page: syncedState,
		error: null,
		review
	};
}

export async function getPublicPageBySlug(
	supabase: SupabaseLike,
	slug: string
): Promise<Record<string, any> | null> {
	const { data, error } = await (supabase as any)
		.from('onto_public_pages')
		.select('*')
		.eq('slug', slug)
		.eq('status', 'published')
		.eq('public_status', 'live')
		.eq('visibility', 'public')
		.is('deleted_at', null)
		.maybeSingle();

	if (error || !data) return null;
	return data as Record<string, any>;
}

export async function getPublicPageRedirectSlug(
	supabase: SupabaseLike,
	oldSlug: string
): Promise<string | null> {
	const { data, error } = await (supabase as any)
		.from('onto_public_page_slug_history')
		.select('new_slug, changed_at')
		.eq('old_slug', oldSlug)
		.order('changed_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error || !data?.new_slug) return null;

	const target = await getPublicPageBySlug(supabase, String(data.new_slug));
	return target?.slug ? String(target.slug) : null;
}
