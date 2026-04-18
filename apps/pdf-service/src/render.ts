import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import type { ParsedResume } from '@resumerx/shared';

// Apply the user's per-bullet choices to the parsed resume before rendering.
// `accepted[bulletId] = finalText`. If the id is missing from the map, keep the
// original bullet text (same default the UI uses).
export function applyAccepted(
  resume: ParsedResume,
  accepted: Record<string, string> | null | undefined,
): ParsedResume {
  if (!accepted || Object.keys(accepted).length === 0) return resume;
  return {
    ...resume,
    experience: resume.experience.map((e) => ({
      ...e,
      bullets: e.bullets.map((b) => ({ ...b, text: accepted[b.id] ?? b.text })),
    })),
    projects: resume.projects?.map((p) => ({
      ...p,
      bullets: p.bullets.map((b) => ({ ...b, text: accepted[b.id] ?? b.text })),
    })),
  };
}

// --- PDF (pdfkit) --------------------------------------------------------

export async function renderPdf(resume: ParsedResume): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54 }); // 0.75" margins
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header — contact block
    const c = resume.contact;
    if (c.name) {
      doc.fontSize(18).font('Helvetica-Bold').text(c.name, { align: 'center' });
    }
    const contactLine = [c.email, c.phone, c.location].filter(Boolean).join('  ·  ');
    if (contactLine) {
      doc.moveDown(0.3).fontSize(9).font('Helvetica').text(contactLine, { align: 'center' });
    }
    if (c.links?.length) {
      doc.fontSize(9).fillColor('#555').text(c.links.join('  ·  '), { align: 'center' });
      doc.fillColor('black');
    }
    doc.moveDown(0.8);

    if (resume.summary) {
      sectionHeader(doc, 'Summary');
      doc.fontSize(10).font('Helvetica').text(resume.summary, { align: 'left' });
      doc.moveDown(0.6);
    }

    if (resume.experience.length > 0) {
      sectionHeader(doc, 'Experience');
      for (const e of resume.experience) {
        doc.font('Helvetica-Bold').fontSize(11).text(`${e.title} — ${e.company}`);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#555')
          .text(
            `${e.startDate} – ${e.endDate === 'present' ? 'Present' : e.endDate}${e.location ? '  ·  ' + e.location : ''}`,
          );
        doc.fillColor('black');
        doc.moveDown(0.2);
        for (const b of e.bullets) {
          doc.fontSize(10).font('Helvetica').text(`•  ${b.text}`, { indent: 10 });
        }
        doc.moveDown(0.4);
      }
    }

    if (resume.projects && resume.projects.length > 0) {
      sectionHeader(doc, 'Projects');
      for (const p of resume.projects) {
        const tech = p.tech?.length ? ` — ${p.tech.join(', ')}` : '';
        doc.font('Helvetica-Bold').fontSize(11).text(`${p.name}${tech}`);
        if (p.description) {
          doc.font('Helvetica').fontSize(9).fillColor('#555').text(p.description);
          doc.fillColor('black');
        }
        for (const b of p.bullets) {
          doc.fontSize(10).font('Helvetica').text(`•  ${b.text}`, { indent: 10 });
        }
        doc.moveDown(0.4);
      }
    }

    if (resume.education.length > 0) {
      sectionHeader(doc, 'Education');
      for (const ed of resume.education) {
        const line = `${ed.degree}${ed.field ? ', ' + ed.field : ''} — ${ed.institution}`;
        doc.font('Helvetica-Bold').fontSize(11).text(line);
        const range = [ed.startDate, ed.endDate].filter(Boolean).join(' – ');
        if (range || ed.gpa) {
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#555')
            .text([range, ed.gpa ? `GPA ${ed.gpa}` : ''].filter(Boolean).join('  ·  '));
          doc.fillColor('black');
        }
        doc.moveDown(0.3);
      }
    }

    const skillGroups: Array<[string, string[] | undefined]> = [
      ['Technical', resume.skills.technical],
      ['Tools', resume.skills.tools],
      ['Soft', resume.skills.soft],
    ];
    const hasSkills = skillGroups.some(([, v]) => v && v.length > 0);
    if (hasSkills) {
      sectionHeader(doc, 'Skills');
      for (const [label, items] of skillGroups) {
        if (!items || items.length === 0) continue;
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(`${label}: `, { continued: true })
          .font('Helvetica')
          .text(items.join(', '));
      }
      doc.moveDown(0.4);
    }

    if (resume.certifications && resume.certifications.length > 0) {
      sectionHeader(doc, 'Certifications');
      for (const cert of resume.certifications) {
        const line = [cert.name, cert.issuer, cert.date].filter(Boolean).join('  ·  ');
        doc.font('Helvetica').fontSize(10).text(line);
      }
    }

    doc.end();
  });
}

