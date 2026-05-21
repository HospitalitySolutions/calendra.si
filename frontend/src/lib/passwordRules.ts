export type PasswordRuleChecks = {
  minLength: boolean
  hasNumber: boolean
  hasUppercase: boolean
  hasLowercase: boolean
}

export function getPasswordRuleChecks(password: string): PasswordRuleChecks {
  return {
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
  }
}

export function passwordMeetsRequirements(password: string): boolean {
  const checks = getPasswordRuleChecks(password)
  return checks.minLength && checks.hasNumber && checks.hasUppercase && checks.hasLowercase
}
