// packages/buildos-mcp-server/src/config.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL, loadConfig } from './config';

describe('loadConfig', () => {
	it('requires an agent token', () => {
		expect(() => loadConfig({})).toThrow(/BUILDOS_AGENT_TOKEN is required/);
	});

	it('defaults the base URL and trims a trailing slash', () => {
		expect(loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x' })).toEqual({
			baseUrl: DEFAULT_BASE_URL,
			token: 'boca_x'
		});
		expect(
			loadConfig({
				BUILDOS_AGENT_TOKEN: 'boca_x',
				BUILDOS_BASE_URL: 'https://staging.build-os.com/'
			}).baseUrl
		).toBe('https://staging.build-os.com');
	});

	it('rejects a non-http base URL', () => {
		expect(() =>
			loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x', BUILDOS_BASE_URL: 'ftp://nope' })
		).toThrow(/must be an http\(s\) URL/);
	});

	it('allows plain http only for loopback hosts', () => {
		expect(
			loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x', BUILDOS_BASE_URL: 'http://localhost:5173' })
				.baseUrl
		).toBe('http://localhost:5173');
		expect(
			loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x', BUILDOS_BASE_URL: 'http://127.0.0.1:5173' })
				.baseUrl
		).toBe('http://127.0.0.1:5173');
		// A typo'd http URL to a real host would send the agent key in cleartext.
		expect(() =>
			loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x', BUILDOS_BASE_URL: 'http://build-os.com' })
		).toThrow(/must use https for non-localhost hosts/);
	});

	it('accepts a known profile and rejects an unknown one', () => {
		expect(
			loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x', BUILDOS_MCP_PROFILE: 'chatgpt_data_app' })
				.profile
		).toBe('chatgpt_data_app');
		expect(() =>
			loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x', BUILDOS_MCP_PROFILE: 'wat' })
		).toThrow(/BUILDOS_MCP_PROFILE must be one of/);
	});

	it('omits profile when unset', () => {
		expect(loadConfig({ BUILDOS_AGENT_TOKEN: 'boca_x' }).profile).toBeUndefined();
	});
});
