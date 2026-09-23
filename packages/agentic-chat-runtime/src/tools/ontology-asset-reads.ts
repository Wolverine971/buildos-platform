// packages/agentic-chat-runtime/src/tools/ontology-asset-reads.ts
//
// Project image reads for Agentic Chat (2026-09-22). Images attached in a
// project chat are stored as `onto_assets`; the project document tree shows an
// image under the document it has an `attachment` link to, and on the
// project's Images shelf when it has none. These reads let the model find an
// image it did not receive in the current message ("put the logo in the
// website doc") and see where it is filed. Metadata and bounded OCR text only:
// never storage paths, signed URLs, or pixels.

import { isValidUUID } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_NO_READABLE_PROJECTS_SENTINEL,
	readableProjectIdsFromSummaries
} from './access-port';
import { applyKeywordSearch, type AgenticChatSharedReadContextV1 } from './ontology-reads';

const ASSET_SUMMARY_MAX_CHARS = 300;
const ASSET_TEXT_PREVIEW_MAX_CHARS = 1500;
const ASSET_OCR_STATUSES = new Set(['pending', 'processing', 'complete', 'failed', 'skipped']);
const ASSET_LIST_SELECT =
	'id, project_id, original_filename, caption, alt_text, ocr_status, extraction_summary, updated_at';
const ASSET_DETAIL_SELECT = `${ASSET_LIST_SELECT}, content_type, width, height, extracted_text, created_at`;

export interface SharedSearchOntoAssetsArgs {
	query?: string;
	project_id?: string;
	ocr_status?: string;
	include_text_preview?: boolean;
	limit?: number;
	offset?: number;
}

export interface SharedGetOntoAssetArgs {
	asset_id: string;
	include_text_preview?: boolean;
}

/** Where the document tree shows the image; null means the Images shelf. */
export type AgenticChatAssetPlacementV1 = {
	document_id: string;
	document_title: string | null;
} | null;

export class AgenticChatAssetReadQueryError extends Error {
	readonly name = 'AgenticChatAssetReadQueryError';
	constructor(
		readonly stage: 'assets' | 'links' | 'documents',
		readonly cause: unknown
	) {
		super(
			typeof (cause as { message?: unknown } | null)?.message === 'string'
				? String((cause as { message: string }).message)
				: `Failed to load image ${stage}`
		);
	}
}

