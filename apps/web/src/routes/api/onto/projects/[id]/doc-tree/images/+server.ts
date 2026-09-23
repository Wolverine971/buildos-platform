// apps/web/src/routes/api/onto/projects/[id]/doc-tree/images/+server.ts
/**
 * GET /api/onto/projects/[id]/doc-tree/images
 *
 * Project images for the document tree, in one round trip: the image rows the
 * tree renders plus every image→document link. Placement lives in
 * onto_asset_links, never in doc_structure — doc_structure ids must stay
 * onto_documents ids (atomic tree SQL, archive, and every tree reader assume it).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { logOntologyApiError } from '../../../../shared/error-logging';
import type { DocTreeImage, DocTreeImageLink } from '$lib/components/ontology/doc-tree/tree-images';

const MAX_TREE_IMAGES = 200;

const TREE_IMAGE_SELECT =
	'id, caption, alt_text, original_filename, width, height, ocr_status, extraction_summary, created_at';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const access = await requireProjectMemberAccess({
			locals,
			projectId: params.id,
			requiredAccess: 'read'
		});
		if (!access.ok) return access.response;

		const projectId = access.projectId;
		const supabase = locals.supabase as any;

		const [imagesResult, linksResult] = await Promise.all([
			supabase
				.from('onto_assets')
				.select(TREE_IMAGE_SELECT)
				.eq('project_id', projectId)
				.eq('kind', 'image')
				.is('deleted_at', null)
				.order('created_at', { ascending: false })
				.limit(MAX_TREE_IMAGES),
			supabase
				.from('onto_asset_links')
				.select('asset_id, entity_id')
				.eq('project_id', projectId)
				.eq('entity_kind', 'document')
		]);

		if (imagesResult.error) return ApiResponse.databaseError(imagesResult.error);
		if (linksResult.error) return ApiResponse.databaseError(linksResult.error);

		const images = (imagesResult.data ?? []) as DocTreeImage[];
		const imageIds = new Set(images.map((image) => image.id));

		// One row per image/document pair: several link roles can join the same pair.
		const seen = new Set<string>();
		const links: DocTreeImageLink[] = [];
		for (const row of (linksResult.data ?? []) as Array<{
			asset_id: string;
			entity_id: string;
		}>) {
			if (!imageIds.has(row.asset_id)) continue;
			const key = `${row.asset_id}:${row.entity_id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			links.push({ asset_id: row.asset_id, document_id: row.entity_id });
		}

		return ApiResponse.success({ images, links });
	} catch (error) {
		console.error('[Doc Tree Images API] Unexpected GET error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/projects/${params.id ?? ''}/doc-tree/images`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'doc_tree_images_get'
		});
		return ApiResponse.internalError(error, 'Failed to load project images');
	}
};
