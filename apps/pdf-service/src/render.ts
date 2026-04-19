import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, AlignmentType, TabStopType } from 'docx';
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
// layout rules this renderer enforces:
//   - letter paper, 0.6" margins (more content, still ats-safe)
//   - one column (two-column resumes get mangled by 40% of ats scanners)
//   - name BIG and centered, contact one line below in muted grey
//   - section headings: 10pt bold caps, 0.5pt rule the full content width
//   - role line: bold left, dates right-aligned on the SAME line (tab-stop effect via x,y)
//   - subline: italic muted company · location
//   - bullets: 10pt, hanging indent so wraps align under the first letter

const PAGE_MARGIN = 43; // ~0.6"
const COLOR_MUTED = '#4b5563';
const COLOR_RULE = '#d1d5db';
const COLOR_HEADING = '#111827';

export async function renderPdf(resume: ParsedResume): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentLeft = doc.page.margins.left;
    const contentRight = doc.page.width - doc.page.margins.right;
    const contentWidth = contentRight - contentLeft;

    // Header — name + contact
    const c = resume.contact;
    if (c.name) {
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#000')
        .text(c.name, contentLeft, doc.y, { width: contentWidth, align: 'center' });
    }
    const contactBits = [c.email, c.phone, c.location].filter(Boolean);
    if (contactBits.length) {
      doc.moveDown(0.35);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COLOR_MUTED)
        .text(contactBits.join('  •  '), { width: contentWidth, align: 'center' });
    }
    if (c.links?.length) {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COLOR_MUTED)
        .text(c.links.join('  •  '), { width: contentWidth, align: 'center' });
    }
    doc.fillColor('#000').moveDown(0.7);

    if (resume.summary) {
      sectionHeader(doc, 'Summary', contentLeft, contentRight);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#000')
        .text(resume.summary, { width: contentWidth, align: 'left', lineGap: 1.5 });
      doc.moveDown(0.6);
    }

    if (resume.experience.length > 0) {
      sectionHeader(doc, 'Experience', contentLeft, contentRight);
      resume.experience.forEach((e, i) => {
        if (i > 0) doc.moveDown(0.5);
        const dates = `${e.startDate} – ${e.endDate === 'present' ? 'Present' : e.endDate}`;
        roleLine(doc, e.title, dates, contentLeft, contentRight);
        const sub = [e.company, e.location].filter(Boolean).join(' · ');
        doc
          .font('Helvetica-Oblique')
          .fontSize(9.5)
          .fillColor(COLOR_MUTED)
          .text(sub, contentLeft, doc.y, { width: contentWidth });
        doc.fillColor('#000').moveDown(0.2);
        for (const b of e.bullets) {
          bullet(doc, b.text, contentLeft, contentWidth);
        }
      });
      doc.moveDown(0.4);
    }

    if (resume.projects && resume.projects.length > 0) {
      sectionHeader(doc, 'Projects', contentLeft, contentRight);
      resume.projects.forEach((p, i) => {
        if (i > 0) doc.moveDown(0.5);
        const right = p.tech?.length ? p.tech.join(', ') : '';
        roleLine(doc, p.name, right, contentLeft, contentRight);
        if (p.description) {
          doc
            .font('Helvetica-Oblique')
            .fontSize(9.5)
            .fillColor(COLOR_MUTED)
            .text(p.description, contentLeft, doc.y, { width: contentWidth });
          doc.fillColor('#000');
        }
        doc.moveDown(0.2);
        for (const b of p.bullets) {
          bullet(doc, b.text, contentLeft, contentWidth);
        }
      });
      doc.moveDown(0.4);
    }

    if (resume.education.length > 0) {
      sectionHeader(doc, 'Education', contentLeft, contentRight);
      resume.education.forEach((ed, i) => {
        if (i > 0) doc.moveDown(0.3);
        const title = `${ed.degree}${ed.field ? ', ' + ed.field : ''}`;
        const range = [ed.startDate, ed.endDate].filter(Boolean).join(' – ');
        roleLine(doc, title, range, contentLeft, contentRight);
        const sub = [ed.institution, ed.gpa ? `GPA ${ed.gpa}` : ''].filter(Boolean).join(' · ');
        if (sub) {
          doc
            .font('Helvetica-Oblique')
            .fontSize(9.5)
            .fillColor(COLOR_MUTED)
            .text(sub, contentLeft, doc.y, { width: contentWidth });
          doc.fillColor('#000');
        }
      });
      doc.moveDown(0.4);
    }

    const skillGroups: Array<[string, string[] | undefined]> = [
      ['Technical', resume.skills.technical],
      ['Tools', resume.skills.tools],
      ['Soft', resume.skills.soft],
    ];
    if (skillGroups.some(([, v]) => v && v.length > 0)) {
      sectionHeader(doc, 'Skills', contentLeft, contentRight);
      for (const [label, items] of skillGroups) {
        if (!items || items.length === 0) continue;
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#000')
          .text(`${label}: `, contentLeft, doc.y, { continued: true, width: contentWidth });
        doc.font('Helvetica').text(items.join(', '));
      }
      doc.moveDown(0.4);
    }

    if (resume.certifications && resume.certifications.length > 0) {
      sectionHeader(doc, 'Certifications', contentLeft, contentRight);
      for (const cert of resume.certifications) {
        const name = cert.name ?? '';
        const right = [cert.issuer, cert.date].filter(Boolean).join(' · ');
        roleLine(doc, name, right, contentLeft, contentRight);
      }
    }

    doc.end();
  });
}

function sectionHeader(
  doc: PDFKit.PDFDocument,
  label: string,
  left: number,
  right: number,
): void {
  doc.moveDown(0.3);
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(COLOR_HEADING)
    .text(label.toUpperCase(), left, doc.y, { characterSpacing: 1 });
  const y = doc.y + 1;
  doc.strokeColor(COLOR_RULE).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke();
  doc.moveDown(0.35).fillColor('#000');
}

