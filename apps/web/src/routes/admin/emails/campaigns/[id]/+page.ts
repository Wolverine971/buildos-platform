// apps/web/src/routes/admin/emails/campaigns/[id]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => ({ campaignId: params.id });
