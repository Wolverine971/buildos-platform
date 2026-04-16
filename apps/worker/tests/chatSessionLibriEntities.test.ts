// apps/worker/tests/chatSessionLibriEntities.test.ts
import { describe, expect, it } from 'vitest';
import {
	extractYouTubeVideoId,
	getEligibleLibriCandidates,
	sanitizeSessionExtractedEntities
} from '../src/workers/chat/libriSessionEntities';

const fixedNow = () => new Date('2026-04-15T12:00:00.000Z');

describe('Libri session entity extraction sanitizer', () => {
	it('sanitizes people, books, videos, and channels', () => {
		const extracted = sanitizeSessionExtractedEntities(
			{
				libri_candidates: [
					{
						entity_type: 'person',
						display_name: ' James Clear ',
						canonical_query: ' James Clear ',
						confidence: 1.2,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'User explicitly discussed him.',
						source_message_ids: ['msg-1', 'missing'],
						source_turn_indices: [0, 12],
						evidence_snippets: ['thinking about James Clear']
					},
					{
						entity_type: 'book',
						display_name: 'Atomic Habits',
						canonical_query: 'Atomic Habits James Clear',
						authors: ['James Clear', 'James Clear'],
						confidence: 0.94,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: false,
						extraction_reason: 'Book was central to the session.',
						source_message_ids: ['msg-1'],
						source_turn_indices: [0],
						evidence_snippets: ['Atomic Habits']
					},
					{
						entity_type: 'youtube_video',
						display_name: 'YouTube video',
						canonical_query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share#frag',
						confidence: 0.99,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'User asked to process the video.',
						source_message_ids: ['msg-2'],
						source_turn_indices: [1],
						evidence_snippets: ['process this video']
					},
					{
						entityType: 'youtube_channel',
						displayName: 'Example Channel',
						canonicalQuery: '@example',
						confidence: '0.82',
						relevance: 'supporting',
						recommendedAction: 'resolve_or_enqueue',
						userRequestedResearch: false,
						extractionReason: 'Channel was named.',
						sourceMessageIds: ['msg-2'],
						sourceTurnIndices: [1],
						evidenceSnippets: ['Example Channel']
					},
					{
						entity_type: 'unsupported',
						display_name: 'Nope',
						canonical_query: 'Nope'
					}
				]
			},
			{
				now: fixedNow,
				knownMessageIds: new Set(['msg-1', 'msg-2']),
				maxTurnIndex: 2
			}
		);

		expect(extracted.extraction_version).toBe('libri_session_synthesis_v1');
		expect(extracted.extracted_at).toBe('2026-04-15T12:00:00.000Z');
		expect(extracted.libri_candidates).toHaveLength(4);
		expect(extracted.libri_candidates[0]).toEqual(
			expect.objectContaining({
				entity_type: 'person',
				display_name: 'James Clear',
				canonical_query: 'James Clear',
				confidence: 1,
				source_message_ids: ['msg-1'],
				source_turn_indices: [0]
			})
		);
		expect(extracted.libri_candidates[1].authors).toEqual(['James Clear']);
		expect(extracted.libri_candidates[2]).toEqual(
			expect.objectContaining({
				entity_type: 'youtube_video',
				youtube_video_id: 'dQw4w9WgXcQ'
			})
		);
		expect(extracted.libri_candidates[3]).toEqual(
			expect.objectContaining({
				entity_type: 'youtube_channel',
				display_name: 'Example Channel',
				confidence: 0.82
			})
		);
	});

	it('keeps non-eligible candidates in storage but excludes them from automatic handoff', () => {
		const extracted = sanitizeSessionExtractedEntities(
			{
				libri_candidates: [
					{
						entity_type: 'person',
						display_name: 'High Confidence',
						canonical_query: 'High Confidence',
						confidence: 0.91,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: false,
						extraction_reason: 'Clear.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					},
					{
						entity_type: 'book',
						display_name: 'Search Only',
						canonical_query: 'Search Only',
						confidence: 0.98,
						relevance: 'primary',
						recommended_action: 'search_only',
						user_requested_research: false,
						extraction_reason: 'Not enough action.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					},
					{
						entity_type: 'youtube_channel',
						display_name: 'Incidental Low Confidence',
						canonical_query: 'Incidental Low Confidence',
						confidence: 0.81,
						relevance: 'incidental',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: false,
						extraction_reason: 'Bare mention.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					}
				]
			},
			{ now: fixedNow }
		);

		expect(extracted.libri_candidates).toHaveLength(3);
		expect(
			getEligibleLibriCandidates(extracted).map((candidate) => candidate.display_name)
		).toEqual(['High Confidence']);
	});

	it('extracts YouTube IDs from common URL forms', () => {
		expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
		expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
			'dQw4w9WgXcQ'
		);
		expect(extractYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
	});

	it('normalizes YouTube video IDs from explicit fields, url, canonical query, and raw display URL', () => {
		const extracted = sanitizeSessionExtractedEntities(
			{
				libri_candidates: [
					{
						entity_type: 'youtube_video',
						display_name: 'Video from url',
						canonical_query: 'Video from url',
						url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						confidence: 0.95,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'URL field has the video.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					},
					{
						entity_type: 'youtube_video',
						display_name: 'Video from canonical query',
						canonical_query: 'https://youtu.be/abcdefghijk',
						confidence: 0.95,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'Canonical query has the video.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					},
					{
						entity_type: 'youtube_video',
						display_name: 'Video with explicit ID',
						canonical_query: 'https://youtu.be/parsed12345',
						url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						youtube_video_id: 'explicit123',
						confidence: 0.95,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'Explicit ID should win.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					},
					{
						entity_type: 'youtube_video',
						display_name: 'https://www.youtube.com/watch?v=display1234',
						canonical_query: 'Display URL video',
						confidence: 0.95,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'Display name is a raw URL.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					},
					{
						entity_type: 'youtube_video',
						display_name: 'Not a YouTube URL',
						canonical_query: 'non-YouTube text',
						confidence: 0.95,
						relevance: 'primary',
						recommended_action: 'resolve_or_enqueue',
						user_requested_research: true,
						extraction_reason: 'No video ID should be inferred.',
						source_message_ids: [],
						source_turn_indices: [],
						evidence_snippets: []
					}
				]
			},
			{ now: fixedNow }
		);

		expect(extracted.libri_candidates.map((candidate) => candidate.youtube_video_id)).toEqual([
			'dQw4w9WgXcQ',
			'abcdefghijk',
			'explicit123',
			'display1234',
			undefined
		]);
	});
});
