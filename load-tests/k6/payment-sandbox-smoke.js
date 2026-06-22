import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, adminEmail, futureDate, guestEmail } from './lib/data.js';
import { bearer, expectStatus, firstAvailableSlot, firstLinkedTenant, firstProduct, loginAdmin, loginGuest, parseJson } from './lib/http.js';

export const options = {
  scenarios: {
    guest_card_checkout_smoke: {
      executor: 'shared-iterations',
      exec: 'guestCardCheckoutSmoke',
      vus: Number(__ENV.VUS || 1),
      iterations: Number(__ENV.ITERATIONS || 1),
      tags: { test_type: 'payment_smoke', flow: 'guest_card_checkout_smoke' },
    },
    tenant_invoice_card_checkout_smoke: {
      executor: 'shared-iterations',
      exec: 'tenantInvoiceCheckoutSmoke',
      vus: Number(__ENV.ADMIN_VUS || 1),
      iterations: Number(__ENV.ADMIN_ITERATIONS || 1),
      tags: { test_type: 'payment_smoke', flow: 'tenant_invoice_card_checkout_smoke' },
    },
  },
  thresholds: {
    'http_req_failed{test_type:payment_smoke}': ['rate<0.05'],
    'http_req_duration{test_type:payment_smoke}': ['p(95)<1500'],
    checks: ['rate>0.95'],
  },
};

export function guestCardCheckoutSmoke() {
  const login = loginGuest(guestEmail(Number(__ENV.PAYMENT_GUEST_INDEX || 1)));
  if (!login.token) return;
  const tenant = firstLinkedTenant(login.body);
  if (!tenant || !tenant.companyId) return;
  const h = bearer(login.token, { 'Idempotency-Key': `k6-payment-guest-${Date.now()}-${__VU}-${__ITER}` });

  const products = http.get(`${BASE_URL}/api/guest/products?companyId=${tenant.companyId}`, { headers: h, tags: { endpoint: 'payment_guest_products' } });
  expectStatus(products, 'payment guest products 200');
  const product = firstProduct(parseJson(products, []));
  if (!product || !product.sessionTypeId) return;

  const availability = http.get(`${BASE_URL}/api/guest/availability?companyId=${tenant.companyId}&sessionTypeId=${product.sessionTypeId}&date=${futureDate(80)}`, { headers: h, tags: { endpoint: 'payment_guest_availability' } });
  expectStatus(availability, 'payment guest availability 200');
  const slot = firstAvailableSlot(parseJson(availability, {}));
  if (!slot) return;

  const order = http.post(`${BASE_URL}/api/guest/orders`, JSON.stringify({
    companyId: String(tenant.companyId),
    productId: String(product.productId),
    slotId: slot.slotId,
    paymentMethodType: 'CARD',
    locale: 'sl',
  }), { headers: h, tags: { endpoint: 'payment_guest_create_card_order' } });

  check(order, {
    'card order either creates or clearly reports Stripe setup missing': (r) => r.status === 200 || (r.status === 400 && String(r.body).includes('STRIPE_SETUP_REQUIRED')),
  });

  const orderBody = parseJson(order, {});
  const orderId = orderBody && orderBody.order ? orderBody.order.orderId : null;
  if (orderId) {
    const checkout = http.post(`${BASE_URL}/api/guest/orders/${orderId}/checkout`, JSON.stringify({ paymentMethodType: 'CARD', saveCard: false, locale: 'sl' }), {
      headers: bearer(login.token, { 'Idempotency-Key': `k6-payment-checkout-${orderId}-${Date.now()}-${__VU}-${__ITER}` }),
      tags: { endpoint: 'payment_guest_card_checkout' },
    });
    check(checkout, {
      'card checkout returns checkout URL or setup error': (r) => r.status === 200 || (r.status === 400 && String(r.body).includes('STRIPE_SETUP_REQUIRED')),
    });
  }
  sleep(1);
}

export function tenantInvoiceCheckoutSmoke() {
  const login = loginAdmin(adminEmail(Number(__ENV.PAYMENT_TENANT_INDEX || 1)));
  if (!login.token) return;
  const h = bearer(login.token);
  const bills = http.get(`${BASE_URL}/api/billing/bills?page=0&size=20`, { headers: h, tags: { endpoint: 'payment_admin_bills' } });
  expectStatus(bills, 'admin bills for payment smoke 200');
  const body = parseJson(bills, []);
  const bill = Array.isArray(body) ? body.find((b) => b && b.id) : null;
  if (!bill) return;

  const checkout = http.post(`${BASE_URL}/api/billing/bills/${bill.id}/checkout-session`, JSON.stringify({}), {
    headers: h,
    tags: { endpoint: 'payment_admin_bill_checkout' },
  });
  check(checkout, {
    'tenant bill checkout returns URL or setup error': (r) => r.status === 200 || (r.status === 400 && String(r.body).includes('STRIPE_SETUP_REQUIRED')),
  });
  sleep(1);
}
