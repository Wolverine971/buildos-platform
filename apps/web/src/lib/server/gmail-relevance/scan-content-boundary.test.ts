// apps/web/src/lib/server/gmail-relevance/scan-content-boundary.test.ts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMAIL_RELEVANCE_SCAN_SAFE_ERROR_CODES } from './scan-state';
import { serializeEmailRelevanceScanJobMetadata } from './scan-job';
import { buildEmailRelevanceScanManifest } from './scan-manifest';
import {
	SYNTHETIC_SCAN_REFERENCE_TIME,
	syntheticScanManifestInput
} from './scan-control-plane.fixtures';

const FORBIDDEN_DURABLE_KEYS = new Set([
	'email_address',
	'gmail_query',
	'mailbox_query',
	'provider_message_id',
	'provider_thread_id',
	'raw_cursor',
	'gmail_link',
	'profile_term',
	'project_alias',
	'sender',
	'recipient',
	'domain',
	'header',
	'label',
	'subject',
	'snippet',
	'body',
	'attachment',
	'model_output',
	'free_form_message'
]);

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
	if (Array.isArray(value)) {
		for (const entry of value) collectKeys(entry, keys);
		return keys;
	}
	if (!value || typeof value !== 'object') return keys;
	for (const [key, entry] of Object.entries(value)) {
		keys.add(key);
		collectKeys(entry, keys);
	}
	return keys;
}

describe('email relevance scan content boundary', () => {
	it('keeps manifests, jobs, and fixed error codes free of forbidden durable fields', () => {
		const manifest = buildEmailRelevanceScanManifest(
			syntheticScanManifestInput(),
			SYNTHETIC_SCAN_REFERENCE_TIME
		);
		const job = JSON.parse(
			serializeEmailRelevanceScanJobMetadata({
				run_id: '50000000-0000-4000-8000-000000000001',
				connection_scope_id: '60000000-0000-4000-8000-000000000001',
				checkpoint_version: 0,
				processing_token: '70000000-0000-4000-8000-000000000001'
			})
		) as unknown;
		const durableKeys = collectKeys({ manifest, job });

		for (const forbiddenKey of FORBIDDEN_DURABLE_KEYS) {
			expect(durableKeys.has(forbiddenKey), forbiddenKey).toBe(false);
		}
		expect(EMAIL_RELEVANCE_SCAN_SAFE_ERROR_CODES.join(' ')).not.toMatch(
			/(?:@|gmail\.com|subject|snippet|body|attachment|sender|recipient)/i
		);
	});

	it('has no import path from the Slice 2 contracts to provider or model code', async () => {
		const moduleNames = [
			'scan-manifest.ts',
			'scan-state.ts',
			'scan-budget.ts',
			'scan-job.ts',
			'scan-control-plane.ts',
			'scan-synthetic-executor.ts'
		];
		for (const moduleName of moduleNames) {
			const source = await readFile(
				fileURLToPath(new URL(`./${moduleName}`, import.meta.url)),
				'utf8'
			);
			const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
				(match) => match[1]
			);

			expect(imports.join(' '), moduleName).not.toMatch(
				/(?:gmail-read|googleapis|smart-llm|openrouter|openai|embedding)/i
			);
		}
	});
});
