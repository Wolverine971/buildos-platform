// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-history.test.ts
import { describe, expect, it } from 'vitest';
import {
	inspectPreparedHistorySnapshot,
	normalizePreparedHistoryForModel,
	normalizePreparedHistoryStrategy
} from './prepared-prompt-history';

describe('prepared-prompt-history', () => {
	it('preserves supported stored history messages and tool-call evidence', () => {
		expect(
			normalizePreparedHistoryForModel([
				{ role: 'system', content: 'System prompt' },
				{ role: 'user', content: 'Draft the update' },
				{
					role: 'assistant',
					content: 'Working on it',
					tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup' } }]
				},
				{ role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' }
			])
		).toEqual([
			{ role: 'system', content: 'System prompt' },
			{ role: 'user', content: 'Draft the update' },
			{
				role: 'assistant',
				content: 'Working on it',
				tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup' } }]
			},
			{ role: 'tool', content: '{"ok":true}', tool_call_id: 'call-1' }
		]);
	});

	it('preserves bounded prepared attachment references and derived text', () => {
		const attachment = {
			attachment_kind: 'onto_asset',
			media_type: 'image',
			asset_id: 'a1000000-0000-4000-8000-000000000001',
			temporary_attachment_id: null,
			project_id: 'a2000000-0000-4000-8000-000000000002',
			storage_bucket: 'onto-assets',
			storage_path: 'projects/a2000000-0000-4000-8000-000000000002/image.png',
			file_name: 'diagram.png',
			content_type: 'image/png',
			file_size_bytes: 1024,
			width: 640,
			height: 480,
			checksum_sha256: 'a'.repeat(64),
			ocr_status: 'complete',
			extraction_summary: null,
			extracted_text_preview: 'Visible OCR text',
			role: 'analysis_target',
			display_order: 0,
			expires_at: null
		};

		expect(
			inspectPreparedHistorySnapshot({
				historyForModel: [
					{
						role: 'user',
						content: 'Earlier request with context',
						attachments: [attachment]
					}
				],
				historyStrategy: 'raw_history',
				historyCompressed: false,
				rawHistoryCount: 1,
				historyForModelCount: 1
			})
		).toMatchObject({
			ok: true,
			history: [
				{
					attachments: [
						expect.objectContaining({
							asset_id: attachment.asset_id,
							checksum_sha256: attachment.checksum_sha256,
							extracted_text_preview: 'Visible OCR text'
						})
					]
				}
			]
		});
	});

	it.each([
		[[{ role: 'developer', content: 'Unsupported' }], 'invalid_message'],
		[[{ role: 'user', content: 42 }], 'invalid_message'],
		[[null], 'invalid_message'],
		[
			[{ role: 'user', content: 'Attached', attachments: [{ id: 'asset-1' }] }],
			'invalid_attachments'
		],
		[
			[{ role: 'assistant', content: 'Bad call', tool_calls: ['not-an-object'] }],
			'invalid_tool_calls'
		]
	] as const)('fails closed for malformed history %#', (history, code) => {
		expect(
			inspectPreparedHistorySnapshot({
				historyForModel: history,
				historyStrategy: 'raw_history',
				historyCompressed: false,
				rawHistoryCount: history.length,
				historyForModelCount: history.length
			})
		).toEqual({ ok: false, code });
	});

	it('returns exact immutable history strategy and count evidence', () => {
		expect(
			inspectPreparedHistorySnapshot({
				historyForModel: [{ role: 'assistant', content: 'Earlier answer' }],
				historyStrategy: 'compressed_history',
				historyCompressed: true,
				rawHistoryCount: 9,
				historyForModelCount: 1
			})
		).toEqual({
			ok: true,
			history: [{ role: 'assistant', content: 'Earlier answer' }],
			state: {
				strategy: 'compressed_history',
				compressed: true,
				rawHistoryCount: 9,
				historyForModelCount: 1
			}
		});
	});

	it('rejects inconsistent prepared history metadata', () => {
		expect(
			inspectPreparedHistorySnapshot({
				historyForModel: [],
				historyStrategy: 'compressed_history',
				historyCompressed: false,
				rawHistoryCount: 9,
				historyForModelCount: 0
			})
		).toEqual({ ok: false, code: 'invalid_counts' });
	});

	it('pins continuity-only semantics and the raw-history count boundary', () => {
		expect(
			inspectPreparedHistorySnapshot({
				historyForModel: [{ role: 'system', content: 'Continue from the prior turn.' }],
				historyStrategy: 'continuity_only',
				historyCompressed: false,
				rawHistoryCount: 0,
				historyForModelCount: 1
			})
		).toMatchObject({
			ok: true,
			state: { strategy: 'continuity_only', rawHistoryCount: 0, historyForModelCount: 1 }
		});
		expect(
			inspectPreparedHistorySnapshot({
				historyForModel: [],
				historyStrategy: 'raw_history',
				historyCompressed: false,
				rawHistoryCount: 50,
				historyForModelCount: 0
			})
		).toMatchObject({ ok: true });
		expect(
			inspectPreparedHistorySnapshot({
				historyForModel: [],
				historyStrategy: 'raw_history',
				historyCompressed: false,
				rawHistoryCount: 51,
				historyForModelCount: 0
			})
		).toEqual({ ok: false, code: 'invalid_counts' });
	});

	it('falls back to raw_history for unknown history strategies', () => {
		expect(normalizePreparedHistoryStrategy('compressed_history')).toBe('compressed_history');
		expect(normalizePreparedHistoryStrategy('not-a-real-strategy')).toBe('raw_history');
		expect(normalizePreparedHistoryStrategy(null)).toBe('raw_history');
	});
});
