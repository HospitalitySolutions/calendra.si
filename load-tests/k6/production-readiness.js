import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, ORIGIN, adminEmail, currentMonth, futureDate, guestEmail, nextMonthDate, tenantCode } from './lib/data.js';
import { bearer, expectStatus, firstAvailableSlot, firstLinkedTenant, firstProduct, jsonHeaders, loginAdmin, loginGuest, parseJson } from './lib/http.js';

const QUICK = __ENV.QUICK === 'true';
const P95_MS = Number(__ENV.P95_MS || 800);
const ERROR_RATE = Number(__ENV.ERROR_RATE || 0.01);

export const options = {
  scenarios: {
    guest_browse_wallet_inbox: {
      executor: 'ramping-vus',
      exec: 'guestBrowseWalletInbox',
      startVUs: 0,
      stages: QUICK
        ? [{ duration: '30s', target: 10 }, { duration: '1m', target: 10 }, { duration: '20s', target: 0 }]
        : [{ duration: '2m', target: 100 }, { duration: '10m', target: 100 }, { duration: '2m', target: 0 }],
      tags: { test_type: 'load', flow: 'guest_browse_wallet_inbox' },
    },
    guest_order_booking_actions: {
      executor: 'ramping-vus',
      exec: 'guestOrderBookingActions',
      startVUs: 0,
      stages: QUICK
        ? [{ duration: '30s', target: 5 }, { duration: '1m', target: 5 }, { duration: '20s', target: 0 }]
        : [{ duration: '2m', target: 40 }, { duration: '10m', target: 40 }, { duration: '2m', target: 0 }],
      tags: { test_type: 'load', flow: 'guest_order_booking_actions' },
    },
    widget_browse_and_book: {
      executor: 'ramping-vus',
      exec: 'widgetBrowseAndBook',
      startVUs: 0,
      stages: QUICK
        ? [{ duration: '30s', target: 5 }, { duration: '1m', target: 5 }, { duration: '20s', target: 0 }]
        : [{ duration: '2m', target: 40 }, { duration: '10m', target: 40 }, { duration: '2m', target: 0 }],
      tags: { test_type: 'load', flow: 'widget_browse_and_book' },
    },
    admin_calendar_billing_logs: {
      executor: 'ramping-vus',
      exec: 'adminCalendarBillingLogs',
      startVUs: 0,
      stages: QUICK
        ? [{ duration: '30s', target: 5 }, { duration: '1m', target: 5 }, { duration: '20s', target: 0 }]
        : [{ duration: '2m', target: 30 }, { duration: '10m', target: 30 }, { duration: '2m', target: 0 }],
      tags: { test_type: 'load', flow: 'admin_calendar_billing_logs' },
    },
    notification_dispatch_probe: {
      executor: 'constant-arrival-rate',
      exec: 'notificationDispatchProbe',
      rate: QUICK ? 2 : Number(__ENV.NOTIFICATION_PROBE_RATE || 10),
      timeUnit: '1s',
      duration: QUICK ? '1m' : (__ENV.NOTIFICATION_PROBE_DURATION || '10m'),
      preAllocatedVUs: QUICK ? 5 : 30,
      maxVUs: QUICK ? 20 : 100,
      tags: { test_type: 'load', flow: 'notification_dispatch_probe' },
    },
  },
  thresholds: {
    'http_req_failed{test_type:load}': [`rate<${ERROR_RATE}`],
    'http_req_duration{test_type:load}': [`p(95)<${P95_MS}`],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function guestBrowseWalletInbox() {
  const login = loginGuest(guestEmail());
  if (!login.token) return;
  const tenant = firstLinkedTenant(login.body);
  if (!tenant || !tenant.companyId) return;
  const companyId = tenant.companyId;
  const h = bearer(login.token);

  const products = http.get(`${BASE_URL}/api/guest/products?companyId=${companyId}`, { headers: h, tags: { endpoint: 'guest_products' } });
  const productList = parseJson(products, []);
  const product = firstProduct(productList);
  const date = nextMonthDate();

  const requests = [
    ['GET', `${BASE_URL}/api/guest/me`, null, { headers: h, tags: { endpoint: 'guest_me' } }],
    ['GET', `${BASE_URL}/api/guest/home?companyId=${companyId}`, null, { headers: h, tags: { endpoint: 'guest_home' } }],
    ['GET', `${BASE_URL}/api/guest/wallet?companyId=${companyId}&ordersPage=0&ordersSize=50&entitlementsPage=0&entitlementsSize=50`, null, { headers: h, tags: { endpoint: 'guest_wallet' } }],
    ['GET', `${BASE_URL}/api/guest/bookings/history?companyId=${companyId}&page=0&size=50`, null, { headers: h, tags: { endpoint: 'guest_booking_history' } }],
    ['GET', `${BASE_URL}/api/guest/notifications?companyId=${companyId}`, null, { headers: h, tags: { endpoint: 'guest_notifications' } }],
    ['GET', `${BASE_URL}/api/guest/inbox/threads?companyId=${companyId}&page=0&size=50`, null, { headers: h, tags: { endpoint: 'guest_inbox_threads' } }],
    ['GET', `${BASE_URL}/api/guest/inbox/messages?companyId=${companyId}&page=0&size=50`, null, { headers: h, tags: { endpoint: 'guest_inbox_messages' } }],
  ];
  if (product && product.sessionTypeId) {
    requests.push(['GET', `${BASE_URL}/api/guest/availability?companyId=${companyId}&sessionTypeId=${product.sessionTypeId}&date=${date}`, null, { headers: h, tags: { endpoint: 'guest_availability' } }]);
  }
  const responses = http.batch(requests);
  responses.forEach((res) => expectStatus(res, `${res.request && res.request.method ? res.request.method : 'request'} ok`, [200]));
  sleep(1);
}

export function guestOrderBookingActions() {
  const login = loginGuest(guestEmail());
  if (!login.token) return;
  const tenant = firstLinkedTenant(login.body);
  if (!tenant || !tenant.companyId) return;
  const companyId = tenant.companyId;
  const h = bearer(login.token, { 'Idempotency-Key': `k6-guest-${__VU}-${__ITER}` });

  const productsRes = http.get(`${BASE_URL}/api/guest/products?companyId=${companyId}`, { headers: h, tags: { endpoint: 'guest_products_for_order' } });
  expectStatus(productsRes, 'guest products for order 200');
  const product = firstProduct(parseJson(productsRes, []));
  if (!product || !product.sessionTypeId) return;

  const date = futureDate(14 + ((__VU + __ITER) % 30));
  const availabilityRes = http.get(`${BASE_URL}/api/guest/availability?companyId=${companyId}&sessionTypeId=${product.sessionTypeId}&date=${date}`, { headers: h, tags: { endpoint: 'guest_availability_for_order' } });
  expectStatus(availabilityRes, 'guest availability for order 200');
  const slot = firstAvailableSlot(parseJson(availabilityRes, {}));
  if (!slot) return;

  const createOrderRes = http.post(`${BASE_URL}/api/guest/orders`, JSON.stringify({
    companyId: String(companyId),
    productId: String(product.productId),
    slotId: slot.slotId,
    paymentMethodType: 'PAY_AT_VENUE',
    locale: 'sl',
  }), { headers: h, tags: { endpoint: 'guest_create_order' } });
  expectStatus(createOrderRes, 'guest create order 200', [200, 409]);
  const orderBody = parseJson(createOrderRes, {});
  const bookingId = orderBody && orderBody.booking ? orderBody.booking.bookingId : null;

  if (bookingId) {
    const laterDate = futureDate(50 + ((__VU + __ITER) % 20));
    const laterAvailabilityRes = http.get(`${BASE_URL}/api/guest/availability?companyId=${companyId}&sessionTypeId=${product.sessionTypeId}&date=${laterDate}`, { headers: h, tags: { endpoint: 'guest_reschedule_availability' } });
    expectStatus(laterAvailabilityRes, 'guest reschedule availability 200');
    const newSlot = firstAvailableSlot(parseJson(laterAvailabilityRes, {}));
    if (newSlot) {
      const rescheduleRes = http.post(`${BASE_URL}/api/guest/bookings/${bookingId}/reschedule`, JSON.stringify({ newSlotId: newSlot.slotId }), {
        headers: bearer(login.token),
        tags: { endpoint: 'guest_booking_reschedule' },
      });
      expectStatus(rescheduleRes, 'guest booking reschedule 200', [200, 400, 409]);
    }

    const cancelRes = http.post(`${BASE_URL}/api/guest/bookings/${bookingId}/cancel`, JSON.stringify({ reason: 'k6 load test cleanup' }), {
      headers: bearer(login.token),
      tags: { endpoint: 'guest_booking_cancel' },
    });
    expectStatus(cancelRes, 'guest booking cancel 200', [200, 400, 409]);
  }
  sleep(1);
}

export function widgetBrowseAndBook() {
  const index = ((__VU + __ITER) % Number(__ENV.SEED_TENANTS || 1000)) + 1;
  const code = tenantCode(index);
  const headers = jsonHeaders({ 'Idempotency-Key': `k6-widget-${__VU}-${__ITER}` });
  const configRes = http.get(`${BASE_URL}/api/public/widget/${code}/config`, { headers, tags: { endpoint: 'widget_config' } });
  expectStatus(configRes, 'widget config 200');
  const servicesRes = http.get(`${BASE_URL}/api/public/widget/${code}/services`, { headers, tags: { endpoint: 'widget_services' } });
  expectStatus(servicesRes, 'widget services 200');
  const services = parseJson(servicesRes, []);
  const service = Array.isArray(services) && services.length ? services[0] : null;
  if (!service || !service.id) return;

  const date = futureDate(25 + ((__VU + __ITER) % 30));
  const availabilityRes = http.get(`${BASE_URL}/api/public/widget/${code}/availability?typeId=${service.id}&date=${date}`, { headers, tags: { endpoint: 'widget_availability' } });
  expectStatus(availabilityRes, 'widget availability 200');
  const slot = firstAvailableSlot(parseJson(availabilityRes, {}));
  if (!slot) return;

  const bookingRes = http.post(`${BASE_URL}/api/public/widget/${code}/bookings`, JSON.stringify({
    typeId: Number(service.id),
    date,
    startTime: slot.startTime,
    consultantId: slot.consultantId || null,
    firstName: 'K6',
    lastName: `Widget ${__VU}-${__ITER}`,
    email: `k6-widget-${__VU}-${__ITER}-${Date.now()}@loadtest.local`,
    phone: '+38640123456',
  }), { headers, tags: { endpoint: 'widget_create_booking' } });
  expectStatus(bookingRes, 'widget create booking 200', [200, 400, 409]);
  sleep(1);
}

export function adminCalendarBillingLogs() {
  const login = loginAdmin(adminEmail());
  if (!login.token) return;
  const h = bearer(login.token);
  const from = futureDate(-14);
  const to = futureDate(45);
  const requests = [
    ['GET', `${BASE_URL}/api/bookings/calendar?from=${from}&to=${to}`, null, { headers: h, tags: { endpoint: 'admin_calendar' } }],
    ['GET', `${BASE_URL}/api/bookings?from=${from}&to=${to}`, null, { headers: h, tags: { endpoint: 'admin_booking_list' } }],
    ['GET', `${BASE_URL}/api/billing/bills?page=0&size=100`, null, { headers: h, tags: { endpoint: 'billing_bills_page' } }],
    ['GET', `${BASE_URL}/api/billing/open-bills?page=0&size=100`, null, { headers: h, tags: { endpoint: 'billing_open_bills_page' } }],
    ['GET', `${BASE_URL}/api/delivery-logs?page=0&size=100`, null, { headers: h, tags: { endpoint: 'delivery_logs_page' } }],
    ['GET', `${BASE_URL}/api/delivery-logs?page=0&size=100&channel=EMAIL`, null, { headers: h, tags: { endpoint: 'delivery_logs_filtered' } }],
    ['GET', `${BASE_URL}/api/inbox/threads?page=0&size=100`, null, { headers: h, tags: { endpoint: 'admin_inbox_threads' } }],
  ];
  const responses = http.batch(requests);
  responses.forEach((res) => expectStatus(res, 'admin request 200', [200]));
  sleep(1);
}

export function notificationDispatchProbe() {
  const login = loginAdmin(adminEmail());
  if (!login.token) return;
  const h = bearer(login.token);
  const logs = http.get(`${BASE_URL}/api/delivery-logs?page=0&size=20`, { headers: h, tags: { endpoint: 'notification_dispatch_logs_probe' } });
  expectStatus(logs, 'delivery logs probe 200');
  const body = parseJson(logs, {});
  check(body, {
    'delivery logs response has items or page payload': (b) => Array.isArray(b.items) || Array.isArray(b.content) || typeof b.totalElements === 'number',
  });
  sleep(1);
}

export function setup() {
  const health = http.get(`${BASE_URL}/actuator/health`, { tags: { endpoint: 'actuator_health', test_type: 'setup' } });
  check(health, { 'backend health is reachable': (r) => r.status === 200 || r.status === 401 || r.status === 403 });
}
