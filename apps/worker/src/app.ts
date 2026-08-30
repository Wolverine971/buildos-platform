// apps/worker/src/app.ts
import cors from 'cors';
import express, { type Application } from 'express';

import { isWorkerAuthorized } from './http/auth';
import type { GeneralWorkerRuntimeLifecycleHealth } from './lib/generalWorkerRuntimeLifecycle';
import { createRequestCorrelationId, runWithRequestCorrelation } from './lib/queueCorrelation';
import type { WorkerEventLoopLagMonitor } from './lib/workerOperationalHealth';
import { jsonParseErrorHandler } from './middleware/jsonError';
import { registerEmailTrackingRoute } from './routes/email-tracking';
import { registerHealthRoute } from './routes/health';
import { registerOntologyClassificationRoute } from './routes/ontology-classification';
import { registerBriefQueueRoute } from './routes/queue/brief';
import { registerGeneralEnqueueRoutes } from './routes/queue/enqueue';
import { registerQueueInspectionRoutes } from './routes/queue/inspection';
import smsScheduledRoutes from './routes/sms/scheduled';

const PUBLIC_WORKER_PATHS = new Set(['/health']);

type GeneralWorkerAppOptions = {
	eventLoopLagMonitor: Pick<WorkerEventLoopLagMonitor, 'getSnapshot'>;
	getWorkerHealth: () => GeneralWorkerRuntimeLifecycleHealth;
};

/**
 * Compose the general worker's HTTP surface without starting its listener,
 * queue consumer, or scheduler. Process lifecycle belongs to bootstrap.ts.
 */
export function createGeneralWorkerApp({
	eventLoopLagMonitor,
	getWorkerHealth: readWorkerHealth
}: GeneralWorkerAppOptions): Application {
	const app = express();
	const allowedOrigins = getAllowedOrigins();

	app.use(
		cors({
			origin(origin, callback) {
				if (!origin) return callback(null, true);
				if (allowedOrigins.includes(origin)) return callback(null, true);
				return callback(new Error('Not allowed by CORS'));
			},
			credentials: true
		})
	);

	app.use(express.json());
	app.use(jsonParseErrorHandler);

	app.use((req, res, next) => {
		const correlationId = createRequestCorrelationId(req.headers['x-correlation-id']);
		res.setHeader('x-correlation-id', correlationId);
		return runWithRequestCorrelation(correlationId, next);
	});

	registerEmailTrackingRoute(app);

	app.use((req, res, next) => {
		if (req.path.startsWith('/api/email-tracking') || PUBLIC_WORKER_PATHS.has(req.path)) {
			return next();
		}

		if (!isWorkerAuthorized(req.headers.authorization)) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		return next();
	});

	app.use('/sms/scheduled', smsScheduledRoutes);
	registerHealthRoute(app, {
		eventLoopLagMonitor,
		getWorkerHealth: readWorkerHealth
	});
	registerOntologyClassificationRoute(app);
	registerBriefQueueRoute(app);
	registerGeneralEnqueueRoutes(app);
	registerQueueInspectionRoutes(app);

	return app;
}

function getAllowedOrigins(): string[] {
	const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
	return [
		...(isDevelopment
			? [
					'http://localhost:5173',
					'http://localhost:3000',
					'http://localhost:4173',
					'https://localhost:5173'
				]
			: []),
		'https://build-os.com'
	];
}
