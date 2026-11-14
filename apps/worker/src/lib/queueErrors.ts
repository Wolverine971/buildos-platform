// apps/worker/src/lib/queueErrors.ts
import { getErrorMessage } from './utils/errors';

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
		message: describeQueueError(error)
	};
}

/**
 * The text recorded on a failed job. Supabase returns database errors as plain
 * objects (`{ message, code, details }`), not `Error` instances, so reading
 * only `Error.message` recorded every one of them as "Unknown error".
 */
export function describeQueueError(error: unknown): string {
	const message = getErrorMessage(error);
	if (!error || typeof error !== 'object' || error instanceof QueueProcessorError) {
		return message;
	}
	const code = Reflect.get(error, 'code');
	return typeof code === 'string' && code.trim() && !message.includes(code)
		? `${message} (${code})`
		: message;
}
