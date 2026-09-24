// docs/research/web-navigation-2026-09-22/sites.ts
// Real pages a BuildOS user (or DJ's Bid Desk work) would plausibly ask chat to read.
export const SITES = [
	// Public procurement: the Bid Desk wedge
	{ category: 'procurement', url: 'https://sam.gov/opportunities' },
	{ category: 'procurement', url: 'https://emma.maryland.gov/' },
	{ category: 'procurement', url: 'https://www.aacounty.org/purchasing' },
	{ category: 'procurement', url: 'https://procurement.baltimorecity.gov/' },
	{ category: 'procurement', url: 'https://www.bidnetdirect.com/maryland' },
	{ category: 'procurement', url: 'https://dgs.maryland.gov/Pages/Procurement/index.aspx' },
	{ category: 'procurement', url: 'https://www.montgomerycountymd.gov/PRO/' },
	{
		category: 'procurement',
		url: 'https://www.mdot.maryland.gov/tso/pages/Index.aspx?PageId=11'
	},
	// Construction industry
	{ category: 'construction', url: 'https://www.procore.com/pricing' },
	{ category: 'construction', url: 'https://www.buildingconnected.com/' },
	{ category: 'construction', url: 'https://www.constructconnect.com/' },
	{ category: 'construction', url: 'https://www.agc.org/' },
	// SaaS pricing pages
	{ category: 'pricing', url: 'https://linear.app/pricing' },
	{ category: 'pricing', url: 'https://www.notion.com/pricing' },
	{ category: 'pricing', url: 'https://openai.com/api/pricing/' },
	{ category: 'pricing', url: 'https://www.anthropic.com/pricing' },
	{ category: 'pricing', url: 'https://stripe.com/pricing' },
	// Documentation
	{ category: 'docs', url: 'https://svelte.dev/docs/svelte/overview' },
	{ category: 'docs', url: 'https://supabase.com/docs/guides/auth' },
	{ category: 'docs', url: 'https://docs.typesafe.ai/primitives/choice' },
	{ category: 'docs', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403' },
	// News and reference
	{ category: 'news', url: 'https://apnews.com/' },
	{ category: 'news', url: 'https://www.reuters.com/technology/' },
	{ category: 'news', url: 'https://www.theverge.com/' },
	{ category: 'news', url: 'https://www.baltimoresun.com/' },
	{ category: 'reference', url: 'https://en.wikipedia.org/wiki/Glen_Burnie,_Maryland' },
	{ category: 'reference', url: 'https://github.com/sveltejs/svelte' },
	{ category: 'reference', url: 'https://news.ycombinator.com/' },
	// Social and app-shell sites
	{ category: 'social', url: 'https://www.linkedin.com/company/anthropicresearch/' },
	{ category: 'social', url: 'https://x.com/AnthropicAI' },
	{ category: 'social', url: 'https://www.reddit.com/r/Construction/' },
	{ category: 'social', url: 'https://www.youtube.com/watch?v=o1CogAtWdBk' },
	{ category: 'social', url: 'https://www.instagram.com/anthropicai/' },
	// Local business directories
	{
		category: 'directory',
		url: 'https://www.yelp.com/search?find_desc=electrician&find_loc=Glen+Burnie%2C+MD'
	},
	{ category: 'directory', url: 'https://www.bbb.org/us/md/glen-burnie/category/electrician' },
	{
		category: 'directory',
		url: 'https://www.angi.com/companylist/us/md/glen-burnie/electrician.htm'
	},
	// Retail
	{ category: 'retail', url: 'https://www.homedepot.com/b/Electrical/N-5yc1vZarcd' },
	{ category: 'retail', url: 'https://www.amazon.com/s?k=wire+strippers' },
	// Small-business website builders
	{
		category: 'smb',
		url: 'https://www.squarespace.com/templates/browse/topic/professional-services'
	},
	{ category: 'smb', url: 'https://build-os.com/' }
] as const;
