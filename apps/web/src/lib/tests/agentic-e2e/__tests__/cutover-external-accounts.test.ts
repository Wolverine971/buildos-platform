import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseServer } from '$lib/supabase';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { buildFastAgentStreamRequestBody } from '$lib/services/agentic-chat-v2/stream-request-client';
import { collectStrictAgentSse } from '$lib/services/agentic-chat-v2/strict-agent-sse';

const BASE_URL = process.env.AGENTIC_E2E_BASE_URL ?? 'http://127.0.0.1:5174';
const DJ_USER_ID = '255735ad-a34b-4ca9-942c-397ed8cc1435';
const AUDIO_PATH = '/Users/djwayne/Downloads/voice test.wav';
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const createdSessionIds: string[] = [];

type JsonRecord = Record<string, unknown>;

function assertRecord(value: unknown, label: string): JsonRecord {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} was not an object`);
	}
	return value as JsonRecord;
}

function readApiData(value: unknown, label: string): JsonRecord {
	const envelope = assertRecord(value, `${label} envelope`);
	expect(envelope.success, `${label} success`).toBe(true);
	return assertRecord(envelope.data, `${label} data`);
}

async function createAuthCookie() {
	const admin = createAdminSupabaseClient();
	const { data: userData, error: userError } = await admin.auth.admin.getUserById(DJ_USER_ID);
	if (userError || !userData.user?.email) throw new Error('Could not resolve cutover user');

	const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
		type: 'magiclink',
		email: userData.user.email,
		options: { redirectTo: `${BASE_URL}/today` }
	});
	const hashedToken = linkData?.properties?.hashed_token;
	if (linkError || !hashedToken) throw new Error('Could not generate one-time cutover login');

	const anon = createClient(
		process.env.PUBLIC_SUPABASE_URL ?? '',
		process.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
		{ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
	);
	const { data: otpData, error: otpError } = await anon.auth.verifyOtp({
		token_hash: hashedToken,
		type: 'email'
	});
	if (otpError || !otpData.session) throw new Error('Could not verify one-time cutover login');

	const cookieWrites: Array<{ name: string; value: string }> = [];
	const serverClient = createSupabaseServer({
		getAll: () => [],
		setAll: (values) => {
			cookieWrites.splice(0, cookieWrites.length, ...values);
		}
	});
	const { error: sessionError } = await serverClient.auth.setSession({
		access_token: otpData.session.access_token,
		refresh_token: otpData.session.refresh_token
	});
	if (sessionError) throw new Error('Could not materialize cutover session cookie');
	const cookie = cookieWrites.map(({ name, value }) => `${name}=${value}`).join('; ');
	if (!cookie.includes('auth-token')) throw new Error('Cutover auth cookie was not created');
	return { admin, cookie };
}

function authenticatedFetch(cookie: string) {
	return async (input: RequestInfo | URL, init: RequestInit = {}) => {
		const url =
			typeof input === 'string' && input.startsWith('/') ? `${BASE_URL}${input}` : input;
		const headers = new Headers(init.headers);
		headers.set('Cookie', cookie);
		headers.set('Origin', BASE_URL);
		return fetch(url, { ...init, headers });
	};
}

async function createSession(admin: ReturnType<typeof createAdminSupabaseClient>) {
	const { data, error } = await admin
		.from('chat_sessions')
		.insert({
			user_id: DJ_USER_ID,
			context_type: 'global',
			entity_id: null,
			status: 'active'
		})
		.select('id')
		.single();
	if (error || !data?.id) throw new Error('Could not create cutover chat session');
	createdSessionIds.push(data.id);
	return data.id;
}

async function requestLease(
	fetcher: ReturnType<typeof authenticatedFetch>,
	input: {
		clientTurnId: string;
		streamRunId: string;
		sessionId: string;
		legacyOnly?: boolean;
	}
) {
	const response = await fetcher('/api/agent/v2/transport', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({
			clientTurnId: input.clientTurnId,
			streamRunId: input.streamRunId,
			sessionId: input.sessionId,
			context: { type: 'global', entityId: null, projectId: null },
			supportedModes: input.legacyOnly ? ['legacy_sse'] : ['legacy_sse', 'worker_realtime'],
			supportedContractVersions: input.legacyOnly
				? ['legacy_internal_v1']
				: ['legacy_internal_v1', 'agentic_chat_worker_v1'],
			priorDecisionId: null
		})
	});
	if (!response.ok) throw new Error(`Transport negotiation failed (${response.status})`);
	return readApiData(await response.json(), 'transport lease');
}

async function workerAdmission(
	fetcher: ReturnType<typeof authenticatedFetch>,
	input: {
		leaseToken: string;
		clientTurnId: string;
		streamRunId: string;
		sessionId: string;
		message: string;
		voiceNoteGroupId?: string | null;
	}
) {
	return fetcher('/api/agent/v2/turns', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({
			leaseToken: input.leaseToken,
			clientTurnId: input.clientTurnId,
			streamRunId: input.streamRunId,
			sessionId: input.sessionId,
			context: { type: 'global', entityId: null, projectId: null },
			message: input.message,
			attachments: [],
			projectFocus: null,
			lastTurnContext: null,
			voiceNoteGroupId: input.voiceNoteGroupId ?? null,
			preparedPromptKey: null
		})
	});
}

async function waitForTurn(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	filter: { turnRunId?: string; clientTurnId?: string },
	timeoutMs = 210_000
) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		let query = admin
			.from('chat_turn_runs')
			.select(
				'id,status,execution_mode,failure_code,finished_reason,user_message_id,assistant_message_id,session_id,stream_run_id,client_turn_id'
			);
		query = filter.turnRunId
			? query.eq('id', filter.turnRunId)
			: query.eq('client_turn_id', filter.clientTurnId ?? '');
		const { data, error } = await query.maybeSingle();
		if (error) throw new Error('Could not read cutover turn status');
		if (data && TERMINAL_STATUSES.has(data.status)) return data;
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error('Cutover turn did not become terminal');
}

async function runLegacyFallback(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	fetcher: ReturnType<typeof authenticatedFetch>,
	prompt: string,
	requiredTools: string[]
) {
	const sessionId = await createSession(admin);
	const clientTurnId = randomUUID();
	const streamRunId = randomUUID();
	const workerLease = await requestLease(fetcher, { clientTurnId, streamRunId, sessionId });
	expect(workerLease.mode).toBe('worker_realtime');

	const admission = await workerAdmission(fetcher, {
		leaseToken: String(workerLease.token),
		clientTurnId,
		streamRunId,
		sessionId,
		message: prompt
	});
	expect(admission.status).toBe(409);
	const admissionBody = assertRecord(await admission.json(), 'fallback admission');
	expect(admissionBody.code).toBe('TRANSPORT_RENEGOTIATE');

	const legacyLease = await requestLease(fetcher, {
		clientTurnId,
		streamRunId,
		sessionId,
		legacyOnly: true
	});
	expect(legacyLease.mode).toBe('legacy_sse');

	const response = await fetcher('/api/agent/v2/stream', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'text/event-stream',
			'X-Skip-Project-Loop-Burst': 'true'
		},
		body: JSON.stringify(
			buildFastAgentStreamRequestBody({
				message: prompt,
				sessionId,
				contextType: 'global',
				streamRunId,
				clientTurnId
			})
		)
	});
	expect(response.ok).toBe(true);
	let sawDone = false;
	await collectStrictAgentSse(response, {
		streamRunId,
		clientTurnId,
		timeoutMs: 210_000,
		onEvent: (event) => {
			if (event.type === 'done') sawDone = true;
		}
	});
	expect(sawDone).toBe(true);

	const turn = await waitForTurn(admin, { clientTurnId });
	expect(turn.status).toBe('completed');
	expect(turn.execution_mode).toBe('legacy_sse');
	const { data: executions, error: executionError } = await admin
		.from('chat_tool_executions')
		.select('tool_name,success,result')
		.eq('turn_run_id', turn.id);
	if (executionError) throw new Error('Could not read cutover tool evidence');
	const toolNames = new Set((executions ?? []).map((row) => row.tool_name));
	for (const toolName of requiredTools) {
		expect(toolNames.has(toolName), toolName).toBe(true);
		expect(
			(executions ?? []).some((row) => row.tool_name === toolName && row.success === true),
			`${toolName} succeeded`
		).toBe(true);
		if (toolName === 'list_calendar_events') {
			const execution = (executions ?? []).find(
				(row) => row.tool_name === toolName && row.success === true
			);
			const result = assertRecord(execution?.result, 'calendar tool result');
			expect(typeof result.google_event_count).toBe('number');
			const readEvidence = assertRecord(result.google_read, 'calendar read evidence');
			expect(readEvidence.mode).toBe('source_aware');
			expect(Number(readEvidence.source_count)).toBeGreaterThan(0);
			expect(Number(readEvidence.successful_source_count)).toBeGreaterThan(0);
		}
	}
	return {
		sessionId,
		turnRunId: turn.id,
		executionMode: turn.execution_mode,
		toolNames: [...toolNames].sort()
	};
}

describe.sequential('cutover voice and external-account gates', () => {
	it('passes the source-aware Calendar read fallback', async () => {
		const { admin, cookie } = await createAuthCookie();
		const evidence = await runLegacyFallback(
			admin,
			authenticatedFetch(cookie),
			'Use the calendar read tool to list events only between 2026-08-25T03:10:00Z and 2026-08-25T03:11:00Z. Report only the count; do not quote titles, descriptions, attendees, locations, or links.',
			['list_calendar_events']
		);
		expect(evidence.executionMode).toBe('legacy_sse');
	}, 300_000);

	it(
		'passes voice persistence plus Gmail and Calendar read-only fallback',
		async () => {
			const { admin, cookie } = await createAuthCookie();
			const fetcher = authenticatedFetch(cookie);
			const warmup = await fetcher('/api/agent/v2/stream', { method: 'GET' });
			expect(warmup.status).toBe(204);

			const groupId = randomUUID();
			const groupResponse = await fetcher('/api/voice-note-groups', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: groupId,
					status: 'draft',
					metadata: { source_component: 'agentic-chat-cutover-wav' }
				})
			});
			expect(groupResponse.status).toBe(201);

			const audioBytes = await readFile(AUDIO_PATH);
			const voiceForm = new FormData();
			voiceForm.append('audio', new Blob([audioBytes], { type: 'audio/wav' }), 'voice-test.wav');
			voiceForm.append('durationSeconds', '2.4');
			voiceForm.append('groupId', groupId);
			voiceForm.append('segmentIndex', '1');
			voiceForm.append('recordedAt', new Date().toISOString());
			voiceForm.append('transcribe', 'true');
			voiceForm.append('metadata', JSON.stringify({ source_component: 'agentic-chat-cutover-wav' }));
			const voiceResponse = await fetcher('/api/voice-notes', {
				method: 'POST',
				body: voiceForm
			});
			expect(voiceResponse.status).toBe(201);
			const voiceNote = readApiData(await voiceResponse.json(), 'voice note');
			expect(voiceNote.transcription_status).toBe('complete');
			expect(typeof voiceNote.transcript).toBe('string');
			expect(String(voiceNote.transcript).trim().length).toBeGreaterThan(0);

			const voiceSessionId = await createSession(admin);
			const voiceClientTurnId = randomUUID();
			const voiceStreamRunId = randomUUID();
			const voiceLease = await requestLease(fetcher, {
				clientTurnId: voiceClientTurnId,
				streamRunId: voiceStreamRunId,
				sessionId: voiceSessionId
			});
			expect(voiceLease.mode).toBe('worker_realtime');
			const voiceAdmission = await workerAdmission(fetcher, {
				leaseToken: String(voiceLease.token),
				clientTurnId: voiceClientTurnId,
				streamRunId: voiceStreamRunId,
				sessionId: voiceSessionId,
				message: `Please acknowledge this voice note. Transcript: ${String(voiceNote.transcript)}`,
				voiceNoteGroupId: groupId
			});
			expect(voiceAdmission.ok).toBe(true);
			const voiceAdmissionData = readApiData(await voiceAdmission.json(), 'voice admission');
			const voiceHandle = assertRecord(voiceAdmissionData.handle, 'voice admission handle');
			const voiceTurn = await waitForTurn(admin, { turnRunId: String(voiceHandle.turnRunId) });
			expect(voiceTurn.status).toBe('completed');
			expect(voiceTurn.execution_mode).toBe('worker_realtime');

			const { data: attachedGroup, error: groupError } = await admin
				.from('voice_note_groups')
				.select('id,status,linked_entity_type,linked_entity_id,chat_session_id')
				.eq('id', groupId)
				.single();
			if (groupError || !attachedGroup) throw new Error('Could not read attached voice group');
			expect(attachedGroup.status).toBe('attached');
			expect(attachedGroup.linked_entity_type).toBe('chat_message');
			expect(attachedGroup.linked_entity_id).toBe(voiceTurn.user_message_id);
			expect(attachedGroup.chat_session_id).toBe(voiceSessionId);

			const hydrationResponse = await fetcher(
				`/api/chat/sessions/${voiceSessionId}?includeVoiceNotes=1`
			);
			expect(hydrationResponse.ok).toBe(true);
			const hydration = readApiData(await hydrationResponse.json(), 'voice hydration');
			const hydratedGroups = Array.isArray(hydration.voiceNoteGroups)
				? hydration.voiceNoteGroups
				: [];
			const hydratedNotes = Array.isArray(hydration.voiceNotes) ? hydration.voiceNotes : [];
			expect(hydratedGroups.some((item) => assertRecord(item, 'group').id === groupId)).toBe(true);
			expect(
				hydratedNotes.some((item) => assertRecord(item, 'voice note').id === voiceNote.id)
			).toBe(true);

			const gmailEvidence = await runLegacyFallback(
				admin,
				fetcher,
				`Use Gmail read tools. First list my connected accounts, then search each readable account for the unique marker CUTOVER_NO_MATCH_20260825_${randomUUID()}. Maximum one result per account. Report only the total number of matches; do not quote subjects, snippets, senders, recipients, or message content.`,
				['list_email_accounts', 'search_email_messages']
			);
			const calendarEvidence = await runLegacyFallback(
				admin,
				fetcher,
				'Use the calendar read tool to list events only between 2026-08-25T03:10:00Z and 2026-08-25T03:11:00Z. Report only the count; do not quote titles, descriptions, attendees, locations, or links.',
				['list_calendar_events']
			);

			console.info(
				JSON.stringify({
					voice: {
						groupId,
						voiceNoteId: voiceNote.id,
						sessionId: voiceSessionId,
						turnRunId: voiceTurn.id,
						executionMode: voiceTurn.execution_mode,
						attached: true,
						hydrated: true
					},
					gmail: gmailEvidence,
					calendar: calendarEvidence
				})
			);
		},
		720_000
	);
});
