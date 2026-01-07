// apps/web/src/lib/services/agentic-chat/tools/webvisit/url-client.ts
import { env } from '$env/dynamic/private';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

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

const IPV4_BLOCKED_RANGES = IPV4_BLOCKED_CIDRS.map(([base, prefix]) => ({
	base: ipv4ToInt(base),
	prefix
}));

const IPV6_BLOCKED_RANGES = IPV6_BLOCKED_CIDRS.map(([base, prefix]) => ({
	base: ipv6ToBigInt(base) ?? 0n,
	prefix
}));

export interface FetchUrlOptions {
	fetchFn?: typeof fetch;
	allowRedirects?: boolean;
	preferLanguage?: string;
	timeoutMs?: number;
	maxBytes?: number;
	maxRedirects?: number;
}

export interface FetchUrlResult {
	url: string;
	finalUrl: string;
	status: number;
	headers: Headers;
	body: string;
	bytes: number;
	fetchMs: number;
}

function parseNumber(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
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
	return IPV4_BLOCKED_RANGES.some((range) => inIpv4Cidr(ipInt, range.base, range.prefix));
}

function ipv6ToBigInt(ip: string): bigint | null {
	let address = ip.toLowerCase();
	const zoneIndex = address.indexOf('%');
	if (zoneIndex >= 0) {
		address = address.slice(0, zoneIndex);
	}

	const ipv4Match = address.match(/(.+):(\d+\.\d+\.\d+\.\d+)$/);
	const ipv4Host = ipv4Match?.[1];
	const ipv4 = ipv4Match?.[2];
	if (ipv4Host && ipv4) {
		const ipv4Parts = ipv4.split('.');
		if (ipv4Parts.length !== 4) return null;
		const [aStr, bStr, cStr, dStr] = ipv4Parts as [string, string, string, string];
		const a = Number.parseInt(aStr, 10);
		const b = Number.parseInt(bStr, 10);
		const c = Number.parseInt(cStr, 10);
		const d = Number.parseInt(dStr, 10);
		if ([a, b, c, d].some((part) => Number.isNaN(part))) {
			return null;
		}
		const part1 = ((a << 8) | b).toString(16);
		const part2 = ((c << 8) | d).toString(16);
		address = `${ipv4Host}:${part1}:${part2}`;
	}

	const parts = address.split('::');
	if (parts.length > 2) return null;

	const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
	const right = parts[1] ? parts[1].split(':').filter(Boolean) : [];
	const missing = 8 - (left.length + right.length);
	if (missing < 0) return null;

	const full = [...left, ...Array(missing).fill('0'), ...right];
	if (full.length !== 8) return null;

	return full.reduce((acc, part) => {
		const value = Number.parseInt(part || '0', 16);
		return (acc << 16n) + BigInt(Number.isNaN(value) ? 0 : value);
	}, 0n);
}

function inIpv6Cidr(ip: bigint, base: bigint, prefix: number): boolean {
	const shift = BigInt(128 - prefix);
	return ip >> shift === base >> shift;
}

function isPrivateIpv6(ip: string): boolean {
	const ipv4Match = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
	const ipv4 = ipv4Match?.[1];
	if (ipv4) {
		return isPrivateIpv4(ipv4);
	}

	const ipBig = ipv6ToBigInt(ip);
	if (ipBig === null) return true;

	return IPV6_BLOCKED_RANGES.some((range) => inIpv6Cidr(ipBig, range.base, range.prefix));
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

async function assertPublicUrl(url: URL): Promise<void> {
	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('Only http/https URLs are supported.');
	}
	if (url.username || url.password) {
		throw new Error('URLs with embedded credentials are not allowed.');
	}

	const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
	if (!hostname) {
		throw new Error('Invalid URL hostname.');
	}

	if (isBlockedHostname(hostname)) {
		throw new Error('Blocked hostname.');
	}

	if (isIP(hostname)) {
		if (isPrivateIp(hostname)) {
			throw new Error('Blocked private or reserved IP address.');
		}
		return;
	}

	const records = await lookup(hostname, { all: true, verbatim: true });
	if (!records.length) {
		throw new Error('DNS lookup failed.');
	}

	for (const record of records) {
		if (isPrivateIp(record.address)) {
			throw new Error('Blocked private or reserved IP address.');
		}
	}
}

function buildHeaders(preferLanguage?: string): HeadersInit {
	return {
		Accept: 'text/html, text/plain;q=0.9, */*;q=0.8',
		'Accept-Language': preferLanguage ?? 'en-US,en;q=0.8',
		'User-Agent': 'BuildOS-AgenticChat/1.0'
	};
}

async function readResponseBody(
	response: Response,
	maxBytes: number
): Promise<{
	body: string;
	bytes: number;
}> {
	const contentLength = response.headers.get('content-length');
	if (contentLength) {
		const length = Number.parseInt(contentLength, 10);
		if (Number.isFinite(length) && length > maxBytes) {
			throw new Error('Response body exceeds size limit.');
		}
	}

	const reader = response.body?.getReader();
	if (!reader) {
		return { body: '', bytes: 0 };
	}

	const chunks: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.length;
		if (total > maxBytes) {
			throw new Error('Response body exceeds size limit.');
		}
		chunks.push(value);
	}

	const buffer = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		buffer.set(chunk, offset);
		offset += chunk.length;
	}

	const decoder = new TextDecoder('utf-8', { fatal: false });
	return { body: decoder.decode(buffer), bytes: total };
}

export async function fetchUrl(
	inputUrl: string,
	options: FetchUrlOptions = {}
): Promise<FetchUrlResult> {
	const fetcher = options.fetchFn ?? fetch;
	const allowRedirects = options.allowRedirects ?? true;
	const timeoutMs =
		options.timeoutMs ?? parseNumber(env.WEB_VISIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
	const maxBytes = options.maxBytes ?? parseNumber(env.WEB_VISIT_MAX_BYTES, DEFAULT_MAX_BYTES);
	const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

	let currentUrl = new URL(inputUrl);
	const start = Date.now();
	let redirectCount = 0;

	while (true) {
		await assertPublicUrl(currentUrl);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		let response: Response;

		try {
			response = await fetcher(currentUrl.toString(), {
				method: 'GET',
				redirect: 'manual',
				headers: buildHeaders(options.preferLanguage),
				signal: controller.signal
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Fetch failed: ${message}`);
		} finally {
			clearTimeout(timeout);
		}

		if (response.status >= 300 && response.status < 400) {
			if (!allowRedirects) {
				throw new Error('Redirect blocked by policy.');
			}

			const location = response.headers.get('location');
			if (!location) {
				throw new Error('Redirect location missing.');
			}

			redirectCount += 1;
			if (redirectCount > maxRedirects) {
				throw new Error('Too many redirects.');
			}

			currentUrl = new URL(location, currentUrl);
			continue;
		}

		if (response.status < 200 || response.status >= 400) {
			throw new Error(`Request failed (${response.status} ${response.statusText}).`);
		}

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
	}
}
