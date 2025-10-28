// apps/web/src/lib/utils/sse-response.ts

import type { RequestEvent } from '@sveltejs/kit';

export class SSEResponse {
	/**
	 * Create an SSE error response with consistent format matching ApiResponse
	 */
	static error(message: string, status: number = 500, code?: string): Response {
		const errorData = {
			error: message,
			code: code || this.getErrorCodeForStatus(status),
			status,
			timestamp: new Date().toISOString()
		};

		return new Response(JSON.stringify(errorData), {
			status,
			headers: {
				'Content-Type': 'application/json',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	}

	/**
	 * Get error code based on HTTP status
	 */
	private static getErrorCodeForStatus(status: number): string {
		switch (status) {
			case 400:
				return 'INVALID_REQUEST';
			case 401:
				return 'UNAUTHORIZED';
			case 403:
				return 'FORBIDDEN';
			case 404:
				return 'NOT_FOUND';
			case 409:
				return 'CONFLICT';
			case 422:
				return 'UNPROCESSABLE_ENTITY';
			case 429:
				return 'TOO_MANY_REQUESTS';
			case 500:
				return 'INTERNAL_ERROR';
			case 503:
				return 'SERVICE_UNAVAILABLE';
			default:
				return 'ERROR';
		}
	}

	/**
	 * Create an unauthorized SSE error response
	 */
	static unauthorized(): Response {
		return SSEResponse.error('Unauthorized', 401);
	}

	/**
	 * Create a bad request SSE error response
	 */
	static badRequest(message: string = 'Bad Request'): Response {
		return SSEResponse.error(message, 400);
	}

	/**
	 * Create an internal server error SSE response
	 */
	static internalError(error?: any, message: string = 'Internal server error'): Response {
		if (error instanceof Error) {
			console.error(`SSE Error: ${message}`, error);
			// In development, include error details
			if (process.env.NODE_ENV === 'development') {
				return SSEResponse.error(`${message}: ${error.message}`, 500);
			}
		}
		return SSEResponse.error(message, 500);
	}

	/**
	 * Create a not found SSE error response
	 */
	static notFound(resource: string = 'Resource'): Response {
		return SSEResponse.error(`${resource} not found`, 404);
	}

	/**
	 * Create a proper SSE stream response
	 */
	static stream(headers?: HeadersInit): Response {
		return new Response(null, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Content-Type-Options': 'nosniff',
				...headers
			}
		});
	}

	/**
	 * Create an SSE stream with initial setup
	 */
	static createStream(): {
		response: Response;
		stream: TransformStream;
		writer: WritableStreamDefaultWriter;
		encoder: TextEncoder;
	} {
		const stream = new TransformStream();
		const writer = stream.writable.getWriter();
		const encoder = new TextEncoder();

		const response = new Response(stream.readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Content-Type-Options': 'nosniff'
			}
		});

		return { response, stream, writer, encoder };
	}

	/**
	 * Send an SSE message
	 */
	static async sendMessage(
		writer: WritableStreamDefaultWriter,
		encoder: TextEncoder,
		data: any,
		event?: string
	): Promise<void> {
		let message = '';
		if (event) {
			message += `event: ${event}\n`;
		}
		message += `data: ${JSON.stringify(data)}\n\n`;
		await writer.write(encoder.encode(message));
	}

	/**
	 * Close an SSE stream gracefully
	 */
	static async close(writer: WritableStreamDefaultWriter): Promise<void> {
		try {
			await writer.close();
		} catch (error) {
			// Stream might already be closed
			console.warn('Error closing SSE stream:', error);
		}
	}

	/**
	 * Create an SSE stream response for chat
	 */
	static createChatStream() {
		const { response, writer, encoder } = SSEResponse.createStream();

		return {
			response,
			sendMessage: async (data: any) => {
				await SSEResponse.sendMessage(writer, encoder, data);
			},
			close: async () => {
				await SSEResponse.close(writer);
			}
		};
	}
}
