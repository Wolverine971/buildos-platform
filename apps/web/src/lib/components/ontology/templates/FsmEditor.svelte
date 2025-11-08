<!-- apps/web/src/lib/components/ontology/templates/FsmEditor.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import cytoscape from 'cytoscape';
	import dagre from 'cytoscape-dagre';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import type { FsmDefinition, FsmState, FsmTransition } from './fsm-editor.types';

	// Register Cytoscape layout (safe to call multiple times)
	const CYTOSCAPE_DAGRE_KEY = '__buildos_fsm_editor_dagre_registered__';
	if (!(cytoscape as unknown as Record<string, unknown>)[CYTOSCAPE_DAGRE_KEY]) {
		cytoscape.use(dagre);
		(cytoscape as unknown as Record<string, unknown>)[CYTOSCAPE_DAGRE_KEY] = true;
	}

	interface Props {
		fsm?: FsmDefinition;
		loading?: boolean;
	}

	let { fsm = { states: {}, transitions: [] }, loading = false }: Props = $props();

	// Cytoscape instance
	let container: HTMLElement;
	let cy: cytoscape.Core | null = null;

	// Editor state
	let selectedElement = $state<{ type: 'state' | 'transition'; id: string } | null>(null);
	let editorMode = $state<'view' | 'add-state' | 'add-transition'>('view');

	// Form state for editing
	let editingState = $state<FsmState | null>(null);
	let editingTransition = $state<FsmTransition | null>(null);

	// Working FSM data
	let workingFsm = $state<FsmDefinition>(structuredClone(fsm));

	// Actions editor state
	let actionInput = $state('');
	let validationWarnings = $state<string[]>([]);

	// Export function to get current FSM
	export function getFsm(): FsmDefinition {
		return structuredClone(workingFsm);
	}

	export function setFsm(newFsm?: FsmDefinition | null) {
		const nextFsm = newFsm ? structuredClone(newFsm) : { states: {}, transitions: [] };
		workingFsm = nextFsm;
		selectedElement = null;
		editorMode = 'view';
		editingState = null;
		editingTransition = null;
		actionInput = '';

		if (container) {
			initializeGraph();
		}
	}

	// Stats
	const stateCount = $derived(Object.keys(workingFsm.states).length);
	const transitionCount = $derived(workingFsm.transitions.length);

	// Validation
	$effect(() => {
		// Trigger validation whenever FSM changes
		validateFsm();
	});

	function validateFsm() {
		const warnings: string[] = [];
		const stateKeys = Object.keys(workingFsm.states);

		// Check for unreachable states
		const reachableStates = new Set<string>();
		const initialStates = stateKeys.filter((key) => workingFsm.states[key].metadata?.initial);

		if (initialStates.length === 0 && stateKeys.length > 0) {
			warnings.push('No initial state defined');
		} else if (initialStates.length > 1) {
			warnings.push('Multiple initial states defined');
		}

		// Mark states reachable from initial
		if (initialStates.length > 0) {
			const queue = [...initialStates];
			while (queue.length > 0) {
				const current = queue.shift()!;
				if (reachableStates.has(current)) continue;
				reachableStates.add(current);

				// Find transitions from current state
				const outgoing = workingFsm.transitions.filter((t) => t.from === current);
				outgoing.forEach((t) => {
					if (!reachableStates.has(t.to)) {
						queue.push(t.to);
					}
				});
			}

			// Check for unreachable states
			stateKeys.forEach((key) => {
				if (!reachableStates.has(key) && !workingFsm.states[key].metadata?.initial) {
					warnings.push(`State "${workingFsm.states[key].label || key}" is unreachable`);
				}
			});
		}

		validationWarnings = warnings;
	}

	onMount(() => {
		initializeGraph();
		return () => destroyGraph();
	});

	onDestroy(() => {
		destroyGraph();
	});

	function destroyGraph() {
		if (cy) {
			cy.destroy();
			cy = null;
		}
	}

	function initializeGraph() {
		destroyGraph();

		const graphData = buildGraphData(workingFsm);

		cy = cytoscape({
			container,
			elements: [...graphData.nodes, ...graphData.edges],
			style: [
				{
					selector: 'node',
					style: {
						label: 'data(label)',
						'text-valign': 'center',
						'text-halign': 'center',
						'background-color': 'data(color)',
						shape: 'roundrectangle',
						width: 'data(width)',
						height: 'data(height)',
						'border-width': 3,
						'border-color': 'data(borderColor)',
						'font-size': '12px',
						'font-weight': '600',
						'font-family': 'Inter, system-ui, sans-serif',
						'text-wrap': 'wrap',
						'text-max-width': '100px',
						color: '#ffffff',
						cursor: 'pointer'
					}
				},
				{
					selector: 'edge',
					style: {
						width: 3,
						'line-color': '#6b7280',
						'target-arrow-color': '#6b7280',
						'target-arrow-shape': 'triangle',
						'curve-style': 'bezier',
						label: 'data(label)',
						'font-size': '10px',
						'font-weight': '500',
						'text-background-color': '#ffffff',
						'text-background-opacity': 0.95,
						'text-background-padding': '4px',
						'text-background-shape': 'roundrectangle',
						color: '#374151'
					}
				},
				{
					selector: 'node:selected',
					style: {
						'border-color': '#3b82f6',
						'border-width': 5
					}
				},
				{
					selector: 'edge:selected',
					style: {
						'line-color': '#3b82f6',
						'target-arrow-color': '#3b82f6',
						width: 4
					}
				},
				{
					selector: 'node.hover',
					style: {
						'border-color': '#60a5fa',
						'border-width': 4
					}
				}
			],
			layout: {
				name: 'dagre',
				rankDir: 'LR',
				nodeSep: 80,
				rankSep: 120,
				animate: true,
				animationDuration: 300
			},
			minZoom: 0.3,
			maxZoom: 3,
			wheelSensitivity: 0.15
		});

		// Event handlers
		cy.on('tap', 'node', (evt) => {
			const node = evt.target;
			const stateKey = node.data('stateKey');
			selectedElement = { type: 'state', id: stateKey };
			editingState = workingFsm.states[stateKey] || null;
			editingTransition = null;
			editorMode = 'view';
		});

		cy.on('tap', 'edge', (evt) => {
			const edge = evt.target;
			const transitionId = edge.data('transitionId');
			const transition = workingFsm.transitions.find((t) => t.id === transitionId);
			if (transition) {
				selectedElement = { type: 'transition', id: transitionId };
				editingTransition = { ...transition };
				editingState = null;
				editorMode = 'view';
			}
		});

		cy.on('tap', (evt) => {
			if (evt.target === cy) {
				if (editorMode === 'add-state') {
					// Add state at click position
					const pos = evt.position;
					addStateAtPosition(pos.x, pos.y);
				} else {
					selectedElement = null;
					editingState = null;
					editingTransition = null;
				}
			}
		});

		cy.on('mouseover', 'node', (evt) => {
			evt.target.addClass('hover');
		});

		cy.on('mouseout', 'node', (evt) => {
			evt.target.removeClass('hover');
		});
	}

	function buildGraphData(fsm: FsmDefinition) {
		const nodes: Array<{ data: Record<string, unknown> }> = [];
		const edges: Array<{ data: Record<string, unknown> }> = [];

		// Create nodes for each state
		for (const [key, state] of Object.entries(fsm.states)) {
			const isInitial = state.metadata?.initial === true;
			const isFinal = state.metadata?.final === true;

			nodes.push({
				data: {
					id: key,
					label: state.label || key,
					stateKey: key,
					color: isInitial ? '#10b981' : isFinal ? '#ef4444' : '#3b82f6',
					borderColor: isInitial ? '#059669' : isFinal ? '#dc2626' : '#2563eb',
					width: 120,
					height: 50
				}
			});
		}

		// Create edges for each transition
		fsm.transitions.forEach((transition, idx) => {
			const transitionId = transition.id || `transition-${idx}`;
			edges.push({
				data: {
					id: `edge-${transitionId}`,
					source: transition.from,
					target: transition.to,
					label: transition.label || transition.on || '',
					transitionId
				}
			});
		});

		return { nodes, edges };
	}

	function refreshGraph() {
		if (!cy) return;
		const graphData = buildGraphData(workingFsm);

		cy.batch(() => {
			cy.elements().remove();
			cy.add([...graphData.nodes, ...graphData.edges]);
		});

		cy.layout({
			name: 'dagre',
			rankDir: 'LR',
			nodeSep: 80,
			rankSep: 120,
			animate: true,
			animationDuration: 300
		}).run();
	}

	function addStateAtPosition(x: number, y: number) {
		const stateKey = `state_${Date.now()}`;
		workingFsm.states[stateKey] = {
			label: `State ${Object.keys(workingFsm.states).length + 1}`,
			metadata: {}
		};
		refreshGraph();
		editorMode = 'view';
		selectedElement = { type: 'state', id: stateKey };
		editingState = workingFsm.states[stateKey];
	}

	function handleAddState() {
		editorMode = 'add-state';
		selectedElement = null;
		editingState = null;
		editingTransition = null;
	}

	function handleAddTransition() {
		if (Object.keys(workingFsm.states).length < 2) {
			alert('You need at least 2 states to create a transition');
			return;
		}
		editorMode = 'add-transition';
		selectedElement = null;
		editingState = null;
		const fromState = Object.keys(workingFsm.states)[0];
		const toState = Object.keys(workingFsm.states)[1];
		editingTransition = {
			id: `trans_${Date.now()}`,
			from: fromState,
			to: toState,
			on: '',
			label: '',
			actions: []
		};
		actionInput = '';
	}

	// Action management
	function handleAddAction() {
		if (!editingTransition || !actionInput.trim()) return;
		const actions = editingTransition.actions || [];
		if (actions.includes(actionInput.trim())) {
			alert('This action already exists');
			return;
		}
		editingTransition.actions = [...actions, actionInput.trim()];
		actionInput = '';
	}

	function handleRemoveAction(action: string) {
		if (!editingTransition) return;
		editingTransition.actions = (editingTransition.actions || []).filter((a) => a !== action);
	}

	function handleActionKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAddAction();
		}
	}

	function handleSaveState() {
		if (!editingState || !selectedElement || selectedElement.type !== 'state') return;
		workingFsm.states[selectedElement.id] = { ...editingState };
		refreshGraph();
	}

	function handleDeleteState() {
		if (!selectedElement || selectedElement.type !== 'state') return;
		delete workingFsm.states[selectedElement.id];
		// Remove transitions that reference this state
		workingFsm.transitions = workingFsm.transitions.filter(
			(t) => t.from !== selectedElement.id && t.to !== selectedElement.id
		);
		selectedElement = null;
		editingState = null;
		refreshGraph();
	}

	function handleSaveTransition() {
		if (!editingTransition) return;

		if (selectedElement?.type === 'transition') {
			// Update existing
			const idx = workingFsm.transitions.findIndex((t) => t.id === selectedElement.id);
			if (idx !== -1) {
				workingFsm.transitions[idx] = { ...editingTransition };
			}
		} else {
			// Add new
			workingFsm.transitions.push({ ...editingTransition });
		}

		editorMode = 'view';
		editingTransition = null;
		selectedElement = null;
		refreshGraph();
	}

	function handleDeleteTransition() {
		if (!selectedElement || selectedElement.type !== 'transition') return;
		workingFsm.transitions = workingFsm.transitions.filter((t) => t.id !== selectedElement.id);
		selectedElement = null;
		editingTransition = null;
		refreshGraph();
	}

	function handleCancelTransition() {
		editorMode = 'view';
		editingTransition = null;
		selectedElement = null;
	}

	function handleFitToView() {
		if (!cy) return;
		cy.fit(undefined, 50);
	}
