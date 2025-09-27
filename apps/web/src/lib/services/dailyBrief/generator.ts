// src/lib/services/dailyBrief/generator.ts
import type { DailyBriefRepository } from './repository';
import type { ActivityLogger } from '$lib/utils/activityLogger';
import { SmartLLMService } from '../smart-llm-service';
import { ProjectBriefGenerator } from './projectBriefGenerator';
import { MainBriefGenerator } from './mainBriefGenerator';
import type { StreamEvent, DailyBriefResult } from '$lib/types/daily-brief';

export class DailyBriefGenerator {
	private smartLLM: SmartLLMService;
	private projectBriefGenerator: ProjectBriefGenerator;
	private mainBriefGenerator: MainBriefGenerator;

	constructor(
		private repository: DailyBriefRepository,
		private activityLogger: ActivityLogger
	) {
		this.smartLLM = new SmartLLMService({
			supabase: repository.supabase,
			httpReferer: 'https://buildos.io',
			appName: 'BuildOS Daily Brief Generator'
		});
		this.projectBriefGenerator = new ProjectBriefGenerator(repository, this.smartLLM);
		this.mainBriefGenerator = new MainBriefGenerator(repository, this.smartLLM);
	}

	async generateDailyBrief(
		userId: string,
		briefDate: string,
		sendEvent?: (event: StreamEvent) => void
	): Promise<DailyBriefResult> {
		const startTime = Date.now();

		try {
			// Step 1: Gather user data
			if (sendEvent) {
				sendEvent({
					type: 'progress',
					data: {
						step: 'gathering_data',
						message: 'Gathering your projects and goals...'
					}
				});
			}

			const userData = await this.repository.getUserData(userId);

			if (sendEvent) {
				sendEvent({
					type: 'progress',
					data: {
						step: 'data_gathered',
						message: `Found ${userData.projects.length} projects`,
						counts: { projects: userData.projects.length }
					}
				});
			}

			// Step 2: Generate project briefs
			const projectBriefs = await this.projectBriefGenerator.generateBriefs(
				userId,
				userData.projects,
				briefDate,
				userData.userContext,
				sendEvent
			);

			// Step 3: Generate main brief
			if (sendEvent) {
				sendEvent({
					type: 'progress',
					data: {
						step: 'generating_main_brief',
						message: 'Creating your daily summary...'
					}
				});
			}

			const mainBrief = await this.mainBriefGenerator.generateMainBrief(
				userId,
				projectBriefs,
				briefDate,
				userData.userContext
			);

			if (sendEvent) {
				sendEvent({
					type: 'main_brief',
					data: mainBrief
				});
			}

			// Log success
			await this.activityLogger.logActivity(userId, 'brief_generated', {
				brief_date: briefDate,
				project_briefs_count: projectBriefs.length,
				duration_ms: Date.now() - startTime,
				streaming_used: !!sendEvent
			});

			return {
				project_briefs: projectBriefs,
				main_brief: mainBrief
			};
		} catch (error) {
			console.error('Error in generateDailyBrief:', error);

			if (sendEvent) {
				sendEvent({
					type: 'error',
					data: {
						message: error instanceof Error ? error.message : 'Unknown error',
						error_code: 'GENERATION_FAILED'
					}
				});
			}
			throw error;
		}
	}
}
