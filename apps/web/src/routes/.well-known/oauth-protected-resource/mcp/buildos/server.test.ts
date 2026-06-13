// apps/web/src/routes/.well-known/oauth-protected-resource/mcp/buildos/server.test.ts
import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { GET } from './+server';

/**
 * MCP authorization (spec §6.3): the protected-resource metadata `resource`
 * value must exactly match the URL the user enters into the client, including
 * path. Clients reject the connector if it drifts.
 */
describe('GET /.well-known/oauth-protected-resource/mcp/buildos', () => {
	async function fetchMetadata(origin: string) {
		const response = await GET({
			url: new URL(`${origin}/.well-known/oauth-protected-resource/mcp/buildos`)
		} as unknown as RequestEvent);
		return { response, body: await response.json() };
	}

	it('returns the exact MCP resource URL including path', async () => {
		const { body } = await fetchMetadata('https://build-os.com');
		expect(body.resource).toBe('https://build-os.com/mcp/buildos');
		expect(body.authorization_servers).toEqual(['https://build-os.com']);
	});

	it('advertises read, write, and offline scopes with header-only bearer auth', async () => {
		const { body } = await fetchMetadata('https://build-os.com');
		expect(body.scopes_supported).toEqual(
			expect.arrayContaining(['buildos.read', 'buildos.write', 'offline_access'])
		);
		expect(body.bearer_methods_supported).toEqual(['header']);
	});

	it('derives the resource from the request origin', async () => {
		const { body } = await fetchMetadata('https://staging.build-os.com');
		expect(body.resource).toBe('https://staging.build-os.com/mcp/buildos');
	});
});
