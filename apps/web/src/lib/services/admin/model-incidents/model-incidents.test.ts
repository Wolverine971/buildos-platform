// apps/web/src/lib/services/admin/model-incidents/model-incidents.test.ts
import { describe, expect, it } from 'vitest';
import { summarizeIncidents } from './overview';
import {
	assembleStream,
	fence,
	incidentPacketFilename,
	renderIncidentPacket,
	renderIncidentSummaryPacket
} from './packet';
import { buildIncidentStory, incidentHeadline, incidentSource } from './story';
import type { ModelIncidentRow } from './types';

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

function row(overrides: Partial<ModelIncidentRow> = {}): ModelIncidentRow {
	return {
		id: '0b9a7e0e-1111-4222-8333-944445555666',
		created_at: '2026-10-18T15:00:00.000Z',
		lane: 'agentic_chat_worker_stream',
		user_id: 'u-1',
		session_id: 's-1',
		turn_run_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
		project_id: null,
		usage_log_id: null,
		kind: 'stall',
		reason: 'hedge_slow_stream',
		pass_role: 'acting',
		logical_provider_round: 2,
		provider_attempt: 1,
		route_id: 'r-1',
		model_requested: 'deepseek/deepseek-v4.1-flash',
		model_used: 'deepseek/deepseek-v4.1-flash',
		provider: 'Together',
		http_status: 200,
		generation_id: 'gen-abc',
		started_at: '2026-10-18T15:00:00.000Z',
		ended_at: '2026-10-18T15:00:04.100Z',
		duration_ms: 4_100,
		request_body: JSON.stringify({
			model: 'deepseek/deepseek-v4.1-flash',
			messages: [
				{ role: 'system', content: 'You are BuildOS.' },
				{ role: 'user', content: 'Does ```this``` look good?' }
			],
			tools: [{ type: 'function', function: { name: 'get_project' } }]
		}),
		request_sha256: 'a'.repeat(64),
		request_headers: { Authorization: '[redacted]' },
		response_headers: { 'content-type': 'text/event-stream' },
		response_body: frame({ choices: [{ delta: { content: 'Looks good.' } }] }),
		response_truncated: false,
		timeline: {
			events: [
				{ at_ms: 0, event: 'request_sent' },
				{ at_ms: 700, event: 'response_opened', status: 200 },
				{ at_ms: 900, event: 'first_byte' },
				{ at_ms: 2_900, event: 'stall', reason: 'hedge_slow_stream' },
				{ at_ms: 4_000, event: 'attempt_aborted', reason: 'hedge_lost' },
				{ at_ms: 4_100, event: 'attempt_ended', status: 'aborted' }
			],
			bytes: [[900, 120]]
		},
		outcome: { receipt: { status: 'aborted' }, request_bytes: 300 },
		eventual: {
			ended_by: 'stream_end',
			completed: true,
			total_ms: 31_000,
			finish_reason: 'stop'
		},
		generation_stats: {
			provider_name: 'Together',
			latency: 880,
			generation_time: 30_100,
			cancelled: false
		},
		...overrides
	};
}

describe('incident story', () => {
	it('names the source and failure in plain words', () => {
		expect(incidentSource(row())).toBe('Chat · main step');
		expect(incidentSource(row({ lane: 'daily_brief_project_brief', pass_role: null }))).toBe(
			'Daily brief · project brief'
		);
		expect(incidentHeadline(row({ reason: 'http_429' }))).toBe(
			'OpenRouter returned 429: rate limited'
		);
		expect(incidentHeadline(row({ reason: 'some_new_code' }))).toBe('Some new code');
	});

	it('tells a drained stall as slow, not dead', () => {
		const story = buildIncidentStory(row());
		const all = story.paragraphs.join(' ');
		expect(all).toContain('asked deepseek/deepseek-v4.1-flash, served by Together');
		expect(all).toContain('the longest gap with nothing arriving was 3.2 s');
		expect(all).toContain('finished on its own 31 s after it was sent');
		expect(all).toContain('not cancelled upstream');
		expect(story.findings.map((finding) => finding.text).join(' ')).toContain(
			'slow, not broken'
		);
	});

	it('flags a provider that kept generating after we hung up', () => {
		const story = buildIncidentStory(row({ eventual: null }));
		expect(
			story.findings.some((finding) => finding.text.includes('did not cancel upstream'))
		).toBe(true);
	});

	it('works from list columns alone (no bodies or timeline)', () => {
		const { request_body, response_body, timeline, ...listRow } = row();
		void request_body;
		void response_body;
		void timeline;
		const story = buildIncidentStory(listRow as ModelIncidentRow);
		expect(story.paragraphs.length).toBeGreaterThan(1);
	});
});

