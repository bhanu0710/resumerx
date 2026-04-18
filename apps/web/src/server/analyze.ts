import 'server-only';
import {
  AnalysisLLMSchema,
  type Analysis,
  type AnalysisLLM,
  type ParsedResume,
} from '@resumerx/shared';
import { ATS_RULES } from '@resumerx/shared/ats-rules';
import { env } from './env';
import { groqChat } from './groq';
import { recordLlmCall } from './llm-audit';

// Build the analysis prompt. The ATS rules are the single source of truth —
// /how-ats-works renders the same list, so the UI and the prompt can't drift.
function buildSystemPrompt(): string {
  const rulesText = ATS_RULES.map((r) => `- [${r.category}] ${r.title}: ${r.description}`).join(
    '\n',
  );

  return `You are an ATS (applicant tracking system) analyst. Your job is to score a resume against a job description and identify specific, actionable issues.

You must follow these absolute rules:
- Do NOT invent facts about the candidate. Only reference what is in the resume text.
- Do NOT recommend adding metrics, tools, or scope that aren't already supported by the resume.
- Keyword matching means: keywords from the JD that the resume's existing content could reasonably claim.
- Be specific. "Improve your summary" is useless. "Your summary doesn't mention Python, which the JD lists as required" is useful.

ATS rules you score against:
${rulesText}

Your output must be valid JSON matching this TypeScript type (do not wrap in markdown):

{
  "overallScore": number (0-100),
  "atsScore": number (0-100),
  "atsIssues": Array<{ severity: "high"|"med"|"low", issue: string, fix: string, location?: string }>,
  "keywordMatch": { matched: string[], missing: string[], score: number (0-100), densityNote: string },
  "sections": Array<{ name: string, strengths: string[], weaknesses: string[], suggestions: string[] }>
}

Keep arrays focused: 3-8 atsIssues, 5-15 keywords each, 3-6 sections.`;
}

function buildUserPrompt(parsed: ParsedResume, jd: string): string {
  // Compact the parsed resume — the raw text alone would burn tokens on PDF noise.
  const exp = parsed.experience
    .map(
      (e) =>
        `- ${e.title} @ ${e.company} (${e.startDate}–${e.endDate})\n${e.bullets.map((b) => `  • ${b.text}`).join('\n')}`,
    )
    .join('\n');

  const projects = (parsed.projects ?? [])
    .map(
      (p) =>
        `- ${p.name}${p.tech?.length ? ` [${p.tech.join(', ')}]` : ''}\n${p.bullets.map((b) => `  • ${b.text}`).join('\n')}`,
    )
    .join('\n');

  const edu = parsed.education
    .map((e) => `- ${e.degree}${e.field ? `, ${e.field}` : ''} — ${e.institution}`)
    .join('\n');

  return `## Job description
${jd}

## Resume

**Contact:** ${parsed.contact.name ?? '—'} | ${parsed.contact.email ?? '—'}

**Summary:** ${parsed.summary ?? '(none)'}

**Experience:**
${exp || '(none)'}

**Projects:**
${projects || '(none)'}

**Education:**
${edu || '(none)'}

**Skills (technical):** ${parsed.skills.technical.join(', ') || '(none)'}
${parsed.skills.tools?.length ? `**Tools:** ${parsed.skills.tools.join(', ')}\n` : ''}

Return only JSON.`;
}

function parseLLMJson(raw: string): AnalysisLLM {
  // models sometimes wrap in ```json despite response_format — strip defensively
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');
  const obj = JSON.parse(trimmed);
  return AnalysisLLMSchema.parse(obj);
}

// heuristic fallback used when GROQ_API_KEY is missing (dev) — so the full
// flow still renders something believable locally without burning groq credits.
function stubAnalysisFromHeuristics(parsed: ParsedResume, jd: string): AnalysisLLM {
  const jdLower = jd.toLowerCase();
  const skillsAll = [
    ...parsed.skills.technical,
    ...(parsed.skills.tools ?? []),
    ...(parsed.skills.soft ?? []),
  ];
  const matched = skillsAll.filter((s) => jdLower.includes(s.toLowerCase()));
  const missingGuesses = [
    'leadership',
    'mentoring',
    'testing',
    'ci/cd',
    'code review',
    'architecture',
  ].filter((k) => jdLower.includes(k) && !skillsAll.some((s) => s.toLowerCase() === k));
  const kwScore = skillsAll.length
    ? Math.round((matched.length / Math.max(1, matched.length + missingGuesses.length)) * 100)
    : 0;

  return {
    overallScore: Math.min(95, 50 + matched.length * 4),
    atsScore: parsed.experience.length > 0 && parsed.skills.technical.length > 0 ? 78 : 55,
    atsIssues: [
      {
        severity: 'med',
        issue: 'Summary section is missing or short',
        fix: 'Add a 2-3 line summary that names your role, years of experience, and core stack.',
        location: 'top',
      },
      {
        severity: 'low',
        issue: 'Dev mode fallback analysis',
        fix: 'Set GROQ_API_KEY to get the real LLM analysis.',
      },
    ],
    keywordMatch: {
      matched,
      missing: missingGuesses,
      score: kwScore,
      densityNote:
        matched.length > 3
          ? 'decent keyword coverage'
          : 'keyword coverage is thin — consider weaving JD terms into existing bullets where honestly true',
    },
    sections: [
      {
        name: 'Experience',
        strengths: parsed.experience.length ? ['roles and dates parsed cleanly'] : [],
        weaknesses: parsed.experience.length ? [] : ['no experience section detected'],
        suggestions: ['ensure bullets start with a strong verb and describe impact'],
      },
      {
        name: 'Skills',
        strengths: parsed.skills.technical.length > 5 ? ['strong technical breadth'] : [],
        weaknesses: parsed.skills.technical.length < 3 ? ['skills list is thin'] : [],
        suggestions: ['group tools vs languages vs frameworks for readability'],
      },
    ],
  };
}

export interface RunAnalysisInput {
  analysisId: string;
  parsed: ParsedResume;
  jobDescription: string;
}

export interface RunAnalysisOutput {
  analysis: Analysis;
  // telemetry — written to llm_calls in phase 9
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  usedStub: boolean;
}

export async function runAnalysis({
  analysisId,
  parsed,
  jobDescription,
}: RunAnalysisInput): Promise<RunAnalysisOutput> {
  if (!env.groq.apiKey) {
    const llm = stubAnalysisFromHeuristics(parsed, jobDescription);
    return {
      analysis: { ...llm, id: analysisId, createdAt: new Date().toISOString() },
      model: 'stub-heuristic',
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      usedStub: true,
    };
  }

  const res = await groqChat({
    model: env.groq.rewriteModel,
    temperature: 0.3,
    maxTokens: 2400,
    responseFormat: 'json_object',
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(parsed, jobDescription) },
    ],
  });
  void recordLlmCall({
    purpose: 'analyze',
    model: res.model,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    latencyMs: res.latencyMs,
    parentId: analysisId,
  });

  const llm = parseLLMJson(res.content);
  return {
    analysis: { ...llm, id: analysisId, createdAt: new Date().toISOString() },
    model: res.model,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    latencyMs: res.latencyMs,
    usedStub: false,
  };
}
