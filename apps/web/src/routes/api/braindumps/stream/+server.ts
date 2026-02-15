// apps/web/src/routes/api/braindumps/stream/+server.ts
import type { RequestHandler } from './$types';
import { BrainDumpProcessor } from '$lib/utils/braindump-processor';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { BrainDumpStatusService } from '$lib/services/braindump-status.service';
import type { ExecutionResult } from '$lib/types/brain-dump';
import type {
	StreamingMessage,
	SSEStatus,
	SSEContextProgress,
	SSETasksProgress,
	SSEComplete,
	SSEError,
	SSERetry,
	SSEAnalysis
} from '$lib/types/sse-messages';
import type { BrainDumpOptions, DisplayedBrainDumpQuestion } from '$lib/types/brain-dump';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	convertToProjectContextResult,
	convertToTaskNoteExtractionResult
} from '$lib/utils/stream-format-helpers';
import { SSEResponse } from '$lib/utils/sse-response';
import { validateSynthesisResult } from '$lib/services/prompts/core/validations';
import { BrainDumpValidator } from '$lib/utils/braindump-validation';
import { rateLimiter, RATE_LIMITS } from '$lib/utils/rate-limiter';
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import { convertBrainDumpToProjectSpec } from '$lib/services/ontology/braindump-to-ontology-adapter';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		// Capture current datetime with timezone at the beginning of the request
		const processingDateTime = new Date().toISOString();

		// Validate authentication
		const { user } = await safeGetSession();
		if (!user) {
			return SSEResponse.unauthorized();
		}

		// Apply rate limiting to prevent DoS attacks (expensive AI operation)
		const rateLimitResult = rateLimiter.check(user.id, RATE_LIMITS.API_AI);
		if (!rateLimitResult.allowed) {
			const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
			return new Response(
				JSON.stringify({
					error: 'Rate limit exceeded. Please wait before creating another brain dump.',
					retryAfter,
					resetTime: new Date(rateLimitResult.resetTime).toISOString()
				}),
				{
					status: 429,
					headers: {
						'Content-Type': 'application/json',
						'Retry-After': retryAfter.toString(),
						'X-RateLimit-Limit': RATE_LIMITS.API_AI.requests.toString(),
						'X-RateLimit-Remaining': '0',
						'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString()
					}
				}
			);
		}

		// Parse request body
		const requestBody = await request.json();

		// Use unified validation for dual/long braindump
		const validation = await BrainDumpValidator.validateDual(requestBody);
		if (!validation.isValid) {
			return validation.error!;
		}

		const { content, selectedProjectId, brainDumpId, displayedQuestions, options, autoAccept } =
			validation.validatedData!;

		// Add input length validation to prevent DoS attacks
		const MAX_CONTENT_LENGTH = 50000; // 50KB
		if (content.length > MAX_CONTENT_LENGTH) {
			return SSEResponse.badRequest(
				`Content too long. Maximum ${MAX_CONTENT_LENGTH} characters allowed.`
			);
		}

		// Create a TransformStream for SSE
		const { response, writer, encoder } = SSEResponse.createStream();

		// Process in background
		processBrainDumpWithStreaming({
			content,
			selectedProjectId,
			brainDumpId,
			displayedQuestions,
			writer,
			encoder,
			userId: user.id,
			supabase,
			options,
			autoAccept: !!autoAccept,
			processingDateTime
		});

		// Return SSE response
		return response;
	} catch (error) {
		return SSEResponse.internalError(error, 'Error in brain dump stream endpoint');
	}
};

