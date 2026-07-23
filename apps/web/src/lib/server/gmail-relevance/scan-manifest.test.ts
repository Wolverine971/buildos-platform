// apps/web/src/lib/server/gmail-relevance/scan-manifest.test.ts
import { describe, expect, it } from 'vitest';
import { buildEmailRelevanceScanManifest, EmailRelevanceScanManifestError } from './scan-manifest';
import {
	SYNTHETIC_SCAN_REFERENCE_TIME,
	syntheticScanManifestInput
} from './scan-control-plane.fixtures';

describe('buildEmailRelevanceScanManifest', () => {
	it('canonicalizes connection and project order into one stable manifest hash', () => {
		const input = syntheticScanManifestInput();
		const forward = buildEmailRelevanceScanManifest(input, SYNTHETIC_SCAN_REFERENCE_TIME);
		const reversed = buildEmailRelevanceScanManifest(
			{
				...input,
				connection_ids: [...input.connection_ids].reverse(),
				projects: [...input.projects].reverse()
			},
			SYNTHETIC_SCAN_REFERENCE_TIME
		);

		expect(reversed.manifest_hash).toBe(forward.manifest_hash);
		expect(reversed.configuration).toEqual(forward.configuration);
		expect(forward.configuration.connection_ids).toEqual([...input.connection_ids].sort());
		expect(forward.configuration.projects.map((project) => project.project_id)).toEqual(
			input.projects.map((project) => project.project_id).sort()
		);
		expect(Object.isFrozen(forward)).toBe(true);
		expect(Object.isFrozen(forward.configuration)).toBe(true);
		expect(Object.isFrozen(forward.configuration.connection_ids)).toBe(true);
		expect(Object.isFrozen(forward.configuration.projects[0])).toBe(true);
	});

	it('hashes the client idempotency key without retaining its plaintext', () => {
		const input = syntheticScanManifestInput();
		const manifest = buildEmailRelevanceScanManifest(input, SYNTHETIC_SCAN_REFERENCE_TIME);
		const serialized = JSON.stringify(manifest);

		expect(manifest.idempotency_key_hash).toMatch(/^[a-f0-9]{64}$/);
		expect(serialized).not.toContain(input.idempotency_key);
		expect(manifest.configuration).not.toHaveProperty('idempotency_key');
	});

	it('uses the same idempotency hash but a different manifest hash for altered input', () => {
		const originalInput = syntheticScanManifestInput();
		const alteredInput = syntheticScanManifestInput();
		alteredInput.projects[0]!.profile_hash = 'c'.repeat(64);
		const original = buildEmailRelevanceScanManifest(
			originalInput,
			SYNTHETIC_SCAN_REFERENCE_TIME
		);
		const altered = buildEmailRelevanceScanManifest(
			alteredInput,
			SYNTHETIC_SCAN_REFERENCE_TIME
		);

		expect(altered.idempotency_key_hash).toBe(original.idempotency_key_hash);
		expect(altered.manifest_hash).not.toBe(original.manifest_hash);
	});

	it('normalizes equivalent timestamp offsets before hashing', () => {
		const utcInput = syntheticScanManifestInput();
		const offsetInput = {
			...syntheticScanManifestInput(),
			window_start: '2026-06-23T12:00:00.000-04:00',
			window_end: '2026-07-23T12:00:00.000-04:00',
			expires_at: '2026-07-24T00:00:00.000-04:00'
		};

		expect(
			buildEmailRelevanceScanManifest(offsetInput, SYNTHETIC_SCAN_REFERENCE_TIME)
				.manifest_hash
		).toBe(
			buildEmailRelevanceScanManifest(utcInput, SYNTHETIC_SCAN_REFERENCE_TIME).manifest_hash
		);
	});

	it('locks the manual 30-day pilot and derives immutable per-account and global budgets', () => {
		const manifest = buildEmailRelevanceScanManifest(
			syntheticScanManifestInput(),
			SYNTHETIC_SCAN_REFERENCE_TIME
		);

		expect(manifest.configuration).toMatchObject({
			start_mode: 'manual',
			message_cap_per_connection: 1_000,
			metadata_batch_ceiling: 50,
			query_policy_version: 'inbox-sent-exclude-spam-trash-drafts-v1',
			per_connection_budgets: {
				gmail_quota_units: 20_050,
				runtime_ms: 1_200_000,
				raw_content_bytes: 0,
				model_tokens: 0,
				model_cost_micros: 0
			},
			global_budgets: {
				gmail_quota_units: 60_150,
				runtime_ms: 3_600_000,
				raw_content_bytes: 0,
				model_tokens: 0,
				model_cost_micros: 0
			}
		});
	});

	it('rejects duplicate scopes instead of silently changing their meaning', () => {
		const duplicateConnection = syntheticScanManifestInput();
		duplicateConnection.connection_ids[1] = duplicateConnection.connection_ids[0]!;
		const duplicateProject = syntheticScanManifestInput();
		duplicateProject.projects[1]!.project_id = duplicateProject.projects[0]!.project_id;

		expect(() =>
			buildEmailRelevanceScanManifest(duplicateConnection, SYNTHETIC_SCAN_REFERENCE_TIME)
		).toThrowError(
			expect.objectContaining<EmailRelevanceScanManifestError>({
				code: 'duplicate_connection'
			})
		);
		expect(() =>
			buildEmailRelevanceScanManifest(duplicateProject, SYNTHETIC_SCAN_REFERENCE_TIME)
		).toThrowError(
			expect.objectContaining<EmailRelevanceScanManifestError>({
				code: 'duplicate_project'
			})
		);
	});

	it('rejects future, non-30-day, expired, and unbounded manifests with fixed codes', () => {
		const wrongWindow = syntheticScanManifestInput();
		wrongWindow.window_start = '2026-06-24T16:00:00.000Z';
		const futureWindow = syntheticScanManifestInput();
		futureWindow.window_end = '2026-07-23T16:00:01.000Z';
		futureWindow.window_start = '2026-06-23T16:00:01.000Z';
		const expired = syntheticScanManifestInput();
		expired.expires_at = SYNTHETIC_SCAN_REFERENCE_TIME;
		const unbounded = syntheticScanManifestInput();
		unbounded.expires_at = '2026-07-25T16:00:00.000Z';

		for (const input of [wrongWindow, futureWindow]) {
			expect(() =>
				buildEmailRelevanceScanManifest(input, SYNTHETIC_SCAN_REFERENCE_TIME)
			).toThrowError(expect.objectContaining({ code: 'invalid_window' }));
		}
		for (const input of [expired, unbounded]) {
			expect(() =>
				buildEmailRelevanceScanManifest(input, SYNTHETIC_SCAN_REFERENCE_TIME)
			).toThrowError(expect.objectContaining({ code: 'invalid_expiration' }));
		}
	});

	it('rejects unknown fields so content cannot hitchhike in the manifest', () => {
		const input = {
			...syntheticScanManifestInput(),
			mailbox_query: 'forbidden-synthetic-value'
		};

		expect(() =>
			buildEmailRelevanceScanManifest(input, SYNTHETIC_SCAN_REFERENCE_TIME)
		).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
	});
});
