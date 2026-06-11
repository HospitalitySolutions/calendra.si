import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'

type CourseAccessResponse = {
  courseId: string
  title: string
  description?: string | null
  mediaType: 'VIDEO' | 'AUDIO'
  thumbnailUrl?: string | null
  bunnyLibraryId?: string | null
  bunnyVideoId?: string | null
  mediaUrl?: string | null
  durationSeconds?: number | null
  validUntil?: string | null
}

export function CourseAccessPage() {
  const params = useParams()
  const location = useLocation()
  const { locale } = useLocale()

  const token = useMemo(() => {
    const routeToken = params.token || params.accessToken
    if (routeToken) return routeToken
    const match = location.pathname.match(/\/course-access\/([^/?#]+)/)
    return match ? decodeURIComponent(match[1]) : ''
  }, [location.pathname, params.accessToken, params.token])
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<CourseAccessResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError(locale === 'sl' ? 'Povezava za dostop ni veljavna.' : 'The access link is not valid.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api.get<CourseAccessResponse>(`/course-access/${encodeURIComponent(token)}`)
      .then((res) => {
        if (!cancelled) {
          setCourse(res.data)
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.message || (locale === 'sl' ? 'Dostop do tečaja ni več aktiven.' : 'Course access is no longer active.'))
          setCourse(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [locale, token])

  const videoEmbedUrl = useMemo(() => {
    if (!course || course.mediaType !== 'VIDEO' || !course.bunnyLibraryId || !course.bunnyVideoId) return ''
    return `https://iframe.mediadelivery.net/embed/${encodeURIComponent(course.bunnyLibraryId)}/${encodeURIComponent(course.bunnyVideoId)}?autoplay=false&loop=false&muted=false&preload=true&responsive=true`
  }, [course])

  const copy = locale === 'sl'
    ? {
        loading: 'Nalaganje tečaja…',
        openTitle: 'Dostop do tečaja',
        validLifetime: 'Doživljenjski dostop',
        validUntil: 'Dostop velja do',
        unavailable: 'Tečaj ni na voljo',
        videoPreparing: 'Video se še pripravlja ali Bunny Stream ni nastavljen.',
        audioPreparing: 'Audio datoteka se še pripravlja ali Bunny Storage ni nastavljen.',
      }
    : {
        loading: 'Loading course…',
        openTitle: 'Course access',
        validLifetime: 'Lifetime access',
        validUntil: 'Access valid until',
        unavailable: 'Course unavailable',
        videoPreparing: 'The video is still processing or Bunny Stream is not configured.',
        audioPreparing: 'The audio file is still processing or Bunny Storage is not configured.',
      }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #eef6ff 0%, #ffffff 48%, #f8fafc 100%)', padding: '28px 16px' }}>
      <main style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ marginBottom: 18, color: '#0369a1', fontWeight: 800, letterSpacing: 0.2 }}>Calendra</div>
        <section style={{ background: 'rgba(255,255,255,0.94)', border: '1px solid #dbeafe', borderRadius: 28, boxShadow: '0 24px 70px rgba(15, 23, 42, 0.11)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 42, color: '#475569' }}>{copy.loading}</div>
          ) : error ? (
            <div style={{ padding: 42 }}>
              <h1 style={{ margin: '0 0 10px', fontSize: 28, color: '#0f172a' }}>{copy.unavailable}</h1>
              <p style={{ margin: 0, color: '#64748b' }}>{error}</p>
            </div>
          ) : course ? (
            <>
              <div style={{ padding: '28px 30px 20px' }}>
                <div style={{ color: '#0284c7', fontWeight: 800, textTransform: 'uppercase', fontSize: 12, letterSpacing: 1.2 }}>{copy.openTitle}</div>
                <h1 style={{ margin: '8px 0 8px', fontSize: 34, lineHeight: 1.08, color: '#0f172a' }}>{course.title}</h1>
                {course.description && <p style={{ margin: '0 0 14px', color: '#475569', fontSize: 16 }}>{course.description}</p>}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#eff6ff', color: '#075985', borderRadius: 999, fontWeight: 800, fontSize: 13 }}>
                  {course.validUntil ? `${copy.validUntil} ${new Date(course.validUntil).toLocaleDateString()}` : copy.validLifetime}
                </div>
              </div>
              <div style={{ padding: '0 30px 32px' }}>
                {course.mediaType === 'VIDEO' ? (
                  videoEmbedUrl ? (
                    <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 22, overflow: 'hidden', background: '#0f172a' }}>
                      <iframe
                        title={course.title}
                        src={videoEmbedUrl}
                        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                      />
                    </div>
                  ) : (
                    <div style={{ padding: 24, borderRadius: 18, background: '#f8fafc', color: '#64748b' }}>{copy.videoPreparing}</div>
                  )
                ) : course.mediaUrl ? (
                  <div style={{ padding: 24, borderRadius: 22, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <audio controls src={course.mediaUrl} style={{ width: '100%' }} />
                  </div>
                ) : (
                  <div style={{ padding: 24, borderRadius: 18, background: '#f8fafc', color: '#64748b' }}>{copy.audioPreparing}</div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
