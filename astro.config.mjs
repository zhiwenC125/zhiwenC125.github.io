// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// TODO: 部署前改成你的实际域名: https://<用户名>.github.io
	site: 'https://example.github.io',
	integrations: [mdx(), sitemap()],
});
