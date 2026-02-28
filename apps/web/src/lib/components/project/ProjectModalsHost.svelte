<!-- apps/web/src/lib/components/project/ProjectModalsHost.svelte -->
<script lang="ts">
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { DocMoveModal, DocDeleteConfirmModal } from '$lib/components/ontology/doc-tree';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
	import type { Document, Goal, Project, Task } from '$lib/types/onto';
	import type { GraphNode } from '$lib/components/ontology/graph/lib/graph.types';

	let {
		project,
		contextDocument,
		goals,
		tasks,
		documentTypeOptions,
		docTreeStructure,
		docTreeDocuments,
		canDeleteProject,
		canOpenCollabModal,
		canAdmin,
		showDocumentModal,
		activeDocumentId,
		parentDocumentId,
		showMoveDocModal,
		moveDocumentId,
		moveDocumentTitle,
		showDeleteDocConfirmModal,
		deleteDocumentId,
		deleteDocumentTitle,
		deleteDocumentHasChildren,
		deleteDocumentChildCount,
		showTaskCreateModal,
		editingTaskId,
		showPlanCreateModal,
		editingPlanId,
		showGoalCreateModal,
		editingGoalId,
		showRiskCreateModal,
		editingRiskId,
		showMilestoneCreateModal,
		milestoneCreateGoalContext,
		editingMilestoneId,
		showEventCreateModal,
		editingEventId,
		showProjectCalendarModal,
		showProjectEditModal,
		showCollabModal,
		showDeleteProjectModal,
		isDeletingProject,
		deleteProjectError,
		showGraphModal,
		onCloseDocumentModal,
		onDocumentSaved,
		onDocumentDeleted,
		onCloseMoveDocModal,
		onMoveDocumentConfirm,
		onCloseDeleteDocConfirmModal,
		onDeleteDocumentConfirm,
		onCloseTaskCreateModal,
		onTaskCreated,
		onCloseTaskEditModal,
		onTaskUpdated,
		onTaskDeleted,
		onClosePlanCreateModal,
		onPlanCreated,
		onClosePlanEditModal,
		onPlanUpdated,
		onPlanDeleted,
		onCloseGoalCreateModal,
		onGoalCreated,
		onCloseGoalEditModal,
		onGoalUpdated,
		onGoalDeleted,
		onCloseRiskCreateModal,
		onRiskCreated,
		onCloseRiskEditModal,
		onRiskUpdated,
		onRiskDeleted,
		onCloseMilestoneCreateModal,
		onMilestoneCreated,
		onCloseMilestoneEditModal,
		onMilestoneUpdated,
		onMilestoneDeleted,
		onCloseEventCreateModal,
		onEventCreated,
		onCloseEventEditModal,
		onEventUpdated,
		onEventDeleted,
		onCloseProjectCalendarModal,
		onCloseProjectEditModal,
		onProjectSaved,
		onCloseCollabModal,
		onLeftProject,
		onProjectDeleteConfirm,
		onCancelProjectDelete,
		onCloseGraphModal,
		onGraphNodeClick
	}: {
		project: Project;
		contextDocument: Document | null;
		goals: Goal[];
		tasks: Task[];
		documentTypeOptions: string[];
		docTreeStructure: DocStructure | null;
		docTreeDocuments: Record<string, OntoDocument>;
		canDeleteProject: boolean;
		canOpenCollabModal: boolean;
		canAdmin: boolean;
		showDocumentModal: boolean;
		activeDocumentId: string | null;
		parentDocumentId: string | null;
		showMoveDocModal: boolean;
		moveDocumentId: string | null;
		moveDocumentTitle: string;
		showDeleteDocConfirmModal: boolean;
		deleteDocumentId: string | null;
		deleteDocumentTitle: string;
		deleteDocumentHasChildren: boolean;
		deleteDocumentChildCount: number;
		showTaskCreateModal: boolean;
		editingTaskId: string | null;
		showPlanCreateModal: boolean;
		editingPlanId: string | null;
		showGoalCreateModal: boolean;
		editingGoalId: string | null;
		showRiskCreateModal: boolean;
		editingRiskId: string | null;
		showMilestoneCreateModal: boolean;
		milestoneCreateGoalContext: { goalId: string; goalName: string } | null;
		editingMilestoneId: string | null;
		showEventCreateModal: boolean;
		editingEventId: string | null;
		showProjectCalendarModal: boolean;
		showProjectEditModal: boolean;
		showCollabModal: boolean;
		showDeleteProjectModal: boolean;
		isDeletingProject: boolean;
		deleteProjectError: string | null;
		showGraphModal: boolean;
		onCloseDocumentModal: () => void;
		onDocumentSaved: () => void | Promise<void>;
		onDocumentDeleted: () => void | Promise<void>;
		onCloseMoveDocModal: () => void;
		onMoveDocumentConfirm: (newParentId: string | null) => void | Promise<void>;
		onCloseDeleteDocConfirmModal: () => void;
		onDeleteDocumentConfirm: (mode: 'cascade' | 'promote') => void | Promise<void>;
		onCloseTaskCreateModal: () => void;
		onTaskCreated: (taskId: string) => void;
		onCloseTaskEditModal: () => void;
		onTaskUpdated: () => void;
		onTaskDeleted: () => void;
		onClosePlanCreateModal: () => void;
		onPlanCreated: (planId: string) => void;
		onClosePlanEditModal: () => void;
		onPlanUpdated: () => void;
		onPlanDeleted: () => void;
		onCloseGoalCreateModal: () => void;
		onGoalCreated: (goalId: string) => void;
		onCloseGoalEditModal: () => void;
		onGoalUpdated: () => void;
		onGoalDeleted: () => void;
		onCloseRiskCreateModal: () => void;
		onRiskCreated: (riskId: string) => void;
		onCloseRiskEditModal: () => void;
		onRiskUpdated: () => void;
		onRiskDeleted: () => void;
		onCloseMilestoneCreateModal: () => void;
		onMilestoneCreated: (milestoneId: string) => void;
		onCloseMilestoneEditModal: () => void;
		onMilestoneUpdated: () => void;
		onMilestoneDeleted: () => void;
		onCloseEventCreateModal: () => void;
		onEventCreated: (eventId: string) => void;
		onCloseEventEditModal: () => void;
		onEventUpdated: () => void;
		onEventDeleted: () => void;
		onCloseProjectCalendarModal: () => void;
		onCloseProjectEditModal: () => void;
		onProjectSaved: () => void | Promise<void>;
		onCloseCollabModal: () => void;
		onLeftProject: () => void;
		onProjectDeleteConfirm: () => void | Promise<void>;
		onCancelProjectDelete: () => void;
		onCloseGraphModal: () => void;
		onGraphNodeClick: (node: GraphNode) => void;
	} = $props();

	function handleGraphNodeSelect(node: GraphNode) {
		onCloseGraphModal();
		onGraphNodeClick(node);
	}
