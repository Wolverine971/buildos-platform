// apps/worker/src/lib/queueErrors.ts
export type QueueFailureKind = 'permanent' | 'transient';

export interface ClassifiedQueueFailure {
	kind: QueueFailureKind;
	code: string;
	message: string;
}

/**
 * An error whose retry semantics are explicit to the generic queue.
 *
 * Unknown errors remain transient for backward compatibility. Processors
 * should use `PermanentQueueError` only when repeating the same input cannot
 * succeed (for example, malformed job metadata).
 */
export class QueueProcessorError extends Error {
	readonly kind: QueueFailureKind;
	readonly code: string;

	constructor(kind: QueueFailureKind, code: string, message: string) {
		super(message);
		this.name = 'QueueProcessorError';
		this.kind = kind;
		this.code = code;
	}
}

export class PermanentQueueError extends QueueProcessorError {
	constructor(code: string, message: string) {
		super('permanent', code, message);
		this.name = 'PermanentQueueError';
	}
}

export class TransientQueueError extends QueueProcessorError {
	constructor(code: string, message: string) {
		super('transient', code, message);
		this.name = 'TransientQueueError';
	}
}

export function classifyQueueError(error: unknown): ClassifiedQueueFailure {
	if (error instanceof QueueProcessorError) {
		return {
			kind: error.kind,
			code: error.code,
			message: error.message
		};
	}

	return {
		kind: 'transient',
		code: 'unclassified',
		message: error instanceof Error ? error.message : 'Unknown error'
	};
}
