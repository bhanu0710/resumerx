import 'server-only';

// centralized env. Fails loudly in prod, falls back to dev-friendly defaults locally.
const isProd = process.env.NODE_ENV === 'production';
// next sets NEXT_PHASE during `next build` — we don't want prod env validation
// to fire while collecting page data, only at actual runtime.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (isProd && !isBuildPhase) throw new Error(`${name} is required in production`);
    return '';
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  isProd,
  appUrl: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),

  db: {
    url: required('DATABASE_URL'),
    // no DATABASE_URL → in-memory fallback for dev
    useInMemory: !process.env.DATABASE_URL && !isProd,
  },

  r2: {
    accountId: required('R2_ACCOUNT_ID'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: optional('R2_BUCKET_NAME', 'resumerx-dev'),
    publicUrl: optional('R2_PUBLIC_URL', ''),
    useLocalFs: !process.env.R2_ACCOUNT_ID && !isProd,
  },

  pdfService: {
    url: optional('PDF_SERVICE_URL', 'http://localhost:3001'),
    token: optional('PDF_SERVICE_TOKEN', ''),
  },

  groq: {
    apiKey: required('GROQ_API_KEY'),
    rewriteModel: optional('GROQ_REWRITE_MODEL', 'llama-3.3-70b-versatile'),
    validatorModel: optional('GROQ_VALIDATOR_MODEL', 'llama-3.1-8b-instant'),
  },
};

// one-time warning on dev fallbacks — useful signal during local runs
if (!isProd && typeof process !== 'undefined') {
  if (env.db.useInMemory) {
    // eslint-disable-next-line no-console
    console.warn('[resumerx] DATABASE_URL not set — using in-memory store (dev only)');
  }
  if (env.r2.useLocalFs) {
    // eslint-disable-next-line no-console
    console.warn('[resumerx] R2_* not set — using local /tmp filesystem (dev only)');
  }
}
