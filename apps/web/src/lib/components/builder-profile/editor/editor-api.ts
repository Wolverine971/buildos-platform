// apps/web/src/lib/components/builder-profile/editor/editor-api.ts
//
// One way to call the builder-page API from the editor: JSON in, `ApiResponse` out,
// and the server's own `error` message when something fails (shown next to the
// control that sent it).

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function callApi<T>(
	url: string,
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
	body?: unknown,
	fallbackError = 'Could not save that. Try again.'
): Promise<ApiResult<T>> {
	try {
		const res = await fetch(url, {
			method,
			credentials: 'same-origin',
			headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const payload = (await res.json().catch(() => null)) as {
			success?: boolean;
			data?: T;
			error?: string;
		} | null;
		if (!res.ok || payload?.success === false) {
			return {
				ok: false,
				status: res.status,
				error:
					typeof payload?.error === 'string' && payload.error
						? payload.error
						: fallbackError
			};
		}
		return { ok: true, data: (payload?.data ?? null) as T };
	} catch {
		return {
			ok: false,
			status: 0,
			error: 'Could not reach BuildOS. Check your connection and try again.'
		};
	}
}
