// apps/web/src/lib/server/gmail-relevance/scan-control-plane.fixtures.ts
import type { CreateEmailRelevanceScanManifestInput } from './scan-manifest';

export const SYNTHETIC_SCAN_REFERENCE_TIME = '2026-07-23T16:00:00.000Z';

export const SYNTHETIC_SCAN_USER_IDS = {
	primary: '10000000-0000-4000-8000-000000000001',
	other: '10000000-0000-4000-8000-000000000002'
} as const;

export const SYNTHETIC_SCAN_CONNECTION_IDS = [
	'20000000-0000-4000-8000-000000000003',
	'20000000-0000-4000-8000-000000000001',
	'20000000-0000-4000-8000-000000000002'
] as const;

export const SYNTHETIC_SCAN_PROJECTS = [
	{
		project_id: '30000000-0000-4000-8000-000000000002',
		profile_id: '40000000-0000-4000-8000-000000000002',
		profile_version: 4,
		profile_hash: 'b'.repeat(64)
	},
	{
		project_id: '30000000-0000-4000-8000-000000000001',
		profile_id: '40000000-0000-4000-8000-000000000001',
		profile_version: 7,
		profile_hash: 'a'.repeat(64)
	}
] as const;

export function syntheticScanManifestInput(): CreateEmailRelevanceScanManifestInput {
	return {
		user_id: SYNTHETIC_SCAN_USER_IDS.primary,
		idempotency_key: 'synthetic-idempotency-key-0001',
		connection_ids: [...SYNTHETIC_SCAN_CONNECTION_IDS],
		projects: SYNTHETIC_SCAN_PROJECTS.map((project) => ({ ...project })),
		window_start: '2026-06-23T16:00:00.000Z',
		window_end: SYNTHETIC_SCAN_REFERENCE_TIME,
		expires_at: '2026-07-24T04:00:00.000Z'
	};
}
