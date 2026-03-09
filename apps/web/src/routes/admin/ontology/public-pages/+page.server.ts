// apps/web/src/routes/admin/ontology/public-pages/+page.server.ts
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { setPublicPageReviewAdminDecision } from '$lib/server/public-page-content-review.service';

type PublicPageRow = {
	id: string;
	project_id: string;
	document_id: string;
	slug: string;
	slug_prefix: string | null;
	slug_base: string | null;
	title: string;
	status: string;
	public_status: string;
	visibility: string;
	live_sync_enabled: boolean;
	published_at: string | null;
	last_live_sync_at: string | null;
	last_live_sync_error: string | null;
	updated_at: string;
	created_at: string;
};

type ReviewRow = {
	id: string;
	project_id: string;
	document_id: string;
	public_page_id: string | null;
	source: string;
	status: string;
	summary: string | null;
	reasons: unknown;
	text_findings: unknown;
	image_findings: unknown;
	policy_version: string;
	created_by: string;
	created_at: string;
	admin_decision: string | null;
	admin_decision_reason: string | null;
	admin_decision_by: string | null;
	admin_decision_at: string | null;
};

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
		.filter((entry) => entry.length > 0);
}

function toFindingCount(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

function toStringOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const { data: dbUser, error: dbUserError } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (dbUserError) {
		console.error('[Admin][Public Pages] Failed to verify admin user:', dbUserError);
		throw error(500, 'Unable to verify admin access');
	}
	if (!dbUser?.is_admin) {
		throw redirect(303, '/');
	}

	const adminClient = createAdminSupabaseClient();
	const [pagesRes, reviewsRes] = await Promise.all([
		(adminClient as any)
			.from('onto_public_pages')
			.select(
				'id, project_id, document_id, slug, slug_prefix, slug_base, title, status, public_status, visibility, live_sync_enabled, published_at, last_live_sync_at, last_live_sync_error, updated_at, created_at'
			)
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(300),
		(adminClient as any)
			.from('onto_public_page_review_attempts')
			.select(
				'id, project_id, document_id, public_page_id, source, status, summary, reasons, text_findings, image_findings, policy_version, created_by, created_at, admin_decision, admin_decision_reason, admin_decision_by, admin_decision_at'
			)
			.order('created_at', { ascending: false })
			.limit(600)
	]);

	if (pagesRes.error) {
		console.error('[Admin][Public Pages] Failed to load public pages:', pagesRes.error);
		throw error(500, 'Failed to load public pages');
	}
	if (reviewsRes.error) {
		console.error('[Admin][Public Pages] Failed to load review attempts:', reviewsRes.error);
		throw error(500, 'Failed to load content review attempts');
	}

	const pages = (pagesRes.data ?? []) as PublicPageRow[];
	const reviews = (reviewsRes.data ?? []) as ReviewRow[];

	const projectIds = new Set<string>();
	const documentIds = new Set<string>();
	const actorIds = new Set<string>();
	for (const page of pages) {
		projectIds.add(page.project_id);
		documentIds.add(page.document_id);
	}
	for (const review of reviews) {
		projectIds.add(review.project_id);
		documentIds.add(review.document_id);
		actorIds.add(review.created_by);
		if (review.admin_decision_by) {
			actorIds.add(review.admin_decision_by);
		}
	}

	const [projectsRes, documentsRes, actorsRes] = await Promise.all([
		projectIds.size > 0
			? (adminClient as any)
					.from('onto_projects')
					.select('id, name')
					.in('id', [...projectIds])
			: Promise.resolve({ data: [], error: null }),
		documentIds.size > 0
			? (adminClient as any)
					.from('onto_documents')
					.select('id, title')
					.in('id', [...documentIds])
			: Promise.resolve({ data: [], error: null }),
		actorIds.size > 0
			? (adminClient as any)
					.from('onto_actors')
					.select('id, name')
					.in('id', [...actorIds])
			: Promise.resolve({ data: [], error: null })
	]);

	if (projectsRes.error) {
		console.error('[Admin][Public Pages] Failed to resolve project names:', projectsRes.error);
	}
	if (documentsRes.error) {
		console.error(
			'[Admin][Public Pages] Failed to resolve document titles:',
			documentsRes.error
		);
	}
	if (actorsRes.error) {
		console.error('[Admin][Public Pages] Failed to resolve actor names:', actorsRes.error);
	}

	const projectNameById = new Map(
		((projectsRes.data ?? []) as Array<{ id: string; name: string | null }>).map((project) => [
			project.id,
			project.name ?? 'Untitled Project'
		])
	);
	const documentTitleById = new Map(
		((documentsRes.data ?? []) as Array<{ id: string; title: string | null }>).map(
			(document) => [document.id, document.title ?? 'Untitled Document']
		)
	);
	const actorNameById = new Map(
		((actorsRes.data ?? []) as Array<{ id: string; name: string | null }>).map((actor) => [
			actor.id,
			actor.name ?? 'Unknown'
		])
	);
	const pageById = new Map(pages.map((page) => [page.id, page]));

	const hydratedPages = pages.map((page) => ({
		...page,
		url_path:
			page.slug_prefix && page.slug_base
				? `/p/${page.slug_prefix}/${page.slug_base}`
				: `/p/${page.slug}`,
		project_name: projectNameById.get(page.project_id) ?? 'Unknown Project',
		document_title: documentTitleById.get(page.document_id) ?? page.title
	}));

	const hydratedReviews = reviews.map((review) => ({
		id: review.id,
		project_id: review.project_id,
		project_name: projectNameById.get(review.project_id) ?? 'Unknown Project',
		document_id: review.document_id,
		document_title: documentTitleById.get(review.document_id) ?? 'Untitled Document',
		public_page_id: review.public_page_id,
		page_slug:
			review.public_page_id && pageById.has(review.public_page_id)
				? (pageById.get(review.public_page_id)?.slug ?? null)
				: null,
		page_url_path:
			review.public_page_id && pageById.has(review.public_page_id)
				? ((pageById.get(review.public_page_id)?.slug_prefix &&
					pageById.get(review.public_page_id)?.slug_base
						? `/p/${pageById.get(review.public_page_id)?.slug_prefix}/${pageById.get(review.public_page_id)?.slug_base}`
						: `/p/${pageById.get(review.public_page_id)?.slug}`) ?? null)
				: null,
		source: review.source,
		status: review.status,
		summary: review.summary,
		reasons: toStringArray(review.reasons),
		text_findings_count: toFindingCount(review.text_findings),
		image_findings_count: toFindingCount(review.image_findings),
		policy_version: review.policy_version,
		created_by: review.created_by,
		created_by_name: actorNameById.get(review.created_by) ?? 'Unknown',
		created_at: review.created_at,
		admin_decision:
			review.admin_decision === 'approved' || review.admin_decision === 'rejected'
				? review.admin_decision
				: null,
		admin_decision_reason: toStringOrNull(review.admin_decision_reason),
		admin_decision_by: review.admin_decision_by,
		admin_decision_by_name: review.admin_decision_by
			? (actorNameById.get(review.admin_decision_by) ?? 'Unknown')
			: null,
		admin_decision_at: toStringOrNull(review.admin_decision_at)
	}));

	const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const stats = {
		total_pages: hydratedPages.length,
		live_pages: hydratedPages.filter(
			(page) => page.status === 'published' && page.public_status === 'live'
		).length,
		total_reviews: hydratedReviews.length,
		flagged_reviews_7d: hydratedReviews.filter(
			(review) =>
				review.status === 'flagged' && new Date(review.created_at).getTime() >= oneWeekAgo
		).length
	};

	return {
		pages: hydratedPages,
		reviews: hydratedReviews,
		stats
	};
};

