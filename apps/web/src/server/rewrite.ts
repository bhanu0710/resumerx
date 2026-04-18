import 'server-only';
import {
  BulletRewriteSchema,
  RewriteLLMResponseSchema,
  ValidationResultSchema,
  rewriteId as newRewriteId,
  REWRITE_LENGTH_DRIFT_MAX,
  REWRITE_MAX_BULLETS_PER_REQUEST,
  type BulletRewrite,
  type ParsedResume,
  type RewriteLLMResponse,
  type RewriteResult,
  type ValidationResult,
  type ValidationFlag,
} from '@resumerx/shared';
import { env } from './env';
import { groqChat, GroqError } from './groq';

// Flatten experience + projects into a list of rewritable bullets.
// Per spec: bullets live in Experience and Projects only. Summary/Education/Skills/Certifications are never rewritten.
export interface BulletTarget {
  bulletId: string;
  section: 'experience' | 'projects';
  parentId: string;
  parentLabel: string; // "Senior SWE @ Acme" | "Project: FooBar"
  original: string;
}

export function collectBullets(parsed: ParsedResume): BulletTarget[] {
  const out: BulletTarget[] = [];
  for (const exp of parsed.experience) {
    for (const b of exp.bullets) {
      out.push({
        bulletId: b.id,
        section: 'experience',
        parentId: exp.id,
        parentLabel: `${exp.title} @ ${exp.company}`,
        original: b.text,
      });
    }
  }
  for (const proj of parsed.projects ?? []) {
    for (const b of proj.bullets) {
      out.push({
        bulletId: b.id,
        section: 'projects',
        parentId: proj.id,
        parentLabel: `Project: ${proj.name}`,
        original: b.text,
      });
    }
  }
  return out;
}

function rewriterSystemPrompt(jdKeywords: string[]): string {
  return `You rewrite a single resume bullet so it reads stronger while staying factually identical to the original.

ABSOLUTE RULES — violating any of these breaks the product:
1. Do NOT invent facts. If the original says "worked on", don't write "led" unless the original said so.
2. Do NOT add metrics. If the original has no numbers, don't add them.
3. Do NOT add technologies, tools, or scope that the original doesn't already mention.
4. Keep the rewrite length within ±20% of the original.
5. Start with a stronger verb when possible. Prefer concrete verbs (built, shipped, reduced, owned) over vague ones (worked, helped, assisted).
6. Weave in a JD keyword ONLY if the original work honestly covers it. Never force-fit.
7. If the original is already strong or cannot be improved without violating rules 1-5, return skipped: true with a short reason.

JD keywords you may weave in where honest: ${jdKeywords.join(', ') || '(none specified)'}

Return valid JSON matching this shape (no markdown):
{
  "rewritten": string,
  "keywordsInjected": string[],
  "reasoning": string (1-2 sentences on what you changed and why),
  "skipped": boolean,
  "skipReason"?: string
}`;
}

function validatorSystemPrompt(): string {
  return `You are a strict validator. Given an ORIGINAL resume bullet and a REWRITTEN version, check whether the rewrite added anything not supported by the original.

Flag any of:
- "fabricated_fact": the rewrite states a fact the original does not support
- "added_metric": the rewrite adds a number/percentage/scope figure the original lacks
- "exaggerated_scope": the rewrite inflates seniority/ownership (e.g. "contributed to" → "led")
- "new_technology": the rewrite names a tool/language/framework the original does not
- "changed_meaning": the rewrite describes different work than the original

Rewording, verb swaps, and tense changes that preserve meaning are NOT flags.

Return valid JSON (no markdown):
{
  "passed": boolean (true iff flags is empty),
  "flags": Array<{ type: "fabricated_fact"|"added_metric"|"exaggerated_scope"|"new_technology"|"changed_meaning", detail: string }>
}`;
}

function parseLLMJson<T>(raw: string): T {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');
  return JSON.parse(trimmed) as T;
}

