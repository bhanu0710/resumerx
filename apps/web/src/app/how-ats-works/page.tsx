import { ATS_RULES, type ATSRule } from '@resumerx/shared/ats-rules';

const CATEGORY_LABEL: Record<ATSRule['category'], string> = {
  structure: 'Structure',
  content: 'Content',
  format: 'Format',
  keywords: 'Keywords',
};

export const metadata = {
  title: 'How ATS systems read resumes — resumerx',
  description:
    'The parsing rules an Applicant Tracking System applies, and why creative formatting breaks them.',
};

export default function HowATSWorksPage() {
  const categories: ATSRule['category'][] = ['structure', 'format', 'content', 'keywords'];

  return (
    <article className="container max-w-3xl py-16 md:py-20">
      <p className="text-muted-foreground mb-2 font-mono text-xs uppercase tracking-wider">
        reference
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">How ATS systems read resumes.</h1>
      <p className="text-muted-foreground mt-4 text-lg">
        Most of the &ldquo;resume tips&rdquo; on the internet are half right or outdated. This is
        the short version of what actually matters, grouped by category. Same rules the analysis
        pass checks against.
      </p>

      {categories.map((cat) => {
        const rules = ATS_RULES.filter((r) => r.category === cat);
        return (
          <section key={cat} className="mt-12">
            <h2 className="mb-4 text-xl font-medium">{CATEGORY_LABEL[cat]}</h2>
            <div className="space-y-4">
              {rules.map((rule) => (
                <div key={rule.id} className="border-border/60 bg-card/40 rounded-lg border p-5">
                  <h3 className="font-medium">{rule.title}</h3>
                  <p className="mt-2 text-sm">{rule.description}</p>
                  <p className="border-primary/40 text-muted-foreground mt-3 border-l-2 pl-3 text-sm">
                    <span className="text-foreground/70 font-mono text-[11px] uppercase tracking-wider">
                      why
                    </span>{' '}
                    {rule.whyItMatters}
                  </p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </article>
  );
}
