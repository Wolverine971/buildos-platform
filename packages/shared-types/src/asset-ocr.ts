// packages/shared-types/src/asset-ocr.ts
import type { Json } from './database.types';

export type AssetOcrStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'skipped';
export type AssetExtractedTextSource = 'ocr' | 'manual';

export interface AssetOcrStateSnapshot {
	ocr_version?: number | null;
	extracted_text?: string | null;
	extracted_text_source?: string | null;
	extraction_summary?: string | null;
	extraction_metadata?: unknown;
}

export interface AssetOcrTransitionPayload {
	ocr_status?: AssetOcrStatus;
	ocr_error?: string | null;
	ocr_model?: string | null;
	ocr_version?: number;
	ocr_started_at?: string | null;
	ocr_completed_at?: string | null;
	extracted_text?: string | null;
	extracted_text_source?: AssetExtractedTextSource;
	extracted_text_updated_at?: string | null;
	extracted_text_updated_by?: string | null;
	extraction_summary?: string | null;
	extraction_metadata?: Json;
	updated_at: string;
}

export interface ManualOcrUpdateParams {
	asset: AssetOcrStateSnapshot;
	actorId: string;
	hasExtractedText: boolean;
	extractedText: string | null;
	hasSummary: boolean;
	extractionSummary: string | null;
	nowIso?: string;
}

export interface AutoOcrCompletionParams {
	asset: AssetOcrStateSnapshot;
	model: string;
	extractedText: string;
	summary: string | null;
	confidence?: number;
	language?: string;
	latencyMs?: number | null;
	nowIso?: string;
}

type JsonObject = Record<string, Json | undefined>;

function toJsonObject(value: unknown): JsonObject {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return { ...(value as JsonObject) };
	}
	return {};
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return { ...(value as Record<string, unknown>) };
	}
	return null;
}

function nowIsoString(): string {
	return new Date().toISOString();
}

export function getNextOcrVersion(currentVersion: number | null | undefined): number {
	return Math.max(Number(currentVersion || 1), 1) + 1;
}

export function shouldPreserveManualExtractedText(
	asset: AssetOcrStateSnapshot,
	forceOverwrite = false
): boolean {
	return (
		asset.extracted_text_source === 'manual' && Boolean(asset.extracted_text) && !forceOverwrite
	);
}

export function buildAssetOcrPendingUpdate(nowIso = nowIsoString()): AssetOcrTransitionPayload {
	return {
		ocr_status: 'pending',
		ocr_error: null,
		ocr_started_at: null,
		ocr_completed_at: null,
		updated_at: nowIso
	};
}

export function buildAssetOcrProcessingUpdate(nowIso = nowIsoString()): AssetOcrTransitionPayload {
	return {
		ocr_status: 'processing',
		ocr_error: null,
		ocr_started_at: nowIso,
		updated_at: nowIso
	};
}

export function buildAssetOcrFailedUpdate(
	message: string,
	nowIso = nowIsoString()
): AssetOcrTransitionPayload {
	return {
		ocr_status: 'failed',
		ocr_error: message,
		ocr_completed_at: nowIso,
		updated_at: nowIso
	};
}

export function buildAssetOcrSkippedUpdate(
	message: string,
	nowIso = nowIsoString()
): AssetOcrTransitionPayload {
	return {
		ocr_status: 'skipped',
		ocr_error: message,
		ocr_completed_at: nowIso,
		updated_at: nowIso
	};
}

export function buildAssetOcrManualPreservedUpdate(
	nowIso = nowIsoString()
): AssetOcrTransitionPayload {
	return {
		ocr_status: 'complete',
		ocr_error: null,
		updated_at: nowIso
	};
}

export function buildAssetManualOcrUpdate(
	params: ManualOcrUpdateParams
): AssetOcrTransitionPayload {
	const nowIso = params.nowIso ?? nowIsoString();
	const metadata = toJsonObject(params.asset.extraction_metadata);
	const lastOcr = toRecordOrNull(metadata.last_ocr);
	const existingLastAuto = toRecordOrNull(metadata.last_auto_ocr);

	let nextLastAuto = existingLastAuto;
	if (lastOcr) {
		nextLastAuto = lastOcr;
	} else if (
		params.asset.extracted_text_source === 'ocr' &&
		(params.asset.extracted_text || params.asset.extraction_summary)
	) {
		nextLastAuto = {
			extracted_text: params.asset.extracted_text ?? null,
			extraction_summary: params.asset.extraction_summary ?? null,
			captured_at: nowIso
		};
	}

	const nextMetadata = nextLastAuto ? { ...metadata, last_auto_ocr: nextLastAuto } : metadata;

	const payload: AssetOcrTransitionPayload = {
		ocr_version: getNextOcrVersion(params.asset.ocr_version),
		extracted_text_source: 'manual',
		extracted_text_updated_at: nowIso,
		extracted_text_updated_by: params.actorId,
		ocr_status: 'complete',
		ocr_error: null,
		extraction_metadata: nextMetadata as Json,
		updated_at: nowIso
	};

	if (params.hasExtractedText) {
		payload.extracted_text = params.extractedText;
	}
	if (params.hasSummary) {
		payload.extraction_summary = params.extractionSummary;
	}

	return payload;
}

export function buildAssetOcrCompleteUpdate(
	params: AutoOcrCompletionParams
): AssetOcrTransitionPayload {
	const nowIso = params.nowIso ?? nowIsoString();
	const metadata = toJsonObject(params.asset.extraction_metadata);

	return {
		ocr_status: 'complete',
		ocr_error: null,
		ocr_model: params.model,
		ocr_version: getNextOcrVersion(params.asset.ocr_version),
		ocr_completed_at: nowIso,
		extracted_text: params.extractedText,
		extraction_summary: params.summary,
		extracted_text_source: 'ocr',
		extracted_text_updated_at: nowIso,
		extracted_text_updated_by: null,
		extraction_metadata: {
			...metadata,
			last_ocr: {
				model: params.model,
				completed_at: nowIso,
				confidence: params.confidence,
				language: params.language,
				latency_ms: params.latencyMs ?? null
			}
		} as Json,
		updated_at: nowIso
	};
}
