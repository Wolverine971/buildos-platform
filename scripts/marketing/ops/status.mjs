// scripts/marketing/ops/status.mjs
//
// Deterministic status engine for the BuildOS marketing ops pipeline.
//
// This is the "reroute to a tool where the model is superhuman" move: cadence
// math (is a post overdue? by how many days? what's next?) is computed here in
// code, NOT eyeballed by an agent reading markdown. The /marketing skill and the
// daily scheduled ping both call this and act on its output.
//
// Zero dependencies, plain ESM — runs with bare `node` locally AND in a fresh
// cloud clone (no tsx, no pnpm install). Native JSON, native Date.
//
// Reads:
//   docs/marketing/ops/queue.json    — content items + per-deliverable state
//   docs/marketing/ops/cadence.json  — timing rules (single source of truth)
//   docs/marketing/ops/tracks.json   — content tracks + ramp schedules
//
// Usage:
//   node scripts/marketing/ops/status.mjs                 # human report
//   node scripts/marketing/ops/status.mjs --json          # machine JSON (for the ping)
//   node scripts/marketing/ops/status.mjs --today=2026-07-24   # pin "today" (testing / determinism)

import fs from 'fs';
import path from 'path';

const OPS_DIR = path.join(process.cwd(), 'docs/marketing/ops');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Deliverable lifecycle: pending -> drafted -> scheduled -> posted (or skipped)
// Item lifecycle:        idea    -> drafted -> scheduled -> published

