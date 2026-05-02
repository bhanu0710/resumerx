// Deterministic resume checks — the Resume Worded / Jobscan-style scorecard.
//
// These rules run on a ParsedResume with NO LLM calls. Every check is pure,
// fast, and produces the same verdict for the same input. The LLM-driven
// hiring-manager analysis runs alongside this and handles the subjective
// stuff; this module handles the objective stuff users expect to see as a
// stable checklist.
//
// Each check returns { id, name, category, verdict, score, detail, fix, evidence? }.
// Verdicts: 'pass' | 'warn' | 'fail'. Score is 0-100 contribution toward the
// overall checks score.

import { z } from 'zod';
import type { ParsedResume } from './schemas';

export const CheckVerdictSchema = z.enum(['pass', 'warn', 'fail']);
export type CheckVerdict = z.infer<typeof CheckVerdictSchema>;

export const CheckCategorySchema = z.enum([
  'impact', // measurable results, action verbs
  'format', // length, structure, ordering
  'content', // clichés, pronouns, tense
  'ats', // parseability, contact, dates
  'skills', // skills section quality
]);
export type CheckCategory = z.infer<typeof CheckCategorySchema>;

export const CheckResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: CheckCategorySchema,
  verdict: CheckVerdictSchema,
  score: z.number().min(0).max(100),
  detail: z.string(),
  fix: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const ResumeChecksSchema = z.object({
  overallScore: z.number().min(0).max(100),
  byCategory: z.record(z.string(), z.number().min(0).max(100)),
  checks: z.array(CheckResultSchema),
  passed: z.number(),
  warned: z.number(),
  failed: z.number(),
});
export type ResumeChecks = z.infer<typeof ResumeChecksSchema>;

// --- helpers --------------------------------------------------------------

const STRONG_VERBS = new Set([
  'built',
  'shipped',
  'led',
  'drove',
  'designed',
  'architected',
  'reduced',
  'cut',
  'grew',
  'launched',
  'migrated',
  'scaled',
  'owned',
  'delivered',
  'automated',
  'optimized',
  'refactored',
  'unblocked',
  'mentored',
  'created',
  'developed',
  'engineered',
  'implemented',
  'improved',
  'increased',
  'decreased',
  'eliminated',
  'streamlined',
  'transformed',
  'spearheaded',
  'pioneered',
  'introduced',
  'established',
  'achieved',
  'analyzed',
  'authored',
  'consolidated',
  'coordinated',
  'doubled',
  'tripled',
  'expanded',
  'integrated',
  'negotiated',
  'orchestrated',
  'overhauled',
  'partnered',
  'produced',
  'researched',
  'resolved',
  'restructured',
  'saved',
  'secured',
  'simplified',
  'sourced',
  'standardized',
  'supervised',
  'taught',
  'trained',
  'troubleshot',
]);

const WEAK_OPENERS = [
  'worked on',
  'helped',
  'assisted',
  'was responsible',
  'responsible for',
  'participated',
  'involved',
  'contributed to',
  'tasked with',
  'handled',
  'duties included',
  'in charge of',
];

const CLICHES = [
  'team player',
  'hardworking',
  'hard working',
  'self-starter',
  'self starter',
  'passionate about',
  'results-driven',
  'results driven',
  'detail-oriented',
  'detail oriented',
  'go-getter',
  'go getter',
  'synergy',
  'think outside the box',
  'proven track record',
  'seasoned professional',
  'dynamic individual',
  'strong communicator',
  'thought leader',
  'rockstar',
  'ninja',
  'guru',
  'world-class',
  'world class',
  'best of breed',
  'best-of-breed',
  'value add',
  'value-add',
  'wheelhouse',
  'low-hanging fruit',
  'move the needle',
  'circle back',
  'leverage' /* as filler verb */,
];

