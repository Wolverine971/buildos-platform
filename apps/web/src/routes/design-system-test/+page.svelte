<!-- apps/web/src/routes/design-system-test/+page.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Zap, Save, X, Check, AlertCircle, Info } from 'lucide-svelte';

	let inputValue = $state('');
	let textareaValue = $state('This is where your thoughts become structured action...');
	let selectValue = $state('');
	let showModal = $state(false);
</script>

<div class="min-h-screen bg-surface-panel dark:bg-slate-900 p-4 sm:p-8">
	<div class="max-w-7xl mx-auto space-y-8">
		<!-- Header -->
		<div class="text-center mb-12">
			<h1 class="text-4xl font-bold text-slate-900 dark:text-white mb-4">
				Scratchpad Ops Design System
			</h1>
			<p class="text-lg text-slate-700 dark:text-slate-400">
				Industrial-Creative Workspace Components
			</p>
			<div class="mt-4 flex justify-center gap-2">
				<Badge variant="info">Chaos → Structure</Badge>
				<Badge variant="success">Tactile Design</Badge>
				<Badge variant="warning">High Density</Badge>
			</div>
		</div>

		<!-- Section: Scratchpad Inputs -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				1. Scratchpad Surfaces (Input Areas)
			</h2>

			<div class="grid gap-6 md:grid-cols-2">
				<!-- Brain Dump Textarea -->
				<Card variant="elevated" padding="lg">
					<h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">
						Brain Dump Input
					</h3>
					<Textarea
						bind:value={textareaValue}
						rows={6}
						placeholder="What's on your mind? Share your thoughts, ideas, and tasks..."
						class="mb-4"
					/>
					<p class="text-sm text-slate-600 dark:text-slate-400">
						Features: <code>input-scratchpad</code> + <code>dither-soft</code> texture
					</p>
				</Card>

				<!-- Text Input Examples -->
				<Card variant="elevated" padding="lg">
					<h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">
						Text Inputs
					</h3>
					<div class="space-y-4">
						<TextInput
							bind:value={inputValue}
							placeholder="Project name..."
							icon={Zap}
						/>
						<TextInput
							bind:value={inputValue}
							placeholder="Task description..."
							size="lg"
						/>
						<TextInput
							bind:value={inputValue}
							placeholder="Error state example..."
							error={true}
							errorMessage="This field is required"
						/>
					</div>
				</Card>
			</div>
		</section>

		<!-- Section: Tactile Buttons -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				2. Tactile Tools (Buttons)
			</h2>

			<Card variant="elevated" padding="lg">
				<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					<!-- Primary Actions -->
					<div class="space-y-3">
						<h4 class="font-semibold text-slate-700 dark:text-slate-300">
							Primary Actions
						</h4>
						<Button variant="primary" icon={Zap} fullWidth>Process Brain Dump</Button>
						<Button variant="primary" size="lg" fullWidth>Large Primary</Button>
						<Button variant="primary" size="sm" fullWidth>Small Primary</Button>
					</div>

					<!-- Secondary Actions -->
					<div class="space-y-3">
						<h4 class="font-semibold text-slate-700 dark:text-slate-300">
							Secondary Actions
						</h4>
						<Button variant="secondary" icon={Save} fullWidth>Save Draft</Button>
						<Button variant="outline" fullWidth>Outline Button</Button>
						<Button variant="ghost" fullWidth>Ghost Button</Button>
					</div>

					<!-- State Variations -->
					<div class="space-y-3">
						<h4 class="font-semibold text-slate-700 dark:text-slate-300">
							States & Feedback
						</h4>
						<Button variant="success" icon={Check} fullWidth>Success</Button>
						<Button variant="warning" icon={AlertCircle} fullWidth>Warning</Button>
						<Button variant="danger" icon={X} fullWidth>Danger</Button>
						<Button variant="primary" loading fullWidth>Loading...</Button>
						<Button variant="primary" disabled fullWidth>Disabled</Button>
					</div>
				</div>

				<div class="mt-6 p-4 bg-surface-scratch dark:bg-slate-800 rounded">
					<p class="text-sm text-slate-600 dark:text-slate-400">
						<strong>Tactile Features:</strong> 2px pressable shadow, active state translates
						down 2px, 100ms transitions
					</p>
				</div>
			</Card>
		</section>

		<!-- Section: Industrial Panels -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				3. Industrial Panels (Cards)
			</h2>

			<div class="grid gap-6 md:grid-cols-3">
				<Card variant="default" padding="md">
					<h4 class="font-semibold text-slate-900 dark:text-white mb-2">Default Card</h4>
					<p class="text-sm text-slate-700 dark:text-slate-400">
						Basic panel with subtle shadow and surface-panel background.
					</p>
				</Card>

				<Card variant="elevated" padding="md" hoverable>
					<h4 class="font-semibold text-slate-900 dark:text-white mb-2">
						Elevated + Hoverable
					</h4>
					<p class="text-sm text-slate-700 dark:text-slate-400">
						Enhanced shadow depth with hover scale effect.
					</p>
				</Card>

				<Card variant="outline" padding="md">
					<h4 class="font-semibold text-slate-900 dark:text-white mb-2">Outline Card</h4>
					<p class="text-sm text-slate-700 dark:text-slate-400">
						Strong 2px border for emphasis and separation.
					</p>
				</Card>
			</div>

			<!-- Dithered Card Example -->
			<div class="mt-6">
				<Card variant="elevated" padding="lg" dithered={true}>
					<h4 class="font-semibold text-slate-900 dark:text-white mb-2">
						Dithered Surface Card
					</h4>
					<p class="text-slate-700 dark:text-slate-400">
						This card has the <code>dither-subtle</code> texture applied, creating a gentle
						grain effect. Use sparingly for special emphasis areas.
					</p>
				</Card>
			</div>
		</section>

		<!-- Section: Form Controls -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				4. Form Controls
			</h2>

			<Card variant="elevated" padding="lg">
				<div class="grid gap-6 md:grid-cols-2">
					<div>
						<label
							class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2"
						>
							Project Selection
						</label>
						<Select bind:value={selectValue} placeholder="Choose a project...">
							<option value="new">New Project</option>
							<option value="1">Brain Dump System</option>
							<option value="2">Ontology Migration</option>
							<option value="3">Design System Update</option>
						</Select>
					</div>

					<div>
						<label
							class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2"
						>
							Large Select (Responsive)
						</label>
						<Select
							bind:value={selectValue}
							size="lg"
							placeholder="Select an option..."
						>
							<option value="1">Option One</option>
							<option value="2">Option Two</option>
							<option value="3">Option Three</option>
						</Select>
					</div>
				</div>
			</Card>
		</section>

		<!-- Section: Status Indicators -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				5. Status Indicators
			</h2>

			<Card variant="elevated" padding="lg">
				<div class="flex flex-wrap gap-3">
					<Badge variant="info">Info Badge</Badge>
					<Badge variant="success">Success Badge</Badge>
					<Badge variant="warning">Warning Badge</Badge>
					<Badge variant="error">Error Badge</Badge>
					<Badge variant="info" size="lg">Large Badge</Badge>
					<Badge variant="success" size="sm">Small Badge</Badge>
				</div>

				<div class="mt-6 space-y-2">
					<div class="badge-draft inline-block">Draft Status</div>
					<div class="badge-active inline-block ml-3">Active Status</div>
					<div class="badge-complete inline-block ml-3">Complete Status</div>
				</div>
			</Card>
		</section>

		<!-- Section: Color Palette -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				6. Color Palette
			</h2>

			<Card variant="elevated" padding="lg">
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<!-- Slate Colors -->
					<div>
						<h4 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">
							Slate Palette
						</h4>
						<div class="space-y-2">
							<div class="h-12 bg-slate-900 rounded flex items-center px-3">
								<span class="text-white text-sm">slate-900</span>
							</div>
							<div class="h-12 bg-slate-700 rounded flex items-center px-3">
								<span class="text-white text-sm">slate-700</span>
							</div>
							<div class="h-12 bg-slate-500 rounded flex items-center px-3">
								<span class="text-white text-sm">slate-500</span>
							</div>
						</div>
					</div>

					<!-- Accent Colors -->
					<div>
						<h4 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">
							Accent Colors
						</h4>
						<div class="space-y-2">
							<div class="h-12 bg-accent-orange rounded flex items-center px-3">
								<span class="text-white text-sm">accent-orange</span>
							</div>
							<div class="h-12 bg-accent-blue rounded flex items-center px-3">
								<span class="text-white text-sm">accent-blue</span>
							</div>
							<div class="h-12 bg-accent-olive rounded flex items-center px-3">
								<span class="text-white text-sm">accent-olive</span>
							</div>
						</div>
					</div>

					<!-- Surface Colors -->
					<div>
						<h4 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">
							Surfaces
						</h4>
						<div class="space-y-2">
							<div
								class="h-12 bg-surface-scratch rounded border flex items-center px-3"
							>
								<span class="text-slate-700 text-sm">surface-scratch</span>
							</div>
							<div
								class="h-12 bg-surface-panel rounded border flex items-center px-3"
							>
								<span class="text-slate-700 text-sm">surface-panel</span>
							</div>
							<div class="h-12 clarity-zone rounded border flex items-center px-3">
								<span class="text-slate-700 text-sm">clarity-zone</span>
							</div>
						</div>
					</div>

					<!-- Shadows -->
					<div>
						<h4 class="font-semibold text-slate-700 dark:text-slate-300 mb-3">
							Shadow System
						</h4>
						<div class="space-y-3">
							<div
								class="h-12 bg-white dark:bg-slate-800 rounded shadow-subtle flex items-center px-3"
							>
								<span class="text-slate-700 dark:text-slate-300 text-sm"
									>shadow-subtle</span
								>
							</div>
							<div
								class="h-12 bg-white dark:bg-slate-800 rounded shadow-pressable flex items-center px-3"
							>
								<span class="text-slate-700 dark:text-slate-300 text-sm"
									>shadow-pressable</span
								>
							</div>
							<div
								class="h-12 bg-white dark:bg-slate-800 rounded shadow-elevated flex items-center px-3"
							>
								<span class="text-slate-700 dark:text-slate-300 text-sm"
									>shadow-elevated</span
								>
							</div>
						</div>
					</div>
				</div>
			</Card>
		</section>

		<!-- Section: Modal Example -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				7. Modal System
			</h2>

			<Card variant="elevated" padding="lg">
				<p class="text-slate-700 dark:text-slate-400 mb-4">
					Modals use the <code>industrial-panel</code> class for consistent workspace feel.
				</p>
				<Button variant="primary" onclick={() => (showModal = true)}>
					Open Example Modal
				</Button>
			</Card>
		</section>

		<!-- Section: Dithering Examples -->
		<section>
			<h2 class="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
				8. Dithering Textures
			</h2>

			<Card variant="elevated" padding="lg">
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="h-24 dither-subtle bg-surface-scratch rounded border p-4">
						<span class="text-sm font-semibold text-slate-700">dither-subtle</span>
					</div>
					<div class="h-24 dither-soft bg-surface-scratch rounded border p-4">
						<span class="text-sm font-semibold text-slate-700">dither-soft</span>
					</div>
					<div class="h-24 dither bg-surface-scratch rounded border p-4">
						<span class="text-sm font-semibold text-slate-700">dither (default)</span>
					</div>
					<div
						class="h-24 dither-gradient bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded border p-4"
					>
						<span class="text-sm font-semibold text-slate-700 dark:text-slate-300"
							>dither-gradient</span
						>
					</div>
					<div class="h-24 dither-surface bg-surface-panel rounded border p-4">
						<span class="text-sm font-semibold text-slate-700">dither-surface</span>
					</div>
					<div class="h-24 dither-accent bg-accent-orange/20 rounded border p-4">
						<span class="text-sm font-semibold text-slate-700">dither-accent</span>
					</div>
				</div>
			</Card>
		</section>
	</div>
</div>

<!-- Example Modal -->
<Modal bind:isOpen={showModal} title="Example Modal" size="md">
	<div class="p-6">
		<h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">
			Industrial Panel Modal
		</h3>
		<p class="text-slate-700 dark:text-slate-400 mb-4">
			This modal uses the industrial-panel styling with proper surface colors and borders. The
			4px border radius maintains consistency with the design system.
		</p>
		<div class="input-scratchpad dither-soft p-4 rounded">
			<p class="text-sm text-slate-600 dark:text-slate-400">
				This is a scratchpad surface inside the modal.
			</p>
		</div>
	</div>

	<div
		slot="footer"
		class="flex justify-end gap-3 p-4 border-t border-slate-700/20 dark:border-slate-500/20"
	>
		<Button variant="ghost" onclick={() => (showModal = false)}>Cancel</Button>
		<Button variant="primary" onclick={() => (showModal = false)}>Confirm</Button>
	</div>
</Modal>

<style>
	/* Any additional test-specific styles */
	code {
		@apply px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-accent-orange rounded text-sm font-mono;
	}
</style>
