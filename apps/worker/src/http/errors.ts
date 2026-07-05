// apps/worker/src/http/errors.ts

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
