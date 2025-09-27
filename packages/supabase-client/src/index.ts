import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@buildos/shared-types";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Create a Supabase client for server-side use (with service role key)
 */
export function createServerClient(): TypedSupabaseClient {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create a Supabase client for client-side use (with anon key)
 */
export function createBrowserClient(): TypedSupabaseClient {
  const supabaseUrl =
    process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing public Supabase environment variables");
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

/**
 * Create a custom Supabase client with provided credentials
 */
export function createCustomClient(
  url: string,
  key: string,
): TypedSupabaseClient {
  return createClient<Database>(url, key);
}

// Re-export useful types
export type { Database } from "@buildos/shared-types";
export { createClient } from "@supabase/supabase-js";
