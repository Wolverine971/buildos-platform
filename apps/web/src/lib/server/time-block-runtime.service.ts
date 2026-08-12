// apps/web/src/lib/server/time-block-runtime.service.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';
import { isMultiCalendarUserAllowed } from './google-calendar-feature';
import { GoogleCalendarWriteService } from './google-calendar-write.service';

export function createTimeBlockRuntimeService(
	supabase: SupabaseClient<Database>,
	userId: string
): TimeBlockService {
	return new TimeBlockService(supabase, userId, new CalendarService(supabase), {
		sourceAwareCalendar: isMultiCalendarUserAllowed(userId, privateEnv)
			? new GoogleCalendarWriteService(createAdminSupabaseClient())
			: undefined
	});
}
