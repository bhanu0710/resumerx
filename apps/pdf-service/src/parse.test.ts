import { describe, it, expect } from 'vitest';
import { parsePdfBuffer } from './parse.js';
import { makeResumePdf, SAMPLE_RESUME } from './__fixtures__/make-pdf.js';
import { ParsedResumeSchema } from '@resumerx/shared';

describe('parsePdfBuffer', () => {
  it('rejects non-PDF input via pdf-parse', async () => {
    const notAPdf = Buffer.from('hello world');
    await expect(parsePdfBuffer(notAPdf)).rejects.toThrow();
  });

  it('parses a synthetic resume PDF into the ParsedResume shape', async () => {
    const buffer = await makeResumePdf(SAMPLE_RESUME);
    const parsed = await parsePdfBuffer(buffer);

    // schema first — if this throws, the structure is wrong at a fundamental level
    expect(() => ParsedResumeSchema.parse(parsed)).not.toThrow();

    // contact
    expect(parsed.contact.email).toBe('jane.doe@example.com');
    expect(parsed.contact.name).toBe('Jane Doe');

    // experience — at least the first role should be recognized
    expect(parsed.experience.length).toBeGreaterThanOrEqual(1);
    const firstRole = parsed.experience[0];
    expect(firstRole?.company).toMatch(/Acme/);
    expect(firstRole?.title).toMatch(/Senior Software Engineer/);
    expect(firstRole?.bullets.length).toBeGreaterThanOrEqual(2);

    // skills — should include a decent chunk of what we put in
    const skills = parsed.skills.technical;
    expect(skills).toContain('TypeScript');
    expect(skills).toContain('Go');

    // raw text is preserved
    expect(parsed.rawText).toContain('Jane Doe');
    expect(parsed.rawText.length).toBeGreaterThan(200);
  });

  it('preserves bullet text exactly, no mangling', async () => {
    const buffer = await makeResumePdf(SAMPLE_RESUME);
    const parsed = await parsePdfBuffer(buffer);
    const bullets = parsed.experience.flatMap((e) => e.bullets.map((b) => b.text));
    expect(bullets.some((b) => /2M daily transactions/.test(b))).toBe(true);
  });
});
