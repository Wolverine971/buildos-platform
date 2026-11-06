// apps/web/src/routes/api/lab/thread-chat/+server.ts
// POST { message, history, projectId, mode }: streams one "chat with threads" turn as JSON
// lines (ChatTurnEvent). mode "replay" is free and scripted; "live" makes paid fast-model
// calls (plan, threads, answer) as the signed-in admin. Lab: nothing is saved.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { isDumpSortAdmin } from '$lib/server/dump-sort/dump-sort-access';
import {
	CHAT_MAX_CHARS,
	type ChatHistoryTurn,
	type ThreadReport
} from '$lib/server/thread-chat/thread-chat-core';
import { streamChatTurn } from '$lib/server/thread-chat/thread-chat.service';
import type { CarryItem, ScannedItem } from '$lib/server/thread-chat/thread-chat-carry';

const MAX_TURNS = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Record ids: uuids live, short slugs in replay. The thread only loads ids in its own index. */
const RECORD_ID = /^[\w-]{1,64}$/;
const KINDS = new Set(['document', 'task', 'goal', 'plan', 'milestone', 'risk']);

function readScanned(value: unknown): ScannedItem | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (typeof raw.id !== 'string' || !RECORD_ID.test(raw.id)) return null;
	if (typeof raw.kind !== 'string' || !KINDS.has(raw.kind)) return null;
	return {
		id: raw.id,
		kind: raw.kind as ScannedItem['kind'],
		title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : ''
	};
}

function readCarry(value: unknown): CarryItem | null {
	const base = readScanned(value);
	if (!base) return null;
	const raw = value as Record<string, unknown>;
	const anchors = strings(raw.anchors, 120).slice(0, 8);
	const headings = strings(raw.headings, 120).slice(0, anchors.length);
	const chars = Number(raw.chars);
	const idle = Number(raw.idle);
	return {
		...base,
		anchors,
		headings,
		version: typeof raw.version === 'string' ? raw.version.slice(0, 64) : null,
		chars: Number.isFinite(chars) ? Math.max(0, Math.min(chars, 50_000)) : 0,
		idle: Number.isInteger(idle) ? Math.max(0, Math.min(idle, 5)) : 0
	};
}

const list = <T>(value: unknown, read: (entry: unknown) => T | null, max: number): T[] =>
	(Array.isArray(value) ? value : [])
		.slice(0, max)
		.map(read)
		.filter((entry): entry is T => entry !== null);

const strings = (value: unknown, max: number): string[] =>
	Array.isArray(value)
		? value
				.filter((entry): entry is string => typeof entry === 'string')
				.slice(0, 20)
				.map((entry) => entry.slice(0, max))
		: [];

function readReport(value: unknown): ThreadReport | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (typeof raw.alias !== 'string' || typeof raw.project !== 'string') return null;
	return {
		alias: raw.alias.slice(0, 8),
		projectId:
			typeof raw.projectId === 'string' && UUID.test(raw.projectId)
				? raw.projectId
				: typeof raw.projectId === 'string' && raw.projectId.startsWith('replay-')
					? raw.projectId
					: null,
		project: raw.project.slice(0, 120),
		read: strings(raw.read, 200),
		saved: strings(raw.saved, 300),
		asked: strings(raw.asked, 300),
		answers: strings(raw.answers, 4000),
		covered: strings(raw.covered, 200),
		unfinished: strings(raw.unfinished, 200).slice(0, 12),
		failed: typeof raw.failed === 'string' ? raw.failed.slice(0, 200) : null,
		carry: list(raw.carry, readCarry, 12),
		scanned: list(raw.scanned, readScanned, 12),
		scannedCount: Math.max(0, Math.min(Number(raw.scannedCount) || 0, 500))
	};
}

function readHistory(value: unknown): ChatHistoryTurn[] {
	if (!Array.isArray(value)) return [];
	return value.slice(-MAX_TURNS).flatMap((entry) => {
		if (!entry || typeof entry !== 'object') return [];
		const raw = entry as Record<string, unknown>;
		if (typeof raw.user !== 'string') return [];
		return [
			{
				user: raw.user.slice(0, CHAT_MAX_CHARS),
				answer: typeof raw.answer === 'string' ? raw.answer.slice(0, 2000) : '',
				threads: (Array.isArray(raw.threads) ? raw.threads : [])
					.map(readReport)
					.filter((report): report is ThreadReport => !!report)
					.slice(0, 12)
			}
		];
	});
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!(await isDumpSortAdmin(locals.supabase, user.id))) return ApiResponse.notFound('Page');

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Send JSON with message, history and mode.');
	}
	const mode = body.mode === 'live' ? 'live' : 'replay';
	const message = typeof body.message === 'string' ? body.message.trim() : '';
	if (mode === 'live' && !message) return ApiResponse.badRequest('Write a message first.');
	if (message.length > CHAT_MAX_CHARS) {
		return ApiResponse.badRequest(`Keep it under ${CHAT_MAX_CHARS} characters for now.`);
	}
	const projectId =
		typeof body.projectId === 'string' && UUID.test(body.projectId) ? body.projectId : null;

	const stream = streamChatTurn({
		session: locals.supabase,
		admin: createAdminSupabaseClient(),
		userId: user.id,
		message,
		history: readHistory(body.history),
		projectId,
		mode,
		signal: request.signal
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no'
		}
	});
};
