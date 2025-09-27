// src/lib/services/dailyBrief/validator.ts

import type { DailyBriefRepository } from './repository';

export interface ValidationResult {
	canStart: boolean;
	message: string;
	briefId?: string;
	statusCode?: number;
}

export class BriefGenerationValidator {
	constructor(private repository: DailyBriefRepository) {}

	async validateGeneration(
		userId: string,
		briefDate: string,
		forceRegenerate: boolean
	): Promise<ValidationResult> {
		// Check concurrent generations
		const concurrentCheck = await this.repository.checkConcurrentGenerations(userId);
		if (!concurrentCheck.canStart) {
			return {
				canStart: false,
				message: concurrentCheck.message,
				statusCode: 429
			};
		}

		// Start generation
		const generationResult = await this.repository.startGeneration(
			userId,
			briefDate,
			forceRegenerate
		);

		if (!generationResult.started) {
			return {
				canStart: false,
				message: generationResult.message,
				statusCode: 409
			};
		}

		return {
			canStart: true,
			message: 'Generation can start',
			briefId: generationResult.brief_id
		};
	}
}
