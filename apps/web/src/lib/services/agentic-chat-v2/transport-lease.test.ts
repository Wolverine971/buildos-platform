// apps/web/src/lib/services/agentic-chat-v2/transport-lease.test.ts
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	AgenticChatTransportLeaseError,
	issueAgenticChatTransportLease,
	verifyAgenticChatTransportLease,
	type AgenticChatTransportLeaseBinding
} from './transport-lease.server';

const SECRET = 'agentic-chat-transport-test-secret-32-bytes-minimum';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'd1000000-0000-4000-8000-000000000002';
const ENTITY_ID = 'd2000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'd3000000-0000-4000-8000-000000000001';
const DECISION_ID = 'd4000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-08-03T00:00:00.000Z');

const binding: AgenticChatTransportLeaseBinding = {
	userId: USER_ID,
	clientTurnId: 'client-turn-1',
	streamRunId: 'stream-run-1',
	context: {
		type: 'project',
		entityId: ENTITY_ID,
		projectId: PROJECT_ID
	}
};

function issue(overrides: Partial<Parameters<typeof issueAgenticChatTransportLease>[0]> = {}) {
	return issueAgenticChatTransportLease({
		secret: SECRET,
		...binding,
		mode: 'legacy_sse',
		decisionId: DECISION_ID,
		nowMs: NOW,
		ttlMs: 60_000,
		...overrides
	});
}

function resignClaims(claims: unknown, rawJson = JSON.stringify(claims)): string {
	const encoded = Buffer.from(rawJson, 'utf8').toString('base64url');
	const signingInput = `actl1.${encoded}`;
	const signature = createHmac('sha256', SECRET).update(signingInput, 'utf8').digest('base64url');
	return `${signingInput}.${signature}`;
}

describe('Agentic Chat transport leases', () => {
	it('round-trips an exact signed legacy lease and preserves its decision', () => {
		const lease = issue();
		const claims = verifyAgenticChatTransportLease({
			secret: SECRET,
			token: lease.token,
			expected: binding,
			nowMs: NOW + 1_000
		});

		expect(lease).toMatchObject({
			mode: 'legacy_sse',
			contractVersion: 'legacy_internal_v1',
			decisionId: DECISION_ID,
			expiresAt: '2026-08-03T00:01:00.000Z'
		});
		expect(claims).toMatchObject({
			...binding,
			mode: 'legacy_sse',
			contractVersion: 'legacy_internal_v1',
			decisionId: DECISION_ID,
			issuedAtMs: NOW,
			expiresAtMs: NOW + 60_000
		});
	});

	it('rejects token and signature tampering', () => {
		const lease = issue();
		const parts = lease.token.split('.');
		const payloadTampered = `${parts[0]}.${parts[1]}a.${parts[2]}`;
		const signatureTampered = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -1)}a`;

		for (const token of [payloadTampered, signatureTampered]) {
			expect(() =>
				verifyAgenticChatTransportLease({
					secret: SECRET,
					token,
					expected: binding,
					nowMs: NOW + 1
				})
			).toThrow(AgenticChatTransportLeaseError);
		}
	});

	it('rejects correctly signed but noncanonical or extended claim envelopes', () => {
		const lease = issue();
		const encoded = lease.token.split('.')[1]!;
		const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
			string,
			unknown
		>;
		for (const token of [
			resignClaims({ ...claims, unexpected: true }),
			resignClaims(claims, ` ${JSON.stringify(claims)}`)
		]) {
			expect(() =>
				verifyAgenticChatTransportLease({
					secret: SECRET,
					token,
					expected: binding,
					nowMs: NOW + 1
				})
			).toThrowError(expect.objectContaining({ code: 'invalid_token' }));
		}
	});

	it.each([
		['user', { userId: OTHER_USER_ID }],
		['client turn', { clientTurnId: 'other-client-turn' }],
		['stream', { streamRunId: 'other-stream' }],
		['context type', { context: { ...binding.context, type: 'task' } }],
		['context entity', { context: { ...binding.context, entityId: OTHER_USER_ID } }],
		['context project', { context: { ...binding.context, projectId: OTHER_USER_ID } }]
	] as const)('rejects cross-binding replay for %s', (_label, override) => {
		const lease = issue();
		expect(() =>
			verifyAgenticChatTransportLease({
				secret: SECRET,
				token: lease.token,
				expected: { ...binding, ...override },
				nowMs: NOW + 1
			})
		).toThrowError(expect.objectContaining({ code: 'binding_mismatch' }));
	});

	it('rejects expired and materially future-issued leases', () => {
		const expired = issue({ ttlMs: 1_000 });
		expect(() =>
			verifyAgenticChatTransportLease({
				secret: SECRET,
				token: expired.token,
				expected: binding,
				nowMs: NOW + 1_000
			})
		).toThrowError(expect.objectContaining({ code: 'expired' }));

		const future = issue({ nowMs: NOW + 60_000 });
		expect(() =>
			verifyAgenticChatTransportLease({
				secret: SECRET,
				token: future.token,
				expected: binding,
				nowMs: NOW
			})
		).toThrowError(expect.objectContaining({ code: 'not_yet_valid' }));
	});

	it('invalidates only worker leases across an emergency kill epoch', () => {
		const worker = issue({ mode: 'worker_realtime', killEpoch: 2 });
		expect(() =>
			verifyAgenticChatTransportLease({
				secret: SECRET,
				token: worker.token,
				expected: binding,
				nowMs: NOW + 1,
				currentKillEpoch: 3
			})
		).toThrowError(expect.objectContaining({ code: 'transport_renegotiate' }));

		const legacy = issue({ killEpoch: 2 });
		expect(
			verifyAgenticChatTransportLease({
				secret: SECRET,
				token: legacy.token,
				expected: binding,
				nowMs: NOW + 1,
				currentKillEpoch: 3
			}).mode
		).toBe('legacy_sse');
	});

	it('rejects weak secrets, malformed bindings, and excessive lifetimes', () => {
		expect(() => issue({ secret: 'short' })).toThrowError(
			expect.objectContaining({ code: 'invalid_secret' })
		);
		expect(() => issue({ clientTurnId: ' padded ' })).toThrowError(
			expect.objectContaining({ code: 'invalid_binding' })
		);
		expect(() => issue({ ttlMs: 5 * 60_000 + 1 })).toThrowError(
			expect.objectContaining({ code: 'invalid_binding' })
		);
		expect(() => issue({ nowMs: 8_640_000_000_000_000, ttlMs: 1 })).toThrowError(
			expect.objectContaining({ code: 'invalid_binding' })
		);
	});
});