const SOFT_SKILLS_IN_SKILLS_SECTION = [
  'teamwork',
  'communication',
  'leadership',
  'problem solving',
  'problem-solving',
  'critical thinking',
  'time management',
  'creativity',
  'adaptability',
  'work ethic',
  'interpersonal',
  'collaboration',
  'flexibility',
];

const OBSOLETE_OR_GENERIC_SKILLS = [
  'microsoft office',
  'ms office',
  'word',
  'excel',
  'powerpoint',
  'outlook',
  'windows',
  'mac os',
  'macos',
  'internet',
  'email',
  'typing',
  'data entry',
];

const FIRST_PERSON_PATTERNS = [
  /\bi\s+(?:built|led|did|shipped|designed|created|developed|managed|worked|helped|wrote|owned)\b/i,
  /\bmy\s+(?:team|project|role|work|responsibilities)\b/i,
  /\bme\b/i,
];

// Has a number, %, $, or count-like word
const QUANTIFICATION_RE = /\d|%|\$|\bk\b|million|billion|thousand/i;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function startsWithStrongVerb(text: string): boolean {
  const first = tokenize(text)[0];
  return first ? STRONG_VERBS.has(first) : false;
}

function startsWithWeakOpener(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return WEAK_OPENERS.some((w) => lower.startsWith(w));
}

function getAllBullets(resume: ParsedResume): { text: string; where: string }[] {
  const out: { text: string; where: string }[] = [];
  for (const e of resume.experience) {
    for (const b of e.bullets) out.push({ text: b.text, where: `${e.title} @ ${e.company}` });
  }
  for (const p of resume.projects ?? []) {
    for (const b of p.bullets) out.push({ text: b.text, where: `Project: ${p.name}` });
  }
  return out;
}

function pct(num: number, denom: number): number {
  return denom === 0 ? 0 : Math.round((num / denom) * 100);
}

function ratio(num: number, denom: number): string {
  return `${num}/${denom}`;
}

// --- individual checks ----------------------------------------------------

type Check = (resume: ParsedResume) => CheckResult;

