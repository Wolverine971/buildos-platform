// apps/web/src/lib/services/braindump-api.service.ts
import type {
	BrainDumpParseResult,
	ParsedOperation,
	EnrichedBraindump,
	DisplayedBrainDumpQuestion
} from '$lib/types/brain-dump';
import type { StreamingMessage } from '$lib/types/sse-messages';
import type { Project } from '$lib/types/project';
import { ApiClient } from '$lib/utils/api-client';
import { SSEProcessor } from '$lib/utils/sse-processor';

export interface BrainDumpDraft {
	id: string;
	content: string;
	project_id?: string;
	status: string;
	ai_insights?: string;
}

export interface SaveBrainDumpRequest {
	operations: ParsedOperation[];
	originalText: string;
	insights?: string;
	summary?: string;
	title?: string;
	brainDumpId?: string;
	selectedProjectId?: string;
	projectQuestions: any[];
}

export interface SaveBrainDumpResponse {
	totalOperations: number;
	successfulOperations: number;
	failedOperations: number;
	brainDumpId?: string;
	templateCreated?: boolean;
	projectInfo?: {
		id: string;
		name: string;
		slug: string;
		isNew: boolean;
	};
	results: Array<ParsedOperation & { error: string }>;
}

class BrainDumpService extends ApiClient {
	async getInitData(projectId?: string): Promise<{
		data: {
			projects: any[];
			recentBrainDumps: any[];
			newProjectDraftCount: number;
			currentDraft?: {
				brainDump: BrainDumpDraft;
				parseResults?: BrainDumpParseResult;
			};
		};
	}> {
		const params = new URLSearchParams();
		// Don't pass 'new' as a projectId - it's a special UI value meaning no project
		if (projectId && projectId !== 'new') {
			params.append('projectId', projectId);
		}
		return this.get(`/api/braindumps/init?${params.toString()}`);
	}
	/**
	 * Get existing draft brain dump
	 */
	async getDraft(): Promise<{
		brainDump: BrainDumpDraft | null;
		parseResults?: BrainDumpParseResult;
	}> {
		return this.get('/api/braindumps/draft');
	}

	/**
	 * Get draft for a specific project
	 */
	async getDraftForProject(projectId: string | null): Promise<{
		data: {
			brainDump: BrainDumpDraft | null;
			parseResults?: BrainDumpParseResult;
		};
	}> {
		const params = new URLSearchParams();
		if (projectId) {
			params.append('projectId', projectId);
		}
		return this.get(`/api/braindumps/draft?${params.toString()}`);
	}

	/**
	 * Update draft's project_id
	 */
	async updateDraftProject(
		brainDumpId: string,
		projectId: string | null
	): Promise<{ data: { success: boolean } }> {
		return this.patch('/api/braindumps/draft', {
			brainDumpId,
			projectId
		});
	}

	/**
	 * Revert a parsed draft back to pending
	 */
	async revertToPending(brainDumpId: string): Promise<{ data: { success: boolean } }> {
		return this.patch('/api/braindumps/draft/status', {
			brainDumpId,
			status: 'pending'
		});
	}

	/**
	 * Save or update draft brain dump
	 */
	async saveDraft(
		content: string,
		brainDumpId?: string,
		selectedProjectId?: string
	): Promise<{ data: { brainDumpId: string } }> {
		return this.post('/api/braindumps/draft', {
			content,
			brainDumpId,
			selectedProjectId
		});
	}

	/**
	 * Delete/reset draft brain dump
	 */
	async deleteDraft(brainDumpId: string): Promise<{ success: boolean }> {
		return this.delete('/api/braindumps/draft', { brainDumpId });
	}

	/**
	 * Parse brain dump text into operations
	 */
	async parseBrainDump(
		text: string,
		selectedProjectId?: string,
		brainDumpId?: string,
		displayedQuestions?: DisplayedBrainDumpQuestion[],
		options?: {
			streamResults?: boolean;
			useDualProcessing?: boolean;
			retryAttempts?: number;
		}
	): Promise<{ data: BrainDumpParseResult }> {
		return await this.post('/api/braindumps/generate', {
			action: 'parse',
			text,
			selectedProjectId,
			brainDumpId,
			displayedQuestions,
			options
		});
	}

