import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'

export function ResetPasswordPage() {
  const { t } = useLocale()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [validating, setValidating] = useState(true)
  const [valid, setValid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setValidating(false)
      setValid(false)
      setError(t('resetPasswordMissingToken'))
      return
    }
    api.get('/auth/reset-password/validate', { params: { token } })
      .then(() => {
        setValid(true)
        setError('')
      })
      .catch(() => {
        setValid(false)
        setError(t('resetPasswordInvalidLink'))
      })
      .finally(() => setValidating(false))
  }, [token, t])

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 8) {
      setError(t('resetPasswordMinLength'))
      return
    }
    if (password !== confirm) {
      setError(t('resetPasswordMismatch'))
      return
    }
    setSubmitting(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setMessage(t('resetPasswordSuccess'))
      setTimeout(() => navigate('/'), 1200)
    } catch (err: any) {
      setError(err?.response?.data?.message || t('resetPasswordFailedGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrap login-bg">
      <div className="card login polished-login" style={{ boxShadow: '0 24px 60px rgba(22, 114, 243, 0.15)' }}>
        <h1 style={{ marginTop: 0 }}>{t('resetPasswordTitle')}</h1>
        {validating ? (
          <p>{t('resetPasswordValidating')}</p>
        ) : !valid ? (
          <>
            <p className="error">{error}</p>
            <button type="button" className="secondary" onClick={() => navigate('/')}>
              {t('signupBack')}
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="login-forgot-form">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('resetPasswordNewPlaceholder')}
              required
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('resetPasswordConfirmPlaceholder')}
              required
            />
            {error && <div className="error">{error}</div>}
            {message && <div className="success">{message}</div>}
            <button type="submit" disabled={submitting}>
              {submitting ? t('resetPasswordSaving') : t('resetPasswordSubmit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

