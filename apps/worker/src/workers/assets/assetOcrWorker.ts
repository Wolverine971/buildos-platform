// apps/worker/src/workers/assets/assetOcrWorker.ts
import {
	type Database,
	buildAssetOcrCompleteUpdate,
	buildAssetOcrFailedUpdate,
	buildAssetOcrManualPreservedUpdate,
	buildAssetOcrProcessingUpdate,
	buildAssetOcrSkippedUpdate,
	shouldPreserveManualExtractedText
} from '@buildos/shared-types';
import { logWorkerError } from '../../lib/errorLogger';
import { PermanentQueueError } from '../../lib/queueErrors';
import { supabase } from '../../lib/supabase';
import type { LegacyJob } from '../shared/jobAdapter';

type AssetOcrJobMetadata = {
	assetId: string;
	projectId: string;
	userId: string;
	forceOverwrite?: boolean;
};

type AssetRecord = Pick<
	Database['public']['Tables']['onto_assets']['Row'],
	| 'id'
	| 'project_id'
	| 'storage_bucket'
	| 'storage_path'
	| 'content_type'
	| 'ocr_status'
	| 'ocr_version'
	| 'extracted_text'
	| 'extracted_text_source'
	| 'extraction_summary'
	| 'extraction_metadata'
	| 'deleted_at'
>;

type OcrOutput = {
	extracted_text: string;
	summary: string;
	confidence?: number;
	language?: string;
};

// OCR routes through OpenRouter (one provider, one bill — same pattern as the
// embeddings pipeline); a direct OpenAI key is only the fallback route. An
// IMAGE_OCR_MODEL override is used verbatim, so on the OpenRouter route it
// must carry the provider prefix (e.g. openai/gpt-4o-mini).
const OPENROUTER_API_KEY =
	process.env.PRIVATE_OPENROUTER_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
const OPENAI_API_KEY =
	process.env.OPENAI_API_KEY?.trim() || process.env.PRIVATE_OPENAI_API_KEY?.trim();
const OCR_API_KEY = OPENROUTER_API_KEY || OPENAI_API_KEY;
const CHAT_COMPLETIONS_URL = OPENROUTER_API_KEY
	? 'https://openrouter.ai/api/v1/chat/completions'
	: 'https://api.openai.com/v1/chat/completions';
const OCR_MODEL =
	process.env.IMAGE_OCR_MODEL || (OPENROUTER_API_KEY ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');

function trimToLimit(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength);
}

async function extractOcrFromImageUrl(imageUrl: string): Promise<OcrOutput> {
	if (!OCR_API_KEY) {
		throw new PermanentQueueError(
			'asset_ocr_missing_api_key',
			'Missing PRIVATE_OPENROUTER_API_KEY (or an OpenAI key fallback) for asset OCR'
		);
	}

	const response = await fetch(CHAT_COMPLETIONS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OCR_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: OCR_MODEL,
			temperature: 0.1,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content:
						'You perform OCR and semantic extraction for product images. Return JSON with keys extracted_text, summary, confidence, language.'
				},
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: 'Extract all readable text from the image and provide a concise one-sentence summary of what the image contains.'
						},
						{
							type: 'image_url',
							image_url: {
								url: imageUrl
							}
						}
					]
				}
			]
		})
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message = payload?.error?.message || `OCR request failed (${response.status})`;
		throw new Error(message);
	}

	const content = payload?.choices?.[0]?.message?.content;
	if (typeof content !== 'string' || !content.trim()) {
		throw new Error('OCR model returned empty content');
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new Error('OCR model returned invalid JSON');
	}

	const output = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	const extractedText =
		typeof output.extracted_text === 'string' ? output.extracted_text.trim() : '';
	const summary = typeof output.summary === 'string' ? output.summary.trim() : '';

	// An image with no readable text is a valid result, not a failure: retrying
	// would repeat the same paid vision call for the same empty answer.
	return {
		extracted_text: trimToLimit(extractedText, 100000),
		summary: trimToLimit(
			summary ||
				(extractedText ? 'Image with extracted text' : 'Image with no readable text'),
			1000
		),
		confidence: typeof output.confidence === 'number' ? output.confidence : undefined,
		language: typeof output.language === 'string' ? output.language : undefined
	};
}

async function markFailed(params: { assetId: string; message: string }): Promise<void> {
	const { error } = await supabase
		.from('onto_assets')
		.update(buildAssetOcrFailedUpdate(params.message))
		.eq('id', params.assetId);
	if (error) {
		console.error(`[AssetOCR] Failed to mark asset ${params.assetId} failed: ${error.message}`);
	}
}

