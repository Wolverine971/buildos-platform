// apps/web/src/lib/services/time-block.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	CreateTimeBlockParams,
	TimeBlockWithProject,
	TimeBlockSyncStatus,
	TimeBlockType,
	TimeBlockSuggestion,
	TimeAllocation,
	Database
} from '@buildos/shared-types';
import { CalendarService } from './calendar-service';
import {
	TimeBlockSuggestionService,
	type TimeBlockSuggestionResult
} from './time-block-suggestion.service';

type TypedSupabaseClient = SupabaseClient<Database>;

const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 8 * 60;

interface CalendarSyncPayload {
	summary: string;
	description: string;
	colorId?: string;
	start: Date;
	end: Date;
	timezone?: string;
}

const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_PROJECT_COLOR = '9';
const BUILD_BLOCK_COLOR = '7';
const MAX_CALENDAR_SUGGESTIONS = 3;
const FALLBACK_APP_URL = 'https://build-os.com';
const APP_BASE_URL = (() => {
	const raw =
		typeof process !== 'undefined' &&
		process.env &&
		typeof process.env.PUBLIC_APP_URL === 'string'
			? process.env.PUBLIC_APP_URL.trim()
			: '';

	if (raw.length === 0) {
		return FALLBACK_APP_URL;
	}

	return raw.replace(/\/$/, '');
})();

export class TimeBlockService {
	constructor(
		private readonly supabase: TypedSupabaseClient,
		private readonly userId: string,
		private readonly calendarService: CalendarService,
		private suggestionService?: TimeBlockSuggestionService
	) {}

	private getSuggestionService(): TimeBlockSuggestionService {
		if (!this.suggestionService) {
			this.suggestionService = new TimeBlockSuggestionService(this.supabase, this.userId);
		}
		return this.suggestionService;
	}

	/**
	 * Create a new time block and sync it to Google Calendar.
	 */
	async createTimeBlock(params: CreateTimeBlockParams): Promise<TimeBlockWithProject> {
		this.validateTimeBlockParams(params);

		await this.checkConflicts(params.start_time, params.end_time);

		const blockType: TimeBlockType = params.block_type;
		const timezone = params.timezone ?? DEFAULT_TIMEZONE;
		const startTime = params.start_time;
		const endTime = params.end_time;
		const durationMinutes = this.calculateDuration(startTime, endTime);

		const projectId = blockType === 'project' ? (params.project_id ?? null) : null;

		let project: {
			name: string;
			calendar_color_id: string | null;
		} | null = null;

		if (blockType === 'project') {
			const { data: projectRow, error: projectError } = await this.supabase
				.from('projects')
				.select('name, calendar_color_id')
				.eq('id', projectId)
				.eq('user_id', this.userId)
				.maybeSingle();

			if (projectError) {
				throw projectError;
			}

			if (!projectRow) {
				throw new Error('Project not found');
			}

			project = projectRow;
		}

		let suggestionResult: TimeBlockSuggestionResult | null = null;
		try {
			suggestionResult = await this.getSuggestionService().generateSuggestions({
				blockType,
				projectId,
				startTime,
				endTime,
				durationMinutes,
				timezone
			});
		} catch (error) {
			console.error('[TimeBlockService] Failed to generate suggestions:', error);
		}

		const calendarContent = this.buildCalendarEventContent({
			blockType,
			projectName: project?.name ?? null,
			projectColorId: project?.calendar_color_id ?? null,
			suggestions: suggestionResult?.suggestions ?? [],
			suggestionSummary: suggestionResult?.summary ?? null
		});

		const calendarEvent = await this.syncToGoogleCalendar({
			summary: calendarContent.summary,
			description: calendarContent.description,
			colorId: calendarContent.colorId,
			start: startTime,
			end: endTime,
			timezone
		});

		const nowIso = new Date().toISOString();

		const { data: timeBlock, error } = await this.supabase
			.from('time_blocks')
			.insert({
				user_id: this.userId,
				block_type: blockType,
				project_id: projectId,
				start_time: startTime.toISOString(),
				end_time: endTime.toISOString(),
				duration_minutes: durationMinutes,
				timezone,
				calendar_event_id: calendarEvent.eventId,
				calendar_event_link: calendarEvent.eventLink ?? null,
				ai_suggestions: suggestionResult ? suggestionResult.suggestions : null,
				suggestions_summary: suggestionResult?.summary ?? null,
				suggestions_generated_at: suggestionResult
					? suggestionResult.generatedAt.toISOString()
					: null,
				suggestions_model: suggestionResult?.model ?? null,
				sync_status: 'synced' as TimeBlockSyncStatus,
				last_synced_at: nowIso,
				updated_at: nowIso
			})
			.select(
				`
				*,
				project:projects(id, name, calendar_color_id)
			`
			)
			.single();

		if (error) {
			await this.rollbackCalendarEvent(calendarEvent.eventId);
			throw error;
		}

		return timeBlock as TimeBlockWithProject;
	}

