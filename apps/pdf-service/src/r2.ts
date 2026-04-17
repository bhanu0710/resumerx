import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// R2 is S3-compatible. Use the account-id-scoped endpoint.
const accountId = process.env.R2_ACCOUNT_ID ?? '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? '';
const bucket = process.env.R2_BUCKET_NAME ?? '';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 env vars missing — pdf-service cannot fetch uploaded files');
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export async function fetchR2Object(key: string): Promise<Buffer> {
  const res = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`R2 returned empty body for key ${key}`);

  // stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
