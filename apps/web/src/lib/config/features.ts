// apps/web/src/lib/config/features.ts
//
// Centralized feature toggles. These are hardcoded because the new
// notification system and multi brain dump flow are now the default.
// If we ever need to make them configurable again, wire them up to an
// environment-aware loader in this module so callers stay unchanged.

/**
 * Multi brain dump support is fully rolled out, so the flag is permanently on.
 */
export const ENABLE_MULTI_BRAIN_DUMP = true as const;

/**
 * Generic notification stack is also always on. Documented here for parity in case
 * future code paths need to branch for backwards compatibility.
 */
export const ENABLE_GENERIC_NOTIFICATION_SYSTEM = true as const;
