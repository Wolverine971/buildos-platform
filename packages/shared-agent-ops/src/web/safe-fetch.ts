// packages/shared-agent-ops/src/web/safe-fetch.ts
import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent } from 'undici';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT = 'BuildOS-WebResearch/1.0';

const BLOCKED_HOSTS = new Set(['localhost']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home'];

const IPV4_BLOCKED_CIDRS: Array<[string, number]> = [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.88.99.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 4],
	['240.0.0.0', 4],
	['255.255.255.255', 32]
];

const IPV6_BLOCKED_CIDRS: Array<[string, number]> = [
	['::', 128],
	['::1', 128],
	['fc00::', 7],
	['fe80::', 10],
	['fec0::', 10],
	['ff00::', 8],
	['2001:db8::', 32]
];

type DnsLookup = (
	hostname: string,
	options: { all: true; verbatim: true }
) => Promise<Array<{ address: string; family: number }>>;

export interface FetchPublicUrlOptions {
	fetchFn?: typeof fetch;
	dnsLookup?: DnsLookup;
	allowRedirects?: boolean;
	preferLanguage?: string;
	timeoutMs?: number;
	maxBytes?: number;
	maxRedirects?: number;
	userAgent?: string;
}

export interface FetchPublicUrlResult {
	url: string;
	finalUrl: string;
	status: number;
	headers: Headers;
	body: string;
	bytes: number;
	fetchMs: number;
}

function ipv4ToInt(ip: string): number {
	return ip
		.split('.')
		.map((part) => Number.parseInt(part, 10))
		.reduce((acc, part) => ((acc << 8) + part) >>> 0, 0);
}

function inIpv4Cidr(ip: number, base: number, prefix: number): boolean {
	const mask = prefix === 0 ? 0 : (~((1 << (32 - prefix)) - 1) >>> 0) >>> 0;
	return (ip & mask) === (base & mask);
}

function isPrivateIpv4(ip: string): boolean {
	const ipInt = ipv4ToInt(ip);
	return IPV4_BLOCKED_CIDRS.some(([base, prefix]) => inIpv4Cidr(ipInt, ipv4ToInt(base), prefix));
}

