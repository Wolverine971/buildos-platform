// apps/web/src/lib/server/public-page.service.ts
import { updateDocNodeMetadata } from '$lib/services/ontology/doc-structure.service';
import {
	runPublicPageContentReview,
	type PublicPageReviewAttempt
} from '$lib/server/public-page-content-review.service';

type SupabaseLike = any;

export const PUBLIC_PAGE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export type PublicPageState = {
	id: string;
	project_id: string;
	document_id: string;
	slug: string;
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
	slug: string;
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
	const base = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return base;
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

	return {
		id: String(row.id),
		project_id: String(row.project_id),
		document_id: String(row.document_id),
		slug: String(row.slug),
		url_path: toUrlPath(String(row.slug)),
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
	document: DocumentLike,
	existingState: PublicPageState | null,
	input: Partial<ConfirmPublicPageInput> = {}
): Promise<PublicPagePreview> {
	const fallbackSlugSource =
		toStringOrNull(input.slug) ??
		existingState?.slug ??
		toStringOrNull(document.title) ??
		'document';
	const normalizedSlug = normalizePublicPageSlug(fallbackSlugSource);

	const content = getDocumentContent(document);
	const title = toStringOrNull(input.title) ?? toStringOrNull(document.title) ?? 'Untitled';
	const summary = deriveSummary(
		content,
		toStringOrNull(document.description),
		input.summary ?? null
	);

	return {
		slug: normalizedSlug,
		url_path: toUrlPath(normalizedSlug),
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
	const slug = normalizePublicPageSlug(input.slug);
	if (!isValidPublicPageSlug(slug)) {
		throw new Error('Invalid or reserved slug');
	}

	const existingState = await getDocumentPublicPageState(supabase, document.id);
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
