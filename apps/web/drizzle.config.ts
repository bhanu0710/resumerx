import type { Config } from 'drizzle-kit';

// Migrations are generated from the schema in src/server/db-schema.ts and
// applied by `drizzle-kit migrate`. DATABASE_URL must be set in the shell —
// never commit a default here.
export default {
  schema: './src/server/db-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
} satisfies Config;
