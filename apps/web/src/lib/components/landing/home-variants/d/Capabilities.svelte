<!--
	Home D: a quieter, text-led break after the two big demos. Six things BuildOS does once
	a project exists, each with a small drawn example that reuses the hero reel's people and
	projects (Priya's soccer team, Jordan's semester, and so on), so the page tells one story.
	Every capability shown ships today. The examples are decorative; the text carries the meaning.
	Titles carry no icons: each card already has its example above it.
-->
<script lang="ts">
	import { Check, FileText, Mic } from '$lib/icons/lucide';

	const ITEMS = [
		{
			id: 'voice',
			title: 'Talk instead of type',
			body: 'Dictate on a walk or in the car. BuildOS turns the ramble into tasks, notes, and dates in the right project.'
		},
		{
			id: 'brief',
			title: 'A short brief every morning',
			body: "One read across all your projects: what's due, what moved, and the next step for each."
		},
		{
			id: 'chat',
			title: 'Ask your project anything',
			body: "Every project has a chat that already knows the plan. Ask what's left, talk through a decision, or have it update the tasks."
		},
		{
			id: 'calendar',
			title: 'Make time for the work',
			body: 'Give tasks a date and see them in your week. Connect Google Calendar to plan around everything else.'
		},
		{
			id: 'docs',
			title: 'Notes that stay with the work',
			body: 'Character notes, budgets, practice plans. Docs live inside the project and get updated when something changes.'
		},
		{
			id: 'ai',
			title: 'Works with Claude and ChatGPT',
			body: 'Connect them and they can read your projects and add to them, only with your permission.'
		}
	] as const;

	const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
	const WAVE = [6, 14, 9, 18, 11, 22, 8, 16, 12, 20, 7, 15, 10, 19, 6, 13, 9] as const;
</script>

