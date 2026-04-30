// apps/web/src/lib/services/agentic-chat/tools/libri/manifest.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { materializeGatewayTools } from '../core/gateway-surface';
import {
	executeDynamicLibriTool,
	libriSearchCapabilities,
	resetLibriManifestCache
} from './manifest';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json'
		}
	});
}

function configuredEnv() {
	return {
		LIBRI_INTEGRATION_ENABLED: 'true',
		LIBRI_API_BASE_URL: 'https://libri.example',
		LIBRI_API_KEY: 'libri-secret-key'
	};
}

function youtubeManifest() {
	return {
		version: 'v1',
		manifestVersion: 'libri-capabilities/test',
		generatedAt: '2026-04-30T12:00:00.000Z',
		domains: {
			youtube_videos: {
				label: 'YouTube Videos',
				description: 'Video records, transcripts, analysis, ingestion jobs, and imports.',
				resources: {
					'video.import': {
						description: 'Upload or queue YouTube video ingestion.'
					}
				},
				sequences: {
					youtube_video_import: {
						steps: [
							{ op: 'libri.video.import.preview' },
							{
								op: 'libri.video.import.create',
								requiresPreviousSuccess: 'libri.video.import.preview'
							}
						]
					}
				},
				operations: [
					{
						op: 'libri.video.import.preview',
						toolName: 'libri_video_import_preview',
						domain: 'youtube_videos',
						resource: 'video.import',
						kind: 'write',
						method: 'POST',
						path: '/api/v1/ingestion/videos/preview',
						description:
							'Validate a YouTube transcript and analysis payload before queueing ingestion.',
						requiredScopes: ['queue:ingestion'],
						requiresIdempotencyKey: false,
						inputSchema: {
							type: 'object',
							additionalProperties: false,
							properties: {
								url: { type: 'string' },
								youtubeVideoId: { type: 'string' },
								videoTitle: { type: 'string' },
								channelTitle: { type: 'string' },
								youtubeChannelId: { type: 'string' },
								transcriptText: { type: 'string' },
								rawDetailsText: { type: 'string' },
								previewOnly: { type: 'boolean' },
								analysis: { type: 'object', additionalProperties: true },
								project_id: { type: 'string' }
							},
							required: ['transcriptText']
						},
						safety: {
							modelVisible: true,
							adminOnly: false,
							allowDirectToolMaterialization: true,
							allowGenericBridgeExecution: false
						}
					},
					{
						op: 'libri.video.import.create',
						toolName: 'libri_video_import_create',
						domain: 'youtube_videos',
						resource: 'video.import',
						kind: 'write',
						method: 'POST',
						path: '/api/v1/ingestion/videos',
						description:
							'Queue a YouTube transcript and analysis import after preview validation.',
						requiredScopes: ['queue:ingestion'],
						requiresIdempotencyKey: true,
						idempotency: {
							header: 'Idempotency-Key',
							recommendedKeyFields: ['url', 'youtubeVideoId', 'transcriptText']
						},
						inputSchema: {
							type: 'object',
							additionalProperties: false,
							properties: {
								url: { type: 'string' },
								youtubeVideoId: { type: 'string' },
								videoTitle: { type: 'string' },
								channelTitle: { type: 'string' },
								youtubeChannelId: { type: 'string' },
								transcriptText: { type: 'string' },
								rawDetailsText: { type: 'string' },
								createImport: { type: 'boolean' },
								analysis: { type: 'object', additionalProperties: true },
								project_id: { type: 'string' }
							},
							required: ['transcriptText']
						},
						safety: {
							modelVisible: true,
							adminOnly: false,
							allowDirectToolMaterialization: true,
							allowGenericBridgeExecution: false
						}
					},
					{
						op: 'libri.auth.token_exchange',
						toolName: 'libri_auth_token_exchange',
						domain: 'youtube_videos',
						resource: 'auth',
						kind: 'write',
						method: 'POST',
						path: '/api/v1/auth/token-exchange',
						description: 'Exchange a grant token.',
						requiredScopes: ['tokens:exchange'],
						inputSchema: {
							type: 'object',
							properties: {
								token: { type: 'string' }
							},
							required: ['token']
						},
						safety: {
							modelVisible: true,
							adminOnly: false,
							allowDirectToolMaterialization: true
						}
					}
				]
			}
		}
	};
}

afterEach(() => {
	resetLibriManifestCache();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('Libri dynamic manifest bridge', () => {
	it('searches a domain manifest and materializes direct Libri tools', async () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const fetchFn = vi.fn(async () => jsonResponse(youtubeManifest())) as unknown as typeof fetch;

		const result = await libriSearchCapabilities(
			{
				domain: 'youtube_videos',
				query: 'upload transcript analysis',
				kind: 'write'
			},
			{
				fetchFn,
				env: configuredEnv(),
				now: () => new Date('2026-04-30T12:00:00.000Z')
			}
		);

		expect(result.status).toBe('ok');
		expect(result.materialized_tools).toEqual([
			'libri_video_import_preview',
			'libri_video_import_create'
		]);
		expect(JSON.stringify(result)).not.toContain('libri_auth_token_exchange');

		const materialized = materializeGatewayTools([], result.materialized_tools as string[]);
		expect(materialized.addedToolNames).toEqual([
			'libri_video_import_preview',
			'libri_video_import_create'
		]);
		const previewTool = materialized.tools.find(
			(tool) => tool.function?.name === 'libri_video_import_preview'
		);
		expect(previewTool?.function?.parameters.properties.youtubeVideoId).toBeDefined();
		expect(previewTool?.function?.parameters.properties.youtube_video_id).toBeUndefined();
	});

	it('validates YouTube import args before calling Libri', async () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const fetchFn = vi.fn(async () => jsonResponse(youtubeManifest())) as unknown as typeof fetch;
		await libriSearchCapabilities(
			{ domain: 'youtube_videos', query: 'upload transcript', kind: 'write' },
			{ fetchFn, env: configuredEnv() }
		);

		const result = await executeDynamicLibriTool(
			'libri_video_import_preview',
			{ transcriptText: 'Transcript only' },
			{ fetchFn, env: configuredEnv() }
		);

		expect(result.status).toBe('validation_error');
		expect(JSON.stringify(result)).toContain('either url or youtubeVideoId');
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('executes direct create tools with camelCase args and an idempotency key', async () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(youtubeManifest()))
			.mockResolvedValueOnce(
				jsonResponse({
					job: {
						id: 'job-1',
						status: 'queued'
					}
				})
			) as unknown as typeof fetch;

		await libriSearchCapabilities(
			{ domain: 'youtube_videos', query: 'upload transcript', kind: 'write' },
			{ fetchFn, env: configuredEnv() }
		);

		const result = await executeDynamicLibriTool(
			'libri_video_import_create',
			{
				youtubeVideoId: 'abc123',
				transcriptText: 'Transcript text',
				createImport: true
			},
			{ fetchFn, env: configuredEnv() }
		);

		expect(result.status).toBe('ok');
		expect(fetchFn).toHaveBeenCalledTimes(2);
		const [url, init] = vi.mocked(fetchFn).mock.calls[1];
		expect(url).toBe('https://libri.example/api/v1/ingestion/videos');
		expect(init?.method).toBe('POST');
		const headers = init?.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer libri-secret-key');
		expect(headers['Idempotency-Key']).toMatch(
			/^buildos-libri_video_import_create-[a-f0-9]{32}$/
		);
		expect(JSON.parse(String(init?.body))).toEqual({
			youtubeVideoId: 'abc123',
			transcriptText: 'Transcript text',
			createImport: true
		});
	});
});
