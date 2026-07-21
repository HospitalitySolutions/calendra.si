# Phase B: legacy endpoint monitoring

Phase B intentionally does **not** remove repository-audited backend routes yet. It adds a measurable deprecation window so older mobile releases, bookmarked links, scripts, and external integrations are not broken by a repository-only assumption.

## What is tracked

Handlers marked with `@TrackLegacyEndpoint`:

- return `Deprecation: true`;
- return `X-Calendra-Legacy-Endpoint: <stable-id>`;
- return `X-Calendra-Replacement: <...>` when a replacement is documented;
- return a `Link: <...>; rel="successor-version"` header when the successor is a concrete route without path variables;
- increment `legacy_endpoint_calls` with `endpoint`, `method`, and `outcome` tags;
- record `legacy_endpoint_duration`;
- write one structured event to the `legacy-endpoint-audit` logger after completion.

The structured event includes the stable endpoint id, actual path, status, outcome, duration, replacement, client version/platform headers when supplied, and the user agent. Request bodies and query-string values are not logged.

## Platform Admin inspection

`GET /api/platform-admin/monitoring/legacy-endpoints`

The response lists every observed removal candidate, including routes with zero calls in the current process. It also shows current-process counts and last-seen caller details.

The normal monitoring status now includes a `Legacy endpoint calls` metric. Platform Admin → Monitoring also shows a per-route table sorted by current-process call count, including the last observed caller details.

## Prometheus

Micrometer exports the counter as a Prometheus counter, normally:

```promql
sum by (endpoint, method, outcome) (
  increase(legacy_endpoint_calls_total[30d])
)
```

A zero value from one backend process or one short dashboard range is not enough to approve removal. Check the full production fleet and retained time range.

## Removal gate for Phase B2

A route can move to Phase B2 only when all of the following are true:

1. No calls are present in retained Prometheus data for the agreed observation window.
2. No `legacy-endpoint-audit` logs identify an active caller.
3. The observation window covers at least one supported mobile release cycle.
4. External integrations, operational scripts, reverse-proxy rules, and public documentation have been checked.
5. The replacement route has regression coverage.

Remove routes in small groups. In the same change, remove DTOs and service methods that become exclusively unreachable, then run backend, web, Android, and iOS compatibility tests.
