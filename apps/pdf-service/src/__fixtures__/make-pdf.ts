// generate a synthetic resume PDF on the fly so tests don't need a binary fixture checked in.
import PDFDocument from 'pdfkit';

export type FixtureResume = {
  name: string;
  email: string;
  phone: string;
  location: string;
  summary?: string;
  experience: Array<{
    title: string;
    company: string;
    dateRange: string;
    bullets: string[];
  }>;
  education: Array<{ degree: string; institution: string; dateRange?: string }>;
  skills: string[];
  projects?: Array<{ name: string; bullets: string[] }>;
};

export async function makeResumePdf(data: FixtureResume): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // header
    doc.fontSize(18).text(data.name);
    doc.fontSize(10).text(`${data.email} · ${data.phone} · ${data.location}`);
    doc.moveDown();

    if (data.summary) {
      doc.fontSize(12).text('Summary');
      doc.fontSize(10).text(data.summary);
      doc.moveDown();
    }

    doc.fontSize(12).text('Experience');
    for (const exp of data.experience) {
      doc.fontSize(11).text(`${exp.title} — ${exp.company}   ${exp.dateRange}`);
      for (const b of exp.bullets) {
        doc.fontSize(10).text(`• ${b}`);
      }
      doc.moveDown(0.5);
    }
    doc.moveDown();

    doc.fontSize(12).text('Education');
    for (const edu of data.education) {
      doc.fontSize(10).text(`${edu.degree} — ${edu.institution}${edu.dateRange ? `   ${edu.dateRange}` : ''}`);
    }
    doc.moveDown();

    doc.fontSize(12).text('Skills');
    doc.fontSize(10).text(data.skills.join(', '));
    doc.moveDown();

    if (data.projects && data.projects.length > 0) {
      doc.fontSize(12).text('Projects');
      for (const p of data.projects) {
        doc.fontSize(11).text(p.name);
        for (const b of p.bullets) {
          doc.fontSize(10).text(`• ${b}`);
        }
        doc.moveDown(0.5);
      }
    }

    doc.end();
  });
}

export const SAMPLE_RESUME: FixtureResume = {
  name: 'Jane Doe',
  email: 'jane.doe@example.com',
  phone: '+1 415 555 0123',
  location: 'San Francisco, CA',
  summary: 'Backend engineer with 5 years building distributed systems.',
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Acme Corp',
      dateRange: 'Mar 2022 — Present',
      bullets: [
        'Shipped a payment reconciliation pipeline handling 2M daily transactions',
        'Reduced p99 API latency from 800ms to 180ms by adding a read-through cache',
        'Mentored three junior engineers on system design and code review',
      ],
    },
    {
      title: 'Software Engineer',
      company: 'Widgets Inc',
      dateRange: 'Jun 2019 — Feb 2022',
      bullets: [
        'Built internal tools for customer support, cutting ticket resolution time in half',
        'Migrated the monolith auth module to a standalone service with no downtime',
      ],
    },
  ],
  education: [
    {
      degree: 'B.S. Computer Science',
      institution: 'UC Berkeley',
      dateRange: '2015 — 2019',
    },
  ],
  skills: ['TypeScript', 'Go', 'PostgreSQL', 'Redis', 'Kubernetes', 'AWS'],
  projects: [
    {
      name: 'resume-rx',
      bullets: [
        'Open-source tool that tailors resumes to job descriptions without fabricating content',
      ],
    },
  ],
};
