<!-- apps/web/src/lib/components/agent/ProjectFocusSelector.svelte -->
<!--
  INKPRINT Design System: inline screen for changing the focus of an
  active project chat.

  Same visual structure as ProjectActionSelector — header band, recommended
  "Project-wide chat" card, divider, ProjectEntityList — so re-focusing
  mid-chat feels identical to choosing the initial focus.
-->
<script lang="ts">
	import { BriefcaseBusiness, CircleCheck } from 'lucide-svelte';
	import type { FocusEntitySummary, ProjectFocus } from '@buildos/shared-types';
	import type { FocusEntityType } from './project-entity-browser';
	import ProjectEntityList from './ProjectEntityList.svelte';

	interface Props {
		projectId: string;
		projectName: string;
		currentFocus: ProjectFocus | null;
		onSelect: (focus: ProjectFocus) => void;
	}

	let { projectId, projectName, currentFocus, onSelect }: Props = $props();

	const isProjectWideActive = $derived(currentFocus?.focusType === 'project-wide');
	const entityFocusType = $derived<FocusEntityType | null>(
		currentFocus?.focusType && currentFocus.focusType !== 'project-wide'
			? (currentFocus.focusType as FocusEntityType)
			: null
	);
	const initialTabType = $derived<FocusEntityType>(entityFocusType ?? 'task');

	function handleProjectWide() {
		if (!projectId) return;
		onSelect({
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null,
			projectId,
			projectName
		});
	}

	function handleEntitySelect(entity: FocusEntitySummary, type: FocusEntityType) {
		if (!projectId) return;
		onSelect({
			focusType: type,
			focusEntityId: entity.id,
			focusEntityName: entity.name,
			projectId,
			projectName
		});
	}
</script>

<!-- INKPRINT container with muted background (matches ProjectActionSelector) -->
<div class="flex h-full min-h-0 flex-col bg-muted">
	<!-- Screen header band -->
	<div class="border-b border-border bg-card px-3 py-2.5 tx tx-strip tx-weak sm:p-4">
		<h2 class="text-base font-semibold text-foreground sm:text-lg">
			Focus the chat in {projectName}
		</h2>
		<p class="mt-0.5 text-xs text-muted-foreground sm:text-sm">
			Switch to project-wide chat, or scope to a specific item inside the project.
		</p>
	</div>

	<div class="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
		<!-- Project-wide chat — the "reset to wide view" affordance -->
		<button
			type="button"
			onclick={handleProjectWide}
			aria-pressed={isProjectWideActive}
			class={`group relative flex w-full items-center gap-3 rounded-lg border-2 p-3.5 text-left shadow-ink tx tx-frame tx-weak transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:p-4 ${
				isProjectWideActive
					? 'border-accent bg-accent/10'
					: 'border-accent/60 bg-accent/5 hover:border-accent hover:bg-accent/10 hover:shadow-ink-strong'
			}`}
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground shadow-ink sm:h-11 sm:w-11"
			>
				<BriefcaseBusiness class="h-4 w-4 sm:h-5 sm:w-5" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h3 class="text-sm font-semibold text-foreground sm:text-base">
						Project-wide chat
					</h3>
					{#if isProjectWideActive}
						<span
							class="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-1.5 py-0.5 micro-label font-bold text-accent"
						>
							<CircleCheck class="h-3 w-3" />
							Current
						</span>
					{/if}
				</div>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Chat across goals, plans, tasks — everything in this project.
				</p>
			</div>
		</button>

		<!-- Section divider: "Or focus on one item" -->
		<div class="mt-5 mb-3 flex items-center gap-3 sm:mt-6">
			<span class="h-px flex-1 bg-border"></span>
			<span class="micro-label font-semibold text-muted-foreground">
				Or focus on one item
			</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>
		<p class="mb-3 text-[0.7rem] text-muted-foreground sm:text-xs">
			Scope the chat to a specific task, goal, plan, document, milestone, or risk.
		</p>

		<ProjectEntityList
			{projectId}
			initialType={initialTabType}
			activeFocusType={entityFocusType}
			activeFocusEntityId={currentFocus?.focusEntityId ?? null}
			onSelectEntity={handleEntitySelect}
		/>
	</div>
</div>
