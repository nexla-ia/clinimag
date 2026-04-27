import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Users, MessageSquare, TrendingUp, Clock, Inbox, BarChart2, RefreshCw, Search, ChevronDown } from 'lucide-react'
import './Company.css'

const PERIODS = [
  { key: 'hoje',   label: 'Hoje' },
  { key: 'ontem',  label: 'Ontem' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes',    label: 'Mês' },
  { key: 'todos',  label: 'Todos' },
]

function getPeriodRange(period) {
  const now = new Date()
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (period === 'hoje') {
    return { from: startOf(now), to: null }
  }
  if (period === 'ontem') {
    const y = new Date(now); y.setDate(y.getDate() - 1)
    const end = new Date(startOf(now) - 1)
    return { from: startOf(y), to: end }
  }
  if (period === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    return { from: startOf(d), to: null }
  }
  if (period === 'mes') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: d, to: null }
  }
  return { from: null, to: null }
}

function periodLabel(period) {
  const map = { hoje: 'hoje', ontem: 'ontem', semana: 'esta semana', mes: 'este mês', todos: 'no total' }
  return map[period] || ''
}

const CLASSIF_COLORS = {
  'Curioso':    { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  'Interessado':{ color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  'Quente':     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  'Cliente':    { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  'Inativo':    { color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
}

const ORIGEM_COLORS = ['#2563EB','#16A34A','#F59E0B','#7C3AED','#DC2626','#0891B2','#D97706','#059669']

export default function CompanyMetrics() {
  const { session } = useAuth()
  const instance      = session?.company?.instance
  const contactsTable = session?.company?.contacts_table

  const [period, setPeriod]         = useState('semana')
  const [leads, setLeads]           = useState([])
  const [loading, setLoading]       = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [search, setSearch]         = useState('')
  const [filterOrigem, setFilterOrigem] = useState('todas')
  const [page, setPage]             = useState(1)
  const PAGE_SIZE = 10

  async function load() {
    if (!contactsTable || !instance) return
    setLoading(true)
    const { data, error } = await supabase
      .from(contactsTable)
      .select('*')
      .eq('instancia', instance)
    if (error) console.error('CompanyMetrics load:', error)
    if (!error && data) setLeads(data)
    setLoading(false)
    setLastRefresh(new Date())
  }

  useEffect(() => { load() }, [contactsTable, instance])

  const filtered = useMemo(() => {
    const { from, to } = getPeriodRange(period)
    if (!from && !to) return leads
    return leads.filter(l => {
      if (!l.created_at) return false
      const d = new Date(l.created_at)
      if (isNaN(d.getTime())) return false
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }, [leads, period])

  // KPIs
  const totalLeads     = filtered.length
  const comContato     = filtered.filter(l => l.primeiro_contato === 'sim').length
  const semResposta    = filtered.filter(l => l.primeiro_contato === 'sim' && !l.ultima_mensagem).length
  const comUltimaMsg   = filtered.filter(l => !!l.ultima_mensagem).length

  // Fontes de lead
  const origensMap = useMemo(() => {
    const map = {}
    filtered.forEach(l => {
      const k = l.origem || 'Desconhecido'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  // Classificação
  const classifMap = useMemo(() => {
    const map = {}
    filtered.forEach(l => {
      const k = l.classificacao_lead || 'Sem classificação'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const maxOrigem = origensMap[0]?.[1] || 1
  const maxClassif = classifMap[0]?.[1] || 1

  // Tabela de contatos filtrada
  const tableRows = useMemo(() => {
    return filtered.filter(l => {
      const matchSearch = !search ||
        (l.nome || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.numero || '').includes(search)
      const matchOrigem = filterOrigem === 'todas' || (l.origem || 'Desconhecido') === filterOrigem
      return matchSearch && matchOrigem
    })
  }, [filtered, search, filterOrigem])

  const totalPages = Math.ceil(tableRows.length / PAGE_SIZE)
  const pagedRows = tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (!contactsTable) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
        Tabela de contatos não configurada para esta empresa.
      </div>
    )
  }

  return (
    <div className="page-enter" style={{ padding: '1.5rem', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Métricas</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {lastRefresh ? `Atualizado às ${lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Carregando...'}
          </div>
        </div>
        <button className="nx-btn-ghost" style={{ fontSize: 12 }} onClick={load} disabled={loading}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Filtros de período */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${period === p.key ? 'var(--primary)' : 'var(--border)'}`,
              background: period === p.key ? 'var(--primary)' : 'var(--bg-surface)',
              color: period === p.key ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >{p.label}</button>
        ))}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 24 }}>
        <KpiCard
          icon={<Users size={18} color="#2563EB" />}
          bg="#EFF6FF"
          value={totalLeads}
          label="Total de leads"
          sub={periodLabel(period)}
          loading={loading}
        />
        <KpiCard
          icon={<MessageSquare size={18} color="#16A34A" />}
          bg="#F0FDF4"
          value={comContato}
          label="Leads contactados"
          sub={`${totalLeads ? Math.round(comContato / totalLeads * 100) : 0}% do total`}
          loading={loading}
        />
        <KpiCard
          icon={<Inbox size={18} color="#F59E0B" />}
          bg="#FFFBEB"
          value={semResposta}
          label="Sem resposta"
          sub="Aguardando retorno"
          loading={loading}
          alert={semResposta > 0}
        />
        <KpiCard
          icon={<TrendingUp size={18} color="#7C3AED" />}
          bg="#F5F3FF"
          value={comUltimaMsg}
          label="Com última mensagem"
          sub="Registraram interação"
          loading={loading}
        />
      </div>

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Fontes de lead */}
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <BarChart2 size={15} color="var(--primary)" />
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Fontes de lead</div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel(period)}</span>
          </div>
          {origensMap.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Sem dados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {origensMap.map(([origem, count], i) => (
                <div key={origem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{origem}</span>
                    <span style={{ fontWeight: 700, color: ORIGEM_COLORS[i % ORIGEM_COLORS.length] }}>{count}</span>
                  </div>
                  <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 10,
                      width: `${(count / maxOrigem) * 100}%`,
                      background: ORIGEM_COLORS[i % ORIGEM_COLORS.length],
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Classificação de lead */}
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={15} color="var(--primary)" />
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Classificação de lead</div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel(period)}</span>
          </div>
          {classifMap.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Sem dados</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {classifMap.map(([classif, count]) => {
                const cs = CLASSIF_COLORS[classif] || { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' }
                return (
                  <div key={classif}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                      <span style={{
                        fontWeight: 600, color: cs.color, background: cs.bg,
                        border: `1px solid ${cs.border}`, borderRadius: 20,
                        padding: '1px 10px', fontSize: 11,
                      }}>{classif}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{count}</span>
                    </div>
                    <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 10,
                        width: `${(count / maxClassif) * 100}%`,
                        background: cs.color,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Timeline de leads - novos por dia */}
        <div className="nx-card" style={{ padding: '1.25rem', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Clock size={15} color="var(--primary)" />
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Novos leads por dia</div>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel(period)}</span>
          </div>
          <TimelineChart leads={filtered} />
        </div>
      </div>

      {/* Tabela de contatos */}
      <div className="nx-card" style={{ marginTop: 16, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Users size={15} color="var(--primary)" />
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Contatos</div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#F1F5F9', borderRadius: 20, padding: '2px 8px' }}>{tableRows.length}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Busca */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                className="nx-input"
                style={{ paddingLeft: 30, width: 200, fontSize: 12 }}
                placeholder="Telefone ou nome"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            {/* Filtro origem */}
            <div style={{ position: 'relative' }}>
              <select
                className="nx-select"
                style={{ fontSize: 12, paddingRight: 28, appearance: 'none' }}
                value={filterOrigem}
                onChange={e => { setFilterOrigem(e.target.value); setPage(1) }}
              >
                <option value="todas">Todas as origens</option>
                {origensMap.map(([o]) => <option key={o} value={o}>{o}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Contato', 'Origem', 'Classificação', 'Primeira Mensagem', 'Última Mensagem', 'Criado em'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhum contato encontrado.
                  </td>
                </tr>
              ) : pagedRows.map(l => {
                const cs = CLASSIF_COLORS[l.classificacao_lead] || { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' }
                const phone = (l.numero || '').replace(/@.*$/, '').replace(/\D/g, '')
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.nome || '—'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{phone || l.numero}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)', fontSize: 12 }}>{l.origem || '—'}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {l.classificacao_lead ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: cs.color, background: cs.bg, border: `1px solid ${cs.border}`, borderRadius: 20, padding: '2px 10px' }}>
                          {l.classificacao_lead}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.primeiro_contato === 'sim' ? '✓ Realizado' : '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.ultima_mensagem || '—'}
                      </div>
                      {l.data_ultimaMensagem && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.data_ultimaMensagem}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(l.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, tableRows.length)} de {tableRows.length}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="nx-btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Anterior</button>
              <button className="nx-btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próximo ›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ icon, bg, value, label, sub, loading, alert }) {
  return (
    <div className="nx-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        {alert && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 8px' }}>
            Atenção
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
          {loading ? '—' : value}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

function TimelineChart({ leads }) {
  const days = useMemo(() => {
    const map = {}
    leads.forEach(l => {
      const d = new Date(l.created_at)
      const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      map[key] = (map[key] || 0) + 1
    })
    // Ordena por data real
    const sorted = Object.entries(map).sort((a, b) => {
      const parse = s => { const [d, m] = s.split('/'); return new Date(2026, +m - 1, +d) }
      return parse(a[0]) - parse(b[0])
    })
    return sorted
  }, [leads])

  if (days.length === 0) return (
    <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Sem dados para o período</div>
  )

  const max = Math.max(...days.map(d => d[1]))

  const BAR_H = 80

  return (
    <div>
      {/* Contadores */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {days.map(([date, count]) => (
          <div key={date} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--primary)', minWidth: 0 }}>
            {count}
          </div>
        ))}
      </div>
      {/* Barras */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: BAR_H }}>
        {days.map(([date, count]) => (
          <div key={date} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', minWidth: 0 }}>
            <div style={{
              width: '100%', minWidth: 8,
              height: `${Math.max((count / max) * 100, 5)}%`,
              background: 'var(--primary)', borderRadius: '4px 4px 0 0',
              opacity: 0.85, transition: 'height 0.4s ease',
            }} />
          </div>
        ))}
      </div>
      {/* Datas */}
      <div style={{ display: 'flex', gap: 6, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
        {days.map(([date, count]) => (
          <div key={date} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {date}
          </div>
        ))}
      </div>
    </div>
  )
}
