#!/usr/bin/env node
// apps/web/scripts/mcp-connector-repro.mjs
//
// One-command repro for the BuildOS MCP connector. Packages the protocol /
// transport / OAuth-challenge assertions (which also exist as unit tests) into a
// script an outside reviewer can run against a live deployment.
//
// Usage:
//   node apps/web/scripts/mcp-connector-repro.mjs
//   MCP_REPRO_BASE_URL=https://build-os.com node apps/web/scripts/mcp-connector-repro.mjs
//   BUILDOS_AGENT_TOKEN=boca_... MCP_REPRO_BASE_URL=https://build-os.com \
//     node apps/web/scripts/mcp-connector-repro.mjs
//
//   # or via pnpm:
//   pnpm --filter @buildos/web mcp:repro
//
// Env:
//   MCP_REPRO_BASE_URL   Base origin to probe (default http://localhost:5173)
//   BUILDOS_AGENT_TOKEN  Optional bearer (static boca_ key or OAuth access token).
//                        When set, the authenticated initialize/tools.list/tools.call
//                        probes run too.
//
// Exit code is non-zero if any check fails.

const BASE_URL = (process.env.MCP_REPRO_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const TOKEN = process.env.BUILDOS_AGENT_TOKEN || '';
const MCP_URL = `${BASE_URL}/mcp/buildos`;
const PROTOCOL_VERSION = '2025-06-18';

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
	passed++;
	console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  ${detail}` : ''}`);
}

function fail(name, detail = '') {
	failed++;
	console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  ${detail}` : ''}`);
}

function skip(name, detail = '') {
	console.log(`  \x1b[33mSKIP\x1b[0m ${name}${detail ? `  ${detail}` : ''}`);
}

function check(name, condition, detail = '') {
	if (condition) ok(name, detail);
	else fail(name, detail);
}

function jsonHeaders(extra = {}) {
	return {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
		'MCP-Protocol-Version': PROTOCOL_VERSION,
		...extra
	};
}

function rpcBody(method, params, id = 1) {
	return JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
}

async function safeJson(response) {
	try {
		const text = await response.text();
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

// --- Metadata documents ------------------------------------------------------

async function checkProtectedResourceMetadata() {
	console.log('\n[OAuth Protected Resource Metadata]');
	try {
		const res = await fetch(`${BASE_URL}/.well-known/oauth-protected-resource/mcp/buildos`);
		check('returns 200', res.status === 200, `(got ${res.status})`);
		const body = await safeJson(res);
		check(
			'resource matches the MCP endpoint',
			body?.resource === MCP_URL,
			`(${body?.resource})`
		);
		check(
			'scopes_supported includes buildos.write',
			Array.isArray(body?.scopes_supported) && body.scopes_supported.includes('buildos.write')
		);
		check(
			'bearer_methods_supported is ["header"]',
			Array.isArray(body?.bearer_methods_supported) &&
				body.bearer_methods_supported.length === 1 &&
				body.bearer_methods_supported[0] === 'header'
		);
	} catch (error) {
		fail('protected-resource metadata reachable', String(error));
	}
}

async function checkAuthorizationServerMetadata() {
	console.log('\n[OAuth Authorization Server Metadata]');
	try {
		const res = await fetch(`${BASE_URL}/.well-known/oauth-authorization-server`);
		check('returns 200', res.status === 200, `(got ${res.status})`);
		const body = await safeJson(res);
		check('has authorization_endpoint', typeof body?.authorization_endpoint === 'string');
		check('has token_endpoint', typeof body?.token_endpoint === 'string');
		check('has registration_endpoint', typeof body?.registration_endpoint === 'string');
		check(
			'code_challenge_methods_supported includes S256',
			Array.isArray(body?.code_challenge_methods_supported) &&
				body.code_challenge_methods_supported.includes('S256')
		);
	} catch (error) {
		fail('authorization-server metadata reachable', String(error));
	}
}

// --- Unauthenticated challenge ----------------------------------------------

async function checkUnauthChallenge() {
	console.log('\n[Unauthenticated initialize → OAuth challenge]');
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: jsonHeaders(),
			body: rpcBody('initialize', { protocolVersion: PROTOCOL_VERSION })
		});
		check('returns 401', res.status === 401, `(got ${res.status})`);
		const wwwAuth = res.headers.get('www-authenticate') || '';
		check(
			'WWW-Authenticate advertises resource_metadata',
			wwwAuth.includes('resource_metadata'),
			`(${wwwAuth.slice(0, 80)})`
		);
	} catch (error) {
		fail('unauth challenge reachable', String(error));
	}
}

