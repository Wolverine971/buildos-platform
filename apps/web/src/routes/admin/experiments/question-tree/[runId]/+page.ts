// apps/web/src/routes/admin/experiments/question-tree/[runId]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => ({ runId: params.runId });
