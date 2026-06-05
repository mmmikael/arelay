/// <reference types="svelte" />
import type { User } from '$lib/server/db';

declare global {
	namespace App {
		interface Locals {
			authenticated: boolean;
			user: User | null;
			agentUser: User | null;
			currentPasskeyId: string | null;
		}
	}
}

export {};