function ipv4IntToString(ip: number): string {
	return [(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.');
}

function ipv6ToBigInt(ip: string): bigint | null {
	let address = ip.toLowerCase();
	const zoneIndex = address.indexOf('%');
	if (zoneIndex >= 0) address = address.slice(0, zoneIndex);

	const ipv4Match = address.match(/(.+):(\d+\.\d+\.\d+\.\d+)$/);
	const ipv4Host = ipv4Match?.[1];
	const ipv4 = ipv4Match?.[2];
	if (ipv4Host && ipv4) {
		const parts = ipv4.split('.').map((part) => Number.parseInt(part, 10));
		if (
			parts.length !== 4 ||
			parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
		) {
			return null;
		}
		const [a, b, c, d] = parts as [number, number, number, number];
		address = `${ipv4Host}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}

	const halves = address.split('::');
	if (halves.length > 2) return null;
	const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
	const right = halves[1] ? halves[1].split(':').filter(Boolean) : [];
	const missing = 8 - (left.length + right.length);
	if (missing < 0) return null;

	const full = [...left, ...Array(missing).fill('0'), ...right];
	if (full.length !== 8) return null;

	let result = 0n;
	for (const part of full) {
		if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
		result = (result << 16n) + BigInt(Number.parseInt(part, 16));
	}
	return result;
}

function inIpv6Cidr(ip: bigint, base: bigint, prefix: number): boolean {
	const shift = BigInt(128 - prefix);
	return ip >> shift === base >> shift;
}

function isPrivateIpv6(ip: string): boolean {
	const ipv4 = ip.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	if (ipv4) return isPrivateIpv4(ipv4);

	const ipBig = ipv6ToBigInt(ip);
	if (ipBig === null) return true;
	if (ipBig >> 32n === 0xffffn) {
		return isPrivateIpv4(ipv4IntToString(Number(ipBig & 0xffffffffn)));
	}
	return IPV6_BLOCKED_CIDRS.some(([base, prefix]) => {
		const baseBig = ipv6ToBigInt(base);
		return baseBig === null || inIpv6Cidr(ipBig, baseBig, prefix);
	});
}

function isPrivateIp(address: string): boolean {
	const ipType = isIP(address);
	if (ipType === 4) return isPrivateIpv4(address);
	if (ipType === 6) return isPrivateIpv6(address);
	return true;
}

function isBlockedHostname(hostname: string): boolean {
	if (BLOCKED_HOSTS.has(hostname)) return true;
	return BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

interface VettedTarget {
	/** Normalized (lower-cased, bracket/trailing-dot stripped) hostname. */
	hostname: string;
	/** Addresses that passed the private/reserved-range checks. */
	addresses: Array<{ address: string; family: number }>;
	/**
	 * True when the target is a DNS name whose connection must be pinned to the
	 * vetted addresses. False when the URL already used an IP literal (there is
	 * no second resolution to defend against).
	 */
	pinnable: boolean;
}

async function assertPublicUrl(url: URL, dnsLookup: DnsLookup): Promise<VettedTarget> {
	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('Only http/https URLs are supported.');
	}
	if (url.username || url.password) {
		throw new Error('URLs with embedded credentials are not allowed.');
	}

	const normalizedHostname = url.hostname.replace(/\.$/, '').toLowerCase();
	const hostname =
		normalizedHostname.startsWith('[') && normalizedHostname.endsWith(']')
			? normalizedHostname.slice(1, -1)
			: normalizedHostname;
	if (!hostname) throw new Error('Invalid URL hostname.');
	if (isBlockedHostname(hostname)) throw new Error('Blocked hostname.');

	const literalType = isIP(hostname);
	if (literalType) {
		if (isPrivateIp(hostname)) {
			throw new Error('Blocked private or reserved IP address.');
		}
		return {
			hostname,
			addresses: [{ address: hostname, family: literalType }],
			pinnable: false
		};
	}

	const records = await dnsLookup(hostname, { all: true, verbatim: true });
	if (!records.length) throw new Error('DNS lookup failed.');
	for (const record of records) {
		if (isPrivateIp(record.address)) {
			throw new Error('Blocked private or reserved IP address.');
		}
	}
	return {
		hostname,
		addresses: records.map((record) => ({ address: record.address, family: record.family })),
		pinnable: true
	};
}

/**
 * Build an undici dispatcher that pins the connection to the already-vetted IP
 * addresses for exactly one hostname.
 *
 * Without this, the platform's global `fetch` performs its OWN second DNS
 * resolution after {@link assertPublicUrl} has vetted the hostname. A
 * DNS-rebinding attacker serving a TTL≈0 record can answer with a public IP
 * for the validation lookup and a private IP (127.0.0.1, 10.x, link-local,
 * etc.) for the fetch, defeating every IP check. Pinning the connect step to
 * the addresses we already vetted closes that TOCTOU gap: no second resolution
 * can reach the network. The lookup fails closed for any hostname other than
 * the one we vetted.
 */
function createPinnedDispatcher(target: VettedTarget): Agent {
	const pinned = target.addresses.map((entry) => ({
		address: entry.address,
		family: entry.family
	}));
	const lookup: LookupFunction = (host, options, callback) => {
		const requested = host.replace(/\.$/, '').toLowerCase();
		if (requested !== target.hostname) {
			callback(new Error(`Blocked unexpected DNS resolution for "${host}".`), []);
			return;
		}
		if (options.all) {
			callback(null, pinned);
			return;
		}
		const first = pinned[0];
		callback(null, first.address, first.family);
	};
	return new Agent({ connect: { lookup } });
}

function buildHeaders(options: FetchPublicUrlOptions): Record<string, string> {
	return {
		Accept: 'text/html, text/plain;q=0.9, application/json;q=0.8, */*;q=0.7',
		'Accept-Language': options.preferLanguage ?? 'en-US,en;q=0.8',
		'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT
	};
}

async function readResponseBody(
	response: Response,
	maxBytes: number
): Promise<{ body: string; bytes: number }> {
	const contentLength = response.headers.get('content-length');
	if (contentLength) {
		const length = Number.parseInt(contentLength, 10);
		if (Number.isFinite(length) && length > maxBytes) {
			throw new Error('Response body exceeds size limit.');
		}
	}

	const reader = response.body?.getReader();
	if (!reader) return { body: '', bytes: 0 };

	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.length;
		if (total > maxBytes) throw new Error('Response body exceeds size limit.');
		chunks.push(value);
	}

	const buffer = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.length;
	}
	return {
		body: new TextDecoder('utf-8', { fatal: false }).decode(buffer),
		bytes: total
	};
}

/**
 * Fetch a public HTTP(S) URL with the shared web-research SSRF policy.
 * Every redirect target is resolved and checked before it is fetched.
 */
export async function fetchPublicUrl(
	inputUrl: string,
	options: FetchPublicUrlOptions = {}
): Promise<FetchPublicUrlResult> {
	const fetcher = options.fetchFn ?? fetch;
	const dnsLookup: DnsLookup = options.dnsLookup ?? lookup;
	const allowRedirects = options.allowRedirects ?? true;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

	let currentUrl = new URL(inputUrl);
	const start = Date.now();
	let redirectCount = 0;

	while (true) {
		// Each hop is independently vetted AND independently pinned: the vetted
		// addresses feed a dedicated dispatcher so the connection cannot resolve
		// to anything other than what we just checked (see createPinnedDispatcher).
		const vetted = await assertPublicUrl(currentUrl, dnsLookup);
		const dispatcher = vetted.pinnable ? createPinnedDispatcher(vetted) : undefined;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		let response: Response;
		try {
			response = await fetcher(currentUrl.toString(), {
				method: 'GET',
				redirect: 'manual',
				headers: buildHeaders(options),
				signal: controller.signal,
				...(dispatcher ? { dispatcher } : {})
			});
		} catch (error) {
			clearTimeout(timeout);
			// This agent is scoped to one hop. Destroy it instead of waiting for a
			// graceful close: redirect/error responses can carry unread bodies, and
			// Agent.close() waits indefinitely for that active stream to finish.
			await dispatcher?.destroy();
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Fetch failed: ${message}`);
		}

		if (response.status >= 300 && response.status < 400) {
			clearTimeout(timeout);
			await dispatcher?.destroy();
			if (!allowRedirects) throw new Error('Redirect blocked by policy.');
			const location = response.headers.get('location');
			if (!location) throw new Error('Redirect location missing.');
			redirectCount += 1;
			if (redirectCount > maxRedirects) throw new Error('Too many redirects.');
			currentUrl = new URL(location, currentUrl);
			continue;
		}

		if (response.status < 200 || response.status >= 400) {
			clearTimeout(timeout);
			await dispatcher?.destroy();
			throw new Error(`Request failed (${response.status} ${response.statusText}).`);
		}

		try {
			const { body, bytes } = await readResponseBody(response, maxBytes);
			return {
				url: inputUrl,
				finalUrl: currentUrl.toString(),
				status: response.status,
				headers: response.headers,
				body,
				bytes,
				fetchMs: Date.now() - start
			};
		} finally {
			clearTimeout(timeout);
			await dispatcher?.destroy();
		}
	}
}
