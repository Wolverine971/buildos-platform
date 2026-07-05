// apps/worker/src/http/auth.ts

export function isWorkerAuthorized(authHeader: string | undefined): boolean {
	const token = process.env.PRIVATE_RAILWAY_WORKER_TOKEN;
	if (!token) return false;
	if (!authHeader) return false;
	const [scheme, value] = authHeader.split(' ');
	return scheme === 'Bearer' && value === token;
}
