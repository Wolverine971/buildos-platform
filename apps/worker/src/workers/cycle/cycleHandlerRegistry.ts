import type {
	CycleKind,
	CycleQueueJobMetadata,
	CycleRun,
	CycleRunFor,
	CycleRunOutcome,
	Json
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../lib/supabaseQueue';

export interface CycleHandlerContext<K extends CycleKind> {
	run: CycleRunFor<K>;
	job: ProcessingJob<CycleQueueJobMetadata>;
}

export interface CycleHandlerResult {
	outcome: CycleRunOutcome;
	result: Json | null;
}

export type CycleHandler<K extends CycleKind> = (
	context: CycleHandlerContext<K>
) => Promise<CycleHandlerResult>;

/**
 * The registry is the only worker routing table for Cycle kinds. Adding a new
 * kind should not require another queue type or another polling loop.
 */
export class CycleHandlerRegistry {
	private readonly handlers = new Map<CycleKind, unknown>();

	register<K extends CycleKind>(kind: K, handler: CycleHandler<K>): void {
		if (this.handlers.has(kind)) {
			throw new Error(`Cycle handler already registered for kind: ${kind}`);
		}
		this.handlers.set(kind, handler);
	}

	has(kind: CycleKind): boolean {
		return this.handlers.has(kind);
	}

	get<K extends CycleKind>(kind: K): CycleHandler<K> {
		const handler = this.handlers.get(kind);
		if (!handler) {
			throw new Error(`No Cycle handler registered for kind: ${kind}`);
		}
		return handler as CycleHandler<K>;
	}

	execute(run: CycleRun, job: ProcessingJob<CycleQueueJobMetadata>): Promise<CycleHandlerResult> {
		const handler = this.handlers.get(run.kind);
		if (!handler) {
			throw new Error(`No Cycle handler registered for kind: ${run.kind}`);
		}
		const executeHandler = handler as (context: {
			run: CycleRun;
			job: ProcessingJob<CycleQueueJobMetadata>;
		}) => Promise<CycleHandlerResult>;
		return executeHandler({ run, job });
	}
}
