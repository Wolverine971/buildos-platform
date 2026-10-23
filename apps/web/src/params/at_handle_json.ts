// apps/web/src/params/at_handle_json.ts
// Matches the agent-readable builder page: "@djwayne.json".
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => /^@[a-z0-9-]{3,24}\.json$/i.test(param);
