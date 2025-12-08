<!-- apps/web/src/routes/design-system-test/+page.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		Zap,
		Save,
		X,
		Check,
		AlertCircle,
		Info,
		Sparkles,
		Layers,
		Target,
		Waves,
		Grid3X3,
		Link2,
		Frame,
		AlignJustify
	} from 'lucide-svelte';

	let inputValue = $state('');
	let textareaValue = $state('This is where your thoughts become structured action...');
	let selectValue = $state('');
	let showModal = $state(false);
</script>

<div class="min-h-screen bg-background p-4 sm:p-8">
	<div class="max-w-7xl mx-auto space-y-12">
		<!-- Header -->
		<header class="text-center mb-16">
			<div class="flex justify-center mb-6">
				<div
					class="w-20 h-20 rounded-lg bg-accent flex items-center justify-center shadow-ink-strong tx tx-grain tx-weak"
				>
					<Sparkles class="w-10 h-10 text-accent-foreground" />
				</div>
			</div>
			<h1 class="text-4xl md:text-5xl font-bold text-foreground mb-4">
				Inkprint Design System
			</h1>
			<p class="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
				A halftone-inspired texture system with semantic meanings. Linocut aesthetics meet
				digital clarity.
			</p>
			<div class="flex flex-wrap justify-center gap-2">
				<Badge variant="info">Texture-First</Badge>
				<Badge variant="success">Semantic Colors</Badge>
				<Badge variant="warning">Tactile Feel</Badge>
			</div>
		</header>

		<!-- Section 1: Color Palette -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">1. Color System</h2>
			<p class="text-muted-foreground mb-6">
				Semantic color tokens that adapt to light and dark modes automatically.
			</p>

			<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					<!-- Background Colors -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							Backgrounds
						</h4>
						<div
							class="h-16 bg-background rounded-lg border border-border flex items-center justify-center"
						>
							<span class="text-sm font-mono text-foreground">bg-background</span>
						</div>
						<div
							class="h-16 bg-card rounded-lg border border-border flex items-center justify-center"
						>
							<span class="text-sm font-mono text-foreground">bg-card</span>
						</div>
						<div
							class="h-16 bg-muted rounded-lg border border-border flex items-center justify-center"
						>
							<span class="text-sm font-mono text-foreground">bg-muted</span>
						</div>
					</div>

					<!-- Text Colors -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							Typography
						</h4>
						<div
							class="h-16 bg-card rounded-lg border border-border flex items-center justify-center"
						>
							<span class="text-foreground font-medium">text-foreground</span>
						</div>
						<div
							class="h-16 bg-card rounded-lg border border-border flex items-center justify-center"
						>
							<span class="text-muted-foreground">text-muted-foreground</span>
						</div>
						<div
							class="h-16 bg-card rounded-lg border border-border flex items-center justify-center"
						>
							<span class="text-accent font-medium">text-accent</span>
						</div>
					</div>

					<!-- Accent Colors -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							Accent
						</h4>
						<div
							class="h-16 bg-accent rounded-lg flex items-center justify-center shadow-ink"
						>
							<span class="text-sm font-mono text-accent-foreground">bg-accent</span>
						</div>
						<div
							class="h-16 bg-accent/20 rounded-lg border border-accent/30 flex items-center justify-center"
						>
							<span class="text-sm font-mono text-accent">bg-accent/20</span>
						</div>
						<div
							class="h-16 bg-accent/10 rounded-lg border border-accent/20 flex items-center justify-center"
						>
							<span class="text-sm font-mono text-accent">bg-accent/10</span>
						</div>
					</div>

					<!-- State Colors -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							States
						</h4>
						<div
							class="h-16 bg-green-500/10 rounded-lg border border-green-500/30 flex items-center justify-center"
						>
							<span class="text-sm font-mono text-green-600 dark:text-green-400"
								>Success</span
							>
						</div>
						<div
							class="h-16 bg-amber-500/10 rounded-lg border border-amber-500/30 flex items-center justify-center"
						>
							<span class="text-sm font-mono text-amber-600 dark:text-amber-400"
								>Warning</span
							>
						</div>
						<div
							class="h-16 bg-destructive/10 rounded-lg border border-destructive/30 flex items-center justify-center"
						>
							<span class="text-sm font-mono text-destructive">Destructive</span>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Section 2: Texture System -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">2. Texture System</h2>
			<p class="text-muted-foreground mb-6">
				Semantic textures that convey meaning. Each pattern has a specific use case and
				emotional resonance.
			</p>

			<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
				<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
					<!-- Bloom -->
					<div
						class="relative h-32 bg-muted rounded-lg border border-border p-4 tx tx-bloom tx-med"
					>
						<div class="flex items-center gap-2 mb-2">
							<Sparkles class="w-5 h-5 text-accent" />
							<span class="font-semibold text-foreground">tx-bloom</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Ideation, newness, creative expansion
						</p>
					</div>

					<!-- Grain -->
					<div
						class="relative h-32 bg-muted rounded-lg border border-border p-4 tx tx-grain tx-med"
					>
						<div class="flex items-center gap-2 mb-2">
							<Layers class="w-5 h-5 text-accent" />
							<span class="font-semibold text-foreground">tx-grain</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Execution, steady progress, craftsmanship
						</p>
					</div>

					<!-- Pulse -->
					<div
						class="relative h-32 bg-muted rounded-lg border border-border p-4 tx tx-pulse tx-med"
					>
						<div class="flex items-center gap-2 mb-2">
							<Target class="w-5 h-5 text-accent" />
							<span class="font-semibold text-foreground">tx-pulse</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Urgency, sprints, deadlines, momentum
						</p>
					</div>

					<!-- Static -->
					<div
						class="relative h-32 bg-muted rounded-lg border border-border p-4 tx tx-static tx-med"
					>
						<div class="flex items-center gap-2 mb-2">
							<Waves class="w-5 h-5 text-accent" />
							<span class="font-semibold text-foreground">tx-static</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Blockers, noise, overwhelm, risk
						</p>
					</div>

					<!-- Thread -->
					<div
						class="relative h-32 bg-muted rounded-lg border border-border p-4 tx tx-thread tx-med"
					>
						<div class="flex items-center gap-2 mb-2">
							<Link2 class="w-5 h-5 text-accent" />
							<span class="font-semibold text-foreground">tx-thread</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Relationships, collaboration, dependencies
						</p>
					</div>

					<!-- Frame -->
					<div
						class="relative h-32 bg-muted rounded-lg border border-border p-4 tx tx-frame tx-med"
					>
						<div class="flex items-center gap-2 mb-2">
							<Frame class="w-5 h-5 text-accent" />
							<span class="font-semibold text-foreground">tx-frame</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Canon, structure, decisions, officialness
						</p>
					</div>

					<!-- Strip -->
					<div
						class="relative h-32 bg-muted rounded-lg border border-border p-4 tx tx-strip tx-med col-span-full sm:col-span-2 lg:col-span-1"
					>
						<div class="flex items-center gap-2 mb-2">
							<AlignJustify class="w-5 h-5 text-accent" />
							<span class="font-semibold text-foreground">tx-strip</span>
						</div>
						<p class="text-sm text-muted-foreground">
							Header band, separator, printed label strip
						</p>
					</div>
				</div>

				<!-- Intensity Levels -->
				<div class="mt-8 pt-6 border-t border-border">
					<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
						Texture Intensities
					</h4>
					<div class="grid gap-4 sm:grid-cols-3">
						<div
							class="h-20 bg-muted rounded-lg border border-border p-4 tx tx-grain tx-weak flex items-center justify-center"
						>
							<span class="font-mono text-sm text-foreground">tx-weak (0.03)</span>
						</div>
						<div
							class="h-20 bg-muted rounded-lg border border-border p-4 tx tx-grain tx-med flex items-center justify-center"
						>
							<span class="font-mono text-sm text-foreground">tx-med (0.06)</span>
						</div>
						<div
							class="h-20 bg-muted rounded-lg border border-border p-4 tx tx-grain tx-strong flex items-center justify-center"
						>
							<span class="font-mono text-sm text-foreground">tx-strong (0.10)</span>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Section 3: Shadow System -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">3. Shadow System</h2>
			<p class="text-muted-foreground mb-6">
				Subtle, ink-like shadows that provide depth without overwhelming.
			</p>

			<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
				<div class="grid gap-6 sm:grid-cols-3">
					<div
						class="h-24 bg-card rounded-lg border border-border shadow-ink flex items-center justify-center"
					>
						<span class="font-mono text-sm text-foreground">shadow-ink</span>
					</div>
					<div
						class="h-24 bg-card rounded-lg border border-border shadow-ink-strong flex items-center justify-center"
					>
						<span class="font-mono text-sm text-foreground">shadow-ink-strong</span>
					</div>
					<div
						class="h-24 bg-muted rounded-lg border border-border shadow-ink-inner flex items-center justify-center"
					>
						<span class="font-mono text-sm text-foreground">shadow-ink-inner</span>
					</div>
				</div>
			</div>
		</section>

		<!-- Section 4: Button System -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">4. Button System</h2>
			<p class="text-muted-foreground mb-6">
				Tactile buttons with semantic variants and interactive states.
			</p>

			<div class="bg-card rounded-lg border border-border p-6 shadow-ink tx tx-grain tx-weak">
				<div class="grid gap-6 md:grid-cols-3">
					<!-- Primary Actions -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							Primary Actions
						</h4>
						<Button variant="primary" icon={Zap} fullWidth>Process Brain Dump</Button>
						<Button variant="primary" size="lg" fullWidth>Large Primary</Button>
						<Button variant="primary" size="sm" fullWidth>Small Primary</Button>
					</div>

					<!-- Secondary Actions -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							Secondary Actions
						</h4>
						<Button variant="secondary" icon={Save} fullWidth>Save Draft</Button>
						<Button variant="outline" fullWidth>Outline Button</Button>
						<Button variant="ghost" fullWidth>Ghost Button</Button>
					</div>

					<!-- State Variations -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider">
							States & Feedback
						</h4>
						<Button variant="success" icon={Check} fullWidth>Success</Button>
						<Button variant="warning" icon={AlertCircle} fullWidth>Warning</Button>
						<Button variant="danger" icon={X} fullWidth>Danger</Button>
						<Button variant="primary" loading fullWidth>Loading...</Button>
						<Button variant="primary" disabled fullWidth>Disabled</Button>
					</div>
				</div>

				<div class="mt-6 p-4 bg-muted rounded-lg border border-border tx tx-frame tx-weak">
					<p class="text-sm text-muted-foreground">
						<strong class="text-foreground">Tactile Features:</strong> Pressable transform,
						100ms transitions, shadow-ink on elevated states
					</p>
				</div>
			</div>
		</section>

		<!-- Section 5: Form Inputs -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">5. Form Inputs</h2>
			<p class="text-muted-foreground mb-6">
				Clean input fields with proper focus states and error handling.
			</p>

			<div class="grid gap-6 md:grid-cols-2">
				<!-- Text Inputs -->
				<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
					<h3 class="text-lg font-semibold text-foreground mb-4">Text Inputs</h3>
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
				</div>

				<!-- Textarea -->
				<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
					<h3 class="text-lg font-semibold text-foreground mb-4">Textarea</h3>
					<Textarea
						bind:value={textareaValue}
						rows={6}
						placeholder="What's on your mind? Share your thoughts, ideas, and tasks..."
					/>
					<p class="mt-2 text-sm text-muted-foreground">
						Character count: {textareaValue.length}
					</p>
				</div>
			</div>

			<!-- Select -->
			<div class="mt-6 bg-card rounded-lg border border-border p-6 shadow-ink">
				<h3 class="text-lg font-semibold text-foreground mb-4">Select Inputs</h3>
				<div class="grid gap-6 md:grid-cols-2">
					<div>
						<label class="block text-sm font-medium text-muted-foreground mb-2">
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
						<label class="block text-sm font-medium text-muted-foreground mb-2">
							Large Select
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
			</div>
		</section>

		<!-- Section 6: Cards -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">6. Card System</h2>
			<p class="text-muted-foreground mb-6">
				Flexible card components with various styles and texture overlays.
			</p>

			<div class="grid gap-6 md:grid-cols-3">
				<Card variant="default" padding="md">
					<h4 class="font-semibold text-foreground mb-2">Default Card</h4>
					<p class="text-sm text-muted-foreground">
						Basic panel with subtle shadow and card background.
					</p>
				</Card>

				<Card variant="elevated" padding="md" hoverable>
					<h4 class="font-semibold text-foreground mb-2">Elevated + Hoverable</h4>
					<p class="text-sm text-muted-foreground">
						Enhanced shadow depth with hover scale effect.
					</p>
				</Card>

				<Card variant="outline" padding="md">
					<h4 class="font-semibold text-foreground mb-2">Outline Card</h4>
					<p class="text-sm text-muted-foreground">
						Strong border for emphasis and separation.
					</p>
				</Card>
			</div>

			<!-- Card with Texture -->
			<div class="mt-6">
				<div
					class="bg-card rounded-lg border border-border p-6 shadow-ink tx tx-bloom tx-weak"
				>
					<h4 class="font-semibold text-foreground mb-2">Card with Bloom Texture</h4>
					<p class="text-muted-foreground">
						This card has the <code class="code-inline">tx tx-bloom tx-weak</code> texture
						applied, creating a subtle radial halftone effect perfect for creative/ideation
						contexts.
					</p>
				</div>
			</div>
		</section>

		<!-- Section 7: Badges -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">7. Status Badges</h2>
			<p class="text-muted-foreground mb-6">
				Semantic badges for status indicators and labels.
			</p>

			<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
				<div class="flex flex-wrap gap-3 mb-6">
					<Badge variant="info">Info Badge</Badge>
					<Badge variant="success">Success Badge</Badge>
					<Badge variant="warning">Warning Badge</Badge>
					<Badge variant="error">Error Badge</Badge>
					<Badge variant="info" size="lg">Large Badge</Badge>
					<Badge variant="success" size="sm">Small Badge</Badge>
				</div>

				<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
					Custom Status Badges
				</h4>
				<div class="flex flex-wrap gap-3">
					<span
						class="px-3 py-1 text-sm font-medium rounded-full bg-muted text-muted-foreground border border-border"
					>
						Draft
					</span>
					<span
						class="px-3 py-1 text-sm font-medium rounded-full bg-accent text-accent-foreground"
					>
						Active
					</span>
					<span
						class="px-3 py-1 text-sm font-medium rounded-full bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/30"
					>
						Complete
					</span>
					<span
						class="px-3 py-1 text-sm font-medium rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
					>
						In Review
					</span>
				</div>
			</div>
		</section>

		<!-- Section 8: Modal -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">8. Modal System</h2>
			<p class="text-muted-foreground mb-6">
				Modal dialogs with proper backdrop and Inkprint styling.
			</p>

			<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
				<p class="text-muted-foreground mb-4">
					Modals use Inkprint tokens with proper header/footer structure and texture
					overlays.
				</p>
				<Button variant="primary" onclick={() => (showModal = true)}>
					Open Example Modal
				</Button>
			</div>
		</section>

		<!-- Section 9: Typography -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">9. Typography</h2>
			<p class="text-muted-foreground mb-6">
				Font scale and utility classes for consistent typography.
			</p>

			<div class="bg-card rounded-lg border border-border p-6 shadow-ink">
				<div class="space-y-4">
					<div>
						<span class="micro-label">Micro Label</span>
						<span class="ml-4 text-muted-foreground text-sm"
							>— .micro-label (0.65rem, uppercase, tracking-wider)</span
						>
					</div>
					<div>
						<span class="text-sm text-muted-foreground">Small Text</span>
						<span class="ml-4 text-muted-foreground text-sm"
							>— text-sm text-muted-foreground</span
						>
					</div>
					<div>
						<span class="text-base text-foreground">Body Text</span>
						<span class="ml-4 text-muted-foreground text-sm"
							>— text-base text-foreground</span
						>
					</div>
					<div>
						<span class="text-lg font-medium text-foreground">Large Text</span>
						<span class="ml-4 text-muted-foreground text-sm"
							>— text-lg font-medium text-foreground</span
						>
					</div>
					<div>
						<span class="text-xl font-semibold text-foreground">Heading</span>
						<span class="ml-4 text-muted-foreground text-sm"
							>— text-xl font-semibold text-foreground</span
						>
					</div>
					<div>
						<span class="text-2xl font-bold text-foreground">Title</span>
						<span class="ml-4 text-muted-foreground text-sm"
							>— text-2xl font-bold text-foreground</span
						>
					</div>
				</div>

				<div class="mt-6 pt-6 border-t border-border">
					<h4 class="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
						Code Styling
					</h4>
					<p class="text-muted-foreground">
						Inline code uses <code class="code-inline">code-inline</code> class:
						<code class="code-inline">bg-muted text-accent rounded px-1.5 py-0.5</code>
					</p>
				</div>
			</div>
		</section>

		<!-- Section 10: Interactive Demo -->
		<section>
			<h2 class="text-2xl font-bold text-foreground mb-2">10. Interactive Demo</h2>
			<p class="text-muted-foreground mb-6">
				A complete example combining multiple Inkprint elements.
			</p>

			<div
				class="bg-card rounded-lg border border-border shadow-ink-strong overflow-hidden tx tx-frame tx-weak"
			>
				<!-- Header with Strip texture -->
				<div
					class="bg-muted/50 border-b border-border px-6 py-4 tx tx-strip tx-weak flex items-center justify-between"
				>
					<div>
						<p class="micro-label mb-1">New Brain Dump</p>
						<h3 class="text-lg font-semibold text-foreground">Capture Your Thoughts</h3>
					</div>
					<Badge variant="info">Draft</Badge>
				</div>

				<!-- Body with Bloom texture -->
				<div class="p-6 tx tx-bloom tx-weak">
					<Textarea
						bind:value={textareaValue}
						rows={4}
						placeholder="Write freely. The AI will help organize your thoughts..."
					/>

					<div
						class="mt-4 p-4 bg-accent/10 border border-accent/30 rounded-lg tx tx-grain tx-weak"
					>
						<p class="text-sm text-accent flex items-center gap-2">
							<Info class="w-4 h-4" />
							<span>Tip: Be as detailed as possible for better AI processing.</span>
						</p>
					</div>
				</div>

				<!-- Footer with Grain texture -->
				<div
					class="bg-muted/30 border-t border-border px-6 py-4 tx tx-grain tx-weak flex items-center justify-between"
				>
					<span class="text-sm text-muted-foreground">
						{textareaValue.length} characters
					</span>
					<div class="flex gap-3">
						<Button variant="ghost" size="sm">Cancel</Button>
						<Button variant="primary" size="sm" icon={Zap}>Process</Button>
					</div>
				</div>
			</div>
		</section>
	</div>
