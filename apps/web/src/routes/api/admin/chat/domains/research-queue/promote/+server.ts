// apps/web/src/routes/api/admin/chat/domains/research-queue/promote/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildDomainResearchQueueCandidatesFromSessionRows,
	promoteDomainResearchQueueCandidates,
	type DomainResearchQueueSessionRow
} from '$lib/services/agentic-chat/tools/domains/domain-research-queue';

type Timeframe = '24h' | '7d' | '30d';

const MAX_SESSION_ROWS = 5000;

function parseTimeframe(value: unknown): Timeframe {
	if (value === '24h' || value === '7d' || value === '30d') return value;
	return '7d';
}

function calcStartDate(timeframe: Timeframe, now: Date): Date {
	switch (timeframe) {
		case '24h':
			return new Date(now.getTime() - 24 * 60 * 60 * 1000);
		case '30d':
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		case '7d':
		default:
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}
}

function parseLimit(value: unknown): number {
	const parsed =
		typeof value === 'number'
			? Math.floor(value)
			: Number.parseInt(typeof value === 'string' ? value : '', 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return MAX_SESSION_ROWS;
	return Math.min(parsed, MAX_SESSION_ROWS);
}

function readQueueKeys(value: unknown): Set<string> | null {
	if (!Array.isArray(value)) return null;
	const keys = value
		.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
		.map((item) => item.trim());
	return keys.length ? new Set(keys) : null;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

export const POST: RequestHandler = async ({
	request,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	const body = await readBody(request);
	const timeframe = parseTimeframe(body.timeframe ?? url.searchParams.get('timeframe'));
	const limit = parseLimit(body.limit ?? url.searchParams.get('limit'));
	const queueKeys = readQueueKeys(body.queue_keys);
	const now = new Date();
	const startDate = calcStartDate(timeframe, now);

	try {
		const { data, error } = await supabase
			.from('chat_sessions')
			.select('id, user_id, created_at, updated_at, agent_metadata')
			.gte('updated_at', startDate.toISOString())
			.lte('updated_at', now.toISOString())
			.order('updated_at', { ascending: false })
			.range(0, limit - 1);

		if (error) throw error;

		const candidates = buildDomainResearchQueueCandidatesFromSessionRows(
			(data ?? []) as DomainResearchQueueSessionRow[]
		).filter((candidate) => !queueKeys || queueKeys.has(candidate.queue_key));

		const promotion = await promoteDomainResearchQueueCandidates(
			supabase as unknown as { from: (table: 'domain_research_queue') => any },
			candidates
		);

		return ApiResponse.success({
			data_source: {
				primary: 'chat_sessions.agent_metadata.fastchat_domain_state',
				row_count: data?.length ?? 0,
				start_date: startDate.toISOString(),
				end_date: now.toISOString()
			},
			candidate_count: candidates.length,
			...promotion
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to promote domain research queue items');
	}
};
