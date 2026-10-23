// apps/web/src/params/at_handle.ts
// Matches a builder page path segment: "@djwayne" (handles are 3–24 of a-z, 0-9, -).
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => /^@[a-z0-9-]{3,24}$/i.test(param);
