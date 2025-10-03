// apps/web/src/routes/api/braindumps/stream-short/+server.ts
import type { RequestHandler } from './$types';
import { ShortBrainDumpStreamProcessor } from '$utils/braindump-processor-stream-short';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { BrainDumpStatusService } from '$lib/services/braindump-status.service';
import type {
	TableName,
	BrainDumpOptions,
	DisplayedBrainDumpQuestion
} from '$lib/types/brain-dump';
import type {
	StreamingMessage,
	SSEStatus,
	SSEContextProgress,
	SSETasksProgress,
	SSEComplete,
	SSEError,
	SSEContextUpdateRequired
} from '$lib/types/sse-messages';
import { SSEResponse } from '$lib/utils/sse-response';
import { validateSynthesisResult } from '$lib/services/prompts/core/validations';
import { BrainDumpValidator } from '$lib/utils/braindump-validation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		// Validate authentication
		const { user } = await safeGetSession();
		if (!user) {
			return SSEResponse.unauthorized();
		}

		// Parse request body
		const requestBody = await request.json();

		// Use unified validation for short braindump
		const validation = await BrainDumpValidator.validateShort(requestBody);
		if (!validation.isValid) {
			return validation.error!;
		}

		const { content, selectedProjectId, brainDumpId, displayedQuestions, options, autoAccept } =
			validation.validatedData!;

		// Create a TransformStream for SSE
		const { response, writer, encoder } = SSEResponse.createStream();

		// Process in background
		processShortBrainDumpWithStreaming({
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
		return SSEResponse.internalError(error, 'Error in short brain dump stream endpoint');
	}
};

