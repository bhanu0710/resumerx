import 'server-only';
import {
  BulletRewriteSchema,
  FinalReviewSchema,
  RewriteLLMResponseSchema,
  SectionRewriteSchema,
  ValidationResultSchema,
  rewriteId as newRewriteId,
  REWRITE_LENGTH_DRIFT_MAX,
  REWRITE_MAX_BULLETS_PER_REQUEST,
  type Analysis,
  type ATSIssue,
  type BulletRewrite,
  type FinalReview,
  type ParsedResume,
  type RewriteLLMResponse,
  type RewriteResult,
  type SectionFeedback,
  type SectionRewrite,
  type ValidationResult,
  type ValidationFlag,
} from '@resumerx/shared';
import { env } from './env';
import { groqChat, GroqError } from './groq';
import { recordLlmCall } from './llm-audit';

// Flatten experience + projects into a list of rewritable bullets.
// Per spec: bullets live in Experience and Projects only. Summary/Education/Skills/Certifications are never rewritten.
export interface BulletTarget {
  bulletId: string;
  section: 'experience' | 'projects';
  parentId: string;
  parentLabel: string; // "Senior SWE @ Acme" | "Project: FooBar"
  original: string;
  // Specific analysis findings the rewriter MUST act on for this bullet.
  // Built by matching atsIssue.location and section suggestions against the
  // bullet's role context. Empty for bullets the analysis didn't single out.
  guidance?: string[];
}

// Match analysis findings to a specific bullet/role. Returns an array of
// concrete instructions like:
//   "Analysis flagged: bullets at this role start with 'Responsible for' — fix that"
//   "Analysis suggests: Restructure: 'helped onboard users' → 'drove onboarding for 2k users'"
// Only findings that clearly reference this bullet's role or text are included
// — we don't dump every analysis issue onto every bullet (that would dilute the prompt).
function buildBulletGuidance(
  target: Omit<BulletTarget, 'guidance'>,
  parentLabel: string,
  parentRoleText: string, // "Senior SWE Acme" lowercased — for substring match against atsIssue.location
  bulletTextLower: string,
  atsIssues: ATSIssue[],
  sectionFeedback: SectionFeedback[],
): string[] {
  const out: string[] = [];

  // 1. ATS issues whose location references this bullet's role
  for (const issue of atsIssues) {
    if (!issue.location) continue;
    const loc = issue.location.toLowerCase();
    if (
      loc.includes(parentRoleText) ||
      parentRoleText.split(/\s+/).some((w) => w.length >= 4 && loc.includes(w))
    ) {
      out.push(`[${issue.severity}] ${issue.issue} → fix: ${issue.fix}`);
    }
  }

  // 2. Section feedback for Experience / Projects — pull suggestions whose text
  // references this bullet's role or quotes phrases from the bullet itself.
  const targetSectionName = target.section === 'experience' ? 'experience' : 'projects';
  for (const sec of sectionFeedback) {
    if (!sec.name.toLowerCase().includes(targetSectionName)) continue;
    for (const sug of sec.suggestions ?? []) {
      const sugLower = sug.toLowerCase();
      // include if the suggestion mentions a long-enough word from the role label,
      // or quotes a 6+ char chunk of the original bullet
      const refsRole = parentRoleText
        .split(/\s+/)
        .some((w) => w.length >= 4 && sugLower.includes(w));
      const refsBullet = (() => {
        // crude phrase match: any 4+ word substring of the original that appears in the suggestion
        const words = bulletTextLower.split(/\s+/);
        for (let i = 0; i + 4 <= words.length; i++) {
          const phrase = words.slice(i, i + 4).join(' ');
          if (phrase.length >= 12 && sugLower.includes(phrase)) return true;
        }
        return false;
      })();
      if (refsRole || refsBullet || sug.startsWith('Restructure:') || sug.startsWith('Highlight:')) {
        out.push(`Suggestion: ${sug}`);
      }
    }
    // also weaknesses for the same section if they reference this role
    for (const w of sec.weaknesses ?? []) {
      const wLower = w.toLowerCase();
      const refsRole = parentRoleText
        .split(/\s+/)
        .some((word) => word.length >= 4 && wLower.includes(word));
      if (refsRole) {
        out.push(`Weakness: ${w}`);
      }
    }
  }

  // dedupe + cap (a bullet rewrite prompt with 8 instructions is no better than 4)
  return Array.from(new Set(out)).slice(0, 5);
}

