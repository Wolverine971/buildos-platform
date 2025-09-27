// scripts/generate-blog-context.ts
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { parse as parseYaml } from 'yaml';

interface BlogPostMetadata {
	title: string;
	description: string;
	author: string;
	date: string;
	lastmod: string;
	changefreq: string;
	priority: string;
	published: boolean;
	tags: string[];
	readingTime: number;
	excerpt?: string;
	pic?: string;
	slug: string;
	category: string;
	filePath: string;
	[key: string]: any; // Allow additional frontmatter fields
}

interface BlogCategory {
	name: string;
	description: string;
	color: string;
}

interface BlogContextStructure {
	categories: {
		[categoryKey: string]: {
			metadata: BlogCategory;
			posts: {
				[postSlug: string]: BlogPostMetadata | null;
			};
		};
	};
	generatedAt: string;
	totalPosts: number;
	totalCategories: number;
}

// Default category metadata - will be used if not otherwise specified
const DEFAULT_CATEGORY_METADATA: Record<string, BlogCategory> = {
	'getting-started': {
		name: 'Getting Started',
		description: 'Essential guides to help you master Build OS fundamentals',
		color: 'purple'
	},
	'productivity-tips': {
		name: 'Productivity Tips',
		description: 'Optimize your workflow and boost your efficiency',
		color: 'blue'
	},
	'product-updates': {
		name: 'Product Updates',
		description: 'Latest features, improvements, and announcements',
		color: 'green'
	},
	'case-studies': {
		name: 'Case Studies',
		description: 'Real user stories and success examples',
		color: 'orange'
	},
	'advanced-guides': {
		name: 'Advanced Guides',
		description: 'Deep-dive tutorials for power users',
		color: 'red'
	},
	philosophy: {
		name: 'Philosophy',
		description: 'Our vision for the future of personal productivity',
		color: 'indigo'
	}
};

function extractFrontmatter(content: string): any {
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		throw new Error('No frontmatter found');
	}

	try {
		return parseYaml(match[1]);
	} catch (error) {
		throw new Error(`Failed to parse YAML frontmatter: ${error}`);
	}
}

function generateCategoryMetadata(categoryKey: string): BlogCategory {
	// Use default metadata if available, otherwise generate from folder name
	if (DEFAULT_CATEGORY_METADATA[categoryKey]) {
		return DEFAULT_CATEGORY_METADATA[categoryKey];
	}

	// Generate metadata from folder name
	const name = categoryKey
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');

	return {
		name,
		description: `Content related to ${name.toLowerCase()}`,
		color: 'gray'
	};
}

function scanBlogDirectory(blogDir: string, includeNulls: boolean = false): BlogContextStructure {
	console.log(`📂 Scanning blog directory: ${blogDir}`);

	const context: BlogContextStructure = {
		categories: {},
		generatedAt: new Date().toISOString(),
		totalPosts: 0,
		totalCategories: 0
	};

	// Check if blog directory exists
	if (!existsSync(blogDir)) {
		console.warn(`⚠️  Blog directory does not exist: ${blogDir}`);
		return context;
	}

	// Get all directories in the blog folder
	let categoryDirs: string[] = [];
	try {
		const items = readdirSync(blogDir);
		categoryDirs = items.filter((item) => {
			const itemPath = join(blogDir, item);
			return (
				statSync(itemPath).isDirectory() &&
				!item.startsWith('.') &&
				item !== 'blog-context.json'
			);
		});
	} catch (error) {
		console.error(`❌ Failed to read blog directory: ${error}`);
		return context;
	}

	console.log(`📁 Found ${categoryDirs.length} categories: ${categoryDirs.join(', ')}`);

	// Process each category directory
	for (const categoryKey of categoryDirs) {
		console.log(`🔍 Processing category: ${categoryKey}`);

		// Generate category metadata
		const categoryMetadata = generateCategoryMetadata(categoryKey);

		// Initialize category in context
		context.categories[categoryKey] = {
			metadata: categoryMetadata,
			posts: {}
		};

		const categoryDir = join(blogDir, categoryKey);

		// Get all markdown files in category directory
		let markdownFiles: string[] = [];
		try {
			const files = readdirSync(categoryDir);
			markdownFiles = files.filter((file) => file.endsWith('.md'));
		} catch (error) {
			console.warn(`⚠️  Could not read category directory ${categoryDir}: ${error}`);
			continue;
		}

		console.log(`  📄 Found ${markdownFiles.length} markdown files`);

		// Process each markdown file
		for (const fileName of markdownFiles) {
			const slug = fileName.replace('.md', '');
			const filePath = join(categoryDir, fileName);

			try {
				const content = readFileSync(filePath, 'utf-8');
				const frontmatter = extractFrontmatter(content);

				// Check for null or undefined values in frontmatter
				if (!frontmatter || Object.keys(frontmatter).length === 0) {
					console.warn(`  ⚠️  ${slug} - empty or null frontmatter`);
					if (includeNulls) {
						context.categories[categoryKey].posts[slug] = null;
					}
					continue;
				}

				// Validate required fields exist and are not null
				const requiredFields = ['title', 'description', 'author', 'date'];
				const hasRequiredFields = requiredFields.every((field) => {
					const value = frontmatter[field];
					return value !== null && value !== undefined && value !== '';
				});

				if (!hasRequiredFields) {
					console.warn(`  ⚠️  ${slug} - missing required fields or has null values`);
					if (includeNulls) {
						context.categories[categoryKey].posts[slug] = null;
					}
					continue;
				}

				// Create blog post metadata
				const postMetadata: BlogPostMetadata = {
					...frontmatter,
					slug,
					category: categoryKey,
					filePath: filePath.replace(process.cwd() + '/', ''),
					// Ensure required fields have defaults for null values
					tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
					readingTime:
						typeof frontmatter.readingTime === 'number' ? frontmatter.readingTime : 5,
					published:
						typeof frontmatter.published === 'boolean' ? frontmatter.published : true
				};

				context.categories[categoryKey].posts[slug] = postMetadata;
				context.totalPosts++;

				console.log(`  ✅ ${slug} - metadata extracted`);
			} catch (error) {
				console.warn(`  ⚠️  ${slug} - failed to parse: ${error}`);
				if (includeNulls) {
					context.categories[categoryKey].posts[slug] = null;
				}
			}
		}

		// Remove categories with no posts if not including nulls
		if (!includeNulls && Object.keys(context.categories[categoryKey].posts).length === 0) {
			console.log(`  🗑️  Removing empty category: ${categoryKey}`);
			delete context.categories[categoryKey];
		} else {
			context.totalCategories++;
		}
	}

	return context;
}

