// apps/web/src/lib/server/admin-chat-media-analytics.test.ts
import { describe, expect, it } from 'vitest';
import { buildChatMediaUsageAnalytics } from './admin-chat-media-analytics';

describe('buildChatMediaUsageAnalytics', () => {
	it('summarizes media events, storage, and top projects', () => {
		const analytics = buildChatMediaUsageAnalytics({
			startIso: '2026-05-15T00:00:00.000Z',
			endIso: '2026-05-16T00:00:00.000Z',
			timeframe: '24h',
			projects: [
				{ id: 'project-1', name: 'Launch' },
				{ id: 'project-2', name: 'Ops' }
			],
			events: [
				{
					id: 'event-1',
					project_id: 'project-1',
					asset_id: 'asset-1',
					source: 'agent_chat_ui',
					event_type: 'upload_requested',
					media_type: 'image',
					content_type: 'image/png',
					file_size_bytes: 4000,
					checksum_sha256: 'a'.repeat(64),
					created_at: '2026-05-15T12:00:00.000Z'
				},
				{
					id: 'event-2',
					project_id: 'project-1',
					asset_id: 'asset-1',
					source: 'agent_chat_ui',
					event_type: 'upload_deduped',
					media_type: 'image',
					content_type: 'image/png',
					file_size_bytes: 4000,
					checksum_sha256: 'b'.repeat(64),
					created_at: '2026-05-15T12:10:00.000Z'
				},
				{
					id: 'event-3',
					project_id: 'project-1',
					asset_id: 'asset-1',
					source: 'agent_chat_ui',
					event_type: 'live_vision_requested',
					media_type: 'image',
					content_type: 'image/png',
					file_size_bytes: 4000,
					created_at: '2026-05-15T12:20:00.000Z'
				},
				{
					id: 'event-4',
					project_id: 'project-2',
					asset_id: 'asset-2',
					source: 'agent_chat_ui',
					event_type: 'live_vision_failed',
					media_type: 'image',
					content_type: 'image/jpeg',
					file_size_bytes: 9000,
					created_at: '2026-05-15T12:30:00.000Z'
				},
				{
					id: 'event-5',
					project_id: 'project-2',
					asset_id: 'asset-2',
					source: 'agent_chat_ui',
					event_type: 'ocr_failed',
					media_type: 'image',
					content_type: 'image/jpeg',
					file_size_bytes: 9000,
					created_at: '2026-05-15T12:40:00.000Z'
				}
			],
			assets: [
				{
					id: 'asset-1',
					project_id: 'project-1',
					kind: 'image',
					file_size_bytes: 4000,
					ocr_status: 'complete'
				},
				{
					id: 'asset-2',
					project_id: 'project-2',
					kind: 'image',
					file_size_bytes: 9000,
					ocr_status: 'failed'
				}
			]
		});

		expect(analytics.kpis).toMatchObject({
			totalEvents: 5,
			uploadRequests: 1,
			uploadDedupes: 1,
			duplicateAttemptRate: 50,
			uploadedBytes: 4000,
			ocrFailed: 1,
			liveVisionRequests: 1,
			liveVisionFailures: 1,
			liveVisionFailureRate: 50,
			currentImageAssets: 2,
			currentImageStorageBytes: 13_000,
			averageImageBytes: 6500
		});
		expect(analytics.by_event_type[0]).toEqual({
			event_type: 'upload_requested',
			count: 1,
			bytes: 4000
		});
		expect(analytics.top_projects[0]).toMatchObject({
			project_id: 'project-2',
			project_name: 'Ops',
			current_storage_bytes: 9000,
			live_vision_failures: 1
		});
		expect(analytics.recent_events[0]).toMatchObject({
			id: 'event-5',
			project_name: 'Ops',
			event_type: 'ocr_failed'
		});
		expect(analytics.recent_events.find((event) => event.id === 'event-1')).toMatchObject({
			checksum_sha256_suffix: 'aaaaaaaa'
		});
	});
});
