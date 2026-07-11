// apps/web/src/lib/skills/skill-experts.ts
export type SkillExpertSource = {
	label: string;
	url: string;
	description: string;
};

export type SkillExpertWork = {
	title: string;
	organization?: string;
	summary: string;
	sourceUrl: string;
};

export type SkillExpertProfile = {
	slug: string;
	name: string;
	headline: string;
	shortBio: string;
	cardReason: string;
	whyWeListen: string;
	specialties: string[];
	work: SkillExpertWork[];
	sources: SkillExpertSource[];
	portrait: {
		src: string;
		alt: string;
		sourceUrl: string;
		sourceLabel: string;
		width: number;
		height: number;
	};
	lineageAliases?: {
		creatorNames?: string[];
		channelNames?: string[];
	};
	lastReviewed: string;
};

export type SkillExpertLineageSource = {
	creator?: string;
	channelName?: string;
};

export type SkillExpertLineageRelationship = 'creator' | 'channel';

export type ResolvedSkillExpert = {
	name: string;
	profile?: SkillExpertProfile;
};

export const skillExperts: SkillExpertProfile[] = [
	{
		slug: 'kane-kallaway',
		name: 'Kane Kallaway',
		headline: 'Content strategist and creator educator',
		shortBio:
			'Kane Kallaway studies high-performing internet content and turns its mechanics into repeatable systems for hooks, storytelling, and content operations.',
		cardReason:
			'His public breakdowns turn attention and storytelling mechanics into concrete, testable steps.',
		whyWeListen:
			'BuildOS listens to Kane because his teaching is operational: he names the parts, shows the sequence, and gives creators a way to diagnose weak work. We still treat every claim as a hypothesis to test. His material is one input to our skills, not an endorsement or a substitute for independent evaluation.',
		specialties: [
			'Short-form hooks',
			'Story structure',
			'Content systems',
			'Creator education'
		],
		work: [
			{
				title: 'Kallaway',
				organization: 'YouTube',
				summary:
					'Publishes practical breakdowns of hooks, retention, storytelling, and content strategy.',
				sourceUrl: 'https://www.youtube.com/@kallawaymarketing'
			},
			{
				title: 'Content Dept.',
				summary:
					'Writes a newsletter that analyzes high-performing content and extracts strategies for business owners.',
				sourceUrl: 'https://www.content.game/'
			},
			{
				title: 'Short Form Academy',
				summary:
					'Teaches a system for scripting, producing, and improving short-form content. The program describes his audience as 1M+ followers and his work as generating 1B+ views.',
				sourceUrl: 'https://shortform.academy/'
			},
			{
				title: 'Management consulting',
				summary:
					'Kane says he spent eight years in management consulting before moving into content and creator education.',
				sourceUrl: 'https://www.content.game/p/riggedgames'
			}
		],
		sources: [
			{
				label: 'YouTube channel',
				url: 'https://www.youtube.com/@kallawaymarketing',
				description: 'Primary source for the videos reviewed by BuildOS.'
			},
			{
				label: 'Content Dept.',
				url: 'https://www.content.game/',
				description: "Kane's newsletter and first-person writing."
			},
			{
				label: 'Short Form Academy',
				url: 'https://shortform.academy/',
				description:
					'Primary source for his teaching focus and self-reported audience metrics.'
			},
			{
				label: 'Talent profile',
				url: 'https://rakugomedia.com/talent/kallaway/',
				description: 'Public representation profile on Rakugo Media.'
			}
		],
		portrait: {
			src: '/images/skill-people/kane-kallaway.jpg',
			alt: 'Kane Kallaway wearing a black cap against a dark background',
			sourceUrl: 'https://x.com/kanekallaway',
			sourceLabel: 'Public X profile image',
			width: 400,
			height: 400
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'lenny-rachitsky',
		name: 'Lenny Rachitsky',
		headline: 'Product and growth writer, podcaster, and investor',
		shortBio:
			'Lenny Rachitsky publishes deeply researched product, growth, AI, and career advice and hosts long-form conversations with experienced technology operators.',
		cardReason:
			'His interviews preserve operator context and make complete product frameworks inspectable.',
		whyWeListen:
			"BuildOS listens to Lenny because his show gives experienced operators room to explain a framework, its examples, and its limits. In the current gallery he is the publishing host for two source episodes, not the originator of the guests' frameworks. We preserve that distinction and independently evaluate what becomes a skill.",
		specialties: [
			'Product management',
			'Growth systems',
			'Product careers',
			'Operator interviews'
		],
		work: [
			{
				title: "Lenny's Newsletter",
				summary:
					'Publishes product, growth, AI, and career advice. Its Start Here page reports more than one million readers and listeners.',
				sourceUrl: 'https://www.lennysnewsletter.com/p/start-here'
			},
			{
				title: "Lenny's Podcast",
				summary:
					'Hosts long-form conversations with product leaders, founders, designers, and growth operators.',
				sourceUrl: 'https://www.youtube.com/@LennysPodcast'
			},
			{
				title: 'Product and growth leadership',
				organization: 'Airbnb',
				summary:
					'Before his independent publishing work, Lenny spent seven years at Airbnb working across supply growth, conversion, trip quality, and community.',
				sourceUrl: 'https://www.linkedin.com/in/lennyrachitsky/'
			},
			{
				title: 'Angel investing',
				summary:
					'Actively invests in AI, B2B SaaS, marketplaces, platforms, and consumer products.',
				sourceUrl: 'https://lennyrachitsky.com/investing'
			}
		],
		sources: [
			{
				label: 'Official website',
				url: 'https://lennyrachitsky.com/',
				description: 'Primary overview of his newsletter, podcast, and investing work.'
			},
			{
				label: 'Newsletter: Start here',
				url: 'https://www.lennysnewsletter.com/p/start-here',
				description: 'First-person description of his publishing focus and audience.'
			},
			{
				label: 'Podcast channel',
				url: 'https://www.youtube.com/@LennysPodcast',
				description: 'Primary source for the hosted episodes reviewed by BuildOS.'
			},
			{
				label: 'LinkedIn profile',
				url: 'https://www.linkedin.com/in/lennyrachitsky/',
				description: 'Public professional background and prior operating roles.'
			}
		],
		portrait: {
			src: '/images/skill-people/lenny-rachitsky.jpg',
			alt: 'Lenny Rachitsky smiling in front of a wooden bookshelf',
			sourceUrl: 'https://x.com/lennysan',
			sourceLabel: 'Public X profile image',
			width: 400,
			height: 400
		},
		lineageAliases: {
			channelNames: ["Lenny's Podcast"]
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'kole-jain',
		name: 'Kole Jain',
		headline: 'Product designer, web designer, and design educator',
		shortBio:
			'Kole Jain is a Canadian product and web designer who teaches UI/UX design, web development, and practical interface craft through public videos and courses.',
		cardReason:
			'His before-and-after lessons turn visual design mistakes into observable review checks.',
		whyWeListen:
			'BuildOS listens to Kole because he teaches through concrete interface failures and repairs: hierarchy, spacing, shadows, consistency, and interaction feedback are shown on the screen rather than left as taste claims. Two of his videos directly inform the UI/UX Quality Review skill, and BuildOS independently tests the resulting checks.',
		specialties: ['UI/UX design', 'Web design', 'Design education', 'Front-end craft'],
		work: [
			{
				title: 'Kole Jain',
				organization: 'YouTube',
				summary:
					'Publishes practical lessons on UI/UX design, web development, freelancing, and interactive websites.',
				sourceUrl: 'https://www.youtube.com/@KoleJain'
			},
			{
				title: 'Product design',
				summary:
					'Works with early-stage startups on product experiences and marketing surfaces.',
				sourceUrl: 'https://ca.linkedin.com/in/kolejain'
			},
			{
				title: 'Web design and development courses',
				organization: 'Udemy',
				summary:
					'Teaches web design and development with a stated goal of making the work accessible to new practitioners.',
				sourceUrl: 'https://www.udemy.com/user/kole-jain-2/'
			},
			{
				title: 'NewForm design community',
				summary:
					'Helped bring together a cross-disciplinary community for web, UI/UX, and product designers.',
				sourceUrl: 'https://www.newform.community/old-homepage'
			}
		],
		sources: [
			{
				label: 'YouTube channel',
				url: 'https://www.youtube.com/@KoleJain',
				description: 'Primary source for the two videos reviewed by BuildOS.'
			},
			{
				label: 'LinkedIn profile',
				url: 'https://ca.linkedin.com/in/kolejain',
				description: 'Public professional background and current product-design focus.'
			},
			{
				label: 'Udemy instructor profile',
				url: 'https://www.udemy.com/user/kole-jain-2/',
				description: 'First-person teaching background and course profile.'
			},
			{
				label: 'NewForm community',
				url: 'https://www.newform.community/old-homepage',
				description: 'Public description of the design community he helped organize.'
			}
		],
		portrait: {
			src: '/images/skill-people/kole-jain.jpg',
			alt: 'Kole Jain in a dark shirt against a pale blue background',
			sourceUrl: 'https://www.youtube.com/@KoleJain',
			sourceLabel: 'Public YouTube profile image',
			width: 900,
			height: 900
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'april-dunford',
		name: 'April Dunford',
		headline: 'Positioning consultant, author, and former technology executive',
		shortBio:
			'April Dunford develops practical positioning and sales-pitch methods for B2B technology companies, drawing on decades as a startup operator and consultant.',
		cardReason:
			'Her positioning method connects competitive alternatives, differentiated value, and sales narrative in a sequence an agent can inspect.',
		whyWeListen:
			'BuildOS listens to April because she turns positioning from a vague messaging exercise into a concrete decision process: alternatives, differentiated capabilities, customer value, best-fit segments, and market category. Her sales-pitch work directly informs the setup layer in the Landing Page Scorecard Funnel skill. We preserve her authorship even when the reviewed material is hosted by another publisher.',
		specialties: [
			'Product positioning',
			'B2B go-to-market',
			'Sales narratives',
			'Market category'
		],
		work: [
			{
				title: 'Positioning consulting',
				summary:
					'Advises growth-stage and larger B2B technology companies using a structured positioning and sales-pitch methodology.',
				sourceUrl: 'https://www.aprildunford.com/'
			},
			{
				title: 'Obviously Awesome',
				organization: 'Author',
				summary:
					'Codifies a step-by-step positioning method for identifying alternatives, differentiated value, best-fit customers, and market context.',
				sourceUrl: 'https://www.aprildunford.com/books'
			},
			{
				title: 'Sales Pitch',
				organization: 'Author',
				summary:
					'Extends the positioning method into an eight-step sales narrative designed to clarify why a buyer should choose a product.',
				sourceUrl: 'https://www.aprildunford.com/books'
			},
			{
				title: 'Startup operating leadership',
				summary:
					'Her official biography describes 25 years leading marketing, product, and sales teams across seven B2B technology startups before consulting.',
				sourceUrl: 'https://www.aprildunford.com/about'
			}
		],
		sources: [
			{
				label: 'Official biography',
				url: 'https://www.aprildunford.com/about',
				description: 'First-person career history and consulting background.'
			},
			{
				label: 'Books and methods',
				url: 'https://www.aprildunford.com/books',
				description: 'Primary descriptions of Obviously Awesome and Sales Pitch.'
			},
			{
				label: 'Reviewed interview',
				url: 'https://www.youtube.com/watch?v=-VqmFI9vY7w',
				description: 'Primary source reviewed for the Landing Page Scorecard Funnel skill.'
			},
			{
				label: 'Positioning Show',
				url: 'https://www.youtube.com/@positioningshow',
				description: "April's public video channel and portrait source."
			}
		],
		portrait: {
			src: '/images/skill-people/april-dunford.jpg',
			alt: 'April Dunford smiling in a navy blazer against a light background',
			sourceUrl: 'https://www.youtube.com/@positioningshow',
			sourceLabel: 'Public YouTube profile image',
			width: 900,
			height: 900
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'daniel-priestley',
		name: 'Daniel Priestley',
		headline: 'Entrepreneur, author, and co-founder of Dent Global and ScoreApp',
		shortBio:
			'Daniel Priestley teaches entrepreneurship, demand generation, and assessment-led marketing through his companies, books, and public workshops.',
		cardReason:
			'His scorecard-funnel teaching supplies the page, questionnaire, results, and routing architecture for an entire published skill.',
		whyWeListen:
			'BuildOS listens to Daniel because his scorecard model treats a lead-generation page as a complete system: promise, assessment, personalized result, qualification signal, and next-step routing. That operating sequence is the primary source layer for the Landing Page Scorecard Funnel skill. Product and performance claims remain attributed to Daniel or his companies rather than presented as independent BuildOS findings.',
		specialties: [
			'Scorecard funnels',
			'Entrepreneurship',
			'Demand generation',
			'Business growth'
		],
		work: [
			{
				title: 'Dent Global',
				organization: 'Co-founder',
				summary:
					'Co-founded a business accelerator focused on helping entrepreneurs build influence, systems, and scalable companies.',
				sourceUrl: 'https://www.dent.global/author/daniel/'
			},
			{
				title: 'ScoreApp',
				organization: 'Co-founder',
				summary:
					'Builds assessment and quiz funnels that collect richer lead data and return tailored results.',
				sourceUrl: 'https://www.scoreapp.com/author/daniel-priestley/'
			},
			{
				title: 'Entrepreneurship books',
				organization: 'Author',
				summary:
					'Writes about influence, demand, entrepreneurial assets, and business growth, including Key Person of Influence and Oversubscribed.',
				sourceUrl: 'https://danielpriestley.com/'
			},
			{
				title: 'Public teaching and workshops',
				summary:
					'Publishes talks and practical training about entrepreneurship, marketing, and lead-generation systems.',
				sourceUrl: 'https://danielpriestley.com/'
			}
		],
		sources: [
			{
				label: 'Official website',
				url: 'https://danielpriestley.com/',
				description: 'Primary overview of his companies, books, and teaching work.'
			},
			{
				label: 'ScoreApp author profile',
				url: 'https://www.scoreapp.com/author/daniel-priestley/',
				description: 'Current company profile and portrait source.'
			},
			{
				label: 'Dent profile',
				url: 'https://www.dent.global/author/daniel/',
				description: 'Public company profile and writing archive.'
			},
			{
				label: 'Reviewed video',
				url: 'https://www.youtube.com/watch?v=az1Zh-FNSno',
				description: 'Primary source reviewed for the Landing Page Scorecard Funnel skill.'
			}
		],
		portrait: {
			src: '/images/skill-people/daniel-priestley.jpg',
			alt: 'Daniel Priestley smiling against a green background',
			sourceUrl: 'https://www.scoreapp.com/author/daniel-priestley/',
			sourceLabel: 'Public ScoreApp author image',
			width: 596,
			height: 596
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'nesrine-changuel',
		name: 'Nesrine Changuel',
		headline: 'Product coach, author, and former product leader',
		shortBio:
			'Nesrine Changuel teaches product teams how to design for emotional connection and useful delight, drawing on product work at Skype, Spotify, Google Meet, and Chrome.',
		cardReason:
			'Her delight framework distinguishes functional quality from emotional resonance and turns “delight” into reviewable product decisions.',
		whyWeListen:
			'BuildOS listens to Nesrine because she treats delight as a product strategy rather than decorative polish. Her framework helps reviewers identify low moments, choose an appropriate kind of delight, and check whether the result is useful and inclusive. The reviewed source is her guest interview on Lenny’s Podcast; the framework remains attributed to Nesrine.',
		specialties: [
			'Product delight',
			'Product strategy',
			'Emotional design',
			'Product coaching'
		],
		work: [
			{
				title: 'Product Excellence',
				organization: 'Founder',
				summary:
					'Coaches and trains product teams to build emotionally resonant, useful product experiences.',
				sourceUrl: 'https://maven.com/nesrine-changuel'
			},
			{
				title: 'Product Delight',
				organization: 'Author',
				summary:
					'Develops a practical framework for moving beyond functionality toward products that create meaningful emotional connection.',
				sourceUrl:
					'https://nesrine-changuel.com/wp-content/uploads/2025/06/Summary_-Product-Delight.pdf'
			},
			{
				title: 'Global product development',
				summary:
					'Her public biography describes more than a decade building product experiences for Skype, Spotify, Google Meet, and Chrome.',
				sourceUrl: 'https://maven.com/nesrine-changuel'
			},
			{
				title: 'Product teaching and speaking',
				summary:
					'Teaches product methods through courses, company training, and international conference talks.',
				sourceUrl: 'https://nesrine-changuel.com/speaking/'
			}
		],
		sources: [
			{
				label: 'Official website',
				url: 'https://nesrine-changuel.com/',
				description: 'Primary home for her writing, speaking, and Product Delight work.'
			},
			{
				label: 'Maven profile',
				url: 'https://maven.com/nesrine-changuel',
				description: 'Current teaching profile, biography, and portrait source.'
			},
			{
				label: 'Product Delight summary',
				url: 'https://nesrine-changuel.com/wp-content/uploads/2025/06/Summary_-Product-Delight.pdf',
				description: 'Primary summary of the book and its product framework.'
			},
			{
				label: 'Reviewed interview',
				url: 'https://www.youtube.com/watch?v=tX6nwT1Bsuo',
				description: 'Primary source reviewed for the UI/UX Quality Review skill.'
			}
		],
		portrait: {
			src: '/images/skill-people/nesrine-changuel.jpg',
			alt: 'Nesrine Changuel smiling in a navy top against a light background',
			sourceUrl: 'https://maven.com/nesrine-changuel',
			sourceLabel: 'Public Maven instructor image',
			width: 750,
			height: 750
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'tuan-le',
		name: 'Tuan Le',
		headline: 'Short-form content strategist and founder of shortscut',
		shortBio:
			'Tuan Le publishes short-form content strategy focused on the psychological and visual signals that make people stop, understand, and share brand content.',
		cardReason:
			'His six-filter model is the sole reviewed source layer behind the Viral Content for Boring Brands skill.',
		whyWeListen:
			'BuildOS listens to Tuan because his teaching breaks the first seconds of a brand video into observable filters—visuals, audio, identity, context, value, and social currency—that can be tested before publishing. The gallery currently has one reviewed Tuan source, so the profile is intentionally narrow and labels his view totals as self-reported.',
		specialties: ['Short-form video', 'Brand content', 'Viewer psychology', 'Content strategy'],
		work: [
			{
				title: 'shortscut',
				organization: 'Founder',
				summary:
					'Leads a Toronto-based content company focused on producing short-form videos designed for organic distribution.',
				sourceUrl: 'https://ca.linkedin.com/in/tuan-lee'
			},
			{
				title: 'Tuan Le',
				organization: 'YouTube',
				summary:
					'Publishes breakdowns of content psychology, brand video formats, hooks, and creative strategy.',
				sourceUrl: 'https://www.youtube.com/@tuann_lee'
			},
			{
				title: 'Three-billion-view analysis',
				summary:
					'Explains a six-filter model derived from what he describes as three billion views generated for brand content.',
				sourceUrl: 'https://www.youtube.com/watch?v=KkK-Y7GiQ2o'
			}
		],
		sources: [
			{
				label: 'YouTube channel',
				url: 'https://www.youtube.com/@tuann_lee',
				description: 'Primary publishing channel and portrait source.'
			},
			{
				label: 'Reviewed video',
				url: 'https://www.youtube.com/watch?v=KkK-Y7GiQ2o',
				description: 'Sole reviewed source for the Viral Content for Boring Brands skill.'
			},
			{
				label: 'LinkedIn profile',
				url: 'https://ca.linkedin.com/in/tuan-lee',
				description: 'Public professional profile and shortscut affiliation.'
			}
		],
		portrait: {
			src: '/images/skill-people/tuan-le.jpg',
			alt: 'Tuan Le smiling against an orange background',
			sourceUrl: 'https://www.youtube.com/@tuann_lee',
			sourceLabel: 'Public YouTube profile image',
			width: 900,
			height: 900
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'michael-seibel',
		name: 'Michael Seibel',
		headline: 'Startup founder and Y Combinator Partner Emeritus',
		shortBio:
			'Michael Seibel co-founded Justin.tv and Socialcam and spent more than a decade advising early-stage founders through Y Combinator.',
		cardReason:
			'His founder-and-investor perspective supplies the outreach gallery’s distinct, low-pressure cold-email mode for fundraising.',
		whyWeListen:
			'BuildOS listens to Michael because his fundraising advice comes from both sides of the exchange: building venture-backed startups and reviewing, interviewing, and advising founders at Y Combinator. His cold-investor-email guidance is used only for the outreach skill’s investor mode, where short factual context and a reply-first ask are more appropriate than a sales cadence.',
		specialties: [
			'Startup fundraising',
			'Founder coaching',
			'Early-stage startups',
			'Product-market fit'
		],
		work: [
			{
				title: 'Partner Emeritus',
				organization: 'Y Combinator',
				summary:
					'Transitioned to Partner Emeritus in 2025 after roles that included Group Partner and Managing Director of the accelerator.',
				sourceUrl: 'https://www.ycombinator.com/blog/michael-seibel-partner-emeritus'
			},
			{
				title: 'Justin.tv',
				organization: 'Co-founder and CEO',
				summary:
					'Co-founded and led Justin.tv, the company whose gaming product became Twitch.',
				sourceUrl: 'https://www.ycombinator.com/people/michael-seibel'
			},
			{
				title: 'Socialcam',
				organization: 'Co-founder and CEO',
				summary:
					'Co-founded the mobile video company Socialcam, which Autodesk acquired in 2012.',
				sourceUrl: 'https://www.ycombinator.com/people/michael-seibel'
			},
			{
				title: 'Founder education',
				summary:
					'Publishes and teaches about MVPs, product-market fit, users, fundraising, and founder decision-making.',
				sourceUrl: 'https://www.ycombinator.com/people/michael-seibel'
			}
		],
		sources: [
			{
				label: 'Y Combinator profile',
				url: 'https://www.ycombinator.com/people/michael-seibel',
				description:
					'Official career profile, writing archive, videos, and portrait source.'
			},
			{
				label: 'Partner Emeritus announcement',
				url: 'https://www.ycombinator.com/blog/michael-seibel-partner-emeritus',
				description: 'Official 2025 update on his current relationship with YC.'
			},
			{
				label: 'Reviewed video',
				url: 'https://www.youtube.com/watch?v=A3MmYbH1hbs',
				description: 'Primary source reviewed for the investor mode in the outreach skill.'
			},
			{
				label: 'Founder advice archive',
				url: 'https://www.ycombinator.com/people/michael-seibel',
				description: 'First-party essays and videos about building early-stage startups.'
			}
		],
		portrait: {
			src: '/images/skill-people/michael-seibel.jpg',
			alt: 'Michael Seibel wearing glasses and a black shirt',
			sourceUrl: 'https://www.ycombinator.com/people/michael-seibel',
			sourceLabel: 'Public Y Combinator profile image',
			width: 628,
			height: 628
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'connor-murray',
		name: 'Connor Murray',
		headline: 'Enterprise sales leader and sales educator at Higher Levels',
		shortBio:
			'Connor Murray teaches practical prospecting, cold email, cold calling, and enterprise sales workflows through Higher Levels and his public sales content.',
		cardReason:
			'His ten-year cold-email synthesis supplies the strategic-account structure, direct asks, and four-touch cadence used by the outreach skill.',
		whyWeListen:
			'BuildOS listens to Connor because his teaching distinguishes researched, strategic outreach from high-volume sending and turns that distinction into a concrete message and follow-up sequence. His source is one of the broadest inputs to Engagement-First Outreach, especially its strategic-account mode. Career and student-performance claims remain attributed to Connor or Higher Levels.',
		specialties: ['Enterprise sales', 'Cold email', 'Cold calling', 'Sales coaching'],
		work: [
			{
				title: 'Higher Levels',
				organization: 'Sales educator',
				summary:
					'Teaches SDRs, account executives, and founders practical prospecting and enterprise-sales systems.',
				sourceUrl: 'https://www.higherlevels.com/'
			},
			{
				title: 'Cold Email Engine',
				summary:
					'Teaches research, message structure, follow-up, and campaign review for B2B cold email.',
				sourceUrl: 'https://www.higherlevels.com/cold-email-engine?via=connor-techsales'
			},
			{
				title: 'Enterprise sales leadership',
				summary:
					'Higher Levels describes Connor as a five-time national MVP, enterprise account executive, SDR manager, and former Oracle cold-call coach.',
				sourceUrl: 'https://www.higherlevels.com/cold-email-engine?via=connor-techsales'
			},
			{
				title: 'Tech Sales With Higher Levels',
				organization: 'YouTube',
				summary:
					'Publishes sales breakdowns, examples, and training for modern B2B sellers.',
				sourceUrl: 'https://www.youtube.com/@techsales-higherlevels'
			}
		],
		sources: [
			{
				label: 'Connor Murray channel',
				url: 'https://www.youtube.com/@Connor-Murray',
				description: 'Public creator channel and portrait source.'
			},
			{
				label: 'Higher Levels',
				url: 'https://www.higherlevels.com/',
				description: 'Primary home for his sales education work.'
			},
			{
				label: 'Cold Email Engine',
				url: 'https://www.higherlevels.com/cold-email-engine?via=connor-techsales',
				description: 'Primary description of his cold-email curriculum and background.'
			},
			{
				label: 'Reviewed video',
				url: 'https://www.youtube.com/watch?v=XLsAAnNaFOc',
				description: 'Primary source reviewed for Engagement-First Outreach.'
			}
		],
		portrait: {
			src: '/images/skill-people/connor-murray.jpg',
			alt: 'Connor Murray speaking against a blue background',
			sourceUrl: 'https://www.youtube.com/@Connor-Murray',
			sourceLabel: 'Public YouTube profile image',
			width: 900,
			height: 900
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'aaron-shepherd',
		name: 'Aaron Shepherd',
		headline: 'Cold-outbound operator and founder of GrowthFlare',
		shortBio:
			'Aaron Shepherd runs GrowthFlare and publishes tactical cold-outbound teaching about infrastructure, front-end offers, concise email copy, and campaign economics.',
		cardReason:
			'His operating model supplies the outreach skill’s volume-mode infrastructure floor, front-end offer, short body, and back-end qualification.',
		whyWeListen:
			'BuildOS listens to Aaron because his source connects cold-email copy to the operational system around it: sending infrastructure, offer design, account volume, qualification, and reply economics. That makes his material especially useful for the high-volume mode of Engagement-First Outreach. Pipeline, meeting, send-volume, and company-growth figures are self-reported and are labeled as such.',
		specialties: [
			'Cold outbound',
			'Front-end offers',
			'Email infrastructure',
			'Campaign operations'
		],
		work: [
			{
				title: 'GrowthFlare',
				organization: 'Founder',
				summary:
					'Runs a growth and outbound agency focused on campaign systems, lead generation, and sales pipeline.',
				sourceUrl: 'https://www.growthflare.io/'
			},
			{
				title: 'Cold-outbound operations',
				summary:
					'Publishes detailed breakdowns of list volume, sending infrastructure, offer tests, concise copy, and reply conversion.',
				sourceUrl: 'https://www.youtube.com/@AaronxShepherd'
			},
			{
				title: 'Buyer-psychology background',
				summary:
					'His public profile connects formal psychology and marketing study with later work as a cold-email copywriter and operator.',
				sourceUrl: 'https://ca.linkedin.com/in/aaronxshepherd'
			},
			{
				title: 'GrowthFlare operating results',
				summary:
					'Aaron reports that GrowthFlare has booked thousands of meetings and built a seven-figure business; these figures are self-reported.',
				sourceUrl: 'https://ca.linkedin.com/in/aaronxshepherd'
			}
		],
		sources: [
			{
				label: 'YouTube channel',
				url: 'https://www.youtube.com/@AaronxShepherd',
				description: 'Primary publishing channel and portrait source.'
			},
			{
				label: 'GrowthFlare',
				url: 'https://www.growthflare.io/',
				description: 'Primary company site and description of its outbound work.'
			},
			{
				label: 'LinkedIn profile',
				url: 'https://ca.linkedin.com/in/aaronxshepherd',
				description: 'First-person career history and self-reported operating metrics.'
			},
			{
				label: 'Reviewed video',
				url: 'https://www.youtube.com/watch?v=CFZuljj6DrU',
				description: 'Primary source reviewed for Engagement-First Outreach.'
			}
		],
		portrait: {
			src: '/images/skill-people/aaron-shepherd.jpg',
			alt: 'Aaron Shepherd seated in a dark office',
			sourceUrl: 'https://www.youtube.com/@AaronxShepherd',
			sourceLabel: 'Public YouTube profile image',
			width: 900,
			height: 900
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'sam-mckenna',
		name: 'Sam McKenna',
		headline: 'Founder of #samsales and buyer-first sales educator',
		shortBio:
			'Sam McKenna teaches buyer-first enterprise selling, researched outreach, LinkedIn strategy, and sales leadership through #samsales.',
		cardReason:
			'Her buyer-first approach supplies the outreach skill’s authenticity bridge, respectful cadence, and research-before-personalization standard.',
		whyWeListen:
			'BuildOS listens to Sam because her work makes respect and preparation operational rather than aspirational. The reviewed source reinforces researched relevance, clear language, and follow-up that preserves the buyer’s dignity. Her contribution is used for strategic and relationship outreach, not as justification for high-volume automation.',
		specialties: [
			'Buyer-first sales',
			'Enterprise sales',
			'LinkedIn strategy',
			'Sales leadership'
		],
		work: [
			{
				title: '#samsales Consulting',
				organization: 'Founder and CEO',
				summary:
					'Leads a sales training and executive-branding firm built around manners-first and buyer-first selling.',
				sourceUrl: 'https://www.samsalesconsulting.com/meet-samsales/'
			},
			{
				title: 'Show Me You Know Me',
				summary:
					'Created a research-led outreach method that asks sellers to demonstrate genuine knowledge of the buyer before making an ask.',
				sourceUrl: 'https://www.samsalesconsulting.com/meet-samsales/'
			},
			{
				title: 'Enterprise sales leadership',
				summary:
					'Previously held sales and leadership roles at LinkedIn and ON24 before founding #samsales.',
				sourceUrl: 'https://www.samsalesconsulting.com/resource/threeyearsofsamsales/'
			},
			{
				title: 'Sales and leadership education',
				summary:
					'Publishes and speaks about sales, prospecting, leadership, social selling, and building durable buyer relationships.',
				sourceUrl: 'https://www.linkedin.com/in/samsalesli'
			}
		],
		sources: [
			{
				label: 'Official team profile',
				url: 'https://www.samsalesconsulting.com/meet-samsales/',
				description:
					'Primary biography, company background, methodology, and portrait source.'
			},
			{
				label: 'LinkedIn profile',
				url: 'https://www.linkedin.com/in/samsalesli',
				description: 'First-person professional history and current teaching focus.'
			},
			{
				label: 'Why I started #samsales',
				url: 'https://www.samsalesconsulting.com/resource/threeyearsofsamsales/',
				description: 'First-person account of the company and teaching mission.'
			},
			{
				label: 'Reviewed interview',
				url: 'https://www.youtube.com/watch?v=5ln1cGTzXTg',
				description: 'Primary source reviewed for Engagement-First Outreach.'
			}
		],
		portrait: {
			src: '/images/skill-people/sam-mckenna.jpg',
			alt: 'Sam McKenna smiling in a white top against a light background',
			sourceUrl: 'https://www.samsalesconsulting.com/meet-samsales/',
			sourceLabel: 'Public #samsales team image',
			width: 980,
			height: 980
		},
		lastReviewed: '2026-07-10'
	},
	{
		slug: 'steli-efti',
		name: 'Steli Efti',
		headline: 'Co-founder and CEO of Close and startup-sales educator',
		shortBio:
			'Steli Efti co-founded Close and publishes practical teaching about startup sales, outbound, follow-up, objections, leadership, and founder-led growth.',
		cardReason:
			'His reply-routing method supplies the outreach skill’s numbered fork, objection response bank, and respectful close-the-loop behavior.',
		whyWeListen:
			'BuildOS listens to Steli because his sales teaching focuses on what happens after an initial ask: objections, silence, follow-up, and the smallest next response. The reviewed source directly informs the reply-revival mode in Engagement-First Outreach. We use that narrow process without importing every sales opinion or treating company results as independent evidence.',
		specialties: ['Startup sales', 'Sales follow-up', 'Objection handling', 'Sales leadership'],
		work: [
			{
				title: 'Close',
				organization: 'Co-founder and CEO',
				summary:
					'Co-founded a CRM platform built for sales-focused small and midsize businesses.',
				sourceUrl: 'https://close.com/author/steli-efti'
			},
			{
				title: 'Startup sales education',
				summary:
					'Publishes long-running practical guidance about outbound, follow-up, objection handling, hiring, and sales management.',
				sourceUrl: 'https://close.com/author/steli-efti'
			},
			{
				title: 'Y Combinator founder',
				summary:
					'Close identifies Steli as a Y Combinator alumnus who advises startup founders and sales teams.',
				sourceUrl: 'https://close.com/author/steli-efti'
			},
			{
				title: 'Founder sales guides',
				summary:
					'Authors public guides and books on startup sales, negotiation, demos, pipelines, and sales hiring.',
				sourceUrl:
					'https://resource-downloads.close.com/resources/steli_efti-the_founders_guide_to_sales_negotiation-ebook.pdf'
			}
		],
		sources: [
			{
				label: 'Close author profile',
				url: 'https://close.com/author/steli-efti',
				description:
					'Official biography, writing archive, current role, and portrait source.'
			},
			{
				label: 'Close sales resources',
				url: 'https://close.com/resources/',
				description: 'Primary collection of the company’s public sales guides and teaching.'
			},
			{
				label: 'Reviewed video',
				url: 'https://www.youtube.com/watch?v=hmuMkXntbH0',
				description: 'Primary source reviewed for the reply-revival mode.'
			},
			{
				label: 'Founder sales guide',
				url: 'https://resource-downloads.close.com/resources/steli_efti-the_founders_guide_to_sales_negotiation-ebook.pdf',
				description: 'First-party long-form sales teaching from Steli and Close.'
			}
		],
		portrait: {
			src: '/images/skill-people/steli-efti.jpg',
			alt: 'Steli Efti pointing upward against a dark background',
			sourceUrl: 'https://close.com/author/steli-efti',
			sourceLabel: 'Public Close author image',
			width: 800,
			height: 800
		},
		lastReviewed: '2026-07-10'
	}
];

const expertsBySlug = new Map(skillExperts.map((expert) => [expert.slug, expert]));
const expertsByName = new Map(
	skillExperts.map((expert) => [normalizeSkillExpertName(expert.name), expert])
);

export function normalizeSkillExpertName(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function getSkillExpertBySlug(slug: string): SkillExpertProfile | undefined {
	return expertsBySlug.get(slug);
}

export function getSkillExpertByName(name: string): SkillExpertProfile | undefined {
	return expertsByName.get(normalizeSkillExpertName(name));
}

export function getSkillExpertPath(expert: Pick<SkillExpertProfile, 'slug'>): string {
	return `/skills/people/${expert.slug}`;
}

export function getSkillExpertLineageRelationship(
	expert: SkillExpertProfile,
	source: SkillExpertLineageSource
): SkillExpertLineageRelationship | undefined {
	const creatorKey = source.creator ? normalizeSkillExpertName(source.creator) : '';
	const creatorNames = [expert.name, ...(expert.lineageAliases?.creatorNames ?? [])].map(
		normalizeSkillExpertName
	);
	if (creatorKey && creatorNames.includes(creatorKey)) return 'creator';

	const channelKey = source.channelName ? normalizeSkillExpertName(source.channelName) : '';
	const channelNames = (expert.lineageAliases?.channelNames ?? []).map(normalizeSkillExpertName);
	if (channelKey && channelNames.includes(channelKey)) return 'channel';

	return undefined;
}

export function selectSkillExpertSourceHighlights<TSource extends SkillExpertLineageSource>(
	sources: TSource[],
	experts: SkillExpertProfile[],
	limit = 5
): TSource[] {
	if (limit <= 0) return [];

	const selected: TSource[] = [];
	const seen = new Set<TSource>();
	const add = (source?: TSource) => {
		if (!source || seen.has(source) || selected.length >= limit) return;
		seen.add(source);
		selected.push(source);
	};

	for (const expert of experts) {
		add(sources.find((source) => getSkillExpertLineageRelationship(expert, source)));
	}
	for (const source of sources) add(source);

	return selected;
}

export function resolveSkillExperts(names: string[]): ResolvedSkillExpert[] {
	return names.map((name) => ({
		name,
		profile: getSkillExpertByName(name)
	}));
}