</script>

<Card variant="elevated">
	<CardHeader variant="default">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
					FSM State Machine
				</h3>
				<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
					Define states and transitions for this template
				</p>
				{#if validationWarnings.length > 0}
					<div class="mt-2 flex flex-col gap-1">
						{#each validationWarnings as warning}
							<div
								class="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1"
							>
								<svg
									class="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
								{warning}
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex gap-2 items-center">
				<div class="flex gap-2 text-xs text-gray-600 dark:text-gray-400">
					<span class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
						{stateCount} states
					</span>
					<span class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
						{transitionCount} transitions
					</span>
				</div>
				{#if validationWarnings.length > 0}
					<span
						class="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-full text-xs font-semibold"
					>
						{validationWarnings.length} warning{validationWarnings.length === 1
							? ''
							: 's'}
					</span>
				{:else if stateCount > 0}
					<span
						class="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-xs font-semibold"
					>
						Valid
					</span>
				{/if}
			</div>
		</div>
	</CardHeader>

	<CardBody padding="none">
		<div class="flex h-[600px]">
			<!-- Graph Canvas -->
			<div class="flex-1 relative bg-gray-50 dark:bg-gray-900">
				<div bind:this={container} class="w-full h-full"></div>

				<!-- Floating Toolbar -->
				<div
					class="absolute top-4 left-4 flex gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2"
				>
					<Button
						variant={editorMode === 'add-state' ? 'primary' : 'secondary'}
						size="sm"
						onclick={handleAddState}
						disabled={loading}
					>
						<svg
							class="w-4 h-4 mr-1"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						Add State
					</Button>
					<Button
						variant={editorMode === 'add-transition' ? 'primary' : 'secondary'}
						size="sm"
						onclick={handleAddTransition}
						disabled={loading || Object.keys(workingFsm.states).length < 2}
					>
						<svg
							class="w-4 h-4 mr-1"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 7l5 5m0 0l-5 5m5-5H6"
							/>
						</svg>
						Add Transition
					</Button>
					<div class="w-px bg-gray-200 dark:bg-gray-700"></div>
					<Button variant="ghost" size="sm" onclick={handleFitToView} disabled={loading}>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
							/>
						</svg>
					</Button>
				</div>

				<!-- Instructions Overlay -->
				{#if editorMode === 'add-state'}
					<div
						class="absolute inset-0 bg-blue-500/10 flex items-center justify-center pointer-events-none"
					>
						<div
							class="px-6 py-4 bg-blue-500 dark:bg-blue-600 text-white rounded-lg shadow-2xl font-semibold"
						>
							Click anywhere on the canvas to add a state
						</div>
					</div>
				{/if}
			</div>

			<!-- Property Panel -->
			<div
				class="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto"
			>
				<div class="p-4 space-y-4">
					{#if editingState && selectedElement?.type === 'state'}
						<!-- State Editor -->
						<div>
							<h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">
								Edit State
							</h4>

							<FormField label="State Key" labelFor="state-key">
								<TextInput
									id="state-key"
									value={selectedElement.id}
									disabled
									class="bg-gray-50 dark:bg-gray-900"
								/>
							</FormField>

							<FormField label="Label" labelFor="state-label">
								<TextInput
									id="state-label"
									bind:value={editingState.label}
									placeholder="Display name"
									disabled={loading}
								/>
							</FormField>

							<FormField label="Type" labelFor="state-type">
								<div class="space-y-2">
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={editingState.metadata?.initial === true}
											onchange={(e) => {
												if (editingState) {
													editingState.metadata = {
														...editingState.metadata,
														initial: e.currentTarget.checked
													};
												}
											}}
											disabled={loading}
											class="rounded"
										/>
										<span class="text-sm text-gray-700 dark:text-gray-300"
											>Initial State</span
										>
									</label>
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={editingState.metadata?.final === true}
											onchange={(e) => {
												if (editingState) {
													editingState.metadata = {
														...editingState.metadata,
														final: e.currentTarget.checked
													};
												}
											}}
											disabled={loading}
											class="rounded"
										/>
										<span class="text-sm text-gray-700 dark:text-gray-300"
											>Final State</span
										>
									</label>
								</div>
							</FormField>

							<div class="flex gap-2 pt-4">
								<Button
									variant="primary"
									size="sm"
									fullWidth
									onclick={handleSaveState}
									disabled={loading}
								>
									Save State
								</Button>
								<Button
									variant="danger"
									size="sm"
									fullWidth
									onclick={handleDeleteState}
									disabled={loading}
								>
									Delete
								</Button>
							</div>
						</div>
					{:else if editingTransition}
						<!-- Transition Editor -->
						<div>
							<h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">
								{editorMode === 'add-transition' ? 'Add' : 'Edit'} Transition
							</h4>

							<FormField label="From State" labelFor="trans-from">
								<Select
									id="trans-from"
									bind:value={editingTransition.from}
									disabled={loading}
								>
									{#each Object.entries(workingFsm.states) as [key, state]}
										<option value={key}>{state.label || key}</option>
									{/each}
								</Select>
							</FormField>

							<FormField label="To State" labelFor="trans-to">
								<Select
									id="trans-to"
									bind:value={editingTransition.to}
									disabled={loading}
								>
									{#each Object.entries(workingFsm.states) as [key, state]}
										<option value={key}>{state.label || key}</option>
									{/each}
								</Select>
							</FormField>

							<FormField label="Event/Trigger" labelFor="trans-on">
								<TextInput
									id="trans-on"
									bind:value={editingTransition.on}
									placeholder="e.g., approve, reject"
									disabled={loading}
								/>
							</FormField>

							<FormField label="Label" labelFor="trans-label">
								<TextInput
									id="trans-label"
									bind:value={editingTransition.label}
									placeholder="Display name (optional)"
									disabled={loading}
								/>
							</FormField>

							<FormField label="Guard Condition" labelFor="trans-guard">
								<TextInput
									id="trans-guard"
									bind:value={editingTransition.guard}
									placeholder="e.g., hasPermission, isValid (optional)"
									disabled={loading}
								/>
								<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
									Condition that must be true for this transition
								</p>
							</FormField>

							<FormField
								label="Actions (Optional)"
								labelFor="trans-actions"
								helpText="Actions to execute when this transition occurs"
							>
								<div class="space-y-2">
									{#if editingTransition.actions && editingTransition.actions.length > 0}
										<div class="flex flex-wrap gap-2 mb-2">
											{#each editingTransition.actions as action}
												<span
													class="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded text-sm"
												>
													{action}
													<button
														type="button"
														onclick={() => handleRemoveAction(action)}
														class="hover:text-red-600 dark:hover:text-red-400"
														aria-label="Remove action"
														title="Remove action"
													>
														<svg
															class="w-3 h-3"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M6 18L18 6M6 6l12 12"
															/>
														</svg>
													</button>
												</span>
											{/each}
										</div>
									{/if}
									<div class="flex gap-2">
										<TextInput
											id="trans-actions"
											bind:value={actionInput}
											placeholder="Add action (e.g., sendEmail, updateStatus)"
											disabled={loading}
											onkeydown={handleActionKeydown}
										/>
										<Button
											variant="secondary"
											size="sm"
											onclick={handleAddAction}
											disabled={loading || !actionInput.trim()}
										>
											Add
										</Button>
									</div>
								</div>
							</FormField>

							<div class="flex gap-2 pt-4">
								<Button
									variant="primary"
									size="sm"
									fullWidth
									onclick={handleSaveTransition}
									disabled={loading}
								>
									{editorMode === 'add-transition' ? 'Add' : 'Save'}
								</Button>
								{#if editorMode === 'add-transition'}
									<Button
										variant="secondary"
										size="sm"
										fullWidth
										onclick={handleCancelTransition}
										disabled={loading}
									>
										Cancel
									</Button>
								{:else}
									<Button
										variant="danger"
										size="sm"
										fullWidth
										onclick={handleDeleteTransition}
										disabled={loading}
									>
										Delete
									</Button>
								{/if}
							</div>
						</div>
					{:else}
						<!-- Help Text -->
						<div class="text-center text-gray-500 dark:text-gray-400 py-8">
							<svg
								class="w-12 h-12 mx-auto mb-3 opacity-50"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
							<p class="text-sm">Click a state or transition to edit</p>
							<p class="text-xs mt-2">Or use the toolbar to add new elements</p>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</CardBody>
</Card>
