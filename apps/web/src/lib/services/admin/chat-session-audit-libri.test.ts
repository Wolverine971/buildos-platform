// apps/web/src/lib/services/admin/chat-session-audit-libri.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildLibriExtractionDisplay,
	buildLibriHandoffDisplay,
	formatConfidence,
	formatLibriLabel
} from './chat-session-audit-libri';

describe('chat-session-audit-libri', () => {
	it('builds extraction and handoff display records', () => {
		const extraction = buildLibriExtractionDisplay({
			libri_candidates: [
				{
					entity_type: 'youtube_video',
					display_name: 'A video',
					canonical_query: 'A video',
					recommended_action: 'resolve_or_enqueue',
					confidence: 0.96,
					authors: ['Creator'],
					source_turn_indices: [1],
					evidence_snippets: ['mentioned video']
				}
			],
			ignored_candidates: [{}],
			extracted_at: '2026-04-12T12:00:00.000Z',
			extraction_version: 'v1'
		});
		expect(extraction.candidates[0]).toMatchObject({
			entityType: 'youtube_video',
			displayName: 'A video',
			confidence: 0.96,
			authors: ['Creator'],
			sourceTurns: [1]
		});
		expect(extraction.ignoredCount).toBe(1);

		const handoff = buildLibriHandoffDisplay({
			libri_handoff: {
				status: 'sent',
				results: [{ canonical_query: 'A video', status: 'queued', job_id: 'job-1' }]
			}
		});
		expect(handoff?.results[0]).toMatchObject({
			canonicalQuery: 'A video',
			status: 'queued',
			jobId: 'job-1'
		});
		expect(formatLibriLabel('youtube_video')).toBe('youtube video');
		expect(formatConfidence(0.96)).toBe('96%');
	});
});
