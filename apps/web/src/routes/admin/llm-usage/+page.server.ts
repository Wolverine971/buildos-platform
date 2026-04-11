// apps/web/src/routes/admin/llm-usage/+page.server.ts
import { redirect } from '@sveltejs/kit';

export function load() {
	throw redirect(308, '/admin/chat#llm-usage');
}
