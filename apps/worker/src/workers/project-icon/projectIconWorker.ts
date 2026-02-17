// apps/worker/src/workers/project-icon/projectIconWorker.ts
import type {
	ProjectIconGenerationJobMetadata,
	ProjectIconGenerationResult
} from '@buildos/shared-types';
import sanitizeHtml from 'sanitize-html';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase } from '../../lib/supabase';

const MAX_ICON_BYTES = 4096;
const MAX_ICON_ELEMENTS = 26;
const PROJECT_ICON_GENERATION_ENABLED =
	String(process.env.ENABLE_PROJECT_ICON_GENERATION ?? 'false').toLowerCase() === 'true';
const PROJECT_ICON_GENERATION_DISABLED_MESSAGE = 'Project image generation is temporarily disabled';

const ALLOWED_TAGS = [
	'svg',
	'g',
	'path',
	'circle',
	'rect',
	'line',
	'polyline',
	'polygon',
	'ellipse'
];

const ALLOWED_ATTRS = {
	svg: [
		'xmlns',
		'viewBox',
		'fill',
		'stroke',
		'stroke-width',
		'stroke-linecap',
		'stroke-linejoin'
	],
	g: ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform'],
	path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform'],
	circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
	rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
	line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'],
	polyline: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
	polygon: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
	ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width']
};

type IconCandidate = {
	concept: string;
	svgRaw: string;
	svgSanitized: string;
	byteSize: number;
};

type ProjectContextPayload = {
	project: {
		id: string;
		name: string | null;
		description: string | null;
		facet_context: string | null;
		facet_stage: string | null;
		state_key: string | null;
	};
	topGoals: Array<{ name: string; description: string | null }>;
	topTasks: Array<{ title: string }>;
	topDocuments: Array<{ title: string; description: string | null }>;
};

function sanitizeIconSvg(raw: string): string {
	return sanitizeHtml(raw, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: ALLOWED_ATTRS,
		allowedSchemes: [],
		allowedSchemesByTag: {},
		parser: { lowerCaseAttributeNames: false }
	}).trim();
}