export function collectBullets(parsed: ParsedResume, analysis?: Analysis): BulletTarget[] {
  const out: BulletTarget[] = [];
  const atsIssues = analysis?.atsIssues ?? [];
  const sectionFeedback = analysis?.sections ?? [];

  for (const exp of parsed.experience) {
    const parentLabel = `${exp.title} @ ${exp.company}`;
    const parentRoleText = `${exp.title} ${exp.company}`.toLowerCase();
    for (const b of exp.bullets) {
      const target: BulletTarget = {
        bulletId: b.id,
        section: 'experience',
        parentId: exp.id,
        parentLabel,
        original: b.text,
      };
      target.guidance = buildBulletGuidance(
        target,
        parentLabel,
        parentRoleText,
        b.text.toLowerCase(),
        atsIssues,
        sectionFeedback,
      );
      out.push(target);
    }
  }
  for (const proj of parsed.projects ?? []) {
    const parentLabel = `Project: ${proj.name}`;
    const parentRoleText = proj.name.toLowerCase();
    for (const b of proj.bullets) {
      const target: BulletTarget = {
        bulletId: b.id,
        section: 'projects',
        parentId: proj.id,
        parentLabel,
        original: b.text,
      };
      target.guidance = buildBulletGuidance(
        target,
        parentLabel,
        parentRoleText,
        b.text.toLowerCase(),
        atsIssues,
        sectionFeedback,
      );
      out.push(target);
    }
  }
  return out;
}

function rewriterSystemPrompt(jdKeywords: string[]): string {
  return `You rewrite a single resume bullet to the industry-standard XYZ format used at Google, Meta, and top tech companies:

  "Accomplished [X] as measured by [Y], by doing [Z]"

Operationally this means every bullet must contain three components:
  ACTION VERB + TASK/HOW + MEASURABLE RESULT (scope, %, $, time, count)

Canonical examples a Google/Amazon recruiter would rate top-10%:
- "Built checkout service handling 12k req/min, cutting p99 latency from 900ms to 180ms by introducing request coalescing"
- "Led 4-engineer migration of 60 services off Mongo to Postgres, saving $14k/mo in hosting and eliminating nightly replication lag"
- "Shipped onboarding redesign that lifted day-7 activation from 31% to 44% across 2M monthly signups"
- "Reduced CI build time from 28min to 6min by parallelizing test shards, unblocking 80 engineers"

Length target: 1–2 lines when rendered (roughly 15–28 words). Longer bullets get skimmed past.

ABSOLUTE RULES — breaking any of these makes the product useless:
1. Do NOT invent facts. If the original says "worked on", don't upgrade to "led".
2. Do NOT invent metrics. If the original has no numbers, DO NOT make them up.
3. If the original lacks a measurable result, rewrite Action + Task as strongly as you can AND phrase the "reasoning" field as a SPECIFIC question the user can answer to add a real metric. Example: "What was latency before vs after? How many users did this affect? A number here turns this into a top-10% bullet."
4. Do NOT add technologies, tools, scope, team size, or seniority not in the original.
5. Keep the rewrite length within ±20% of the original.
6. Start with a strong past-tense action verb from this industry-standard list: Built, Shipped, Led, Drove, Designed, Architected, Reduced, Cut, Grew, Launched, Migrated, Scaled, Owned, Delivered, Automated, Optimized, Refactored, Unblocked, Mentored. BANNED weak openers: worked on, helped, assisted with, was responsible for, participated in, contributed to, involved in, tasked with.
7. Weave in a JD keyword ONLY if the original work honestly covers it. Never force-fit.
8. One idea per bullet. If the original crams two accomplishments together, pick the stronger one.
9. Only use skipped: true if the original is already in perfect XYZ form — this should be rare.

JD keywords you may weave in where honest: ${jdKeywords.join(', ') || '(none specified)'}

The user message MAY include an "ANALYSIS FINDINGS" block listing specific issues the analysis already flagged for this bullet (weak verb, missing metric, suggested restructure, etc.). When that block is present, your rewrite is judged primarily on whether it ACTS ON those findings — not on generic XYZ improvements. If the findings say "Restructure: X → Y", produce something close to Y (subject to the no-fabrication rules). If the findings say "fix: rewrite this bullet to start with an action verb", do that. Generic-looking output that ignores the findings is a failed rewrite.

In your "reasoning" field, briefly cite which finding(s) you addressed — e.g. "Addressed weak-opener flag by switching 'Responsible for' → 'Led'; kept scope unchanged."

Return valid JSON matching this shape (no markdown):
{
  "rewritten": string,
  "keywordsInjected": string[],
  "reasoning": string (cite the analysis findings you addressed; if no findings and no metric, phrase reasoning as a question the user can answer to add a real metric),
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

// Compact summary of the whole analysis the rewriter sees on EVERY bullet.
// Without this, bullets that didn't get a specific guidance match would fall
// back to the generic XYZ prompt and produce output that ignores the
// diagnosis entirely.
function buildAnalysisContextBlock(analysis?: Analysis): string {
  if (!analysis) return '';
  const parts: string[] = [];

  const highIssues = analysis.atsIssues.filter((i) => i.severity === 'high').slice(0, 4);
  const medIssues = analysis.atsIssues.filter((i) => i.severity === 'med').slice(0, 4);
  if (highIssues.length || medIssues.length) {
    const issuesText = [...highIssues, ...medIssues]
      .map((i) => `- [${i.severity}] ${i.issue} → fix: ${i.fix}${i.location ? ` (loc: ${i.location})` : ''}`)
      .join('\n');
    parts.push(`Top ATS issues from analysis:\n${issuesText}`);
  }

  const expSec = analysis.sections.find((s) => /experience/i.test(s.name));
  if (expSec && (expSec.weaknesses.length || expSec.suggestions.length)) {
    const items = [
      ...expSec.weaknesses.slice(0, 3).map((w) => `- weakness: ${w}`),
      ...expSec.suggestions.slice(0, 4).map((s) => `- suggestion: ${s}`),
    ].join('\n');
    parts.push(`Experience-section feedback:\n${items}`);
  }

  if (analysis.keywordMatch.missing.length) {
    parts.push(
      `Missing JD keywords (weave in ONLY where the original honestly covers them): ${analysis.keywordMatch.missing.slice(0, 10).join(', ')}`,
    );
  }

  return parts.length === 0 ? '' : `\n\n## Analysis context (act on this)\n${parts.join('\n\n')}`;
}

