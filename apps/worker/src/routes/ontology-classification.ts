// apps/worker/src/routes/ontology-classification.ts
import type { Application } from 'express';

import { isWorkerAuthorized } from '../http/auth';
import { getErrorMessage } from '../http/errors';
import { logWorkerError } from '../lib/errorLogger';
import { classifyOntologyEntity } from '../workers/ontology/ontologyClassifier';

const VALID_ENTITY_TYPES = new Set(['task', 'plan', 'goal', 'risk', 'milestone', 'document']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Immediate ontology classification endpoint used by fire-and-forget callers. */
export function registerOntologyClassificationRoute(app: Application): void {
	app.post('/classify/ontology', async (req, res) => {
		try {
			if (!isWorkerAuthorized(req.headers.authorization)) {
				return res.status(401).json({ error: 'Unauthorized' });
			}

			const { entityType, entityId, userId, classificationSource } = req.body || {};

			if (!entityType || !entityId || !userId || !classificationSource) {
				return res.status(400).json({
					error: 'entityType, entityId, userId, and classificationSource are required'
				});
			}

			if (classificationSource !== 'create_modal') {
				return res.status(400).json({ error: 'Invalid classificationSource' });
			}

			if (!VALID_ENTITY_TYPES.has(entityType)) {
				return res.status(400).json({ error: 'Invalid entityType' });
			}

			if (!UUID_PATTERN.test(entityId) || !UUID_PATTERN.test(userId)) {
				return res.status(400).json({ error: 'Invalid entityId or userId format' });
			}

			await classifyOntologyEntity({
				entityType,
				entityId,
				userId,
				classificationSource
			});

			return res.status(202).json({ success: true });
		} catch (error) {
			console.error('[Ontology Classification] Failed:', error);
			await logWorkerError(error, {
				userId: req.body?.userId,
				endpoint: '/classify/ontology',
				httpMethod: 'POST',
				operationType: 'ontology_classification',
				errorType: 'api_error',
				severity: 'error',
				metadata: {
					entityType: req.body?.entityType,
					entityId: req.body?.entityId,
					classificationSource: req.body?.classificationSource
				}
			});
			return res.status(500).json({
				error: 'Failed to classify ontology entity',
				message: getErrorMessage(error)
			});
		}
	});
}