	/**
	 * Parse short brain dump with streaming for existing projects (< 500 chars)
	 */
	async parseShortBrainDumpWithStream(
		text: string,
		selectedProjectId: string,
		brainDumpId?: string,
		displayedQuestions?: DisplayedBrainDumpQuestion[],
		options?: {
			autoAccept?: boolean;
			onProgress?: (status: StreamingMessage) => void;
			onComplete?: (result: BrainDumpParseResult) => void;
			onError?: (error: string) => void;
		}
	): Promise<void> {
		try {
			// Use fetch with POST to establish SSE connection
			const response = await fetch('/api/braindumps/stream-short', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: text,
					selectedProjectId,
					brainDumpId,
					displayedQuestions,
					options: {
						autoAccept: options?.autoAccept || false
					}
				})
			});

			if (!response.ok) {
				throw new Error(`Server returned ${response.status}: ${response.statusText}`);
			}

			// Use shared SSE processor
			await SSEProcessor.processStream(
				response,
				{
					onProgress: (data) => {
						// Handle different data types

						if (data.type === 'complete' && data.result) {
							options?.onComplete?.(data.result);
						} else if (data.type === 'error') {
							options?.onError?.(data.error || 'Unknown error');
						} else {
							options?.onProgress?.(data);
						}
					},
					onComplete: (result) => {
						options?.onComplete?.(result);
					},
					onError: (error) => {
						options?.onError?.(typeof error === 'string' ? error : error.message);
					}
				},
				{
					timeout: 180000, // 3 minutes to match other processing timeouts
					parseJSON: true,
					onParseError: (error, chunk) => {
						console.error('Failed to parse SSE data:', error, 'Chunk:', chunk);
					}
				}
			);
		} catch (error) {
			console.error('Error in short brain dump streaming:', error);
			options?.onError?.(error instanceof Error ? error.message : 'Unknown error');
			throw error;
		}
	}

	/**
	 * Parse brain dump with streaming for long content
	 */
	async parseBrainDumpWithStream(
		text: string,
		selectedProjectId?: string | null,
		brainDumpId?: string,
		displayedQuestions?: DisplayedBrainDumpQuestion[],
		options?: {
			autoAccept?: boolean;
			onProgress?: (status: StreamingMessage) => void;
			onComplete?: (result: BrainDumpParseResult) => void;
			onError?: (error: string) => void;
		}
	): Promise<void> {
		try {
			// Use fetch with POST to establish SSE connection
			const response = await fetch('/api/braindumps/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: text,
					selectedProjectId,
					brainDumpId, // Pass the brain dump ID
					displayedQuestions,
					options: {
						streamResults: true,
						useDualProcessing: true,
						autoAccept: options?.autoAccept || false
					}
				})
			});

			if (!response.ok) {
				throw new Error(`Server returned ${response.status}: ${response.statusText}`);
			}

			// Use shared SSE processor
			await SSEProcessor.processStream(
				response,
				{
					onProgress: (data) => {
						// Handle different status types
						switch (data.type) {
							case 'status':
							case 'contextProgress':
							case 'tasksProgress':
							case 'retry':
								options?.onProgress?.(data);
								break;

							case 'complete':
								if (data.result) {
									options?.onComplete?.(data.result);
								} else {
									console.warn('Received complete event without result');
								}
								break;

							case 'error':
								options?.onError?.(data.error || 'Unknown error');
								break;

							default:
								// Pass through other progress events
								options?.onProgress?.(data);
						}
					},
					onComplete: (result) => {
						options?.onComplete?.(result);
					},
					onError: (error) => {
						options?.onError?.(typeof error === 'string' ? error : error.message);
					}
				},
				{
					timeout: 180000, // 3 minutes for long braindumps
					parseJSON: true,
					onParseError: (error, chunk) => {
						console.error('Failed to parse SSE data:', error, 'Chunk:', chunk);
					}
				}
			);
		} catch (error) {
			console.error('Stream error:', error);
			options?.onError?.(
				error instanceof Error ? error.message : 'Connection to server failed'
			);
		}
	}

	/**
	 * Save and execute brain dump operations
	 */
	async saveBrainDump(request: SaveBrainDumpRequest): Promise<{ data: SaveBrainDumpResponse }> {
		return await this.post('/api/braindumps/generate', {
			action: 'save',
			...request
		});
	}

	/**
	 * Get all brain dumps with filtering
	 */
	async getBrainDumps(params?: {
		search?: string;
		year?: string;
		day?: string;
		limit?: number;
		offset?: number;
	}): Promise<{ data: { braindumps: EnrichedBraindump[]; total: number; hasMore: boolean } }> {
		const queryParams = new URLSearchParams();
		if (params?.search) queryParams.append('search', params.search);
		if (params?.year) queryParams.append('year', params.year);
		if (params?.day) queryParams.append('day', params.day);
		if (params?.limit) queryParams.append('limit', params.limit.toString());
		if (params?.offset) queryParams.append('offset', params.offset.toString());

		return this.get(`/api/braindumps?${queryParams.toString()}`);
	}

	async getProjectWithContext(projectId: string): Promise<{ data: { project: Project } }> {
		return await this.get(`/api/projects/${projectId}`);
	}

	/**
	 * Transcribe audio to text
	 * Note: Using fetch directly as ApiClient doesn't support FormData
	 */
	async transcribeAudio(audioFile: File): Promise<{ transcript: string }> {
		const formData = new FormData();
		formData.append('audio', audioFile);

		const response = await fetch('/api/transcribe', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Transcription failed' }));
			throw new Error(error.error || `Transcription failed: ${response.status}`);
		}

		const result = await response.json();
		// Handle both success wrapper and direct response formats
		return result.success && result.data ? result.data : result;
	}
}

// Export singleton instance
export const brainDumpService = new BrainDumpService();
