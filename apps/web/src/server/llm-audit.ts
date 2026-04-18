import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ValidationResult } from '@resumerx/shared';
import { getStore } from './db';
import { logger } from './logger';

// Audit record for every LLM call — analyze, rewrite_bullet, validate.
// Used for cost accounting, latency tracking, and (eventually) a dashboard
// that shows which validator rules trip most.

export type LlmPurpose =
  | 'analyze'
  | 'rewrite_bullet'
  | 'rewrite_sections'
  | 'final_review'
  | 'validate';

export interface LlmCallInput {
  purpose: LlmPurpose;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  // only populated when purpose === 'validate'
  validation?: ValidationResult | null;
  // optional correlation — attach rewriteId / analysisId for joins
  parentId?: string;
}

export async function recordLlmCall(row: LlmCallInput): Promise<void> {
  const id = randomUUID();
  try {
    await getStore().insertLlmCall({
      id,
      purpose: row.purpose,
      model: row.model,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      latencyMs: row.latencyMs,
      validation: row.validation ?? null,
    });
  } catch (err) {
    // audit must not fail the caller — log and swallow
    logger.warn({ err, purpose: row.purpose }, 'llm audit write failed');
  }

  logger.info(
    {
      llm: true,
      purpose: row.purpose,
      model: row.model,
      pt: row.promptTokens,
      ct: row.completionTokens,
      ms: row.latencyMs,
      parentId: row.parentId,
      flags: row.validation?.flags ?? undefined,
      passed: row.validation?.passed,
    },
    'llm_call',
  );
}
