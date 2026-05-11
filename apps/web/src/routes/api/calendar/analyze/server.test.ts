// apps/web/src/routes/api/calendar/analyze/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const {
	hasValidConnectionMock,
	analyzeUserCalendarMock,
	getAnalysisHistoryMock,
	getCalendarProjectsMock,
	logErrorMock
} = vi.hoisted(() => ({
	hasValidConnectionMock: vi.fn(),
	analyzeUserCalendarMock: vi.fn(),
	getAnalysisHistoryMock: vi.fn(),
	getCalendarProjectsMock: vi.fn(),
	logErrorMock: vi.fn()
}));

vi.mock('$lib/services/calendar-service', () => ({
	CalendarService: vi.fn().mockImplementation(() => ({
		hasValidConnection: hasValidConnectionMock
	}))
}));

vi.mock('$lib/services/calendar-analysis.service', () => ({
	CalendarAnalysisService: {
		getInstance: vi.fn(() => ({
			analyzeUserCalendar: analyzeUserCalendarMock,
			getAnalysisHistory: getAnalysisHistoryMock,
			getCalendarProjects: getCalendarProjectsMock
		}))
	}
}));

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			logError: logErrorMock
		}))
	}
}));

import { POST } from './+server';

function createPostEvent(body: Record<string, unknown>, withUser = true): RequestEvent {
	return {
		request: {
			json: vi.fn().mockResolvedValue(body)
		},
		locals: {
			supabase: {},
			safeGetSession: vi.fn().mockResolvedValue({
				session: withUser ? { user: { id: 'user-1' } } : null
			})
		}
	} as unknown as RequestEvent;
}

describe('POST /api/calendar/analyze', () => {
	beforeEach(() => {
		hasValidConnectionMock.mockReset();
		analyzeUserCalendarMock.mockReset();
		getAnalysisHistoryMock.mockReset();
		getCalendarProjectsMock.mockReset();
		logErrorMock.mockReset();
	});

	it('requires an authenticated user', async () => {
		const response = await POST(createPostEvent({}, false));

		expect(response.status).toBe(401);
		expect(hasValidConnectionMock).not.toHaveBeenCalled();
	});

	it('rejects analysis when Google Calendar is not connected', async () => {
		hasValidConnectionMock.mockResolvedValue(false);

		const response = await POST(createPostEvent({ daysBack: 7, daysForward: 60 }));
		const payload = await response.json();

		expect(response.status).toBe(403);
		expect(payload.code).toBe('CALENDAR_NOT_CONNECTED');
		expect(payload.details).toEqual({ requiresAuth: true });
		expect(analyzeUserCalendarMock).not.toHaveBeenCalled();
	});

	it('runs analysis only after the calendar connection is valid', async () => {
		hasValidConnectionMock.mockResolvedValue(true);
		analyzeUserCalendarMock.mockResolvedValue({
			analysisId: 'analysis-1',
			eventsAnalyzed: 12,
			suggestions: []
		});

		const response = await POST(createPostEvent({ daysBack: 7, daysForward: 60 }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(analyzeUserCalendarMock).toHaveBeenCalledWith('user-1', {
			daysBack: 7,
			daysForward: 60,
			calendarsToAnalyze: undefined
		});
		expect(payload.data.analysisId).toBe('analysis-1');
	});
});