async function processShortBrainDumpWithStreaming({
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
	selectedProjectId: string;
	brainDumpId?: string;
	displayedQuestions?: DisplayedBrainDumpQuestion[];
	writer: WritableStreamDefaultWriter;
	encoder: TextEncoder;
	userId: string;
	supabase: SupabaseClient<Database>;
	options: BrainDumpOptions | undefined;
	autoAccept: boolean;
}) {
	const processor = new ShortBrainDumpStreamProcessor(supabase);
	const activityLogger = new ActivityLogger(supabase);
	const statusService = new BrainDumpStatusService(supabase);

	try {
		// Send initial status - only tasks at first
		const statusMessage: SSEStatus = {
			type: 'status',
			message: 'Starting task extraction...',
			data: {
				processes: ['tasks'], // Start with just tasks
				contentLength: content.length,
				isShortBraindump: true,
				source: 'short-braindump'
			}
		};
		await sendSSEMessage(writer, encoder, statusMessage);

		// Step 1: Extract tasks first with question generation and determine if context update is needed
		const tasksProcessingMessage: SSETasksProgress = {
			type: 'tasksProgress',
			message: 'Extracting tasks...',
			data: { status: 'processing' }
		};
		await sendSSEMessage(writer, encoder, tasksProcessingMessage);

		// Extract tasks with context decision AND question generation
		const validatedTaskResult = await processor.extractTasksWithContextDecision({
			content,
			projectId: selectedProjectId,
			displayedQuestions,
			userId
		});

		// Convert tasks to operations
		const taskOperations = processor.parseTaskOperations(
			validatedTaskResult.tasks || [],
			selectedProjectId
		);

		// Send task results immediately (now includes projectQuestions)
		const tasksCompleteMessage: SSETasksProgress = {
			type: 'tasksProgress',
			message: 'Tasks extracted',
			data: {
				status: 'completed',
				preview: {
					tasks: validatedTaskResult.tasks || [],
					notes: [] // Short braindumps typically don't have notes
				}
			}
		};
		await sendSSEMessage(writer, encoder, tasksCompleteMessage);

		// Check if we need to process context
		let contextResult = null;
		let contextOperations = [];

		// Start with questions generated during task extraction
		let finalProjectQuestions = validatedTaskResult.projectQuestions || [];

		if (validatedTaskResult.requiresContextUpdate) {
			// Notify frontend that context processing is starting
			const contextUpdateMessage: SSEContextUpdateRequired = {
				type: 'contextUpdateRequired',
				message: 'Context update needed',
				data: {
					reason:
						validatedTaskResult.contextUpdateReason ||
						'Information requires context update',
					processes: ['tasks', 'context'], // Update to show both processes
					required: true
				}
			};
			await sendSSEMessage(writer, encoder, contextUpdateMessage);

			// Send context processing status
			const contextProcessingMessage: SSEContextProgress = {
				type: 'contextProgress',
				message: 'Processing project context...',
				data: { status: 'processing' }
			};
			await sendSSEMessage(writer, encoder, contextProcessingMessage);

			try {
				// Process context update
				const contextLLMResult = await processor.processContextForShortBrainDump({
					content,
					projectId: selectedProjectId,
					reason:
						validatedTaskResult.contextUpdateReason ||
						'Information requires context update',
					userId
				});

				// Parse context operations
				if (contextLLMResult.projectUpdate) {
					contextOperations.push({
						id: `op-${Date.now()}-context-update`, // Add unique ID
						table: 'projects' as TableName,
						operation: 'update' as const,
						data: {
							id: selectedProjectId, // Include the project ID in the data
							...contextLLMResult.projectUpdate
						},
						conditions: { id: selectedProjectId },
						enabled: true
					});

					contextResult = {
						projectUpdate: contextLLMResult.projectUpdate,
						title: contextLLMResult.title || 'Project Context Updated',
						summary: contextLLMResult.summary || '',
						insights: contextLLMResult.insights || '',
						tags: contextLLMResult.tags || [],
						projectQuestions: contextLLMResult.projectQuestions // shouldnt have more questions // Include any additional questions from context
					};
				}

				// Merge questions if context processing generated additional ones
				if (contextLLMResult.projectQuestions?.length) {
					// Combine questions, avoiding duplicates based on question text
					const questionTexts = new Set(
						finalProjectQuestions.map((q) => q.question?.toLowerCase())
					);
					const newQuestions = contextLLMResult.projectQuestions.filter(
						(q) => !questionTexts.has(q.question?.toLowerCase())
					);
					finalProjectQuestions = [...finalProjectQuestions, ...newQuestions];
				}

				// Send context completion
				const contextCompleteMessage: SSEContextProgress = {
					type: 'contextProgress',
					message: 'Project context processed',
					data: {
						status: 'completed',
						preview: contextResult || undefined
					}
				};
				await sendSSEMessage(writer, encoder, contextCompleteMessage);
			} catch (contextError: any) {
				console.error('Context processing failed:', contextError);

				// Send context failure but allow continuation
				const contextErrorMessage: SSEContextProgress = {
					type: 'contextProgress',
					message: 'Context processing failed',
					data: {
						status: 'failed',
						error: contextError.message,
						allowContinue: true // Tasks can still be used
					}
				};
				await sendSSEMessage(writer, encoder, contextErrorMessage);
			}
		} else {
			// No context update needed - but we still have questions from task extraction
			const noContextUpdateMessage: SSEContextUpdateRequired = {
				type: 'contextUpdateRequired',
				message: 'No context update needed',
				data: {
					reason: 'Tasks are self-contained',
					processes: ['tasks'], // Keep single process
					required: false
				}
			};
			await sendSSEMessage(writer, encoder, noContextUpdateMessage);
		}

		// Combine all operations and ensure all have IDs
		const allOperations = [...taskOperations, ...contextOperations].map((op, index) => {
			// Ensure every operation has an ID (safety check)
			if (!op.id) {
				op.id = `op-${Date.now()}-fallback-${index}`;
				console.warn('Operation missing ID, adding fallback:', op);
			}
			return op;
		});

		// Update question status if we have question analysis
		if (validatedTaskResult.questionAnalysis && displayedQuestions?.length) {
			try {
				// Import BrainDumpProcessor to use its updateQuestionStatus method
				// This could be moved to a centralized service in the future
				const { BrainDumpProcessor } = await import('$lib/utils/braindump-processor');
				const brainDumpProcessor = new BrainDumpProcessor(supabase);
				await brainDumpProcessor['updateQuestionStatus'](
					validatedTaskResult.questionAnalysis,
					displayedQuestions,
					brainDumpId || '',
					userId
				);
			} catch (error) {
				console.warn('Failed to update question status:', error);
			}
		}

		// Calculate table breakdown for metadata
		const tableBreakdown: Record<string, number> = {};
		allOperations.forEach((op) => {
			tableBreakdown[op.table] = (tableBreakdown[op.table] || 0) + 1;
		});

		// Prepare final result - use task result metadata first, then context result if available
		const resultData = {
			operations: allOperations,
			title:
				contextResult?.title ||
				validatedTaskResult.title ||
				`Tasks Added - ${new Date().toLocaleDateString()}`,
			summary:
				contextResult?.summary ||
				validatedTaskResult.summary ||
				`Added ${taskOperations.length} task(s)`,
			insights: contextResult?.insights || validatedTaskResult.insights || '',
			tags: validatedTaskResult.tags || [],
			metadata: {
				totalOperations: allOperations.length,
				tableBreakdown,
				processingTime: Date.now(),
				timestamp: new Date().toISOString(),
				source: 'short_braindump',
				contentLength: content.length,
				requiresContextUpdate: validatedTaskResult.requiresContextUpdate,
				contextUpdateReason: validatedTaskResult.contextUpdateReason
			},
			// executionResult, // Remove this since we're not executing yet
			questionAnalysis: validatedTaskResult.questionAnalysis,
			projectQuestions: finalProjectQuestions // Always include project questions (from tasks and/or context)
		};

		const finalResult = validateSynthesisResult(resultData, selectedProjectId);

		// Update brain dump status using the centralized service
		if (brainDumpId) {
			try {
				// Use the centralized status service for updating
				const updateSuccess = await statusService.updateToParsed(
					brainDumpId,
					userId,
					finalResult,
					selectedProjectId
				);

				if (updateSuccess) {
					console.log('Short brain dump updated with parsed status:', brainDumpId);
				} else {
					console.warn('Failed to update brain dump status after parsing');
				}
			} catch (updateError) {
				console.warn('Failed to update brain dump status after parsing:', updateError);
			}
		}

		// If auto-accept is enabled, execute the operations
		let executionResult = null;
		let projectInfo = null;
		if (autoAccept && finalResult.operations?.length > 0) {
			try {
				// Import operation executor
				const { OperationsExecutor } = await import(
					'$lib/utils/operations/operations-executor'
				);
				const executor = new OperationsExecutor(supabase);

				// Execute all operations
				executionResult = await executor.executeOperations({
					operations: finalResult.operations,
					userId,
					brainDumpId: brainDumpId || 'temp',
					projectQuestions: finalResult.projectQuestions
				});

				// Get project info for the success view
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
								isNew: false
							};
						}
					} catch (error) {
						console.warn('Failed to fetch updated project details:', error);
					}
				}

				console.log('Auto-accept: Short braindump operations executed', {
					total: finalResult.operations.length,
					successful: executionResult.successful?.length || 0,
					failed: executionResult.failed?.length || 0,
					projectInfo
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
									summary:
										finalResult.summary || 'Brain dump processed successfully',
									insights: finalResult.insights || 'Operations executed',
									totalOperations: finalResult.operations.length,
									processingTime: Date.now(),
									timestamp: new Date().toISOString(),
									project_info: projectInfo,
									executionSummary: {
										successful: executionResult.successful?.length || 0,
										failed: executionResult.failed?.length || 0,
										results: executionResult.results?.length || 0
									},
									autoAccepted: true,
									requiresContextUpdate:
										validatedTaskResult.requiresContextUpdate,
									contextUpdateReason: validatedTaskResult.contextUpdateReason,
									zeroOperationsReason:
										finalResult.operations.length === 0
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
							console.log(
								'Short brain dump status updated to saved after auto-accept',
								{
									operationsCount: finalResult.operations.length,
									successfulCount: executionResult.successful?.length || 0
								}
							);
						}
					} catch (error) {
						console.error('Error updating brain dump status after auto-accept:', error);
					}
				}
			} catch (error) {
				console.error('Failed to execute operations with auto-accept:', error);
				// Add error to result but continue
				executionResult = {
					successful: [],
					failed: [],
					results: [],
					error: error instanceof Error ? error.message : 'Failed to execute operations'
				};
			}
		}

		// Send final result with execution and project info if applicable
		const completeMessage: SSEComplete = {
			type: 'complete',
			message: autoAccept
				? 'Processing complete - operations applied'
				: 'Processing complete',
			result: executionResult ? { ...finalResult, executionResult, projectInfo } : finalResult
		};
		await sendSSEMessage(writer, encoder, completeMessage);

		// Log completion
		await activityLogger.logActivity(userId, 'short_brain_dump_stream_completed', {
			content_length: content.length,
			operations_count: allOperations.length,
			project_id: selectedProjectId,
			required_context_update: validatedTaskResult.requiresContextUpdate
		});
	} catch (error) {
		console.error('Error in short brain dump streaming:', error);

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
