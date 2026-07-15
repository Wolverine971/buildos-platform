// apps/web/src/routes/blogs/blogs-page-state.test.svelte.ts
let currentUrl = $state(new URL('https://build-os.com/blogs'));

export const page = {
	get url() {
		return currentUrl;
	}
};

export function setPageUrl(url: URL) {
	currentUrl = url;
}
