import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const e = this.state.error
      return (
        <div
          style={{
            padding: 20,
            fontFamily: 'system-ui, sans-serif',
            maxWidth: 560,
            margin: '40px auto',
            color: '#1e293b',
            background: '#fff',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: '#64748b', marginBottom: 16 }}>
            The app hit an error. You can reload to try again. If this persists, share the text below.
          </p>
          <pre
            style={{
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#f1f5f9',
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            {e.message}
          </pre>
          <button
            type="button"
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#1672f3',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