async function processBrainDumpWithStreaming({
	content,
	selectedProjectId,
	brainDumpId,
	displayedQuestions,
	writer,
	encoder,
	userId,
	supabase,
	options,
	autoAccept,
	processingDateTime
}: {
	content: string;
	selectedProjectId?: string;
	brainDumpId?: string;
	displayedQuestions?: DisplayedBrainDumpQuestion[];
	writer: WritableStreamDefaultWriter;
	encoder: TextEncoder;
	userId: string;
	supabase: SupabaseClient<Database>;
	options: BrainDumpOptions | undefined;
	autoAccept: boolean;
	processingDateTime: string;
}) {
	const processor = new BrainDumpProcessor(supabase);
	const activityLogger = new ActivityLogger(supabase);
	const statusService = new BrainDumpStatusService(supabase);

	try {
		// Send initial status - will include analysis for existing projects
		const initialProcesses = selectedProjectId
			? ['analysis', 'context', 'tasks']
			: ['context', 'tasks'];
		const statusMessage: SSEStatus = {
			type: 'status',
			message: selectedProjectId ? 'Analyzing braindump...' : 'Starting dual processing...',
			data: {
				processes: initialProcesses as ('analysis' | 'context' | 'tasks')[],
				contentLength: content.length,
				isDualProcessing: true,
				source: selectedProjectId ? 'analysis-then-dual' : 'dual-processing'
			}
		};
		await sendSSEMessage(writer, encoder, statusMessage);

		// Set up progress tracking (reserved for future SSE progress events)
		let _contextProgress: { status: string; data: any } = { status: 'pending', data: null };
		let _tasksProgress: { status: string; data: any } = { status: 'pending', data: null };
		let _analysisProgress: { status: string; data: any } = { status: 'pending', data: null };

		// Override runPreparatoryAnalysis to emit SSE events for analysis phase
		const originalRunPreparatoryAnalysis = processor['runPreparatoryAnalysis']?.bind(processor);

		if (originalRunPreparatoryAnalysis && selectedProjectId) {
			processor['runPreparatoryAnalysis'] = async function (...args: any[]) {
				// Send analysis starting event
				const analysisStartMessage: SSEAnalysis = {
					type: 'analysis',
					message: 'Analyzing braindump content and identifying relevant data...',
					data: { status: 'processing' }
				};
				await sendSSEMessage(writer, encoder, analysisStartMessage);

				try {
					const result = await originalRunPreparatoryAnalysis(
						...(args as [any, any, any])
					);
					_analysisProgress = { status: 'completed', data: result };

					if (result) {
						// Send analysis complete with results
						const classification = result.braindump_classification;
						const relevantTaskCount = result.relevant_task_ids?.length || 0;

						const completedMessage: SSEAnalysis = {
							type: 'analysis',
							message: `Analysis complete: ${classification} content detected (${relevantTaskCount} relevant tasks)`,
							data: {
								status: 'completed',
								result: result
							}
						};
						await sendSSEMessage(writer, encoder, completedMessage);

						// Update status for next phase
						const nextPhases: ('context' | 'tasks')[] = [];
						if (['mixed', 'strategic'].includes(classification)) {
							nextPhases.push('context');
						}
						if (
							(relevantTaskCount > 0 || result.new_tasks_detected) &&
							!result.processing_recommendation?.skip_tasks
						) {
							nextPhases.push('tasks');
						}

						if (nextPhases.length > 0) {
							const processingMessage: SSEStatus = {
								type: 'status',
								message: `Processing ${nextPhases.join(' and ')}...`,
								data: {
									processes: nextPhases,
									contentLength: content.length,
									isDualProcessing: nextPhases.length === 2,
									source: 'post-analysis-processing'
								}
							};
							await sendSSEMessage(writer, encoder, processingMessage);
						}
					} else {
						// Analysis failed, will use full processing
						const fallbackMessage: SSEAnalysis = {
							type: 'analysis',
							message: 'Analysis unavailable, proceeding with full processing',
							data: {
								status: 'completed',
								error: 'Analysis returned null, using fallback'
							}
						};
						await sendSSEMessage(writer, encoder, fallbackMessage);
					}

					return result;
				} catch (error: any) {
					_analysisProgress = { status: 'failed', data: error };

					const errorMessage: SSEAnalysis = {
						type: 'analysis',
						message: 'Analysis failed, proceeding with full processing',
						data: {
							status: 'failed',
							error: error.message
						}
					};
					await sendSSEMessage(writer, encoder, errorMessage);

					// Don't throw - let it fall back to full processing
					return null;
				}
			};
		}

		// Override the processor to emit progress events
		const originalExtractProjectContext = processor['extractProjectContext'].bind(processor);
		const originalExtractTasks = processor['extractTasks'].bind(processor);

		processor['extractProjectContext'] = async function (...args: any[]) {
			const processingMessage: SSEContextProgress = {
				type: 'contextProgress',
				message: 'Processing project context...',
				data: { status: 'processing' }
			};
			await sendSSEMessage(writer, encoder, processingMessage);

			try {
				const result = await originalExtractProjectContext(...(args as [any]));
				_contextProgress = { status: 'completed', data: result };

				// Convert to ProjectContextResult format for preview
				const contextPreview = convertToProjectContextResult(result);

				// Send the formatted preview
				const completedMessage: SSEContextProgress = {
					type: 'contextProgress',
					message: 'Project context processed',
					data: {
						status: 'completed',
						preview: contextPreview || undefined // Send formatted ProjectContextResult
					}
				};
				await sendSSEMessage(writer, encoder, completedMessage);

				return result;
			} catch (error: any) {
				_contextProgress = { status: 'failed', data: error };

				const errorMessage: SSEContextProgress = {
					type: 'contextProgress',
					message: 'Project context processing failed',
					data: {
						status: 'failed',
						error: error.message
					}
				};
				await sendSSEMessage(writer, encoder, errorMessage);

				throw error;
			}
		};

		processor['extractTasks'] = async function (...args: any[]) {
			const processingMessage: SSETasksProgress = {
				type: 'tasksProgress',
				message: 'Extracting tasks and notes...',
				data: { status: 'processing' }
			};
			await sendSSEMessage(writer, encoder, processingMessage);

			try {
				const result = await originalExtractTasks(...(args as [any]));
				_tasksProgress = { status: 'completed', data: result };

				// Convert to TaskNoteExtractionResult format for preview
				const tasksPreview = convertToTaskNoteExtractionResult(result, selectedProjectId);

				// Send the formatted preview
				const completedMessage: SSETasksProgress = {
					type: 'tasksProgress',
					message: 'Tasks and notes extracted',
					data: {
						status: 'completed',
						preview: tasksPreview // Send formatted TaskNoteExtractionResult
					}
				};
				await sendSSEMessage(writer, encoder, completedMessage);

				return result;
			} catch (error: any) {
				_tasksProgress = { status: 'failed', data: error };

				const errorMessage: SSETasksProgress = {
					type: 'tasksProgress',
					message: 'Task extraction failed',
					data: {
						status: 'failed',
						error: error.message
					}
				};
				await sendSSEMessage(writer, encoder, errorMessage);

				throw error;
			}
		};

		// Execute dual processing with retry callback for SSE notifications
		const rawResult = await processor.processBrainDump({
			brainDump: content,
			userId,
			selectedProjectId,
			displayedQuestions,
			options: {
				...options,
				streamResults: true,
				useDualProcessing: true,
				// Provide onRetry callback to emit SSE retry messages
				onRetry: async (attempt: number, maxAttempts: number) => {
					const retryMessage: SSERetry = {
						type: 'retry',
						message: `Retrying dual processing...`,
						attempt,
						maxAttempts,
						processName: 'dual-processing'
					};
					await sendSSEMessage(writer, encoder, retryMessage);
				},
				// Provide onAnalysisProgress callback to emit SSE analysis messages
				onAnalysisProgress: async (phase: 'start' | 'complete', result?: any) => {
					if (phase === 'start') {
						const analysisStartMessage: SSEAnalysis = {
							type: 'analysis',
							message: 'Analyzing braindump content to optimize processing...',
							data: { status: 'processing' }
						};
						await sendSSEMessage(writer, encoder, analysisStartMessage);
					} else if (phase === 'complete' && result) {
						const classification = result.braindump_classification;
						const relevantTaskCount = result.relevant_task_ids?.length || 0;
						const completedMessage: SSEAnalysis = {
							type: 'analysis',
							message: `Analysis complete: ${classification} (${relevantTaskCount} relevant tasks)`,
							data: {
								status: 'completed',
								result: result
							}
						};
						await sendSSEMessage(writer, encoder, completedMessage);
					}
				}
			},
			brainDumpId: brainDumpId as string,
			processingDateTime
		});

		// Validate the result using the proper validation utilities
		const result = validateSynthesisResult(rawResult, selectedProjectId);

		// Update brain dump status using the centralized service
		if (brainDumpId) {
			try {
				// Use the centralized status service for updating
				const updateSuccess = await statusService.updateToParsed(
					brainDumpId,
					userId,
					result,
					selectedProjectId
				);

				if (updateSuccess) {
					console.log('Brain dump updated with parsed status:', brainDumpId);
				} else {
					console.warn('Failed to update brain dump status after parsing');
				}
			} catch (updateError) {
				console.warn('Failed to update brain dump status after parsing:', updateError);
				// Don't fail the parse request if status update fails
			}
		}

		// If auto-accept is enabled, execute the operations
		let finalResult = result;
		const isNewProject = !selectedProjectId || selectedProjectId === 'new';

		if (autoAccept && result.operations?.length > 0) {
			try {
				let executionResult: ExecutionResult | undefined;
				let projectInfo:
					| { id: string; name: string; isNew: boolean; slug?: string | null }
					| undefined = undefined;
				let ontologyResult:
					| {
							project_id: string;
							counts: {
								goals: number;
								requirements: number;
								plans: number;
								tasks: number;
								documents: number;
								sources: number;
								metrics: number;
								milestones: number;
								risks: number;
								edges: number;
							};
					  }
					| undefined = undefined;

				if (isNewProject) {
					const projectSpec = convertBrainDumpToProjectSpec(result.operations, content, {
						projectSummary: result.summary,
						projectContext: result.contextResult?.projectCreate?.context
					});

					const { project_id, counts } = await instantiateProject(
						supabase,
						projectSpec,
						userId
					);

					const { data: project, error } = await supabase
						.from('onto_projects')
						.select('id, name')
						.eq('id', project_id)
						.single();

					if (!error && project) {
						projectInfo = {
							id: project.id,
							name: project.name,
							isNew: true
						};
					}

					ontologyResult = { project_id, counts };
					executionResult = {
						successful: result.operations,
						failed: [],
						results: []
					};
					finalResult = {
						...result,
						executionResult,
						projectInfo,
						ontology: ontologyResult
					};
				} else {
					// Import operation executor
					const { OperationsExecutor } = await import(
						'$lib/utils/operations/operations-executor'
					);
					const executor = new OperationsExecutor(supabase);

					// Execute all operations
					executionResult = await executor.executeOperations({
						operations: result.operations,
						userId,
						brainDumpId: brainDumpId || 'temp',
						projectQuestions: result.projectQuestions
					});

					// Check if a new project was created
					const createdProject = executionResult.results?.find(
						(r: any) => r.table === 'onto_projects' && r.operationType === 'create'
					);

					if (createdProject?.id) {
						// New project was created - fetch the project details
						try {
							const { data: project, error } = await supabase
								.from('onto_projects')
								.select('id, name')
								.eq('id', createdProject.id)
								.is('deleted_at', null)
								.single();

							if (!error && project) {
								projectInfo = {
									id: project.id,
									name: project.name,
									slug: null,
									isNew: true
								};
							}
						} catch (error) {
							console.warn('Failed to fetch created project details:', error);
						}
					} else if (selectedProjectId && selectedProjectId !== 'new') {
						// Existing project was updated
						try {
							const { data: project, error } = await supabase
								.from('onto_projects')
								.select('id, name')
								.eq('id', selectedProjectId)
								.is('deleted_at', null)
								.single();

							if (!error && project) {
								projectInfo = {
									id: project.id,
									name: project.name,
									slug: null,
									isNew: false
								};
							}
						} catch (error) {
							console.warn('Failed to fetch updated project details:', error);
						}
					}

					// Add execution result and project info to the response
					finalResult = {
						...result,
						executionResult,
						projectInfo
					};
				}

				if (executionResult) {
					console.log('Auto-accept: Operations executed', {
						total: result.operations.length,
						successful: executionResult.successful?.length || 0,
						failed: executionResult.failed?.length || 0
					});
				} else if (ontologyResult) {
					console.log('Auto-accept: Ontology project created', {
						projectId: ontologyResult.project_id,
						counts: ontologyResult.counts
					});
				}

				// Update brain dump status to 'saved' after auto-accept
				// Note: Zero operations is valid when analysis determines no updates needed
				if (brainDumpId) {
					try {
						const operationsForMetadata =
							executionResult?.successful || result.operations || [];
						const executionSummary = executionResult
							? {
									successful: executionResult.successful?.length || 0,
									failed: executionResult.failed?.length || 0,
									results: executionResult.results?.length || 0
								}
							: undefined;

						const { error: updateError } = await supabase
							.from('brain_dumps')
							.update({
								status: 'saved' as const,
								project_id: projectInfo?.id || selectedProjectId,
								metaData: JSON.stringify({
									operations: operationsForMetadata,
									summary: result.summary || 'Brain dump processed successfully',
									insights: result.insights || 'Operations executed',
									totalOperations: result.operations.length,
									processingTime: Date.now(),
									timestamp: new Date().toISOString(),
									project_info: projectInfo,
									executionSummary,
									ontology: ontologyResult,
									autoAccepted: true,
									zeroOperationsReason:
										result.operations.length === 0
											? 'Analysis determined no updates needed'
											: null
								}),
								updated_at: new Date().toISOString()
							})
							.eq('id', brainDumpId)
							.eq('user_id', userId);

						if (updateError) {
							console.error(
								'Failed to update brain dump status to saved:',
								updateError
							);
						} else {
							console.log('Brain dump status updated to saved after auto-accept', {
								operationsCount: result.operations.length,
								successfulCount: executionResult?.successful?.length || 0
							});
						}
					} catch (error) {
						console.error('Error updating brain dump status after auto-accept:', error);
					}
				}
			} catch (error) {
				console.error('Failed to execute operations with auto-accept:', error);
				// Still send the parse results even if execution fails
				finalResult = {
					...result,
					executionResult: {
						successful: [],
						failed: [],
						results: [],
						error:
							error instanceof Error ? error.message : 'Failed to execute operations'
					}
				};
			}
		}

		const failureCount = finalResult.executionResult?.failed?.length ?? 0;
		const completionMessage = autoAccept
			? failureCount > 0
				? 'Processing complete - operations applied with errors'
				: 'Processing complete - operations applied'
			: 'Processing complete';

		const completeMessage: SSEComplete = {
			type: 'complete',
			message: completionMessage,
			result: finalResult
		};
		await sendSSEMessage(writer, encoder, completeMessage);

		// Log completion
		await activityLogger.logActivity(userId, 'brain_dump_stream_completed', {
			content_length: content.length,
			operations_count: result.operations.length,
			has_project: !!selectedProjectId
		});
	} catch (error) {
		console.error('Error in brain dump streaming:', error);

		// Check if this is a security-related error
		let errorContext: 'general' | 'security' = 'general';
		let errorMsg = 'Processing failed';

		if (error instanceof Error) {
			// Security errors (prompt injection, rate limit)
			if (
				error.message.includes('could not be processed') ||
				error.message.includes('security rate limit') ||
				error.message.includes('rephrase and try again')
			) {
				errorContext = 'security';
				errorMsg = error.message;
			} else {
				errorMsg = error.message;
			}
		}

		const errorMessage: SSEError = {
			type: 'error',
			message: errorMsg,
			error: error instanceof Error ? error.message : 'Unknown error',
			context: errorContext
		};
		await sendSSEMessage(writer, encoder, errorMessage);
	} finally {
		await SSEResponse.close(writer);
	}
}

async function sendSSEMessage(
	writer: WritableStreamDefaultWriter,
	encoder: TextEncoder,
	message: StreamingMessage
) {
	await SSEResponse.sendMessage(writer, encoder, message);
}