function readJson(file) {
	const p = path.join(OPS_DIR, file);
	if (!fs.existsSync(p)) {
		throw new Error(`Missing ${p} — run from repo root and ensure the ops files exist.`);
	}
	return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function parseDate(s) {
	// Treat YYYY-MM-DD as UTC midnight for stable day math.
	return new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
}

function daysBetween(a, b) {
	return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

function getToday() {
	const arg = process.argv.find((a) => a.startsWith('--today='));
	if (arg) return parseDate(arg.split('=')[1]);
	return parseDate(new Date().toISOString());
}

function computeStatus(today) {
	const cadence = readJson('cadence.json');
	const queueRaw = readJson('queue.json');
	let tracks = [];
	try {
		tracks = readJson('tracks.json').tracks;
	} catch {
		/* tracks optional */
	}

	const items = queueRaw.items ?? [];
	/** @type {{severity:string,item:string,title:string,what:string,days?:number}[]} */
	const findings = [];

	const publishedBlogs = items
		.filter((i) => i.type === 'blog' && i.status === 'published' && i.published_at)
		.sort((a, b) => parseDate(b.published_at).getTime() - parseDate(a.published_at).getTime());

	// 1) BLOG CADENCE — how stale is the newest published blog, and is the next one due?
	const { min, max } = cadence.blog.interval_days;
	const nextBlog = items
		.filter(
			(i) =>
				i.type === 'blog' &&
				(i.status === 'idea' || i.status === 'drafted' || i.status === 'scheduled')
		)
		.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0];

	if (publishedBlogs.length > 0) {
		const newest = publishedBlogs[0];
		const age = daysBetween(today, parseDate(newest.published_at));
		if (nextBlog) {
			if (age > max) {
				findings.push({
					severity: 'overdue',
					item: nextBlog.id,
					title: nextBlog.title,
					what: `Next blog overdue — ${age}d since last publish (${newest.id}), cadence is every ${min}-${max}d`,
					days: age - max
				});
			} else if (age >= min) {
				findings.push({
					severity: 'due',
					item: nextBlog.id,
					title: nextBlog.title,
					what: `Blog due now — ${age}d since last publish (window ${min}-${max}d)`,
					days: 0
				});
			} else {
				findings.push({
					severity: 'next',
					item: nextBlog.id,
					title: nextBlog.title,
					what: `Next blog due in ${min - age}d`,
					days: min - age
				});
			}
		}
	} else if (nextBlog) {
		findings.push({
			severity: 'due',
			item: nextBlog.id,
			title: nextBlog.title,
			what: `No blog published yet — start the cluster`,
			days: 0
		});
	}

	// 2) EXTRACTIONS (drafting) — every published blog needs its 5 extractions
	// DRAFTED within 48h. Only fires while a lane is still 'pending'.
	const extractionWindowDays = cadence.extractions.within_hours_of_publish / 24;
	for (const blog of publishedBlogs) {
		const age = daysBetween(today, parseDate(blog.published_at));
		const dels = blog.deliverables ?? [];
		for (const req of cadence.extractions.required) {
			const d = dels.find((x) => x.kind === req);
			const done =
				d &&
				(d.status === 'drafted' ||
					d.status === 'scheduled' ||
					d.status === 'posted' ||
					d.status === 'skipped');
			if (!done) {
				if (age > extractionWindowDays) {
					findings.push({
						severity: 'overdue',
						item: blog.id,
						title: blog.title,
						what: `${req} not drafted — ${age}d after publish (48h window missed)`,
						days: Math.floor(age - extractionWindowDays)
					});
				} else {
					findings.push({
						severity: 'due',
						item: blog.id,
						title: blog.title,
						what: `${req} due — within 48h of publish`,
						days: 0
					});
				}
			}
		}
	}

	// 3) POSTING — any extraction that's DRAFTED (or scheduled) but not yet posted.
	// The 48h draft obligation above owns 'pending' lanes; this owns the next stage
	// of the lifecycle, so a single deliverable is never both "not drafted" and
	// "not posted" at once. Cross-post order puts every lane live within ~72h-7d,
	// so a drafted-but-unposted lane past the 7-day window is overdue; inside it,
	// it's green — ready to post right now.
	const postWindow = cadence.tiktok.post_within_days_of_publish; // 7d shared cross-post window
	for (const blog of publishedBlogs) {
		const age = daysBetween(today, parseDate(blog.published_at));
		for (const d of blog.deliverables ?? []) {
			if (d.kind === 'blog') continue;
			if (d.status !== 'drafted' && d.status !== 'scheduled') continue;
			if (age > postWindow) {
				findings.push({
					severity: 'overdue',
					item: blog.id,
					title: blog.title,
					what: `${d.kind} drafted but never posted — ${age}d after publish (post window ${postWindow}d)`,
					days: age - postWindow
				});
			} else {
				findings.push({
					severity: 'ready',
					item: blog.id,
					title: blog.title,
					what: `${d.kind} drafted — ready to post (${postWindow - age}d left in window)`,
					days: postWindow - age
				});
			}
		}
	}

	// 4) ASSET GAPS — deliverables that declared an asset need but have no resolved asset.
	for (const item of items) {
		for (const d of item.deliverables ?? []) {
			const needs = d.asset_needs ?? [];
			const have = d.assets ?? [];
			if (needs.length > 0 && have.length === 0 && d.status !== 'posted' && d.status !== 'skipped') {
				findings.push({
					severity: 'asset-gap',
					item: item.id,
					title: item.title,
					what: `${d.kind} needs assets: ${needs.join(', ')}`
				});
			}
		}
	}

	// 5) BACKLOG — ideas/drafts not yet scheduled or published.
	const backlog = items
		.filter((i) => i.status === 'idea' || i.status === 'drafted')
		.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
	for (const b of backlog) {
		findings.push({
			severity: 'backlog',
			item: b.id,
			title: b.title,
			what: `${b.status} — ${b.type}`
		});
	}

	return { findings, tracks, backlogCount: backlog.length, publishedCount: publishedBlogs.length };
}

function render(today) {
	const { findings, tracks, backlogCount } = computeStatus(today);
	const asJson = process.argv.includes('--json');
	const group = (sev) => findings.filter((f) => f.severity === sev);

	if (asJson) {
		process.stdout.write(
			JSON.stringify(
				{
					today: today.toISOString().slice(0, 10),
					counts: {
						overdue: group('overdue').length,
						due: group('due').length,
						ready: group('ready').length,
						assetGaps: group('asset-gap').length,
						backlog: backlogCount
					},
					findings,
					tracks
				},
				null,
				2
			) + '\n'
		);
		return;
	}

	const line = (s) => process.stdout.write(s + '\n');

	const overdue = group('overdue');
	const due = group('due');
	const ready = group('ready');
	const next = group('next');
	const gaps = group('asset-gap');
	const backlog = group('backlog');

	line('');
	line(`  MARKETING OPS — ${today.toISOString().slice(0, 10)}`);
	line('  ' + '─'.repeat(46));

	if (overdue.length) {
		line('');
		line(`  🔴 OVERDUE (${overdue.length})`);
		overdue
			.sort((a, b) => (b.days ?? 0) - (a.days ?? 0))
			.forEach((f) => line(`     ${f.item}  ${f.what}${f.days ? `  [+${f.days}d]` : ''}`));
	}
	if (due.length) {
		line('');
		line(`  🟡 DUE NOW (${due.length})`);
		due.forEach((f) => line(`     ${f.item}  ${f.what}`));
	}
	if (ready.length) {
		line('');
		line(`  🟢 READY TO POST (${ready.length})`);
		ready.sort((a, b) => (a.days ?? 0) - (b.days ?? 0)).forEach((f) => line(`     ${f.item}  ${f.what}`));
	}
	if (next.length) {
		line('');
		line(`  🔵 NEXT UP`);
		next.forEach((f) => line(`     ${f.item}  ${f.what}`));
	}
	if (gaps.length) {
		line('');
		line(`  🖼️  ASSET GAPS (${gaps.length})`);
		gaps.forEach((f) => line(`     ${f.item}  ${f.what}`));
	}
	if (backlog.length) {
		line('');
		line(`  📦 BACKLOG (${backlog.length})`);
		backlog.slice(0, 8).forEach((f) => line(`     ${f.item}  ${f.title}  (${f.what})`));
		if (backlog.length > 8)
			line(`     … +${backlog.length - 8} more — run /marketing backlog to synthesize`);
	}
	if (tracks.length) {
		line('');
		line('  🛤  TRACKS');
		tracks.forEach((t) => {
			let s = `     ${t.name}: ${t.state}`;
			if (t.state === 'ramping' && t.ramp) s += ` (full by ${t.ramp.full})`;
			line(s);
		});
	}
	if (!overdue.length && !due.length && !ready.length && !gaps.length) {
		line('');
		line('  ✅ Nothing due. You are caught up.');
	}
	line('');
}

try {
	render(getToday());
} catch (err) {
	process.stderr.write(`status.mjs error: ${err.message}\n`);
	process.exit(1);
}
