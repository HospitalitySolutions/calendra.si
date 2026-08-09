export type PerformanceGuardrailIssue = {
  code: string
  message: string
  examples?: string[]
}

export type PerformanceGuardrailObservation = {
  type: 'api' | 'navigation'
  key: string
  samples: number
  p95Ms: number | null
  budgetMs: number
}

export type PerformanceGuardrailReport = {
  passed: boolean
  violations: PerformanceGuardrailIssue[]
  warnings: PerformanceGuardrailIssue[]
  observations: PerformanceGuardrailObservation[]
}

export function evaluatePerformanceSnapshot(snapshot: unknown, budgets: unknown): PerformanceGuardrailReport
