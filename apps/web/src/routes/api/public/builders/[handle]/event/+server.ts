// apps/web/src/routes/api/public/builders/[handle]/event/+server.ts
//
// POST { kind: 'view' | 'link_tap' } from a builder page, or { kind: 'project_view',
// project_id } from one of its project pages (counted apart from the person's page). Sent
// by the page itself, so prefetchers and most crawlers, which don't run scripts, aren't
// counted. The owner's own visits don't count.
//
// Abuse limits (the numbers are owner-only vanity counts, so these fail quiet):
// - a short-lived cookie skips repeat views from the same browser without a database call;
// - each network address gets 30 events a minute on this server instance;
// - the database counts one view per visitor per page per day and at most 20 taps, keyed
//   by a daily-rotating hash of the address (builder-profile-visitor.ts), never the address.

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { rateLimiter } from '$lib/utils/rate-limiter';
import {
	recordEvent,
	type BuilderEventKind
} from '$lib/server/builder-profile/builder-profile.service';
import { visitorKey } from '$lib/server/builder-profile/builder-profile-visitor';

// User agents of crawlers and link unfurlers (a structured header, not user text).
const BOT_AGENT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|headless|lighthouse/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_ADDRESS = { requests: 30, windowMs: 60_000 };

function readKind(value: unknown): BuilderEventKind | null {
	return value === 'view' || value === 'link_tap' || value === 'project_view' ? value : null;
}

export const POST: RequestHandler = async ({
	params,
	request,
	cookies,
	locals,
	getClientAddress
}) => {
	const body = (await request.json().catch(() => ({}))) as {
		kind?: unknown;
		project_id?: unknown;
	};
	const kind = readKind(body.kind);
	if (!kind) return ApiResponse.badRequest('Unknown event');
	const projectId =
		kind === 'project_view' && typeof body.project_id === 'string' && UUID.test(body.project_id)
			? body.project_id.toLowerCase()
			: null;
	if (kind === 'project_view' && !projectId) return ApiResponse.badRequest('Which project?');
	if (BOT_AGENT.test(request.headers.get('user-agent') ?? '')) {
		return ApiResponse.success({ counted: false });
	}

	const handle = params.handle.replace(/^@/, '').toLowerCase();
	const pageKey =
		handle.replace(/[^a-z0-9]/g, '') + (projectId ? `_${projectId.slice(0, 8)}` : '');
	const cookieName = `bp_seen_${pageKey}`;
	const isView = kind !== 'link_tap';
	if (isView && cookies.get(cookieName)) return ApiResponse.success({ counted: false });

	let address: string | null = null;
	try {
		address = getClientAddress();
	} catch {
		address = null;
	}
	if (address && !rateLimiter.check(`builder-event:${address}`, PER_ADDRESS).allowed) {
		return ApiResponse.error('Too many requests', 429);
	}

	// /api/public skips session loading in hooks; read it here so owners aren't counted.
	const session = await locals.safeGetSession().catch(() => null);
	try {
		const counted = await recordEvent({
			admin: createAdminSupabaseClient() as any,
			handle,
			kind,
			viewerId: session?.user?.id ?? null,
			visitorKey: visitorKey(
				address,
				env.BUILDER_STATS_SECRET || env.PRIVATE_SUPABASE_SERVICE_KEY || ''
			),
			subject: projectId
		});
		if (isView && counted) {
			cookies.set(cookieName, '1', {
				path: '/',
				maxAge: 60 * 60 * 20,
				httpOnly: true,
				sameSite: 'lax',
				secure: true
			});
		}
		return ApiResponse.success({ counted });
	} catch (error) {
		console.error('[BuilderProfile] event failed', error);
		return ApiResponse.success({ counted: false });
	}
};
