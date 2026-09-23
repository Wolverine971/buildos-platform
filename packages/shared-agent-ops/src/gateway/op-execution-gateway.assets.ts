// packages/shared-agent-ops/src/gateway/op-execution-gateway.assets.ts
import { logUpdateAsync } from '../ops/async-activity-logger';
import { ensureActorId, type OntologyProjectSummary } from '../ontology/ontology-projects.service';
import { buildSearchFilter } from '../utils/search-filter';
import {
	EXTERNAL_ASSET_OCR_STATUSES,
	EXTERNAL_ASSET_SELECT,
	EXTERNAL_ASSET_SUMMARY_MAX_CHARS,
	EXTERNAL_ASSET_TEXT_PREVIEW_MAX_CHARS
} from './op-execution-gateway.config';
import {
	assertAccessibleProject,
	assertProjectWriteAccess,
	assertVisibleEntityProject,
	getProjectIdsForVisibleContext,
	loadVisibleProjects
} from './op-execution-gateway.access';
import { getExternalAgentActivityContext } from './op-execution-gateway.activity';
import { assertValidId } from './op-execution-gateway.ids';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import type { ToolExecutionContext } from './op-execution-gateway.types';

function normalizeAssetText(value: unknown, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeOptionalAssetOcrStatus(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'ocr_status must be a string');
	}
	const normalized = value.trim().toLowerCase();
	if (!EXTERNAL_ASSET_OCR_STATUSES.has(normalized)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'ocr_status must be one of: pending, processing, complete, failed, skipped'
		);
	}
	return normalized;
}

function readNullableString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNullableNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function checksumSuffix(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(normalized)) return null;
	return normalized.slice(-12);
}

function serializeExternalAsset(
	row: Record<string, unknown>,
	projectMap: Map<string, OntologyProjectSummary>,
	options: { includeTextPreview?: boolean } = {}
): Record<string, unknown> {
	const projectId = typeof row.project_id === 'string' ? row.project_id : '';
	const extractedText = typeof row.extracted_text === 'string' ? row.extracted_text : '';
	return {
		id: readNullableString(row.id),
		project_id: projectId || null,
		project_name: projectMap.get(projectId)?.name ?? null,
		kind: readNullableString(row.kind) ?? 'image',
		file_name: readNullableString(row.original_filename),
		content_type: readNullableString(row.content_type),
		file_size_bytes: readNullableNumber(row.file_size_bytes),
		width: readNullableNumber(row.width),
		height: readNullableNumber(row.height),
		checksum_sha256_suffix: checksumSuffix(row.checksum_sha256),
		ocr_status: readNullableString(row.ocr_status),
		caption: normalizeAssetText(row.caption, EXTERNAL_ASSET_SUMMARY_MAX_CHARS),
		alt_text: normalizeAssetText(row.alt_text, EXTERNAL_ASSET_SUMMARY_MAX_CHARS),
		extraction_summary: normalizeAssetText(
			row.extraction_summary,
			EXTERNAL_ASSET_SUMMARY_MAX_CHARS
		),
		has_extracted_text: extractedText.trim().length > 0,
		...(options.includeTextPreview
			? {
					extracted_text_preview: normalizeAssetText(
						extractedText,
						EXTERNAL_ASSET_TEXT_PREVIEW_MAX_CHARS
					)
				}
			: {}),
		created_at: readNullableString(row.created_at),
		updated_at: readNullableString(row.updated_at),
		media_access:
			'metadata_and_bounded_ocr_only; storage paths and signed media URLs are intentionally not exposed through external agent tools'
	};
}

