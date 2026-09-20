// docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/sanitize-check.mjs
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'node:fs';
const rt = await import(
	'/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/dist/loop/index.mjs'
);
const fn = rt.sanitizeAssistantFinalText;
if (!fn) {
	console.log(
		'export missing; keys:',
		Object.keys(rt).filter((k) => /sanit/i.test(k))
	);
	process.exit(0);
}
const env = Object.fromEntries(
	fs
		.readFileSync('/Users/djwayne/buildos-platform/apps/web/.env', 'utf8')
		.split('\n')
		.filter((l) => l.includes('=') && !l.trim().startsWith('#'))
		.map((l) => {
			const i = l.indexOf('=');
			return [
				l.slice(0, i).trim(),
				l
					.slice(i + 1)
					.trim()
					.replace(/^"|"$/g, '')
			];
		})
);
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});
const { data: me } = await sb
	.from('users')
	.select('id')
	.eq('email', 'djwayne35@gmail.com')
	.single();
const { data: msgs } = await sb
	.from('chat_messages')
	.select('id,content,created_at')
	.eq('user_id', me.id)
	.eq('role', 'assistant')
	.gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString())
	.order('created_at', { ascending: false })
	.limit(80);
let touched = 0,
	lostChars = 0,
	totalChars = 0;
const examples = [];
for (const m of msgs || []) {
	const c = m.content || '';
	if (!c.trim()) continue;
	totalChars += c.length;
	const out = typeof fn(c) === 'string' ? fn(c) : (fn(c)?.text ?? fn(c)?.sanitized ?? '');
	if (out !== c) {
		touched++;
		lostChars += c.length - out.length;
		if (examples.length < 6) {
			const a = c.split(/(?<=[.!?])\s+/),
				b = new Set(out.split(/(?<=[.!?])\s+/));
			const lost = a.filter((s) => !b.has(s)).slice(0, 2);
			examples.push(lost.map((s) => s.slice(0, 140)));
		}
	}
}
console.log(
	JSON.stringify(
		{
			assistant_messages: (msgs || []).length,
			messages_altered: touched,
			chars_total: totalChars,
			chars_removed: lostChars,
			examples
		},
		null,
		1
	)
);
