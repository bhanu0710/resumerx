import {
  type ParsedResume,
  type ExperienceItem,
  type Bullet,
  type ProjectItem,
  experienceId,
  projectId,
  bulletId,
} from '@resumerx/shared';

// resumes don't follow a single format. This is a best-effort heuristic parser.
// it handles maybe 70% of resumes cleanly — the analysis LLM smooths over the rest.

const SECTION_ALIASES: Record<string, RegExp> = {
  summary: /^\s*(summary|objective|profile|about)\s*$/i,
  experience:
    /^\s*(experience|work experience|professional experience|employment|work history|career)\s*$/i,
  education: /^\s*(education|academic background|academics|qualifications)\s*$/i,
  skills: /^\s*(skills|technical skills|core competencies|tech stack|technologies)\s*$/i,
  projects: /^\s*(projects|personal projects|side projects|portfolio)\s*$/i,
  certifications: /^\s*(certifications?|licenses|certificates)\s*$/i,
};

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE_RE = /(\+?\d[\d\s\-().]{8,}\d)/;
const URL_RE =
  /https?:\/\/[^\s)]+|(?:linkedin\.com|github\.com|[a-z0-9-]+\.(?:io|dev|com|net))\/[^\s)]+/gi;

// bullet-ish: lines starting with -, •, *, ·, ▪, ‣, — or a digit followed by .
const BULLET_PREFIX = /^\s*([-•*·▪‣—]|\d+\.)\s+/;

export function structureResume(rawText: string): ParsedResume {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());

  // header block: first ~12 non-empty lines contain contact info
  const headerLines = lines.filter((l) => l.length > 0).slice(0, 12);
  const contact = extractContact(headerLines);

  // split into sections
  const sections = splitSections(lines);

  const experience: ExperienceItem[] = sections.experience
    ? parseExperienceBlock(sections.experience)
    : [];

  const projects: ProjectItem[] = sections.projects ? parseProjectsBlock(sections.projects) : [];

  const education = sections.education ? parseEducationBlock(sections.education) : [];

  const skills = sections.skills
    ? parseSkillsBlock(sections.skills)
    : { technical: [] as string[] };

  const certifications = sections.certifications
    ? parseCertificationsBlock(sections.certifications)
    : undefined;

  const summary = sections.summary ? sections.summary.join(' ').trim() : undefined;

  return {
    contact,
    summary,
    experience,
    education,
    skills,
    projects: projects.length > 0 ? projects : undefined,
    certifications,
    rawText,
  };
}

function extractContact(headerLines: string[]): ParsedResume['contact'] {
  const joined = headerLines.join(' ');
  const email = joined.match(EMAIL_RE)?.[0];
  const phone = joined.match(PHONE_RE)?.[0]?.trim();
  const links: string[] = [];
  const urlMatches = joined.match(URL_RE);
  if (urlMatches) {
    links.push(...urlMatches.map((u) => u.replace(/[.,;]$/, '')));
  }

  // name: usually first non-empty line. Skip if it looks like an email or URL.
  const name = headerLines.find(
    (l) => !EMAIL_RE.test(l) && !URL_RE.test(l) && l.split(/\s+/).length <= 5 && l.length < 60,
  );

  // location — very lossy. Look for "City, ST" or "City, Country" patterns.
  const locationMatch = headerLines.find(
    (l) => /^[\w\s.-]+,\s*\w{2,}/.test(l) && !EMAIL_RE.test(l),
  );

  return {
    name: name?.trim(),
    email,
    phone,
    location: locationMatch?.trim(),
    links: links.length > 0 ? links : undefined,
  };
}

function splitSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;

  for (const line of lines) {
    let matchedSection: string | null = null;
    for (const [name, re] of Object.entries(SECTION_ALIASES)) {
      if (re.test(line)) {
        matchedSection = name;
        break;
      }
    }

    if (matchedSection) {
      current = matchedSection;
      sections[current] ??= [];
      continue;
    }

    if (current) {
      sections[current]!.push(line);
    }
  }

  return sections;
}

function parseExperienceBlock(block: string[]): ExperienceItem[] {
  const items: ExperienceItem[] = [];
  let currentItem: ExperienceItem | null = null;
  let buffer: string[] = [];

  const pushCurrent = () => {
    if (currentItem) {
      currentItem.bullets = buffer.map((text) => ({ id: bulletId(), text }));
      items.push(currentItem);
    }
  };

  for (let i = 0; i < block.length; i++) {
    const line = block[i] ?? '';
    if (!line) continue;

    if (BULLET_PREFIX.test(line)) {
      buffer.push(line.replace(BULLET_PREFIX, '').trim());
      continue;
    }

    // heuristic: a line with a date range OR a "Title — Company" pattern starts a new role
    const looksLikeRoleHeader =
      /\b(19|20)\d{2}\b/.test(line) ||
      /\s[—–-]\s/.test(line) ||
      /\b(present|current)\b/i.test(line);

    if (looksLikeRoleHeader && !BULLET_PREFIX.test(line)) {
      pushCurrent();
      buffer = [];
      const parsed = parseRoleHeader(line, block[i + 1] ?? '');
      currentItem = {
        id: experienceId(),
        ...parsed,
        bullets: [] as Bullet[],
      };
      continue;
    }

    // otherwise: append to current item's context or skip
    if (currentItem && buffer.length === 0) {
      // first non-bullet line after header might be a location or date detail
      // leave it alone for now
    }
  }

  pushCurrent();
  return items;
}

