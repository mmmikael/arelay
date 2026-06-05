import { createHmac, randomBytes, randomInt } from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';

export const EMAIL_VERIFICATION_MAX_AGE_MS = 15 * 60 * 1000;

export type EmailDeliveryResult = {
	channel: 'cloudflare' | 'smtp' | 'console';
};

type VerificationEmailContent = {
	subject: string;
	text: string;
	html: string;
};

type ParsedFromAddress = {
	address: string;
	name?: string;
};

export function normalizeEmail(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const email = value.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
	return email;
}

export function normalizeVerificationCode(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const code = value.replace(/\D/g, '');
	if (code.length !== 6) return null;
	return code;
}

export function generateVerificationCode(): string {
	return randomInt(100_000, 1_000_000).toString();
}

export function generateSignupVerificationToken(): string {
	return randomBytes(32).toString('base64url');
}

function getSecret(): string {
	const secret = env.SESSION_SECRET;
	if (!secret) throw new Error('SESSION_SECRET is required for email verification');
	return secret;
}

function hash(value: string): string {
	return createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function hashVerificationCode(email: string, code: string): string {
	return hash(`email-code:${email.trim().toLowerCase()}:${code}`);
}

export function hashSignupVerificationToken(token: string): string {
	return hash(`signup-token:${token}`);
}

function verificationEmailContent(code: string): VerificationEmailContent {
	const subject = 'Verify your Agent Relay email';
	const text = [
		'Use this code to verify your email address for Agent Relay:',
		'',
		code,
		'',
		'This code expires in 15 minutes.',
		'If you did not request this, you can ignore this email.'
	].join('\n');
	const html = `
		<div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a;">
			<p>Use this code to verify your email address for Agent Relay:</p>
			<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.18em;">${code}</p>
			<p>This code expires in 15 minutes.</p>
			<p style="color: #64748b;">If you did not request this, you can ignore this email.</p>
		</div>
	`;

	return { subject, text, html };
}

function requireFromAddress(): string {
	const from = env.EMAIL_FROM?.trim();
	if (!from) {
		throw new Error('EMAIL_FROM is required when email delivery is configured.');
	}
	return from;
}

function parseFromAddress(value: string): ParsedFromAddress {
	const trimmed = value.trim();
	const namedMatch = /^(.+?)\s*<([^>]+)>$/.exec(trimmed);
	if (namedMatch) {
		const name = namedMatch[1].trim().replace(/^["']|["']$/g, '');
		const address = namedMatch[2].trim();
		return { address, name: name || undefined };
	}

	return { address: trimmed };
}

function isCloudflareEmailConfigured(): boolean {
	return Boolean(env.CLOUDFLARE_ACCOUNT_ID?.trim() && env.CLOUDFLARE_API_TOKEN?.trim());
}

function isSmtpConfigured(): boolean {
	return Boolean(env.SMTP_HOST?.trim());
}

async function sendViaCloudflare(input: {
	to: string;
	origin: string;
	content: VerificationEmailContent;
}): Promise<void> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID!.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN!.trim();
	const from = parseFromAddress(requireFromAddress());
	const fromField = from.name
		? { address: from.address, name: from.name }
		: from.address;

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				to: input.to,
				from: fromField,
				subject: input.content.subject,
				text: input.content.text,
				html: input.content.html,
				headers: {
					'X-Agent-Relay-Origin': input.origin
				}
			})
		}
	);

	const result = (await response.json().catch(() => null)) as {
		success?: boolean;
		errors?: Array<{ message?: string }>;
	} | null;

	if (!response.ok || !result?.success) {
		const message = result?.errors?.[0]?.message || `Cloudflare email send failed (${response.status})`;
		throw new Error(message);
	}
}

async function sendViaSmtp(input: {
	to: string;
	origin: string;
	content: VerificationEmailContent;
}): Promise<void> {
	const auth =
		env.SMTP_USER || env.SMTP_PASSWORD
			? {
					user: env.SMTP_USER,
					pass: env.SMTP_PASSWORD
				}
			: undefined;
	const transporter = nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: smtpPort(),
		secure: smtpSecure(),
		auth
	});

	await transporter.sendMail({
		from: requireFromAddress(),
		to: input.to,
		subject: input.content.subject,
		text: input.content.text,
		html: input.content.html,
		headers: {
			'X-Agent-Relay-Origin': input.origin
		}
	});
}

function smtpPort(): number {
	const raw = Number(env.SMTP_PORT);
	if (Number.isInteger(raw) && raw > 0) return raw;
	return smtpSecure() ? 465 : 587;
}

function smtpSecure(): boolean {
	if (env.SMTP_SECURE === 'true') return true;
	if (env.SMTP_SECURE === 'false') return false;
	return env.SMTP_PORT === '465';
}

export async function sendVerificationEmail(input: {
	to: string;
	code: string;
	origin: string;
}): Promise<EmailDeliveryResult> {
	const content = verificationEmailContent(input.code);

	if (isCloudflareEmailConfigured()) {
		await sendViaCloudflare({
			to: input.to,
			origin: input.origin,
			content
		});
		return { channel: 'cloudflare' };
	}

	if (isSmtpConfigured()) {
		await sendViaSmtp({
			to: input.to,
			origin: input.origin,
			content
		});
		return { channel: 'smtp' };
	}

	if (process.env.NODE_ENV === 'production') {
		throw new Error('Email delivery is not configured.');
	}

	console.info(
		`[email-verification] Agent Relay code for ${input.to}: ${input.code} (expires in 15 minutes)`
	);
	return { channel: 'console' };
}