const checks: Check[] = [
  // ---- IMPACT (the highest-leverage category) ----------------------------
  (r) => {
    const bullets = getAllBullets(r);
    if (bullets.length === 0) {
      return {
        id: 'quantification_ratio',
        name: 'Bullets with measurable impact',
        category: 'impact',
        verdict: 'fail',
        score: 0,
        detail: 'No experience or project bullets detected.',
        fix: 'Add bullet points under each role describing what you did and the result.',
      };
    }
    const quantified = bullets.filter((b) => QUANTIFICATION_RE.test(b.text));
    const pctQuant = pct(quantified.length, bullets.length);
    const verdict: CheckVerdict = pctQuant >= 60 ? 'pass' : pctQuant >= 35 ? 'warn' : 'fail';
    return {
      id: 'quantification_ratio',
      name: 'Bullets with measurable impact',
      category: 'impact',
      verdict,
      score: Math.min(100, pctQuant + 10),
      detail: `${quantified.length} of ${bullets.length} bullets (${pctQuant}%) include a number, %, $, or scale indicator. Industry standard is at least 60%.`,
      fix:
        verdict === 'pass'
          ? undefined
          : 'Add metrics to your weakest bullets — users impacted, latency before/after, $ saved, % growth, team size led.',
      evidence: bullets
        .filter((b) => !QUANTIFICATION_RE.test(b.text))
        .slice(0, 3)
        .map((b) => `[${b.where}] "${b.text}"`),
    };
  },

  (r) => {
    const bullets = getAllBullets(r);
    if (bullets.length === 0) {
      return {
        id: 'strong_verb_openers',
        name: 'Bullets opening with strong action verb',
        category: 'impact',
        verdict: 'fail',
        score: 0,
        detail: 'No bullets to evaluate.',
      };
    }
    const strong = bullets.filter((b) => startsWithStrongVerb(b.text));
    const pctStrong = pct(strong.length, bullets.length);
    const verdict: CheckVerdict = pctStrong >= 80 ? 'pass' : pctStrong >= 50 ? 'warn' : 'fail';
    return {
      id: 'strong_verb_openers',
      name: 'Bullets opening with strong action verb',
      category: 'impact',
      verdict,
      score: pctStrong,
      detail: `${strong.length} of ${bullets.length} bullets (${pctStrong}%) start with a strong action verb (Built, Led, Shipped, Reduced, etc.).`,
      fix:
        verdict === 'pass'
          ? undefined
          : 'Rewrite weak openers to start with a concrete past-tense verb. Avoid "worked on", "helped", "responsible for".',
    };
  },

  (r) => {
    const bullets = getAllBullets(r);
    const weak = bullets.filter((b) => startsWithWeakOpener(b.text));
    const verdict: CheckVerdict = weak.length === 0 ? 'pass' : weak.length <= 2 ? 'warn' : 'fail';
    return {
      id: 'no_weak_openers',
      name: 'No banned weak-verb openers',
      category: 'impact',
      verdict,
      score: weak.length === 0 ? 100 : weak.length === 1 ? 70 : weak.length === 2 ? 50 : 20,
      detail:
        weak.length === 0
          ? 'No bullets begin with weak openers (worked on, helped, responsible for, etc.).'
          : `${weak.length} bullet${weak.length === 1 ? '' : 's'} start with a banned weak opener.`,
      fix: weak.length === 0 ? undefined : 'Replace with strong past-tense verbs (Built, Led, Shipped, Reduced).',
      evidence: weak.slice(0, 3).map((b) => `[${b.where}] "${b.text}"`),
    };
  },

  (r) => {
    // Repeated bullet openers within a single role — Resume Worded calls this out specifically
    const offenders: string[] = [];
    for (const e of r.experience) {
      const openers = e.bullets.map((b) => tokenize(b.text)[0] ?? '');
      const counts: Record<string, number> = {};
      for (const o of openers) counts[o] = (counts[o] ?? 0) + 1;
      for (const [verb, count] of Object.entries(counts)) {
        if (count >= 3 && verb) {
          offenders.push(`${e.title} @ ${e.company}: ${count} bullets start with "${verb}"`);
        }
      }
    }
    const verdict: CheckVerdict = offenders.length === 0 ? 'pass' : 'warn';
    return {
      id: 'repeated_openers',
      name: 'Bullet openers vary within each role',
      category: 'impact',
      verdict,
      score: offenders.length === 0 ? 100 : 60,
      detail:
        offenders.length === 0
          ? 'No role uses the same opening verb for 3+ bullets in a row.'
          : `${offenders.length} role${offenders.length === 1 ? '' : 's'} repeat the same bullet opener too often.`,
      fix:
        offenders.length === 0
          ? undefined
          : 'Recruiters skim the first word of every bullet — varying verbs makes the resume feel less repetitive.',
      evidence: offenders.slice(0, 3),
    };
  },

  // ---- FORMAT ------------------------------------------------------------
  (r) => {
    const bullets = getAllBullets(r);
    if (bullets.length === 0) {
      return {
        id: 'bullet_length',
        name: 'Bullets are 1–2 lines (15–28 words)',
        category: 'format',
        verdict: 'fail',
        score: 0,
        detail: 'No bullets to evaluate.',
      };
    }
    const tooLong = bullets.filter((b) => tokenize(b.text).length > 32);
    const tooShort = bullets.filter((b) => tokenize(b.text).length < 8);
    const bad = tooLong.length + tooShort.length;
    const pctBad = pct(bad, bullets.length);
    const verdict: CheckVerdict = pctBad === 0 ? 'pass' : pctBad <= 20 ? 'warn' : 'fail';
    return {
      id: 'bullet_length',
      name: 'Bullets are 1–2 lines (15–28 words)',
      category: 'format',
      verdict,
      score: 100 - pctBad,
      detail: `${tooLong.length} bullet${tooLong.length === 1 ? '' : 's'} too long (>32 words), ${tooShort.length} too short (<8 words). Target is 15–28 words per bullet.`,
      fix:
        verdict === 'pass'
          ? undefined
          : 'Long bullets get skimmed past; short bullets read as filler. Tighten to one idea per bullet.',
      evidence: [...tooLong, ...tooShort].slice(0, 3).map((b) => `[${b.where}] "${b.text.slice(0, 80)}…"`),
    };
  },

  (r) => {
    // Bullet count per role: 3-6 is the sweet spot
    const offenders: string[] = [];
    for (const e of r.experience) {
      if (e.bullets.length < 2) {
        offenders.push(`${e.title} @ ${e.company}: only ${e.bullets.length} bullet${e.bullets.length === 1 ? '' : 's'}`);
      } else if (e.bullets.length > 7) {
        offenders.push(`${e.title} @ ${e.company}: ${e.bullets.length} bullets (consider trimming)`);
      }
    }
    const verdict: CheckVerdict = offenders.length === 0 ? 'pass' : offenders.length <= 1 ? 'warn' : 'fail';
    return {
      id: 'bullets_per_role',
      name: 'Each role has 3–6 bullets',
      category: 'format',
      verdict,
      score: offenders.length === 0 ? 100 : offenders.length === 1 ? 70 : 40,
      detail:
        offenders.length === 0
          ? 'Every role has the right amount of detail (3–6 bullets).'
          : `${offenders.length} role${offenders.length === 1 ? '' : 's'} fall outside the 3–6 bullet range.`,
      fix:
        offenders.length === 0
          ? undefined
          : 'Senior roles should have 4–6 strong bullets; older / less relevant roles can have 2–3.',
      evidence: offenders,
    };
  },

  (r) => {
    // Summary present and right length
    const s = (r.summary ?? '').trim();
    const words = s ? tokenize(s).length : 0;
    let verdict: CheckVerdict;
    let detail: string;
    let fix: string | undefined;
    if (!s) {
      verdict = 'fail';
      detail = 'No professional summary detected.';
      fix = 'Add a 2–3 sentence summary at the top: role + years + core stack + strongest outcome pattern.';
    } else if (words < 25) {
      verdict = 'warn';
      detail = `Summary is ${words} words — too short to land.`;
      fix = 'Aim for 40–60 words: role + years + stack + one strongest outcome.';
    } else if (words > 80) {
      verdict = 'warn';
      detail = `Summary is ${words} words — recruiters skim the first 6 seconds; this is too long.`;
      fix = 'Cut to 40–60 words. Lead with role + years + core stack.';
    } else {
      verdict = 'pass';
      detail = `Summary is ${words} words — within the 40–60 word target.`;
    }
    return {
      id: 'summary_length',
      name: 'Professional summary 40–60 words',
      category: 'format',
      verdict,
      score: verdict === 'pass' ? 100 : verdict === 'warn' ? 60 : 0,
      detail,
      fix,
    };
  },

  // ---- CONTENT -----------------------------------------------------------
  (r) => {
    const allText = [
      r.summary ?? '',
      ...getAllBullets(r).map((b) => b.text),
      ...r.skills.technical,
      ...(r.skills.tools ?? []),
      ...(r.skills.soft ?? []),
    ]
      .join(' ')
      .toLowerCase();
    const found = CLICHES.filter((c) => allText.includes(c));
    const verdict: CheckVerdict = found.length === 0 ? 'pass' : found.length <= 2 ? 'warn' : 'fail';
    return {
      id: 'no_cliches',
      name: 'No banned clichés or buzzwords',
      category: 'content',
      verdict,
      score: Math.max(0, 100 - found.length * 25),
      detail:
        found.length === 0
          ? 'Clean — no industry-blacklisted clichés found.'
          : `Found ${found.length} cliché${found.length === 1 ? '' : 's'}: ${found.slice(0, 5).join(', ')}.`,
      fix:
        found.length === 0
          ? undefined
          : 'Replace clichés with concrete outcomes the resume already proves.',
    };
  },

  (r) => {
    const allText = [r.summary ?? '', ...getAllBullets(r).map((b) => b.text)].join('\n');
    const hits: string[] = [];
    for (const re of FIRST_PERSON_PATTERNS) {
      const m = allText.match(re);
      if (m) hits.push(m[0]);
    }
    const verdict: CheckVerdict = hits.length === 0 ? 'pass' : 'warn';
    return {
      id: 'no_first_person',
      name: 'No first-person pronouns',
      category: 'content',
      verdict,
      score: hits.length === 0 ? 100 : 50,
      detail:
        hits.length === 0
          ? 'No "I", "me", or "my" found — resume voice is correctly implicit third-person.'
          : `Found first-person usage: ${hits.slice(0, 3).join(', ')}.`,
      fix: hits.length === 0 ? undefined : 'Drop "I" and "my" — resume bullets are implicit third-person.',
    };
  },

  // ---- ATS ---------------------------------------------------------------
  (r) => {
    const c = r.contact;
    const missing: string[] = [];
    if (!c.name) missing.push('name');
    if (!c.email) missing.push('email');
    if (!c.phone) missing.push('phone');
    if (!c.location) missing.push('location');
    const hasLinkedIn = (c.links ?? []).some((l) => /linkedin\.com/i.test(l));
    if (!hasLinkedIn) missing.push('LinkedIn URL');
    const verdict: CheckVerdict = missing.length === 0 ? 'pass' : missing.length <= 1 ? 'warn' : 'fail';
    return {
      id: 'contact_complete',
      name: 'Contact info complete',
      category: 'ats',
      verdict,
      score: Math.max(0, 100 - missing.length * 25),
      detail:
        missing.length === 0
          ? 'Name, email, phone, location, and LinkedIn all present.'
          : `Missing: ${missing.join(', ')}.`,
      fix:
        missing.length === 0
          ? undefined
          : 'ATS parsers and recruiters expect every one of these. LinkedIn URL especially — its absence reads as suspicious in 2025+.',
    };
  },

  (r) => {
    // Date format consistency across experience
    const dates = r.experience.flatMap((e) => [e.startDate, e.endDate]).filter(Boolean);
    if (dates.length === 0) {
      return {
        id: 'date_consistency',
        name: 'Date format consistent',
        category: 'ats',
        verdict: 'fail',
        score: 0,
        detail: 'No dates detected on experience.',
        fix: 'Every role needs a start and end date (or "Present").',
      };
    }
    // Classify each date into a coarse format bucket
    const bucket = (d: string) => {
      if (/present/i.test(d)) return 'present';
      if (/^\d{4}$/.test(d)) return 'YYYY';
      if (/^\d{1,2}\/\d{4}$/.test(d)) return 'M/YYYY';
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(d)) return 'M/D/YYYY';
      if (/^[A-Za-z]+ \d{4}$/.test(d)) return 'Mon YYYY';
      if (/^[A-Za-z]+\.? \d{4}$/.test(d)) return 'Mon. YYYY';
      return 'other';
    };
    const buckets = new Set(dates.map(bucket).filter((b) => b !== 'present'));
    const verdict: CheckVerdict = buckets.size <= 1 ? 'pass' : buckets.size === 2 ? 'warn' : 'fail';
    return {
      id: 'date_consistency',
      name: 'Date format consistent',
      category: 'ats',
      verdict,
      score: buckets.size <= 1 ? 100 : buckets.size === 2 ? 60 : 20,
      detail:
        buckets.size <= 1
          ? `All dates use a consistent format (${[...buckets].join(', ') || 'none'}).`
          : `Dates use ${buckets.size} different formats: ${[...buckets].join(', ')}.`,
      fix:
        buckets.size <= 1
          ? undefined
          : 'Pick one format (e.g. "Mar 2022" or "03/2022") and apply it everywhere.',
    };
  },

  // ---- SKILLS ------------------------------------------------------------
  (r) => {
    const all = [...r.skills.technical, ...(r.skills.tools ?? [])];
    const count = all.length;
    let verdict: CheckVerdict;
    let detail: string;
    let fix: string | undefined;
    if (count === 0) {
      verdict = 'fail';
      detail = 'No technical skills listed.';
      fix = 'Add a Skills section with 8–20 hard skills.';
    } else if (count < 5) {
      verdict = 'warn';
      detail = `Only ${count} technical skill${count === 1 ? '' : 's'} listed.`;
      fix = 'Industry standard is 8–20 hard skills, ordered by relevance to the JD.';
    } else if (count > 25) {
      verdict = 'warn';
      detail = `${count} skills listed — too many signals unfocused.`;
      fix = 'Trim to 8–20 — keep what the resume actually demonstrates.';
    } else {
      verdict = 'pass';
      detail = `${count} hard skills listed — within the 8–20 industry-standard range.`;
    }
    return {
      id: 'skills_count',
      name: 'Skills count in the 8–20 range',
      category: 'skills',
      verdict,
      score: verdict === 'pass' ? 100 : verdict === 'warn' ? 60 : 0,
      detail,
      fix,
    };
  },

  (r) => {
    const all = [...r.skills.technical, ...(r.skills.tools ?? []), ...(r.skills.soft ?? [])].map((s) =>
      s.toLowerCase().trim(),
    );
    const obsolete = all.filter((s) => OBSOLETE_OR_GENERIC_SKILLS.includes(s));
    const verdict: CheckVerdict = obsolete.length === 0 ? 'pass' : 'fail';
    return {
      id: 'no_obsolete_skills',
      name: 'No obsolete or generic skills',
      category: 'skills',
      verdict,
      score: obsolete.length === 0 ? 100 : Math.max(0, 100 - obsolete.length * 30),
      detail:
        obsolete.length === 0
          ? 'No "Microsoft Office" or generic computing skills found.'
          : `Found dated/generic skill${obsolete.length === 1 ? '' : 's'}: ${obsolete.join(', ')}.`,
      fix:
        obsolete.length === 0
          ? undefined
          : 'Drop these — listing "Microsoft Office" in 2025+ signals dated thinking. Skills should be hard, role-relevant tools.',
    };
  },

  (r) => {
    // Soft skills should NOT appear in skills section per industry convention
    const all = [...r.skills.technical, ...(r.skills.tools ?? []), ...(r.skills.soft ?? [])].map((s) =>
      s.toLowerCase().trim(),
    );
    const soft = all.filter((s) => SOFT_SKILLS_IN_SKILLS_SECTION.includes(s));
    const verdict: CheckVerdict = soft.length === 0 ? 'pass' : soft.length <= 2 ? 'warn' : 'fail';
    return {
      id: 'no_soft_skills_in_skills',
      name: 'No soft skills in Skills section',
      category: 'skills',
      verdict,
      score: soft.length === 0 ? 100 : soft.length <= 2 ? 60 : 20,
      detail:
        soft.length === 0
          ? 'Skills section is hard skills only — correct industry convention.'
          : `Soft skills found in Skills: ${soft.join(', ')}.`,
      fix:
        soft.length === 0
          ? undefined
          : 'Soft skills (teamwork, communication, leadership) belong in your bullets as demonstrated outcomes, not in a skills list.',
    };
  },
];

