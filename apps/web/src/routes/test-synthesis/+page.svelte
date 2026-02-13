<!-- apps/web/src/routes/test-synthesis/+page.svelte -->
<script lang="ts">
	import TaskMappingView from '$lib/components/synthesis/TaskMappingView.svelte';
	import type { ParsedOperation } from '$lib/types/brain-dump';

	// Test data from the user
	const testData = {
		synthesis: {
			id: '6acca87c-fc59-4e16-bf43-6c387ecbb17e',
			synthesis_content: {
				operations: [
					{
						id: 'synthesis-op-1756086987924-0',
						table: 'tasks',
						operation: 'update',
						data: {
							id: 'dad1455f-c976-4ac9-b153-198ee5410bd7',
							title: 'Develop Dad Rap Song Concept',
							description:
								'Refine a comprehensive song concept that captures the unique blend of fatherhood and rap. Craft a narrative and musical identity that intertwines personal experiences with bold, humorous lyrics to resonate with the dad rapper persona.',
							details:
								"Outline and develop a song narrative that reflects the dual identity of being a dedicated father and an expressive rapper. Key steps include brainstorming personal experiences, refining lyrical hooks (including the line 'my kids aren't the only ones that call me daddy'), and planning musical elements inspired by influences such as Young Gravy. The session should also address creative elements for a track titled 'Pappi Dee Hee,' ensuring that both thematic and production aspects are well-integrated. Collaborate with music production resources and, if necessary, other artists to refine and validate the concept.",
							status: 'backlog',
							priority: 'high',
							task_type: 'one_off',
							project_id: 'beb98240-282f-4a30-9fdb-3b5788da34fa',
							duration_minutes: 90,
							start_date: '2023-10-02',
							parent_task_id: null,
							dependencies: [],
							deleted_at: null,
							user_id: '255735ad-a34b-4ca9-942c-397ed8cc1435'
						},
						enabled: true,
						reasoning:
							"The creative tasks related to defining the dad rap song narrative and the track 'Pappi Dee Hee' were highly similar in scope and purpose. Merging them into one comprehensive task avoids redundancy, streamlines the creative process, and establishes a clear, focused direction that will inform downstream production tasks such as the music video."
					},
					{
						id: 'synthesis-op-1756086987925-1',
						table: 'tasks',
						operation: 'update',
						data: {
							id: 'dd596e58-1431-4d38-8615-df1cdb067644',
							title: 'Plan and Prepare Music Video Production',
							description:
								'Outline the music video production plan by developing detailed scene concepts that visually capture the dynamic essence of the dad rapper persona.',
							details:
								'Develop a storyboard that details the various scene transitions including: scenes with running and deceleration, contrasting walking with sudden acceleration, performing pull-ups in a kitchen setting, flexing muscles, and a reflective moment outside a burnt house. Ensure all creative elements are aligned with the established song narrative. Schedule collaboration sessions with Patricks to solidify the visual approach and allow for iterative review in subsequent cycles, as this is a recurring production task.',
							status: 'in_progress',
							priority: 'medium',
							task_type: 'recurring',
							project_id: 'beb98240-282f-4a30-9fdb-3b5788da34fa',
							duration_minutes: 120,
							start_date: '2023-10-03',
							parent_task_id: null,
							dependencies: ['dad1455f-c976-4ac9-b153-198ee5410bd7'],
							deleted_at: null,
							user_id: '255735ad-a34b-4ca9-942c-397ed8cc1435'
						},
						enabled: true,
						reasoning:
							'The music video planning task was sequenced to follow the song concept development. By setting its dependency on the consolidated songwriting task, it ensures the visual production is directly guided by the creative narrative established earlier. This logical ordering reduces rework and streamlines the workflow towards a coherent output.'
					},
					{
						id: 'synthesis-op-1756086987925-2',
						table: 'tasks',
						operation: 'update',
						data: {
							id: '52438e3a-c644-4d94-a1bb-6a485e3ee337',
							title: "Create 'Pappi Dee Hee' song",
							description:
								'This task has been integrated into a comprehensive song development effort to enhance focus on a unified creative direction.',
							details:
								'The creative elements originally outlined for this song have been integrated into a broader task that encompasses the complete narrative and musical development for the dad rap concept. Focus on refining lyrical themes, verifying the hook, and ensuring that the elements of humor and authenticity are effectively represented in the overall track.',
							status: 'backlog',
							priority: 'low',
							task_type: 'one_off',
							project_id: 'beb98240-282f-4a30-9fdb-3b5788da34fa',
							duration_minutes: 0,
							start_date: null,
							parent_task_id: null,
							dependencies: [],
							deleted_at: '2023-10-01T12:00:00Z',
							user_id: '255735ad-a34b-4ca9-942c-397ed8cc1435'
						},
						enabled: true,
						reasoning:
							"The task for creating the 'Pappi Dee Hee' song overlaps significantly with the overall song concept development. Marking it as outdated prevents duplication, ensuring that all creative efforts are concentrated within a single, coherent task that covers the entire songwriting process."
					}
				],
				insights:
					"Tasks were sequenced so that the initial creative work, which involves developing a detailed song concept that captures the dad rapper persona, is completed before moving on to the music video production. This removes ambiguity over creative direction by ensuring that the song's narrative and musical elements are clearly defined, thereby acting as a prerequisite for the visual production process. Grouping the two songwriting tasks into a single, focused effort minimizes duplication and reduces context switching while still preserving all original creative details.\n\nThe tasks were grouped by their functional area. The songwriting effort now consolidates both the refinement of the song concept and the development of the track 'Pappi Dee Hee,' which streamlines the creative process. The music video task, now clearly dependent on the song concept, was given a separate time block and higher duration to accommodate the detailed storyboarding required. By clearly mapping dependencies and allocating realistic durations, the project now has a coherent, step‐by‐step plan that balances deep creative work with efficient batching of recurring production tasks.",
				comparison: [
					{
						type: 'consolidated',
						originalTasks: [
							'dad1455f-c976-4ac9-b153-198ee5410bd7',
							'52438e3a-c644-4d94-a1bb-6a485e3ee337'
						],
						newTask: {
							title: 'Develop Dad Rap Song Concept',
							description:
								"A unified task that refines the overarching dad rap narrative including key elements for a track titled 'Pappi Dee Hee'."
						},
						reasoning:
							'Combining the similar songwriting tasks reduces redundancy and focuses creative energy on developing a strong narrative, ensuring that all thematic and lyrical elements are cohesively integrated before moving to production.'
					},
					{
						type: 'sequenced',
						originalTasks: ['dd596e58-1431-4d38-8615-df1cdb067644'],
						newTask: {
							title: 'Plan and Prepare Music Video Production',
							description:
								'A clearly structured task that follows the finalized song concept to create a detailed storyboard for the music video.'
						},
						reasoning:
							'Sequencing the music video task after the song concept ensures that the visual production is informed by a completed narrative, thereby eliminating potential reworks and ensuring a focused creative process.'
					}
				],
				summary:
					'The project tasks were first arranged to follow a logical creative progression starting with song development followed by video production. Similar songwriting tasks were merged and appropriately timeblocked, while the video production remains a recurring task dependent on the song concept being finalized.'
			},
			created_at: '2025-08-25T01:56:28.248Z'
		}
	};

	// Sample tasks data
	const tasks = [
		{
			id: 'dad1455f-c976-4ac9-b153-198ee5410bd7',
			title: 'Define dad rap song narrative',
			description: 'Create the core narrative and themes for the dad rap song',
			status: 'backlog',
			priority: 'high',
			task_type: 'one_off',
			duration_minutes: 60
		},
		{
			id: '52438e3a-c644-4d94-a1bb-6a485e3ee337',
			title: "Create 'Pappi Dee Hee' song",
			description: "Develop the specific track 'Pappi Dee Hee' with lyrics and concept",
			status: 'backlog',
			priority: 'medium',
			task_type: 'one_off',
			duration_minutes: 45
		},
		{
			id: 'dd596e58-1431-4d38-8615-df1cdb067644',
			title: 'Plan music video scenes',
			description: 'Create initial storyboard for music video',
			status: 'backlog',
			priority: 'medium',
			task_type: 'recurring',
			duration_minutes: 90
		}
	];

	const operations = testData.synthesis.synthesis_content.operations as ParsedOperation[];
	const comparison = testData.synthesis.synthesis_content.comparison;

	function handleOperationEdit(operation: ParsedOperation) {
		// console.log('Edit operation:', operation);
		alert(`Edit operation: ${operation.data.title}`);
	}
</script>

<!-- apps/web/src/routes/test-synthesis/+page.svelte -->
<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<title>Synthesis Test - BuildOS (Internal)</title>
</svelte:head>

<div class="min-h-screen bg-muted p-8">
	<div class="max-w-7xl mx-auto">
		<div class="mb-8">
			<h1 class="text-3xl font-bold text-foreground mb-2">Task Synthesis Test Page</h1>
			<p class="text-muted-foreground">
				Testing the new TaskMappingView component with sample data
			</p>
		</div>

		<div class="bg-card rounded-2xl shadow-ink-strong p-8">
			<TaskMappingView
				{operations}
				{tasks}
				{comparison}
				onOperationEdit={handleOperationEdit}
			/>
		</div>

		<div class="mt-8 p-4 bg-muted rounded-lg">
			<h3 class="text-sm font-semibold text-foreground mb-2">Debug Info</h3>
			<pre class="text-xs text-muted-foreground overflow-auto">
Operations: {operations.length}
Tasks: {tasks.length}
Comparisons: {comparison.length}
			</pre>
		</div>
	</div>
</div>