	/**
	 * Fetch all time blocks for the user within a date range.
	 */
	async regenerateSuggestions(blockId: string): Promise<TimeBlockWithProject> {
		const { data: existingBlock, error: fetchError } = await this.supabase
			.from('time_blocks')
			.select(
				`
				*,
				project:projects(id, name, calendar_color_id)
			`
			)
			.eq('id', blockId)
			.eq('user_id', this.userId)
			.maybeSingle();

		if (fetchError) {
			throw fetchError;
		}

		if (!existingBlock) {
			throw new Error('Time block not found');
		}

		if (existingBlock.sync_status === 'deleted') {
			throw new Error('Cannot regenerate suggestions for deleted blocks');
		}

		const startTime = new Date(existingBlock.start_time);
		const endTime = new Date(existingBlock.end_time);
		const durationMinutes = existingBlock.duration_minutes;
		const timezone = existingBlock.timezone ?? DEFAULT_TIMEZONE;

		const blockType = existingBlock.block_type as TimeBlockType;

		const suggestionResult = await this.getSuggestionService().generateSuggestions({
			blockType,
			projectId: existingBlock.project_id,
			startTime,
			endTime,
			durationMinutes,
			timezone
		});

		const nowIso = new Date().toISOString();

		const { data: updatedBlock, error: updateError } = await this.supabase
			.from('time_blocks')
			.update({
				ai_suggestions: suggestionResult.suggestions,
				suggestions_summary: suggestionResult.summary ?? null,
				suggestions_generated_at: suggestionResult.generatedAt.toISOString(),
				suggestions_model: suggestionResult.model ?? null,
				last_synced_at: nowIso,
				updated_at: nowIso,
				sync_status: 'synced'
			})
			.eq('id', blockId)
			.eq('user_id', this.userId)
			.select(
				`
				*,
				project:projects(id, name, calendar_color_id)
			`
			)
			.single();

		if (updateError) {
			throw updateError;
		}

		if (existingBlock.calendar_event_id) {
			const calendarContent = this.buildCalendarEventContent({
				blockType,
				projectName: updatedBlock.project?.name ?? null,
				projectColorId: updatedBlock.project?.calendar_color_id ?? null,
				suggestions: suggestionResult.suggestions,
				suggestionSummary: suggestionResult.summary ?? null
			});

			try {
				await this.calendarService.updateCalendarEvent(this.userId, {
					event_id: existingBlock.calendar_event_id,
					summary: calendarContent.summary,
					description: calendarContent.description,
					timeZone: timezone
				});
			} catch (error) {
				console.error(
					'[TimeBlockService] Failed to update calendar event suggestions:',
					error
				);
			}
		}

		return updatedBlock as TimeBlockWithProject;
	}

	async getTimeBlocks(startDate: Date, endDate: Date): Promise<TimeBlockWithProject[]> {
		const { data, error } = await this.supabase
			.from('time_blocks')
			.select(
				`
				*,
				project:projects(id, name, calendar_color_id)
			`
			)
			.eq('user_id', this.userId)
			.neq('sync_status', 'deleted')
			.filter('start_time', 'lt', endDate.toISOString())
			.filter('end_time', 'gt', startDate.toISOString())
			.order('start_time', { ascending: true });

		if (error) {
			throw error;
		}

		return (data as TimeBlockWithProject[]) ?? [];
	}

