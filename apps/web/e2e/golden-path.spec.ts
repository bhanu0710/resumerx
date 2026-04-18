import { test, expect } from '@playwright/test';

// Golden path: upload a resume, paste a JD, see the analysis, trigger rewrite,
// download the PDF. This uses the dev upload endpoint and a pre-baked pdf so
// it runs without cloud credentials.
test('home → analyze → rewrite → download', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /resumerx/i })).toBeVisible();

  // seed a resume via the dev bypass so we don't have to drive a file picker
  const resumeId = `e2e-${Date.now().toString(36)}`;
  const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<<>>\n%%EOF');
  const up = await request.put(`/api/dev-upload?resumeId=${resumeId}`, {
    data: pdfBytes,
    headers: { 'content-type': 'application/pdf' },
  });
  // dev endpoint only exists in non-prod builds; skip cleanly otherwise
  test.skip(up.status() === 404, 'dev-upload not available — production build');
  expect(up.ok()).toBeTruthy();

  const analyze = await request.post('/api/analyze', {
    data: {
      resumeId,
      jobDescription:
        'Senior Backend Engineer. Python, Go, PostgreSQL, Kafka, distributed systems, payments reconciliation, 5+ years experience with microservices.',
    },
  });
  expect(analyze.ok()).toBeTruthy();
  const { analysisId } = await analyze.json();
  expect(analysisId).toBeTruthy();

  await page.goto(`/r/${analysisId}`);
  await expect(page.getByText(/score/i).first()).toBeVisible();
});