async function updateAsset(
	assetId: string,
	payload: Database['public']['Tables']['onto_assets']['Update'],
	action: string
): Promise<void> {
	const { error } = await supabase.from('onto_assets').update(payload).eq('id', assetId);
	if (error) {
		throw new Error(`Failed to ${action} for asset ${assetId}: ${error.message}`);
	}
}

export async function processAssetOcrJob(job: LegacyJob<AssetOcrJobMetadata>) {
	const { assetId, userId, forceOverwrite = false } = job.data;
	let asset: AssetRecord | null = null;
	let stage: 'fetch' | 'signed_url' | 'ocr' | 'persist' | 'unknown' = 'fetch';
	let startedAt: number | null = Date.now();

	try {
		const { data: fetched, error: fetchError } = await supabase
			.from('onto_assets')
			.select(
				'id, project_id, storage_bucket, storage_path, content_type, ocr_status, ocr_version, extracted_text, extracted_text_source, extraction_summary, extraction_metadata, deleted_at'
			)
			.eq('id', assetId)
			.maybeSingle();

		if (fetchError) {
			throw new Error(fetchError.message);
		}
		if (!fetched) {
			throw new PermanentQueueError('asset_not_found', 'Asset not found');
		}

		asset = fetched;

		if (asset.deleted_at) {
			return { success: true, assetId, skipped: true, reason: 'deleted' };
		}

		if (!String(asset.content_type || '').startsWith('image/')) {
			await updateAsset(
				assetId,
				buildAssetOcrSkippedUpdate('Non-image asset'),
				'mark skipped'
			);
			return { success: true, assetId, skipped: true, reason: 'non_image' };
		}

		if (shouldPreserveManualExtractedText(asset, forceOverwrite)) {
			await updateAsset(
				assetId,
				buildAssetOcrManualPreservedUpdate(),
				'preserve manual text'
			);
			return { success: true, assetId, skipped: true, reason: 'manual_preserved' };
		}

		const processingAt = new Date().toISOString();
		await updateAsset(
			assetId,
			buildAssetOcrProcessingUpdate(processingAt),
			'mark OCR processing'
		);

		stage = 'signed_url';
		const { data: signedData, error: signedError } = await supabase.storage
			.from(asset.storage_bucket)
			.createSignedUrl(asset.storage_path, 60 * 15);

		if (signedError || !signedData?.signedUrl) {
			throw new Error(signedError?.message || 'Failed to create signed URL');
		}

		stage = 'ocr';
		const ocr = await extractOcrFromImageUrl(signedData.signedUrl);

		stage = 'persist';
		const now = new Date().toISOString();
		// Fenced on ocr_version: a manual text save during the OCR call bumps it,
		// and the user's text must win over this machine result.
		const { data: persisted, error: persistError } = await supabase
			.from('onto_assets')
			.update(
				buildAssetOcrCompleteUpdate({
					asset,
					model: OCR_MODEL,
					extractedText: ocr.extracted_text,
					summary: ocr.summary,
					confidence: ocr.confidence,
					language: ocr.language,
					latencyMs: startedAt ? Date.now() - startedAt : null,
					nowIso: now
				})
			)
			.eq('id', assetId)
			.eq('ocr_version', asset.ocr_version)
			.select('id')
			.maybeSingle();
		if (persistError) {
			throw new Error(`Failed to persist OCR result: ${persistError.message}`);
		}
		if (!persisted) {
			return { success: true, assetId, skipped: true, reason: 'superseded_by_manual_edit' };
		}

		return {
			success: true,
			assetId,
			projectId: asset.project_id,
			ocrStatus: 'complete',
			transcriptLength: ocr.extracted_text.length
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Asset OCR failed';
		await markFailed({ assetId, message });
		await logWorkerError(error, {
			userId,
			tableName: 'onto_assets',
			recordId: assetId,
			operationType: 'extract_onto_asset_ocr',
			llmProvider: 'openai',
			llmModel: OCR_MODEL,
			responseTimeMs: startedAt ? Date.now() - startedAt : undefined,
			errorType: 'llm_error',
			metadata: {
				stage,
				queue_job_id: job.id,
				project_id: asset?.project_id,
				storage_bucket: asset?.storage_bucket,
				storage_path: asset?.storage_path
			}
		});
		throw error;
	}
}
