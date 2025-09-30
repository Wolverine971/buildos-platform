// apps/web/mdsvex.config.js
import { defineMDSveXConfig as defineConfig } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkGfm from 'remark-gfm';
import remarkToc from 'remark-toc';

const config = defineConfig({
	extensions: ['.svelte.md', '.md', '.svx'],
	smartypants: {
		dashes: 'oldschool'
	},
	remarkPlugins: [remarkGfm, [remarkToc, { tight: true, maxDepth: 3 }]],
	rehypePlugins: [
		rehypeSlug,
		[
			rehypeAutolinkHeadings,
			{
				behavior: 'wrap',
				properties: {
					className: ['heading-link']
				}
			}
		]
	],
	layout: {
		_: './src/lib/components/blogs/BlogLayout.svelte'
	}
});

export default config;
