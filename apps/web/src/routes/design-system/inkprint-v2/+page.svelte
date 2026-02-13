<!-- apps/web/src/routes/design-system/inkprint-v2/+page.svelte -->
<!-- Inkprint v2: PNG Texture Testing Page -->
<script lang="ts">
	// Texture sizing configuration
	type TextureSize = 'cover' | 'repeat';

	const textureSizing: Record<string, TextureSize> = {
		// COVER - Large organic textures that don't tile well
		'stardust.png': 'cover',
		'natural-paper.png': 'cover',
		'snow.png': 'cover',
		'paper.png': 'cover',
		'rice-paper.png': 'cover',
		'shattered.png': 'cover',
		'dark-leather.png': 'cover',
		'leather.png': 'cover',
		'white-linen.png': 'cover',
		'light-paper-fibers.png': 'cover',
		'cardboard.png': 'cover',
		'exclusive-paper.png': 'cover',
		'clean-gray-paper.png': 'cover',

		// REPEAT - Geometric patterns and seamless tiles (default)
		'tiny-grid.png': 'repeat',
		'corrugation.png': 'repeat',
		'connected.png': 'repeat',
		'stressed-linen.png': 'repeat',
		'broken-noise.png': 'repeat',
		'subtle-freckles.png': 'repeat',
		'brushed-alum.png': 'repeat',
		'washi.png': 'repeat',
		'sandpaper.png': 'repeat',
		'noisy.png': 'repeat',
		'woven-light.png': 'repeat',
		'gray-sand.png': 'repeat',
		'grilled-noise.png': 'repeat',
		'elegant-grid.png': 'repeat',
		'cardboard-flat.png': 'repeat',
		'worn-dots.png': 'repeat',
		'cross-scratches.png': 'repeat',
		'egg-shell.png': 'repeat',
		'little-pluses.png': 'repeat', // 300x300 scattered plus signs
		'groovepaper.png': 'repeat', // 300x300 herringbone
		'tactile-noise-dark.png': 'repeat', // 48x48 small tile
		'graphy.png': 'repeat' // 80x160 graph paper
	};

	function getTextureSize(file: string): TextureSize {
		return textureSizing[file] || 'repeat';
	}

	// Semantic textures with PNG files
	// NOTE: Some original textures (stardust, broken-noise) were too subtle
	// Swapped to more visible alternatives based on TEXTURE_CANDIDATES.md
	const semanticTextures = [
		{
			id: 'bloom',
			label: 'Bloom',
			meaning: 'Ideation, newness, creative expansion',
			file: 'little-pluses.png', // Was stardust.png - too subtle
			backup: 'worn-dots.png'
		},
		{
			id: 'grain',
			label: 'Grain',
			meaning: 'Execution, steady progress, craftsmanship',
			file: 'sandpaper.png',
			backup: 'gray-sand.png'
		},
		{
			id: 'pulse',
			label: 'Pulse',
			meaning: 'Urgency, sprints, deadlines, momentum',
			file: 'grilled-noise.png', // Was corrugation.png - too tiny
			backup: 'corrugation.png'
		},
		{
			id: 'static',
			label: 'Static',
			meaning: 'Blockers, noise, overwhelm, risk',
			file: 'noisy.png', // Was broken-noise.png - too subtle
			backup: 'tactile-noise-dark.png'
		},
		{
			id: 'thread',
			label: 'Thread',
			meaning: 'Relationships, collaboration, dependencies',
			file: 'connected.png',
			backup: 'woven-light.png'
		},
		{
			id: 'frame',
			label: 'Frame',
			meaning: 'Canon, structure, decisions, officialness',
			file: 'tiny-grid.png',
			backup: 'graphy.png'
		}
	] as const;

	// Material textures for weight system
	// NOTE: stressed-linen was too subtle, swapped to cardboard-flat
	const materialTextures = [
		{
			weight: 'ghost',
			label: 'Ghost',
			meaning: 'Ephemeral, uncommitted, suggestion',
			material: 'Dust/particles',
			file: 'subtle-freckles.png',
			backup: 'snow.png'
		},
		{
			weight: 'paper',
			label: 'Paper',
			meaning: 'Standard UI, working state',
			material: 'Paper fibers',
			file: 'natural-paper.png',
			backup: 'paper.png'
		},
		{
			weight: 'card',
			label: 'Card',
			meaning: 'Important, elevated, committed',
			material: 'Chipboard',
			file: 'cardboard-flat.png', // Was stressed-linen.png - too subtle
			backup: 'groovepaper.png'
		},
		{
			weight: 'plate',
			label: 'Plate',
			meaning: 'System-critical, immutable',
			material: 'Brushed metal',
			file: 'brushed-alum.png',
			backup: 'dark-leather.png'
		}
	] as const;

	// Additional textures for exploration
	const additionalTextures = [
		{ file: 'washi.png', note: 'Decorative - Japanese sunbursts' },
		{ file: 'leather.png', note: 'Alternative plate material' },
		{ file: 'dark-leather.png', note: 'Rich leather for dark mode' },
		{ file: 'shattered.png', note: 'Dramatic error state' },
		{ file: 'rice-paper.png', note: 'Delicate paper alternative' },
		{ file: 'white-linen.png', note: 'Clean fabric alternative' },
		{ file: 'worn-dots.png', note: 'Halftone print feel' },
		{ file: 'cross-scratches.png', note: 'Etched/scratched feel' }
	];

	// Opacity levels for testing
	const opacities = [
		{ value: 0.3, label: '30%' },
		{ value: 0.4, label: '40%' },
		{ value: 0.5, label: '50%' },
		{ value: 0.6, label: '60%' },
		{ value: 0.7, label: '70%' },
		{ value: 0.8, label: '80%' },
		{ value: 0.9, label: '90%' },
		{ value: 1.0, label: '100%' }
	];

	let selectedOpacity = $state(0.7);
	let showBackup = $state(false);
	let darkModeTest = $state(false);

	// Helper to get texture URL
	function getTextureUrl(file: string) {
		return `url('/textures/${file}')`;
	}

	// Get background styles based on texture sizing
	function getBackgroundSize(file: string): string {
		return getTextureSize(file) === 'cover' ? 'cover' : 'auto';
	}

	function getBackgroundRepeat(file: string): string {
		return getTextureSize(file) === 'cover' ? 'no-repeat' : 'repeat';
	}

	function getBackgroundPosition(file: string): string {
		return getTextureSize(file) === 'cover' ? 'center' : 'initial';
	}