	async calculateTimeAllocation(startDate: Date, endDate: Date): Promise<TimeAllocation> {
		if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
			throw new Error('Invalid start date supplied');
		}
		if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
			throw new Error('Invalid end date supplied');
		}
		if (endDate <= startDate) {
			throw new Error('End date must be after start date');
		}

		const { data, error } = await this.supabase
			.from('time_blocks')
			.select(
				`
				id,
				block_type,
				project_id,
				start_time,
				end_time,
				duration_minutes,
				project:projects(id, name, calendar_color_id)
			`
			)
			.eq('user_id', this.userId)
			.neq('sync_status', 'deleted')
			.filter('start_time', 'lt', endDate.toISOString())
			.filter('end_time', 'gt', startDate.toISOString());

		if (error) {
			throw error;
		}

		const blocks = (data as TimeBlockWithProject[]) ?? [];

		const rangeStartMs = startDate.getTime();
		const rangeEndMs = endDate.getTime();

		let totalMinutes = 0;
		let buildBlockMinutes = 0;

		const projectMap = new Map<
			string,
			{
				projectId: string;
				projectName: string;
				projectColor: string | null;
				minutes: number;
				blockCount: number;
			}
		>();

		for (const block of blocks) {
			const blockStartMs = new Date(block.start_time).getTime();
			const blockEndMs = new Date(block.end_time).getTime();

			if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
				console.warn(
					'[TimeBlockService] Skipping block with invalid timestamps during allocation calculation',
					{
						blockId: block.id,
						start_time: block.start_time,
						end_time: block.end_time
					}
				);
				continue;
			}

			const overlapStart = Math.max(rangeStartMs, blockStartMs);
			const overlapEnd = Math.min(rangeEndMs, blockEndMs);

			if (overlapEnd <= overlapStart) {
				continue;
			}

			const overlapMinutes = (overlapEnd - overlapStart) / 60000;
			if (overlapMinutes <= 0) {
				continue;
			}

			totalMinutes += overlapMinutes;

			if (block.block_type === 'build') {
				buildBlockMinutes += overlapMinutes;
				continue;
			}

			const projectId = block.project_id ?? block.project?.id ?? null;
			if (!projectId) {
				continue;
			}

			const existing = projectMap.get(projectId);
			if (existing) {
				existing.minutes += overlapMinutes;
				existing.blockCount += 1;
			} else {
				projectMap.set(projectId, {
					projectId,
					projectName: block.project?.name ?? 'Unnamed Project',
					projectColor: block.project?.calendar_color_id ?? null,
					minutes: overlapMinutes,
					blockCount: 1
				});
			}
		}

		const round = (value: number) => Math.round(value * 100) / 100;
		const minutesToHours = (minutes: number) => round(minutes / 60);

		const totalHours = minutesToHours(totalMinutes);
		const buildBlockHours = minutesToHours(buildBlockMinutes);

		const project_allocations = Array.from(projectMap.values())
			.map((entry) => {
				const percentage =
					totalMinutes > 0 ? round((entry.minutes / totalMinutes) * 100) : 0;

				return {
					project_id: entry.projectId,
					project_name: entry.projectName,
					project_color: entry.projectColor,
					hours: minutesToHours(entry.minutes),
					percentage,
					block_count: entry.blockCount
				};
			})
			.sort((a, b) => b.hours - a.hours);

		return {
			total_hours: totalHours,
			build_block_hours: buildBlockHours,
			project_allocations,
			date_range: {
				start: startDate.toISOString(),
				end: endDate.toISOString()
			}
		};
	}

	/**
	 * Soft-delete a time block and remove it from Google Calendar.
	 */
	async deleteTimeBlock(blockId: string): Promise<void> {
		const { data: timeBlock, error: fetchError } = await this.supabase
			.from('time_blocks')
			.select('calendar_event_id')
			.eq('id', blockId)
			.eq('user_id', this.userId)
			.maybeSingle();

		if (fetchError) {
			throw fetchError;
		}

		if (!timeBlock) {
			throw new Error('Time block not found');
		}

		if (timeBlock.calendar_event_id) {
			try {
				await this.calendarService.deleteCalendarEvent(this.userId, {
					event_id: timeBlock.calendar_event_id
				});
			} catch (error) {
				console.error('[TimeBlockService] Failed to delete calendar event:', error);
			}
		}

		const nowIso = new Date().toISOString();

		const { error: updateError } = await this.supabase
			.from('time_blocks')
			.update({
				sync_status: 'deleted',
				updated_at: nowIso,
				last_synced_at: nowIso
			})
			.eq('id', blockId)
			.eq('user_id', this.userId);

		if (updateError) {
			throw updateError;
		}
	}

	/**
	 * Create a Google Calendar event for the time block.
	 */
	private async syncToGoogleCalendar(params: CalendarSyncPayload): Promise<{
		eventId: string;
		eventLink?: string;
	}> {
		const result = await this.calendarService.createStandaloneEvent(this.userId, {
			summary: params.summary,
			description: params.description,
			start: params.start,
			end: params.end,
			timeZone: params.timezone ?? DEFAULT_TIMEZONE,
			colorId: params.colorId ?? DEFAULT_PROJECT_COLOR
		});

		return result;
	}

	private async rollbackCalendarEvent(eventId: string | null | undefined): Promise<void> {
		if (!eventId) {
			return;
		}

		try {
			await this.calendarService.deleteCalendarEvent(this.userId, { event_id: eventId });
		} catch (error) {
			console.error('[TimeBlockService] Failed to rollback calendar event:', error);
		}
	}

	private validateTimeBlockParams(params: CreateTimeBlockParams): void {
		if (
			!params.block_type ||
			(params.block_type !== 'project' && params.block_type !== 'build')
		) {
			throw new Error('Invalid block type');
		}

		if (params.block_type === 'project' && !params.project_id) {
			throw new Error('Project ID is required for project blocks');
		}

		if (!(params.start_time instanceof Date) || isNaN(params.start_time.getTime())) {
			throw new Error('Invalid start time');
		}

		if (!(params.end_time instanceof Date) || isNaN(params.end_time.getTime())) {
			throw new Error('Invalid end time');
		}

		if (params.end_time <= params.start_time) {
			throw new Error('End time must be after start time');
		}

		const duration = this.calculateDuration(params.start_time, params.end_time);
		if (duration < MIN_DURATION_MINUTES) {
			throw new Error(`Time block must be at least ${MIN_DURATION_MINUTES} minutes`);
		}

		if (duration > MAX_DURATION_MINUTES) {
			throw new Error(`Time block cannot exceed ${MAX_DURATION_MINUTES / 60} hours`);
		}
	}

	private calculateDuration(start: Date, end: Date): number {
		return Math.round((end.getTime() - start.getTime()) / 60000);
	}

	private buildCalendarEventContent(params: {
		blockType: TimeBlockType;
		projectName?: string | null;
		projectColorId?: string | null;
		suggestions: TimeBlockSuggestion[] | null | undefined;
		suggestionSummary?: string | null;
	}): { summary: string; description: string; colorId: string } {
		const summary =
			params.blockType === 'project'
				? `${params.projectName ?? 'Focus Work'} — Focus Session`
				: 'Build Block — Focus Time';

		const colorId =
			params.blockType === 'project'
				? (params.projectColorId ?? DEFAULT_PROJECT_COLOR)
				: BUILD_BLOCK_COLOR;

		const lines: string[] = [
			'Time block created with BuildOS Time Play.',
			`Block type: ${params.blockType === 'project' ? 'Project focus' : 'Build block'}`
		];

		if (params.projectName) {
			lines.push(`Project: ${params.projectName}`);
		}

		if (params.suggestionSummary) {
			lines.push('', `Focus summary: ${params.suggestionSummary}`);
		}

		const suggestions = params.suggestions ?? [];

		lines.push('', 'Suggested focus:');

		if (suggestions.length === 0) {
			lines.push(
				'- Choose the most meaningful work for this block. Regenerate suggestions in BuildOS for fresh ideas.'
			);
		} else {
			suggestions.slice(0, MAX_CALENDAR_SUGGESTIONS).forEach((suggestion, index) => {
				const meta: string[] = [];
				if (suggestion.project_name) {
					meta.push(suggestion.project_name);
				}
				if (suggestion.estimated_minutes) {
					meta.push(`${suggestion.estimated_minutes} min`);
				}
				if (suggestion.priority) {
					meta.push(`${suggestion.priority.toUpperCase()} priority`);
				}

				const header =
					meta.length > 0
						? `${index + 1}. ${suggestion.title} (${meta.join(' · ')})`
						: `${index + 1}. ${suggestion.title}`;

				lines.push(header);
				lines.push(`   ${suggestion.reason}`);
			});
		}

		lines.push('', 'Need a refresh? Regenerate suggestions from the Time Play panel.');

		return {
			summary,
			description: lines.join('\n'),
			colorId
		};
	}

	private async checkConflicts(start: Date, end: Date): Promise<void> {
		const { data, error } = await this.supabase
			.from('time_blocks')
			.select('id')
			.eq('user_id', this.userId)
			.neq('sync_status', 'deleted')
			.filter('start_time', 'lt', end.toISOString())
			.filter('end_time', 'gt', start.toISOString());

		if (error) {
			throw error;
		}

		if ((data ?? []).length > 0) {
			throw new Error('Time block conflicts with an existing block');
		}
	}
}
