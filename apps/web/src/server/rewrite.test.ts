import { describe, it, expect } from 'vitest';
import type { ParsedResume } from '@resumerx/shared';
import { collectBullets, selectJdKeywords } from './rewrite';

const resume: ParsedResume = {
  contact: { name: 'J', email: 'j@x.com' },
  experience: [
    {
      id: 'e1',
      company: 'Acme',
      title: 'SWE',
      startDate: '2021',
      endDate: 'present',
      bullets: [
        { id: 'b1', text: 'worked on payments' },
        { id: 'b2', text: 'helped with the migration' },
      ],
    },
  ],
  projects: [
    {
      id: 'p1',
      name: 'Sidekick',
      bullets: [{ id: 'b3', text: 'built a cli tool' }],
    },
  ],
  education: [],
  skills: { technical: [] },
  rawText: '',
};

describe('collectBullets', () => {
  it('flattens experience and projects into a single list with parent labels', () => {
    const targets = collectBullets(resume);
    expect(targets).toHaveLength(3);
    expect(targets[0]).toMatchObject({
      bulletId: 'b1',
      section: 'experience',
      parentId: 'e1',
      parentLabel: 'SWE @ Acme',
    });
    expect(targets[2]).toMatchObject({
      bulletId: 'b3',
      section: 'projects',
      parentLabel: 'Project: Sidekick',
    });
  });

  it('never touches summary, education, skills', () => {
    const t = collectBullets(resume);
    expect(t.every((b) => b.section === 'experience' || b.section === 'projects')).toBe(true);
  });
});

describe('selectJdKeywords', () => {
  it('puts missing keywords before matched ones', () => {
    const kws = selectJdKeywords({
      matched: ['typescript', 'react'],
      missing: ['kafka', 'go'],
    });
    expect(kws.indexOf('kafka')).toBeLessThan(kws.indexOf('typescript'));
  });

  it('caps to 10 missing + 5 matched', () => {
    const kws = selectJdKeywords({
      matched: Array.from({ length: 20 }, (_, i) => `m${i}`),
      missing: Array.from({ length: 20 }, (_, i) => `x${i}`),
    });
    expect(kws).toHaveLength(15);
  });
});
