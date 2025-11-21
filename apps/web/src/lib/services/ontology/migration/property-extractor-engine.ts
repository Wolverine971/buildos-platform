// apps/web/src/lib/services/ontology/migration/property-extractor-engine.ts
/**
 * Property Extractor Engine
 *
 * Unified property extraction service aligned with agentic chat patterns.
 * Extracts template-specific properties from legacy data with intelligent type inference.
 *
 * Key Features:
 * - Agentic-chat-aligned prompt with detailed examples
 * - Intelligent type inference ("$80k" → 80000, "200 guests" → 200)
 * - Schema-driven extraction
 * - Deep merging with template defaults
 * - Validation against JSON schema
 */

import type { Json } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type {
	PropertyExtractionOptions,
	PropertyExtractionResult,
	PropertyExtractionResponse,
	ValidationResult,
	TemplateField,
	LegacyProject,
	LegacyTask,
	LegacyPhase
} from './enhanced-migration.types';
import type { ResolvedTemplate } from '../template-resolver.service';
import { deepMergeProps } from '../template-props-merger.service';

export class PropertyExtractorEngine {
	constructor(private readonly llm: SmartLLMService) {}

	/**
	 * Extract properties using agentic-chat-aligned prompt
	 * Includes intelligent type inference and detailed examples
	 */
	async extractProperties(options: PropertyExtractionOptions): Promise<PropertyExtractionResult> {
		const prompt = this.buildExtractionPrompt(options);

		try {
			const response = await this.llm.getJSONResponse<PropertyExtractionResponse>({
				systemPrompt: this.getSystemPrompt(),
				userPrompt: prompt,
				userId: options.userId,
				profile: 'balanced', // Balanced for quality extraction
				temperature: 0.2, // Low temperature for consistent extraction
				validation: {
					retryOnParseError: true,
					maxRetries: 2
				},
				operationType: 'ontology_migration.property_extraction'
			});

			if (!response) {
				throw new Error('Property extraction returned empty response');
			}

			return {
				props: response.props ?? {},
				facets: response.facets ?? null,
				confidence: response.confidence ?? 0,
				notes: response.notes ?? null
			};
		} catch (error) {
			console.error('[PropertyExtractorEngine] Extraction failed:', error);
			throw error;
		}
	}

	/**
	 * Validate extracted properties against schema
	 */
	async validateProperties(
		props: Record<string, unknown>,
		schema: any
	): Promise<ValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Get required fields
		const required = new Set(schema.required ?? []);

		// Check required fields
		for (const field of required) {
			if (!(field in props) || props[field] === null || props[field] === undefined) {
				errors.push(`Required field missing: ${field}`);
			}
		}

		// Check types
		const properties = schema.properties ?? {};
		for (const [key, value] of Object.entries(props)) {
			const fieldSchema = properties[key];
			if (!fieldSchema) {
				warnings.push(`Property ${key} not defined in schema`);
				continue;
			}

			const expectedType = fieldSchema.type;
			const actualType = this.getJsonType(value);

			if (expectedType && expectedType !== actualType) {
				errors.push(
					`Type mismatch for ${key}: expected ${expectedType}, got ${actualType}`
				);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings
		};
	}

