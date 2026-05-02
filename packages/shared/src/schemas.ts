import { z } from 'zod';

// bullets get their own ids so the UI can track accept/reject per-bullet
export const BulletSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
});
export type Bullet = z.infer<typeof BulletSchema>;

export const ExperienceItemSchema = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.union([z.string(), z.literal('present')]),
  location: z.string().optional(),
  bullets: z.array(BulletSchema),
});
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;

export const EducationItemSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  gpa: z.string().optional(),
});
export type EducationItem = z.infer<typeof EducationItemSchema>;

export const ProjectItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tech: z.array(z.string()).optional(),
  link: z.string().optional(),
  bullets: z.array(BulletSchema),
});
export type ProjectItem = z.infer<typeof ProjectItemSchema>;

export const CertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  date: z.string().optional(),
});
export type Certification = z.infer<typeof CertificationSchema>;

export const ContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(z.string()).optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const ParsedResumeSchema = z.object({
  contact: ContactSchema,
  summary: z.string().optional(),
  experience: z.array(ExperienceItemSchema),
  education: z.array(EducationItemSchema),
  skills: z.object({
    technical: z.array(z.string()),
    soft: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
  }),
  projects: z.array(ProjectItemSchema).optional(),
  certifications: z.array(CertificationSchema).optional(),
  rawText: z.string(),
});
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

// --- Analysis ---

export const ATSIssueSchema = z.object({
  severity: z.enum(['high', 'med', 'low']),
  issue: z.string(),
  fix: z.string(),
  location: z.string().optional(),
});
export type ATSIssue = z.infer<typeof ATSIssueSchema>;

export const KeywordMatchSchema = z.object({
  matched: z.array(z.string()),
  missing: z.array(z.string()),
  score: z.number().min(0).max(100),
  densityNote: z.string(),
});
export type KeywordMatch = z.infer<typeof KeywordMatchSchema>;

export const SectionFeedbackSchema = z.object({
  name: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(z.string()),
});
export type SectionFeedback = z.infer<typeof SectionFeedbackSchema>;

// Lightweight pass-through shapes for the deterministic checks layer. The
// authoritative shapes live in resume-checks.ts; we keep duplicates here so
// AnalysisSchema doesn't introduce a circular re-export.
export const ResumeCheckResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['impact', 'format', 'content', 'ats', 'skills']),
  verdict: z.enum(['pass', 'warn', 'fail']),
  score: z.number().min(0).max(100),
  detail: z.string(),
  fix: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});
export const ResumeChecksDataSchema = z.object({
  overallScore: z.number().min(0).max(100),
  byCategory: z.record(z.string(), z.number().min(0).max(100)),
  checks: z.array(ResumeCheckResultSchema),
  passed: z.number(),
  warned: z.number(),
  failed: z.number(),
});
// internal duplicate to avoid circular re-export; the canonical schema is in resume-checks.ts
const _KeywordDensityRowSchema = z.object({
  term: z.string(),
  jdCount: z.number(),
  resumeCount: z.number(),
  importance: z.enum(['high', 'medium', 'low']),
});
export const KeywordDensityDataSchema = z.object({
  rows: z.array(_KeywordDensityRowSchema),
  totalJdTerms: z.number(),
  matchedTerms: z.number(),
  matchPct: z.number(),
});

