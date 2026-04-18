import { pgTable, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';
import type {
  ParsedResume,
  Analysis,
  RewriteResult,
  ValidationResult,
} from '@resumerx/shared';

// resumes — parsed uploads, kept 24h
export const resumes = pgTable(
  'resumes',
  {
    id: text('id').primaryKey(),
    r2Key: text('r2_key').notNull(),
    // structured parse result from pdf-service
    parsed: jsonb('parsed').$type<ParsedResume>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // expiresAt is stamped at insert; a cron (phase 8) + R2 lifecycle rules both clean up
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    expiresIdx: index('resumes_expires_idx').on(t.expiresAt),
  }),
);

// analyses — one per (resume, jd) combination
export const analyses = pgTable(
  'analyses',
  {
    id: text('id').primaryKey(),
    resumeId: text('resume_id').notNull(),
    // store the JD so rewrite can reuse it without the client re-sending
    jobDescription: text('job_description').notNull(),
    result: jsonb('result').$type<Analysis>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    resumeIdx: index('analyses_resume_idx').on(t.resumeId),
    expiresIdx: index('analyses_expires_idx').on(t.expiresAt),
  }),
);

// rewrites — grouped result from one rewrite request
export const rewrites = pgTable(
  'rewrites',
  {
    id: text('id').primaryKey(),
    analysisId: text('analysis_id').notNull(),
    result: jsonb('result').$type<RewriteResult>().notNull(),
    // user's accepted text per bullet. null until user accepts.
    acceptedBullets: jsonb('accepted_bullets').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    analysisIdx: index('rewrites_analysis_idx').on(t.analysisId),
    expiresIdx: index('rewrites_expires_idx').on(t.expiresAt),
  }),
);

// llm_calls — thin audit log, phase 9 uses this for cost + latency metrics
export const llmCalls = pgTable('llm_calls', {
  id: text('id').primaryKey(),
  purpose: text('purpose').notNull(), // 'analyze' | 'rewrite_bullet' | 'validate'
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  validationPassed: jsonb('validation').$type<ValidationResult | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ResumeRow = typeof resumes.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
export type RewriteRow = typeof rewrites.$inferSelect;
