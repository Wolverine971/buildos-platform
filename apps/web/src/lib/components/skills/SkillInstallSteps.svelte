<!-- apps/web/src/lib/components/skills/SkillInstallSteps.svelte -->
<!-- Short install steps for a downloadable agent skill: skills CLI, Claude Code, Codex. -->
<script lang="ts">
	import { SITE_URL } from '$lib/constants/seo';
	import { Check, Copy } from '$lib/icons/lucide';

	let {
		skillName,
		bundleUrl
	}: {
		/** SKILL.md `name`; also the folder the bundle unzips into. */
		skillName: string;
		/** Absolute URL of the skill's bundle.zip. */
		bundleUrl: string;
	} = $props();

	let steps = $derived([
		{
			label: 'Any agent (skills CLI)',
			command: `npx skills add ${SITE_URL} --skill ${skillName}`
		},
		{
			label: 'Claude Code',
			command: `curl -L ${bundleUrl} -o ${skillName}.zip && unzip -o ${skillName}.zip -d ~/.claude/skills/`
		},
		{
			label: 'Codex',
			command: `curl -L ${bundleUrl} -o ${skillName}.zip && unzip -o ${skillName}.zip -d ~/.agents/skills/`
		}
	]);
	let copiedCommand = $state<string | null>(null);

	async function copyCommand(command: string) {
		try {
			await navigator.clipboard.writeText(command);
		} catch {
			return;
		}
		copiedCommand = command;
		window.setTimeout(() => {
			if (copiedCommand === command) copiedCommand = null;
		}, 1800);
	}
</script>

<div class="space-y-2">
	<p class="micro-label text-foreground">Install</p>
	<ol class="space-y-2">
		{#each steps as step (step.label)}
			<li class="min-w-0">
				<p class="text-xs font-medium text-muted-foreground">{step.label}</p>
				<div class="mt-1 flex min-w-0 items-stretch gap-1.5">
					<code
						class="block min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-border bg-muted px-3 py-2 text-xs text-foreground"
					>
						{step.command}
					</code>
					<button
						type="button"
						class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						aria-label={copiedCommand === step.command
							? `Copied ${step.label} command`
							: `Copy ${step.label} command`}
						onclick={() => void copyCommand(step.command)}
					>
						{#if copiedCommand === step.command}
							<Check class="h-4 w-4 text-success" />
						{:else}
							<Copy class="h-4 w-4" />
						{/if}
					</button>
				</div>
			</li>
		{/each}
	</ol>
	<p class="text-xs leading-5 text-muted-foreground">
		Each command leaves <code class="text-foreground">{skillName}/SKILL.md</code> in the agent's
		skills folder. Restart the agent to pick it up.
	</p>
</div>
