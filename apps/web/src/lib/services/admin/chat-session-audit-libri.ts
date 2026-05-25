// apps/web/src/lib/services/admin/chat-session-audit-libri.ts
import {
	numberArray,
	payloadField,
	recordArray,
	recordFromUnknown,
	stringArray,
	stringValue,
	toNumericValue
} from './chat-session-audit-payload';
import type {
	LibriCandidateDisplay,
	LibriExtractionDisplay,
	LibriHandoffDisplay,
	LibriHandoffResultDisplay
} from './chat-session-audit-types';

export function formatLibriLabel(value: string): string {
	return value.replaceAll('_', ' ') || '-';
}

export function formatConfidence(value: number | null): string {
	if (value === null) return '-';
	return `${Math.round(value * 100)}%`;
}

export function buildLibriExtractionDisplay(value: unknown): LibriExtractionDisplay {
	const record = recordFromUnknown(value) ?? {};
	const candidates = recordArray(payloadField(record, 'libri_candidates')).map(
		(candidate): LibriCandidateDisplay => ({
			entityType: stringValue(payloadField(candidate, 'entity_type')),
			displayName: stringValue(payloadField(candidate, 'display_name')),
			canonicalQuery: stringValue(payloadField(candidate, 'canonical_query')),
			action: stringValue(payloadField(candidate, 'recommended_action')),
			relevance: stringValue(payloadField(candidate, 'relevance')),
			confidence: toNumericValue(payloadField(candidate, 'confidence')),
			youtubeVideoId: stringValue(payloadField(candidate, 'youtube_video_id')),
			authors: stringArray(payloadField(candidate, 'authors')),
			sourceTurns: numberArray(payloadField(candidate, 'source_turn_indices')),
			evidenceSnippets: stringArray(payloadField(candidate, 'evidence_snippets'))
		})
	);

	return {
		candidates,
		ignoredCount: recordArray(payloadField(record, 'ignored_candidates')).length,
		extractedAt: stringValue(payloadField(record, 'extracted_at')),
		version: stringValue(payloadField(record, 'extraction_version'))
	};
}

export function buildLibriHandoffDisplay(
	agentMetadata: Record<string, unknown>
): LibriHandoffDisplay | null {
	const raw = recordFromUnknown(payloadField(agentMetadata, 'libri_handoff'));
	if (!raw) return null;

	return {
		status: stringValue(payloadField(raw, 'status')) || 'unknown',
		attemptedAt: stringValue(payloadField(raw, 'attempted_at')),
		idempotencyKey: stringValue(payloadField(raw, 'idempotency_key')),
		message: stringValue(payloadField(raw, 'message')),
		httpStatus: stringValue(payloadField(raw, 'http_status')),
		results: recordArray(payloadField(raw, 'results')).map(
			(result): LibriHandoffResultDisplay => ({
				entityType: stringValue(payloadField(result, 'entity_type')),
				canonicalQuery: stringValue(payloadField(result, 'canonical_query')),
				status: stringValue(payloadField(result, 'status')) || 'unknown',
				resourceKey: stringValue(payloadField(result, 'resource_key')),
				jobId: stringValue(payloadField(result, 'job_id')),
				message: stringValue(payloadField(result, 'message'))
			})
		),
		raw
	};
}