</script>

<!-- Document Create/Edit Modal -->
{#if showDocumentModal}
	{#await import('$lib/components/ontology/DocumentModal.svelte') then { default: DocumentModal }}
		<DocumentModal
			isOpen={showDocumentModal}
			projectId={project.id}
			documentId={activeDocumentId}
			{parentDocumentId}
			typeOptions={documentTypeOptions}
			onClose={onCloseDocumentModal}
			onSaved={onDocumentSaved}
			onDeleted={onDocumentDeleted}
		/>
	{/await}
{/if}

<!-- Document Move Modal -->
{#if showMoveDocModal && moveDocumentId}
	<DocMoveModal
		isOpen={showMoveDocModal}
		projectId={project.id}
		documentId={moveDocumentId}
		documentTitle={moveDocumentTitle}
		structure={docTreeStructure}
		documents={docTreeDocuments}
		onClose={onCloseMoveDocModal}
		onMove={onMoveDocumentConfirm}
	/>
{/if}

<!-- Document Delete Confirm Modal -->
{#if showDeleteDocConfirmModal && deleteDocumentId}
	<DocDeleteConfirmModal
		isOpen={showDeleteDocConfirmModal}
		documentTitle={deleteDocumentTitle}
		hasChildren={deleteDocumentHasChildren}
		childCount={deleteDocumentChildCount}
		onClose={onCloseDeleteDocConfirmModal}
		onDelete={onDeleteDocumentConfirm}
	/>
{/if}

<!-- Task Create Modal -->
{#if showTaskCreateModal}
	{#await import('$lib/components/ontology/TaskCreateModal.svelte') then { default: TaskCreateModal }}
		<TaskCreateModal projectId={project.id} onClose={onCloseTaskCreateModal} onCreated={onTaskCreated} />
	{/await}
{/if}

<!-- Task Edit Modal -->
{#if editingTaskId}
	{#await import('$lib/components/ontology/TaskEditModal.svelte') then { default: TaskEditModal }}
		<TaskEditModal
			taskId={editingTaskId}
			projectId={project.id}
			onClose={onCloseTaskEditModal}
			onUpdated={onTaskUpdated}
			onDeleted={onTaskDeleted}
		/>
	{/await}
{/if}

<!-- Plan Create Modal -->
{#if showPlanCreateModal}
	{#await import('$lib/components/ontology/PlanCreateModal.svelte') then { default: PlanCreateModal }}
		<PlanCreateModal projectId={project.id} onClose={onClosePlanCreateModal} onCreated={onPlanCreated} />
	{/await}
{/if}

<!-- Plan Edit Modal -->
{#if editingPlanId}
	{#await import('$lib/components/ontology/PlanEditModal.svelte') then { default: PlanEditModal }}
		<PlanEditModal
			planId={editingPlanId}
			projectId={project.id}
			onClose={onClosePlanEditModal}
			onUpdated={onPlanUpdated}
			onDeleted={onPlanDeleted}
		/>
	{/await}
{/if}

<!-- Goal Create Modal -->
{#if showGoalCreateModal}
	{#await import('$lib/components/ontology/GoalCreateModal.svelte') then { default: GoalCreateModal }}
		<GoalCreateModal projectId={project.id} onClose={onCloseGoalCreateModal} onCreated={onGoalCreated} />
	{/await}
{/if}

<!-- Goal Edit Modal -->
{#if editingGoalId}
	{#await import('$lib/components/ontology/GoalEditModal.svelte') then { default: GoalEditModal }}
		<GoalEditModal
			goalId={editingGoalId}
			projectId={project.id}
			onClose={onCloseGoalEditModal}
			onUpdated={onGoalUpdated}
			onDeleted={onGoalDeleted}
		/>
	{/await}
{/if}

<!-- Risk Create Modal -->
{#if showRiskCreateModal}
	{#await import('$lib/components/ontology/RiskCreateModal.svelte') then { default: RiskCreateModal }}
		<RiskCreateModal projectId={project.id} onClose={onCloseRiskCreateModal} onCreated={onRiskCreated} />
	{/await}
{/if}

<!-- Risk Edit Modal -->
{#if editingRiskId}
	{#await import('$lib/components/ontology/RiskEditModal.svelte') then { default: RiskEditModal }}
		<RiskEditModal
			riskId={editingRiskId}
			projectId={project.id}
			onClose={onCloseRiskEditModal}
			onUpdated={onRiskUpdated}
			onDeleted={onRiskDeleted}
		/>
	{/await}
{/if}

<!-- Milestone Create Modal -->
{#if showMilestoneCreateModal}
	{#await import('$lib/components/ontology/MilestoneCreateModal.svelte') then { default: MilestoneCreateModal }}
		<MilestoneCreateModal
			projectId={project.id}
			{goals}
			goalId={milestoneCreateGoalContext?.goalId}
			goalName={milestoneCreateGoalContext?.goalName}
			onClose={onCloseMilestoneCreateModal}
			onCreated={onMilestoneCreated}
		/>
	{/await}
{/if}

<!-- Milestone Edit Modal -->
{#if editingMilestoneId}
	{#await import('$lib/components/ontology/MilestoneEditModal.svelte') then { default: MilestoneEditModal }}
		<MilestoneEditModal
			milestoneId={editingMilestoneId}
			projectId={project.id}
			onClose={onCloseMilestoneEditModal}
			onUpdated={onMilestoneUpdated}
			onDeleted={onMilestoneDeleted}
		/>
	{/await}
{/if}

<!-- Event Create Modal -->
{#if showEventCreateModal}
	{#await import('$lib/components/ontology/EventCreateModal.svelte') then { default: EventCreateModal }}
		<EventCreateModal projectId={project.id} {tasks} onClose={onCloseEventCreateModal} onCreated={onEventCreated} />
	{/await}
{/if}

<!-- Event Edit Modal -->
{#if editingEventId}
	{#await import('$lib/components/ontology/EventEditModal.svelte') then { default: EventEditModal }}
		<EventEditModal
			eventId={editingEventId}
			projectId={project.id}
			onClose={onCloseEventEditModal}
			onUpdated={onEventUpdated}
			onDeleted={onEventDeleted}
		/>
	{/await}
{/if}

<!-- Project Calendar Modal -->
{#if showProjectCalendarModal}
	{#await import('$lib/components/project/ProjectCalendarSettingsModal.svelte') then { default: ProjectCalendarSettingsModal }}
		<ProjectCalendarSettingsModal
			isOpen={showProjectCalendarModal}
			{project}
			onClose={onCloseProjectCalendarModal}
		/>
	{/await}
{/if}

<!-- Project Edit Modal -->
{#if showProjectEditModal}
	{#await import('$lib/components/ontology/OntologyProjectEditModal.svelte') then { default: OntologyProjectEditModal }}
		<OntologyProjectEditModal
			isOpen={showProjectEditModal}
			{project}
			{contextDocument}
			{canDeleteProject}
			onClose={onCloseProjectEditModal}
			onSaved={onProjectSaved}
		/>
	{/await}
{/if}

<!-- Project Collaboration Settings Modal -->
{#if showCollabModal && canOpenCollabModal}
	{#await import('$lib/components/project/ProjectCollaborationModal.svelte') then { default: ProjectCollaborationModal }}
		<ProjectCollaborationModal
			isOpen={showCollabModal}
			projectId={project.id}
			projectName={project.name || 'Project'}
			canManageMembers={canAdmin}
			onLeftProject={onLeftProject}
			onClose={onCloseCollabModal}
		/>
	{/await}
{/if}

<!-- Project Delete Confirmation -->
{#if showDeleteProjectModal}
	<ConfirmationModal
		title="Delete project"
		confirmText="Delete"
		confirmVariant="danger"
		isOpen={showDeleteProjectModal}
		loading={isDeletingProject}
		onconfirm={onProjectDeleteConfirm}
		oncancel={onCancelProjectDelete}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This will permanently delete <span class="font-semibold text-foreground"
					>{project.name}</span
				>
				and all related data. This action cannot be undone.
			</p>
		{/snippet}
		{#snippet details()}
			{#if deleteProjectError}
				<p class="mt-2 text-sm text-destructive">
					{deleteProjectError}
				</p>
			{/if}
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Project Graph Modal -->
<Modal
	isOpen={showGraphModal}
	onClose={onCloseGraphModal}
	title="Project Graph"
	size="xl"
	ariaLabel="Project relationship graph"
>
	<div class="h-[60vh] sm:h-[70vh]">
		{#if showGraphModal}
			{#await import('$lib/components/ontology/ProjectGraphSection.svelte')}
				<div class="h-full flex items-center justify-center text-sm text-muted-foreground">
					Loading project graph...
				</div>
			{:then { default: ProjectGraphSection }}
				<ProjectGraphSection projectId={project.id} onNodeClick={handleGraphNodeSelect} />
			{:catch graphLoadError}
				<div class="h-full flex items-center justify-center px-4 text-sm text-destructive">
					{graphLoadError instanceof Error
						? graphLoadError.message
						: 'Failed to load project graph.'}
				</div>
			{/await}
		{/if}
	</div>
</Modal>
