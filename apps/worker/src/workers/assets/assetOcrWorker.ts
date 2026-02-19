// apps/worker/src/workers/assets/assetOcrWorker.ts
import { logWorkerError } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import {
	buildAssetOcrCompleteUpdate,
	buildAssetOcrFailedUpdate,
	buildAssetOcrManualPreservedUpdate,
	buildAssetOcrProcessingUpdate,
	buildAssetOcrSkippedUpdate,
	shouldPreserveManualExtractedText
} from '@buildos/shared-types';
import type { LegacyJob } from '../shared/jobAdapter';

type AssetOcrJobMetadata = {
	assetId: string;
	projectId: string;
	userId: string;
	forceOverwrite?: boolean;
};

type AssetRecord = {
	id: string;
	project_id: string;
	storage_bucket: string;
	storage_path: string;
	content_type: string;
	ocr_status: string | null;
	ocr_version: number | null;
	extracted_text: string | null;
	extracted_text_source: string | null;
	extraction_summary: string | null;
	extraction_metadata: Record<string, unknown> | null;
	deleted_at: string | null;
};

type OcrOutput = {
	extracted_text: string;
	summary: string;
	confidence?: number;
	language?: string;
};

const OPENAI_API_KEY =
	process.env.OPENAI_API_KEY?.trim() || process.env.PRIVATE_OPENAI_API_KEY?.trim();
const OCR_MODEL = process.env.IMAGE_OCR_MODEL || 'gpt-4o-mini';
const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

function trimToLimit(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength);
}

async function extractOcrFromImageUrl(imageUrl: string): Promise<OcrOutput> {
	if (!OPENAI_API_KEY) {
		throw new Error('Missing OpenAI API key for asset OCR');
	}

	const response = await fetch(CHAT_COMPLETIONS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENAI_API_KEY}`,
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

	let parsed: any = null;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new Error('OCR model returned invalid JSON');
	}

	const extractedText =
		typeof parsed?.extracted_text === 'string' ? parsed.extracted_text.trim() : '';
	const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';

	if (!extractedText) {
		throw new Error('OCR model returned no extracted text');
	}

	return {
		extracted_text: trimToLimit(extractedText, 100000),
		summary: trimToLimit(summary || 'Image with extracted text', 1000),
		confidence: typeof parsed?.confidence === 'number' ? parsed.confidence : undefined,
		language: typeof parsed?.language === 'string' ? parsed.language : undefined
	};
}

async function markFailed(params: { assetId: string; message: string }): Promise<void> {
	await (supabase as any)
		.from('onto_assets')
		.update(buildAssetOcrFailedUpdate(params.message))
		.eq('id', params.assetId);
}

export async function processAssetOcrJob(job: LegacyJob<AssetOcrJobMetadata>) {
	const { assetId, userId, forceOverwrite = false } = job.data;
	let asset: AssetRecord | null = null;
	let stage: 'fetch' | 'signed_url' | 'ocr' | 'persist' | 'unknown' = 'fetch';
	let startedAt: number | null = Date.now();

	try {
		const { data: fetched, error: fetchError } = (await (supabase as any)
			.from('onto_assets')
			.select(
				'id, project_id, storage_bucket, storage_path, content_type, ocr_status, ocr_version, extracted_text, extracted_text_source, extraction_summary, extraction_metadata, deleted_at'
			)
			.eq('id', assetId)
			.maybeSingle()) as { data: AssetRecord | null; error: any };

		if (fetchError || !fetched) {
			throw new Error(fetchError?.message || 'Asset not found');
		}

		asset = fetched;

		if (asset.deleted_at) {
			return { success: true, assetId, skipped: true, reason: 'deleted' };
		}

		if (!String(asset.content_type || '').startsWith('image/')) {
			await (supabase as any)
				.from('onto_assets')
				.update(buildAssetOcrSkippedUpdate('Non-image asset'))
				.eq('id', assetId);
			return { success: true, assetId, skipped: true, reason: 'non_image' };
		}

		if (shouldPreserveManualExtractedText(asset, forceOverwrite)) {
			await (supabase as any)
				.from('onto_assets')
				.update(buildAssetOcrManualPreservedUpdate())
				.eq('id', assetId);
			return { success: true, assetId, skipped: true, reason: 'manual_preserved' };
		}

		const processingAt = new Date().toISOString();
		await (supabase as any)
			.from('onto_assets')
			.update(buildAssetOcrProcessingUpdate(processingAt))
			.eq('id', assetId);

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
		await (supabase as any)
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
			.eq('id', assetId);

		return {
			success: true,
			assetId,
			projectId: asset.project_id,
			ocrStatus: 'complete',
			transcriptLength: ocr.extracted_text.length
		};
	} catch (error: any) {
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
