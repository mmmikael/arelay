import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Dev-only: this page is a worked example of consuming @arelay/client as a
// third-party reader would. It is not part of the product and 404s in
// production so it never ships a recovery-key prompt to the live app.
export const load = () => {
	if (!dev) throw error(404, 'Not found');
};