export const actions: Actions = {
	decide: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const { data: dbUser, error: dbUserError } = await supabase
			.from('users')
			.select('is_admin')
			.eq('id', user.id)
			.single();
		if (dbUserError || !dbUser?.is_admin) {
			return fail(403, { error: 'Admin access required' });
		}

		const formData = await request.formData();
		const reviewId = toStringOrNull(formData.get('review_id'));
		const decisionRaw = toStringOrNull(formData.get('decision'));
		const decision =
			decisionRaw === 'approved' || decisionRaw === 'rejected' ? decisionRaw : null;
		const decisionNote = toStringOrNull(formData.get('decision_note'));

		if (!reviewId || !decision) {
			return fail(400, { error: 'Missing review decision parameters' });
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});
		if (actorError || !actorId) {
			console.error('[Admin][Public Pages] Failed to resolve admin actor:', actorError);
			return fail(500, { error: 'Failed to resolve admin actor' });
		}

		try {
			const adminClient = createAdminSupabaseClient();
			await setPublicPageReviewAdminDecision({
				supabase: adminClient,
				reviewId,
				actorId: String(actorId),
				decision,
				reason: decisionNote
			});
			return {
				success: true,
				reviewId,
				decision
			};
		} catch (err) {
			console.error('[Admin][Public Pages] Failed to persist review decision:', err);
			return fail(500, { error: 'Failed to save review decision' });
		}
	}
};
