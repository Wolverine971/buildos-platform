// apps/worker/src/lib/supabase.ts
import { createCustomClient } from '@buildos/supabase-client';
import dotenv from 'dotenv';

dotenv.config();
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();

if (!supabaseUrl || !supabaseServiceKey) {
	throw new Error('Missing Supabase environment variables');
}

export const supabase = createCustomClient(supabaseUrl, supabaseServiceKey);
