// apps/web/src/routes/api/braindumps/generate/+server.ts
import type { RequestHandler } from './$types';
import { BrainDumpProcessor } from '$lib/utils/braindump-processor';
import { OperationsExecutor } from '$utils/operations-executor';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { LLMMetadata } from '$lib/types/error-logging';
import { rateLimiter, RATE_LIMITS } from '$lib/utils/rate-limiter';
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import { convertBrainDumpToProjectSpec } from '$lib/services/ontology/braindump-to-ontology-adapter';
// Improved cache implementation using WeakMap for automatic garbage collection
// WeakMap allows processor instances to be garbage collected when no longer referenced
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL
const MAX_CACHE_SIZE = 10; // Maximum cache size

// Use a regular Map for the cache keys and metadata, but store WeakRefs to processors
// This allows automatic cleanup when processors are no longer needed
interface CacheEntry {
	processorRef: WeakRef<BrainDumpProcessor>;
	timestamp: number;
	lastAccess: number;
}

const processorCache = new Map<string, CacheEntry>();

// Registry for cleanup callbacks - allows cleanup when processors are garbage collected
const cleanupRegistry = new FinalizationRegistry((userId: string) => {
	// Clean up cache entry when processor is garbage collected
	const entry = processorCache.get(userId);
	if (entry && !entry.processorRef.deref()) {
		processorCache.delete(userId);
	}
});

// Function to clean up expired entries
function cleanupExpiredEntries() {
	const now = Date.now();
	const keysToDelete: string[] = [];

	for (const [key, entry] of processorCache.entries()) {
		// Check if the processor was garbage collected or expired
		const processor = entry.processorRef.deref();
		if (!processor || now - entry.timestamp > CACHE_TTL) {
			keysToDelete.push(key);
		}
	}

	keysToDelete.forEach((key) => processorCache.delete(key));

	// Enforce max cache size using LRU eviction
	if (processorCache.size > MAX_CACHE_SIZE) {
		const sorted = Array.from(processorCache.entries()).sort(
			(a, b) => b[1].lastAccess - a[1].lastAccess
		);

		// Keep only the most recently used half
		const keepCount = Math.floor(MAX_CACHE_SIZE / 2);
		processorCache.clear();

		sorted.slice(0, keepCount).forEach(([key, entry]) => {
			// Only re-add if the processor still exists
			if (entry.processorRef.deref()) {
				processorCache.set(key, entry);
			}
		});
	}
}

// Periodic cleanup with proper lifecycle management
let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanupInterval() {
	if (cleanupInterval) {
		clearInterval(cleanupInterval);
	}

	cleanupInterval = setInterval(cleanupExpiredEntries, 60 * 1000); // Every minute

	// Make interval not block process exit
	if (cleanupInterval.unref) {
		cleanupInterval.unref();
	}
}

// Initialize cleanup on module load
if (typeof globalThis !== 'undefined') {
	startCleanupInterval();
}

