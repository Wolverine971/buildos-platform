// apps/worker/src/workers/ontology/ontologyClassifier.ts
import { supabase } from '../../lib/supabase';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import type { Json } from '@buildos/shared-types';
import type { OntologyClassificationRequest, OntologyEntityType } from '@buildos/shared-types';

export interface OntologyClassificationResult {
	success: boolean;
	entityType: OntologyEntityType;
	entityId: string;
	type_key?: string;
	tags?: string[];
	confidence?: number;
	reasoning?: string;
	model_used?: string;
	classification_time_ms?: number;
	error?: string;
	kept_default?: boolean;
	skipped?: boolean;
}

type OntologyEntityRow = Record<string, unknown> & {
	id: string;
	type_key?: string | null;
	props?: Json | null;
};

const DEFAULT_TYPE_KEYS: Record<OntologyEntityType, string> = {
	task: 'task.default',
	plan: 'plan.default',
	goal: 'goal.default',
	risk: 'risk.default',
	milestone: 'milestone.default',
	document: 'document.default'
};

const ENTITY_TABLES: Record<OntologyEntityType, string> = {
	task: 'onto_tasks',
	plan: 'onto_plans',
	goal: 'onto_goals',
	risk: 'onto_risks',
	milestone: 'onto_milestones',
	document: 'onto_documents'
};

