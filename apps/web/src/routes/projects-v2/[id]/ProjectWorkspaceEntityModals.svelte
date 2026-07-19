<!-- apps/web/src/routes/projects-v2/[id]/ProjectWorkspaceEntityModals.svelte -->
<!--
	Native entity modal host for the V2 project workspace.

	This keeps Overview, search, graph, and activity interactions inside the workspace
	instead of routing users back through the classic project page.
-->
<script lang="ts">
	import type { Document, Goal, Project, Task } from '$lib/types/onto';

	type WorkspaceEntityKind = 'goal' | 'plan' | 'milestone' | 'risk' | 'event' | 'project';
	type WorkspaceCreateKind = Exclude<WorkspaceEntityKind, 'project'>;
	type WorkspaceEditTarget = {
		kind: WorkspaceEntityKind;
		entityId: string;
	};

	let {
		project,
		contextDocument,
		goals,
		tasks,
		tasksComplete,
		createKind,
		editTarget,
		onCloseCreate,
		onCreated,
		onCloseEdit,
		onMutated
	}: {
		project: Project;
		contextDocument: Document | null;
		goals: Goal[];
		tasks: Task[];
		tasksComplete: boolean;
		createKind: WorkspaceCreateKind | null;
		editTarget: WorkspaceEditTarget | null;
		onCloseCreate: () => void;
		onCreated: (kind: WorkspaceCreateKind, entityId: string) => void;
		onCloseEdit: () => void;
		onMutated: () => void;
	} = $props();
</script>

{#if createKind === 'plan'}
	{#await import('$lib/components/ontology/PlanCreateModal.svelte') then { default: PlanCreateModal }}
		<PlanCreateModal
			projectId={project.id}
			onClose={onCloseCreate}
			onCreated={(id) => onCreated('plan', id)}
		/>
	{/await}
{:else if createKind === 'goal'}
	{#await import('$lib/components/ontology/GoalCreateModal.svelte') then { default: GoalCreateModal }}
		<GoalCreateModal
			projectId={project.id}
			onClose={onCloseCreate}
			onCreated={(id) => onCreated('goal', id)}
		/>
	{/await}
{:else if createKind === 'risk'}
	{#await import('$lib/components/ontology/RiskCreateModal.svelte') then { default: RiskCreateModal }}
		<RiskCreateModal
			projectId={project.id}
			onClose={onCloseCreate}
			onCreated={(id) => onCreated('risk', id)}
		/>
	{/await}
{:else if createKind === 'milestone'}
	{#await import('$lib/components/ontology/MilestoneCreateModal.svelte') then { default: MilestoneCreateModal }}
		<MilestoneCreateModal
			projectId={project.id}
			{goals}
			onClose={onCloseCreate}
			onCreated={(id) => onCreated('milestone', id)}
		/>
	{/await}
{:else if createKind === 'event'}
	{#await import('$lib/components/ontology/EventCreateModal.svelte') then { default: EventCreateModal }}
		<EventCreateModal
			projectId={project.id}
			{tasks}
			{tasksComplete}
			onClose={onCloseCreate}
			onCreated={(id) => onCreated('event', id)}
		/>
	{/await}
{/if}

{#if editTarget?.kind === 'plan'}
	{#await import('$lib/components/ontology/PlanEditModal.svelte') then { default: PlanEditModal }}
		<PlanEditModal
			planId={editTarget.entityId}
			projectId={project.id}
			onClose={onCloseEdit}
			onUpdated={onMutated}
			onDeleted={onMutated}
		/>
	{/await}
{:else if editTarget?.kind === 'goal'}
	{#await import('$lib/components/ontology/GoalEditModal.svelte') then { default: GoalEditModal }}
		<GoalEditModal
			goalId={editTarget.entityId}
			projectId={project.id}
			onClose={onCloseEdit}
			onUpdated={onMutated}
			onDeleted={onMutated}
		/>
	{/await}
{:else if editTarget?.kind === 'risk'}
	{#await import('$lib/components/ontology/RiskEditModal.svelte') then { default: RiskEditModal }}
		<RiskEditModal
			riskId={editTarget.entityId}
			projectId={project.id}
			onClose={onCloseEdit}
			onUpdated={onMutated}
			onDeleted={onMutated}
		/>
	{/await}
{:else if editTarget?.kind === 'milestone'}
	{#await import('$lib/components/ontology/MilestoneEditModal.svelte') then { default: MilestoneEditModal }}
		<MilestoneEditModal
			milestoneId={editTarget.entityId}
			projectId={project.id}
			onClose={onCloseEdit}
			onUpdated={onMutated}
			onDeleted={onMutated}
		/>
	{/await}
{:else if editTarget?.kind === 'event'}
	{#await import('$lib/components/ontology/EventEditModal.svelte') then { default: EventEditModal }}
		<EventEditModal
			eventId={editTarget.entityId}
			projectId={project.id}
			onClose={onCloseEdit}
			onUpdated={onMutated}
			onDeleted={onMutated}
		/>
	{/await}
{:else if editTarget?.kind === 'project'}
	{#await import('$lib/components/ontology/OntologyProjectEditModal.svelte') then { default: OntologyProjectEditModal }}
		<OntologyProjectEditModal
			isOpen={true}
			{project}
			{contextDocument}
			canDeleteProject={false}
			onClose={onCloseEdit}
			onSaved={() => onMutated()}
		/>
	{/await}
{/if}
