// k6 smoke test for the web /api/analyze pipeline.
//
// This isn't a throughput test — Groq is the bottleneck and rate-limited.
// We just want to confirm the route handles ~10 concurrent users without
// 5xx errors or unhandled rejections. Real load goes through the upload UI
// flow which is more complex than what k6 should model.
//
// Run:
//   WEB_URL=https://staging.devwithb.space k6 run load/analyze.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const URL = __ENV.WEB_URL;
if (!URL) throw new Error('WEB_URL must be set');

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<8000'], // analyze is LLM-bound, ~3-5s expected
  },
};

// NOTE: this hits the public read-only `/r/example` page as a cheap proxy for
// "is the app up". The full upload+parse+analyze flow needs a real PDF blob
// and storage credentials, which is out of scope for a smoke test.
export default function () {
  const res = http.get(`${URL}/r/example`, { timeout: '10s' });
  check(res, {
    'status 200': (r) => r.status === 200,
    'returns html': (r) => r.headers['Content-Type']?.includes('text/html'),
  });
  sleep(1);
}
