import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    workspace_booking_browsing: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<800'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const WORKSPACE_SLUG = __ENV.WORKSPACE_SLUG || 'workspace-1';

export default function () {
  const headers = { Origin: __ENV.ORIGIN || 'http://localhost:3000' };
  const prefix = `${BASE_URL}/api/public/widget/workspaces/${encodeURIComponent(WORKSPACE_SLUG)}`;

  const config = http.get(`${prefix}/config`, { headers });
  check(config, { 'workspace config returns 200': (r) => r.status === 200 });

  const locations = http.get(`${prefix}/locations`, { headers });
  check(locations, { 'workspace locations return 200': (r) => r.status === 200 });

  const services = http.get(`${prefix}/services`, { headers });
  check(services, { 'workspace services return 200': (r) => r.status === 200 });

  let launchPayload;
  try {
    const serviceRows = services.json();
    if (Array.isArray(serviceRows) && serviceRows.length > 0
        && Array.isArray(serviceRows[0].offerings) && serviceRows[0].offerings.length > 0) {
      const offering = serviceRows[0].offerings[0];
      launchPayload = JSON.stringify({
        locationToken: offering.locationToken,
        offeringToken: offering.token,
        locale: __ENV.LOCALE || 'sl',
      });
    }
  } catch (_) {
    // A workspace without public offerings still exercises discovery endpoints.
  }

  if (launchPayload && __ITER === 0) {
    const launch = http.post(`${prefix}/launch`, launchPayload, {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
    check(launch, {
      'workspace launch returns booking URL': (r) => r.status === 200 && !!r.json('bookingUrl'),
    });
  }

  sleep(1);
}
