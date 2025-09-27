// src/lib/services/dailyBrief/streamHandler.ts
import type { DailyBriefGenerator, StreamEvent } from './generator';
import type { DailyBriefRepository } from './repository';

export class BriefStreamHandler {
	private activeStreams = new Map<string, AbortController>();

	constructor(
		private generator: DailyBriefGenerator,
		private repository: DailyBriefRepository
	) {}

	createStreamResponse(userId: string, targetDate: string, briefId: string): Response {
		// Store references outside the stream
		const generator = this.generator;
		const repository = this.repository;

		// Create abort controller for this stream
		const abortController = new AbortController();
		const streamId = `${userId}_${briefId}`;
		this.activeStreams.set(streamId, abortController);

		const stream = new ReadableStream({
			start: async (controller) => {
				const encoder = new TextEncoder();
				let keepAliveInterval: NodeJS.Timeout | null = null;

				const sendEvent = (event: StreamEvent) => {
					try {
						// Check if the stream is still active
						if (abortController.signal.aborted) {
							return;
						}
						const sseData = `data: ${JSON.stringify(event)}\n\n`;
						controller.enqueue(encoder.encode(sseData));
					} catch (err) {
						console.error('Error sending SSE event:', err);
						// If we can't send events, close the stream
						if (!abortController.signal.aborted) {
							controller.close();
						}
					}
				};

				// Set up keep-alive ping every 30 seconds
				keepAliveInterval = setInterval(() => {
					if (!abortController.signal.aborted) {
						sendEvent({
							type: 'ping',
							data: { timestamp: Date.now() }
						});
					}
				}, 30000);

				// Listen for abort signal
				abortController.signal.addEventListener('abort', () => {
					if (keepAliveInterval) {
						clearInterval(keepAliveInterval);
					}
					sendEvent({
						type: 'abort',
						data: { message: 'Stream aborted by client' }
					});
					controller.close();
				});

				try {
					// Send initial connection event
					sendEvent({
						type: 'status',
						data: { status: 'connected', message: 'Connection established' }
					});

					// Generate brief with streaming
					const result = await generator.generateDailyBrief(
						userId,
						targetDate,
						sendEvent
					);

					// Mark as completed
					await repository.markGenerationCompleted(briefId, result);

					// Send completion event
					sendEvent({
						type: 'complete',
						data: {
							briefId,
							message: 'Brief generation completed successfully',
							result
						}
					});
				} catch (error: any) {
					console.error('Stream generation error:', error);

					// Determine if error is retryable
					const isRetryable = this.isRetryableError(error);

					await repository.markGenerationFailed(
						userId,
						targetDate,
						error instanceof Error ? error.message : 'Unknown error'
					);

					sendEvent({
						type: 'error',
						data: {
							message:
								error instanceof Error ? error.message : 'Failed to generate brief',
							retryable: isRetryable,
							status: error.status
						}
					});
				} finally {
					// Clean up
					if (keepAliveInterval) {
						clearInterval(keepAliveInterval);
					}
					this.activeStreams.delete(streamId);
					controller.close();
				}
			},
			cancel: () => {
				// Handle stream cancellation
				const streamId = `${userId}_${briefId}`;
				const controller = this.activeStreams.get(streamId);
				if (controller) {
					controller.abort();
					this.activeStreams.delete(streamId);
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'Access-Control-Allow-Origin': '*',
				'X-Accel-Buffering': 'no' // Disable nginx buffering
			}
		});
	}

	private isRetryableError(error: any): boolean {
		// HTTP status codes that warrant retry
		const retryableStatuses = [408, 429, 500, 502, 503, 504];
		if (error.status && retryableStatuses.includes(error.status)) {
			return true;
		}

		// Network errors
		if (error.message?.includes('ECONNRESET')) return true;
		if (error.message?.includes('ETIMEDOUT')) return true;
		if (error.message?.includes('timeout')) return true;

		return false;
	}

	// Method to abort active streams (useful for cleanup)
	abortStream(userId: string, briefId: string): void {
		const streamId = `${userId}_${briefId}`;
		const controller = this.activeStreams.get(streamId);
		if (controller) {
			controller.abort();
			this.activeStreams.delete(streamId);
		}
	}

	// Cleanup all active streams
	abortAllStreams(): void {
		for (const controller of this.activeStreams.values()) {
			controller.abort();
		}
		this.activeStreams.clear();
	}
}