</script>

<svelte:head>
	<title>Inkprint v2: PNG Texture Testing | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background p-4 sm:p-6 lg:p-8" class:dark={darkModeTest}>
	<div class="max-w-7xl mx-auto space-y-8">
		<!-- Header -->
		<header class="space-y-2">
			<div class="flex items-center justify-between flex-wrap gap-4">
				<div>
					<h1 class="text-3xl sm:text-4xl font-bold text-foreground">Inkprint v2</h1>
					<p class="text-lg text-muted-foreground">PNG Texture Testing & Comparison</p>
				</div>
				<div class="flex items-center gap-4">
					<a href="/design-system/inkprint" class="text-sm text-accent hover:underline">
						← View v1 (CSS)
					</a>
				</div>
			</div>
		</header>

		<!-- Raw Texture Preview (Diagnostic) -->
		<section class="bg-card border border-border rounded-lg p-4">
			<h2 class="text-sm font-semibold text-foreground mb-2">Raw Texture Files</h2>
			<p class="text-xs text-muted-foreground mb-3">
				Actual PNG files with sizing info. <span class="text-accent">cover</span> = single
				image, <span class="text-accent">repeat</span> = tiled pattern.
			</p>
			<div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
				{#each semanticTextures as tex}
					<div class="flex flex-col items-center gap-1">
						<div class="w-16 h-16 border border-border rounded overflow-hidden bg-card">
							<img
								src="/textures/{tex.file}"
								alt={tex.id}
								class="w-full h-full"
								class:object-cover={getTextureSize(tex.file) === 'cover'}
								class:object-contain={getTextureSize(tex.file) === 'repeat'}
							/>
						</div>
						<span class="text-[10px] text-muted-foreground text-center">{tex.id}</span>
						<span class="text-[9px] text-accent">{getTextureSize(tex.file)}</span>
					</div>
				{/each}
			</div>
			<div class="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
				{#each materialTextures as mat}
					<div class="flex flex-col items-center gap-1">
						<div class="w-16 h-16 border border-border rounded overflow-hidden bg-card">
							<img
								src="/textures/{mat.file}"
								alt={mat.weight}
								class="w-full h-full"
								class:object-cover={getTextureSize(mat.file) === 'cover'}
								class:object-contain={getTextureSize(mat.file) === 'repeat'}
							/>
						</div>
						<span class="text-[10px] text-muted-foreground text-center"
							>{mat.weight}</span
						>
						<span class="text-[9px] text-accent">{getTextureSize(mat.file)}</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- Controls -->
		<section class="bg-card border border-border rounded-lg p-4">
			<h2 class="text-sm font-semibold text-foreground mb-3">Test Controls</h2>
			<div class="flex flex-wrap gap-4 items-center">
				<div class="flex items-center gap-2">
					<label class="text-sm text-muted-foreground">Opacity:</label>
					<select
						class="px-2 py-1 text-sm bg-background border border-border rounded"
						bind:value={selectedOpacity}
					>
						{#each opacities as op}
							<option value={op.value}>{op.label}</option>
						{/each}
					</select>
					<span class="text-xs text-accent font-mono"
						>{Math.round(selectedOpacity * 100)}%</span
					>
				</div>
				<label class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
					<input type="checkbox" bind:checked={showBackup} class="rounded" />
					Show backup textures
				</label>
				<label class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
					<input type="checkbox" bind:checked={darkModeTest} class="rounded" />
					Test dark mode
				</label>
			</div>
		</section>

		<!-- Semantic Textures -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Semantic Textures (What KIND)</h2>
			<p class="text-sm text-muted-foreground">
				These textures communicate what type of content this is.
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each semanticTextures as texture}
					{@const textureFile = showBackup ? texture.backup : texture.file}
					{@const sizing = getTextureSize(textureFile)}
					<div
						class="relative overflow-hidden rounded-lg border border-border bg-card p-4 min-h-[140px]"
					>
						<!-- PNG Texture Layer -->
						<div
							class="absolute inset-0 pointer-events-none"
							style:background-image={getTextureUrl(textureFile)}
							style:background-size={getBackgroundSize(textureFile)}
							style:background-repeat={getBackgroundRepeat(textureFile)}
							style:background-position={getBackgroundPosition(textureFile)}
							style:background-color={darkModeTest
								? 'rgba(255,255,255,0.15)'
								: 'rgba(0,0,0,0.5)'}
							style:background-blend-mode="multiply"
							style:opacity={selectedOpacity}
							class:mix-blend-overlay={darkModeTest}
						></div>

						<!-- Content -->
						<div class="relative z-10">
							<div class="flex items-center justify-between mb-2">
								<span class="font-mono text-sm font-medium text-foreground">
									tx-{texture.id}
								</span>
								<span class="text-[10px] text-accent font-mono">
									{sizing}
								</span>
							</div>
							<p class="text-sm text-muted-foreground">{texture.meaning}</p>
							<p class="text-[10px] text-muted-foreground mt-1 font-mono">
								{textureFile}
							</p>

							<!-- Sample content -->
							<div class="mt-3 pt-3 border-t border-border/50">
								<p class="text-sm font-medium text-foreground">Sample heading</p>
								<p class="text-xs text-muted-foreground">
									Body text to test readability.
								</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Material Textures for Weight -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Material Textures (How IMPORTANT)</h2>
			<p class="text-sm text-muted-foreground">
				These materials communicate importance: dust → paper → fabric → metal.
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				{#each materialTextures as material}
					{@const textureFile = showBackup ? material.backup : material.file}
					{@const sizing = getTextureSize(textureFile)}
					<div
						class="relative overflow-hidden rounded-lg border border-border bg-card p-4 min-h-[160px]"
					>
						<!-- Material Texture Layer -->
						<div
							class="absolute inset-0 pointer-events-none"
							style:background-image={getTextureUrl(textureFile)}
							style:background-size={getBackgroundSize(textureFile)}
							style:background-repeat={getBackgroundRepeat(textureFile)}
							style:background-position={getBackgroundPosition(textureFile)}
							style:background-color={darkModeTest
								? 'rgba(255,255,255,0.15)'
								: 'rgba(0,0,0,0.5)'}
							style:background-blend-mode="multiply"
							style:opacity={selectedOpacity}
							class:mix-blend-overlay={darkModeTest}
						></div>

						<!-- Content -->
						<div class="relative z-10">
							<div class="flex items-center justify-between mb-1">
								<span class="font-mono text-sm font-medium text-foreground">
									wt-{material.weight}
								</span>
								<span class="text-[10px] text-accent font-mono">{sizing}</span>
							</div>
							<p class="text-xs text-accent font-medium mb-2">{material.material}</p>
							<p class="text-sm text-muted-foreground">{material.meaning}</p>

							<div class="mt-3 pt-3 border-t border-border/50">
								<span class="text-[10px] font-mono text-muted-foreground">
									{textureFile}
								</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Texture × Weight Matrix -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Texture × Weight Combinations</h2>
			<p class="text-sm text-muted-foreground">
				Testing key semantic combinations with PNG textures.
			</p>

			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<!-- AI Suggestion: bloom + ghost -->
				<div
					class="relative overflow-hidden rounded-xl border border-dashed border-border bg-transparent p-4"
				>
					<div
						class="absolute inset-0 pointer-events-none"
						style:background-image={getTextureUrl(
							showBackup ? 'worn-dots.png' : 'little-pluses.png'
						)}
						style:background-size={getBackgroundSize(
							showBackup ? 'worn-dots.png' : 'little-pluses.png'
						)}
						style:background-repeat={getBackgroundRepeat(
							showBackup ? 'worn-dots.png' : 'little-pluses.png'
						)}
						style:background-position={getBackgroundPosition(
							showBackup ? 'worn-dots.png' : 'little-pluses.png'
						)}
						style:background-color={darkModeTest
							? 'rgba(255,255,255,0.15)'
							: 'rgba(0,0,0,0.5)'}
						style:background-blend-mode="multiply"
						style:opacity={selectedOpacity}
						class:mix-blend-overlay={darkModeTest}
					></div>
					<div class="relative z-10">
						<span
							class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
						>
							AI Suggestion
						</span>
						<p class="text-sm font-medium text-foreground mt-1">Add a deadline?</p>
						<p class="text-xs text-muted-foreground mt-0.5">bloom + ghost</p>
					</div>
				</div>

				<!-- Active Task: grain + paper -->
				<div
					class="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-ink"
				>
					<div
						class="absolute inset-0 pointer-events-none"
						style:background-image={getTextureUrl(
							showBackup ? 'gray-sand.png' : 'sandpaper.png'
						)}
						style:background-size={getBackgroundSize(
							showBackup ? 'gray-sand.png' : 'sandpaper.png'
						)}
						style:background-repeat={getBackgroundRepeat(
							showBackup ? 'gray-sand.png' : 'sandpaper.png'
						)}
						style:background-position={getBackgroundPosition(
							showBackup ? 'gray-sand.png' : 'sandpaper.png'
						)}
						style:background-color={darkModeTest
							? 'rgba(255,255,255,0.15)'
							: 'rgba(0,0,0,0.5)'}
						style:background-blend-mode="multiply"
						style:opacity={selectedOpacity}
						class:mix-blend-overlay={darkModeTest}
					></div>
					<div class="relative z-10">
						<span
							class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
						>
							Active Task
						</span>
						<p class="text-sm font-medium text-foreground mt-1">Write documentation</p>
						<p class="text-xs text-muted-foreground mt-0.5">grain + paper</p>
					</div>
				</div>

				<!-- Urgent Deadline: pulse + card -->
				<div
					class="relative overflow-hidden rounded-lg border-[1.5px] border-border bg-card p-4 shadow-ink"
				>
					<div
						class="absolute inset-0 pointer-events-none"
						style:background-image={getTextureUrl(
							showBackup ? 'corrugation.png' : 'grilled-noise.png'
						)}
						style:background-size={getBackgroundSize(
							showBackup ? 'corrugation.png' : 'grilled-noise.png'
						)}
						style:background-repeat={getBackgroundRepeat(
							showBackup ? 'corrugation.png' : 'grilled-noise.png'
						)}
						style:background-position={getBackgroundPosition(
							showBackup ? 'corrugation.png' : 'grilled-noise.png'
						)}
						style:background-color={darkModeTest
							? 'rgba(255,255,255,0.15)'
							: 'rgba(0,0,0,0.5)'}
						style:background-blend-mode="multiply"
						style:opacity={selectedOpacity}
						class:mix-blend-overlay={darkModeTest}
					></div>
					<div class="relative z-10">
						<span
							class="text-[10px] uppercase tracking-wider text-amber-600 font-medium"
						>
							Due Today
						</span>
						<p class="text-sm font-medium text-foreground mt-1">Submit proposal</p>
						<p class="text-xs text-muted-foreground mt-0.5">pulse + card</p>
					</div>
				</div>

				<!-- Error Notice: static + paper -->
				<div
					class="relative overflow-hidden rounded-lg border border-red-500/30 bg-card p-4"
				>
					<div
						class="absolute inset-0 pointer-events-none"
						style:background-image={getTextureUrl(
							showBackup ? 'tactile-noise-dark.png' : 'noisy.png'
						)}
						style:background-size={getBackgroundSize(
							showBackup ? 'tactile-noise-dark.png' : 'noisy.png'
						)}
						style:background-repeat={getBackgroundRepeat(
							showBackup ? 'tactile-noise-dark.png' : 'noisy.png'
						)}
						style:background-position={getBackgroundPosition(
							showBackup ? 'tactile-noise-dark.png' : 'noisy.png'
						)}
						style:background-color={darkModeTest
							? 'rgba(255,255,255,0.15)'
							: 'rgba(0,0,0,0.6)'}
						style:background-blend-mode="multiply"
						style:opacity={selectedOpacity}
						class:mix-blend-overlay={darkModeTest}
					></div>
					<div class="relative z-10">
						<span class="text-[10px] uppercase tracking-wider text-red-600 font-medium">
							Error
						</span>
						<p class="text-sm font-medium text-foreground mt-1">Connection failed</p>
						<p class="text-xs text-muted-foreground mt-0.5">static + paper</p>
					</div>
				</div>

				<!-- Dependency: thread + paper -->
				<div
					class="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-ink"
				>
					<div
						class="absolute inset-0 pointer-events-none"
						style:background-image={getTextureUrl(
							showBackup ? 'woven-light.png' : 'connected.png'
						)}
						style:background-size={getBackgroundSize(
							showBackup ? 'woven-light.png' : 'connected.png'
						)}
						style:background-repeat={getBackgroundRepeat(
							showBackup ? 'woven-light.png' : 'connected.png'
						)}
						style:background-position={getBackgroundPosition(
							showBackup ? 'woven-light.png' : 'connected.png'
						)}
						style:background-color={darkModeTest
							? 'rgba(255,255,255,0.15)'
							: 'rgba(0,0,0,0.5)'}
						style:background-blend-mode="multiply"
						style:opacity={selectedOpacity}
						class:mix-blend-overlay={darkModeTest}
					></div>
					<div class="relative z-10">
						<span
							class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
						>
							Linked
						</span>
						<p class="text-sm font-medium text-foreground mt-1">3 dependencies</p>
						<p class="text-xs text-muted-foreground mt-0.5">thread + paper</p>
					</div>
				</div>

				<!-- System Modal: frame + plate -->
				<div
					class="relative overflow-hidden rounded-md border-2 border-border bg-card p-4 shadow-ink-strong"
				>
					<div
						class="absolute inset-0 pointer-events-none"
						style:background-image={getTextureUrl(
							showBackup ? 'graphy.png' : 'tiny-grid.png'
						)}
						style:background-size={getBackgroundSize(
							showBackup ? 'graphy.png' : 'tiny-grid.png'
						)}
						style:background-repeat={getBackgroundRepeat(
							showBackup ? 'graphy.png' : 'tiny-grid.png'
						)}
						style:background-position={getBackgroundPosition(
							showBackup ? 'graphy.png' : 'tiny-grid.png'
						)}
						style:background-color={darkModeTest
							? 'rgba(255,255,255,0.15)'
							: 'rgba(0,0,0,0.5)'}
						style:background-blend-mode="multiply"
						style:opacity={selectedOpacity}
						class:mix-blend-overlay={darkModeTest}
					></div>
					<div class="relative z-10">
						<span
							class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
						>
							Confirm
						</span>
						<p class="text-sm font-medium text-foreground mt-1">Delete project?</p>
						<p class="text-xs text-muted-foreground mt-0.5">frame + plate</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Additional Textures Gallery -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">Additional Textures</h2>
			<p class="text-sm text-muted-foreground">
				Other textures available for special use cases.
			</p>

			<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
				{#each additionalTextures as tex}
					{@const sizing = getTextureSize(tex.file)}
					<div
						class="relative overflow-hidden rounded-lg border border-border bg-card p-3 min-h-[80px]"
					>
						<div
							class="absolute inset-0 pointer-events-none"
							style:background-image={getTextureUrl(tex.file)}
							style:background-size={getBackgroundSize(tex.file)}
							style:background-repeat={getBackgroundRepeat(tex.file)}
							style:background-position={getBackgroundPosition(tex.file)}
							style:background-color={darkModeTest
								? 'rgba(255,255,255,0.15)'
								: 'rgba(0,0,0,0.5)'}
							style:background-blend-mode="multiply"
							style:opacity={selectedOpacity}
							class:mix-blend-overlay={darkModeTest}
						></div>
						<div class="relative z-10">
							<span class="text-xs font-mono text-foreground">{tex.file}</span>
							<span class="text-[9px] text-accent ml-2">{sizing}</span>
							<p class="text-[10px] text-muted-foreground mt-1">{tex.note}</p>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- CSS vs PNG Comparison -->
		<section class="space-y-4">
			<h2 class="text-xl font-semibold text-foreground">CSS vs PNG Comparison</h2>
			<p class="text-sm text-muted-foreground">
				Side-by-side comparison of current CSS patterns vs new PNG textures.
			</p>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- CSS Version -->
				<div class="space-y-3">
					<h3 class="text-sm font-medium text-muted-foreground">
						Current (CSS Patterns)
					</h3>

					<div class="wt-paper p-4 tx tx-bloom tx-weak">
						<p class="text-sm font-medium text-foreground">Bloom (CSS)</p>
						<p class="text-xs text-muted-foreground">Radial gradient dots</p>
					</div>

					<div class="wt-paper p-4 tx tx-grain tx-weak">
						<p class="text-sm font-medium text-foreground">Grain (CSS)</p>
						<p class="text-xs text-muted-foreground">45° diagonal lines</p>
					</div>

					<div class="wt-paper p-4 tx tx-frame tx-weak">
						<p class="text-sm font-medium text-foreground">Frame (CSS)</p>
						<p class="text-xs text-muted-foreground">12px grid lines</p>
					</div>
				</div>

				<!-- PNG Version -->
				<div class="space-y-3">
					<h3 class="text-sm font-medium text-muted-foreground">
						Proposed (PNG Textures) - {Math.round(selectedOpacity * 100)}%
					</h3>

					<div
						class="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-ink"
					>
						<div
							class="absolute inset-0 pointer-events-none"
							style:background-image={getTextureUrl('little-pluses.png')}
							style:background-size="auto"
							style:background-repeat="repeat"
							style:background-color={darkModeTest
								? 'rgba(255,255,255,0.15)'
								: 'rgba(0,0,0,0.5)'}
							style:background-blend-mode="multiply"
							style:opacity={selectedOpacity}
							class:mix-blend-overlay={darkModeTest}
						></div>
						<div class="relative z-10">
							<p class="text-sm font-medium text-foreground">Bloom (PNG)</p>
							<p class="text-xs text-muted-foreground">little-pluses.png - repeat</p>
						</div>
					</div>

					<div
						class="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-ink"
					>
						<div
							class="absolute inset-0 pointer-events-none"
							style:background-image={getTextureUrl('sandpaper.png')}
							style:background-size="auto"
							style:background-repeat="repeat"
							style:background-color={darkModeTest
								? 'rgba(255,255,255,0.15)'
								: 'rgba(0,0,0,0.5)'}
							style:background-blend-mode="multiply"
							style:opacity={selectedOpacity}
							class:mix-blend-overlay={darkModeTest}
						></div>
						<div class="relative z-10">
							<p class="text-sm font-medium text-foreground">Grain (PNG)</p>
							<p class="text-xs text-muted-foreground">sandpaper.png - repeat</p>
						</div>
					</div>

					<div
						class="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-ink"
					>
						<div
							class="absolute inset-0 pointer-events-none"
							style:background-image={getTextureUrl('tiny-grid.png')}
							style:background-size="auto"
							style:background-repeat="repeat"
							style:background-color={darkModeTest
								? 'rgba(255,255,255,0.15)'
								: 'rgba(0,0,0,0.5)'}
							style:background-blend-mode="multiply"
							style:opacity={selectedOpacity}
							class:mix-blend-overlay={darkModeTest}
						></div>
						<div class="relative z-10">
							<p class="text-sm font-medium text-foreground">Frame (PNG)</p>
							<p class="text-xs text-muted-foreground">tiny-grid.png - repeat</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Implementation Note -->
		<section class="bg-card border border-border rounded-lg p-4">
			<h2 class="text-sm font-semibold text-foreground mb-2">Implementation Notes</h2>
			<ul class="text-sm text-muted-foreground space-y-1">
				<li>
					• Textures use <code class="text-xs bg-muted px-1 rounded"
						>background-blend-mode: multiply</code
					> with a dark tint
				</li>
				<li>
					• Large organic textures (stardust, natural-paper, snow) use <code
						class="text-xs bg-muted px-1 rounded">background-size: cover</code
					>
				</li>
				<li>
					• Geometric patterns (tiny-grid, connected, corrugation) use <code
						class="text-xs bg-muted px-1 rounded">background-repeat: repeat</code
					>
				</li>
				<li>
					• Recommended opacity: <code class="text-xs bg-muted px-1 rounded">0.6-0.8</code
					> for visible texture
				</li>
				<li>
					• Dark mode: Use <code class="text-xs bg-muted px-1 rounded"
						>mix-blend-mode: overlay</code
					> with lighter tint
				</li>
				<li>
					• All textures from <a
						href="https://transparenttextures.com"
						class="text-accent hover:underline">TransparentTextures.com</a
					>
				</li>
			</ul>
		</section>

		<!-- Footer -->
		<footer class="pt-8 border-t border-border">
			<p class="text-sm text-muted-foreground">
				Inkprint v2 Texture Testing — See
				<a href="/design-system/inkprint" class="text-accent hover:underline">v1 (CSS)</a>
				for comparison
			</p>
		</footer>
	</div>
</div>

<style>
	/* Ensure dark mode test works within the component */
	.dark {
		--background: 240 10% 6%;
		--foreground: 40 10% 92%;
		--card: 240 10% 10%;
		--muted: 240 10% 14%;
		--muted-foreground: 40 5% 55%;
		--border: 240 10% 18%;
		--accent: 24 85% 58%;
		color-scheme: dark;
	}

	.dark .bg-background {
		background-color: hsl(240 10% 6%);
	}

	.dark .bg-card {
		background-color: hsl(240 10% 10%);
	}

	.dark .text-foreground {
		color: hsl(40 10% 92%);
	}

	.dark .text-muted-foreground {
		color: hsl(40 5% 55%);
	}

	.dark .border-border {
		border-color: hsl(240 10% 18%);
	}
</style>
