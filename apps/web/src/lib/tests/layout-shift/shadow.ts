// apps/web/src/lib/tests/layout-shift/shadow.ts
//
// The "shadow server": every write the page sends is answered here and never
// reaches the database, and the page's later reads are patched to agree with
// those writes. Without the patch a refetch would show the old state and the
// harness would report bounces that can't happen for real.
import type { BrowserContext, Route } from '@playwright/test';

export interface ShadowWrite {
	method: string;
	path: string;
	body: unknown;
}

export interface ShadowState {
	/** id → state_key the page set. */
	states: Map<string, string>;
	/** ids the page archived or deleted. */
	gone: Set<string>;
	writes: ShadowWrite[];
}

export function createShadowState(): ShadowState {
	return { states: new Map(), gone: new Set(), writes: [] };
}

const ENTITY_PATH = /^\/api\/onto\/(tasks|documents|goals|plans|risks|milestones)\/([^/]+)$/;

/** Record a write and say what the fake answer should carry. */
export function applyWrite(
	shadow: ShadowState,
	method: string,
	path: string,
	body: Record<string, unknown> | null
): Record<string, unknown> {
	shadow.writes.push({ method, path, body });
	const match = path.match(ENTITY_PATH);
	if (!match) return {};
	const [, collection, id] = match;
	if (method === 'DELETE' || body?.action === 'archive') shadow.gone.add(id!);
	if (typeof body?.state_key === 'string') shadow.states.set(id!, body.state_key);
	const kind = collection!.replace(/s$/, '');
	return {
		[kind === 'document' ? 'document' : kind]: {
			id,
			...(body ?? {}),
			updated_at: new Date().toISOString()
		}
	};
}

/** Patch a JSON read so it agrees with the writes the shadow answered. */
export function overlayJson(value: unknown, shadow: ShadowState): unknown {
	if (Array.isArray(value)) {
		return value
			.filter(
				(item) =>
					!(
						item &&
						typeof item === 'object' &&
						typeof (item as { id?: unknown }).id === 'string' &&
						shadow.gone.has((item as { id: string }).id)
					)
			)
			.map((item) => overlayJson(item, shadow));
	}
	if (!value || typeof value !== 'object') return value;
	const out: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) out[key] = overlayJson(child, shadow);
	const id = typeof out.id === 'string' ? out.id : null;
	if (id && shadow.states.has(id) && 'state_key' in out) {
		const state = shadow.states.get(id)!;
		out.state_key = state;
		if ('completed_at' in out)
			out.completed_at =
				state === 'done' ? (out.completed_at ?? new Date().toISOString()) : null;
	}
	return out;
}

const READ_ONLY_POSTS = new Set(['/api/auth/login']);
/** Reads worth patching. Streams and everything else pass through untouched. */
const PATCHED_READS = /^\/api\/(onto|today)\//;

export async function installShadowServer(
	context: BrowserContext,
	origin: string,
	shadow: ShadowState
): Promise<void> {
	await context.route('**/*', async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.origin !== origin) return route.continue();
		const method = request.method();

		if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !READ_ONLY_POSTS.has(url.pathname)) {
			let body: Record<string, unknown> | null = null;
			try {
				body = request.postDataJSON() as Record<string, unknown> | null;
			} catch {
				body = null;
			}
			const data = applyWrite(shadow, method, url.pathname, body);
			return route.fulfill({ status: 200, json: { success: true, data } });
		}

		const patching =
			method === 'GET' &&
			PATCHED_READS.test(url.pathname) &&
			request.resourceType() !== 'eventsource' &&
			(shadow.states.size > 0 || shadow.gone.size > 0);
		if (!patching) return route.continue();

		const response = await route.fetch();
		const type = response.headers()['content-type'] ?? '';
		if (!type.includes('application/json')) return route.fulfill({ response });
		const json = await response.json().catch(() => null);
		if (json === null) return route.fulfill({ response });
		return route.fulfill({ response, json: overlayJson(json, shadow) });
	});
}
