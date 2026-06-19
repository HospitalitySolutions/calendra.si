export const BASE_URL = (__ENV.BASE_URL || 'https://app.calendra.si').replace(/\/$/, '');
export const ORIGIN = __ENV.ORIGIN || 'https://calendra.si';
export const PASSWORD = __ENV.LOADTEST_PASSWORD || 'LoadTest123!';
export const SEED_TENANTS = Number(__ENV.SEED_TENANTS || 1000);
export const SEED_GUESTS = Number(__ENV.SEED_GUESTS || 10000);

export function pad(n, width) {
  return String(n).padStart(width, '0');
}

export function tenantIndex() {
  return ((__VU + __ITER) % SEED_TENANTS) + 1;
}

export function guestIndex() {
  return (((__VU * 97) + __ITER) % SEED_GUESTS) + 1;
}

export function tenantCode(index = tenantIndex()) {
  return `lt-${pad(index, 4)}`;
}

export function adminEmail(index = tenantIndex()) {
  return `lt-admin-${pad(index, 4)}@loadtest.local`;
}

export function guestEmail(index = guestIndex()) {
  return `lt-guest-${pad(index, 5)}@loadtest.local`;
}

export function futureDate(daysFromNow = 1) {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function nextMonthDate() {
  return futureDate(7 + ((__VU + __ITER) % 20));
}
