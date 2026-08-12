// apps/web/src/lib/server/project-calendar-runtime.service.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { isMultiCalendarUserAllowed } from './google-calendar-feature';
import { GoogleCalendarProjectResourceService } from './google-calendar-project-resource.service';

export function createProjectCalendarRuntimeService(
	supabase: SupabaseClient<Database>,
	userId: string
): ProjectCalendarService {
	return new ProjectCalendarService(supabase, {
		projectResourceService: isMultiCalendarUserAllowed(userId, privateEnv)
			? new GoogleCalendarProjectResourceService(createAdminSupabaseClient())
			: undefined
	});
}