	/**
	 * Deep merge with template defaults
	 * User-extracted props override template defaults
	 */
	async mergeWithDefaults(
		templateDefaults: Record<string, unknown>,
		extractedProps: Record<string, unknown>
	): Promise<Record<string, unknown>> {
		return deepMergeProps(templateDefaults, extractedProps);
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	private getSystemPrompt(): string {
		return `You extract template-specific properties from legacy data narratives.

⚠️ CRITICAL: Extract ALL property values mentioned in the narrative.

Follow these rules:
1. **Review template schema** - extract a value for EACH property defined
2. **Use intelligent type inference**:
   - "$80k budget" → budget: 80000 (number)
   - "200 guests" → guest_count: 200 (number)
   - "React + TypeScript" → tech_stack: ["React", "TypeScript"] (array)
   - "June 20, 2026" → ceremony_date: "2026-06-20" (ISO date string)
   - "Grand Hall" → venue_details: { name: "Grand Hall" } (object)
3. **Infer missing values** from context when reasonable
4. **Use template defaults** for truly unknown values
5. **Always include facets** (context, scale, stage) in props
6. **Extract nested structures** when template schema defines objects

Return JSON with populated props matching the template schema.`;
	}

	private buildExtractionPrompt(options: PropertyExtractionOptions): string {
		const fields = this.extractFields(options.template);
		const fieldList = fields
			.map(
				(f) =>
					`- ${f.key}: ${f.type}${f.required ? ' (required)' : ''}${f.description ? ` — ${f.description}` : ''}`
			)
			.join('\n');

		const narrative = this.buildNarrative(options.legacyData);

		return `Extract template properties from this legacy data.

Template: ${options.template.type_key} — ${options.template.name}

Property Schema:
${fieldList.length > 0 ? fieldList : '- No specific properties defined'}

Legacy Data Narrative:
${narrative}

**Examples of intelligent extraction:**

Example 1: Wedding template (venue_details, guest_count, budget)
Narrative: "Wedding ceremony at Grand Hall, expecting 200 guests, budget is $80,000"
Extraction:
{
  "props": {
    "facets": { "context": "personal", "scale": "medium", "stage": "planning" },
    "venue_details": { "name": "Grand Hall", "status": "booked" },
    "guest_count": 200,
    "budget": 80000
  },
  "facets": { "context": "personal", "scale": "medium", "stage": "planning" },
  "confidence": 0.9,
  "notes": "All key details present in narrative"
}

Example 2: Software template (tech_stack, deployment_target, framework)
Narrative: "Build a Next.js app with TypeScript, deploying to Vercel"
Extraction:
{
  "props": {
    "facets": { "context": "personal", "scale": "small", "stage": "discovery" },
    "tech_stack": ["Next.js", "TypeScript"],
    "deployment_target": "Vercel",
    "framework": "Next.js"
  },
  "facets": { "context": "personal", "scale": "small", "stage": "discovery" },
  "confidence": 0.85,
  "notes": "Clear technical stack defined"
}

Example 3: Research template (hypothesis, methodology, sample_size)
Narrative: "Testing if meditation reduces stress with 100 participants, using RCT methodology"
Extraction:
{
  "props": {
    "facets": { "context": "academic", "scale": "medium", "stage": "planning" },
    "hypothesis": "meditation reduces stress levels",
    "methodology": "randomized_controlled_trial",
    "sample_size": 100,
    "duration": "8 weeks"
  },
  "facets": { "context": "academic", "scale": "medium", "stage": "planning" },
  "confidence": 0.88,
  "notes": "Research design clearly specified"
}

**Your Task:**
Extract ALL template properties with values from the narrative above.
- Use intelligent type inference for numbers, dates, arrays, objects
- Infer missing required fields when possible
- Set confidence 0.0-1.0 based on how complete the data is
- Add notes explaining extraction decisions

Return JSON:
{
  "props": {
    "facets": { "context": "...", "scale": "...", "stage": "..." },
    // ...all other template properties with extracted values
  },
  "facets": { "context": "...", "scale": "...", "stage": "..." },
  "confidence": 0.0-1.0,
  "notes": "extraction notes or concerns"
}`;
	}

	private extractFields(template: ResolvedTemplate): TemplateField[] {
		const properties = template.schema?.properties ?? {};
		const requiredSet = new Set(template.schema?.required ?? []);

		return Object.entries(properties).map(([key, definition]) => ({
			key,
			type: (definition as any).type ?? 'string',
			required: requiredSet.has(key),
			description: (definition as any).description ?? null
		}));
	}

	private buildNarrative(legacyData: any): string {
		// Handle different entity types
		if (this.isLegacyProject(legacyData)) {
			return this.buildProjectNarrative(legacyData);
		} else if (this.isLegacyTask(legacyData)) {
			return this.buildTaskNarrative(legacyData);
		} else if (this.isLegacyPhase(legacyData)) {
			return this.buildPhaseNarrative(legacyData);
		}

		// Fallback: stringify the data
		return JSON.stringify(legacyData, null, 2);
	}

	private isLegacyProject(data: any): data is LegacyProject {
		return 'name' in data && 'context' in data && 'core_goals_momentum' in data;
	}

	private isLegacyTask(data: any): data is LegacyTask {
		return 'title' in data && 'status' in data && 'project_id' in data;
	}

	private isLegacyPhase(data: any): data is LegacyPhase {
		return 'name' in data && 'project_id' in data && 'order' in data;
	}

	private buildProjectNarrative(project: LegacyProject): string {
		const coreDimensionEntries = [
			['Goals Momentum', project.core_goals_momentum],
			['Harmony Integration', project.core_harmony_integration],
			['Integrity Ideals', project.core_integrity_ideals],
			['Meaning Identity', project.core_meaning_identity],
			['Opportunity Freedom', project.core_opportunity_freedom],
			['People Bonds', project.core_people_bonds],
			['Power Resources', project.core_power_resources],
			['Reality Understanding', project.core_reality_understanding],
			['Trust Safeguards', project.core_trust_safeguards]
		]
			.filter(([, value]) => typeof value === 'string' && value.length > 0)
			.map(([label, value]) => `- ${label}: ${value}`)
			.join('\n');

		const segments: string[] = [
			`Project Name: ${project.name}`,
			`Status: ${project.status}`,
			project.description ? `Description:\n${project.description}` : '',
			project.context ? `Context:\n${project.context}` : '',
			project.tags?.length ? `Tags: ${project.tags.join(', ')}` : '',
			project.executive_summary ? `Executive Summary:\n${project.executive_summary}` : '',
			coreDimensionEntries ? `Core Values:\n${coreDimensionEntries}` : '',
			project.source ? `Source: ${project.source}` : ''
		];

		return segments.filter(Boolean).join('\n\n');
	}

	private buildTaskNarrative(task: LegacyTask): string {
		const segments: string[] = [
			`Task Title: ${task.title}`,
			`Status: ${task.status}`,
			task.description ? `Description:\n${task.description}` : '',
			task.notes ? `Notes:\n${task.notes}` : '',
			task.due_date ? `Due Date: ${task.due_date}` : '',
			task.priority ? `Priority: ${task.priority}` : ''
		];

		return segments.filter(Boolean).join('\n\n');
	}

	private buildPhaseNarrative(phase: LegacyPhase): string {
		const segments: string[] = [
			`Phase Name: ${phase.name}`,
			`Order: ${phase.order}`,
			phase.description ? `Description:\n${phase.description}` : '',
			phase.start_date ? `Start Date: ${phase.start_date}` : '',
			phase.end_date ? `End Date: ${phase.end_date}` : ''
		];

		return segments.filter(Boolean).join('\n\n');
	}

	private getJsonType(value: unknown): string {
		if (value === null) return 'null';
		if (Array.isArray(value)) return 'array';
		if (typeof value === 'object') return 'object';
		return typeof value; // 'string', 'number', 'boolean'
	}
}
