// k6 load test for pdf-service /render-pdf
//
// Run:
//   PDF_SERVICE_URL=https://... PDF_SERVICE_TOKEN=... k6 run load/render-pdf.js
//
// Profile: ramps to 20 VUs over 30s, holds for 2min, ramps down. This mimics
// a small launch burst — Cloud Run autoscale should pick up extra instances
// around the 30s mark and shed them after the test ends.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const renderLatency = new Trend('render_latency_ms', true);
const errors = new Rate('errors');

const URL = __ENV.PDF_SERVICE_URL;
const TOKEN = __ENV.PDF_SERVICE_TOKEN;

if (!URL || !TOKEN) {
  throw new Error('PDF_SERVICE_URL and PDF_SERVICE_TOKEN must be set');
}

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '30s', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    render_latency_ms: ['p(95)<1500'],
  },
};

const sampleResume = {
  contact: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+1 555 0123',
    location: 'San Francisco, CA',
    links: ['linkedin.com/in/janedoe', 'github.com/janedoe'],
  },
  summary:
    'Senior backend engineer with 6 years building distributed systems at fintech and developer tooling startups. Comfortable owning a service end-to-end from RFC through on-call. Strongest in Go, Postgres, and observability tooling.',
  experience: [
    {
      id: 'exp1',
      title: 'Senior Backend Engineer',
      company: 'Acme Corp',
      location: 'Remote',
      startDate: 'Jan 2022',
      endDate: 'present',
      bullets: [
        { id: 'b1', text: 'Built checkout service handling 12k req/min, cutting p99 latency from 900ms to 180ms by introducing request coalescing' },
        { id: 'b2', text: 'Led 4-engineer migration of 60 services off Mongo to Postgres, saving $14k/mo in hosting' },
        { id: 'b3', text: 'Reduced CI build time from 28min to 6min by parallelizing test shards, unblocking 80 engineers' },
        { id: 'b4', text: 'Designed authz layer used by 12 downstream teams, replacing 3 ad-hoc implementations' },
      ],
    },
    {
      id: 'exp2',
      title: 'Backend Engineer',
      company: 'Beta Inc',
      location: 'New York, NY',
      startDate: 'Jul 2019',
      endDate: 'Dec 2021',
      bullets: [
        { id: 'b5', text: 'Shipped onboarding redesign that lifted day-7 activation from 31% to 44% across 2M monthly signups' },
        { id: 'b6', text: 'Owned migration from REST to gRPC across 14 services, cutting wire latency 35%' },
        { id: 'b7', text: 'Mentored 3 junior engineers; two promoted to mid-level within the year' },
      ],
    },
  ],
  projects: [],
  education: [
    {
      degree: 'BS',
      field: 'Computer Science',
      institution: 'University of California, Berkeley',
      startDate: '2015',
      endDate: '2019',
    },
  ],
  skills: {
    technical: ['Go', 'TypeScript', 'PostgreSQL', 'Redis', 'gRPC', 'Kubernetes', 'Terraform', 'AWS'],
    tools: ['Datadog', 'Sentry', 'GitHub Actions'],
    soft: [],
  },
  certifications: [],
};

export default function () {
  const res = http.post(
    `${URL}/render-pdf`,
    JSON.stringify({ resume: sampleResume }),
    {
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      timeout: '10s',
    },
  );

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has body': (r) => r.body && r.body.length > 1000,
    'is pdf': (r) => r.body && r.body.startsWith('%PDF'),
  });
  renderLatency.add(res.timings.duration);
  errors.add(!ok);

  sleep(1);
}
