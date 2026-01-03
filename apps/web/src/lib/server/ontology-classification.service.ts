// apps/web/src/lib/server/ontology-classification.service.ts
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';
import type { OntologyClassificationRequest } from '@buildos/shared-types';

const WORKER_URL = PUBLIC_RAILWAY_WORKER_URL;
const REQUEST_TIMEOUT_MS = 8000;

export async function classifyOntologyEntity(
	request: OntologyClassificationRequest
): Promise<void> {
	if (!WORKER_URL) {
		console.warn('[Ontology Classification] Worker URL not configured');
		return;
	}

	if (!PRIVATE_RAILWAY_WORKER_TOKEN) {
		console.warn('[Ontology Classification] Worker auth token not configured');
		return;
	}

	const response = await fetch(`${WORKER_URL}/classify/ontology`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`
		},
		body: JSON.stringify(request),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	});

	if (!response.ok) {
		const payload = await response.json().catch(() => null);
		const message = payload?.error || `HTTP ${response.status}`;
		throw new Error(`Worker classification failed: ${message}`);
	}
}
