import { env } from '$env/dynamic/private';
import { GoogleAgentOAuthService } from '@buildos/shared-agent-ops/google/google-agent-oauth';
import {
	createCalendarAgentAuthPort,
	createGmailAgentAuthPort
} from '@buildos/shared-agent-ops/google/google-agent-ports';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const readGoogleAgentEnv = (name: string) => env[name] ?? process.env[name];
export const createGoogleAgentOAuthService = () =>
	new GoogleAgentOAuthService(createAdminSupabaseClient(), { readEnv: readGoogleAgentEnv });
export const createWebCalendarAgentAuthPort = () =>
	createCalendarAgentAuthPort(createAdminSupabaseClient(), readGoogleAgentEnv);
export const createWebGmailAgentAuthPort = () =>
	createGmailAgentAuthPort(createAdminSupabaseClient(), readGoogleAgentEnv);