// --- Negative transport probes ----------------------------------------------

async function checkNegativeProbes() {
	console.log('\n[Negative transport probes]');

	// Disallowed browser Origin → 403 before auth.
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: jsonHeaders({ Origin: 'https://evil.example.com' }),
			body: rpcBody('initialize', { protocolVersion: PROTOCOL_VERSION })
		});
		check('disallowed Origin → 403', res.status === 403, `(got ${res.status})`);
	} catch (error) {
		fail('origin probe reachable', String(error));
	}

	// Wrong Content-Type → 415.
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain', Accept: 'application/json' },
			body: rpcBody('initialize', { protocolVersion: PROTOCOL_VERSION })
		});
		check('non-JSON Content-Type → 415', res.status === 415, `(got ${res.status})`);
	} catch (error) {
		fail('content-type probe reachable', String(error));
	}

	// Accept excludes JSON and SSE → 406.
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'text/html' },
			body: rpcBody('initialize', { protocolVersion: PROTOCOL_VERSION })
		});
		check('Accept excludes json/sse → 406', res.status === 406, `(got ${res.status})`);
	} catch (error) {
		fail('accept probe reachable', String(error));
	}

	// Unsupported MCP-Protocol-Version → 400.
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: jsonHeaders({ 'MCP-Protocol-Version': '1999-01-01' }),
			body: rpcBody('initialize', { protocolVersion: PROTOCOL_VERSION })
		});
		check('unsupported protocol version → 400', res.status === 400, `(got ${res.status})`);
	} catch (error) {
		fail('protocol-version probe reachable', String(error));
	}

	// JSON-RPC batch arrays are rejected (removed in 2025-06-18) → 400 with the
	// dedicated guard's message, not the generic invalid-request fallback.
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: jsonHeaders(),
			body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'initialize' }])
		});
		const body = await safeJson(res);
		check(
			'batch array → 400 with explicit batch rejection',
			res.status === 400 && /batch/i.test(body?.error?.message ?? ''),
			`(got ${res.status}: ${body?.error?.message ?? 'no message'})`
		);
	} catch (error) {
		fail('batch probe reachable', String(error));
	}

	// Client notifications (no id) must be accepted with 202 and no body — even
	// before auth (Streamable HTTP transport requirement).
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: jsonHeaders(),
			body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled' })
		});
		const text = await res.text();
		check(
			'notification (no id) → 202 with empty body',
			res.status === 202 && text === '',
			`(got ${res.status}, body ${JSON.stringify(text.slice(0, 40))})`
		);
	} catch (error) {
		fail('notification probe reachable', String(error));
	}

	// GET is not a server→client stream in v1: unauthenticated GET → 401 challenge.
	try {
		const res = await fetch(MCP_URL, { method: 'GET' });
		check('unauthenticated GET → 401', res.status === 401, `(got ${res.status})`);
	} catch (error) {
		fail('GET probe reachable', String(error));
	}
}

// --- Authenticated happy path (optional) ------------------------------------

