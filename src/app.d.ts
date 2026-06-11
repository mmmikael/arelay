/// <reference types="svelte" />
import type { User } from '$lib/server/db';
import type { Logger } from 'pino';

declare global {
	namespace App {
		interface Locals {
			authenticated: boolean;
			user: User | null;
			agentUser: User | null;
			currentPasskeyId: string | null;
			/** Set by hooks for portal page requests to avoid duplicate getE2eeConfig. */
			e2eeConfigured?: boolean;
			requestId: string;
			log: Logger;
		}
		interface Error {
			message?: string;
			requestId?: string;
		}
		interface PageData {
			requestId?: string;
		}
	}
}

export {};
