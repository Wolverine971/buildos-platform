<!-- apps/web/src/lib/components/agent/ProjectActionSelector.svelte -->
<!--
  INKPRINT Design System: opening screen for a project chat.

  Shown after the user picks a project from ContextSelectionScreen. Lets
  them either start a project-wide chat (recommended) or scope the chat
  to a single entity. The tab + search + entity list is shared with
  ProjectFocusSelector via ProjectEntityList.
-->
<script lang="ts">
	import { BriefcaseBusiness, ChevronRight } from 'lucide-svelte';
	import type { FocusEntitySummary, ProjectFocus } from '@buildos/shared-types';
	import type { FocusEntityType } from './project-entity-browser';
	import type { ProjectAction } from './agent-chat.types';
	import ProjectEntityList from './ProjectEntityList.svelte';

	interface Props {
		projectId: string;
		projectName: string;
		onSelectAction: (action: ProjectAction) => void;
		onSelectFocus: (focus: ProjectFocus) => void;
	}

	let { projectId, projectName, onSelectAction, onSelectFocus }: Props = $props();

	function handleEntitySelect(entity: FocusEntitySummary, type: FocusEntityType) {
		if (!projectId) return;
		onSelectFocus({
			focusType: type,
			focusEntityId: entity.id,
			focusEntityName: entity.name,
			projectId,
			projectName
		});
	}
</script>

<!-- INKPRINT container with muted background -->
<div class="flex h-full min-h-0 flex-col bg-muted">
	<!-- Screen header band (matches ContextSelectionScreen project picker) -->
	<div class="border-b border-border bg-card px-3 py-2.5 tx tx-strip tx-weak sm:p-4">
		<h2 class="text-base font-semibold text-foreground sm:text-lg">
			How do you want to chat in {projectName}?
		</h2>
		<p class="mt-0.5 text-xs text-muted-foreground sm:text-sm">
			Chat across the whole project, or focus on one item inside it.
		</p>
	</div>

	<div class="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
		<!-- Project-wide chat — pre-selected default -->
		<button
			type="button"
			onclick={() => onSelectAction('workspace')}
			class="group relative flex w-full items-center gap-3 rounded-xl border-2 border-accent/60 bg-accent/5 p-3.5 text-left shadow-ink tx tx-frame tx-weak transition-all duration-200 hover:border-accent hover:bg-accent/10 hover:shadow-ink-strong active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:p-4"
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
					<span
						class="inline-flex items-center rounded-full border border-accent/30 bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent"
					>
						Recommended
					</span>
				</div>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Chat across goals, plans, tasks — everything in this project.
				</p>
			</div>
			<span
				class="hidden shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-accent-foreground shadow-ink transition-all group-hover:bg-accent/90 sm:inline-flex"
			>
				Start chat
				<ChevronRight class="h-3.5 w-3.5" />
			</span>
			<ChevronRight
				class="h-5 w-5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5 sm:hidden"
			/>
		</button>

		<!-- Section divider: "Or focus on one item" -->
		<div class="mt-5 mb-3 flex items-center gap-3 sm:mt-6">
			<span class="h-px flex-1 bg-border"></span>
			<span
				class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
			>
				Or focus on one item
			</span>
			<span class="h-px flex-1 bg-border"></span>
		</div>
		<p class="mb-3 text-[11px] text-muted-foreground sm:text-xs">
			Scope the chat to a specific task, goal, plan, document, milestone, or risk.
		</p>

		<ProjectEntityList {projectId} onSelectEntity={handleEntitySelect} />
	</div>
</div>