function validateSanitizedIconSvg(svg: string): { valid: true } | { valid: false; reason: string } {
	const trimmed = svg.trim();
	if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) {
		return { valid: false, reason: 'SVG must start with <svg and end with </svg>' };
	}

	if (!/viewBox\s*=\s*["']0 0 64 64["']/i.test(trimmed)) {
		return { valid: false, reason: 'SVG must include viewBox="0 0 64 64"' };
	}

	if (!/stroke\s*=\s*["']currentColor["']/i.test(trimmed)) {
		return { valid: false, reason: 'SVG must include stroke="currentColor"' };
	}

	if (
		/[\s<]style\s*=|[\s<]class\s*=|\son[a-z]+\s*=|<\s*foreignObject\b|<\s*script\b/i.test(
			trimmed
		)
	) {
		return {
			valid: false,
			reason: 'SVG contains disallowed style/class/handler/script content'
		};
	}

	const byteSize = Buffer.byteLength(trimmed, 'utf8');
	if (byteSize > MAX_ICON_BYTES) {
		return { valid: false, reason: `SVG exceeds ${MAX_ICON_BYTES} bytes` };
	}

	// Count only inner elements. The root <svg> tag is required and should not consume budget.
	const elementCount = (
		trimmed.match(/<\s*(g|path|circle|rect|line|polyline|polygon|ellipse)\b/gi) || []
	).length;
	if (elementCount > MAX_ICON_ELEMENTS) {
		return {
			valid: false,
			reason: `SVG exceeds ${MAX_ICON_ELEMENTS} allowed elements (found ${elementCount})`
		};
	}

	return { valid: true };
}

function buildProjectContextPayload(raw: any): ProjectContextPayload {
	const project = raw?.project ?? {};
	const goals = Array.isArray(raw?.goals) ? raw.goals : [];
	const tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
	const documents = Array.isArray(raw?.documents) ? raw.documents : [];

	return {
		project: {
			id: project.id,
			name: project.name ?? null,
			description: project.description ?? null,
			facet_context: project.facet_context ?? null,
			facet_stage: project.facet_stage ?? null,
			state_key: project.state_key ?? null
		},
		topGoals: goals
			.filter((goal: any) => typeof goal?.name === 'string' && goal.name.trim().length > 0)
			.slice(0, 6)
			.map((goal: any) => ({
				name: goal.name.trim(),
				description:
					typeof goal.description === 'string' && goal.description.trim().length > 0
						? goal.description.trim()
						: null
			})),
		topTasks: tasks
			.filter((task: any) => typeof task?.title === 'string' && task.title.trim().length > 0)
			.slice(0, 10)
			.map((task: any) => ({ title: task.title.trim() })),
		topDocuments: documents
			.filter((doc: any) => typeof doc?.title === 'string' && doc.title.trim().length > 0)
			.slice(0, 8)
			.map((doc: any) => ({
				title: doc.title.trim(),
				description:
					typeof doc.description === 'string' && doc.description.trim().length > 0
						? doc.description.trim()
						: null
			}))
	};
}

function renderList(items: string[]): string {
	if (items.length === 0) return '(none)';
	return items.map((item) => `- ${item}`).join('\n');
}

type ImagePromptQueryDraft = {
	imagePromptQuery: string;
	visualIntent?: string | null;
	styleKeywords?: string[] | null;
	subjectKeywords?: string[] | null;
	compositionNotes?: string | null;
	avoidNotes?: string | null;
};

function buildImagePromptQueryPrompts(params: {
	context: ProjectContextPayload;
	steeringPrompt?: string;
}) {
	const { context, steeringPrompt } = params;

	const goals = context.topGoals.map((goal) =>
		goal.description ? `${goal.name}: ${goal.description}` : goal.name
	);
	const taskTitles = context.topTasks.map((task) => task.title);
	const documentSummaries = context.topDocuments.map((doc) =>
		doc.description ? `${doc.title}: ${doc.description}` : doc.title
	);

	const systemPrompt = [
		'You are an expert art director for product icon generation.',
		'Generate one concise, high-signal image prompt query for an icon generator.',
		'Output JSON only.',
		'Focus on symbolic meaning, visual metaphor, composition, and style constraints.',
		'The query must be specific enough to generate a coherent icon family.'
	].join('\n');

	const userPrompt = [
		'Synthesize an image prompt query from project ontology context.',
		'',
		'Project context:',
		`- Name: ${context.project.name ?? '(untitled project)'}`,
		`- Description: ${context.project.description ?? '(none)'}`,
		`- Stage: ${context.project.facet_stage ?? '(none)'}`,
		`- Facet Context: ${context.project.facet_context ?? '(none)'}`,
		`- State: ${context.project.state_key ?? '(none)'}`,
		`- Goals:\n${renderList(goals)}`,
		`- Tasks:\n${renderList(taskTitles)}`,
		`- Documents:\n${renderList(documentSummaries)}`,
		'',
		'User style direction:',
		steeringPrompt && steeringPrompt.trim().length > 0
			? steeringPrompt.trim()
			: '(none provided)',
		'',
		'Return JSON with this shape:',
		'{',
		'  "imagePromptQuery": "single-paragraph prompt for icon generation",',
		'  "visualIntent": "short phrase",',
		'  "styleKeywords": ["..."],',
		'  "subjectKeywords": ["..."],',
		'  "compositionNotes": "optional short note",',
		'  "avoidNotes": "optional short note"',
		'}'
	].join('\n');

	return { systemPrompt, userPrompt };
}

function buildFallbackImagePromptQuery(params: {
	context: ProjectContextPayload;
	steeringPrompt?: string;
}): string {
	const { context, steeringPrompt } = params;
	const goals =
		context.topGoals
			.map((goal) => goal.name)
			.slice(0, 3)
			.join(', ') || 'core project goals';
	const tasks =
		context.topTasks
			.map((task) => task.title)
			.slice(0, 4)
			.join(', ') || 'primary tasks';

	return [
		`Design a minimalist Lucide-style icon for "${context.project.name ?? 'this project'}".`,
		`Convey: ${context.project.description ?? context.project.facet_context ?? 'project intent'}.`,
		`Visual motifs inspired by goals: ${goals}.`,
		`Operational context from tasks: ${tasks}.`,
		'Use clean stroke-based geometry, high legibility at small size, strong central metaphor, and no text.',
		steeringPrompt && steeringPrompt.trim().length > 0
			? `Style direction: ${steeringPrompt.trim()}.`
			: ''
	]
		.filter((segment) => segment.length > 0)
		.join(' ');
}

async function synthesizeImagePromptQuery(params: {
	llm: SmartLLMService;
	userId: string;
	projectId: string;
	context: ProjectContextPayload;
	steeringPrompt?: string;
}): Promise<{ imagePromptQuery: string; usedFallback: boolean }> {
	const prompts = buildImagePromptQueryPrompts({
		context: params.context,
		steeringPrompt: params.steeringPrompt
	});

	try {
		const response = await params.llm.getJSONResponse<ImagePromptQueryDraft>({
			systemPrompt: prompts.systemPrompt,
			userPrompt: prompts.userPrompt,
			userId: params.userId,
			profile: 'balanced',
			temperature: 0.35,
			operationType: 'project_icon_prompt_synthesis',
			projectId: params.projectId,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			}
		});

		const primaryQuery =
			typeof response?.imagePromptQuery === 'string' ? response.imagePromptQuery.trim() : '';
		if (primaryQuery.length > 0) {
			return { imagePromptQuery: primaryQuery, usedFallback: false };
		}
	} catch {
		// Fall through to deterministic fallback query below.
	}

	return {
		imagePromptQuery: buildFallbackImagePromptQuery({
			context: params.context,
			steeringPrompt: params.steeringPrompt
		}),
		usedFallback: true
	};
}

