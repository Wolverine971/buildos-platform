<!-- apps/web/src/lib/components/layout/IOSSplashScreens.svelte -->
<!--
	iOS PWA splash screens.

	iOS requires each apple-touch-startup-image to EXACTLY match the device's
	pixel dimensions or it silently falls back to a blank launch screen — a
	shared logo file does not work. Images are generated at exact sizes in
	/static/splash/ (dark #0f172a background + centered mark, matching the
	manifest background_color). Captured at add-to-home-screen time.
-->

<svelte:head>
	<!-- iPhone 16 Pro Max (1320x2868) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3)"
		href="/splash/splash-1320x2868.png"
	/>

	<!-- iPhone 16 Pro (1206x2622) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)"
		href="/splash/splash-1206x2622.png"
	/>

	<!-- iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus (1290x2796) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
		href="/splash/splash-1290x2796.png"
	/>

	<!-- iPhone 14 Pro, 15, 15 Pro, 16 (1179x2556) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"
		href="/splash/splash-1179x2556.png"
	/>

	<!-- iPhone 14 Plus, 13 Pro Max, 12 Pro Max (1284x2778) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"
		href="/splash/splash-1284x2778.png"
	/>

	<!-- iPhone 14, 13, 13 Pro, 12, 12 Pro (1170x2532) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
		href="/splash/splash-1170x2532.png"
	/>

	<!-- iPhone 13 mini, 12 mini (1125x2436) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"
		href="/splash/splash-1125x2436.png"
	/>

	<!-- iPhone SE 3rd gen (750x1334) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"
		href="/splash/splash-750x1334.png"
	/>

	<!-- iPad Pro 12.9" (2048x2732) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"
		href="/splash/splash-2048x2732.png"
	/>

	<!-- iPad Pro 11" (1668x2388) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)"
		href="/splash/splash-1668x2388.png"
	/>

	<!-- iPad Air, iPad 9th gen (1640x2360) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2)"
		href="/splash/splash-1640x2360.png"
	/>

	<!-- iPad Mini 6th gen (1488x2266) -->
	<link
		rel="apple-touch-startup-image"
		media="(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2)"
		href="/splash/splash-1488x2266.png"
	/>
</svelte:head>
