// apps/web/src/lib/supabase-helpers.ts
import { getContext, hasContext } from 'svelte';
import { browser } from '$app/environment';
import { supabase as browserClient } from '$lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export function getSupabase(): SupabaseClient<Database> {
	if (hasContext('supabase')) return getContext('supabase');
	if (browser && browserClient) return browserClient;

	throw new Error('Supabase client unavailable (server call outside load()?)');
}
