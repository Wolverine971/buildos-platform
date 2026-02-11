// apps/web/src/routes/api/agent/google-calendar/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService, CalendarConnectionError } from '$lib/services/calendar-service';
import { dev } from '$app/environment';
// MCP-compatible request types
interface MCPToolCallRequest {
	method: 'tools/call';
	params: {
		name: string;
		arguments?: Record<string, any>;
	};
}

interface MCPListToolsRequest {
	method: 'tools/list';
}

type MCPRequest = MCPToolCallRequest | MCPListToolsRequest;

// MCP-compatible response types
interface MCPToolsListResponse {
	tools: Array<{
		name: string;
		description: string;
		inputSchema: Record<string, any>;
	}>;
}

interface MCPToolCallResponse {
	content: Array<{
		type: string;
		text: string;
	}>;
}

interface MCPErrorResponse {
	error: {
		code: number;
		message: string;
		data?: any;
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Check authentication
		const { user } = await locals.safeGetSession();
		if (!user) {
			return json(
				{
					error: {
						code: -32001,
						message: 'Please log in to use calendar features'
					}
				},
				{ status: 401 }
			);
		}

		// Parse MCP request
		const mcpRequest = (await request.json()) as MCPRequest;

		// Handle list tools request
		if (mcpRequest.method === 'tools/list') {
			const tools = (CalendarService as any).getToolDefinitions();
			return json({ tools });
		}

		// Handle tool call request
		if (mcpRequest.method === 'tools/call') {
			const calendarService = new CalendarService(locals.supabase);

			try {
				const result = await (calendarService as any).executeToolCall(user.id, {
					tool: mcpRequest.params.name,
					arguments: mcpRequest.params.arguments || {}
				});

				return json(result);
			} catch (error) {
				// Handle calendar-specific errors
				if (error instanceof CalendarConnectionError) {
					if (error.requiresReconnection) {
						return json(
							{
								error: {
									code: -32002,
									message:
										'Calendar connection required. Please connect your Google Calendar.',
									data: { requiresAuth: true }
								}
							},
							{ status: 403 }
						);
					}
				}

				// Re-throw other errors to be handled below
				throw error;
			}
		}

		// Unknown method
		return json(
			{
				error: {
					code: -32601,
					message: `Method not found: ${(mcpRequest as any).method}`
				}
			},
			{ status: 400 }
		);
	} catch (error: any) {
		console.error('Calendar API error:', error);

		// Provide user-friendly error messages
		let message = 'Calendar operation failed. Please try again.';
		let code = -32603;

		if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
			message = 'Calendar API limit reached. Please try again in a few minutes.';
			code = -32429;
		} else if (error.message?.includes('network') || error.message?.includes('timeout')) {
			message = 'Network error. Please check your connection and try again.';
			code = -32000;
		} else if (error.message?.includes('not found')) {
			message = 'Calendar or event not found.';
			code = -32404;
		}

		return json(
			{
				error: {
					code,
					message,
					data: dev ? error.stack : undefined
				}
			},
			{ status: 500 }
		);
	}
};

// Optional: GET endpoint for tool discovery
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const calendarService = new CalendarService(supabase);
	const isConnected = await calendarService.hasValidConnection(user.id);

	return json({
		service: 'buildos-google-calendar',
		version: '1.0.0',
		description: 'Google Calendar integration for BuildOS',
		connected: isConnected,
		tools: (CalendarService as any).getToolDefinitions()
	});
};
