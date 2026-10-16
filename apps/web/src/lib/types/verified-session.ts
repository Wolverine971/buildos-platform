// apps/web/src/lib/types/verified-session.ts
import type { Session, User } from '@supabase/supabase-js';

/** Identity verified from a signed token or the Auth server, never the cookie's user object.
 * A claims check does not supply a full, fresh Auth user record. Call getUser() when needed.
 */
export type VerifiedSession = Omit<Session, 'user'> & {
	user: Pick<User, 'id' | 'email'>;
};
