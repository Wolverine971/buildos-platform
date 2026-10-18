// scripts/agentic/llm-incidents-render.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	assembleStream,
	longestSilence,
	renderIncident,
	renderIncidentList,
	throughputBars
} from './llm-incidents-render';

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

test('finds the longest stretch without bytes', () => {
	assert.deepEqual(
		longestSilence(
			[
				[800, 100],
				[1_000, 300],
				[9_200, 400]
			],
			9_500
		),
		{ fromMs: 1_000, toMs: 9_200 }
	);
});

test('draws bytes per second', () => {
	const bars = throughputBars([
		[100, 1_000],
		[2_100, 1_500]
	]);
	assert.equal(bars.length, 3);
	assert.match(bars[0]!, /1000 B/);
	assert.match(bars[1]!, / 0 B/);
});

test('reassembles reasoning, text and tool calls', () => {
	const raw =
		frame({ choices: [{ delta: { reasoning: 'Let me ' } }] }) +
		frame({ choices: [{ delta: { reasoning: 'check.' } }] }) +
		frame({
			choices: [
				{
					delta: {
						tool_calls: [
							{ index: 0, function: { name: 'get_project', arguments: '{"id":' } }
						]
					}
				}
			]
		}) +
		frame({
			choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"p1"}' } }] } }]
		}) +
		'data: [DONE]\n\n';
	assert.deepEqual(assembleStream(raw), {
		reasoning: 'Let me check.',
		content: '',
		toolCalls: [{ name: 'get_project', arguments: '{"id":"p1"}' }],
		errors: []
	});
});

test('renders a drained stall end to end', () => {
	const page = renderIncident({
		id: 'i-1',
		created_at: '2026-10-18T15:00:00Z',
		lane: 'agentic_chat_worker_stream',
		kind: 'stall',
		reason: 'hedge_slow_stream',
		pass_role: 'acting',
		logical_provider_round: 2,
		provider_attempt: 1,
		model_requested: 'deepseek/deepseek-v4.1-flash',
		model_used: 'deepseek/deepseek-v4.1-flash',
		provider: 'Together',
		http_status: 200,
		duration_ms: 4_100,
		request_body: JSON.stringify({
			model: 'deepseek/deepseek-v4.1-flash',
			messages: [
				{ role: 'system', content: 'You are BuildOS.' },
				{ role: 'user', content: 'Does everything look good?' }
			],
			tools: [{ type: 'function', function: { name: 'get_project' } }],
			provider: { sort: 'throughput' }
		}),
		request_headers: { Authorization: '[redacted]' },
		response_headers: { 'content-type': 'text/event-stream' },
		response_body: frame({ choices: [{ delta: { content: 'Looks good.' } }] }),
		timeline: {
			events: [
				{ at_ms: 0, event: 'request_sent' },
				{ at_ms: 900, event: 'first_byte' },
				{ at_ms: 2_900, event: 'stall', reason: 'hedge_slow_stream' },
				{ at_ms: 4_100, event: 'attempt_ended', status: 'aborted' }
			],
			bytes: [[900, 120]]
		},
		outcome: { receipt: { status: 'aborted', error_class: 'hedge_lost' }, request_bytes: 300 },
		eventual: {
			ended_by: 'stream_end',
			completed: true,
			total_ms: 31_000,
			finish_reason: 'stop',
			bytes: 9_000
		},
		generation_stats: {
			provider_name: 'Together',
			latency: 880,
			generation_time: 30_100,
			cancelled: false
		}
	});
	assert.ok(
		page.includes('# Model-call incident: The reply stalled, so a backup request started'),
		'headline'
	);
	assert.ok(page.includes('Chat · main step'), 'source');
	assert.ok(
		page.includes('Longest silence: 3.2 s (from 0.9 s to 4.1 s)'),
		'Longest silence: 3.2 s (from 0.9 s to 4.1 s)'
	);
	assert.ok(page.includes('finished on its own 31 s after it was sent'), 'eventual');
	assert.ok(page.includes('first token after 0.9 s, generation time 30 s'), 'stats');
	assert.ok(page.includes('slow, not broken'), 'finding');
	assert.ok(page.includes('PAID, ask DJ first'), 'paid replay note');
	assert.ok(page.includes('Looks good.'), 'Looks good.');
	assert.ok(page.includes('#### 2. user'), '#### 2. user');
	assert.ok(page.includes('Does everything look good?'), 'Does everything look good?');
	assert.ok(page.includes('- get_project'), '- get_project');
	assert.equal(renderIncidentList([]), 'No incidents in this window.');
});
