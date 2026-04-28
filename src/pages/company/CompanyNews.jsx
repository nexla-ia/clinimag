import { useEffect, useMemo } from 'react'
import { Sparkles, Wrench, Bug, Tag } from 'lucide-react'
import { UPDATES, latestUpdateDate } from '../../data/updates'
import './Company.css'

const TYPE_META = {
  feature:     { label: 'Novidade',  color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', Icon: Sparkles },
  improvement: { label: 'Melhoria',  color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', Icon: Wrench },
  fix:         { label: 'Correção',  color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', Icon: Bug },
}

function formatDate(d) {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

const SEEN_KEY = 'nx_news_seen'

export default function CompanyNews() {
  // Marca como visto ao abrir
  useEffect(() => {
    localStorage.setItem(SEEN_KEY, latestUpdateDate())
  }, [])

  const grouped = useMemo(() => {
    const map = {}
    UPDATES.forEach(u => {
      if (!map[u.date]) map[u.date] = []
      map[u.date].push(u)
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [])

  return (
    <div style={{ padding: '1.5rem', maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem', color: 'var(--text-primary)' }}>
          <Sparkles size={22} style={{ color: '#7C3AED' }} />
          Novidades
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Histórico de atualizações da plataforma. Toda vez que algo novo é lançado, aparece aqui.
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: 22 }}>
        {/* Linha vertical da timeline */}
        <div style={{
          position: 'absolute', left: 8, top: 8, bottom: 8,
          width: 2, background: 'linear-gradient(180deg, #DDD6FE 0%, #E5E7EB 100%)',
          borderRadius: 2,
        }} />

        {grouped.map(([date, items], gi) => (
          <div key={date} style={{ marginBottom: 28 }}>
            {/* Bolinha + data */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, position: 'relative', marginLeft: -14 }}>
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                background: gi === 0 ? '#7C3AED' : '#fff',
                border: `2px solid ${gi === 0 ? '#7C3AED' : '#DDD6FE'}`,
                boxShadow: gi === 0 ? '0 0 0 4px #F5F3FF' : 'none',
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: gi === 0 ? '#7C3AED' : 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {formatDate(date)}
                </div>
                {gi === 0 && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Mais recente
                  </div>
                )}
              </div>
            </div>

            {/* Cards das atualizações desse dia */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((u, i) => {
                const meta = TYPE_META[u.type] || TYPE_META.improvement
                return (
                  <div key={i} className="nx-card" style={{ padding: '1.1rem 1.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: meta.bg, border: `1px solid ${meta.border}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: meta.color, flexShrink: 0,
                        }}>
                          <meta.Icon size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                            {u.title}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                              color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
                              textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>
                              {meta.label}
                            </span>
                            {(u.tags || []).map(t => (
                              <span key={t} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                                color: 'var(--text-muted)', background: '#F1F5F9', border: '1px solid var(--border)',
                              }}>
                                <Tag size={9} /> {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {u.items.map((it, j) => (
                        <li key={j} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)',
                        }}>
                          <span style={{
                            display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                            background: meta.color, marginTop: 8, flexShrink: 0,
                          }} />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
