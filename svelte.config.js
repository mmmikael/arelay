import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isDevelopment = process.env.NODE_ENV !== 'production';

const config = {
	preprocess: vitePreprocess(),
	kit: {
		alias: {
			$plugins: 'src/plugins'
		},
		adapter: adapter({ out: 'build' }),
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'base-uri': ['none'],
				'connect-src': ['self', ...(isDevelopment ? ['ws:'] : [])],
				'font-src': ['self', 'https://fonts.gstatic.com'],
				'form-action': ['self'],
				'frame-ancestors': ['none'],
				'frame-src': ['self', 'blob:', 'https:'],
				'img-src': ['self', 'blob:', 'data:', 'https:'],
				'manifest-src': ['self'],
				'media-src': ['self', 'blob:', 'https:'],
				'object-src': ['none'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'worker-src': ['self', 'blob:'],
				'upgrade-insecure-requests': true
			}
		}
	}
};

export default config;
