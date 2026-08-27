// apps/worker/src/lib/utils/errors.ts

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	if (typeof error === 'string' && error.trim()) return error;
	if (error && typeof error === 'object') {
		const message = Reflect.get(error, 'message');
		if (typeof message === 'string' && message.trim()) return message;
	}
	return fallback;
}

export function getErrorStatusCode(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const statusCode = Reflect.get(error, 'statusCode');
	return typeof statusCode === 'number' ? statusCode : undefined;
}