function parseRoleHeader(
  line: string,
  nextLine: string,
): {
  company: string;
  title: string;
  startDate: string;
  endDate: string | 'present';
  location?: string;
} {
  // try common patterns:
  // "Software Engineer — Acme Corp       Jan 2022 – Present"
  // "Acme Corp | Software Engineer | 2020 – 2022"
  // "Software Engineer, Acme Corp (2020 - 2022)"

  const dateRangeRe =
    /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|(?:19|20)\d{2})\s*[-–—]\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}|(?:19|20)\d{2}|present|current)\b/i;
  const dateMatch = line.match(dateRangeRe) ?? nextLine.match(dateRangeRe);

  const startDate = dateMatch?.[1] ?? '';
  const endRaw = dateMatch?.[2]?.toLowerCase() ?? '';
  const endDate: string | 'present' =
    endRaw === 'present' || endRaw === 'current' ? 'present' : (dateMatch?.[2] ?? '');

  // strip the date range from the line for parsing title/company
  const withoutDate = line
    .replace(dateRangeRe, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let title = '';
  let company = '';

  // patterns: title — company, title | company, title at company, title, company
  const sepMatch = withoutDate.match(/^(.*?)\s*[—–|@]\s*(.*?)$/);
  if (sepMatch) {
    title = sepMatch[1]?.trim() ?? '';
    company = sepMatch[2]?.trim() ?? '';
  } else {
    // fallback: split on comma
    const parts = withoutDate
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      title = parts[0] ?? '';
      company = parts[1] ?? '';
    } else {
      company = withoutDate;
    }
  }

  return { company, title, startDate, endDate };
}

function parseProjectsBlock(block: string[]): ProjectItem[] {
  const items: ProjectItem[] = [];
  let currentItem: ProjectItem | null = null;
  let buffer: string[] = [];

  const pushCurrent = () => {
    if (currentItem) {
      currentItem.bullets = buffer.map((text) => ({ id: bulletId(), text }));
      items.push(currentItem);
    }
  };

  for (const line of block) {
    if (!line) continue;

    if (BULLET_PREFIX.test(line)) {
      buffer.push(line.replace(BULLET_PREFIX, '').trim());
      continue;
    }

    // project header: short line, no bullet prefix, probably a name
    if (line.length < 80 && !BULLET_PREFIX.test(line)) {
      pushCurrent();
      buffer = [];
      const [name, ...rest] = line.split(/\s*[—–|:]\s*/);
      currentItem = {
        id: projectId(),
        name: name?.trim() ?? line.trim(),
        description: rest.length > 0 ? rest.join(' — ').trim() : undefined,
        bullets: [],
      };
    }
  }

  pushCurrent();
  return items;
}

function parseEducationBlock(block: string[]): ParsedResume['education'] {
  const items: ParsedResume['education'] = [];
  const nonEmpty = block.filter((l) => l && !BULLET_PREFIX.test(l));

  // naive: every 1-2 non-empty lines = one education item
  for (let i = 0; i < nonEmpty.length; i += 2) {
    const line1 = nonEmpty[i] ?? '';
    const line2 = nonEmpty[i + 1] ?? '';

    const dateMatch = (line1 + ' ' + line2).match(/\b(19|20)\d{2}\b.*?\b(19|20)\d{2}\b/);
    // split line1 by common separators
    const [first, second] = line1.split(/\s*[—–|,]\s*/);

    items.push({
      institution: second?.trim() ?? first?.trim() ?? line1,
      degree: first?.trim() ?? line1,
      startDate: dateMatch?.[0]?.split(/[-–—]/)[0]?.trim(),
      endDate: dateMatch?.[0]?.split(/[-–—]/)[1]?.trim(),
    });
  }

  return items;
}

function parseSkillsBlock(block: string[]): ParsedResume['skills'] {
  const technical: string[] = [];
  const tools: string[] = [];
  const soft: string[] = [];

  for (const line of block) {
    if (!line) continue;
    const lower = line.toLowerCase();

    // "Languages: X, Y, Z" style
    const labeled = line.match(/^([^:]+):\s*(.+)$/);
    if (labeled) {
      const label = labeled[1]?.toLowerCase() ?? '';
      const values =
        labeled[2]
          ?.split(/[,|/·]/)
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      if (/tool|platform|framework|library/.test(label)) tools.push(...values);
      else if (/soft|communication|leadership|people/.test(label)) soft.push(...values);
      else technical.push(...values);
      continue;
    }

    // bullet-prefixed skill list
    if (BULLET_PREFIX.test(line)) {
      const values = line
        .replace(BULLET_PREFIX, '')
        .split(/[,|/·]/)
        .map((s) => s.trim())
        .filter(Boolean);
      technical.push(...values);
      continue;
    }

    // comma-separated skills on a plain line
    if (line.includes(',')) {
      const values = line
        .split(/[,|/·]/)
        .map((s) => s.trim())
        .filter(Boolean);
      technical.push(...values);
    } else if (lower.split(/\s+/).length <= 5) {
      technical.push(line.trim());
    }
  }

  return {
    technical: Array.from(new Set(technical)).filter(Boolean),
    tools: tools.length > 0 ? Array.from(new Set(tools)) : undefined,
    soft: soft.length > 0 ? Array.from(new Set(soft)) : undefined,
  };
}

function parseCertificationsBlock(block: string[]): ParsedResume['certifications'] {
  return block
    .filter((l) => l && !BULLET_PREFIX.test(l))
    .map((line) => {
      const parts = line.split(/\s*[—–|,]\s*/);
      const dateMatch = line.match(/\b(19|20)\d{2}\b/);
      return {
        name: parts[0]?.trim() ?? line,
        issuer: parts[1]?.trim(),
        date: dateMatch?.[0],
      };
    });
}