async function resolveImagePromptQuery(params: {
	llm: SmartLLMService;
	userId: string;
	projectId: string;
	context: ProjectContextPayload;
	steeringPrompt?: string;
}): Promise<{ imagePromptQuery: string; source: 'user' | 'llm' | 'fallback' }> {
	const userPrompt =
		typeof params.steeringPrompt === 'string' ? params.steeringPrompt.trim() : '';
	if (userPrompt.length > 0) {
		return {
			imagePromptQuery: userPrompt,
			source: 'user'
		};
	}

	const synthesized = await synthesizeImagePromptQuery({
		llm: params.llm,
		userId: params.userId,
		projectId: params.projectId,
		context: params.context,
		steeringPrompt: undefined
	});

	return {
		imagePromptQuery: synthesized.imagePromptQuery,
		source: synthesized.usedFallback ? 'fallback' : 'llm'
	};
}

function buildCandidateGenerationPrompts(params: {
	context: ProjectContextPayload;
	imagePromptQuery: string;
	candidateCount: number;
	correctionHint?: string;
}) {
	const { context, imagePromptQuery, candidateCount, correctionHint } = params;

	const systemPrompt = [
		'You are a minimalist icon designer.',
		'Return JSON only.',
		'Generate Lucide-like stroke-only SVG icons using currentColor.',
		'No text, no external references, no animation, no raster images.',
		'Each SVG must use viewBox="0 0 64 64" and include stroke="currentColor".'
	].join('\n');

	const correctionSection = correctionHint
		? `\nCorrection requirements from previous attempt:\n${correctionHint}\n`
		: '';

	const userPrompt = [
		`Generate ${candidateCount} SVG icon candidates using this resolved image prompt query.`,
		'',
		`Project name: ${context.project.name ?? '(untitled project)'}`,
		'',
		'Image prompt query:',
		imagePromptQuery,
		correctionSection,
		'Return JSON:',
		'{',
		'  "candidates": [',
		'    { "concept": "...", "svg": "<svg ...>...</svg>" }',
		'  ]',
		'}'
	].join('\n');

	return { systemPrompt, userPrompt };
}

function normalizeRawCandidates(response: any): Array<{ concept: string; svg: string }> {
	const candidates = Array.isArray(response?.candidates)
		? response.candidates
		: Array.isArray(response)
			? response
			: [];

	return candidates
		.map((candidate: any) => ({
			concept:
				typeof candidate?.concept === 'string' && candidate.concept.trim().length > 0
					? candidate.concept.trim()
					: 'Icon concept',
			svg: typeof candidate?.svg === 'string' ? candidate.svg : ''
		}))
		.filter((candidate: { concept: string; svg: string }) => candidate.svg.trim().length > 0);
}

