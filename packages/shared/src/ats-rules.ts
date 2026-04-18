// Source of truth for what counts as "ATS-friendly".
// The analysis prompt references these rules, and /how-ats-works page renders them.
// Change this file, both downstream change — that's the point.

export type ATSRule = {
  id: string;
  category: 'structure' | 'content' | 'format' | 'keywords';
  title: string;
  description: string;
  whyItMatters: string;
};

export const ATS_RULES: ATSRule[] = [
  {
    id: 'standard-headers',
    category: 'structure',
    title: 'Use standard section headers',
    description:
      'Stick to Experience, Education, Skills, Projects, Certifications. ATS parsers look for these exact words.',
    whyItMatters:
      'Creative headers like "My Journey" or "What I Bring" get skipped by keyword-based parsers — your content ends up unclassified.',
  },
  {
    id: 'single-column',
    category: 'format',
    title: 'Single column layout only',
    description: 'No multi-column resumes. No sidebars. No text boxes. One column, top to bottom.',
    whyItMatters:
      'Multi-column layouts get flattened in unpredictable ways by most ATS systems. Your skills section ends up jammed into the middle of a bullet point.',
  },
  {
    id: 'no-tables',
    category: 'format',
    title: 'Avoid tables and text boxes',
    description: 'Use plain text and bullet lists. Skip tables, even for skills grids.',
    whyItMatters:
      'Tables often get read left-to-right across rows instead of column-by-column, producing garbled text.',
  },
  {
    id: 'no-graphics',
    category: 'format',
    title: 'No graphics, icons, or charts',
    description: 'No skill rating bars, no photos, no logos, no icons next to contact info.',
    whyItMatters:
      "ATS systems can't read images. Anything conveyed as an image is invisible to the system.",
  },
  {
    id: 'action-verbs',
    category: 'content',
    title: 'Start bullets with action verbs',
    description:
      'Led, built, shipped, migrated, owned, reduced, designed. Active voice, past tense for previous roles.',
    whyItMatters:
      'Action verbs are what both ATS keyword filters and human readers look for when skimming. "Responsible for" tells neither anything useful.',
  },
  {
    id: 'quantified-impact',
    category: 'content',
    title: "Quantify impact where it's real",
    description:
      'Numbers. Percentages. Time saved. Dollar amounts. Scale (users, rows, services). Only include metrics that are true.',
    whyItMatters:
      "Quantified bullets are more believable and more memorable. Just don't fabricate them — making up numbers is worse than having none.",
  },
  {
    id: 'keyword-density',
    category: 'keywords',
    title: 'Match keywords from the job description naturally',
    description:
      'Use the exact phrasing from the JD where it\'s accurate (e.g. "CI/CD" vs "continuous integration"). Don\'t keyword-stuff.',
    whyItMatters:
      'Most ATS systems rank candidates by keyword match against the posting. But recruiters also read the resume, and keyword-stuffing is obvious and a turn-off.',
  },
  {
    id: 'chronological-hybrid',
    category: 'structure',
    title: 'Use chronological or hybrid format',
    description:
      'List experience in reverse chronological order. Hybrid (skills summary + chronological) is also fine. Avoid pure functional/skills-based formats.',
    whyItMatters:
      'Functional resumes hide dates and raise flags for recruiters — they usually signal employment gaps or career pivots that deserve a direct mention instead.',
  },
  {
    id: 'date-consistency',
    category: 'format',
    title: 'Consistent date format',
    description:
      'Pick one format (e.g. "Mar 2022 — Present" or "03/2022 — Present") and use it everywhere.',
    whyItMatters:
      'Parsers extract employment history by date ranges. Inconsistent formats cause some roles to be misattributed or dropped entirely.',
  },
  {
    id: 'file-format',
    category: 'format',
    title: 'Submit as PDF unless asked otherwise',
    description: 'PDF preserves formatting. Only submit .docx if the posting explicitly asks.',
    whyItMatters:
      'PDF renders identically everywhere. DOCX formatting can shift across Word versions, and some ATS systems choke on certain DOCX features.',
  },
  {
    id: 'no-headers-footers',
    category: 'format',
    title: 'Keep contact info in the body, not page headers',
    description:
      'Name, email, phone, links should appear as normal text at the top of the first page.',
    whyItMatters:
      'Some ATS parsers ignore Word document headers/footers entirely. Your contact info ends up invisible.',
  },
  {
    id: 'bullet-length',
    category: 'content',
    title: 'Keep bullets to 1–2 lines',
    description:
      "One strong sentence per bullet. If it's running three lines, break it up or cut it.",
    whyItMatters:
      "Recruiters spend about 7 seconds per resume on first pass. Long bullets don't get read.",
  },
];

export const ATS_RULE_IDS = ATS_RULES.map((r) => r.id);

export function getATSRulesByCategory(category: ATSRule['category']): ATSRule[] {
  return ATS_RULES.filter((r) => r.category === category);
}
