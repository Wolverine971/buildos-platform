<!-- apps/web/src/routes/marketing-assets/+page.svelte -->
<script lang="ts">
	import {
		ArrowDown,
		ArrowUpRight,
		Check,
		Copy,
		Download,
		FileArchive,
		Layers,
		Play
	} from '$lib/icons/lucide';
	import manifest from '$lib/marketing/assets.json';

	type Asset = (typeof manifest.assets)[number];
	type Category = 'all' | 'logos' | 'social' | 'elements' | 'motion';
	let category = $state<Category>('all');
	let logoTheme = $state('paper');
	let bannerTheme = $state('ink');
	let bannerKind = $state('profile');
	let disruptedTheme = $state('paper');
	let status = $state('');
	const tabs: { id: Category; label: string }[] = [
		{ id: 'all', label: 'Full collection' },
		{ id: 'logos', label: 'Logo system' },
		{ id: 'social', label: 'Social & covers' },
		{ id: 'elements', label: 'Separated elements' },
		{ id: 'motion', label: 'Motion' }
	];
	const getAsset = (id: string) => manifest.assets.find((asset) => asset.id === id)!;
	let logos = $derived(
		['lockup-horizontal', 'lockup-stacked', 'wordmark'].map((id) =>
			getAsset(`${id}-${logoTheme}`)
		)
	);
	let banner = $derived(getAsset(`linkedin-${bannerKind}-${bannerTheme}`));
	let disrupted = $derived(getAsset(`disrupted-${disruptedTheme}`));
	const social = manifest.assets.filter(
		(asset) => asset.category === 'social' && !asset.id.startsWith('linkedin')
	);
	let elements = $derived(
		manifest.assets.filter(
			(asset) => asset.category === 'elements' && !asset.id.endsWith('-ink')
		)
	);
	const motion = manifest.assets.filter((asset) => asset.category === 'motion');
	const colors = [
		{ name: 'Signal', hex: '#F97316' },
		{ name: 'Ink', hex: '#18181B' },
		{ name: 'Paper', hex: '#FAF9F6' },
		{ name: 'Deep orange', hex: '#B85214' }
	];
	const formatBytes = (bytes: number) =>
		bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
	const visible = (id: Category) => category === 'all' || category === id;

	async function copy(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			status = `${label} copied.`;
		} catch {
			status = `Copy unavailable. Select and copy: ${value}`;
		}
	}
</script>

<svelte:head>
	<title>Marketing assets · BuildOS</title>
	<meta
		name="description"
		content="The BuildOS brand toolkit. Download Brainbolt logos, LinkedIn banners, social graphics, separated brand elements, and animation loops."
	/>
</svelte:head>