<ul class="grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
	{#each ITEMS as item (item.id)}
		<li class="min-w-0">
			<div class="sample" aria-hidden="true">
				{#if item.id === 'voice'}
					<div class="flex items-center gap-3">
						<span class="mic"><Mic class="h-4 w-4" /></span>
						<span class="flex h-6 items-center gap-[3px]">
							{#each WAVE as height, i (i)}<i class="bar" style:height="{height}px"
								></i>{/each}
						</span>
						<span class="ml-auto font-mono text-xs text-muted-foreground">0:18</span>
					</div>
					<p class="mt-3 text-sm leading-snug text-muted-foreground">
						“…still need two snack parents. picture day is saturday at 9…”
					</p>
					<p class="tag mt-3"><Check class="h-3 w-3" />3 updates · Hornets U10 soccer</p>
				{:else if item.id === 'brief'}
					<p class="text-xs text-muted-foreground">Tuesday brief</p>
					<p class="mt-1 text-sm font-semibold text-foreground">Good morning, Jordan.</p>
					<ul class="mt-2 grid gap-1.5 text-sm">
						<li class="line">
							<i class="dot due"></i>Orgo problem set 7<span>today</span>
						</li>
						<li class="line"><i class="dot"></i>Bio lab report<span>Fri</span></li>
						<li class="line next">Next: email Prof. Lin about the midterm</li>
					</ul>
				{:else if item.id === 'chat'}
					<p class="bubble me">What's left before launch?</p>
					<div class="mt-2 flex items-start gap-2">
						<img
							src="/brain-bolt.webp"
							alt=""
							width="24"
							height="24"
							class="mt-0.5 h-6 w-6 shrink-0 rounded object-cover"
						/>
						<p class="bubble">
							Three things: QA checkout on mobile, the redirects, and the checklist
							for Kim by Thursday.
						</p>
					</div>
				{:else if item.id === 'calendar'}
					<div
						class="grid grid-cols-7 gap-1 text-center font-mono text-[11px] text-muted-foreground"
					>
						{#each WEEK as day, i (i)}<span>{day}</span>{/each}
					</div>
					<div class="mt-1.5 grid h-[86px] grid-cols-7 gap-1">
						{#each WEEK as _, i (i)}
							<span class="day">
								{#if i === 3}<span class="block-item">Fix timer</span>{/if}
								{#if i === 5}<span class="block-item hot">Build beds</span>{/if}
							</span>
						{/each}
					</div>
					<p class="mt-2 text-xs text-muted-foreground">Backyard garden · this week</p>
				{:else if item.id === 'docs'}
					<p class="text-xs text-muted-foreground">Fading Crown · Docs</p>
					<ul class="mt-2 grid gap-1 text-sm text-foreground">
						<li class="doc"><FileText class="h-3.5 w-3.5" />Magic system rules v2</li>
						<li class="doc">
							<FileText class="h-3.5 w-3.5" />Ch. 13 beats<span class="tag ml-auto"
								>Updated</span
							>
						</li>
						<li class="doc"><FileText class="h-3.5 w-3.5" />Maya, character arc</li>
					</ul>
					<p class="mt-2 text-xs text-muted-foreground">
						Storm in the ferry scene moved earlier.
					</p>
				{:else}
					<div class="flex items-center gap-2 text-sm">
						<span class="pill">Claude</span>
						<span class="link"></span>
						<span class="pill">BuildOS</span>
						<span class="ml-auto text-xs text-muted-foreground">Connected</span>
					</div>
					<p class="mt-3 text-sm leading-snug text-muted-foreground">
						“Add a task to send the agency notes on logo B.”
					</p>
					<p class="tag mt-3"><Check class="h-3 w-3" />Added to Brand redesign</p>
				{/if}
			</div>
			<h3 class="mt-6 text-lg font-medium tracking-[-0.01em]">{item.title}</h3>
			<p class="mt-2 text-pretty text-base leading-relaxed text-muted-foreground">
				{item.body}
			</p>
		</li>
	{/each}
</ul>

<style>
	.sample {
		height: 12rem;
		overflow: hidden;
		border-radius: 16px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		box-shadow: var(--shadow-ink);
		padding: 20px;
	}
	.mic {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 99px;
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}
	.bar {
		display: block;
		width: 3px;
		border-radius: 99px;
		background: hsl(var(--accent) / 0.55);
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: 99px;
		background: hsl(var(--accent) / 0.12);
		padding: 2px 10px;
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--accent));
	}
	.line {
		display: flex;
		align-items: center;
		gap: 8px;
		color: hsl(var(--foreground));
	}
	.line span {
		margin-left: auto;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.line.next {
		margin-top: 4px;
		border-radius: 6px;
		background: hsl(var(--accent) / 0.1);
		padding: 4px 8px;
		font-size: 13px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: hsl(var(--info));
	}
	.dot.due {
		background: hsl(var(--success));
	}
	.bubble {
		border-radius: 12px;
		background: hsl(var(--muted));
		padding: 8px 12px;
		font-size: 13px;
		line-height: 1.4;
		color: hsl(var(--foreground));
	}
	.bubble.me {
		margin-left: auto;
		width: fit-content;
		max-width: 85%;
		background: hsl(var(--foreground));
		color: hsl(var(--background));
	}
	.day {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		border-radius: 6px;
		background: hsl(var(--muted) / 0.7);
		padding: 2px;
	}
	.block-item {
		border-radius: 4px;
		background: hsl(var(--info) / 0.18);
		padding: 3px;
		font-size: 10px;
		line-height: 1.2;
		color: hsl(var(--foreground));
	}
	.block-item.hot {
		background: hsl(var(--accent) / 0.2);
	}
	.doc {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 28px;
		color: hsl(var(--foreground));
	}
	.doc :global(svg) {
		color: hsl(var(--muted-foreground));
	}
	.pill {
		border-radius: 8px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--background));
		padding: 3px 10px;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.link {
		width: 28px;
		border-top: 2px dashed hsl(var(--success));
	}
</style>