export const AnalysisSchema = z.object({
  id: z.string(),
  overallScore: z.number().min(0).max(100),
  atsScore: z.number().min(0).max(100),
  atsIssues: z.array(ATSIssueSchema),
  keywordMatch: KeywordMatchSchema,
  sections: z.array(SectionFeedbackSchema),
  // Deterministic checks — Resume Worded / Jobscan-style scorecard. Optional
  // for backward compatibility with analyses created before this layer existed.
  checks: ResumeChecksDataSchema.optional(),
  keywordDensity: KeywordDensityDataSchema.optional(),
  createdAt: z.string(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

// the LLM returns this shape without id/createdAt/checks/keywordDensity —
// we stamp id+createdAt on insert and run checks+keywordDensity locally.
export const AnalysisLLMSchema = AnalysisSchema.omit({
  id: true,
  createdAt: true,
  checks: true,
  keywordDensity: true,
});
export type AnalysisLLM = z.infer<typeof AnalysisLLMSchema>;

// --- Bullet rewrite + validator ---

export const ValidationFlagSchema = z.object({
  type: z.enum([
    'fabricated_fact',
    'added_metric',
    'exaggerated_scope',
    'new_technology',
    'changed_meaning',
  ]),
  detail: z.string(),
});
export type ValidationFlag = z.infer<typeof ValidationFlagSchema>;

export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  flags: z.array(ValidationFlagSchema),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// what the rewrite LLM returns for one bullet
export const RewriteLLMResponseSchema = z.object({
  rewritten: z.string(),
  keywordsInjected: z.array(z.string()),
  reasoning: z.string(),
  skipped: z.boolean(),
  skipReason: z.string().optional(),
});
export type RewriteLLMResponse = z.infer<typeof RewriteLLMResponseSchema>;

export const BulletRewriteSchema = z.object({
  bulletId: z.string(),
  section: z.enum(['experience', 'projects']),
  parentId: z.string(),
  original: z.string(),
  rewritten: z.string(),
  keywordsInjected: z.array(z.string()),
  reasoning: z.string(),
  validation: ValidationResultSchema,
});
export type BulletRewrite = z.infer<typeof BulletRewriteSchema>;

export const SectionRewriteSchema = z.object({
  summary: z
    .object({
      original: z.string(),
      rewritten: z.string(),
      reasoning: z.string(),
    })
    .optional(),
  skills: z
    .object({
      original: z.array(z.string()),
      rewritten: z.array(z.string()),
      reasoning: z.string(),
    })
    .optional(),
  industryInferred: z.string().optional(),
  referenceCompanies: z.array(z.string()).optional(),
});
export type SectionRewrite = z.infer<typeof SectionRewriteSchema>;

export const FinalReviewItemSchema = z.object({
  location: z.string(),
  issue: z.enum(['cliche', 'generic', 'tense_inconsistency', 'weak_verb', 'buzzword']),
  original: z.string(),
  replacement: z.string(),
  reason: z.string(),
});
export type FinalReviewItem = z.infer<typeof FinalReviewItemSchema>;

export const FinalReviewSchema = z.object({
  items: z.array(FinalReviewItemSchema),
  overallNote: z.string().optional(),
});
export type FinalReview = z.infer<typeof FinalReviewSchema>;

export const RewriteResultSchema = z.object({
  id: z.string(),
  analysisId: z.string(),
  bullets: z.array(BulletRewriteSchema),
  sectionRewrites: SectionRewriteSchema.optional(),
  finalReview: FinalReviewSchema.optional(),
  summary: z.object({
    totalBullets: z.number(),
    rewritten: z.number(),
    skipped: z.number(),
    flagged: z.number(),
  }),
  predictedAtsScoreDelta: z.number(),
  createdAt: z.string(),
});
export type RewriteResult = z.infer<typeof RewriteResultSchema>;

// --- API request/response shapes ---

export const UploadUrlResponseSchema = z.object({
  resumeId: z.string(),
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresIn: z.number(),
});
export type UploadUrlResponse = z.infer<typeof UploadUrlResponseSchema>;

export const AnalyzeRequestSchema = z.object({
  resumeId: z.string(),
  jobDescription: z.string().min(50).max(20000),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const RewriteRequestSchema = z.object({
  analysisId: z.string(),
  bulletIds: z.array(z.string()).optional(),
});
export type RewriteRequest = z.infer<typeof RewriteRequestSchema>;

export const AcceptRewriteRequestSchema = z.object({
  acceptances: z.array(
    z.object({
      bulletId: z.string(),
      finalText: z.string(),
    }),
  ),
});
export type AcceptRewriteRequest = z.infer<typeof AcceptRewriteRequestSchema>;

// --- Template + download ---

export const TemplateSchema = z.enum(['classic', 'modern']);
export type Template = z.infer<typeof TemplateSchema>;

export const DownloadFormatSchema = z.enum(['pdf', 'docx']);
export type DownloadFormat = z.infer<typeof DownloadFormatSchema>;
