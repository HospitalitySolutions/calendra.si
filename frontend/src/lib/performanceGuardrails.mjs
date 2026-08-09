function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index]
}

function groupedDurations(items, keyOf) {
  const grouped = new Map()
  for (const item of items || []) {
    const key = keyOf(item)
    const values = grouped.get(key) || []
    values.push(Number(item.durationMs) || 0)
    grouped.set(key, values)
  }
  return grouped
}

function isComplexApi(endpoint, patterns) {
  return (patterns || []).some((pattern) => String(endpoint).includes(pattern))
}

export function evaluatePerformanceSnapshot(snapshot, budgets) {
  const runtime = budgets?.runtime || {}
  const minimumSamples = Number(runtime.minimumSamples) || 5
  const violations = []
  const warnings = []
  const observations = []

  const duplicates = snapshot?.duplicates || []
  const duplicateMax = Number(runtime.duplicateInflightGetsMax ?? 0)
  if (duplicates.length > duplicateMax) {
    const examples = [...new Set(duplicates.slice(-5).map((item) => `${item.method} ${item.endpoint}`))]
    violations.push({
      code: 'duplicate-inflight-get',
      message: `${duplicates.length} duplicate in-flight GET request(s) recorded; maximum is ${duplicateMax}.`,
      examples,
    })
  }

  const apiGroups = groupedDurations(snapshot?.api || [], (item) => `${item.method} ${item.endpoint}`)
  for (const [endpoint, values] of apiGroups) {
    if (values.length < minimumSamples) continue
    const p95 = percentile(values, 0.95)
    const maxAllowed = isComplexApi(endpoint, runtime.complexApiPatterns)
      ? Number(runtime.complexApiP95Ms) || 500
      : Number(runtime.apiP95Ms) || 300
    observations.push({ type: 'api', key: endpoint, samples: values.length, p95Ms: p95, budgetMs: maxAllowed })
    if (p95 != null && p95 > maxAllowed) {
      violations.push({
        code: 'api-p95',
        message: `${endpoint} p95 is ${p95}ms across ${values.length} samples; budget is ${maxAllowed}ms.`,
      })
    }
  }

  const navigationGroups = groupedDurations(snapshot?.navigations || [], (item) => item.pathname)
  for (const [pathname, values] of navigationGroups) {
    if (values.length < minimumSamples) continue
    const p95 = percentile(values, 0.95)
    const hardMax = Number(runtime.navigationP95MaxMs) || 500
    const target = Number(runtime.navigationTargetMs) || 150
    observations.push({ type: 'navigation', key: pathname, samples: values.length, p95Ms: p95, budgetMs: hardMax })
    if (p95 != null && p95 > hardMax) {
      violations.push({
        code: 'navigation-p95',
        message: `${pathname} navigation p95 is ${p95}ms across ${values.length} samples; maximum is ${hardMax}ms.`,
      })
    } else if (p95 != null && p95 > target) {
      warnings.push({
        code: 'navigation-target',
        message: `${pathname} navigation p95 is ${p95}ms; target is ${target}ms (hard maximum ${hardMax}ms).`,
      })
    }
  }

  for (const navigation of snapshot?.navigations || []) {
    const familyBudget = runtime.fanOut?.[navigation.family]
    if (!familyBudget || typeof navigation.uniqueApiGetCount !== 'number') continue
    const hardMax = Number(familyBudget.max)
    const target = Number(familyBudget.target)
    if (navigation.uniqueApiGetCount > hardMax) {
      violations.push({
        code: 'navigation-fanout',
        message: `${navigation.pathname} started ${navigation.uniqueApiGetCount} unique GETs during navigation; ${navigation.family} maximum is ${hardMax}.`,
      })
    } else if (navigation.uniqueApiGetCount > target) {
      warnings.push({
        code: 'navigation-fanout-target',
        message: `${navigation.pathname} started ${navigation.uniqueApiGetCount} unique GETs; ${navigation.family} target is ${target}.`,
      })
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    observations,
  }
}
