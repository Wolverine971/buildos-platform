// apps/worker/src/middleware/jsonError.ts
import type { ErrorRequestHandler } from 'express';

type JsonParseError = SyntaxError & {
	body?: unknown;
	status?: number;
	type?: string;
};

function isJsonParseError(error: unknown): error is JsonParseError {
	if (!(error instanceof SyntaxError)) return false;
	const maybeParseError = error as JsonParseError;
	return maybeParseError.status === 400 && maybeParseError.type === 'entity.parse.failed';
}

export const jsonParseErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
	if (!isJsonParseError(error)) {
		return next(error);
	}

	return res.status(400).json({ error: 'Invalid JSON body' });
};