async function generateValidCandidates(params: {
	llm: SmartLLMService;
	userId: string;
	projectId: string;
	context: ProjectContextPayload;
	imagePromptQuery: string;
	candidateCount: number;
	correctionHint?: string;
}): Promise<{ candidates: IconCandidate[]; droppedReasons: string[] }> {
	const prompts = buildCandidateGenerationPrompts({
		context: params.context,
		imagePromptQuery: params.imagePromptQuery,
		candidateCount: params.candidateCount,
		correctionHint: params.correctionHint
	});

	const response = await params.llm.getJSONResponse<{
		candidates: Array<{ concept: string; svg: string }>;
	}>({
		systemPrompt: prompts.systemPrompt,
		userPrompt: prompts.userPrompt,
		userId: params.userId,
		profile: 'balanced',
		temperature: 0.45,
		operationType: 'project_icon_generation',
		projectId: params.projectId,
		validation: {
			retryOnParseError: true,
			maxRetries: 2
		}
	});

	const rawCandidates = normalizeRawCandidates(response);
	const validCandidates: IconCandidate[] = [];
	const droppedReasons: string[] = [];

	for (const raw of rawCandidates) {
		const svgSanitized = sanitizeIconSvg(raw.svg);
		const validation = validateSanitizedIconSvg(svgSanitized);
		if (!validation.valid) {
			droppedReasons.push(validation.reason);
			continue;
		}

		validCandidates.push({
			concept: raw.concept,
			svgRaw: raw.svg,
			svgSanitized,
			byteSize: Buffer.byteLength(svgSanitized, 'utf8')
		});
	}

	return { candidates: validCandidates, droppedReasons };
}

function chooseAutoCandidate(
	candidates: Array<{
		id: string;
		candidate_index: number;
		concept: string;
		svg_sanitized: string;
	}>
) {
	if (candidates.length === 0) return null;
	return [...candidates].sort((a, b) => a.candidate_index - b.candidate_index)[0] ?? null;
}

async function markGenerationFailed(
	generationId: string,
	projectId: string,
	errorMessage: string
): Promise<void> {
	const { error } = await (supabase as any)
		.from('onto_project_icon_generations')
		.update({
			status: 'failed',
			error_message: errorMessage,
			completed_at: new Date().toISOString()
		})
		.eq('id', generationId)
		.eq('project_id', projectId);

	if (error) {
		throw new Error(`Failed to persist generation failure state: ${error.message}`);
	}
}

