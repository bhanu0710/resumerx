import { describe, it, expect } from 'vitest';
import { structureResume } from './structure';

// These tests exist to guard the parser's most painful failure mode:
// pdf-parse strips bullet glyphs from a lot of resumes, leaving plain lines
// like "Built X to do Y". The parser must still treat those as bullets, not
// as new role/project headers — otherwise we end up with N projects of 0
// bullets, and the rewrite feature has nothing to act on.

describe('structureResume — glyph-less bullets', () => {
  it('captures experience bullets even when bullet glyphs are missing', () => {
    const raw = `Jane Doe
jane@example.com

EXPERIENCE
Senior Software Engineer — Acme Corp           Jan 2022 – Present
Built checkout service handling 12k req/min, cutting p99 latency from 900ms to 180ms
Led 4-engineer migration of 60 services off Mongo to Postgres, saving $14k/mo
Shipped onboarding redesign that lifted day-7 activation from 31% to 44%

Software Engineer — Initech                    2019 – 2021
Reduced CI build time from 28min to 6min by parallelizing test shards
Owned the alerting pipeline, cutting false-positive pages by 60%
`;
    const r = structureResume(raw);
    expect(r.experience).toHaveLength(2);
    expect(r.experience[0]?.bullets.length).toBeGreaterThanOrEqual(3);
    expect(r.experience[1]?.bullets.length).toBeGreaterThanOrEqual(2);
  });

  it('captures project bullets even when bullet glyphs are missing', () => {
    const raw = `John Smith
john@example.com

PROJECTS
ResumeRx
Built an LLM-driven resume rewriter with no-fabrication validator
Shipped to Vercel staging with k6 load tests at 30 RPS

PortfolioSite
Designed and deployed a Next.js portfolio with edge caching
Achieved Lighthouse score of 98 across all categories
`;
    const r = structureResume(raw);
    expect(r.projects ?? []).toHaveLength(2);
    expect(r.projects?.[0]?.bullets.length).toBeGreaterThanOrEqual(2);
    expect(r.projects?.[1]?.bullets.length).toBeGreaterThanOrEqual(2);
  });

  it('still respects explicit bullet glyphs when present', () => {
    const raw = `Jane Doe
EXPERIENCE
Senior SWE — Acme           2022 – Present
• Built checkout service handling 12k req/min
• Led migration off Mongo to Postgres
`;
    const r = structureResume(raw);
    expect(r.experience).toHaveLength(1);
    expect(r.experience[0]?.bullets).toHaveLength(2);
    expect(r.experience[0]?.bullets[0]?.text).not.toMatch(/^[•\-*]/);
  });

  it('matches section headers with trailing colon and decoration', () => {
    const raw = `Jane Doe
WORK EXPERIENCE:
Senior SWE — Acme           2022 – Present
Built checkout service handling 12k req/min

PROJECTS —
Foo
Designed and deployed a Next.js portfolio
`;
    const r = structureResume(raw);
    expect(r.experience.length).toBeGreaterThanOrEqual(1);
    expect(r.experience[0]?.bullets.length).toBeGreaterThanOrEqual(1);
    expect(r.projects?.length).toBeGreaterThanOrEqual(1);
  });
});
