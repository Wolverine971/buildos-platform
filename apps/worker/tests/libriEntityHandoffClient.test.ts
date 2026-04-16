// apps/worker/tests/libriEntityHandoffClient.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildLibriHandoffIdempotencyKey,
	handoffLibriSessionEntities
} from '../src/workers/chat/libriEntityHandoffClient';
import type {
	ExtractedLibriEntity,
	SessionExtractedEntities
} from '../src/workers/chat/libriSessionEntities';

const fixedNow = () => new Date('2026-04-15T12:00:00.000Z');

function candidate(overrides: Partial<ExtractedLibriEntity>): ExtractedLibriEntity {
	return {
		entity_type: 'person',
		display_name: 'James Clear',
		canonical_query: 'James Clear',
		confidence: 0.95,
		relevance: 'primary',
		recommended_action: 'resolve_or_enqueue',
		user_requested_research: true,
		extraction_reason: 'User asked about this entity.',
		source_message_ids: ['msg-1'],
		source_turn_indices: [0],
		evidence_snippets: ['James Clear'],
		...overrides
	};
}

function extraction(candidates: ExtractedLibriEntity[]): SessionExtractedEntities {
	return {
		libri_candidates: candidates,
		extraction_version: 'libri_session_synthesis_v1',
		extracted_at: '2026-04-15T11:59:00.000Z'
	};
}

