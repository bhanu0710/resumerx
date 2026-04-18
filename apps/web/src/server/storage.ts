import 'server-only';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from './env';
import { UPLOAD_URL_TTL_SECONDS } from '@resumerx/shared';

// in dev without R2 creds we write to /tmp and serve via a local route.
// in prod we hand the browser a presigned PUT URL and it uploads directly to R2.

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  method: 'PUT';
  expiresIn: number;
}

export interface Storage {
  presignUpload(key: string, contentType: string): Promise<PresignedUpload>;
  getObject(key: string): Promise<Buffer>;
}

const LOCAL_ROOT = '/tmp/resumerx-dev';

function makeLocalStorage(): Storage {
  return {
    async presignUpload(key, _contentType) {
      await fs.mkdir(path.join(LOCAL_ROOT, path.dirname(key)), { recursive: true });
      // the web app exposes /api/dev-upload so the browser PUTs there instead of R2
      return {
        uploadUrl: `${env.appUrl}/api/dev-upload?key=${encodeURIComponent(key)}`,
        key,
        method: 'PUT',
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      };
    },
    async getObject(key) {
      const full = path.join(LOCAL_ROOT, key);
      return fs.readFile(full);
    },
  };
}

function makeR2Storage(): Storage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2.accessKeyId,
      secretAccessKey: env.r2.secretAccessKey,
    },
  });

  return {
    async presignUpload(key, contentType) {
      const cmd = new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: UPLOAD_URL_TTL_SECONDS });
      return { uploadUrl, key, method: 'PUT', expiresIn: UPLOAD_URL_TTL_SECONDS };
    },
    async getObject(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
      const chunks: Buffer[] = [];
      // @ts-expect-error — aws sdk stream is node Readable at runtime
      for await (const chunk of res.Body) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },
  };
}

// writes bytes to local fs — only used by /api/dev-upload
export async function writeLocalObject(key: string, body: Buffer): Promise<void> {
  const full = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

let _storage: Storage | null = null;
export function getStorage(): Storage {
  if (_storage) return _storage;
  _storage = env.r2.useLocalFs ? makeLocalStorage() : makeR2Storage();
  return _storage;
}

export function resumeKey(resumeId: string): string {
  return `uploads/${resumeId}.pdf`;
}
