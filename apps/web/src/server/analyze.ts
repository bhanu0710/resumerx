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

  return `You are doing two jobs in one pass on this resume and job description. Be specific and concrete. Vague generic feedback is useless — it wastes the candidate's time.

JOB 1 — SENIOR HIRING MANAGER (brutally honest, not kind).
Pretend you are a senior hiring manager at a top company in the industry implied by the JD. Tell the candidate honestly what is weak, what is missing, and what would make you reject this resume in the first 10 seconds. Do not soften. Call out vague bullets, lack of impact, seniority mismatch, career-gap red flags, buzzword salad, formatting that an ATS will mangle, and anything that signals "junior" when the JD wants senior (or vice versa). These observations go into atsIssues (severity "high" = reject-worthy) and sections.weaknesses.

JOB 2 — ATS / JD MATCH ANALYST.
Compare the resume against the JD and tell the candidate exactly:
- which keywords from the JD are missing from the resume (keywordMatch.missing)
- which keywords are present (keywordMatch.matched)
- which existing skills or experiences they should highlight more prominently (sections.suggestions, prefixed "Highlight: ...")
- how to restructure specific bullet points to pass ATS screening (sections.suggestions, prefixed "Restructure: <original phrase> → <suggested phrase>")

ABSOLUTE RULES — breaking any of these makes the feedback harmful:
- Do NOT invent facts about the candidate. Only reference text that is actually in the resume.
- Do NOT recommend adding metrics, tools, or scope that aren't already supported by the resume. You may say "add a metric if you have one for X" but never fabricate numbers.
- Keywords counted as "matched" must be genuinely covered by the resume content, not just name-dropped.
- Be specific. "Improve your summary" is useless. "Your summary doesn't mention Python, which the JD lists as required" is useful.
- Harsh is fine. Rude or demeaning is not.

ATS rules you score against:
${rulesText}

Your output must be valid JSON matching this TypeScript type (do not wrap in markdown):

{
  "overallScore": number (0-100, how likely this resume clears a first-round screen for THIS JD),
  "atsScore": number (0-100, pure ATS parseability + keyword coverage),
  "atsIssues": Array<{ severity: "high"|"med"|"low", issue: string, fix: string, location?: string }>,
  "keywordMatch": { matched: string[], missing: string[], score: number (0-100), densityNote: string },
  "sections": Array<{ name: string, strengths: string[], weaknesses: string[], suggestions: string[] }>
}

Keep arrays focused: 4-8 atsIssues (at least one "high" if a rejection trigger exists), 5-15 keywords each side, 3-6 sections covering Summary, Experience, Skills, Projects, Education as applicable.

EXAMPLES of the specificity level required:

Bad atsIssue (rejected):
  { "severity": "high", "issue": "Experience section is weak", "fix": "Make it stronger" }

Good atsIssue (what you should produce):
  { "severity": "high", "issue": "Three of your last four bullets at Acme start with 'Responsible for' — recruiters skim the first word of every bullet and this reads as a job-description dump, not accomplishments", "fix": "Rewrite these three bullets to start with an action verb (Built, Shipped, Led, Reduced). Keep the scope but flip the opener.", "location": "experience: Senior SWE @ Acme" }

Bad section weakness (rejected):
  "Skills section could be better"

Good section weakness (what you should produce):
  "Skills lists 'Microsoft Office, teamwork, hardworking' alongside 'Kubernetes, gRPC' — the soft-skill filler dilutes the senior-infra signal the JD is asking for"

Bad keyword densityNote (rejected):
  "keyword match is okay"

Good keyword densityNote (what you should produce):
  "You're matching 7 of 14 must-have keywords. The three highest-weight ones the JD repeats — 'distributed systems', 'observability', 'on-call' — are missing entirely, and your current experience honestly covers all three."`;
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
