// apps/web/src/routes/api/agent-call/bootstrap/[setupToken]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	AgentCallBootstrapError,
	AgentCallBootstrapLinkService,
	serializeBootstrapDocumentAsText
} from '$lib/server/agent-call/bootstrap-link.service';
import { logRouteError } from '$lib/server/route-error';
import {
	consumePublicEndpointRateLimit,
	OAUTH_RATE_LIMITS
} from '$lib/server/agent-call/oauth-rate-limit';

function bootstrapHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		'Cache-Control': 'no-store',
		'Referrer-Policy': 'no-referrer',
		'X-Content-Type-Options': 'nosniff',
		...extra
	};
}

function bootstrapErrorResponse(
	format: 'json' | 'text',
	message: string,
	status: number,
	extraHeaders: Record<string, string> = {}
): Response {
	const headers = bootstrapHeaders(extraHeaders);
	if (format === 'json') {
		return json({ error: message }, { status, headers });
	}
	return new Response(message, {
		status,
		headers: {
			...headers,
			'Content-Type': 'text/plain; charset=utf-8'
		}
	});
}

export const GET: RequestHandler = async (event) => {
	const { params, url, getClientAddress } = event;
	const service = new AgentCallBootstrapLinkService();
	const baseUrl = url.origin;
	const format = url.searchParams.get('format')?.toLowerCase() === 'json' ? 'json' : 'text';
	const rateLimit = consumePublicEndpointRateLimit(
		`agent-call:bootstrap:${getClientAddress()}`,
		OAUTH_RATE_LIMITS.bootstrap
	);
	if (!rateLimit.allowed) {
		return bootstrapErrorResponse(
			format,
			'Too many bootstrap requests. Try again shortly.',
			429,
			{
				...rateLimit.headers,
				'Retry-After': String(rateLimit.retryAfterSeconds)
			}
		);
	}

	try {
		const document = await service.loadBootstrapDocument({
			setupToken: params.setupToken,
			baseUrl
		});

		if (format === 'json') {
			return json(document, {
				headers: bootstrapHeaders(rateLimit.headers)
			});
		}

		return new Response(serializeBootstrapDocumentAsText(document), {
			status: 200,
			headers: bootstrapHeaders({
				'Content-Type': 'text/plain; charset=utf-8',
				...rateLimit.headers
			})
		});
	} catch (error) {
		if (error instanceof AgentCallBootstrapError) {
			return bootstrapErrorResponse(format, error.message, error.status, rateLimit.headers);
		}

		await logRouteError(event, error, {
			operation: 'agent_call.bootstrap',
			severity: 'error',
			status: 500,
			metadata: {
				format
			}
		});

		return bootstrapErrorResponse(
			format,
			'Failed to load bootstrap instructions',
			500,
			rateLimit.headers
		);
	}
};
