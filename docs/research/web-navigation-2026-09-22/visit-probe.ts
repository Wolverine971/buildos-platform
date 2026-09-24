// docs/research/web-navigation-2026-09-22/visit-probe.ts
//
// Measures what production Agentic Chat `web_visit` actually returns for real
// sites. One GET per URL with the production user agent, SSRF policy, timeout,
// and byte cap; the fetched body is then replayed (no second request) through
// the worker's real visit parser. Sites that refuse the production agent get
// one retry with a browser user agent to separate "bot-blocked" from "down".
//
// Free: no model or search-provider calls.
// Run: cd apps/worker && node --import tsx ../../docs/research/web-navigation-2026-09-22/visit-probe.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fetchPublicUrl } from '../../../packages/shared-agent-ops/src/web/safe-fetch';
import { parseHtmlToText } from '../../../apps/web/src/lib/services/agentic-chat/tools/webvisit/parser';
import { createAgentRunWebResearchPort } from '../../../apps/worker/src/workers/agent-run/webResearchPort';
import { SITES } from './sites';

const HERE = __dirname;

// sanitize-html is a worker dependency, not a root one.
const sanitizeHtml = createRequire(join(HERE, '../../../apps/worker/package.json'))(
	'sanitize-html'
) as typeof import('sanitize-html');
const PROD_UA = 'BuildOS-AgentRun/1.0';
const BROWSER_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const DEFAULT_VISIT_CHARS = 6_000; // worker default when the model omits max_chars

type Outcome =
	| 'ok'
	| 'blocked' // 401/403/429/503 or challenge page
	| 'js_shell' // fetched fine but <400 chars of readable text
	| 'empty_after_parse' // HTML had text but parser dropped it (e.g. <form> wrapper)
	| 'error';

const CHALLENGE =
	/just a moment|cf-chl|cf_chl|captcha|are you a robot|access denied|attention required|enable javascript and cookies|verify you are human|px-captcha|request unsuccessful|incapsula/i;

function normalize(s: string) {
	return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function anchorStats(html: string, baseUrl: string) {
	let total = 0;
	let sameSite = 0;
	const base = new URL(baseUrl);
	const host = base.hostname.replace(/^www\./, '');
	for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>/gi)) {
		try {
			const u = new URL(m[1]!, baseUrl);
			if (!/^https?:$/.test(u.protocol)) continue;
			total++;
			if (u.hostname.replace(/^www\./, '').endsWith(host)) sameSite++;
		} catch {
			/* ignore */
		}
	}
	return { total, sameSite };
}

async function fetchOnce(url: string, userAgent: string) {
	return fetchPublicUrl(url, { userAgent, timeoutMs: 12_000, maxBytes: 2_000_000 });
}