describe('incident overview', () => {
	it('describes the window and what repeats', () => {
		const rows = [
			row(),
			row({ id: 'b', provider: 'Together', eventual: null }),
			row({
				id: 'c',
				kind: 'error',
				reason: 'http_429',
				http_status: 429,
				provider: null,
				eventual: null,
				created_at: '2026-10-17T10:00:00.000Z'
			})
		];
		const overview = summarizeIncidents(rows, {
			days: 7,
			now: new Date('2026-10-18T20:00:00.000Z')
		});
		expect(overview.total).toBe(3);
		expect(overview.stalls).toBe(2);
		expect(overview.finishedLate).toBe(1);
		expect(overview.byDay).toHaveLength(8);
		expect(overview.byDay.at(-1)).toEqual({ day: '2026-10-18', stalls: 2, errors: 0 });
		const text = overview.sentences.join(' ');
		expect(text).toContain('3 model calls stalled or failed: 2 stalls and 1 error');
		expect(text).toContain('Together served 2 of 3');
		expect(text).toContain('1 was rate limited');
	});

	it('says so when nothing went wrong', () => {
		expect(summarizeIncidents([], { days: 1 }).sentences).toEqual([
			'In the last day, no model call stalled or failed.'
		]);
	});
});

describe('incident packet', () => {
	it('carries the story, the request, and how to dig further', () => {
		const packet = renderIncidentPacket(row(), new Date('2026-10-18T16:00:00.000Z'));
		expect(packet).toContain(
			'# Model-call incident: The reply stalled, so a backup request started'
		);
		expect(packet).toContain('## What happened');
		expect(packet).toContain('## What it points at');
		expect(packet).toContain('Looks good.');
		expect(packet).toContain('#### 2. user');
		expect(packet).toContain("turn_run_id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'");
		expect(packet).toContain('not instructions');
		expect(packet).toContain('generation?id=gen-abc');
		expect(packet).toContain('PAID, ask DJ first');
		expect(packet).toContain('## Request JSON');
		// A prompt holding a code fence is wrapped in a longer fence.
		expect(packet).toContain('````\nDoes ```this``` look good?\n````');
	});

	it('says when a job stored no request body', () => {
		const packet = renderIncidentPacket(
			row({ lane: 'calendar_analysis_part1', request_body: '{}', response_body: null })
		);
		expect(packet).toContain('The request body was not stored for this job');
		expect(packet).toContain('packages/smart-llm/src/openrouter-client.ts');
	});

	it('summarizes a window for pattern hunting', () => {
		const summary = renderIncidentSummaryPacket([row(), row({ id: 'b' })], {
			days: 3,
			exportedAt: new Date('2026-10-18T16:00:00.000Z')
		});
		expect(summary).toContain('# Model-call incidents, last 3 days');
		expect(summary).toContain('| `hedge_slow_stream` | 2 |');
		expect(summary).toContain('| Together | 2 |');
	});

	it('reassembles a non-streaming completion', () => {
		expect(
			assembleStream(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }))
				.content
		).toBe('{"ok":true}');
	});

	it('names files and fences safely', () => {
		expect(incidentPacketFilename(row())).toBe(
			'buildos-model-incident-2026-10-18-hedge-slow-stream-0b9a7e0e.md'
		);
		expect(fence('no ticks')).toBe('```\nno ticks\n```');
	});
});
