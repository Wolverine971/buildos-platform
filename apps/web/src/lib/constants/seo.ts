// apps/web/src/lib/constants/seo.ts
export const SITE_URL = 'https://build-os.com';
export const SITE_NAME = 'BuildOS';
export const SITE_DESCRIPTION =
	'BuildOS is a thinking environment for people making complex things. Turn rough notes, voice dumps, and scattered research into structured projects with memory and a clear next move.';

export const DEFAULT_SOCIAL_IMAGE_URL = `${SITE_URL}/twitter_card_light.png`;
export const DEFAULT_SOCIAL_IMAGE_ALT =
	'BuildOS social preview showing the BuildOS logo and the message Turn messy thinking into structured work.';
export const DEFAULT_SOCIAL_IMAGE_WIDTH = 1200;
export const DEFAULT_SOCIAL_IMAGE_HEIGHT = 628;
export const DEFAULT_SOCIAL_IMAGE_TYPE = 'image/png';
export const DEFAULT_SOCIAL_IMAGE_OBJECT = {
	'@type': 'ImageObject',
	url: DEFAULT_SOCIAL_IMAGE_URL,
	contentUrl: DEFAULT_SOCIAL_IMAGE_URL,
	encodingFormat: DEFAULT_SOCIAL_IMAGE_TYPE,
	width: DEFAULT_SOCIAL_IMAGE_WIDTH,
	height: DEFAULT_SOCIAL_IMAGE_HEIGHT
} as const;

export const DEFAULT_APP_ICON_URL = `${SITE_URL}/brain-bolt-80.png`;
export const DEFAULT_ORGANIZATION_LOGO_URL = `${SITE_URL}/android-chrome-512x512.png`;
export const DEFAULT_ORGANIZATION_LOGO_WIDTH = 512;
export const DEFAULT_ORGANIZATION_LOGO_HEIGHT = 512;
export const DEFAULT_ORGANIZATION_LOGO_TYPE = 'image/png';
export const DEFAULT_ORGANIZATION_LOGO_IMAGE = {
	'@type': 'ImageObject',
	url: DEFAULT_ORGANIZATION_LOGO_URL,
	contentUrl: DEFAULT_ORGANIZATION_LOGO_URL,
	encodingFormat: DEFAULT_ORGANIZATION_LOGO_TYPE,
	width: DEFAULT_ORGANIZATION_LOGO_WIDTH,
	height: DEFAULT_ORGANIZATION_LOGO_HEIGHT
} as const;
export const DEFAULT_ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const DEFAULT_WEBSITE_ID = `${SITE_URL}/#website`;
export const DEFAULT_ORGANIZATION_SOCIAL_PROFILES = [
	'https://twitter.com/build_os',
	'https://www.linkedin.com/company/build-os-app'
] as const;
export const HOME_PAGE_LAST_MODIFIED = '2026-03-24';

export const DEFAULT_TWITTER_SITE = '@build_os';
export const DEFAULT_TWITTER_CREATOR = '@djwayne3';
