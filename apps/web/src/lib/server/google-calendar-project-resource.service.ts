// apps/web/src/lib/server/google-calendar-project-resource.service.ts
import { google, type calendar_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
import { GoogleCalendarTargetService, type CalendarTarget } from './google-calendar-target.service';

type CalendarApi = Pick<calendar_v3.Calendar, 'calendars' | 'calendarList' | 'acl'>;

type ProjectResourceServiceOptions = {
	connectionService?: Pick<
		GoogleCalendarConnectionService,
		'getAuthenticatedClient' | 'registerCreatedSource'
	>;
	targetService?: Pick<
		GoogleCalendarTargetService,
		'resolveExplicitSource' | 'resolveDefaultWriteTarget' | 'listTargets'
	>;
	createCalendarApi?: (auth: unknown) => CalendarApi;
};

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const value = error as {
		code?: number | string;
		status?: number;
		message?: string;
		response?: { status?: number };
	};
	return (
		value.code === 404 ||
		value.code === '404' ||
		value.status === 404 ||
		value.response?.status === 404 ||
		Boolean(value.message?.includes('404'))
	);
}

export type GoogleCalendarProjectResource = {
	calendarSourceId: string;
	connectionId: string;
	providerCalendarId: string;
	summary: string;
	colorId: string | null;
};

export class GoogleCalendarProjectResourceService {
	private readonly connectionService: Pick<
		GoogleCalendarConnectionService,
		'getAuthenticatedClient' | 'registerCreatedSource'
	>;
	private readonly targetService: Pick<
		GoogleCalendarTargetService,
		'resolveExplicitSource' | 'resolveDefaultWriteTarget' | 'listTargets'
	>;
	private readonly createCalendarApi: (auth: unknown) => CalendarApi;

	constructor(admin: TypedSupabaseClient, options: ProjectResourceServiceOptions = {}) {
		this.connectionService =
			options.connectionService ?? new GoogleCalendarConnectionService(admin);
		this.targetService = options.targetService ?? new GoogleCalendarTargetService(admin);
		this.createCalendarApi =
			options.createCalendarApi ??
			((auth) => google.calendar({ version: 'v3', auth: auth as OAuth2Client }));
	}

	private async apiForTarget(userId: string, target: CalendarTarget): Promise<CalendarApi> {
		return this.createCalendarApi(
			await this.connectionService.getAuthenticatedClient(userId, target.connectionId)
		);
	}

	async resolveLinkedSource(
		userId: string,
		calendarSourceId: string
	): Promise<GoogleCalendarProjectResource> {
		const target = await this.targetService.resolveExplicitSource(
			userId,
			calendarSourceId,
			'write'
		);
		return {
			calendarSourceId: target.calendarSourceId,
			connectionId: target.connectionId,
			providerCalendarId: target.providerCalendarId,
			summary: target.sourceSummary,
			colorId: null
		};
	}

	async createCalendar(params: {
		userId: string;
		connectionId?: string;
		name: string;
		description?: string;
		colorId?: string;
		timeZone: string;
	}): Promise<GoogleCalendarProjectResource> {
		const parent = params.connectionId
			? (await this.targetService.listTargets(params.userId, 'write')).find(
					(target) => target.connectionId === params.connectionId
				)
			: await this.targetService.resolveDefaultWriteTarget(params.userId);
		if (!parent) {
			throw new Error('Selected Google Calendar connection has no writable source');
		}
		const api = await this.apiForTarget(params.userId, parent);
		const created = await api.calendars.insert({
			requestBody: {
				summary: params.name,
				description: params.description,
				timeZone: params.timeZone
			}
		});
		if (!created.data.id) {
			throw new Error('Google Calendar did not return a calendar identity');
		}
		if (params.colorId) {
			try {
				await api.calendarList.patch({
					calendarId: created.data.id,
					requestBody: { colorId: params.colorId }
				});
			} catch {
				// Color is cosmetic and must not orphan an otherwise valid created calendar.
			}
		}

		let source;
		try {
			source = await this.connectionService.registerCreatedSource({
				userId: params.userId,
				connectionId: parent.connectionId,
				providerCalendarId: created.data.id,
				summary: created.data.summary ?? params.name,
				description: created.data.description ?? params.description ?? null,
				timezone: created.data.timeZone ?? params.timeZone,
				colorId: params.colorId ?? null
			});
		} catch (error) {
			try {
				await api.calendars.delete({ calendarId: created.data.id });
			} catch {
				// Registration failure remains primary; later discovery can recover the provider calendar.
			}
			throw error;
		}

		return {
			calendarSourceId: source.id,
			connectionId: parent.connectionId,
			providerCalendarId: created.data.id,
			summary: source.summary,
			colorId: source.colorId
		};
	}

	async updateCalendar(params: {
		userId: string;
		calendarSourceId: string;
		providerResourceManaged: boolean;
		name?: string;
		description?: string;
		colorId?: string;
		timeZone?: string;
	}): Promise<void> {
		const target = await this.targetService.resolveExplicitSource(
			params.userId,
			params.calendarSourceId,
			'write'
		);
		const api = await this.apiForTarget(params.userId, target);
		if (
			params.providerResourceManaged &&
			(params.name || params.description || params.timeZone)
		) {
			await api.calendars.patch({
				calendarId: target.providerCalendarId,
				requestBody: {
					summary: params.name,
					description: params.description,
					timeZone: params.timeZone
				}
			});
		}
		if (params.colorId) {
			await api.calendarList.patch({
				calendarId: target.providerCalendarId,
				requestBody: { colorId: params.colorId }
			});
		}
	}

	async deleteCalendar(params: { userId: string; calendarSourceId: string }): Promise<void> {
		const target = await this.targetService.resolveExplicitSource(
			params.userId,
			params.calendarSourceId,
			'write'
		);
		try {
			await (
				await this.apiForTarget(params.userId, target)
			).calendars.delete({ calendarId: target.providerCalendarId });
		} catch (error) {
			// Deletion is intentionally idempotent: the provider may have succeeded before a
			// later local mapping cleanup failed, so a retry must be allowed to finish.
			if (!isNotFoundError(error)) throw error;
		}
	}

	async shareCalendar(params: {
		userId: string;
		calendarSourceId: string;
		shares: Array<{ email: string; role: 'reader' | 'writer' | 'owner' }>;
	}): Promise<void> {
		const target = await this.targetService.resolveExplicitSource(
			params.userId,
			params.calendarSourceId,
			'write'
		);
		const api = await this.apiForTarget(params.userId, target);
		for (const share of params.shares) {
			await api.acl.insert({
				calendarId: target.providerCalendarId,
				requestBody: {
					role: share.role,
					scope: { type: 'user', value: share.email }
				}
			});
		}
	}
}
