import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, ORIGIN, PASSWORD } from './data.js';

export function jsonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: ORIGIN,
    ...extra,
  };
}

export function bearer(token, extra = {}) {
  return jsonHeaders({ Authorization: `Bearer ${token}`, 'X-App-Platform': 'native', ...extra });
}

export function parseJson(res, fallback = null) {
  try {
    return res.json();
  } catch (_) {
    return fallback;
  }
}

export function expectStatus(res, name, allowed = [200]) {
  return check(res, {
    [name]: (r) => allowed.includes(r.status),
  });
}

export function loginGuest(email) {
  const res = http.post(`${BASE_URL}/api/guest/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: jsonHeaders({ 'X-App-Platform': 'native' }),
    tags: { endpoint: 'guest_login' },
  });
  expectStatus(res, 'guest login 200');
  const body = parseJson(res, {});
  return { token: body.token, body };
}

export function loginAdmin(email) {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
    headers: jsonHeaders({ 'X-App-Platform': 'native' }),
    tags: { endpoint: 'admin_login' },
  });
  expectStatus(res, 'admin login 200');
  const body = parseJson(res, {});
  return { token: body.token, body };
}

export function firstLinkedTenant(guestLoginBody) {
  const linked = guestLoginBody && Array.isArray(guestLoginBody.linkedTenants) ? guestLoginBody.linkedTenants : [];
  return linked.length ? linked[0] : null;
}

export function firstProduct(products) {
  if (!Array.isArray(products)) return null;
  return products.find((p) => p && p.bookable && p.sessionTypeId) || products[0] || null;
}

export function firstAvailableSlot(availability) {
  const slots = availability && Array.isArray(availability.slots) ? availability.slots : [];
  return slots.find((s) => s && s.available !== false) || null;
}
