import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import type { ParsedResume, Analysis, RewriteResult } from '@resumerx/shared';
import { env } from './env';
import { resumes, analyses, rewrites, type ResumeRow, type AnalysisRow, type RewriteRow } from './db-schema';

// abstract interface so the API routes don't care if we're hitting pg or a Map
export interface Store {
  insertResume(row: { id: string; r2Key: string; parsed: ParsedResume; ttlMs: number }): Promise<void>;
  getResume(id: string): Promise<ResumeRow | null>;
  insertAnalysis(row: {
    id: string;
    resumeId: string;
    jobDescription: string;
    result: Analysis;
    ttlMs: number;
  }): Promise<void>;
  getAnalysis(id: string): Promise<AnalysisRow | null>;
  insertRewrite(row: {
    id: string;
    analysisId: string;
    result: RewriteResult;
    ttlMs: number;
  }): Promise<void>;
  getRewrite(id: string): Promise<RewriteRow | null>;
  setAcceptedBullets(rewriteId: string, map: Record<string, string>): Promise<void>;
}

// --- postgres implementation ---

function makePgStore(): Store {
  const pool = new Pool({ connectionString: env.db.url, max: 5 });
  const db = drizzle(pool);

  return {
    async insertResume({ id, r2Key, parsed, ttlMs }) {
      await db.insert(resumes).values({
        id,
        r2Key,
        parsed,
        expiresAt: new Date(Date.now() + ttlMs),
      });
    },
    async getResume(id) {
      const rows = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async insertAnalysis({ id, resumeId, jobDescription, result, ttlMs }) {
      await db.insert(analyses).values({
        id,
        resumeId,
        jobDescription,
        result,
        expiresAt: new Date(Date.now() + ttlMs),
      });
    },
    async getAnalysis(id) {
      const rows = await db.select().from(analyses).where(eq(analyses.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async insertRewrite({ id, analysisId, result, ttlMs }) {
      await db.insert(rewrites).values({
        id,
        analysisId,
        result,
        expiresAt: new Date(Date.now() + ttlMs),
      });
    },
    async getRewrite(id) {
      const rows = await db.select().from(rewrites).where(eq(rewrites.id, id)).limit(1);
      return rows[0] ?? null;
    },
    async setAcceptedBullets(rewriteId, map) {
      await db
        .update(rewrites)
        .set({ acceptedBullets: map })
        .where(eq(rewrites.id, rewriteId));
    },
  };
}

// --- in-memory fallback ---

function makeMemoryStore(): Store {
  const rs = new Map<string, ResumeRow>();
  const as = new Map<string, AnalysisRow>();
  const ws = new Map<string, RewriteRow>();
  const now = () => new Date();

  return {
    async insertResume({ id, r2Key, parsed, ttlMs }) {
      rs.set(id, {
        id,
        r2Key,
        parsed,
        createdAt: now(),
        expiresAt: new Date(Date.now() + ttlMs),
      });
    },
    async getResume(id) {
      return rs.get(id) ?? null;
    },
    async insertAnalysis({ id, resumeId, jobDescription, result, ttlMs }) {
      as.set(id, {
        id,
        resumeId,
        jobDescription,
        result,
        createdAt: now(),
        expiresAt: new Date(Date.now() + ttlMs),
      });
    },
    async getAnalysis(id) {
      return as.get(id) ?? null;
    },
    async insertRewrite({ id, analysisId, result, ttlMs }) {
      ws.set(id, {
        id,
        analysisId,
        result,
        acceptedBullets: null,
        createdAt: now(),
        expiresAt: new Date(Date.now() + ttlMs),
      });
    },
    async getRewrite(id) {
      return ws.get(id) ?? null;
    },
    async setAcceptedBullets(rewriteId, map) {
      const row = ws.get(rewriteId);
      if (!row) return;
      ws.set(rewriteId, { ...row, acceptedBullets: map });
    },
  };
}

// lazy singleton — don't connect to pg at module load
let _store: Store | null = null;
export function getStore(): Store {
  if (_store) return _store;
  _store = env.db.useInMemory ? makeMemoryStore() : makePgStore();
  return _store;
}
