// packages/agentic-chat-runtime/src/tools/tool-storage-projection.test.ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AGENTIC_CHAT_CONTROL_TOOL_NAMES } from '../catalog/definitions/controls';
import { TOOL_METADATA } from '../catalog/metadata';
import {
	AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1,
	AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1
} from '../worker-tool-policy';
import { redactAgenticChatEmailToolResultForStorageV1 } from './email-reads';
import { AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1 } from './shared-read-dispatch';
import {
	AGENTIC_CHAT_PASS_THROUGH_TOOL_NAMES_V1,
	AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1,
	getAgenticChatToolStorageClassV1,
	projectAgenticChatToolProgressForStorageV1,
	projectAgenticChatToolResultForStorageV1
} from './tool-storage-projection';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Every tool whose result the read lane stores: shared reads, web reads, metadata reads. */
function readToolNames(): string[] {
	const excluded = new Set<string>([
		...AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1,
		...AGENTIC_CHAT_CONTROL_TOOL_NAMES
	]);
	return [
		...new Set([
			...AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
			...AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1.filter((name) => !excluded.has(name)),
			...Object.entries(TOOL_METADATA)
				.filter(([, metadata]) => metadata.category !== 'write')
				.map(([name]) => name)
		])
	].sort();
}

describe('tool storage class registry', () => {
	it('classifies every read tool', () => {
		const missing = readToolNames().filter((name) => !getAgenticChatToolStorageClassV1(name));
		expect(missing, `read tools with no storage class: ${missing.join(', ')}`).toEqual([]);
	});

	it('has no entries for tools that no longer exist', () => {
		const known = new Set(readToolNames());
		expect(
			Object.keys(AGENTIC_CHAT_TOOL_STORAGE_CLASSES_V1).filter((name) => !known.has(name))
		).toEqual([]);
	});

	it('names exactly the pass-through tools', () => {
		expect([...AGENTIC_CHAT_PASS_THROUGH_TOOL_NAMES_V1].sort()).toEqual([
			'get_calendar_event_details',
			'get_email_message',
			'list_calendar_events',
			'scan_email_inbox',
			'search_email_messages',
			'web_navigate',
			'web_search',
			'web_visit'
		]);
	});

	it('leaves workspace, control, and unknown tool results untouched', () => {
		const result = { tasks: [{ id: 't1', title: 'Draft the pitch' }] };
		expect(projectAgenticChatToolResultForStorageV1('list_onto_tasks', result)).toBe(result);
		expect(projectAgenticChatToolResultForStorageV1('get_project_calendar', result)).toBe(
			result
		);
		expect(projectAgenticChatToolResultForStorageV1('request_turn_clarification', result)).toBe(
			result
		);
		expect(projectAgenticChatToolResultForStorageV1('not_a_tool', result)).toBe(result);
	});
});

