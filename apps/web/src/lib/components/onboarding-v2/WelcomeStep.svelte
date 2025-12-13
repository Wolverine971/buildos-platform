<!-- apps/web/src/lib/components/onboarding-v2/WelcomeStep.svelte -->
<script lang="ts">
	import { Brain, Calendar, MessageSquare, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		onStart: () => void;
	}

	let { onStart }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center min-h-[600px] text-center px-4">
	<!-- Hero video animation with Inkprint styling -->
	<div class="mb-10 relative">
		<!-- Subtle glow effect using Inkprint accent -->
		<div
			class="absolute inset-0 bg-accent/20 blur-3xl opacity-60 animate-pulse"
			style="animation-duration: 3s;"
		></div>
		<!-- Video container with Inkprint styling -->
		<div
			class="relative rounded-2xl bg-card p-4 border border-border shadow-ink-strong tx tx-bloom tx-weak"
		>
			<video
				autoplay
				loop
				muted
				playsinline
				class="w-40 h-40 sm:w-48 sm:h-48 lg:w-56 lg:h-56 object-contain rounded-xl mx-auto"
				aria-label="BuildOS brain animation"
			>
				<source
					src="/onboarding-assets/animations/brain-bolt-consistent-pulse.mp4"
					type="video/mp4"
				/>
				<!-- Fallback for browsers that don't support video -->
				<div
					class="w-40 h-40 sm:w-48 sm:h-48 lg:w-56 lg:h-56 bg-accent rounded-full p-12 shadow-ink-strong flex items-center justify-center mx-auto"
				>
					<Brain class="w-20 h-20 text-accent-foreground" />
				</div>
			</video>
		</div>
	</div>

	<!-- Title and subtitle with Inkprint typography -->
	<h1
		class="text-4xl sm:text-5xl lg:text-6xl font-bold mb-5 text-foreground leading-tight tracking-tight"
	>
		Welcome to BuildOS
	</h1>

	<p
		class="text-lg sm:text-xl lg:text-2xl text-muted-foreground mb-10 max-w-2xl leading-relaxed mx-auto"
	>
		Your AI-first project organization tool. Let's set you up so BuildOS works the way
		<em class="text-accent not-italic font-semibold">you</em> want.
	</p>

	<!-- Philosophy Section - The BuildOS Way with Inkprint styling -->
	<div class="mb-12 max-w-2xl w-full">
		<div
			class="bg-card rounded-2xl p-8 lg:p-10 border border-border shadow-ink tx tx-frame tx-weak transition-shadow duration-300"
		>
			<h3
				class="text-2xl lg:text-3xl font-bold mb-8 text-foreground text-center flex items-center justify-center gap-3"
			>
				<Sparkles class="w-7 h-7 text-accent animate-pulse" />
				The BuildOS Way
			</h3>

			<div class="space-y-6 text-left">
				<!-- Step 1: Clarity -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-accent-foreground font-bold text-lg shadow-ink pressable group-hover:scale-105 transition-transform duration-200"
					>
						1
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-foreground">First, Get Clarity</h4>
						<p class="text-base text-muted-foreground leading-relaxed">
							To get organized and boost productivity, you need <strong
								class="text-foreground">clarity</strong
							>. And to get clarity, you need to offload what's in your head and see
							it on the screen. That's where everything begins.
						</p>
					</div>
				</div>

				<!-- Step 2: Projects -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-accent-foreground font-bold text-lg shadow-ink pressable group-hover:scale-105 transition-transform duration-200"
					>
						2
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-foreground">
							Then, Organize Into Projects
						</h4>
						<p class="text-base text-muted-foreground leading-relaxed mb-3">
							BuildOS works with <strong class="text-foreground">projects</strong> — whether
							that's a work initiative, a personal goal, a creative endeavor, or a life
							milestone.
						</p>
						<p class="text-base text-muted-foreground leading-relaxed">
							Think of projects as focused endeavors with a clear goal or vision. When
							you organize around projects, you create structure that helps you
							actually
							<em class="font-semibold not-italic text-foreground">finish</em> things.
						</p>
					</div>
				</div>

				<!-- Step 3: Focus -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-accent-foreground font-bold text-lg shadow-ink pressable group-hover:scale-105 transition-transform duration-200"
					>
						3
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-foreground">Then, Stay Focused</h4>
						<p class="text-base text-muted-foreground leading-relaxed">
							Clarity and organization mean nothing without follow-through. BuildOS
							helps you maintain <strong class="text-foreground">focus</strong> with smart
							reminders, calendar integration, and daily check-ins.
						</p>
					</div>
				</div>

				<!-- Step 4: Flexibility -->
				<div class="flex gap-5 items-start group">
					<div
						class="flex-shrink-0 w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-accent-foreground font-bold text-lg shadow-ink pressable group-hover:scale-105 transition-transform duration-200"
					>
						4
					</div>
					<div class="flex-1">
						<h4 class="font-bold text-xl mb-3 text-foreground">
							Finally, Stay Flexible
						</h4>
						<p class="text-base text-muted-foreground leading-relaxed">
							Life changes. Priorities shift. BuildOS <strong class="text-foreground"
								>adapts</strong
							> with you. Whether you need to reschedule tasks, regenerate plans, or reorganize
							projects—BuildOS makes it effortless to pivot without losing momentum.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA Button with Inkprint styling -->
	<Button
		variant="primary"
		size="lg"
		onclick={onStart}
		class="px-10 py-4 text-lg font-semibold shadow-ink-strong pressable"
	>
		<span class="flex items-center gap-3">
			Start Setting Up
			<Sparkles class="w-5 h-5 animate-pulse" />
		</span>
	</Button>

	<p class="text-sm text-muted-foreground mt-6 flex items-center justify-center gap-2">
		<span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"></span>
		Takes about 5 minutes
		<span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"></span>
	</p>
</div>
