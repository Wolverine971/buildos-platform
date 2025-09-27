// src/lib/utils/sse-processor.ts
/**
 * Shared Server-Sent Events (SSE) processing utility
 * Centralizes SSE stream parsing logic to eliminate duplication
 */

export interface StreamCallbacks {
	onProgress?: (data: any) => void;
	onComplete?: (result: any) => void;
	onError?: (error: string | Error) => void;
	onStatus?: (status: string) => void;
}

export interface SSEProcessorOptions {
	/** Timeout in milliseconds for the entire stream (default: 60000) */
	timeout?: number;
	/** Whether to parse JSON in data events (default: true) */
	parseJSON?: boolean;
	/** Custom error handler for parsing errors */
	onParseError?: (error: Error, chunk: string) => void;
}

/**
 * Process a Server-Sent Events stream from a Response object
 * Handles buffering, parsing, and event dispatching
 */
export class SSEProcessor {
	private static readonly DEFAULT_TIMEOUT = 60000; // 60 seconds

	/**
	 * Process an SSE stream from a Response object
	 * @param response The Response object with a readable stream body
	 * @param callbacks Callbacks for different event types
	 * @param options Processing options
	 */
	static async processStream(
		response: Response,
		callbacks: StreamCallbacks,
		options: SSEProcessorOptions = {}
	): Promise<void> {
		const { timeout = SSEProcessor.DEFAULT_TIMEOUT, parseJSON = true, onParseError } = options;

		if (!response.body) {
			throw new Error('Response body is empty');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let timeoutId: NodeJS.Timeout | null = null;

		// Set up timeout
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				reject(new Error(`SSE stream timeout after ${timeout}ms`));
			}, timeout);
		});

		try {
			// Process stream with timeout
			await Promise.race([
				this.processStreamChunks(
					reader,
					decoder,
					buffer,
					callbacks,
					parseJSON,
					onParseError
				),
				timeoutPromise
			]);
		} finally {
			// Clean up
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			reader.releaseLock();
		}
	}

	/**
	 * Process individual chunks from the stream
	 */
	private static async processStreamChunks(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		decoder: TextDecoder,
		initialBuffer: string,
		callbacks: StreamCallbacks,
		parseJSON: boolean,
		onParseError?: (error: Error, chunk: string) => void
	): Promise<void> {
		let buffer = initialBuffer;
		let isDone = false;

		while (!isDone) {
			const { done, value } = await reader.read();
			isDone = done;

			if (value) {
				const chunk = decoder.decode(value, { stream: true });
				buffer += chunk;

				// Process complete events in buffer
				const lines = buffer.split('\n');
				buffer = lines.pop() || ''; // Keep incomplete line in buffer

				for (const line of lines) {
					if (line.trim() === '') continue;

					// Parse SSE event
					if (line.startsWith('data: ')) {
						const data = line.slice(6).trim();

						// Skip empty data or [DONE] marker
						if (!data || data === '[DONE]') continue;

						try {
							if (parseJSON) {
								const parsed = JSON.parse(data);
								this.handleParsedEvent(parsed, callbacks);
							} else {
								// Pass raw data
								callbacks.onProgress?.(data);
							}
						} catch (error) {
							if (onParseError) {
								onParseError(error as Error, data);
							} else {
								console.error('Failed to parse SSE data:', error, 'Data:', data);
							}
						}
					} else if (line.startsWith('event: ')) {
						// Handle custom event types if needed
						const eventType = line.slice(7).trim();
						callbacks.onStatus?.(eventType);
					}
				}
			}
		}

		// Process any remaining buffer
		if (buffer.trim()) {
			if (buffer.startsWith('data: ')) {
				const data = buffer.slice(6).trim();
				if (data && data !== '[DONE]') {
					try {
						if (parseJSON) {
							const parsed = JSON.parse(data);
							this.handleParsedEvent(parsed, callbacks);
						} else {
							callbacks.onProgress?.(data);
						}
					} catch (error) {
						if (onParseError) {
							onParseError(error as Error, data);
						}
					}
				}
			}
		}
	}

	/**
	 * Handle parsed SSE events based on their type
	 */
	private static handleParsedEvent(data: any, callbacks: StreamCallbacks): void {
		// Handle different event types based on common patterns
		if (data.type === 'status' || data.status) {
			callbacks.onStatus?.(data.status || data);
		} else if (data.type === 'progress' || data.progress) {
			callbacks.onProgress?.(data);
		} else if (data.type === 'complete' || data.complete) {
			callbacks.onComplete?.(data.result || data);
		} else if (data.type === 'error' || data.error) {
			callbacks.onError?.(data.error || data.message || 'Unknown error');
		} else if (data.result && data.done) {
			// Final result pattern
			callbacks.onComplete?.(data.result);
		} else {
			// Default to progress callback
			callbacks.onProgress?.(data);
		}
	}

	/**
	 * Create a WritableStream for SSE responses
	 * Used on the server side to send SSE events
	 */
	static createSSEStream(): {
		stream: ReadableStream;
		writer: {
			write: (data: any) => void;
			close: () => void;
			error: (error: string) => void;
		};
	} {
		let controller: ReadableStreamDefaultController;
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			start(c) {
				controller = c;
			}
		});

		const writer = {
			write: (data: any) => {
				const formatted = typeof data === 'string' ? data : JSON.stringify(data);
				controller.enqueue(encoder.encode(`data: ${formatted}\n\n`));
			},
			close: () => {
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			},
			error: (error: string) => {
				controller.enqueue(
					encoder.encode(`data: ${JSON.stringify({ type: 'error', error })}\n\n`)
				);
				controller.close();
			}
		};

		return { stream, writer };
	}
}

/**
 * Helper function for simple SSE stream consumption
 */
export async function consumeSSEStream(
	response: Response,
	onData: (data: any) => void,
	onError?: (error: string | Error) => void,
	options?: SSEProcessorOptions
): Promise<void> {
	return SSEProcessor.processStream(
		response,
		{
			onProgress: onData,
			onError: onError || ((e) => console.error('SSE error:', e))
		},
		options
	);
}