function validateBlogPost(metadata: BlogPostMetadata): string[] {
	const errors: string[] = [];
	const requiredFields = ['title', 'description', 'author', 'date'];

	for (const field of requiredFields) {
		const value = metadata[field as keyof BlogPostMetadata];
		if (value === null || value === undefined || value === '') {
			errors.push(`Missing or null required field: ${field}`);
		}
	}

	// Validate date format
	if (metadata.date && isNaN(Date.parse(metadata.date))) {
		errors.push('Invalid date format');
	}

	// Validate tags array
	if (metadata.tags && !Array.isArray(metadata.tags)) {
		errors.push('Tags must be an array');
	}

	// Check for null values in critical fields
	if (metadata.title === null || metadata.description === null) {
		errors.push('Title and description cannot be null');
	}

	return errors;
}

function generateBlogContext(): void {
	console.log('🚀 Generating flexible blog context...');

	const blogDir = join(process.cwd(), 'src', 'content', 'blogs');
	const outputPath = join(blogDir, 'blog-context.json');

	try {
		// Ensure blogs directory exists
		if (!existsSync(blogDir)) {
			console.log(`📁 Creating blogs directory: ${blogDir}`);
			mkdirSync(blogDir, { recursive: true });
		}

		// Scan and build context (exclude nulls by default for cleaner output)
		const context = scanBlogDirectory(blogDir, false);

		// Validate existing posts
		console.log('\n🔍 Validating existing posts...');
		let validationErrors = 0;

		for (const [categoryKey, categoryData] of Object.entries(context.categories)) {
			for (const [slug, postData] of Object.entries(categoryData.posts)) {
				if (postData !== null && typeof postData === 'object') {
					const errors = validateBlogPost(postData as BlogPostMetadata);
					if (errors.length > 0) {
						console.warn(`  ⚠️  ${categoryKey}/${slug}: ${errors.join(', ')}`);
						validationErrors++;
					}
				}
			}
		}

		// Write context file
		console.log(`\n📝 Writing blog context to: ${outputPath}`);
		writeFileSync(outputPath, JSON.stringify(context, null, 2));

		// Summary
		console.log('\n📊 Blog Context Summary:');
		console.log(`  📁 Categories discovered: ${context.totalCategories}`);
		console.log(`  📄 Total posts found: ${context.totalPosts}`);

		// Category breakdown
		Object.entries(context.categories).forEach(([categoryKey, categoryData]) => {
			const postCount = Object.keys(categoryData.posts).length;
			const publishedCount = Object.values(categoryData.posts).filter(
				(value) => value && typeof value === 'object' && value.published
			).length;
			const nullCount = Object.values(categoryData.posts).filter(
				(value) => value === null
			).length;

			console.log(
				`    📂 ${categoryKey}: ${publishedCount}/${postCount} published${nullCount > 0 ? ` (${nullCount} nulls filtered out)` : ''}`
			);
		});

		if (validationErrors > 0) {
			console.warn(`  ⚠️  Validation errors: ${validationErrors}`);
		}

		console.log('\n✅ Flexible blog context generated successfully!');
	} catch (error) {
		console.error('❌ Failed to generate blog context:');
		console.error(error);
		process.exit(1);
	}
}

// Run if called directly
// if (require.main === module) {
// 	generateBlogContext();
// }

// export { generateBlogContext };

generateBlogContext();