</div>

<!-- Example Modal -->
<Modal bind:isOpen={showModal} size="md" showCloseButton={false}>
	{#snippet header()}
		<div
			class="bg-muted/50 border-b border-border px-6 py-4 tx tx-strip tx-weak flex items-center justify-between"
		>
			<div>
				<p class="micro-label mb-1">Modal Example</p>
				<h3 class="text-lg font-semibold text-foreground">Inkprint Modal</h3>
			</div>
			<Button variant="ghost" size="sm" onclick={() => (showModal = false)}>
				<X class="w-4 h-4" />
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="p-6 space-y-4">
			<p class="text-muted-foreground">
				This modal demonstrates the Inkprint design system with proper semantic tokens,
				texture overlays, and consistent styling.
			</p>

			<div class="bg-muted rounded-lg border border-border p-4 tx tx-frame tx-weak">
				<p class="text-sm text-muted-foreground">
					<strong class="text-foreground">Texture Applied:</strong> This panel uses
					<code class="code-inline">tx tx-frame tx-weak</code>
					for a subtle grid pattern.
				</p>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="bg-muted/30 border-t border-border px-6 py-4 tx tx-grain tx-weak flex items-center justify-end gap-3"
		>
			<Button variant="ghost" onclick={() => (showModal = false)}>Cancel</Button>
			<Button variant="primary" onclick={() => (showModal = false)}>Confirm</Button>
		</div>
	{/snippet}
</Modal>

<style>
	.code-inline {
		@apply px-1.5 py-0.5 bg-muted text-accent rounded text-sm font-mono;
	}
</style>
