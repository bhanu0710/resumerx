import { describe, it, expect } from 'vitest';
import {
  ParsedResumeSchema,
  AnalysisSchema,
  BulletRewriteSchema,
  RewriteLLMResponseSchema,
} from './schemas';

describe('ParsedResume schema', () => {
  it('accepts a minimal valid resume', () => {
    const parsed = ParsedResumeSchema.parse({
      contact: { name: 'Jane Doe', email: 'jane@example.com' },
      experience: [],
      education: [],
      skills: { technical: [] },
      rawText: 'hello world',
    });
    expect(parsed.contact.name).toBe('Jane Doe');
  });

  it('requires bullets to have an id + text', () => {
    expect(() =>
      ParsedResumeSchema.parse({
        contact: {},
        experience: [
          {
            id: 'e1',
            company: 'Acme',
            title: 'SWE',
            startDate: '2020',
            endDate: 'present',
            bullets: [{ id: 'b1', text: '' }], // empty text invalid
          },
        ],
        education: [],
        skills: { technical: [] },
        rawText: '',
      }),
    ).toThrow();
  });

  it("accepts 'present' as endDate", () => {
    const parsed = ParsedResumeSchema.parse({
      contact: {},
      experience: [
        {
          id: 'e1',
          company: 'Acme',
          title: 'SWE',
          startDate: '2020',
          endDate: 'present',
          bullets: [{ id: 'b1', text: 'did stuff' }],
        },
      ],
      education: [],
      skills: { technical: [] },
      rawText: '',
    });
    expect(parsed.experience[0]?.endDate).toBe('present');
  });
});

describe('Analysis schema', () => {
  it('rejects score outside 0-100', () => {
    const base = {
      id: 'a1',
      overallScore: 120, // too high
      atsScore: 80,
      atsIssues: [],
      keywordMatch: { matched: [], missing: [], score: 50, densityNote: 'ok' },
      sections: [],
      createdAt: new Date().toISOString(),
    };
    expect(() => AnalysisSchema.parse(base)).toThrow();
  });
});

describe('RewriteLLMResponse schema', () => {
  it("accepts skipped rewrites without skipReason (shouldn't happen but don't crash)", () => {
    const parsed = RewriteLLMResponseSchema.parse({
      rewritten: 'original bullet text',
      keywordsInjected: [],
      reasoning: 'nothing to improve without fabricating',
      skipped: true,
    });
    expect(parsed.skipped).toBe(true);
  });
});

describe('BulletRewrite schema', () => {
  it('carries validation flags through', () => {
    const br = BulletRewriteSchema.parse({
      bulletId: 'b1',
      section: 'experience',
      parentId: 'e1',
      original: 'helped with deployment',
      rewritten: 'contributed to deployment automation',
      keywordsInjected: [],
      reasoning: 'tightened language',
      validation: {
        passed: true,
        flags: [],
      },
    });
    expect(br.validation.passed).toBe(true);
  });

  it('stores flag types', () => {
    const br = BulletRewriteSchema.parse({
      bulletId: 'b1',
      section: 'experience',
      parentId: 'e1',
      original: 'worked on pipeline',
      rewritten: 'led team of 5 to transform the pipeline',
      keywordsInjected: ['led'],
      reasoning: '',
      validation: {
        passed: false,
        flags: [
          { type: 'exaggerated_scope', detail: 'original said worked, rewrite says led' },
          { type: 'fabricated_fact', detail: 'team of 5 not in original' },
        ],
      },
    });
    expect(br.validation.flags).toHaveLength(2);
  });
});