function lengthDriftExceeded(original: string, rewritten: string): boolean {
  const a = original.length;
  const b = rewritten.length;
  if (a === 0) return false;
  return Math.abs(b - a) / a > REWRITE_LENGTH_DRIFT_MAX;
}

// Heuristic fallback — runs when GROQ_API_KEY is missing. Keeps the dev
// flow testable without spending real tokens.
function stubRewrite(target: BulletTarget, jdKeywords: string[]): RewriteLLMResponse {
  const verbMap: Record<string, string> = {
    worked: 'built',
    helped: 'drove',
    assisted: 'supported',
    did: 'delivered',
    made: 'built',
  };
  const first = target.original.split(/\s+/)[0]?.toLowerCase() ?? '';
  const swap = verbMap[first];
  if (!swap) {
    return {
      rewritten: target.original,
      keywordsInjected: [],
      reasoning: 'stub: no safe rewrite available, returning original',
      skipped: true,
      skipReason: 'dev stub — set GROQ_API_KEY for real rewrites',
    };
  }
  const originalStartsCapital = /^[A-Z]/.test(target.original);
  const verb = originalStartsCapital ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap;
  const rewritten = verb + target.original.slice(first.length);
  const matchedKw = jdKeywords.find((k) => target.original.toLowerCase().includes(k.toLowerCase()));
  return {
    rewritten,
    keywordsInjected: matchedKw ? [matchedKw] : [],
    reasoning: `stub: swapped opening verb "${first}" → "${swap}"`,
    skipped: false,
  };
}

async function callRewriter(
  target: BulletTarget,
  jdKeywords: string[],
): Promise<{ resp: RewriteLLMResponse; stub: boolean }> {
  if (!env.groq.apiKey) {
    return { resp: stubRewrite(target, jdKeywords), stub: true };
  }
  const res = await groqChat({
    model: env.groq.rewriteModel,
    temperature: 0.4,
    maxTokens: 400,
    responseFormat: 'json_object',
    messages: [
      { role: 'system', content: rewriterSystemPrompt(jdKeywords) },
      {
        role: 'user',
        content: `Original bullet:\n"${target.original}"\n\nContext: ${target.parentLabel}\n\nReturn only JSON.`,
      },
    ],
  });
  const resp = RewriteLLMResponseSchema.parse(parseLLMJson<RewriteLLMResponse>(res.content));
  return { resp, stub: false };
}

async function callValidator(
  original: string,
  rewritten: string,
): Promise<ValidationResult> {
  if (!env.groq.apiKey) {
    // stub validator: flag only the clearly unsafe cases — added digits, added all-caps acronyms not in original
    const flags: ValidationFlag[] = [];
    const originalDigits = original.match(/\d+/g) ?? [];
    const rewrittenDigits = rewritten.match(/\d+/g) ?? [];
    if (rewrittenDigits.length > originalDigits.length) {
      flags.push({ type: 'added_metric', detail: 'rewrite introduces a number not in the original' });
    }
    return { passed: flags.length === 0, flags };
  }
  const res = await groqChat({
    model: env.groq.validatorModel,
    temperature: 0,
    maxTokens: 300,
    responseFormat: 'json_object',
    messages: [
      { role: 'system', content: validatorSystemPrompt() },
      {
        role: 'user',
        content: `ORIGINAL: "${original}"\nREWRITTEN: "${rewritten}"\n\nReturn only JSON.`,
      },
    ],
  });
  return ValidationResultSchema.parse(parseLLMJson<ValidationResult>(res.content));
}

