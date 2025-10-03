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

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		// Validate authentication
		const { user } = await safeGetSession();
		if (!user) {
			return SSEResponse.unauthorized();
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
			autoAccept
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
	autoAccept
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

		// Set up progress tracking
		let contextProgress = { status: 'pending', data: null };
		let tasksProgress = { status: 'pending', data: null };
		let analysisProgress = { status: 'pending', data: null };

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
					const result = await originalRunPreparatoryAnalysis(...args);
					analysisProgress = { status: 'completed', data: result };

					if (result) {
						// Send analysis complete with results
						const classification = result.braindump_classification;
						const relevantTaskCount = result.relevant_task_ids?.length || 0;
						const needsContext = result.needs_context_update;

						const completedMessage: SSEAnalysis = {
							type: 'analysis',
							message: `Analysis complete: ${classification} content detected (${relevantTaskCount} relevant tasks, ${needsContext ? 'context update needed' : 'no context update'})`,
							data: {
								status: 'completed',
								result: result
							}
						};
						await sendSSEMessage(writer, encoder, completedMessage);

						// Update status for next phase
						const nextPhases: ('context' | 'tasks')[] = [];
						if (needsContext && !result.processing_recommendation?.skip_context) {
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
					analysisProgress = { status: 'failed', data: error };

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
				const result = await originalExtractProjectContext(...args);
				contextProgress = { status: 'completed', data: result };

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
				contextProgress = { status: 'failed', data: error };

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
				const result = await originalExtractTasks(...args);
				tasksProgress = { status: 'completed', data: result };

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
				tasksProgress = { status: 'failed', data: error };

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

		// Also track retries
		const originalProcessBrainDumpDual = processor['processBrainDumpDual'].bind(processor);
		let currentAttempt = 0;

		processor['processBrainDumpDual'] = async function (args: any) {
			const maxRetries = args.options?.retryAttempts || 3;

			// Wrap the original method to track attempts
			const wrappedMethod = async () => {
				currentAttempt++;

				if (currentAttempt > 1) {
					const retryMessage: SSERetry = {
						type: 'retry',
						message: `Retrying dual processing...`,
						attempt: currentAttempt,
						maxAttempts: maxRetries,
						processName: 'dual-processing'
					};
					await sendSSEMessage(writer, encoder, retryMessage);
				}

				try {
					return await originalProcessBrainDumpDual.call(processor, args);
				} catch (error) {
					if (currentAttempt < maxRetries) {
						// Will retry
						throw error;
					} else {
						// Final failure
						const finalErrorMessage: SSEError = {
							type: 'error',
							message: 'Dual processing failed after all retries',
							error: error.message,
							context: 'general',
							recoverable: false
						};
						await sendSSEMessage(writer, encoder, finalErrorMessage);
						throw error;
					}
				}
			};

			// Replace the internal method temporarily
			const originalMethod = processor['processBrainDumpDual'];
			processor['processBrainDumpDual'] = originalProcessBrainDumpDual;

			try {
				return await wrappedMethod();
			} finally {
				processor['processBrainDumpDual'] = originalMethod;
			}
		};

		// Execute dual processing
		const rawResult = await processor.processBrainDump({
			brainDump: content,
			userId,
			selectedProjectId,
			displayedQuestions,
			options: {
				...options,
				streamResults: true,
				useDualProcessing: true
			},
			brainDumpId: brainDumpId as string
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
		if (autoAccept && result.operations?.length > 0) {
			try {
				// Import operation executor
				const { OperationsExecutor } = await import(
					'$lib/utils/operations/operations-executor'
				);
				const executor = new OperationsExecutor(supabase);

				// Execute all operations
				const executionResult = await executor.executeOperations({
					operations: result.operations,
					userId,
					brainDumpId: brainDumpId || 'temp',
					projectQuestions: result.projectQuestions
				});

				// Get project info for the success view
				let projectInfo = null;

				// Check if a new project was created
				const createdProject = executionResult.results?.find(
					(r: any) => r.table === 'projects' && r.operationType === 'create'
				);

				if (createdProject?.id) {
					// New project was created - fetch the project details
					try {
						const { data: project, error } = await supabase
							.from('projects')
							.select('id, name, slug, description')
							.eq('id', createdProject.id)
							.eq('user_id', userId)
							.single();

						if (!error && project) {
							projectInfo = {
								id: project.id,
								name: project.name,
								slug: project.slug,
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
							.from('projects')
							.select('id, name, slug, description')
							.eq('id', selectedProjectId)
							.eq('user_id', userId)
							.single();

						if (!error && project) {
							projectInfo = {
								id: project.id,
								name: project.name,
								slug: project.slug,
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

				console.log('Auto-accept: Operations executed', {
					total: result.operations.length,
					successful: executionResult.successful?.length || 0,
					failed: executionResult.failed?.length || 0
				});

				// Update brain dump status to 'saved' after auto-accept
				// Note: Zero operations is valid when analysis determines no updates needed
				if (brainDumpId) {
					try {
						const { error: updateError } = await supabase
							.from('brain_dumps')
							.update({
								status: 'saved' as const,
								project_id: projectInfo?.id || selectedProjectId,
								metaData: JSON.stringify({
									operations: executionResult.successful || [],
									summary: result.summary || 'Brain dump processed successfully',
									insights: result.insights || 'Operations executed',
									totalOperations: result.operations.length,
									processingTime: Date.now(),
									timestamp: new Date().toISOString(),
									project_info: projectInfo,
									executionSummary: {
										successful: executionResult.successful?.length || 0,
										failed: executionResult.failed?.length || 0,
										results: executionResult.results?.length || 0
									},
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
								successfulCount: executionResult.successful?.length || 0
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

		const errorMessage: SSEError = {
			type: 'error',
			message: 'Processing failed',
			error: error instanceof Error ? error.message : 'Unknown error',
			context: 'general'
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