export function runResumeChecks(resume: ParsedResume): ResumeChecks {
  const results = checks.map((c) => c(resume));

  const byCategory: Record<string, { sum: number; n: number }> = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { sum: 0, n: 0 };
    byCategory[r.category]!.sum += r.score;
    byCategory[r.category]!.n += 1;
  }
  const byCategoryAvg: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCategory)) {
    byCategoryAvg[k] = Math.round(v.sum / v.n);
  }

  const overall = Math.round(results.reduce((acc, r) => acc + r.score, 0) / results.length);
  const passed = results.filter((r) => r.verdict === 'pass').length;
  const warned = results.filter((r) => r.verdict === 'warn').length;
  const failed = results.filter((r) => r.verdict === 'fail').length;

  return {
    overallScore: overall,
    byCategory: byCategoryAvg,
    checks: results,
    passed,
    warned,
    failed,
  };
}

// --- JD keyword density (Jobscan-style) ----------------------------------

export const KeywordDensityRowSchema = z.object({
  term: z.string(),
  jdCount: z.number(),
  resumeCount: z.number(),
  importance: z.enum(['high', 'medium', 'low']),
});
export type KeywordDensityRow = z.infer<typeof KeywordDensityRowSchema>;

export const KeywordDensitySchema = z.object({
  rows: z.array(KeywordDensityRowSchema),
  totalJdTerms: z.number(),
  matchedTerms: z.number(),
  matchPct: z.number(),
});
export type KeywordDensity = z.infer<typeof KeywordDensitySchema>;

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'can',
  'shall',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'about',
  'as',
  'into',
  'from',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'it',
  'them',
  'their',
  'our',
  'your',
  'his',
  'her',
  'its',
  'who',
  'what',
  'when',
  'where',
  'why',
  'how',
  'which',
  'all',
  'any',
  'both',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'one',
  'two',
  'three',
  'years',
  'year',
  'experience',
  'work',
  'job',
  'role',
  'team',
  'company',
  'business',
  'will',
  'including',
  'include',
  'using',
  'use',
  'used',
  'looking',
  'seeking',
  'required',
  'requirements',
  'responsibilities',
  'duties',
  'qualifications',
  'preferred',
  'plus',
  'strong',
  'ability',
  'skills',
  'good',
  'great',
  'excellent',
  'understanding',
  'knowledge',
  'across',
  'within',
  'while',
  'also',
  'well',
  'like',
  'new',
  'us',
  'or',
]);

