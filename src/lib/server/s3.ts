import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

const PREFIX = `${env.S3_PREFIX || 'agent-relay'}/`;

function getS3Config() {
	return {
		endpoint: env.S3_ENDPOINT,
		bucket: env.S3_BUCKET,
		accessKey: env.S3_ACCESS_KEY,
		secretKey: env.S3_SECRET_KEY,
		region: env.S3_REGION ?? 'us-east-1'
	};
}

let s3Client: S3Client | null = null;
let s3ClientConfig: string | null = null;

function getS3Client(): S3Client {
	const config = getS3Config();
	const configKey = JSON.stringify(config);

	if (!s3Client || s3ClientConfig !== configKey) {
		if (!config.endpoint || !config.bucket || !config.accessKey || !config.secretKey) {
			throw new Error(
				'S3 not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.'
			);
		}
		s3Client = new S3Client({
			region: config.region,
			endpoint: config.endpoint,
			forcePathStyle: true,
			credentials: {
				accessKeyId: config.accessKey,
				secretAccessKey: config.secretKey
			}
		});
		s3ClientConfig = configKey;
	}
	return s3Client;
}

function getBucket(): string {
	const bucket = env.S3_BUCKET;
	if (!bucket) throw new Error('S3_BUCKET not configured');
	return bucket;
}

export function isS3Configured(): boolean {
	const config = getS3Config();
	return !!(config.endpoint && config.bucket && config.accessKey && config.secretKey);
}

export function buildStorageKey(sessionId: string, artifactId: string, filename: string): string {
	const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
	return `${PREFIX}${sessionId}/${artifactId}/${safeName}`;
}

export function assertStorageKey(key: string): void {
	if (!key.startsWith(PREFIX)) {
		throw new Error('Invalid storage key');
	}
}

export async function putObject(
	key: string,
	body: Uint8Array | string,
	contentType: string
): Promise<void> {
	assertStorageKey(key);
	const client = getS3Client();
	const bucket = getBucket();
	await client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: body,
			ContentType: contentType
		})
	);
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
	assertStorageKey(key);
	const client = getS3Client();
	const bucket = getBucket();
	const response = await client.send(
		new GetObjectCommand({
			Bucket: bucket,
			Key: key
		})
	);
	if (!response.Body) {
		throw new Error('Empty response body');
	}
	return response.Body.transformToByteArray();
}

export async function getObjectText(key: string): Promise<string> {
	const bytes = await getObjectBytes(key);
	return new TextDecoder('utf-8').decode(bytes);
}

export async function generateDownloadUrl(
	key: string,
	filename: string,
	contentType: string,
	expiresIn = 300,
	options?: { inline?: boolean }
): Promise<string> {
	assertStorageKey(key);
	const client = getS3Client();
	const bucket = getBucket();
	const safeName = filename.replace(/"/g, '');
	const disposition = options?.inline
		? `inline; filename="${safeName}"`
		: `attachment; filename="${safeName}"`;
	const command = new GetObjectCommand({
		Bucket: bucket,
		Key: key,
		ResponseContentDisposition: disposition,
		ResponseContentType: contentType
	});
	return getSignedUrl(client, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
	assertStorageKey(key);
	const client = getS3Client();
	const bucket = getBucket();
	await client.send(
		new DeleteObjectCommand({
			Bucket: bucket,
			Key: key
		})
	);
}

export async function deleteObjects(keys: string[]): Promise<void> {
	if (keys.length === 0) return;
	for (const key of keys) {
		assertStorageKey(key);
	}
	const client = getS3Client();
	const bucket = getBucket();
	await client.send(
		new DeleteObjectsCommand({
			Bucket: bucket,
			Delete: {
				Objects: keys.map((Key) => ({ Key }))
			}
		})
	);
}