async function probe(site: (typeof SITES)[number]) {
	const started = Date.now();
	const row: Record<string, unknown> = { ...site };
	let raw: Awaited<ReturnType<typeof fetchOnce>>;
	try {
		raw = await fetchOnce(site.url, PROD_UA);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		row.prod_error = message;
		const status = Number(message.match(/\((\d{3})/)?.[1] ?? 0) || undefined;
		row.prod_status = status;
		// One browser-UA retry: is this bot-blocking or a dead page?
		try {
			const retry = await fetchOnce(site.url, BROWSER_UA);
			row.browser_ua_status = retry.status;
			row.browser_ua_text_chars = normalize(
				sanitizeHtml(retry.body, { allowedTags: [], allowedAttributes: {} })
			).length;
			row.browser_ua_challenge = CHALLENGE.test(retry.body.slice(0, 20_000));
		} catch (retryError) {
			row.browser_ua_error =
				retryError instanceof Error ? retryError.message : String(retryError);
		}
		row.outcome =
			(status && [401, 403, 429, 503].includes(status)) || /timed out|aborted/i.test(message)
				? 'blocked'
				: 'error';
		row.ms = Date.now() - started;
		return row;
	}

	row.prod_status = raw.status;
	row.final_url = raw.finalUrl;
	row.bytes = raw.bytes;
	row.fetch_ms = raw.fetchMs;
	const contentType = raw.headers.get('content-type') ?? '';

	// Replay the captured body through the worker's real visit path (no network).
	const replay: typeof fetch = async () =>
		new Response(raw.body, { status: 200, headers: { 'content-type': contentType } });
	const port = createAgentRunWebResearchPort({ apiKey: null, fetchFn: replay });
	let workerText = '';
	try {
		const visit = (await port.visit({ url: raw.finalUrl, max_chars: 12_000 })) as {
			content: string;
			truncated: boolean;
		};
		workerText = visit.content;
	} catch (error) {
		row.worker_visit_error = error instanceof Error ? error.message : String(error);
	}
	const workerDefault = workerText.slice(0, DEFAULT_VISIT_CHARS);
	row.worker_chars = workerText.length;

	// What the text would be if <form> contents were not discarded.
	const bodyHtml = raw.body.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? raw.body;
	const keepForms = normalize(
		sanitizeHtml(bodyHtml, {
			allowedTags: [],
			allowedAttributes: {},
			nonTextTags: ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe']
		})
	);
	row.text_chars_if_forms_kept = keepForms.length;
	row.form_wrapper_loss =
		keepForms.length > 1_000 && normalize(workerText).length < keepForms.length * 0.3;

	// Reader extraction (web app parser) = best guess at the main content.
	const reader = parseHtmlToText(raw.body, {
		mode: 'reader',
		includeLinks: true,
		baseUrl: raw.finalUrl,
		maxLinks: 500
	});
	row.reader_chars = reader.content.length;
	row.reader_strategy = reader.extraction_strategy;
	// Where does the main content start inside the worker's (non-reader) text?
	const probeText = normalize(reader.content).slice(0, 60);
	const idx = probeText.length >= 30 ? normalize(workerText).indexOf(probeText) : -1;
	row.main_content_offset = idx;
	row.main_content_in_default_window =
		idx >= 0 ? idx < DEFAULT_VISIT_CHARS - 500 : normalize(workerDefault).length > 400;

	const anchors = anchorStats(raw.body, raw.finalUrl);
	row.anchors_total = anchors.total;
	row.anchors_same_site = anchors.sameSite;
	row.links_returned_to_model = 0; // worker strips include_links; see execution-adapter.ts
	row.challenge_page = CHALLENGE.test(raw.body.slice(0, 20_000)) && workerText.length < 2_000;
	row.worker_default_preview = workerDefault.slice(0, 300);

	let outcome: Outcome = 'ok';
	if (row.challenge_page) outcome = 'blocked';
	else if (row.form_wrapper_loss) outcome = 'empty_after_parse';
	else if (workerText.length < 400) outcome = 'js_shell';
	row.outcome = outcome;
	row.ms = Date.now() - started;
	return row;
}

async function main() {
	const rows: Record<string, unknown>[] = [];
	// Four at a time, every URL on a different host: one request per site.
	const queue = [...SITES];
	await Promise.all(
		Array.from({ length: 4 }, async () => {
			while (queue.length) {
				const site = queue.shift()!;
				const row = await probe(site);
				rows.push(row);
				console.log(
					`${String(row.outcome).padEnd(18)} ${String(row.prod_status ?? '-').padEnd(4)} ${site.category.padEnd(12)} ${site.url}`
				);
			}
		})
	);
	rows.sort((a, b) => String(a.category).localeCompare(String(b.category)));
	writeFileSync(join(HERE, 'visit-probe-results.json'), JSON.stringify(rows, null, '\t'));
	const count = (pred: (r: Record<string, unknown>) => boolean) => rows.filter(pred).length;
	const summary = {
		run_at: new Date().toISOString(),
		sites: rows.length,
		ok: count((r) => r.outcome === 'ok'),
		blocked: count((r) => r.outcome === 'blocked'),
		js_shell: count((r) => r.outcome === 'js_shell'),
		empty_after_parse: count((r) => r.outcome === 'empty_after_parse'),
		error: count((r) => r.outcome === 'error'),
		ok_but_main_content_outside_default_window: count(
			(r) => r.outcome === 'ok' && r.main_content_in_default_window === false
		),
		blocked_that_browser_ua_unblocks: count(
			(r) =>
				r.outcome === 'blocked' &&
				typeof r.browser_ua_status === 'number' &&
				r.browser_ua_status < 400 &&
				!r.browser_ua_challenge
		),
		median_same_site_links_on_ok_pages: median(
			rows.filter((r) => r.outcome === 'ok').map((r) => Number(r.anchors_same_site))
		)
	};
	writeFileSync(join(HERE, 'visit-probe-summary.json'), JSON.stringify(summary, null, '\t'));
	console.log(summary);
}

function median(values: number[]) {
	const s = [...values].sort((a, b) => a - b);
	return s.length ? s[Math.floor(s.length / 2)] : 0;
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
