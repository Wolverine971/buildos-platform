// packages/shared-agent-ops/src/gateway/op-execution-gateway.assets.ts
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import { buildSearchFilter } from '../utils/search-filter';
import {
	EXTERNAL_ASSET_OCR_STATUSES,
	EXTERNAL_ASSET_SELECT,
	EXTERNAL_ASSET_SUMMARY_MAX_CHARS,
	EXTERNAL_ASSET_TEXT_PREVIEW_MAX_CHARS
} from './op-execution-gateway.config';
import {
	assertAccessibleProject,
	assertVisibleEntityProject,
	getProjectIdsForVisibleContext,
	loadVisibleProjects
} from './op-execution-gateway.access';
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
