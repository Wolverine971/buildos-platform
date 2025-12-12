// apps/web/src/lib/services/ontology/project-props-generation.service.ts
/**
 * DEPRECATED: This service was template-dependent and has been removed.
 * Template system has been removed from the ontology system.
 */

import type { Json } from '@buildos/shared-types';
import type { Facets } from '$lib/types/onto';

export interface ProjectPropsGenerationResult {
	props: Record<string, unknown> | null;
	facets?: Facets | null;
	confidence?: number | null;
	notes?: string | null;
	raw?: Json | null;
}

/**
 * DEPRECATED: ProjectPropsGenerationService is no longer functional.
 * Template system has been removed from core ontology services.
 */
export class ProjectPropsGenerationService {
	constructor() {
		console.warn(
			'[ProjectPropsGenerationService] DEPRECATED: This service is no longer functional. Template system has been removed.'
		);
	}

	async generate(): Promise<ProjectPropsGenerationResult | null> {
		throw new Error(
			'ProjectPropsGenerationService.generate() is no longer supported. Template system has been removed.'
		);
	}
}
