// apps/web/src/routes/api/agent-call/bootstrap/[setupToken]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	AgentCallBootstrapError,
	AgentCallBootstrapLinkService,
	serializeBootstrapDocumentAsText
} from '$lib/server/agent-call/bootstrap-link.service';
import { logRouteError } from '$lib/server/route-error';

export const GET: RequestHandler = async (event) => {
	const { params, url } = event;
	const service = new AgentCallBootstrapLinkService();
	const baseUrl = url.origin;
	const format = url.searchParams.get('format')?.toLowerCase() === 'json' ? 'json' : 'text';

	try {
		const document = await service.loadBootstrapDocument({
			setupToken: params.setupToken,
			baseUrl
		});

		if (format === 'json') {
			return json(document, {
				headers: {
					'Cache-Control': 'no-store'
				}
			});
		}

		return new Response(serializeBootstrapDocumentAsText(document), {
			status: 200,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		if (error instanceof AgentCallBootstrapError) {
			if (format === 'json') {
				return json(
					{
						error: error.message
					},
					{
						status: error.status,
						headers: {
							'Cache-Control': 'no-store'
						}
					}
				);
			}

			return new Response(error.message, {
				status: error.status,
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Cache-Control': 'no-store'
				}
			});
		}

		await logRouteError(event, error, {
			operation: 'agent_call.bootstrap',
			severity: 'error',
			status: 500,
			metadata: {
				format
			}
		});

		if (format === 'json') {
			return json(
				{
					error:
						error instanceof Error
							? error.message
							: 'Failed to load bootstrap instructions'
				},
				{
					status: 500,
					headers: {
						'Cache-Control': 'no-store'
					}
				}
			);
		}

		return new Response(
			error instanceof Error ? error.message : 'Failed to load bootstrap instructions',
			{
				status: 500,
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Cache-Control': 'no-store'
				}
			}
		);
	}
};