export async function searchAssets(context: ToolExecutionContext, args: Record<string, unknown>) {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	const limit = clampLimit(args.limit, 12, 1, 50);
	const offset = normalizeOffset(args.offset);
	const ocrStatus = normalizeOptionalAssetOcrStatus(args.ocr_status);
	const includeTextPreview = args.include_text_preview === true;
	const visible = await loadVisibleProjects(context);
	let projectIds = getProjectIdsForVisibleContext(visible);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			query: query || null,
			assets: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0),
			access: {
				media: 'metadata_and_bounded_ocr_only',
				raw_pixels: false,
				signed_urls: false
			}
		};
	}

	let dbQuery = context.admin
		.from('onto_assets')
		.select(EXTERNAL_ASSET_SELECT, { count: 'exact' })
		.in('project_id', projectIds)
		.eq('kind', 'image')
		.is('deleted_at', null);

	if (ocrStatus) {
		dbQuery = dbQuery.eq('ocr_status', ocrStatus);
	}

	const filter = buildSearchFilter(query, [
		'original_filename',
		'caption',
		'alt_text',
		'extraction_summary',
		'extracted_text'
	]);
	if (filter) {
		dbQuery = dbQuery.or(filter);
	}

	const { data, error, count } = await dbQuery
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to search image assets'
		);
	}

	const rows = Array.isArray(data)
		? data.filter(
				(row): row is Record<string, unknown> =>
					Boolean(row) && typeof row === 'object' && !Array.isArray(row)
			)
		: [];
	const assets = rows.map((row) =>
		serializeExternalAsset(row, visible.projectMap, { includeTextPreview })
	);
	const total = typeof count === 'number' ? count : assets.length;

	return {
		query: query || null,
		assets,
		total,
		pagination: buildPaginationForRows(offset, limit, total, assets.length),
		access: {
			media: 'metadata_and_bounded_ocr_only',
			raw_pixels: false,
			signed_urls: false
		}
	};
}

export async function getAsset(context: ToolExecutionContext, args: Record<string, unknown>) {
	const assetId = assertValidId(args.asset_id, 'asset_id');
	const includeTextPreview = args.include_text_preview !== false;
	const visible = await loadVisibleProjects(context);
	const projectIds = getProjectIdsForVisibleContext(visible);

	if (projectIds.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Asset not found');
	}

	const { data, error } = await context.admin
		.from('onto_assets')
		.select(EXTERNAL_ASSET_SELECT)
		.eq('id', assetId)
		.in('project_id', projectIds)
		.eq('kind', 'image')
		.is('deleted_at', null)
		.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load image asset'
		);
	}

	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Asset not found');
	}

	const projectId = (data as Record<string, unknown>).project_id;
	assertVisibleEntityProject(visible.projectMap, projectId);

	return {
		asset: serializeExternalAsset(data as Record<string, unknown>, visible.projectMap, {
			includeTextPreview
		}),
		access: {
			media: 'metadata_and_bounded_ocr_only',
			raw_pixels: false,
			signed_urls: false
		}
	};
}

// ---------------------------------------------------------------------------
// onto.asset.update — name a project image and file it in the document tree
// ---------------------------------------------------------------------------

/** The project document tree places an image by this one link shape. */
export const ASSET_DOCUMENT_PLACEMENT_LINK = Object.freeze({
	entity_kind: 'document',
	role: 'attachment'
} as const);

const ASSET_CAPTION_MAX_CHARS = 200;
const ASSET_ALT_TEXT_MAX_CHARS = 1000;
const ASSET_UPDATE_SELECT = 'id, project_id, kind, original_filename, caption, alt_text';

export type AssetPlacement =
	| { kind: 'document'; document_id: string; document_title: string | null }
	| { kind: 'images_shelf' };