async function checkAuthenticatedFlow() {
	console.log('\n[Authenticated initialize / tools.list / tools.call]');
	if (!TOKEN) {
		console.log('  \x1b[33mSKIP\x1b[0m no BUILDOS_AGENT_TOKEN set');
		return;
	}
	const authHeaders = jsonHeaders({ Authorization: `Bearer ${TOKEN}` });

	// initialize
	let initOk = false;
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: authHeaders,
			body: rpcBody('initialize', { protocolVersion: PROTOCOL_VERSION })
		});
		const body = await safeJson(res);
		initOk = res.status === 200 && typeof body?.result?.protocolVersion === 'string';
		check('initialize → 200 with protocolVersion', initOk, `(got ${res.status})`);
		check('serverInfo.name present', typeof body?.result?.serverInfo?.name === 'string');
	} catch (error) {
		fail('authenticated initialize reachable', String(error));
	}

	// tools/list
	let firstReadTool = null;
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: authHeaders,
			body: rpcBody('tools/list', undefined, 2)
		});
		const body = await safeJson(res);
		const tools = body?.result?.tools;
		check(
			'tools/list → 200 with non-empty tools[]',
			res.status === 200 && Array.isArray(tools) && tools.length > 0,
			`(${Array.isArray(tools) ? tools.length : 0} tools)`
		);
		if (Array.isArray(tools)) {
			// Only ever invoke a confirmed read-only tool. This script runs with
			// real tokens against live accounts; never fall back to an arbitrary
			// (possibly write) tool.
			firstReadTool =
				tools.find((t) => t?.name === 'list_onto_projects') ||
				tools.find((t) => t?.annotations?.readOnlyHint === true) ||
				null;
		}
	} catch (error) {
		fail('tools/list reachable', String(error));
	}

	// tools/call (a read tool)
	if (firstReadTool?.name) {
		try {
			const res = await fetch(MCP_URL, {
				method: 'POST',
				headers: authHeaders,
				body: rpcBody('tools/call', { name: firstReadTool.name, arguments: {} }, 3)
			});
			const body = await safeJson(res);
			check(
				`tools/call(${firstReadTool.name}) → 200 with content[]`,
				res.status === 200 && Array.isArray(body?.result?.content),
				`(got ${res.status})`
			);
		} catch (error) {
			fail('tools/call reachable', String(error));
		}
	} else {
		skip('tools/call', '(no read-only tool exposed by this grant; refusing to call a write tool)');
	}

	// Authenticated GET → 405: v1 offers no server→client SSE stream.
	try {
		const res = await fetch(MCP_URL, {
			method: 'GET',
			headers: { Authorization: `Bearer ${TOKEN}` }
		});
		check(
			'authenticated GET → 405 with Allow header',
			res.status === 405 && /POST/.test(res.headers.get('allow') ?? ''),
			`(got ${res.status}, Allow: ${res.headers.get('allow') ?? 'none'})`
		);
	} catch (error) {
		fail('authenticated GET probe reachable', String(error));
	}

	// ping → empty result
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: authHeaders,
			body: rpcBody('ping', undefined, 4)
		});
		const body = await safeJson(res);
		check(
			'ping → 200 with empty result',
			res.status === 200 && body?.result && Object.keys(body.result).length === 0,
			`(got ${res.status})`
		);
	} catch (error) {
		fail('ping reachable', String(error));
	}

	// resources/list → resources[] (may be empty if the grant scopes 0 projects)
	try {
		const res = await fetch(MCP_URL, {
			method: 'POST',
			headers: authHeaders,
			body: rpcBody('resources/list', undefined, 5)
		});
		const body = await safeJson(res);
		check(
			'resources/list → 200 with resources[]',
			res.status === 200 && Array.isArray(body?.result?.resources),
			`(${Array.isArray(body?.result?.resources) ? body.result.resources.length : 'n/a'} resources)`
		);
	} catch (error) {
		fail('resources/list reachable', String(error));
	}
}

async function main() {
	console.log(`BuildOS MCP connector repro → ${MCP_URL}`);
	console.log(
		TOKEN ? '(authenticated probes enabled)' : '(no token: running negative probes only)'
	);

	await checkProtectedResourceMetadata();
	await checkAuthorizationServerMetadata();
	await checkUnauthChallenge();
	await checkNegativeProbes();
	await checkAuthenticatedFlow();

	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error('repro crashed:', error);
	process.exit(1);
});
