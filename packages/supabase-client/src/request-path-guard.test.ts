// packages/supabase-client/src/request-path-guard.test.ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
	isPlainStorageObjectPath,
	refuseDotSegmentFetch,
	urlHasDotSegment
} from './request-path-guard';

const USER = '11111111-1111-4111-8111-111111111111';
const CLIMB = '%2e%2e/'.repeat(5);

describe('isPlainStorageObjectPath', () => {
	it.each([
		`${USER}/22222222-2222-4222-8222-222222222222.webm`,
		`projects/${USER}/assets/${USER}/original.png`,
		'a/b_c-d.e.f'
	])('accepts the shapes the app writes: %s', (path) => {
		expect(isPlainStorageObjectPath(path)).toBe(true);
	});

	it.each([
		['a literal parent segment', `${USER}/../other/file.webm`],
		['an encoded parent segment', `${USER}/%2e%2e/other/file.webm`],
		['a half-encoded parent segment', `${USER}/.%2E/other/file.webm`],
		['a parent segment split by a tab', `${USER}/.\t./other/file.webm`],
		['a current-directory segment', `${USER}/./file.webm`],
		['a query string', `${USER}/file.webm?select=*`],
		['a fragment', `${USER}/file.webm#x`],
		['a backslash', `${USER}\\..\\file.webm`],
		['a leading slash', `/${USER}/file.webm`],
		['a doubled slash', `${USER}//file.webm`],
		['a space', `${USER}/my file.webm`],
		['an empty string', ''],
		['a non-string', null]
	])('rejects %s', (_label, path) => {
		expect(isPlainStorageObjectPath(path)).toBe(false);
	});
});

describe('urlHasDotSegment', () => {
	it.each([
		'https://ref.supabase.co/storage/v1/object/voice_notes/u/../x',
		'https://ref.supabase.co/storage/v1/object/voice_notes/u/%2e%2e/x',
		'https://ref.supabase.co/storage/v1/object/voice_notes/u/%2E./x',
		'https://ref.supabase.co/storage/v1/object/voice_notes/u/.\n./x',
		'https://ref.supabase.co/storage/v1/object/voice_notes/u\\..\\x',
		'https://ref.supabase.co/storage/v1/object/voice_notes/u/./x',
		'https://ref.supabase.co/storage/v1/object/voice_notes/u/..'
	])('flags %s', (url) => {
		expect(urlHasDotSegment(url)).toBe(true);
	});

	it.each([
		'https://ref.supabase.co/rest/v1/users?select=*&name=eq...',
		'https://ref.supabase.co/storage/v1/object/voice_notes/u/file..name.webm',
		'https://ref.supabase.co/storage/v1/object/onto-assets/projects/p/assets/a/original.png',
		'https://ref.supabase.co/rest/v1/tasks?or=(a.eq.1,b.eq.../..)#../x',
		'http://127.0.0.1:54321/auth/v1/user'
	])('leaves ordinary requests alone: %s', (url) => {
		expect(urlHasDotSegment(url)).toBe(false);
	});
});

// The real supabase-js storage client against a local server, so the test fails if the library
// or the runtime ever resolves the path differently from what the guard assumes.
describe('a service client and a climbing storage path', () => {
	const seen: string[] = [];
	let server: http.Server;
	let base = '';

	beforeAll(async () => {
		server = http.createServer((req, res) => {
			seen.push(`${req.method} ${req.url}`);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end('{"signedURL":"/object/sign/x?token=t"}');
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(() => new Promise<void>((resolve) => void server.close(() => resolve())));
	beforeEach(() => {
		seen.length = 0;
	});

	const client = (guarded: boolean) =>
		createClient(base, 'service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			...(guarded ? { global: { fetch: refuseDotSegmentFetch } } : {})
		});

	it('reaches the database API when nothing guards the request', async () => {
		const { data } = await client(false)
			.storage.from('voice_notes')
			.download(`${USER}/${CLIMB}rest/v1/users?select=*`);
		expect(data).not.toBeNull();
		expect(seen).toEqual(['GET /rest/v1/users?select=*']);
	});

	it('sends nothing for a download that would leave the bucket', async () => {
		const { data, error } = await client(true)
			.storage.from('voice_notes')
			.download(`${USER}/${CLIMB}rest/v1/users?select=*`);
		expect(data).toBeNull();
		expect(error).not.toBeNull();
		expect(seen).toEqual([]);
	});

	it('sends nothing for a signed link that would name another bucket', async () => {
		const { data, error } = await client(true)
			.storage.from('onto-assets')
			.createSignedUrl(`projects/p/assets/a/${CLIMB}other-bucket/victim/key.png`, 60);
		expect(data?.signedUrl ?? null).toBeNull();
		expect(error).not.toBeNull();
		expect(seen).toEqual([]);
	});

	it('still serves an ordinary object', async () => {
		const { error } = await client(true)
			.storage.from('voice_notes')
			.download(`${USER}/22222222-2222-4222-8222-222222222222.webm`);
		expect(error).toBeNull();
		expect(seen).toEqual([
			`GET /storage/v1/object/voice_notes/${USER}/22222222-2222-4222-8222-222222222222.webm`
		]);
	});
});