function normalizeAssetLabel(value: unknown, fieldName: string, maxChars: number): string {
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a string`);
	}
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must not be empty; omit it to leave it unchanged`
		);
	}
	if (normalized.length > maxChars) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be at most ${maxChars} characters`
		);
	}
	return normalized;
}

/**
 * `document_id` is tri-state: omitted leaves placement alone, null unfiles the
 * image back to the Images shelf, a UUID files it under that document.
 */
function readRequestedPlacement(args: Record<string, unknown>): string | null | undefined {
	if (args.document_id === undefined) return undefined;
	if (args.document_id === null) return null;
	return assertValidId(args.document_id, 'document_id');
}

async function loadDocumentPlacementLinks(
	context: ToolExecutionContext,
	assetId: string
): Promise<string[]> {
	const { data, error } = await context.admin
		.from('onto_asset_links')
		.select('entity_id, created_at')
		.eq('asset_id', assetId)
		.eq('entity_kind', ASSET_DOCUMENT_PLACEMENT_LINK.entity_kind)
		.eq('role', ASSET_DOCUMENT_PLACEMENT_LINK.role)
		.order('created_at', { ascending: true });
	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load image placement'
		);
	}
	return (Array.isArray(data) ? data : [])
		.map((row: Record<string, unknown>) =>
			typeof row.entity_id === 'string' ? row.entity_id : null
		)
		.filter((id: string | null): id is string => Boolean(id));
}

async function loadPlacementDocument(
	context: ToolExecutionContext,
	projectId: string,
	documentId: string
): Promise<{ id: string; title: string | null } | null> {
	const { data, error } = await context.admin
		.from('onto_documents')
		.select('id, title')
		.eq('id', documentId)
		// Same project only: an image can never be filed across projects, and a
		// document in another project must not even be confirmed to exist.
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.is('archived_at', null)
		.maybeSingle();
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load document');
	}
	if (!data) return null;
	return { id: String(data.id), title: readNullableString(data.title) };
}

/**
 * Name an existing project image and/or file it under one document of the same
 * project. The project document tree renders an image nested under the
 * document it has an `attachment` link to, and on the project's Images shelf
 * when it has none, so filing is exactly: keep one document attachment link.
 */
export async function updateAsset(context: ToolExecutionContext, args: Record<string, unknown>) {
	const assetId = assertValidId(args.asset_id, 'asset_id');
	const caption =
		args.caption === undefined
			? undefined
			: normalizeAssetLabel(args.caption, 'caption', ASSET_CAPTION_MAX_CHARS);
	const altText =
		args.alt_text === undefined
			? undefined
			: normalizeAssetLabel(args.alt_text, 'alt_text', ASSET_ALT_TEXT_MAX_CHARS);
	const requestedDocumentId = readRequestedPlacement(args);
	if (caption === undefined && altText === undefined && requestedDocumentId === undefined) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Provide caption, alt_text, or document_id to change'
		);
	}

	const visible = await loadVisibleProjects(context);
	const projectIds = getProjectIdsForVisibleContext(visible);
	if (projectIds.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Image not found');
	}
	const { data: assetRow, error: assetError } = await context.admin
		.from('onto_assets')
		.select(ASSET_UPDATE_SELECT)
		.eq('id', assetId)
		.in('project_id', projectIds)
		// Temporary (non-project) chat uploads are kind temporary_file and have no
		// project; they are never filed.
		.eq('kind', 'image')
		.is('deleted_at', null)
		.maybeSingle();
	if (assetError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			assetError.message || 'Failed to load image'
		);
	}
	if (!assetRow || typeof assetRow !== 'object') {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Image not found');
	}
	const asset = assetRow as Record<string, unknown>;
	const project = assertVisibleEntityProject(visible.projectMap, asset.project_id);
	assertProjectWriteAccess(project, context.scope);

	const targetDocument =
		typeof requestedDocumentId === 'string'
			? await loadPlacementDocument(context, project.id, requestedDocumentId)
			: null;
	if (typeof requestedDocumentId === 'string' && !targetDocument) {
		throw new ExternalToolGatewayError(
			'NOT_FOUND',
			"Document not found in this image's project (it may be deleted or archived)"
		);
	}

	let savedAsset = asset;
	if (caption !== undefined || altText !== undefined) {
		const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (caption !== undefined) patch.caption = caption;
		if (altText !== undefined) patch.alt_text = altText;
		const { data: updated, error: updateError } = await context.admin
			.from('onto_assets')
			.update(patch)
			.eq('id', assetId)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.select(ASSET_UPDATE_SELECT)
			.single();
		if (updateError || !updated) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				updateError?.message || 'Failed to update image'
			);
		}
		savedAsset = updated as Record<string, unknown>;
	}

	const existingDocumentIds = await loadDocumentPlacementLinks(context, assetId);
	let removedDocumentIds: string[] = [];
	let addedDocumentId: string | null = null;
	if (requestedDocumentId !== undefined) {
		const actorId = await ensureActorId(context.admin, context.userId, context.signal);
		if (requestedDocumentId !== null && !existingDocumentIds.includes(requestedDocumentId)) {
			// Link first, unlink second: a failure between the two leaves the image
			// visible under an extra document instead of silently losing its place.
			const { error: insertError } = await context.admin.from('onto_asset_links').insert({
				project_id: project.id,
				asset_id: assetId,
				entity_kind: ASSET_DOCUMENT_PLACEMENT_LINK.entity_kind,
				entity_id: requestedDocumentId,
				role: ASSET_DOCUMENT_PLACEMENT_LINK.role,
				props: {},
				created_by: actorId
			});
			// 23505: a concurrent filing already created this exact link.
			if (insertError && insertError.code !== '23505') {
				throw new ExternalToolGatewayError(
					'INTERNAL',
					insertError.message || 'Failed to file image under document'
				);
			}
			addedDocumentId = requestedDocumentId;
		}
		removedDocumentIds = existingDocumentIds.filter((id) => id !== requestedDocumentId);
		if (removedDocumentIds.length > 0) {
			const { error: deleteError } = await context.admin
				.from('onto_asset_links')
				.delete()
				.eq('asset_id', assetId)
				.eq('entity_kind', ASSET_DOCUMENT_PLACEMENT_LINK.entity_kind)
				.eq('role', ASSET_DOCUMENT_PLACEMENT_LINK.role)
				.in('entity_id', removedDocumentIds);
			if (deleteError) {
				throw new ExternalToolGatewayError(
					'INTERNAL',
					deleteError.message || 'Failed to remove previous image placement',
					{ asset_id: assetId, partially_filed_document_id: addedDocumentId }
				);
			}
		}
	}

	// Final placement: the requested one, or (omitted) the image's current one.
	const placementDocumentId =
		requestedDocumentId !== undefined ? requestedDocumentId : (existingDocumentIds[0] ?? null);
	const placementDocument =
		placementDocumentId === null
			? null
			: targetDocument && targetDocument.id === placementDocumentId
				? targetDocument
				: await loadPlacementDocument(context, project.id, placementDocumentId);
	const placement: AssetPlacement = placementDocumentId
		? {
				kind: 'document',
				document_id: placementDocumentId,
				document_title: placementDocument?.title ?? null
			}
		: { kind: 'images_shelf' };

	// Attribution. onto_project_logs has no `asset` entity type, so a filing is
	// recorded on the documents whose visible contents changed; the link row
	// itself carries the acting actor in created_by.
	const savedCaption = readNullableString(savedAsset.caption);
	const imageLabel = savedCaption ?? readNullableString(savedAsset.original_filename);
	if (addedDocumentId) {
		await logUpdateAsync(
			context.admin,
			project.id,
			'document',
			addedDocumentId,
			{ image_asset_id: assetId, image_filed: false },
			{ image_asset_id: assetId, image_filed: true, image_caption: imageLabel },
			context.userId,
			'agent_call',
			context.chatSessionId,
			getExternalAgentActivityContext(context)
		);
	}
	for (const documentId of removedDocumentIds) {
		await logUpdateAsync(
			context.admin,
			project.id,
			'document',
			documentId,
			{ image_asset_id: assetId, image_filed: true },
			{ image_asset_id: assetId, image_filed: false, image_caption: imageLabel },
			context.userId,
			'agent_call',
			context.chatSessionId,
			getExternalAgentActivityContext(context)
		);
	}

	const quotedLabel = imageLabel ? `"${imageLabel}"` : 'image';
	const placementText =
		placement.kind === 'document'
			? `under "${placement.document_title ?? placement.document_id}"`
			: "on the project's Images shelf";
	const changed = [
		caption !== undefined ? 'named' : null,
		altText !== undefined ? 'described' : null
	].filter(Boolean);
	const message =
		requestedDocumentId !== undefined
			? `${changed.length ? `${capitalize(changed.join(' and '))} image ${quotedLabel} and filed it` : `Filed image ${quotedLabel}`} ${placementText}.`
			: `${capitalize(changed.join(' and '))} image ${quotedLabel}; it stays ${placementText}.`;

	return {
		asset: {
			id: assetId,
			project_id: project.id,
			caption: savedCaption,
			alt_text: readNullableString(savedAsset.alt_text),
			file_name: readNullableString(savedAsset.original_filename)
		},
		placement,
		message
	};
}

function capitalize(value: string): string {
	return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}