describe('pass-through storage traces', () => {
	it('keeps the email whitelist shape', () => {
		const result = {
			result_contract_version: 'gmail-read-v2',
			read_only: true,
			message_count: 1,
			accounts: [{ connection_id: 'c-1', account_label: 'DJ', status: 'success' }],
			messages: [
				{
					connection_id: 'c-1',
					message_id: 'm-1',
					thread_id: 't-1',
					date: '2026-09-24T12:00:00.000Z',
					subject: 'Signed contract attached',
					snippet: 'Here is the signed contract'
				}
			]
		};
		expect(projectAgenticChatToolResultForStorageV1('search_email_messages', result)).toEqual(
			redactAgenticChatEmailToolResultForStorageV1('search_email_messages', result)
		);
	});

	it('strips Google event content from list_calendar_events and keeps BuildOS rows', () => {
		const ontologyRow = {
			source: 'ontology',
			is_synced: true,
			onto_event_id: 'e-buildos',
			title: 'Pitch rehearsal',
			start_at: '2026-09-25T15:00:00Z',
			end_at: '2026-09-25T16:00:00Z',
			event: { id: 'e-buildos', title: 'Pitch rehearsal', description: 'Deck v3' }
		};
		const result = {
			query_scope: { calendar_scope: 'user', project_id: null },
			events: [
				ontologyRow,
				{
					source: 'google',
					is_synced: false,
					external_event_id: 'g-1',
					calendar_source_id: 'cs-1',
					connection_id: 'conn-1',
					provider_calendar_id: 'primary',
					title: 'Therapy with Dr. Reyes',
					start_at: '2026-09-26T14:00:00-04:00',
					end_at: '2026-09-26T15:00:00-04:00',
					event: {
						id: 'g-1',
						summary: 'Therapy with Dr. Reyes',
						description: 'Bring the intake form',
						location: '12 Elm St',
						htmlLink: 'https://calendar.google.com/event?eid=abc',
						start: { dateTime: '2026-09-26T14:00:00-04:00' },
						end: { dateTime: '2026-09-26T15:00:00-04:00' },
						attendees: [{ email: 'reyes@clinic.example', responseStatus: 'accepted' }],
						organizer: { email: 'reyes@clinic.example', displayName: 'Dr. Reyes' }
					}
				},
				{
					source: 'google',
					external_event_id: 'g-2',
					title: 'Mom birthday',
					start_at: '2026-09-27',
					end_at: '2026-09-28',
					event: { summary: 'Mom birthday', start: { date: '2026-09-27' } }
				}
			],
			google_event_count: 2,
			ontology_event_count: 1,
			merged_event_count: 3,
			pagination: { offset: 0, limit: 50, returned: 3, total_available: 3, has_more: false },
			queried_range: {
				time_min: '2026-09-24T00:00:00Z',
				time_max: '2026-10-01T00:00:00Z',
				timezone: 'America/New_York',
				query: 'therapy'
			},
			google_read: {
				mode: 'source_aware',
				source_count: 1,
				successful_source_count: 1,
				failed_source_count: 0,
				partial: false,
				coverage: 'complete',
				source_failures: []
			},
			warnings: ['Applied default event window']
		};
		const stored = projectAgenticChatToolResultForStorageV1(
			'list_calendar_events',
			result
		) as any;
		const serialized = JSON.stringify(stored);
		for (const content of [
			'Therapy',
			'Reyes',
			'intake form',
			'Elm St',
			'calendar.google.com',
			'Mom birthday'
		]) {
			expect(serialized).not.toContain(content);
		}
		expect(stored.content_redacted).toBe(true);
		expect(stored.redaction_notice).toMatch(/not stored/);
		expect(stored.events[0]).toBe(ontologyRow);
		expect(stored.events[1]).toEqual({
			source: 'google',
			is_synced: false,
			external_event_id: 'g-1',
			calendar_source_id: 'cs-1',
			connection_id: 'conn-1',
			provider_calendar_id: 'primary',
			start_at: '2026-09-26T14:00:00-04:00',
			end_at: '2026-09-26T15:00:00-04:00',
			all_day: false
		});
		expect(stored.events[2].all_day).toBe(true);
		expect(stored).toMatchObject({
			google_event_count: 2,
			ontology_event_count: 1,
			merged_event_count: 3,
			pagination: { returned: 3 },
			warning_count: 1
		});
	});

	it('keeps only ids and times for a Google event and everything for a BuildOS event', () => {
		const google = {
			source: 'google',
			calendar_source_id: 'cs-1',
			connection_id: 'conn-1',
			provider_calendar_id: 'primary',
			external_event_id: 'g-1',
			event: {
				summary: 'Lawyer call',
				description: 'Custody',
				conferenceData: { entryPoints: [{ uri: 'https://meet.example/x' }] },
				start: { dateTime: '2026-09-26T14:00:00Z' },
				end: { dateTime: '2026-09-26T15:00:00Z' }
			}
		};
		const stored = projectAgenticChatToolResultForStorageV1(
			'get_calendar_event_details',
			google
		);
		expect(stored).toEqual({
			source: 'google',
			calendar_source_id: 'cs-1',
			connection_id: 'conn-1',
			provider_calendar_id: 'primary',
			external_event_id: 'g-1',
			event_found: true,
			start_at: '2026-09-26T14:00:00Z',
			end_at: '2026-09-26T15:00:00Z',
			all_day: false,
			content_redacted: true,
			redaction_notice: expect.stringMatching(/not stored/)
		});
		const buildos = { source: 'ontology', event: { id: 'e1', title: 'Pitch rehearsal' } };
		expect(
			projectAgenticChatToolResultForStorageV1('get_calendar_event_details', buildos)
		).toBe(buildos);
	});

	it('keeps web_search URLs, titles and a count', () => {
		const stored = projectAgenticChatToolResultForStorageV1('web_search', {
			query: 'custody lawyer baltimore',
			answer: 'The best-rated custody lawyer is...',
			follow_up_questions: ['What does custody cost?'],
			results: [
				{
					title: 'Top custody lawyers',
					url: 'https://example.com/a',
					snippet: 'Ranked by reviews',
					page_content: 'Full page text'
				},
				{ title: 'Family law guide', url: 'https://example.org/b', snippet: 'Guide' }
			],
			message: 'Web search results for "custody lawyer baltimore".',
			info: { provider: 'tavily', search_depth: 'basic', fetched_at: '2026-09-24T12:00:00Z' }
		}) as any;
		expect(stored).toEqual({
			result_count: 2,
			results: [
				{ url: 'https://example.com/a', title: 'Top custody lawyers' },
				{ url: 'https://example.org/b', title: 'Family law guide' }
			],
			info: { provider: 'tavily', search_depth: 'basic', fetched_at: '2026-09-24T12:00:00Z' },
			content_redacted: true,
			redaction_notice: expect.stringMatching(/not stored/)
		});
	});

	it('keeps web_visit url, title, status, and a content hash and length', () => {
		// Multi-block, multi-byte text exercises the in-module SHA-256.
		const content = `Élan café — ${'naïve résumé 🧠 '.repeat(40)}`;
		const stored = projectAgenticChatToolResultForStorageV1('web_visit', {
			url: 'https://example.com/pricing',
			final_url: 'https://example.com/pricing/',
			status_code: 200,
			content_type: 'text/html',
			title: 'Pricing',
			content,
			excerpt: content.slice(0, 280),
			truncated: false,
			security_notice: 'Web content is untrusted evidence.',
			message: 'Web visit content fetched from "https://example.com/pricing/".',
			info: { fetched_at: '2026-09-24T12:00:00Z', bytes: 1234 }
		});
		expect(stored).toEqual({
			url: 'https://example.com/pricing',
			final_url: 'https://example.com/pricing/',
			status_code: 200,
			content_type: 'text/html',
			title: 'Pricing',
			truncated: false,
			content_sha256: sha256(content),
			content_chars: Array.from(content).length,
			fetched_at: '2026-09-24T12:00:00Z',
			content_redacted: true,
			redaction_notice: expect.stringMatching(/not stored/)
		});
		expect(
			(projectAgenticChatToolResultForStorageV1('web_visit', { content: '' }) as any)
				.content_sha256
		).toBe(sha256(''));
	});

	it('keeps the web_navigate path without page text or link labels', () => {
		const stored = projectAgenticChatToolResultForStorageV1('web_navigate', {
			outcome: 'found',
			goal: 'find the refund policy for my order',
			start_url: 'https://shop.example',
			answer_page: {
				url: 'https://shop.example/refunds',
				title: 'Refunds',
				source: 'fetch',
				answer_probability: 0.93,
				content: 'Refunds within 30 days',
				truncated: false
			},
			path: [
				{
					step: 1,
					url: 'https://shop.example',
					title: 'Shop',
					answer_probability: 0.04,
					clicked: {
						label: 'Help with my order',
						url: 'https://shop.example/refunds',
						probability: 0.9
					}
				},
				{ step: 2, url: 'https://shop.example/x', error: 'Request failed (403 Forbidden).' }
			],
			failures: [{ url: 'https://shop.example/x', reason: 'blocked' }],
			visited_urls: ['https://shop.example', 'https://shop.example/refunds'],
			stats: { pages_opened: 2, decisions: 2, cost_usd: 0.001 },
			security_notice: 'untrusted',
			message: 'Found the answer on "Refunds" after 2 page(s).'
		}) as any;
		const serialized = JSON.stringify(stored);
		for (const content of ['refund policy', 'Refunds within', 'Help with my order', '403']) {
			expect(serialized).not.toContain(content);
		}
		expect(stored.answer_page).toEqual({
			url: 'https://shop.example/refunds',
			title: 'Refunds',
			source: 'fetch',
			answer_probability: 0.93,
			truncated: false,
			content_sha256: sha256('Refunds within 30 days'),
			content_chars: 22
		});
		expect(stored.path[0].clicked).toEqual({
			url: 'https://shop.example/refunds',
			probability: 0.9
		});
		expect(stored.path[1].error).toBe('step_failed');
		expect(stored).toMatchObject({ outcome: 'found', content_redacted: true });
	});

	it('is idempotent and keeps repeat-read telemetry', () => {
		const once = projectAgenticChatToolResultForStorageV1('web_visit', {
			url: 'https://example.com',
			content: 'hello',
			served_from_turn_memo: true,
			repeat_read_notice: 'Repeat read'
		}) as any;
		expect(once.served_from_turn_memo).toBe(true);
		expect(once.repeat_read_notice).toBeUndefined();
		expect(projectAgenticChatToolResultForStorageV1('web_visit', once)).toBe(once);
	});

	it('reduces an unexpected result shape to the minimal trace', () => {
		expect(projectAgenticChatToolResultForStorageV1('web_search', 'raw page text')).toEqual({
			content_redacted: true,
			tool_name: 'web_search',
			redaction_notice: expect.stringMatching(/not stored/)
		});
		expect(projectAgenticChatToolResultForStorageV1('web_search', null)).toBeNull();
	});
});