// Clean up resources on process exit
if (typeof process !== 'undefined') {
	const cleanup = () => {
		if (cleanupInterval) {
			clearInterval(cleanupInterval);
			cleanupInterval = null;
		}
		processorCache.clear();
	};

	process.once('exit', cleanup);
	process.once('SIGINT', cleanup);
	process.once('SIGTERM', cleanup);
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const startTime = Date.now();
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const requestId = `braindump_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

	try {
		// Validate authentication
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		// Apply rate limiting to prevent DoS attacks (expensive AI operation)
		const rateLimitResult = rateLimiter.check(user.id, RATE_LIMITS.API_AI);
		if (!rateLimitResult.allowed) {
			const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
			return new Response(
				JSON.stringify({
					error: 'Rate limit exceeded. Please wait before processing another brain dump.',
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

		// Parse and validate request body
		const body = await parseRequestBody(request);
		if (!body || !body.action) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const {
			action,
			text,
			selectedProjectId,
			operations,
			originalText,
			summary,
			insights,
			brainDumpId,
			title,
			displayedQuestions,
			options,
			projectQuestions
		} = body;

		// Generate brainDumpId if not provided (for new brain dumps)
		let effectiveBrainDumpId = brainDumpId;
		if (!effectiveBrainDumpId && action === 'parse') {
			// Create a new brain dump entry for parsing
			const { data: newBrainDump, error: createError } = await supabase
				.from('brain_dumps')
				.insert({
					user_id: user.id,
					content: text,
					status: 'pending',
					project_id: selectedProjectId || null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.select()
				.single();

			if (createError || !newBrainDump) {
				console.error('Failed to create brain dump:', createError);
				return ApiResponse.error('Failed to create brain dump entry');
			}
			effectiveBrainDumpId = newBrainDump.id;
		}

		// Ensure brainDumpId is always defined before proceeding
		if (!effectiveBrainDumpId) {
			return ApiResponse.badRequest('Brain dump ID is required for this action');
		}

		// Get processor instance
		const processor = getProcessor(supabase, user.id);

		switch (action) {
			case 'parse': {
				// Validate parse request
				if (!text || typeof text !== 'string' || text.trim().length === 0) {
					return ApiResponse.validationError('text', 'Text is required for parsing');
				}

				if (text.length > 20000) {
					return ApiResponse.validationError(
						'text',
						'Text is too long (max 20,000 characters)'
					);
				}

				// Process brain dump with timeout
				const parseStartTime = Date.now();
				let parseResult;
				let llmMetadata: LLMMetadata = {};

				try {
					parseResult = await processor.processBrainDump({
						brainDump: text,
						userId: user.id,
						selectedProjectId: selectedProjectId,
						displayedQuestions: displayedQuestions,
						options: {
							autoExecute: options?.autoExecute || false, // Use client's autoExecute preference
							streamResults: options?.streamResults,
							useDualProcessing: options?.useDualProcessing,
							retryAttempts: options?.retryAttempts || 3
						},
						brainDumpId: effectiveBrainDumpId
					});

					// Track LLM metrics
					llmMetadata = {
						responseTimeMs: Date.now() - parseStartTime,
						provider: options?.llmProvider || 'openai',
						model: options?.llmModel || 'gpt-4'
					};
				} catch (parseError) {
					// Log parsing error
					await errorLogger.logBrainDumpError(
						parseError,
						effectiveBrainDumpId,
						{
							...llmMetadata,
							responseTimeMs: Date.now() - parseStartTime
						},
						{
							userId: user.id,
							projectId: selectedProjectId,
							endpoint: '/api/braindumps/generate',
							httpMethod: 'POST',
							requestId,
							operationType: 'parse',
							metadata: {
								textLength: text.length,
								options
							}
						}
					);
					throw parseError;
				}

				try {
					// IMPORTANT: Validate the parse results before storing
					if (
						!parseResult ||
						!parseResult.operations ||
						!Array.isArray(parseResult.operations)
					) {
						console.error('Invalid parse results structure:', parseResult);
						throw new Error('Invalid parse results');
					}

					// Update status based on whether operations were auto-executed
					const newStatus = parseResult.executionResult ? 'saved' : 'parsed';

					await supabase
						.from('brain_dumps')
						.update({
							title:
								parseResult.title ||
								`Brain Dump - ${new Date().toLocaleDateString()}`,
							status: newStatus,
							project_id: selectedProjectId,
							ai_insights: parseResult.insights, // Store actual AI insights
							ai_summary: parseResult.summary,
							parsed_results: JSON.stringify(parseResult), // Store complete parse results
							tags: parseResult.tags,
							updated_at: new Date().toISOString()
						})
						.eq('id', brainDumpId)
						.eq('user_id', user.id);

					console.log(
						`Brain dump ${effectiveBrainDumpId} status updated to ${newStatus}`
					);
				} catch (updateError) {
					console.warn('Failed to update brain dump status after parsing:', updateError);

					// Log database update error
					await errorLogger.logDatabaseError(
						updateError,
						'update',
						'brain_dumps',
						brainDumpId,
						{
							title: parseResult.title,
							status: parseResult.executionResult ? 'saved' : 'parsed',
							project_id: selectedProjectId,
							ai_insights: parseResult.insights,
							ai_summary: parseResult.summary,
							parsed_results: JSON.stringify(parseResult)
						}
					);
					// Don't fail the parse request if status update fails
				}

				// Include brainDumpId in the response for background processing
				return ApiResponse.success({
					...parseResult,
					brainDumpId: effectiveBrainDumpId
				});
			}

			case 'save': {
				// Validate save request
				if (!operations || !Array.isArray(operations) || operations.length === 0) {
					return ApiResponse.validationError(
						'operations',
						'Operations are required for saving'
					);
				}

				if (operations.length > 50) {
					return ApiResponse.validationError(
						'operations',
						'Too many operations (max 50)'
					);
				}

				// IMPORTANT: Ensure brain dump exists and is in correct status

				const { data: existingDump, error: fetchError } = await supabase
					.from('brain_dumps')
					.select('status, title, content, parsed_results')
					.eq('id', brainDumpId)
					.eq('user_id', user.id)
					.single();

				if (fetchError || !existingDump) {
					console.error('Brain dump not found:', brainDumpId);
					return ApiResponse.notFound('Brain dump not found');
				}

				// Only allow saving from 'parsed' status
				// if (existingDump.status !== 'parsed') {
				// 	return ApiResponse.badRequest(
				// 		`Cannot save brain dump in ${existingDump.status} status. Must be parsed first.`
				// 	);
				// }

				const isNewProject = !selectedProjectId || selectedProjectId === 'new';

				// Enhanced error handling for operation execution
				let executionResult;
				let projectInfo = null;
				let ontologyResult: {
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
				} | null = null;
				const executionStartTime = Date.now();

				try {
					if (isNewProject) {
						const rawParsedResults = existingDump.parsed_results;
						let parsedResults: any = undefined;

						if (rawParsedResults) {
							if (typeof rawParsedResults === 'string') {
								try {
									parsedResults = JSON.parse(rawParsedResults);
								} catch (parseError) {
									console.warn(
										'Failed to parse stored parsed_results:',
										parseError
									);
								}
							} else if (typeof rawParsedResults === 'object') {
								parsedResults = rawParsedResults;
							}
						}

						const projectSpec = convertBrainDumpToProjectSpec(
							operations,
							originalText || existingDump.content || '',
							{
								projectSummary: summary || parsedResults?.summary,
								projectContext: parsedResults?.contextResult?.projectCreate?.context
							}
						);

						const { project_id, counts } = await instantiateProject(
							supabase,
							projectSpec,
							user.id
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
							successful: operations,
							failed: [],
							results: []
						};
					} else {
						const operationsExecutor = new OperationsExecutor(supabase);
						executionResult = await operationsExecutor.executeOperations({
							operations,
							userId: user.id,
							brainDumpId,
							projectQuestions
						});

						// Log any failed operations
						if (executionResult.failed.length > 0) {
							for (const failedOp of executionResult.failed) {
								await errorLogger.logDatabaseError(
									failedOp.error || 'Operation failed',
									failedOp.operation,
									failedOp.table,
									failedOp.id,
									failedOp.data
								);
							}
						}

						// Better project information resolution
						const createdProject = executionResult.results?.find(
							(r: any) => r.table === 'onto_projects' && r.operationType === 'create'
						);

						if (createdProject?.id) {
							// New project was created - fetch the project details including slug
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
										isNew: true
									};
								} else {
									console.warn('Failed to fetch created project details:', error);
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
										isNew: false
									};
								} else {
									console.warn('Failed to fetch updated project details:', error);
								}
							} catch (error) {
								console.warn('Failed to fetch updated project details:', error);
							}
						}
					}
				} catch (error) {
					console.error('Operations execution failed completely:', error);

					// Log critical execution error
					await errorLogger.logBrainDumpError(
						error,
						brainDumpId,
						{
							responseTimeMs: Date.now() - executionStartTime
						},
						{
							userId: user.id,
							projectId: selectedProjectId,
							endpoint: '/api/braindumps/generate',
							httpMethod: 'POST',
							requestId,
							operationType: 'save',
							metadata: {
								operationsCount: operations.length,
								operationTypes: operations.map(
									(op) => `${op.table}:${op.operation}`
								),
								originalText,
								summary,
								insights
							}
						}
					);

					return ApiResponse.internalError(
						error,
						`Failed to save ${operations?.length} operations`
					);
				}

				// Update the existing brain dump status to 'saved' instead of creating a new one
				try {
					const projectIdForSave = projectInfo?.id || selectedProjectId;

					// Update the existing brain dump with status 'saved' and additional metadata
					const { error: updateError } = await supabase
						.from('brain_dumps')
						.update({
							status: 'saved' as const,
							project_id: projectIdForSave,
							title:
								title ||
								existingDump.title ||
								`Brain Dump - ${new Date().toLocaleDateString()}`,
							metaData: JSON.stringify({
								operations: executionResult.successful,
								summary: summary || 'Brain dump processed successfully',
								insights: insights || 'Operations executed',
								totalOperations: operations.length,
								tableBreakdown: operations.reduce(
									(acc, op) => {
										acc[op.table] = (acc[op.table] || 0) + 1;
										return acc;
									},
									{} as Record<string, number>
								),
								processingTime: Date.now() - startTime,
								timestamp: new Date().toISOString(),
								project_info: projectInfo,
								executionSummary: {
									successful: executionResult.successful.length,
									failed: executionResult.failed.length,
									results: executionResult.results?.length || 0
								},
								ontology: ontologyResult || undefined
							}),
							updated_at: new Date().toISOString()
						})
						.eq('id', brainDumpId)
						.eq('user_id', user.id);

					if (updateError) {
						console.error('Failed to update brain dump status to saved:', updateError);

						// Log the update error
						await errorLogger.logDatabaseError(
							updateError,
							'update',
							'brain_dumps',
							brainDumpId,
							{
								status: 'saved',
								project_id: projectIdForSave
							}
						);
						// Don't fail the entire request if status update fails
						// The operations were successful, which is the main goal
					} else {
						console.log('Brain dump status updated to saved successfully');
					}
				} catch (saveError) {
					console.error('Failed to update brain dump status:', saveError);

					// Log brain dump save error
					await errorLogger.logBrainDumpError(
						saveError,
						brainDumpId,
						{},
						{
							userId: user.id,
							projectId: projectInfo?.id || selectedProjectId,
							endpoint: '/api/braindumps/generate',
							httpMethod: 'POST',
							requestId,
							operationType: 'update_brain_dump_status',
							tableName: 'brain_dumps',
							metadata: {
								errorContext: 'Failed to update brain dump status after operations',
								executionSummary: {
									successful: executionResult.successful.length,
									failed: executionResult.failed.length
								}
							}
						}
					);
					// Don't fail the entire request if brain dump status update fails
					// The operations were successful, which is the main goal
				}

				// Enhanced response with detailed operation results
				const response = {
					totalOperations: operations.length,
					successfulOperations: executionResult.successful.length,
					failedOperations: executionResult.failed.length,
					brainDumpId: brainDumpId, // Use existing ID if save failed
					projectInfo,
					results: [
						...executionResult.successful.map((op) => ({
							table: op.table,
							operation: `${op.operation} succeeded`,
							id: op.id,
							operationType: op.operation
						})),
						...executionResult.failed.map((op) => ({
							table: op.table,
							operation: 'error',
							error: op.error,
							operationType: op.operation
						}))
					],
					executionSummary: {
						createdRecords:
							executionResult?.results?.filter((r) => r.operationType === 'create')
								.length || [],
						updatedRecords:
							executionResult?.results?.filter((r) => r.operationType === 'update')
								.length || [],
						failedValidations:
							executionResult?.failed?.filter((f) => f.error.includes('validation'))
								.length || [],
						referenceErrors:
							executionResult?.failed?.filter((f) => f.error.includes('reference'))
								.length || []
					}
				};

				// Return success even if some operations failed, but include the failure details
				return ApiResponse.success(response);
			}

			// Keep 'process' for backward compatibility, but redirect to 'save'
			case 'process': {
				// Redirect to save action
				return POST({
					request: new Request(request.url, {
						method: 'POST',
						headers: request.headers,
						body: JSON.stringify({ ...body, action: 'save' })
					}),
					locals: { supabase, safeGetSession }
				} as any);
			}

			default:
				return ApiResponse.badRequest('Invalid action');
		}
	} catch (error) {
		console.error('Brain dump API error:', error);

		// Log unexpected errors
		const { user } = await safeGetSession();
		const body = await parseRequestBody(request);
		await errorLogger.logError(
			error,
			{
				userId: user?.id,
				endpoint: '/api/braindumps/generate',
				httpMethod: 'POST',
				requestId,
				metadata: {
					action: body?.action,
					errorContext: 'Unexpected error in brain dump API',
					brainDumpId: body?.brainDumpId
				}
			},
			'critical'
		);

		// Return appropriate error response
		const isTimeout = error instanceof Error && error.message.includes('timeout');
		if (isTimeout) {
			return ApiResponse.timeout(
				'Operation timed out. Please try with a smaller brain dump.'
			);
		}

		return ApiResponse.internalError(error);
	}
};

// Get or create processor instance with WeakRef-based caching
function getProcessor(supabase: any, userId: string): BrainDumpProcessor {
	const now = Date.now();
	const cacheKey = userId;

	// Check if we have a cached processor
	const cachedEntry = processorCache.get(cacheKey);
	if (cachedEntry) {
		const processor = cachedEntry.processorRef.deref();

		// Check if processor still exists and hasn't expired
		if (processor && now - cachedEntry.timestamp < CACHE_TTL) {
			// Update last access time for LRU tracking
			cachedEntry.lastAccess = now;
			return processor;
		} else {
			// Remove stale entry
			processorCache.delete(cacheKey);
		}
	}

	// Clean up expired entries opportunistically
	cleanupExpiredEntries();

	// Create new processor
	const processor = new BrainDumpProcessor(supabase);

	// Register for cleanup when processor is garbage collected
	cleanupRegistry.register(processor, userId);

	// Cache with WeakRef
	processorCache.set(cacheKey, {
		processorRef: new WeakRef(processor),
		timestamp: now,
		lastAccess: now
	});

	return processor;
}