// If validator fails OR length drift exceeded, we keep the rewrite in the result
// (so the UI can show what was flagged) but the UI shows the original as the
// "accepted by default" text per the product rules.
export async function rewriteBullet(
  target: BulletTarget,
  jdKeywords: string[],
): Promise<BulletRewrite> {
  const { resp } = await callRewriter(target, jdKeywords);

  // if the model skipped, return a pass-through with the original
  if (resp.skipped) {
    return BulletRewriteSchema.parse({
      bulletId: target.bulletId,
      section: target.section,
      parentId: target.parentId,
      original: target.original,
      rewritten: target.original,
      keywordsInjected: [],
      reasoning: resp.skipReason ?? resp.reasoning,
      validation: { passed: true, flags: [] },
    });
  }

  let validation = await callValidator(target.original, resp.rewritten);

  // mechanical post-check: length drift is cheap to verify and the LLM validator
  // sometimes misses it. If drift exceeds the cap, add a flag.
  if (lengthDriftExceeded(target.original, resp.rewritten)) {
    validation = {
      passed: false,
      flags: [
        ...validation.flags,
        {
          type: 'changed_meaning',
          detail: `rewrite length drifted more than ${Math.round(REWRITE_LENGTH_DRIFT_MAX * 100)}% from the original`,
        },
      ],
    };
  }

  return BulletRewriteSchema.parse({
    bulletId: target.bulletId,
    section: target.section,
    parentId: target.parentId,
    original: target.original,
    rewritten: resp.rewritten,
    keywordsInjected: resp.keywordsInjected,
    reasoning: resp.reasoning,
    validation,
  });
}

// naive keyword extraction — the full analysis JSON already has matched + missing
// keywords; we pass those through instead of re-extracting from the JD.
export function selectJdKeywords(analysisKeywords: { matched: string[]; missing: string[] }): string[] {
  // prefer missing keywords first (weaving them in is the goal),
  // then matched ones so the rewriter keeps reinforcing what's already there.
  return [...analysisKeywords.missing.slice(0, 10), ...analysisKeywords.matched.slice(0, 5)];
}

export interface RunRewriteInput {
  analysisId: string;
  parsed: ParsedResume;
  jdKeywords: string[];
  bulletIds?: string[]; // if undefined → rewrite all
}

export async function runRewrite({
  analysisId,
  parsed,
  jdKeywords,
  bulletIds,
}: RunRewriteInput): Promise<RewriteResult> {
  const all = collectBullets(parsed);
  const targets = bulletIds
    ? all.filter((t) => bulletIds.includes(t.bulletId))
    : all.slice(0, REWRITE_MAX_BULLETS_PER_REQUEST);

  // run bullets in parallel with a small concurrency cap so we don't hammer groq
  const CONCURRENCY = 4;
  const results: BulletRewrite[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        try {
          return await rewriteBullet(t, jdKeywords);
        } catch (err) {
          // one bullet failing shouldn't poison the whole run — return a pass-through
          const msg = err instanceof GroqError ? err.message : (err as Error).message;
          return BulletRewriteSchema.parse({
            bulletId: t.bulletId,
            section: t.section,
            parentId: t.parentId,
            original: t.original,
            rewritten: t.original,
            keywordsInjected: [],
            reasoning: `error: ${msg}`,
            validation: { passed: true, flags: [] },
          });
        }
      }),
    );
    results.push(...batchResults);
  }

  const rewritten = results.filter((r) => r.rewritten !== r.original).length;
  const flagged = results.filter((r) => !r.validation.passed).length;
  const skipped = results.length - rewritten;

  // rough score delta: each successful, validator-passed rewrite is worth a point,
  // capped at +20. Real scoring happens if we re-run analysis, but this is a cheap hint.
  const netGood = results.filter(
    (r) => r.rewritten !== r.original && r.validation.passed,
  ).length;
  const predictedAtsScoreDelta = Math.min(20, netGood);

  return {
    id: newRewriteId(),
    analysisId,
    bullets: results,
    summary: {
      totalBullets: results.length,
      rewritten,
      skipped,
      flagged,
    },
    predictedAtsScoreDelta,
    createdAt: new Date().toISOString(),
  };
}