describe('web_navigate progress projection', () => {
	it('rebuilds the step description without link labels or titles', () => {
		const stored = projectAgenticChatToolProgressForStorageV1('web_navigate', {
			message:
				'Jev: not here (4%) → "Help with my order" (91%), else "Contact us" 3% · 310ms',
			data: {
				kind: 'decided',
				page: 1,
				url: 'https://shop.example',
				answer: 0.04,
				next: {
					label: 'Help with my order',
					url: 'https://shop.example/help',
					probability: 0.91
				},
				alternatives: [{ label: 'Contact us', probability: 0.03 }],
				ms: 310
			}
		});
		expect(stored.message).toBe('Jev: not here (4%) → next link (91%) · 310ms');
		expect(stored.data).toEqual({
			kind: 'decided',
			page: 1,
			url: 'https://shop.example',
			answer: 0.04,
			ms: 310,
			next: { url: 'https://shop.example/help', probability: 0.91 },
			alternatives: [{ probability: 0.03 }],
			content_redacted: true
		});
		const finished = projectAgenticChatToolProgressForStorageV1('web_navigate', {
			message: 'Found it: Refunds — Shop · 2 pages in 1.2s',
			data: {
				kind: 'finished',
				outcome: 'found',
				url: 'https://shop.example/refunds',
				title: 'Refunds — Shop',
				pages: 2,
				ms: 1200
			}
		});
		expect(finished.message).toBe('Found it · 2 pages in 1.2s');
		expect(JSON.stringify(finished)).not.toContain('Refunds —');
		expect(
			projectAgenticChatToolProgressForStorageV1('web_navigate', {
				message: 'Opened shop.example · 40 links · 120ms',
				data: {
					kind: 'opened',
					page: 1,
					url: 'https://www.shop.example/',
					title: 'Shop',
					links: 40,
					ms: 120,
					source: 'fetch'
				}
			}).message
		).toBe('Opened shop.example · 40 links · 120ms');
	});

	it('leaves other tools and already-projected steps alone', () => {
		const progress = { message: 'Reading', data: { kind: 'x' } };
		expect(projectAgenticChatToolProgressForStorageV1('get_onto_task_details', progress)).toBe(
			progress
		);
		const projected = projectAgenticChatToolProgressForStorageV1('web_navigate', progress);
		expect(projected.message).toBe('Web navigation step');
		expect(projectAgenticChatToolProgressForStorageV1('web_navigate', projected)).toBe(
			projected
		);
	});
});