{#snippet downloads(asset: Asset)}
	<div class="downloads">
		{#each asset.files as file (file.url)}
			<a
				href={file.url}
				download
				aria-label={`Download ${asset.name} as ${file.label}`}
				title={`${file.label} · ${formatBytes(file.bytes)}`}
			>
				<Download size={14} aria-hidden="true" />
				{file.label}
			</a>
		{/each}
	</div>
{/snippet}

{#snippet assetCard(asset: Asset, compact = false)}
	<article class:compact class="asset-card">
		<div
			class="asset-preview"
			class:ink={asset.theme === 'ink'}
			class:checker={asset.transparent}
		>
			<img
				src={asset.preview}
				alt={asset.name}
				width={asset.width}
				height={asset.height}
				loading="lazy"
				decoding="async"
			/>
			{#if asset.transparent}<span class="preview-label">Transparent</span>{/if}
		</div>
		<div class="asset-info">
			<div>
				<h3>{asset.name}</h3>
				<p class="dimensions">{asset.width} × {asset.height}</p>
			</div>
			{@render downloads(asset)}
		</div>
	</article>
{/snippet}

<div class="brand-studio">
	<header class="studio-heading">
		<div>
			<p class="eyebrow"><span class="signal-dot"></span> BuildOS / Brand toolkit</p>
			<h1>Marketing assets<span>.</span></h1>
			<p class="intro">
				One identity. All the pieces.<br />Logos, social covers, and a little electricity.
			</p>
		</div>
		<div class="package-action">
			<a class="primary-button" href={manifest.archive.url} download
				><FileArchive size={18} aria-hidden="true" /> Download full kit <ArrowDown
					size={17}
					aria-hidden="true"
				/></a
			>
			<p>
				{manifest.archive.fileCount} files · {formatBytes(manifest.archive.bytes)} · PNG, SVG
				& video
			</p>
		</div>
	</header>

	<div class="collection-cover">
		<div class="cover-main">
			<span class="cover-note">THINKING, WITH A PLACE TO GO.</span>
			<img
				src="/marketing-assets/lockup-horizontal-ink.webp"
				alt="BuildOS electric Brainbolt with the BuildOS wordmark"
				width="1600"
				height="480"
				fetchpriority="high"
			/>
			<div class="cover-bottom">
				<span>Turn messy thinking into structured work.</span><span class="cover-index"
					>IDENTITY / 01</span
				>
			</div>
		</div>
		<a class="cover-parts" href="#separated" onclick={() => (category = 'all')}>
			<div class="parts-top">
				<span class="eyebrow">Made of possibility</span><ArrowUpRight
					size={20}
					aria-hidden="true"
				/>
			</div>
			<div class="parts-art" aria-hidden="true">
				<span class="build-piece">Build</span><img
					src="/brain-bolt.webp"
					alt=""
					width="120"
					height="120"
				/><span class="os-piece">OS</span><i class="guide guide-one"></i><i
					class="guide guide-two"
				></i>
			</div>
			<div class="parts-bottom">
				<Layers size={17} aria-hidden="true" /><span>Take the brand apart</span>
			</div>
		</a>
	</div>

	<nav class="collection-nav" aria-label="Asset categories">
		{#each tabs as tab (tab.id)}
			<button
				class:active={category === tab.id}
				aria-pressed={category === tab.id}
				onclick={() => (category = tab.id)}>{tab.label}</button
			>
		{/each}
		<a href="/marketing-assets/README.md" download class="guide-link"
			>Usage guide <ArrowUpRight size={15} aria-hidden="true" /></a
		>
	</nav>

	{#if visible('logos')}
		<section class="collection-section" aria-labelledby="logos-title">
			<div class="section-heading">
				<div>
					<p class="eyebrow">01 / The signature</p>
					<h2 id="logos-title">The logo system</h2>
					<p>The Brainbolt and wordmark, together or on their own.</p>
				</div>
				<div class="segmented" aria-label="Logo lettering color">
					<button
						class:selected={logoTheme === 'paper'}
						aria-pressed={logoTheme === 'paper'}
						onclick={() => (logoTheme = 'paper')}>On paper</button
					><button
						class:selected={logoTheme === 'ink'}
						aria-pressed={logoTheme === 'ink'}
						onclick={() => (logoTheme = 'ink')}>On ink</button
					>
				</div>
			</div>
			<div class="asset-grid logo-grid">
				{#each logos as asset (asset.id)}{@render assetCard(asset)}{/each}
			</div>
			<div class="section-footnote">
				<span
					>Clear space: at least ¼ of the Brainbolt width on every side. Keep proportions
					intact.</span
				><a href="/marketing-assets/lockup-outline.png" download
					>Get the outline lockup <Download size={14} aria-hidden="true" /></a
				>
			</div>
		</section>
	{/if}

	{#if visible('social')}
		<section class="collection-section" aria-labelledby="social-title">
			<div class="section-heading">
				<div>
					<p class="eyebrow">02 / Out in the world</p>
					<h2 id="social-title">Ready for your next post</h2>
					<p>Finished artwork, sized for the places you show up.</p>
				</div>
				<span class="section-tag">Upload-ready PNGs</span>
			</div>
			<article class="banner-card">
				<div class="banner-toolbar">
					<h3>LinkedIn cover</h3>
					<div class="banner-options">
						<label
							>Placement <select bind:value={bannerKind}
								><option value="profile">Personal profile</option><option
									value="company">Company page</option
								></select
							></label
						>
						<div class="segmented small" aria-label="Banner background">
							<button
								class:selected={bannerTheme === 'paper'}
								aria-pressed={bannerTheme === 'paper'}
								onclick={() => (bannerTheme = 'paper')}>Paper</button
							><button
								class:selected={bannerTheme === 'ink'}
								aria-pressed={bannerTheme === 'ink'}
								onclick={() => (bannerTheme = 'ink')}>Ink</button
							>
						</div>
					</div>
				</div>
				<img
					class="banner-image"
					src={banner.preview}
					alt={banner.name}
					width={banner.width}
					height={banner.height}
					loading="lazy"
				/>
				<div class="asset-info">
					<div>
						<p class="dimensions">
							{banner.width} × {banner.height} · {formatBytes(banner.files[0]!.bytes)}
						</p>
						<p class="asset-description">{banner.description}</p>
					</div>
					{@render downloads(banner)}
				</div>
			</article>
			<div class="asset-grid social-grid">
				{#each social as asset (asset.id)}{@render assetCard(asset, true)}{/each}
			</div>
			<p class="quiet-note">
				Preview the crop before applying a cover. <a
					href="https://www.linkedin.com/help/linkedin/answer/a568217/add-or-change-the-background-photo-on-your-profile"
					target="_blank"
					rel="noreferrer"
					>LinkedIn profile image guidance <ArrowUpRight
						size={12}
						aria-hidden="true"
					/></a
				>
			</p>
		</section>
	{/if}

	{#if visible('elements')}
		<section id="separated" class="collection-section" aria-labelledby="separated-title">
			<div class="section-heading">
				<div>
					<p class="eyebrow">03 / Deconstructed</p>
					<h2 id="separated-title">A little disruption.</h2>
					<p>Build. Brainbolt. OS. Give every piece room to think.</p>
				</div>
				<div class="segmented" aria-label="Disrupted composition background">
					<button
						class:selected={disruptedTheme === 'paper'}
						aria-pressed={disruptedTheme === 'paper'}
						onclick={() => (disruptedTheme = 'paper')}>Paper</button
					><button
						class:selected={disruptedTheme === 'ink'}
						aria-pressed={disruptedTheme === 'ink'}
						onclick={() => (disruptedTheme = 'ink')}>Ink</button
					>
				</div>
			</div>
			<article class="disrupted-card">
				<img
					src={disrupted.preview}
					alt="Exploded BuildOS identity: Build lettering, electric Brainbolt, and orange OS, separated with construction guides"
					width="1920"
					height="1080"
					loading="lazy"
				/>
				<div class="asset-info">
					<div>
						<h3>The disrupted composition</h3>
						<p class="dimensions">1920 × 1080 · Individual layers in the SVG</p>
					</div>
					{@render downloads(disrupted)}
				</div>
			</article>
			<div class="elements-heading">
				<h3>The individual pieces</h3>
				<span>Transparent marks + original blueprint studies</span>
			</div>
			<div class="asset-grid elements-grid">
				{#each elements as asset (asset.id)}{@render assetCard(asset, true)}{/each}
			</div>
			<p class="quiet-note">
				Need light Build lettering for a dark composition? <a
					href="/marketing-assets/build-ink.png"
					download>Download light Build PNG <Download size={12} aria-hidden="true" /></a
				>
				<a href="/marketing-assets/build-ink.svg" download
					>SVG <Download size={12} aria-hidden="true" /></a
				>
			</p>
		</section>
	{/if}

	{#if visible('motion')}
		<section class="collection-section" aria-labelledby="motion-title">
			<div class="section-heading">
				<div>
					<p class="eyebrow">04 / A live wire</p>
					<h2 id="motion-title">The Brainbolt in motion</h2>
					<p>Three existing loops. A spark, a steady rhythm, a pulse.</p>
				</div>
				<span class="section-tag"
					><Play size={13} aria-hidden="true" /> Press play to preview</span
				>
			</div>
			<div class="asset-grid motion-grid">
				{#each motion as asset (asset.id)}
					<article class="motion-card">
						<div class="video-stage">
							<video
								controls
								loop
								muted
								playsinline
								preload="none"
								poster={asset.preview}
								aria-label={`${asset.name} Brainbolt animation preview`}
							>
								{#each asset.files as file (file.url)}
									<source
										src={file.url}
										type={file.url.endsWith('.webm')
											? 'video/webm'
											: 'video/mp4'}
									/>
								{/each}
								<track kind="captions" />Your browser cannot preview this loop.
								Download the MP4 below.</video
							>
						</div>
						<div class="motion-info">
							<h3>{asset.name}</h3>
							<p>{asset.description}</p>
							{@render downloads(asset)}
						</div>
					</article>
				{/each}
			</div>
			<p class="quiet-note">
				WebM includes transparency in compatible editors and browsers. MP4 retains its
				original background. Previews stay paused until you play them.
			</p>
		</section>
	{/if}

	{#if category === 'all'}
		<section class="collection-section essentials" aria-labelledby="essentials-title">
			<div class="section-heading">
				<div>
					<p class="eyebrow">05 / Keep it BuildOS</p>
					<h2 id="essentials-title">The essentials</h2>
				</div>
				<a class="text-link" href="/marketing-assets/README.md" download
					>Download usage notes <Download size={15} aria-hidden="true" /></a
				>
			</div>
			<div class="essentials-grid">
				<div>
					<h3>Color, with a purpose.</h3>
					<div class="swatches">
						{#each colors as color (color.hex)}<button
								onclick={() => copy(color.hex, color.name)}
								aria-label={`Copy ${color.name} ${color.hex}`}
								><span class="swatch" style:background={color.hex}></span><span
									class="swatch-name">{color.name}</span
								><span class="swatch-value"
									>{color.hex} <Copy size={12} aria-hidden="true" /></span
								></button
							>{/each}
					</div>
					<p class="quiet-note">
						Signal orange for the identity. Deep orange for small text on paper.
					</p>
				</div>
				<div class="message-card">
					<p class="eyebrow">The promise</p>
					<blockquote>Turn messy thinking<br />into structured work.</blockquote>
					<button
						class="text-link"
						onclick={() =>
							copy('Turn messy thinking into structured work.', 'Brand promise')}
						><Copy size={14} aria-hidden="true" /> Copy the line</button
					>
					<p>
						BuildOS is a thinking environment for people making complex things. The
						project remembers what matters.
					</p>
				</div>
			</div>
			<p class="format-note">
				<Check size={16} aria-hidden="true" /><span
					>PNG for ready-to-use artwork. SVG for editable compositions with embedded
					Brainbolt images and live text. These are not fully vector masters.</span
				>
			</p>
		</section>
	{/if}
	<div class="studio-footer">
		<span>BuildOS / Made for making complex things.</span><a
			href={manifest.archive.url}
			download>Everything, in one ZIP <ArrowDown size={16} aria-hidden="true" /></a
		>
	</div>
	<div class="copy-status" role="status" class:shown={status !== ''}>
		{status}{#if status}<button onclick={() => (status = '')} aria-label="Dismiss copy status"
				>×</button
			>{/if}
	</div>
</div>

<style>
	.brand-studio {
		max-width: 1328px;
		margin: 0 auto;
		padding: 3.5rem 2rem 0;
		color: hsl(var(--foreground));
	}
	.studio-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		margin-bottom: 2.5rem;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font:
			500 0.75rem/1.5 ui-monospace,
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: hsl(var(--muted-foreground));
	}
	.signal-dot {
		width: 7px;
		height: 7px;
		background: #f97316;
		border-radius: 50%;
	}
	h1 {
		font-size: clamp(2.5rem, 5vw, 4.4rem);
		line-height: 1.08;
		font-weight: 750;
		letter-spacing: -0.065em;
		margin: 1rem 0;
	}
	h1 span {
		color: #f97316;
	}
	.intro {
		color: hsl(var(--muted-foreground));
		font-size: 1.05rem;
		line-height: 1.65;
	}
	.package-action {
		padding-bottom: 0.3rem;
		flex-shrink: 0;
	}
	.primary-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.85rem;
		padding: 1rem 1.2rem;
		background: hsl(var(--foreground));
		color: hsl(var(--background));
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 650;
		transition: background 0.15s;
	}
	.primary-button:hover {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}
	.package-action p {
		margin-top: 0.75rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}
	.collection-cover {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1rem;
	}
	.cover-main {
		background-color: #18181b;
		color: #faf9f6;
		padding: 1.75rem 2rem;
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 340px;
		background-image: radial-gradient(#ffffff12 0.7px, transparent 0.7px);
		background-size: 8px 8px;
		overflow: hidden;
	}
	.cover-note,
	.cover-index {
		font:
			500 0.7rem/1.5 ui-monospace,
			monospace;
		letter-spacing: 0.12em;
		color: #a8a5a0;
	}
	.cover-main > img {
		width: 100%;
		height: 205px;
		object-fit: contain;
		margin: 0.7rem 0;
	}
	.cover-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.8125rem;
		color: #d6d3ce;
	}
	.cover-parts {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		background: #efede7;
		color: #18181b;
		padding: 1.75rem;
		border: 1px solid #dfdcd4;
		border-radius: 8px;
		overflow: hidden;
	}
	.parts-top,
	.parts-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.parts-top .eyebrow {
		color: #65615b;
	}
	.parts-bottom {
		justify-content: flex-start;
		font-size: 0.85rem;
	}
	.parts-art {
		position: relative;
		height: 206px;
	}
	.parts-art > span {
		position: absolute;
		font-size: 3.7rem;
		line-height: 1;
		font-weight: 850;
		letter-spacing: -0.07em;
	}
	.build-piece {
		top: 28px;
		left: 0;
		transform: rotate(-8deg);
	}
	.os-piece {
		bottom: 26px;
		right: 7px;
		color: #bd5612;
		transform: rotate(10deg);
	}
	.parts-art img {
		position: absolute;
		width: 105px;
		height: 105px;
		object-fit: contain;
		top: 72px;
		left: 35%;
		transform: rotate(9deg);
	}
	.guide {
		position: absolute;
		border-top: 1px dashed #a8a098;
		width: 150%;
		left: -25%;
		transform: rotate(-12deg);
		pointer-events: none;
	}
	.guide-one {
		top: 78px;
	}
	.guide-two {
		top: 162px;
	}
	.collection-nav {
		display: flex;
		align-items: center;
		gap: 1.6rem;
		border-bottom: 1px solid hsl(var(--border));
		margin-top: 2rem;
		overflow-x: auto;
	}
	.collection-nav button {
		position: relative;
		white-space: nowrap;
		padding: 1.1rem 0;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		font-weight: 550;
		min-height: 48px;
	}
	.collection-nav button.active {
		color: hsl(var(--foreground));
	}
	.collection-nav button.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		height: 2px;
		background: #f97316;
		left: 0;
		right: 0;
	}
	.guide-link {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: auto;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
	}
	.collection-section {
		padding: 3rem 0;
		border-bottom: 1px solid hsl(var(--border));
		scroll-margin-top: 100px;
	}
	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}
	h2 {
		font-size: clamp(1.65rem, 3vw, 2.2rem);
		font-weight: 650;
		letter-spacing: -0.045em;
		margin: 0.4rem 0;
		line-height: 1.2;
	}
	.section-heading > div > p:last-child:not(.eyebrow) {
		color: hsl(var(--muted-foreground));
		font-size: 0.9375rem;
		line-height: 1.65;
	}
	.segmented {
		display: flex;
		gap: 3px;
		background: hsl(var(--muted));
		padding: 3px;
		border-radius: 6px;
		flex-shrink: 0;
	}
	.segmented button {
		padding: 0.6rem 0.8rem;
		font-size: 0.8125rem;
		border-radius: 4px;
		color: hsl(var(--muted-foreground));
		min-height: 38px;
	}
	.segmented button.selected {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		box-shadow: 0 1px 3px #00000015;
	}
	.asset-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.asset-card,
	.banner-card,
	.disrupted-card,
	.motion-card {
		overflow: hidden;
		border: 1px solid hsl(var(--border));
		border-radius: 7px;
		min-width: 0;
		background: hsl(var(--background));
	}
	.asset-preview {
		position: relative;
		height: 235px;
		padding: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f4f2ed;
	}
	.asset-preview.ink {
		background: #222225;
	}
	.asset-preview.checker {
		background-image:
			linear-gradient(45deg, #80808006 25%, transparent 25%),
			linear-gradient(-45deg, #80808006 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #80808006 75%),
			linear-gradient(-45deg, transparent 75%, #80808006 75%);
		background-size: 20px 20px;
		background-position:
			0 0,
			0 10px,
			10px -10px,
			-10px 0;
	}
	.asset-preview img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.preview-label {
		position: absolute;
		left: 1rem;
		top: 0.85rem;
		font:
			500 0.65rem ui-monospace,
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: #716d67;
	}
	.ink .preview-label {
		color: #aaa6a0;
	}
	.asset-info {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem 1.1rem;
	}
	h3 {
		font-size: 0.9375rem;
		font-weight: 650;
		letter-spacing: -0.015em;
		line-height: 1.45;
	}
	.dimensions {
		font:
			400 0.75rem/1.5 ui-monospace,
			monospace;
		color: hsl(var(--muted-foreground));
		margin-top: 0.2rem;
	}
	.downloads {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.downloads a {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 36px;
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		padding: 0.35rem 0.55rem;
		font-size: 0.75rem;
		font-weight: 550;
	}
	.downloads a:hover {
		border-color: hsl(var(--foreground));
		background: hsl(var(--muted));
	}
	.section-footnote {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 1rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.section-footnote a,
	.quiet-note a,
	.text-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8125rem;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.section-tag {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: hsl(var(--muted-foreground));
		font:
			400 0.75rem/1.5 ui-monospace,
			monospace;
		white-space: nowrap;
	}
	.banner-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.1rem;
		gap: 1rem;
	}
	.banner-options {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.banner-options label {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
	select {
		border: 1px solid hsl(var(--border-strong));
		border-radius: 4px;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		padding: 0.4rem 2rem 0.4rem 0.6rem;
	}
	.banner-image {
		width: 100%;
		height: auto;
		display: block;
	}
	.asset-description {
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		margin-top: 0.3rem;
	}
	.social-grid {
		margin-top: 1rem;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.social-grid .asset-preview {
		padding: 1.25rem;
		height: 300px;
	}
	.quiet-note {
		font-size: 0.75rem;
		line-height: 1.7;
		color: hsl(var(--muted-foreground));
		margin-top: 1rem;
	}
	.quiet-note a {
		font-size: inherit;
	}
	.disrupted-card > img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 540px;
		object-fit: cover;
	}
	.elements-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin: 2rem 0 1rem;
	}
	.elements-heading span {
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
	}
	.elements-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.compact .asset-preview {
		height: 220px;
	}
	.video-stage {
		padding: 1.5rem;
		background: #18181b;
	}
	video {
		display: block;
		width: 100%;
		height: 235px;
		object-fit: contain;
	}
	.motion-info {
		padding: 1.2rem;
	}
	.motion-info > p {
		min-height: 3rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		line-height: 1.6;
		margin: 0.5rem 0 1rem;
	}
	.essentials-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3rem;
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
		margin-top: 1.25rem;
	}
	.swatches button {
		text-align: left;
		min-width: 0;
	}
	.swatch {
		display: block;
		width: 100%;
		height: 86px;
		border: 1px solid #80808040;
		border-radius: 4px;
		margin-bottom: 0.7rem;
	}
	.swatch-name {
		display: block;
		font-size: 0.8125rem;
		font-weight: 550;
	}
	.swatch-value {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.2rem;
		color: hsl(var(--muted-foreground));
		font:
			400 0.7rem/1.5 ui-monospace,
			monospace;
	}
	.message-card {
		border-left: 1px solid hsl(var(--border));
		padding-left: 3rem;
	}
	blockquote {
		margin: 0.7rem 0 1rem;
		font-size: clamp(1.45rem, 2.5vw, 2rem);
		line-height: 1.2;
		font-weight: 600;
		letter-spacing: -0.04em;
	}
	.message-card > p:last-child {
		margin-top: 1.3rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		line-height: 1.65;
	}
	.format-note {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		margin-top: 2rem;
		font-size: 0.75rem;
		line-height: 1.7;
		color: hsl(var(--muted-foreground));
	}
	.format-note :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.studio-footer {
		padding: 1.5rem 0 2rem;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
	}
	.studio-footer a {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.copy-status {
		display: none;
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		max-width: calc(100vw - 2rem);
		background: hsl(var(--foreground));
		color: hsl(var(--background));
		padding: 0.8rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		z-index: 80;
		box-shadow: 0 4px 20px #0003;
	}
	.copy-status.shown {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.copy-status button {
		font-size: 1.5rem;
	}
	button:focus-visible,
	a:focus-visible,
	select:focus-visible {
		outline: 2px solid hsl(var(--accent));
		outline-offset: 4px;
	}
	@media (min-width: 1000px) {
		.logo-grid .asset-card:first-child {
			grid-column: span 1;
		}
	}
	@media (max-width: 1000px) {
		.brand-studio {
			padding: 2.5rem 1.5rem 0;
		}
		.collection-cover {
			grid-template-columns: 1.7fr 1fr;
		}
		.cover-main {
			padding: 1.5rem;
		}
		.cover-index {
			display: none;
		}
		.collection-nav {
			gap: 1.2rem;
		}
		.guide-link {
			display: none;
		}
		.asset-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.logo-grid .asset-card:first-child {
			grid-column: 1 / -1;
		}
		.motion-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
		.video-stage {
			padding: 0.5rem;
		}
		.motion-info {
			padding: 1rem;
		}
		.essentials-grid {
			gap: 1.5rem;
		}
		.message-card {
			padding-left: 1.5rem;
		}
	}
	@media (max-width: 680px) {
		.brand-studio {
			padding: 2rem 1rem 0;
		}
		.studio-heading {
			align-items: flex-start;
			flex-direction: column;
			gap: 1.5rem;
		}
		.package-action {
			width: 100%;
		}
		.collection-cover {
			grid-template-columns: 1fr;
		}
		.cover-main {
			min-height: 265px;
			padding: 1.25rem;
		}
		.cover-main > img {
			height: 145px;
		}
		.cover-parts {
			min-height: 220px;
			padding: 1.25rem;
		}
		.parts-art {
			height: 155px;
			max-width: 350px;
			width: 100%;
			margin: auto;
		}
		.parts-art img {
			top: 25px;
		}
		.build-piece {
			top: 20px;
		}
		.os-piece {
			bottom: 20px;
		}
		.guide-one {
			top: 50px;
		}
		.guide-two {
			top: 120px;
		}
		.collection-nav {
			gap: 1.25rem;
			margin-top: 1rem;
		}
		.collection-nav button {
			font-size: 0.8125rem;
		}
		.section-heading {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}
		.collection-section {
			padding: 2rem 0;
		}
		.asset-grid,
		.motion-grid {
			grid-template-columns: 1fr;
		}
		.asset-preview {
			height: 225px;
		}
		.asset-info {
			padding: 1rem;
		}
		.banner-toolbar {
			align-items: flex-start;
			flex-direction: column;
		}
		.banner-options {
			flex-wrap: wrap;
			width: 100%;
			justify-content: space-between;
			gap: 0.7rem;
		}
		.banner-options label {
			flex-wrap: wrap;
		}
		.banner-image {
			min-height: 0;
		}
		.asset-description {
			line-height: 1.6;
		}
		.elements-heading {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.3rem;
		}
		.disrupted-card > img {
			object-fit: contain;
		}
		.essentials-grid {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
		.message-card {
			border-left: 0;
			padding: 1.5rem 0 0;
			border-top: 1px solid hsl(var(--border));
		}
		.swatches {
			gap: 0.45rem;
		}
		.swatch {
			height: 70px;
		}
		.swatch-name {
			font-size: 0.75rem;
		}
		.swatch-value {
			font-size: 0.65rem;
		}
		.studio-footer {
			flex-direction: column;
		}
		.section-tag {
			white-space: normal;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		*,
		*::before,
		*::after {
			transition: none !important;
			scroll-behavior: auto !important;
		}
	}
</style>