function sectionHeader(doc: PDFKit.PDFDocument, label: string): void {
  doc
    .moveDown(0.2)
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#111')
    .text(label.toUpperCase(), { characterSpacing: 0.5 });
  // hairline rule
  const y = doc.y;
  doc
    .strokeColor('#999')
    .lineWidth(0.5)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();
  doc.moveDown(0.3).fillColor('black');
}

// --- DOCX (docx) ---------------------------------------------------------

export async function renderDocx(resume: ParsedResume): Promise<Buffer> {
  const children: Paragraph[] = [];
  const c = resume.contact;

  if (c.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: c.name, bold: true, size: 32 })],
      }),
    );
  }
  const contactLine = [c.email, c.phone, c.location].filter(Boolean).join(' · ');
  if (contactLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: contactLine, size: 18 })],
      }),
    );
  }
  if (c.links?.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: c.links.join(' · '), size: 18, color: '555555' })],
      }),
    );
  }

  if (resume.summary) {
    children.push(docxHeader('Summary'));
    children.push(new Paragraph({ children: [new TextRun({ text: resume.summary, size: 20 })] }));
  }

  if (resume.experience.length > 0) {
    children.push(docxHeader('Experience'));
    for (const e of resume.experience) {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: `${e.title} — ${e.company}`, bold: true, size: 22 })],
        }),
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${e.startDate} – ${e.endDate === 'present' ? 'Present' : e.endDate}${e.location ? ' · ' + e.location : ''}`,
              italics: true,
              size: 18,
              color: '555555',
            }),
          ],
        }),
      );
      for (const b of e.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: b.text, size: 20 })],
          }),
        );
      }
    }
  }

  if (resume.projects && resume.projects.length > 0) {
    children.push(docxHeader('Projects'));
    for (const p of resume.projects) {
      const tech = p.tech?.length ? ` — ${p.tech.join(', ')}` : '';
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: `${p.name}${tech}`, bold: true, size: 22 })],
        }),
      );
      if (p.description) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: p.description, italics: true, size: 18, color: '555555' })],
          }),
        );
      }
      for (const b of p.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: b.text, size: 20 })],
          }),
        );
      }
    }
  }

  if (resume.education.length > 0) {
    children.push(docxHeader('Education'));
    for (const ed of resume.education) {
      const title = `${ed.degree}${ed.field ? ', ' + ed.field : ''} — ${ed.institution}`;
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: title, bold: true, size: 22 })],
        }),
      );
      const range = [ed.startDate, ed.endDate].filter(Boolean).join(' – ');
      if (range || ed.gpa) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: [range, ed.gpa ? `GPA ${ed.gpa}` : ''].filter(Boolean).join(' · '),
                italics: true,
                size: 18,
                color: '555555',
              }),
            ],
          }),
        );
      }
    }
  }

  const skillGroups: Array<[string, string[] | undefined]> = [
    ['Technical', resume.skills.technical],
    ['Tools', resume.skills.tools],
    ['Soft', resume.skills.soft],
  ];
  if (skillGroups.some(([, v]) => v && v.length > 0)) {
    children.push(docxHeader('Skills'));
    for (const [label, items] of skillGroups) {
      if (!items || items.length === 0) continue;
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${label}: `, bold: true, size: 20 }),
            new TextRun({ text: items.join(', '), size: 20 }),
          ],
        }),
      );
    }
  }

  if (resume.certifications && resume.certifications.length > 0) {
    children.push(docxHeader('Certifications'));
    for (const cert of resume.certifications) {
      const line = [cert.name, cert.issuer, cert.date].filter(Boolean).join(' · ');
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 20 })] }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

function docxHeader(label: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    border: { bottom: { color: '999999', space: 1, style: 'single', size: 6 } },
    children: [new TextRun({ text: label.toUpperCase(), bold: true, size: 22 })],
  });
}