function extractTerms(text: string): Map<string, number> {
  const tokens = tokenize(text).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Bigrams — helps catch "machine learning", "distributed systems"
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
    if (a.length < 3 || b.length < 3) continue;
    const bg = `${a} ${b}`;
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  return counts;
}

export function computeKeywordDensity(jd: string, resume: ParsedResume): KeywordDensity {
  const jdCounts = extractTerms(jd);
  const resumeText = [
    resume.summary ?? '',
    ...resume.experience.flatMap((e) => [e.title, e.company, ...e.bullets.map((b) => b.text)]),
    ...(resume.projects ?? []).flatMap((p) => [
      p.name,
      ...(p.tech ?? []),
      ...p.bullets.map((b) => b.text),
    ]),
    ...resume.skills.technical,
    ...(resume.skills.tools ?? []),
  ].join(' ');
  const resumeCounts = extractTerms(resumeText);

  // Pick the top JD terms by count, then sort by importance (high if jdCount >= 3)
  const sorted = [...jdCounts.entries()]
    .filter(([term]) => term.length >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25);

  const rows: KeywordDensityRow[] = sorted.map(([term, jdCount]) => {
    const resumeCount = resumeCounts.get(term) ?? 0;
    const importance: 'high' | 'medium' | 'low' = jdCount >= 3 ? 'high' : jdCount === 2 ? 'medium' : 'low';
    return { term, jdCount, resumeCount, importance };
  });

  const matched = rows.filter((r) => r.resumeCount > 0).length;
  return {
    rows,
    totalJdTerms: rows.length,
    matchedTerms: matched,
    matchPct: pct(matched, rows.length),
  };
}