describe('Libri entity handoff client', () => {
	it('returns not_configured without calling Libri when disabled', async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;
		const result = await handoffLibriSessionEntities(
			{
				sessionId: 'session-1',
				contextType: 'project',
				projectId: 'project-1',
				extractedEntities: extraction([candidate({})])
			},
			{
				env: {
					LIBRI_INTEGRATION_ENABLED: 'false',
					LIBRI_API_BASE_URL: 'https://libri.example',
					LIBRI_API_KEY: 'secret'
				},
				fetchFn,
				now: fixedNow
			}
		);

		expect(fetchFn).not.toHaveBeenCalled();
		expect(result).toEqual(
			expect.objectContaining({
				status: 'not_configured',
				attempted_at: '2026-04-15T12:00:00.000Z'
			})
		);
		expect(result?.results[0]).toEqual(
			expect.objectContaining({
				entity_type: 'person',
				canonical_query: 'James Clear',
				status: 'error'
			})
		);
	});

	it('posts only eligible candidates and stores compact per-entity statuses', async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						status: 'accepted',
						results: [
							{
								entityType: 'person',
								canonicalQuery: 'James Clear',
								status: 'found',
								resourceKey: 'person:james-clear',
								job: null,
								message: 'Existing Libri person matched.'
							},
							{
								entityType: 'book',
								canonicalQuery: 'Atomic Habits James Clear',
								status: 'queued',
								resourceKey: 'book:atomic-habits:james-clear',
								job: {
									jobId: 'job-book',
									kind: 'book.discovery',
									status: 'queued'
								},
								message: 'Queued.'
							},
							{
								entityType: 'youtube_video',
								canonicalQuery: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
								status: 'pending',
								resourceKey: 'youtube:dQw4w9WgXcQ',
								job: {
									jobId: 'job-video',
									status: 'processing'
								},
								message: 'Already pending.'
							},
							{
								entityType: 'youtube_channel',
								canonicalQuery: '@ambiguous',
								status: 'needs_input',
								resourceKey: null,
								job: null,
								message: 'Channel needs input.'
							},
							{
								entityType: 'person',
								canonicalQuery: 'Controlled Error',
								status: 'error',
								resourceKey: null,
								job: null,
								message: 'Controlled per-entity failure.'
							}
						]
					}),
					{
						status: 200,
						headers: { 'content-type': 'application/json' }
					}
				)
		) as unknown as typeof fetch;

		const result = await handoffLibriSessionEntities(
			{
				sessionId: 'session-1',
				contextType: 'project',
				projectId: 'project-1',
				extractedEntities: extraction([
					candidate({
						entity_type: 'person',
						display_name: 'James Clear',
						canonical_query: 'James Clear'
					}),
					candidate({
						entity_type: 'book',
						display_name: 'Atomic Habits',
						canonical_query: 'Atomic Habits James Clear',
						authors: ['James Clear']
					}),
					candidate({
						entity_type: 'youtube_video',
						display_name: 'YouTube video',
						canonical_query: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
						youtube_video_id: 'dQw4w9WgXcQ'
					}),
					candidate({
						entity_type: 'youtube_channel',
						display_name: 'Ambiguous Channel',
						canonical_query: '@ambiguous'
					}),
					candidate({
						entity_type: 'person',
						display_name: 'Controlled Error',
						canonical_query: 'Controlled Error'
					}),
					candidate({
						entity_type: 'book',
						display_name: 'Search Only',
						canonical_query: 'Search Only',
						recommended_action: 'search_only'
					}),
					candidate({
						entity_type: 'youtube_channel',
						display_name: 'Low Confidence Incidental',
						canonical_query: 'Low Confidence Incidental',
						relevance: 'incidental',
						confidence: 0.8
					})
				])
			},
			{
				env: {
					LIBRI_INTEGRATION_ENABLED: 'true',
					LIBRI_API_BASE_URL: 'https://libri.example/api/v1/',
					LIBRI_API_KEY: 'secret'
				},
				fetchFn,
				now: fixedNow
			}
		);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [url, request] = vi.mocked(fetchFn).mock.calls[0];
		expect(String(url)).toBe('https://libri.example/api/v1/entity-handoffs');
		expect(request?.headers).toEqual(
			expect.objectContaining({
				Authorization: 'Bearer secret',
				'Idempotency-Key': expect.stringMatching(
					/^buildos-session-entity-handoff:session-1:[a-f0-9]{32}$/
				)
			})
		);

		const body = JSON.parse(String(request?.body));
		expect(body.source).toEqual(
			expect.objectContaining({
				system: 'buildos',
				reason: 'session_close_synthesis',
				sessionId: 'session-1',
				contextType: 'project',
				projectId: 'project-1'
			})
		);
		expect(body.entities).toHaveLength(5);
		expect(body.entities[1]).toEqual(
			expect.objectContaining({
				entityType: 'book',
				canonicalQuery: 'Atomic Habits James Clear',
				authors: ['James Clear']
			})
		);
		expect(body.entities[2]).toEqual(
			expect.objectContaining({
				entityType: 'youtube_video',
				youtubeVideoId: 'dQw4w9WgXcQ'
			})
		);

		expect(result?.status).toBe('partial');
		expect(result?.results).toEqual([
			expect.objectContaining({ status: 'found', resource_key: 'person:james-clear' }),
			expect.objectContaining({ status: 'queued', job_id: 'job-book' }),
			expect.objectContaining({ status: 'pending', job_id: 'job-video' }),
			expect.objectContaining({ status: 'needs_input', resource_key: null }),
			expect.objectContaining({ status: 'error', message: 'Controlled per-entity failure.' })
		]);
	});

	it('uses the same idempotency key for the same session and entity set', () => {
		const first = [
			candidate({
				entity_type: 'book',
				canonical_query: 'Atomic Habits',
				authors: ['James Clear']
			}),
			candidate({ entity_type: 'person', canonical_query: 'James Clear' })
		];
		const second = [
			candidate({ entity_type: 'person', canonical_query: 'James Clear' }),
			candidate({
				entity_type: 'book',
				canonical_query: 'Atomic Habits',
				authors: ['James Clear']
			})
		];

		expect(buildLibriHandoffIdempotencyKey('session-1', first)).toBe(
			buildLibriHandoffIdempotencyKey('session-1', second)
		);
		expect(buildLibriHandoffIdempotencyKey('session-2', first)).not.toBe(
			buildLibriHandoffIdempotencyKey('session-1', first)
		);
	});
});