// Per-bullet user message. Combines: (a) the original bullet, (b) the global
// analysis context (always present when analysis exists), and (c) the per-bullet
// specific findings when our matcher found any. The rewriter is judged on
// whether it addresses both layers.
function buildBulletUserPrompt(target: BulletTarget, analysis?: Analysis): string {
  const guidance = target.guidance ?? [];
  const ctx = buildAnalysisContextBlock(analysis);
  const guidanceBlock =
    guidance.length > 0
      ? `\n\n## Specific findings for THIS bullet (highest priority)\n${guidance.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
      : '';
  const trailer = ctx || guidanceBlock
    ? '\n\nThe rewrite is judged on whether it addresses the analysis context and specific findings above. A rewrite that ignores them is a failed rewrite. Cite which finding(s) you addressed in "reasoning". Return only JSON.'
    : '\n\nReturn only JSON.';
  return `Original bullet:\n"${target.original}"\n\nContext: ${target.parentLabel}${ctx}${guidanceBlock}${trailer}`;
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
  analysis?: Analysis,
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
        content: buildBulletUserPrompt(target, analysis),
      },
    ],
  });
  void recordLlmCall({
    purpose: 'rewrite_bullet',
    model: res.model,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    latencyMs: res.latencyMs,
    parentId: target.bulletId,
  });
  const resp = RewriteLLMResponseSchema.parse(parseLLMJson<RewriteLLMResponse>(res.content));
  return { resp, stub: false };
}

async function callValidator(original: string, rewritten: string): Promise<ValidationResult> {
  if (!env.groq.apiKey) {
    // stub validator: flag only the clearly unsafe cases — added digits, added all-caps acronyms not in original
    const flags: ValidationFlag[] = [];
    const originalDigits = original.match(/\d+/g) ?? [];
    const rewrittenDigits = rewritten.match(/\d+/g) ?? [];
    if (rewrittenDigits.length > originalDigits.length) {
      flags.push({
        type: 'added_metric',
        detail: 'rewrite introduces a number not in the original',
      });
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
  const validation = ValidationResultSchema.parse(parseLLMJson<ValidationResult>(res.content));
  void recordLlmCall({
    purpose: 'validate',
    model: res.model,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    latencyMs: res.latencyMs,
    validation,
  });
  return validation;
}

// If validator fails OR length drift exceeded, we keep the rewrite in the result
// (so the UI can show what was flagged) but the UI shows the original as the
// "accepted by default" text per the product rules.
export async function rewriteBullet(
  target: BulletTarget,
  jdKeywords: string[],
  analysis?: Analysis,
): Promise<BulletRewrite> {
  const { resp } = await callRewriter(target, jdKeywords, analysis);

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
export function selectJdKeywords(analysisKeywords: {
  matched: string[];
  missing: string[];
}): string[] {
  // prefer missing keywords first (weaving them in is the goal),
  // then matched ones so the rewriter keeps reinforcing what's already there.
  return [...analysisKeywords.missing.slice(0, 10), ...analysisKeywords.matched.slice(0, 5)];
}

function sectionRewriterPrompt(): string {
  return `You rewrite a candidate's resume SUMMARY and SKILLS section to industry-standard quality — the voice used at Google, Amazon, Meta, Stripe, and other tier-1 employers in the industry implied by the JD.

Step 1: from the JD, infer the industry and 2-3 representative top companies (e.g. "fintech → Stripe, Plaid, Ramp"; "infra SaaS → Vercel, Supabase, Netlify"; "ml platforms → Anthropic, Modal, Weights & Biases"). Record in "industryInferred" and "referenceCompanies".

Step 2: rewrite the summary to the industry-standard Professional Summary format:
  [Role + years] | [Core domain/stack proven by resume] | [1-2 strongest outcomes from resume]
  - Exactly 2-3 sentences (never more — recruiters skim the first 6 seconds).
  - 40-60 words total.
  - Third person implied (no "I", no "My").
  - No clichés: "passionate", "driven", "results-oriented", "proven track record", "seasoned", "dynamic", "motivated", "hardworking", "team player".
  - Open with role + seniority + years (e.g. "Senior backend engineer with 6 years building...").
  - Name concrete tech/domains the resume actually proves.
  - End with the candidate's single strongest outcome pattern.

Step 3: rewrite the skills list to industry-standard format:
  - 8-20 items total — more signals unfocused, fewer signals thin.
  - Hard skills only. Drop generic soft skills ("teamwork", "communication", "leadership") — those belong in bullets, not skills.
  - Drop obsolete/irrelevant ("Microsoft Office", "Windows", "Internet"), drop vague ("problem solving").
  - Order by relevance to the JD.
  - Use canonical names: "JavaScript" not "JS", "PostgreSQL" not "Postgres DB", "Kubernetes" not "K8s" (unless the resume uses K8s).
  - Keep only skills the resume genuinely demonstrates.

ABSOLUTE RULES:
- Do NOT invent experience, companies, years, or tools the resume does not already mention.
- If the summary or skills section is empty, produce a rewrite from what the experience section proves. Note this in "reasoning".
- If nothing meaningful can be rewritten without fabrication, omit that subfield.

Return valid JSON (no markdown):
{
  "industryInferred": string,
  "referenceCompanies": string[],
  "summary"?: { "original": string, "rewritten": string, "reasoning": string },
  "skills"?: { "original": string[], "rewritten": string[], "reasoning": string }
}`;
}

function finalReviewPrompt(): string {
  return `You are doing a final polish pass against industry resume standards used at Google, Amazon, Meta, and top consultancies. Find and replace:

- TENSE: current role bullets in present tense, past roles in past tense; never mix within a single role. Flag every deviation.
- CLICHÉS (banned industry-wide): "team player", "hardworking", "self-starter", "passionate about", "results-driven", "detail-oriented", "go-getter", "synergy", "think outside the box", "proven track record", "seasoned professional", "dynamic individual", "strong communicator", "excellent interpersonal skills", "thought leader", "rockstar", "ninja", "guru", "world-class".
- GENERIC FILLER (describes anyone): "helped the team", "various projects", "multiple stakeholders", "cross-functional collaboration" (without specifics), "end-to-end", "leveraged", "utilized" (use "used"), "facilitated", "spearheaded", "orchestrated" (when "led" is honest).
- WEAK VERBS: "worked on", "was responsible for", "assisted with", "participated in", "involved in", "contributed to", "tasked with", "handled".
- BUZZWORD SALAD: strings of adjectives with no object ("innovative, strategic, results-oriented professional") — replace with concrete outcomes.
- FIRST PERSON: "I built", "my project", "my team" — resumes are implicit third-person; strip.
- PASSIVE VOICE in accomplishments: "was built by me" → "built".
- MISSING QUANTIFICATION on accomplishments that clearly had scale (flag as "generic" with a question in reason).
- INCONSISTENT PUNCTUATION: bullets ending in periods vs. not (flag if mixed — industry standard is no trailing period on bullet points, but consistency matters more than the choice).

For each finding, propose specific language grounded in what the resume actually shows. Replacement must preserve meaning.

ABSOLUTE RULES:
- Do NOT invent facts, numbers, or scope. Replacements must still be true to the original.
- Be surgical. 0-12 items total. Prioritize highest-impact fixes (clichés + weak verbs in the first 1/3 of the resume matter most — that's where recruiters look).

Return valid JSON (no markdown):
{
  "items": Array<{
    "location": string (e.g. "summary", "experience: Senior SWE @ Acme", "skills"),
    "issue": "cliche" | "generic" | "tense_inconsistency" | "weak_verb" | "buzzword",
    "original": string,
    "replacement": string,
    "reason": string
  }>,
  "overallNote"?: string (one sentence overall polish read)
}`;
}

function resumeSnapshotForPrompt(parsed: ParsedResume): string {
  const exp = parsed.experience
    .map(
      (e) =>
        `- ${e.title} @ ${e.company} (${e.startDate}–${e.endDate})\n${e.bullets.map((b) => `  • ${b.text}`).join('\n')}`,
    )
    .join('\n');
  return `**Summary:** ${parsed.summary ?? '(none)'}

**Skills:** ${parsed.skills.technical.join(', ') || '(none)'}${parsed.skills.tools?.length ? ` | tools: ${parsed.skills.tools.join(', ')}` : ''}

**Experience:**
${exp || '(none)'}`;
}

// Pull the analysis's feedback for Summary and Skills specifically so the
// section rewriter knows what the analysis already flagged for those sections.
function summarizeSectionFindings(analysis?: Analysis): string {
  if (!analysis) return '';
  const wanted = ['summary', 'skills'];
  const lines: string[] = [];
  for (const sec of analysis.sections) {
    if (!wanted.some((w) => sec.name.toLowerCase().includes(w))) continue;
    if (sec.weaknesses?.length) {
      for (const w of sec.weaknesses) lines.push(`[${sec.name} weakness] ${w}`);
    }
    if (sec.suggestions?.length) {
      for (const s of sec.suggestions) lines.push(`[${sec.name} suggestion] ${s}`);
    }
  }
  for (const issue of analysis.atsIssues) {
    const loc = (issue.location ?? '').toLowerCase();
    if (loc.includes('summary') || loc.includes('skills') || loc === 'top') {
      lines.push(`[ats issue ${issue.severity}] ${issue.issue} → fix: ${issue.fix}`);
    }
  }
  return lines.length === 0 ? '' : `\n\n## Analysis findings to act on\n${lines.join('\n')}`;
}

async function rewriteSummaryAndSkills(
  parsed: ParsedResume,
  jobDescription: string,
  analysis?: Analysis,
): Promise<SectionRewrite | undefined> {
  if (!env.groq.apiKey) return undefined;
  try {
    const findings = summarizeSectionFindings(analysis);
    const res = await groqChat({
      model: env.groq.rewriteModel,
      temperature: 0.4,
      maxTokens: 900,
      responseFormat: 'json_object',
      messages: [
        { role: 'system', content: sectionRewriterPrompt() },
        {
          role: 'user',
          content: `## Job description\n${jobDescription}\n\n## Resume\n${resumeSnapshotForPrompt(parsed)}${findings}\n\nWhen the "Analysis findings to act on" block is present, your rewrite is judged primarily on whether it addresses those findings. Return only JSON.`,
        },
      ],
    });
    void recordLlmCall({
      purpose: 'rewrite_sections',
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      latencyMs: res.latencyMs,
    });
    return SectionRewriteSchema.parse(parseLLMJson(res.content));
  } catch {
    // section rewrite is advisory — a failure shouldn't block the bullet rewrite
    return undefined;
  }
}

async function runFinalReview(parsed: ParsedResume): Promise<FinalReview | undefined> {
  if (!env.groq.apiKey) return undefined;
  try {
    const res = await groqChat({
      model: env.groq.validatorModel,
      temperature: 0.2,
      maxTokens: 900,
      responseFormat: 'json_object',
      messages: [
        { role: 'system', content: finalReviewPrompt() },
        {
          role: 'user',
          content: `## Resume\n${resumeSnapshotForPrompt(parsed)}\n\nReturn only JSON.`,
        },
      ],
    });
    void recordLlmCall({
      purpose: 'final_review',
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      latencyMs: res.latencyMs,
    });
    return FinalReviewSchema.parse(parseLLMJson(res.content));
  } catch {
    return undefined;
  }
}

export interface RunRewriteInput {
  analysisId: string;
  parsed: ParsedResume;
  jdKeywords: string[];
  jobDescription?: string; // required for section rewrite; if absent, section pass is skipped
  bulletIds?: string[]; // if undefined → rewrite all
  // The full analysis result so the rewriter can act on the specific issues
  // and suggestions the analysis flagged (per-bullet guidance + section
  // feedback for the section rewriter).
  analysis?: Analysis;
}

async function runBulletRewrites(
  targets: BulletTarget[],
  jdKeywords: string[],
  analysis?: Analysis,
): Promise<BulletRewrite[]> {
  const CONCURRENCY = 4;
  const results: BulletRewrite[] = [];
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        try {
          return await rewriteBullet(t, jdKeywords, analysis);
        } catch (err) {
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
  return results;
}

export async function runRewrite({
  analysisId,
  parsed,
  jdKeywords,
  jobDescription,
  bulletIds,
  analysis,
}: RunRewriteInput): Promise<RewriteResult> {
  // Pass the analysis through so each bullet target carries the specific
  // findings the analysis flagged for it. This is what makes the rewrite
  // address the diagnosis instead of producing generic XYZ output.
  const all = collectBullets(parsed, analysis);
  const targets = bulletIds
    ? all.filter((t) => bulletIds.includes(t.bulletId))
    : all.slice(0, REWRITE_MAX_BULLETS_PER_REQUEST);

  if (targets.length === 0) {
    // Hard error — caller is bullet-iding nothing, OR the parsed resume has
    // no bullets in experience/projects. Either case means we shouldn't
    // persist an empty rewrite row that the kickoff page would then cache.
    throw new Error(
      `runRewrite: no bullet targets — parsed.experience=${parsed.experience.length} roles, parsed.projects=${parsed.projects?.length ?? 0}, totalBullets=${all.length}, requestedIds=${bulletIds?.length ?? 'all'}`,
    );
  }

  // three passes run in parallel — bullet rewrites are the heavy one; section
  // rewrite + final review each cost one extra LLM call.
  const [bulletResults, sectionRewrites, finalReview] = await Promise.all([
    runBulletRewrites(targets, jdKeywords, analysis),
    jobDescription
      ? rewriteSummaryAndSkills(parsed, jobDescription, analysis)
      : Promise.resolve(undefined),
    runFinalReview(parsed),
  ]);

  const rewritten = bulletResults.filter((r) => r.rewritten !== r.original).length;
  const flagged = bulletResults.filter((r) => !r.validation.passed).length;
  const skipped = bulletResults.length - rewritten;

  const netGood = bulletResults.filter(
    (r) => r.rewritten !== r.original && r.validation.passed,
  ).length;
  const predictedAtsScoreDelta = Math.min(20, netGood);

  return {
    id: newRewriteId(),
    analysisId,
    bullets: bulletResults,
    sectionRewrites,
    finalReview,
    summary: {
      totalBullets: bulletResults.length,
      rewritten,
      skipped,
      flagged,
    },
    predictedAtsScoreDelta,
    createdAt: new Date().toISOString(),
  };
}
