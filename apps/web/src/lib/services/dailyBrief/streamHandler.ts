// apps/web/src/lib/services/dailyBrief/streamHandler.ts
import type { DailyBriefGenerator } from './generator';
import type { DailyBriefRepository } from './repository';
import type { StreamEvent } from '$lib/types/daily-brief';

export class BriefStreamHandler {
	private activeStreams = new Map<string, { controller: AbortController; startTime: number }>();
	private cleanupInterval: NodeJS.Timeout | null = null;
	private readonly STREAM_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes max stream duration
	private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // Check every minute

	constructor(
		private generator: DailyBriefGenerator,
		private repository: DailyBriefRepository
	) {
		this.startCleanupTask();
	}

	private startCleanupTask(): void {
		// Clean up stale streams periodically
		this.cleanupInterval = setInterval(() => {
			const now = Date.now();
			const staleStreams: string[] = [];

			this.activeStreams.forEach((stream, id) => {
				if (now - stream.startTime > this.STREAM_TIMEOUT_MS) {
					staleStreams.push(id);
					// Abort the stale stream
					if (!stream.controller.signal.aborted) {
						stream.controller.abort();
					}
				}
			});

			// Remove stale streams from the map
			staleStreams.forEach((id) => {
				this.activeStreams.delete(id);
				console.warn(`Cleaned up stale stream: ${id}`);
			});
		}, this.CLEANUP_INTERVAL_MS);
	}

	destroy(): void {
		// Clean up when the handler is destroyed
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		// Abort all active streams
		this.abortAllStreams();
	}

	createStreamResponse(userId: string, targetDate: string, briefId: string): Response {
		// Store references outside the stream
		const generator = this.generator;
		const repository = this.repository;

		// Create abort controller for this stream
		const abortController = new AbortController();
		const streamId = `${userId}_${briefId}`;
		this.activeStreams.set(streamId, {
			controller: abortController,
			startTime: Date.now()
		});

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
							event: 'heartbeat' as any,
							data: { timestamp: Date.now() },
							timestamp: new Date().toISOString()
						});
					}
				}, 30000);

				// Listen for abort signal
				abortController.signal.addEventListener('abort', () => {
					if (keepAliveInterval) {
						clearInterval(keepAliveInterval);
					}
					sendEvent({
						event: 'error' as any,
						data: { message: 'Stream aborted by client' },
						timestamp: new Date().toISOString()
					});
					controller.close();
				});

				try {
					// Send initial connection event
					sendEvent({
						event: 'started' as any,
						data: { status: 'connected', message: 'Connection established' },
						timestamp: new Date().toISOString()
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
						event: 'completed' as any,
						data: {
							briefId,
							message: 'Brief generation completed successfully',
							result
						},
						timestamp: new Date().toISOString()
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
						event: 'error' as any,
						data: {
							message:
								error instanceof Error ? error.message : 'Failed to generate brief',
							retryable: isRetryable,
							status: error.status
						},
						timestamp: new Date().toISOString()
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
				const stream = this.activeStreams.get(streamId);
				if (stream) {
					if (!stream.controller.signal.aborted) {
						stream.controller.abort();
					}
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
		const stream = this.activeStreams.get(streamId);
		if (stream) {
			if (!stream.controller.signal.aborted) {
				stream.controller.abort();
			}
			this.activeStreams.delete(streamId);
		}
	}

	// Cleanup all active streams
	abortAllStreams(): void {
		for (const stream of this.activeStreams.values()) {
			if (!stream.controller.signal.aborted) {
				stream.controller.abort();
			}
		}
		this.activeStreams.clear();
	}
}
