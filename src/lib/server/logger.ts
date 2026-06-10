import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import pino, { type Logger } from 'pino';

function resolveLogLevel(): pino.Level {
	const configured = env.LOG_LEVEL?.trim().toLowerCase();
	if (
		configured === 'fatal' ||
		configured === 'error' ||
		configured === 'warn' ||
		configured === 'info' ||
		configured === 'debug' ||
		configured === 'trace'
	) {
		return configured;
	}
	return dev ? 'debug' : 'info';
}

export const rootLogger: Logger = pino({
	level: resolveLogLevel(),
	...(dev
		? {
				transport: {
					target: 'pino-pretty',
					options: { colorize: true, translateTime: 'SYS:standard' }
				}
			}
		: {}),
	redact: {
		paths: [
			'req.headers.authorization',
			'authorization',
			'cookie',
			'*.token',
			'*.password',
			'*.secret'
		],
		remove: true
	}
});

export function createRequestLogger(requestId: string, meta?: Record<string, unknown>): Logger {
	return rootLogger.child({ requestId, ...meta });
}