const ENTITY_SELECT_FIELDS: Record<OntologyEntityType, string[]> = {
	task: ['id', 'title', 'description', 'props', 'type_key', 'state_key', 'priority'],
	plan: ['id', 'name', 'description', 'plan', 'props', 'type_key', 'state_key'],
	goal: ['id', 'name', 'description', 'goal', 'props', 'type_key', 'state_key'],
	risk: ['id', 'title', 'content', 'impact', 'probability', 'props', 'type_key', 'state_key'],
	milestone: ['id', 'title', 'description', 'milestone', 'props', 'type_key', 'state_key'],
	document: ['id', 'title', 'description', 'content', 'props', 'type_key', 'state_key']
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TAGS = 7;
const MAX_TAG_LENGTH = 32;
const MIN_TAG_LENGTH = 2;

function fromOntologyTable(table: string) {
	// Supabase types do not support dynamic table names with custom selects.
	return (supabase.from as any)(table);
}

function buildSystemPrompt(entityType: OntologyEntityType): string {
	const header = `You are an expert ontology classifier for a productivity system. Your task is to analyze an entity and determine:

1. type_key: The most appropriate classification following the taxonomy pattern
2. tags: 3-7 relevant keywords for discoverability`;

	const tagGuidelines = `## Tag Guidelines

- Use lowercase, hyphen-separated words (e.g., \"user-research\", \"api-design\")
- Focus on WHAT the entity does, not what it IS
- Include action verbs where relevant (e.g., \"planning\", \"reviewing\")
- Include domain terms (e.g., \"frontend\", \"marketing\", \"hr\")
- Avoid generic tags like \"important\" or \"misc\"`;

	const responseFormat = `## Response Format

Respond ONLY with valid JSON:
{
  \"type_key\": \"scope.family.variant\",
  \"tags\": [\"tag1\", \"tag2\", \"tag3\"],
  \"confidence\": 0.85,
  \"reasoning\": \"Brief explanation of classification choice\"
}`;

	const taxonomyByType: Record<OntologyEntityType, string> = {
		task: `## Type Key Taxonomy

Type keys follow the pattern: task.{work_mode}[.{specialization}]
- Work modes: execute, create, refine, research, review, coordinate, admin, plan
- Specializations: meeting, standup, deploy, checklist
- Examples: task.execute, task.coordinate.meeting, task.research`,
		plan: `## Type Key Taxonomy

Type keys follow the pattern: plan.{family}[.{variant}]
- Families: timebox, pipeline, campaign, roadmap, process, phase
- Examples: plan.timebox.sprint, plan.roadmap.product, plan.campaign.marketing`,
		goal: `## Type Key Taxonomy

Type keys follow the pattern: goal.{family}[.{variant}]
- Families: outcome, metric, behavior, learning
- Examples: goal.outcome.project, goal.metric.revenue, goal.learning.skill`,
		document: `## Type Key Taxonomy

Type keys follow the pattern: document.{family}[.{variant}]
- Families: context, knowledge, decision, spec, reference, intake
- Examples: document.spec.technical, document.knowledge.research, document.decision.rfc`,
		risk: `## Type Key Taxonomy

Type keys follow the pattern: risk.{family}[.{variant}]
- Families: technical, schedule, resource, budget, scope, external, quality
- Examples: risk.technical.security, risk.schedule.deadline`,
		milestone: `## Type Key Taxonomy

Type keys follow the pattern: milestone.{variant}
- Variants: delivery, phase_complete, review, deadline, release, launch
 - Examples: milestone.delivery, milestone.launch`
	};

	return [header, taxonomyByType[entityType], tagGuidelines, responseFormat].join('\n\n');
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}...`;
}

function normalizeTags(tags: unknown): string[] {
	if (!Array.isArray(tags)) return [];

	const normalized = tags
		.map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
		.map((tag) => tag.replace(/[^a-z0-9\s-]/g, ''))
		.map((tag) => tag.replace(/\s+/g, '-').replace(/-+/g, '-'))
		.filter((tag) => tag.length >= MIN_TAG_LENGTH && tag.length <= MAX_TAG_LENGTH);

	return [...new Set(normalized)].slice(0, MAX_TAGS);
}

function isValidTypeKey(entityType: OntologyEntityType, typeKey: string): boolean {
	const parts = typeKey.split('.');
	if (parts.length < 2) return false;
	if (parts[0] !== entityType) return false;

	const family = parts[1];
	const variant = parts[2];

	const validFamilies: Record<OntologyEntityType, string[]> = {
		task: ['execute', 'create', 'refine', 'research', 'review', 'coordinate', 'admin', 'plan'],
		plan: ['timebox', 'pipeline', 'campaign', 'roadmap', 'process', 'phase'],
		goal: ['outcome', 'metric', 'behavior', 'learning'],
		risk: ['technical', 'schedule', 'resource', 'budget', 'scope', 'external', 'quality'],
		milestone: ['delivery', 'phase_complete', 'review', 'deadline', 'release', 'launch'],
		document: ['context', 'knowledge', 'decision', 'spec', 'reference', 'intake']
	};

	if (!validFamilies[entityType]?.includes(family)) return false;

	if (entityType === 'milestone') {
		return parts.length === 2;
	}

	if (entityType === 'task' && variant) {
		const taskVariants = ['meeting', 'standup', 'deploy', 'checklist'];
		return taskVariants.includes(variant);
	}

	if (variant) {
		return /^[a-z0-9_]+$/.test(variant);
	}

	return parts.length === 2;
}

function validateClassification(entityType: OntologyEntityType, result: any) {
	const tags = normalizeTags(result?.tags);
	const typeKey = typeof result?.type_key === 'string' ? result.type_key.trim() : '';
	const validTypeKey = typeKey ? isValidTypeKey(entityType, typeKey) : false;
	return { validTypeKey, typeKey, tags };
}

function getEntityTitle(entity: OntologyEntityRow): string {
	const candidate =
		(entity.title as string | undefined) ||
		(entity.name as string | undefined) ||
		(entity.milestone as string | undefined) ||
		(entity.goal as string | undefined) ||
		'Untitled';
	return typeof candidate === 'string' ? candidate : 'Untitled';
}

function buildUserPrompt(entityType: OntologyEntityType, entity: OntologyEntityRow): string {
	const title = getEntityTitle(entity);
	const description =
		(entity.description as string | undefined) || (entity.content as string | undefined) || '';

	const details: string[] = [];
	const plan = entity.plan as string | undefined;
	const goal = entity.goal as string | undefined;
	const milestone = entity.milestone as string | undefined;
	const outcome = entity.outcome as string | undefined;
	const rationale = entity.rationale as string | undefined;
	const impact = entity.impact as string | undefined;
	const probability = entity.probability as number | undefined;

	if (plan) details.push(`Plan: ${plan}`);
	if (goal) details.push(`Goal: ${goal}`);
	if (milestone) details.push(`Milestone: ${milestone}`);
	if (outcome) details.push(`Outcome: ${outcome}`);
	if (rationale) details.push(`Rationale: ${rationale}`);
	if (impact) details.push(`Impact: ${impact}`);
	if (typeof probability === 'number') details.push(`Probability: ${probability}`);

	const bodyContent = details.length > 0 ? truncate(details.join('\n'), 2000) : '';
	const currentTypeKey = entity.type_key || DEFAULT_TYPE_KEYS[entityType];
	const stateKey = (entity.state_key as string | undefined) || 'unknown';
	const priority = entity.priority as number | undefined;

	const lines = [
		`Classify this ${entityType}:`,
		'',
		'## Entity Data',
		`- **Title**: ${title || 'Untitled'}`,
		`- **Description**: ${description || 'No description'}`,
		bodyContent ? `- **Body Content**: ${bodyContent}` : '',
		'',
		'## Context',
		`- **Current type_key**: ${currentTypeKey} (default, needs classification)`,
		`- **State**: ${stateKey}`,
		typeof priority === 'number' ? `- **Priority**: ${priority}` : ''
	].filter(Boolean);

	return lines.join('\n');
}

function shouldSkipClassification(
	entityType: OntologyEntityType,
	entity: OntologyEntityRow,
	classificationSource: string | undefined
): boolean {
	if (classificationSource !== 'create_modal') return true;

	const title = getEntityTitle(entity).trim();
	if (!title || title.length < 3) return true;

	const defaultTypeKey = DEFAULT_TYPE_KEYS[entityType];
	if (entity.type_key && entity.type_key !== defaultTypeKey) return true;

	return false;
}

async function fetchEntity(entityType: OntologyEntityType, entityId: string) {
	const table = ENTITY_TABLES[entityType];
	const fields = ENTITY_SELECT_FIELDS[entityType].join(',');
	const { data, error } = await fromOntologyTable(table)
		.select(fields)
		.eq('id', entityId)
		.single();
	if (error || !data) {
		throw new Error(error?.message || `Entity not found: ${entityId}`);
	}
	return data as OntologyEntityRow;
}

async function updateEntityWithClassification(
	entityType: OntologyEntityType,
	entityId: string,
	classification: {
		typeKey: string;
		tags: string[];
		confidence: number;
		modelUsed: string;
	}
) {
	const table = ENTITY_TABLES[entityType];
	const defaultTypeKey = DEFAULT_TYPE_KEYS[entityType];

	const { data: existing, error: fetchError } = await fromOntologyTable(table)
		.select('props, type_key')
		.eq('id', entityId)
		.single();

	if (fetchError || !existing) {
		throw new Error(`Entity not found: ${entityId}`);
	}

	const currentProps = (existing.props as Record<string, unknown>) ?? {};
	const existingTags = Array.isArray(currentProps.tags) ? (currentProps.tags as string[]) : [];
	const mergedTags = [...new Set([...existingTags, ...classification.tags])];
	const allTags = existingTags.length >= MAX_TAGS ? existingTags : mergedTags.slice(0, MAX_TAGS);

	const nextProps = {
		...currentProps,
		tags: allTags,
		_classification: {
			classified_at: new Date().toISOString(),
			confidence: classification.confidence,
			model_used: classification.modelUsed,
			previous_type_key: existing.type_key
		}
	};

	let updateQuery = fromOntologyTable(table)
		.update({
			type_key: classification.typeKey,
			props: nextProps,
			updated_at: new Date().toISOString()
		})
		.eq('id', entityId);

	if (existing.type_key === null) {
		updateQuery = updateQuery.is('type_key', null);
	} else {
		updateQuery = updateQuery.eq('type_key', defaultTypeKey);
	}

	const { data: updated, error: updateError } = await updateQuery.select('id');

	if (updateError) {
		throw new Error(`Failed to update entity: ${updateError.message}`);
	}

	if (!updated || updated.length === 0) {
		throw new Error('Classification skipped: type_key changed');
	}
}

export async function classifyOntologyEntity(
	request: OntologyClassificationRequest
): Promise<OntologyClassificationResult> {
	const { entityType, entityId, userId } = request;
	const classificationSource = request.classificationSource as string | undefined;

	if (classificationSource !== 'create_modal') {
		return {
			success: false,
			entityType,
			entityId,
			error: 'Invalid classificationSource',
			kept_default: true
		};
	}

	if (!ENTITY_TABLES[entityType]) {
		return {
			success: false,
			entityType,
			entityId,
			error: 'Invalid entityType',
			kept_default: true
		};
	}

	if (!UUID_REGEX.test(entityId) || !UUID_REGEX.test(userId)) {
		return {
			success: false,
			entityType,
			entityId,
			error: 'Invalid entityId or userId format',
			kept_default: true
		};
	}

	const entity = await fetchEntity(entityType, entityId);
	if (shouldSkipClassification(entityType, entity, classificationSource)) {
		return {
			success: true,
			entityType,
			entityId,
			type_key: entity.type_key ?? DEFAULT_TYPE_KEYS[entityType],
			tags: [],
			confidence: 0,
			model_used: 'skipped',
			classification_time_ms: 0,
			kept_default: true,
			skipped: true
		};
	}

	const llmService = new SmartLLMService({
		httpReferer: (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim(),
		appName: 'BuildOS Ontology Classifier'
	});

	const userPrompt = buildUserPrompt(entityType, entity);
	const startTime = performance.now();

	const classification = await llmService.getJSONResponse<{
		type_key: string;
		tags: string[];
		confidence: number;
		reasoning?: string;
	}>({
		systemPrompt: buildSystemPrompt(entityType),
		userPrompt,
		userId,
		profile: 'fast',
		temperature: 0.2,
		validation: {
			retryOnParseError: true,
			maxRetries: 2
		}
	});

	const { validTypeKey, typeKey, tags } = validateClassification(entityType, classification);
	if (!validTypeKey) {
		return {
			success: false,
			entityType,
			entityId,
			error: 'Invalid type_key from classifier',
			kept_default: true
		};
	}

	await updateEntityWithClassification(entityType, entityId, {
		typeKey,
		tags,
		confidence: Number(classification.confidence) || 0,
		modelUsed: 'openrouter'
	});

	const duration = performance.now() - startTime;

	return {
		success: true,
		entityType,
		entityId,
		type_key: typeKey,
		tags,
		confidence: Number(classification.confidence) || 0,
		reasoning: classification.reasoning,
		model_used: 'openrouter',
		classification_time_ms: Math.round(duration)
	};
}
