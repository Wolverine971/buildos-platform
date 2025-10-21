// apps/web/src/lib/services/prompts/core/validations.ts
import { BrainDumpParseResult, ParsedOperation } from '$lib/types';
import { hasInflatedHeadings, normalizeMarkdownHeadings } from '$utils/markdown-nesting';
import { OperationValidator } from '$utils/operations-executor';

export const validateSynthesisResult = (
	result: any,
	selectedProjectId?: string
): BrainDumpParseResult => {
	if (!result || typeof result !== 'object') {
		throw new Error('Invalid synthesis result format');
	}

	if (!Array.isArray(result.operations)) {
		throw new Error('Synthesis result missing operations array');
	}

	if (result.operations && result.operations.length > 0) {
		result.operations = validateAndSanitizeCrudOperations(result.operations, selectedProjectId);
	}

	return {
		title: result.title,
		operations: result.operations || [],
		summary: result.summary || 'No summary provided',
		insights: result.insights || 'No insights provided',
		metadata: {
			...(result.metadata || {}),
			processingNote: result.metadata?.processingNote || result.processingNote
		},
		tags: result.tags || [],
		// Include optional fields from LLM response
		questionAnalysis: result.questionAnalysis,
		projectQuestions: result.projectQuestions
	};
};

const validateAndSanitizeCrudOperations = (
	operations: ParsedOperation[],
	selectedProjectId?: string
): ParsedOperation[] => {
	return operations.map((operation) => {
		const data = { ...operation.data };

		// Normalize markdown headings in project context
		// ALWAYS normalize to prevent heading inflation across multiple brain dump processing cycles
		if (operation.table === 'projects' && data.context) {
			const hadInflatedHeadings = hasInflatedHeadings(data.context, 2);
			data.context = normalizeMarkdownHeadings(data.context, 2);
			if (hadInflatedHeadings) {
				console.warn(
					'[validations] Normalized inflated headings in project context. Heading levels were beyond expected depth.'
				);
			}
		}

		// Also normalize headings in task descriptions and details
		// ALWAYS normalize for consistency across all task content
		if (operation.table === 'tasks') {
			if (data.description) {
				const hadInflatedDesc = hasInflatedHeadings(data.description, 1);
				data.description = normalizeMarkdownHeadings(data.description, 1);
				if (hadInflatedDesc) {
					console.warn(
						'[validations] Normalized inflated headings in task description. Heading levels were beyond expected depth.'
					);
				}
			}
			if (data.details) {
				const hadInflatedDetails = hasInflatedHeadings(data.details, 1);
				data.details = normalizeMarkdownHeadings(data.details, 1);
				if (hadInflatedDetails) {
					console.warn(
						'[validations] Normalized inflated headings in task details. Heading levels were beyond expected depth.'
					);
				}
			}
			if (selectedProjectId) {
				operation.data = { ...operation.data, project_id: selectedProjectId };
			}
		}

		// For new projects, keep project_ref (will be resolved during execution)
		// No need for metadata fields since we're handling this differently now
		let validationData = { ...data };

		const operationValidator = new OperationValidator();

		// Validate with the potentially modified data
		const validationResult = operationValidator.validateOperation({
			...operation,
			data: validationData
		});

		if (!validationResult.isValid) {
			return {
				...operation,
				data,
				enabled: false,
				error: validationResult.error
			};
		}

		// Use original data (with project_ref), not the validation data
		return {
			...operation,
			data: data, // Keep original data with project_ref
			enabled: true
		};
	});
};
