<!-- apps/web/src/routes/+page.svelte -->
<!--
  Authenticated users: analytics dashboard
  Unauthenticated users: HomepageV2 landing page
-->
<script lang="ts">
	import './dashboard.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidateAll, replaceState } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import {
		DEFAULT_ORGANIZATION_ID,
		DEFAULT_ORGANIZATION_SOCIAL_PROFILES,
		DEFAULT_SOCIAL_IMAGE_ALT,
		DEFAULT_SOCIAL_IMAGE_HEIGHT,
		DEFAULT_SOCIAL_IMAGE_OBJECT,
		DEFAULT_SOCIAL_IMAGE_TYPE,
		DEFAULT_SOCIAL_IMAGE_URL,
		DEFAULT_SOCIAL_IMAGE_WIDTH,
		DEFAULT_TWITTER_CREATOR,
		DEFAULT_TWITTER_SITE,
		HOME_PAGE_LAST_MODIFIED,
		SITE_NAME,
		SITE_URL
	} from '$lib/constants/seo';
	import AnalyticsDashboard from '$lib/components/dashboard/AnalyticsDashboard.svelte';
	import HomepageV2 from '$lib/components/landing/HomepageV2.svelte';
	import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';
	import { serializeJsonLd } from '$lib/utils/json-ld';

	let { data } = $props();

	const homeTitle = 'BuildOS — Talk to BuildOS, see your thoughts organized.';
	const homeDescription =
		'BuildOS is a thinking environment for creators. Talk to BuildOS, see your projects organized. Same context for you and your agents — both make progress, in parallel.';

	const landingStructuredData = serializeJsonLd({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		'@id': `${SITE_URL}/#software-application`,
		name: SITE_NAME,
		description: homeDescription,
		applicationCategory: 'ProductivityApplication',
		operatingSystem: 'Web',
		offers: {
			'@type': 'Offer',
			price: '20.00',
			priceCurrency: 'USD',
			availability: 'https://schema.org/InStock',
			url: `${SITE_URL}/pricing`,
			description: 'BuildOS Pro monthly plan with a 14-day free trial.'
		},
		author: {
			'@id': DEFAULT_ORGANIZATION_ID
		},
		publisher: {
			'@id': DEFAULT_ORGANIZATION_ID
		},
		image: DEFAULT_SOCIAL_IMAGE_OBJECT,
		featureList: [
			'Rough input to project structure',
			'Persistent project context',
			'Chat-based project organization',
			'Voice note capture',
			'Task and milestone organization',
			'Research and document organization',
			'Daily briefs and next-step visibility',
			'Google Calendar synchronization',
			'Shared project context for people and AI agents'
		],
		url: SITE_URL,
		sameAs: DEFAULT_ORGANIZATION_SOCIAL_PROFILES,
		dateModified: HOME_PAGE_LAST_MODIFIED,
		mainEntityOfPage: SITE_URL
	});

	let isAuthenticated = $derived(!!data?.user);

	async function handleDashboardRefresh() {
		await invalidateAll();
	}

	onMount(() => {
		const message = page.url.searchParams.get('message');
		const urlError = page.url.searchParams.get('error');

		if (message) {
			toastService.success(message);
			const url = new URL(page.url);
			url.searchParams.delete('message');
			replaceState(url.toString(), {});
		}

		if (urlError) {
			toastService.error(urlError);
			const url = new URL(page.url);
			url.searchParams.delete('error');
			replaceState(url.toString(), {});
		}
	});
</script>

<svelte:head>
	<title>{homeTitle}</title>
	<meta name="description" content={homeDescription} />
	<meta
		name="keywords"
		content="thinking environment, project chat, project memory, creator workflow, author workflow, YouTube workflow, AI agents, task organization, daily briefs, voice notes"
	/>
	<link rel="canonical" href="https://build-os.com/" />

	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://build-os.com/" />
	<meta property="og:title" content={homeTitle} />
	<meta property="og:description" content={homeDescription} />
	<meta property="og:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:secure_url" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta property="og:image:type" content={DEFAULT_SOCIAL_IMAGE_TYPE} />
	<meta property="og:image:width" content={String(DEFAULT_SOCIAL_IMAGE_WIDTH)} />
	<meta property="og:image:height" content={String(DEFAULT_SOCIAL_IMAGE_HEIGHT)} />
	<meta property="og:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />
	<meta property="og:site_name" content="BuildOS" />
	<meta property="og:locale" content="en_US" />
	<link rel="image_src" href={DEFAULT_SOCIAL_IMAGE_URL} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content={DEFAULT_TWITTER_SITE} />
	<meta name="twitter:creator" content={DEFAULT_TWITTER_CREATOR} />
	<meta name="twitter:title" content={homeTitle} />
	<meta name="twitter:description" content={homeDescription} />
	<meta name="twitter:image" content={DEFAULT_SOCIAL_IMAGE_URL} />
	<meta name="twitter:image:alt" content={DEFAULT_SOCIAL_IMAGE_ALT} />

	<meta name="robots" content="index, follow" />
	<meta name="author" content="DJ Wayne" />

	{@html `<script type="application/ld+json">${landingStructuredData}</script>`}
</svelte:head>

{#if isAuthenticated && data.user}
	<AnalyticsDashboard
		user={{
			id: data.user.id,
			email: data.user.email,
			name: data.user.name ?? undefined,
			is_admin: data.user.is_admin,
			timezone: data.user.timezone ?? undefined
		}}
		analytics={data.dashboard ?? createEmptyUserDashboardAnalytics()}
		onrefresh={handleDashboardRefresh}
	/>
{:else}
	<HomepageV2 />
{/if}