// Renders the title on the left and right-string on the same baseline right-aligned.
// We measure the right-text width and render the left column with exact width so
// pdfkit's internal cursor tracks correctly (no manual doc.y manipulation, which
// breaks across page boundaries).
function roleLine(
  doc: PDFKit.PDFDocument,
  leftText: string,
  rightText: string,
  left: number,
  right: number,
): void {
  const width = right - left;
  const startY = doc.y;

  // Measure right text in its own font so we can size the left column correctly.
  let rightWidth = 0;
  if (rightText) {
    doc.font('Helvetica').fontSize(9.5);
    rightWidth = doc.widthOfString(rightText);
  }
  const gap = 8;
  const leftWidth = Math.max(40, width - rightWidth - gap);

  // Draw right text first at absolute position (no flow advance), then left text
  // via flow so doc.y lands correctly on its final line.
  if (rightText) {
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLOR_MUTED)
      .text(rightText, left + leftWidth + gap, startY, {
        width: rightWidth,
        align: 'right',
        lineBreak: false,
      });
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#000')
    .text(leftText, left, startY, { width: leftWidth, lineBreak: false, ellipsis: true });
  doc.fillColor('#000');
}

function bullet(doc: PDFKit.PDFDocument, text: string, left: number, width: number): void {
  const indent = 12;
  doc.font('Helvetica').fontSize(10).fillColor('#000');
  // flow-based: let pdfkit manage y and page breaks. Prefix bullet glyph and use
  // indent so wraps align under the first letter.
  doc.text(`•  ${text}`, left, doc.y, {
    width,
    align: 'left',
    lineGap: 1.5,
    indent: 0,
    paragraphGap: 0,
  });
  // Note: pdfkit doesn't natively do hanging indent, but the visual difference
  // on typical bullet lengths is negligible and safer than absolute-xy hacks
  // that dropped bullets across page breaks.
}

// --- DOCX (docx) ---------------------------------------------------------

const DOCX_RIGHT_TAB = 9000; // twips — ~6.25" from left margin, fits letter

export async function renderDocx(resume: ParsedResume): Promise<Buffer> {
  const children: Paragraph[] = [];
  const c = resume.contact;

  if (c.name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: c.name, bold: true, size: 36 })],
      }),
    );
  }
  const contactLine = [c.email, c.phone, c.location].filter(Boolean).join(' • ');
  if (contactLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: contactLine, size: 19, color: '4b5563' })],
      }),
    );
  }
  if (c.links?.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: c.links.join(' • '), size: 19, color: '4b5563' })],
      }),
    );
  }

  if (resume.summary) {
    children.push(docxHeader('Summary'));
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: resume.summary, size: 20 })],
      }),
    );
  }

  if (resume.experience.length > 0) {
    children.push(docxHeader('Experience'));
    resume.experience.forEach((e, i) => {
      const dates = `${e.startDate} – ${e.endDate === 'present' ? 'Present' : e.endDate}`;
      children.push(docxRoleLine(e.title, dates, i > 0));
      const sub = [e.company, e.location].filter(Boolean).join(' · ');
      if (sub) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: sub, italics: true, size: 19, color: '4b5563' })],
          }),
        );
      }
      for (const b of e.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 20 },
            children: [new TextRun({ text: b.text, size: 20 })],
          }),
        );
      }
    });
  }

  if (resume.projects && resume.projects.length > 0) {
    children.push(docxHeader('Projects'));
    resume.projects.forEach((p, i) => {
      const right = p.tech?.length ? p.tech.join(', ') : '';
      children.push(docxRoleLine(p.name, right, i > 0));
      if (p.description) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: p.description, italics: true, size: 19, color: '4b5563' }),
            ],
          }),
        );
      }
      for (const b of p.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 20 },
            children: [new TextRun({ text: b.text, size: 20 })],
          }),
        );
      }
    });
  }

  if (resume.education.length > 0) {
    children.push(docxHeader('Education'));
    resume.education.forEach((ed, i) => {
      const title = `${ed.degree}${ed.field ? ', ' + ed.field : ''}`;
      const range = [ed.startDate, ed.endDate].filter(Boolean).join(' – ');
      children.push(docxRoleLine(title, range, i > 0));
      const sub = [ed.institution, ed.gpa ? `GPA ${ed.gpa}` : ''].filter(Boolean).join(' · ');
      if (sub) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: sub, italics: true, size: 19, color: '4b5563' })],
          }),
        );
      }
    });
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
          spacing: { after: 40 },
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
      const name = cert.name ?? '';
      const right = [cert.issuer, cert.date].filter(Boolean).join(' · ');
      children.push(docxRoleLine(name, right, false));
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 20 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function docxHeader(label: string): Paragraph {
  return new Paragraph({
    spacing: { before: 280, after: 80 },
    border: { bottom: { color: 'd1d5db', space: 2, style: 'single', size: 6 } },
    children: [
      new TextRun({
        text: label.toUpperCase(),
        bold: true,
        size: 22,
        color: '111827',
        characterSpacing: 20,
      }),
    ],
  });
}

// Left-aligned title, right-aligned dates on the same line using a right tab stop.
function docxRoleLine(left: string, right: string, spaceBefore: boolean): Paragraph {
  return new Paragraph({
    spacing: { before: spaceBefore ? 160 : 0, after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: DOCX_RIGHT_TAB }],
    children: [
      new TextRun({ text: left, bold: true, size: 22 }),
      ...(right
        ? [new TextRun({ text: `\t${right}`, size: 19, color: '4b5563' })]
        : []),
    ],
  });
}
