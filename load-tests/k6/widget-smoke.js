import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    widget_browsing: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '2m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<750'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TENANT_CODE = __ENV.TENANT_CODE || 'demo';

export default function () {
  const headers = {
    Origin: __ENV.ORIGIN || 'http://localhost:3000',
  };

  const config = http.get(`${BASE_URL}/api/public/widget/${TENANT_CODE}/config`, { headers });
  check(config, {
    'config returns 200': (r) => r.status === 200,
  });

  const services = http.get(`${BASE_URL}/api/public/widget/${TENANT_CODE}/services`, { headers });
  check(services, {
    'services returns 200': (r) => r.status === 200,
  });

  let typeId = __ENV.TYPE_ID;
  try {
    const parsed = services.json();
    if (!typeId && Array.isArray(parsed) && parsed.length > 0) {
      typeId = parsed[0].id;
    }
  } catch (_) {
    // Keep smoke test resilient when the tenant has no services configured yet.
  }

  if (typeId) {
    const date = __ENV.DATE || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const availability = http.get(`${BASE_URL}/api/public/widget/${TENANT_CODE}/availability?typeId=${typeId}&date=${date}`, { headers });
    check(availability, {
      'availability returns 200 or validation response': (r) => r.status === 200 || r.status === 400,
    });
  }

  sleep(1);
}