export async function processProjectIconJob(
	job: ProcessingJob<ProjectIconGenerationJobMetadata>
): Promise<ProjectIconGenerationResult> {
	const generationId = typeof job.data?.generationId === 'string' ? job.data.generationId : '';
	const projectId = typeof job.data?.projectId === 'string' ? job.data.projectId : '';
	const requestedByUserId =
		typeof job.data?.requestedByUserId === 'string' ? job.data.requestedByUserId : '';
	const candidateCount = Math.min(
		8,
		Math.max(
			1,
			Math.floor(typeof job.data?.candidateCount === 'number' ? job.data.candidateCount : 1)
		)
	);
	const autoSelect = Boolean(job.data?.autoSelect);
	const triggerSource =
		job.data?.triggerSource === 'auto' ||
		job.data?.triggerSource === 'manual' ||
		job.data?.triggerSource === 'regenerate'
			? job.data.triggerSource
			: 'manual';
	const steeringPrompt =
		typeof job.data?.steeringPrompt === 'string' ? job.data.steeringPrompt.trim() : undefined;

	let stage = 'validate_metadata';

	try {
		if (!generationId || !projectId || !requestedByUserId) {
			const missingFields: string[] = [];
			if (!generationId) missingFields.push('generationId');
			if (!projectId) missingFields.push('projectId');
			if (!requestedByUserId) missingFields.push('requestedByUserId');
			throw new Error(
				`Invalid project icon job metadata: missing ${missingFields.join(', ')}`
			);
		}

		if (!PROJECT_ICON_GENERATION_ENABLED) {
			stage = 'feature_disabled';
			await job.log('Project icon generation is disabled; marking generation as failed');
			await markGenerationFailed(
				generationId,
				projectId,
				PROJECT_ICON_GENERATION_DISABLED_MESSAGE
			);
			return {
				success: true,
				projectId,
				generationId,
				skipped: true,
				reason: 'feature_disabled'
			};
		}

		await job.log(
			`Project icon generation started (${generationId}) project=${projectId} candidateCount=${candidateCount} autoSelect=${autoSelect}`
		);

		stage = 'load_generation';
		const { data: generation, error: generationError } = await (supabase as any)
			.from('onto_project_icon_generations')
			.select('id, project_id, status')
			.eq('id', generationId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (generationError) {
			throw new Error(`Failed to load generation: ${generationError.message}`);
		}
		if (!generation) {
			throw new Error('Generation record not found');
		}
		await job.log(`Loaded generation row (status=${generation.status})`);
		if (generation.status === 'cancelled') {
			await job.log('Generation cancelled before processing');
			return {
				success: true,
				projectId,
				generationId,
				skipped: true,
				reason: 'cancelled'
			};
		}

		stage = 'mark_processing';
		const { error: setProcessingError } = await (supabase as any)
			.from('onto_project_icon_generations')
			.update({
				status: 'processing',
				error_message: null
			})
			.eq('id', generationId)
			.eq('project_id', projectId);
		if (setProcessingError) {
			throw new Error(
				`Failed to mark generation as processing: ${setProcessingError.message}`
			);
		}
		await job.log('Marked generation row as processing');

		stage = 'load_project_context';
		const { data: graphData, error: graphError } = await supabase.rpc(
			'load_project_graph_context',
			{
				p_project_id: projectId
			}
		);

		if (graphError) {
			throw new Error(`Failed to load project graph context: ${graphError.message}`);
		}
		const graphPayload = graphData as any;
		if (!graphPayload?.project) {
			throw new Error('Project not found while loading context');
		}

		const context = buildProjectContextPayload(graphPayload);
		await job.log(
			`Loaded project context (goals=${context.topGoals.length}, tasks=${context.topTasks.length}, documents=${context.topDocuments.length})`
		);
		const llm = new SmartLLMService({
			httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
			appName: 'BuildOS Project Icon Worker'
		});

		stage = 'resolve_image_prompt_query';
		const { imagePromptQuery, source: imagePromptSource } = await resolveImagePromptQuery({
			llm,
			userId: requestedByUserId,
			projectId,
			context,
			steeringPrompt
		});
		await job.log(
			`Image prompt query resolved (${imagePromptSource}): ${imagePromptQuery.slice(0, 280)}`
		);

		stage = 'persist_image_prompt_query';
		const { error: promptPersistError } = await (supabase as any)
			.from('onto_project_icon_generations')
			.update({
				steering_prompt: imagePromptQuery
			})
			.eq('id', generationId)
			.eq('project_id', projectId);
		if (promptPersistError) {
			throw new Error(
				`Failed to persist resolved image prompt query: ${promptPersistError.message}`
			);
		}

		stage = 'generate_candidates_initial';
		let { candidates, droppedReasons } = await generateValidCandidates({
			llm,
			userId: requestedByUserId,
			projectId,
			context,
			imagePromptQuery,
			candidateCount
		});
		await job.log(
			`Initial candidate pass produced ${candidates.length}/${candidateCount} valid candidates`
		);
		if (droppedReasons.length > 0) {
			await job.log(
				`Dropped invalid candidates (initial pass): ${droppedReasons.slice(0, 5).join(' | ')}`
			);
		}

		if (candidates.length === 0) {
			const correctionHint = droppedReasons.length
				? droppedReasons
						.slice(0, 5)
						.map((reason, index) => `${index + 1}. ${reason}`)
						.join('\n')
				: 'Ensure valid SVG output with required viewBox/currentColor constraints.';

			await job.log('Retrying icon generation with correction hints');
			stage = 'generate_candidates_retry';
			const retry = await generateValidCandidates({
				llm,
				userId: requestedByUserId,
				projectId,
				context,
				imagePromptQuery,
				candidateCount,
				correctionHint
			});
			candidates = retry.candidates;
			droppedReasons = retry.droppedReasons;
			await job.log(
				`Retry candidate pass produced ${candidates.length}/${candidateCount} valid candidates`
			);
			if (droppedReasons.length > 0) {
				await job.log(
					`Dropped invalid candidates (retry pass): ${droppedReasons.slice(0, 5).join(' | ')}`
				);
			}
		}

		if (candidates.length === 0) {
			throw new Error(
				`All generated candidates failed SVG validation (${droppedReasons.join('; ') || 'no valid candidates'})`
			);
		}

		stage = 'persist_candidates';
		const { data: upsertedCandidates, error: upsertError } = await (supabase as any)
			.from('onto_project_icon_candidates')
			.upsert(
				candidates.map((candidate, index) => ({
					generation_id: generationId,
					project_id: projectId,
					candidate_index: index,
					concept: candidate.concept,
					svg_raw: candidate.svgRaw,
					svg_sanitized: candidate.svgSanitized,
					svg_byte_size: candidate.byteSize,
					llm_model: null
				})),
				{
					onConflict: 'generation_id,candidate_index'
				}
			)
			.select('id, candidate_index, concept, svg_sanitized');

		if (upsertError) {
			throw new Error(`Failed to persist icon candidates: ${upsertError.message}`);
		}

		const persistedCandidates = (
			Array.isArray(upsertedCandidates) ? upsertedCandidates : []
		) as Array<{ id: string; candidate_index: number; concept: string; svg_sanitized: string }>;
		if (persistedCandidates.length === 0) {
			throw new Error('No icon candidates were persisted');
		}
		await job.log(`Persisted ${persistedCandidates.length} icon candidates`);

		const completedAt = new Date().toISOString();
		let selectedCandidateId: string | undefined;

		stage = 'auto_select';
		if (autoSelect) {
			const chosen = chooseAutoCandidate(persistedCandidates);
			if (!chosen) {
				throw new Error('Auto-select enabled but no candidate is available');
			}
			selectedCandidateId = chosen.id;

			const { error: clearSelectionError } = await (supabase as any)
				.from('onto_project_icon_candidates')
				.update({ selected_at: null })
				.eq('generation_id', generationId)
				.eq('project_id', projectId);
			if (clearSelectionError) {
				throw new Error(
					`Failed to clear previous selected candidates: ${clearSelectionError.message}`
				);
			}

			const { error: selectedCandidateError } = await (supabase as any)
				.from('onto_project_icon_candidates')
				.update({ selected_at: completedAt })
				.eq('id', chosen.id)
				.eq('generation_id', generationId)
				.eq('project_id', projectId);
			if (selectedCandidateError) {
				throw new Error(
					`Failed to mark selected candidate: ${selectedCandidateError.message}`
				);
			}

			const source = triggerSource === 'auto' ? 'auto' : 'manual';
			const { error: projectUpdateError } = await (supabase as any)
				.from('onto_projects')
				.update({
					icon_svg: chosen.svg_sanitized,
					icon_concept: chosen.concept,
					icon_generated_at: completedAt,
					icon_generation_source: source,
					icon_generation_prompt: imagePromptQuery
				})
				.eq('id', projectId);
			if (projectUpdateError) {
				throw new Error(`Failed to apply icon to project: ${projectUpdateError.message}`);
			}

			await job.log(`Auto-selected candidate ${chosen.id} (${chosen.concept})`);
		}

		stage = 'complete_generation';
		const { error: generationUpdateError } = await (supabase as any)
			.from('onto_project_icon_generations')
			.update({
				status: 'completed',
				error_message: null,
				selected_candidate_id: selectedCandidateId ?? null,
				completed_at: completedAt
			})
			.eq('id', generationId)
			.eq('project_id', projectId);
		if (generationUpdateError) {
			throw new Error(`Failed to complete generation: ${generationUpdateError.message}`);
		}

		await job.log(
			`Project icon generation completed (${persistedCandidates.length} candidates)`
		);
		return {
			success: true,
			projectId,
			generationId,
			candidatesCreated: persistedCandidates.length,
			selectedCandidateId
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Project icon generation failed';

		if (generationId && projectId) {
			try {
				await markGenerationFailed(generationId, projectId, `[stage:${stage}] ${message}`);
			} catch (markFailedError) {
				const markFailedMessage =
					markFailedError instanceof Error ? markFailedError.message : 'Unknown error';
				await job.log(`Failed to mark generation as failed: ${markFailedMessage}`);
			}
		} else {
			await job.log(
				'Skipping failure-state persistence due to missing generation/project IDs'
			);
		}

		await job.log(`Project icon generation failed at stage "${stage}": ${message}`);
		throw error;
	}
}