function boundedText(value: unknown, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length <= maxChars
		? normalized
		: `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * The first document attachment link per image (the tree shows one placement),
 * resolved to live, unarchived documents of the image's own project.
 */
async function loadAssetPlacements(
	context: AgenticChatSharedReadContextV1,
	assets: ReadonlyArray<{ id: string; project_id: string }>
): Promise<Map<string, AgenticChatAssetPlacementV1>> {
	const placements = new Map<string, AgenticChatAssetPlacementV1>();
	if (assets.length === 0) return placements;
	const db = context.client as any;
	const { data: links, error: linkError } = await db
		.from('onto_asset_links')
		.select('asset_id, entity_id, project_id, created_at')
		.in(
			'asset_id',
			assets.map((asset) => asset.id)
		)
		.eq('entity_kind', 'document')
		.eq('role', 'attachment')
		.order('created_at', { ascending: true });
	if (linkError) throw new AgenticChatAssetReadQueryError('links', linkError);
	const projectByAsset = new Map(assets.map((asset) => [asset.id, asset.project_id]));
	const firstLink = new Map<string, string>();
	for (const link of Array.isArray(links) ? links : []) {
		if (typeof link?.asset_id !== 'string' || typeof link?.entity_id !== 'string') continue;
		if (link.project_id !== projectByAsset.get(link.asset_id)) continue;
		if (!firstLink.has(link.asset_id)) firstLink.set(link.asset_id, link.entity_id);
	}
	const documentIds = [...new Set(firstLink.values())];
	const titles = new Map<string, { title: string | null; project_id: string }>();
	if (documentIds.length > 0) {
		const { data: documents, error: documentError } = await db
			.from('onto_documents')
			.select('id, title, project_id')
			.in('id', documentIds)
			.is('deleted_at', null)
			.is('archived_at', null);
		if (documentError) throw new AgenticChatAssetReadQueryError('documents', documentError);
		for (const document of Array.isArray(documents) ? documents : []) {
			if (typeof document?.id !== 'string') continue;
			titles.set(document.id, {
				title: typeof document.title === 'string' ? document.title : null,
				project_id: String(document.project_id)
			});
		}
	}
	for (const asset of assets) {
		const documentId = firstLink.get(asset.id);
		const document = documentId ? titles.get(documentId) : undefined;
		// A link to a deleted/archived/foreign document is not a visible filing.
		placements.set(
			asset.id,
			documentId && document && document.project_id === asset.project_id
				? { document_id: documentId, document_title: document.title }
				: null
		);
	}
	return placements;
}

function serializeAsset(
	row: Record<string, any>,
	placement: AgenticChatAssetPlacementV1,
	options: { detail: boolean; includeTextPreview: boolean }
): Record<string, unknown> {
	return {
		id: row.id,
		project_id: row.project_id,
		caption: boundedText(row.caption, ASSET_SUMMARY_MAX_CHARS),
		file_name: boundedText(row.original_filename, ASSET_SUMMARY_MAX_CHARS),
		alt_text: boundedText(row.alt_text, ASSET_SUMMARY_MAX_CHARS),
		summary: boundedText(row.extraction_summary, ASSET_SUMMARY_MAX_CHARS),
		ocr_status: typeof row.ocr_status === 'string' ? row.ocr_status : null,
		// `filed_under` carries no `id` key on purpose: it is a placement, not a
		// second entity the read returned.
		filed_under: placement,
		...(options.detail
			? {
					content_type: typeof row.content_type === 'string' ? row.content_type : null,
					width: typeof row.width === 'number' ? row.width : null,
					height: typeof row.height === 'number' ? row.height : null,
					created_at: row.created_at ?? null
				}
			: {}),
		updated_at: row.updated_at ?? null,
		...(options.includeTextPreview
			? {
					extracted_text_preview: boundedText(
						row.extracted_text,
						ASSET_TEXT_PREVIEW_MAX_CHARS
					)
				}
			: {})
	};
}

export async function searchOntoAssets(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntoAssetsArgs
): Promise<{ assets: Record<string, unknown>[]; total: number; message: string }> {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	const limit = clampInteger(args.limit, 12, 1, 50);
	const offset = clampInteger(args.offset, 0, 0, 10_000);
	const ocrStatus =
		typeof args.ocr_status === 'string' ? args.ocr_status.trim().toLowerCase() : '';
	if (ocrStatus && !ASSET_OCR_STATUSES.has(ocrStatus)) {
		throw new Error(`ocr_status must be one of: ${[...ASSET_OCR_STATUSES].join(', ')}`);
	}
	const includeTextPreview = args.include_text_preview === true;
	const projectId =
		typeof args.project_id === 'string' && args.project_id.trim()
			? args.project_id.trim()
			: null;
	if (projectId && !isValidUUID(projectId)) throw new Error('Invalid project_id: expected UUID');

	let dbQuery = (context.client as any)
		.from('onto_assets')
		.select(includeTextPreview ? `${ASSET_LIST_SELECT}, extracted_text` : ASSET_LIST_SELECT, {
			count: 'exact'
		})
		.eq('kind', 'image')
		.is('deleted_at', null);
	if (projectId) {
		await context.access.assertProjectAccess(projectId, 'read');
		dbQuery = dbQuery.eq('project_id', projectId);
	} else {
		const readable = readableProjectIdsFromSummaries(
			await context.access.resolveProjectSummaries()
		);
		dbQuery =
			readable.length > 0
				? dbQuery.in('project_id', readable)
				: dbQuery.eq('project_id', AGENTIC_CHAT_NO_READABLE_PROJECTS_SENTINEL);
	}
	if (ocrStatus) dbQuery = dbQuery.eq('ocr_status', ocrStatus);
	if (query) {
		dbQuery = applyKeywordSearch(dbQuery, query, [
			'original_filename',
			'caption',
			'alt_text',
			'extraction_summary',
			'extracted_text'
		]);
	}
	const { data, count, error } = await dbQuery
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	if (error) throw new AgenticChatAssetReadQueryError('assets', error);
	const rows = (Array.isArray(data) ? data : []).filter(
		(row: any) => typeof row?.id === 'string' && typeof row?.project_id === 'string'
	);
	const placements = await loadAssetPlacements(context, rows);
	const assets = rows.map((row: Record<string, any>) =>
		serializeAsset(row, placements.get(row.id) ?? null, {
			detail: false,
			includeTextPreview
		})
	);
	return {
		assets,
		total: typeof count === 'number' ? count : assets.length,
		message: `Found ${assets.length} project image${assets.length === 1 ? '' : 's'}${query ? ` matching "${query}"` : ''}. filed_under null means the project's Images shelf.`
	};
}

export async function getOntoAsset(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoAssetArgs
): Promise<{ asset: Record<string, unknown>; message: string }> {
	const assetId = typeof args.asset_id === 'string' ? args.asset_id.trim() : '';
	if (!assetId) throw new Error('asset_id is required for get_onto_asset');
	if (!isValidUUID(assetId)) throw new Error('Invalid asset_id: expected UUID');

	const { data: row, error } = await (context.client as any)
		.from('onto_assets')
		.select(ASSET_DETAIL_SELECT)
		.eq('id', assetId)
		.eq('kind', 'image')
		.is('deleted_at', null)
		.maybeSingle();
	if (error) throw new AgenticChatAssetReadQueryError('assets', error);
	if (!row || typeof row.project_id !== 'string') throw new Error('Image not found');
	await context.access.assertProjectAccess(row.project_id, 'read');

	const placements = await loadAssetPlacements(context, [row]);
	const placement = placements.get(row.id) ?? null;
	return {
		asset: serializeAsset(row, placement, {
			detail: true,
			includeTextPreview: args.include_text_preview !== false
		}),
		message: placement
			? `Image is filed under "${placement.document_title ?? placement.document_id}".`
			: "Image is on the project's Images shelf (not filed under a document)."
	};
}
