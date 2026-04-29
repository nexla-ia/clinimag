import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import LimitReachedModal from '../../components/LimitReachedModal'
import { getEffectiveLimits, upgradeMessage } from '../../lib/planLimits'
import {
  Users, MessageSquare, TrendingUp, Clock, Inbox, BarChart2, RefreshCw,
  Calendar, BellRing, Kanban, Headset, CheckCircle2, XCircle, AlertCircle,
  Phone, Bot, ListChecks, Flag, ChevronRight, Layers, DollarSign, Stethoscope, Lock,
} from 'lucide-react'
import './Company.css'

// ─── Inferência de origem do lead ─────────────────────────────────────────
// Roda nas primeiras mensagens do cliente. Ordem importa: Indicação ANTES de
// Instagram/Google porque "minha amiga viu no Insta" deve cair em Indicação.
const ORIGEM_PATTERNS = [
  { origem: 'Indicação', re: /\b(indica[cç][aã]o|indic(ou|aram|ada?|ado)|me indica\w*|me passaram|me passou|amig[ao]\s+(me\s+)?(indic|fal|disse|recomend)|conhec\w+\s+(me\s+)?(indic|fal|recomend)|recomend\w+\s+(por|pelo|pela)|por indica)/i },
  { origem: 'Instagram', re: /\b(instagram|\binsta\b|stories?\b|\bstory\b|@[a-z0-9._-]{3,}|\big\b|vi\s+(no|seu|sua)\s+(insta|instagram|stories?|story|post)|publica[cç][aã]o de voc|reels?\b)/i },
  { origem: 'Google',    re: /\b(google|pesqui[sz]\w+|achei\s+no\s+google|fui\s+no\s+google|busca\s+(no|do)|\bgoogl|\bmaps\b)/i },
  { origem: 'Facebook',  re: /\b(facebook|\bfb\b)/i },
  { origem: 'TikTok',    re: /\btik\s*tok\b/i },
  { origem: 'YouTube',   re: /\b(youtube|canal d[oae]|v[ií]deo (do|de|deles)|seu canal)/i },
  { origem: 'Site',      re: /\b(site\s+(de\s+voc|da\s+cl[íi]nica|do\s+consult|de\s+v[oô]s)|seu\s+site|no\s+site\s+de)/i },
  { origem: 'Anúncio',   re: /\b(an[uú]nci\w*|propaganda|panfleto|outdoor|\btv\b\s+(da|do))/i },
  { origem: 'WhatsApp Business', re: /\b(perfil do whats|status do whats|cat[áa]logo do whats|whats\s+business)/i },
]

function inferOrigem(messages) {
  if (!messages || !messages.length) return null
  const text = messages.map(m => (m.mensagem || '').toLowerCase()).join(' \n ')
  for (const { origem, re } of ORIGEM_PATTERNS) {
    if (re.test(text)) return origem
  }
  return null
}

// ─── Períodos ────────────────────────────────────────────────────────────────
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
  if (period === 'hoje')   return { from: startOf(now), to: null }
  if (period === 'ontem')  { const y = new Date(now); y.setDate(y.getDate() - 1); return { from: startOf(y), to: new Date(startOf(now) - 1) } }
  if (period === 'semana') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: startOf(d), to: null } }
  if (period === 'mes')    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null }
  return { from: null, to: null }
}

function periodLabel(period) {
  return ({ hoje: 'hoje', ontem: 'ontem', semana: 'esta semana', mes: 'este mês', todos: 'no total' })[period] || ''
}

function inPeriod(ts, from, to) {
  if (!ts) return false
  const d = new Date(ts)
  if (isNaN(d.getTime())) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return `${h}h ${m}min`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

const CLASSIF_COLORS = {
  'Curioso':    { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' },
  'Interessado':{ color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  'Quente':     { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  'Cliente':    { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  'Inativo':    { color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
}
const ORIGEM_COLORS = ['#2563EB','#16A34A','#F59E0B','#7C3AED','#DC2626','#0891B2','#D97706','#059669']

const REASON_META = {
  agendado:       { label: 'Agendado',    color: '#16A34A' },
  resolvido:      { label: 'Resolvido',   color: '#2563EB' },
  encaminhado:    { label: 'Encaminhado', color: '#7C3AED' },
  desistiu:       { label: 'Desistiu',    color: '#DC2626' },
  auto_encerrado: { label: 'Expirado',    color: '#6B7280' },
}

const APPT_STATUS = {
  agendado:   { label: 'Agendado',   color: '#2563EB' },
  confirmado: { label: 'Confirmado', color: '#16A34A' },
  concluido:  { label: 'Concluído',  color: '#0891B2' },
  faltou:     { label: 'Faltou',     color: '#D97706' },
  cancelado:  { label: 'Cancelado',  color: '#DC2626' },
}

const PRIORITY_META = {
  baixa:   { label: 'Baixa',   color: '#6B7280' },
  normal:  { label: 'Normal',  color: '#2563EB' },
  alta:    { label: 'Alta',    color: '#D97706' },
  urgente: { label: 'Urgente', color: '#DC2626' },
}

const TABS = [
  { key: 'overview',    label: 'Visão Geral',  icon: BarChart2 },
  { key: 'atendimento', label: 'Atendimento',  icon: MessageSquare },
  { key: 'equipe',      label: 'Equipe',       icon: Users },
  { key: 'agenda',      label: 'Agenda',       icon: Calendar },
  { key: 'financeiro',  label: 'Financeiro',   icon: DollarSign },
  { key: 'leads',       label: 'Leads',        icon: TrendingUp },
  { key: 'atividades',  label: 'Atividades',   icon: Kanban },
]

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function CompanyMetrics() {
  const { session } = useAuth()
  const instance      = session?.company?.instance
  const companyId     = session?.company?.id
  const contactsTable = session?.company?.contacts_table
  const aiEnabled     = session?.company?.ai_enabled !== false
  const limits        = getEffectiveLimits(session?.company)
  const advancedAllowed = limits.advanced_metrics
  const ADVANCED_TABS  = ['equipe', 'financeiro', 'leads']

  const [period, setPeriod]   = useState('semana')
  const [tab, setTab]         = useState('overview')
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [limitModal, setLimitModal] = useState(null)

  const [msgs, setMsgs]                 = useState([])
  const [convs, setConvs]               = useState([])
  const [atts, setAtts]                 = useState([])
  const [appts, setAppts]               = useState([])
  const [alerts, setAlerts]             = useState([])
  const [kanbanCards, setKanbanCards]   = useState([])
  const [kanbanColumns, setKanbanColumns] = useState([])
  const [users, setUsers]               = useState([])
  const [sectors, setSectors]           = useState([])
  const [sectorMembers, setSectorMembers] = useState([])
  const [leads, setLeads]               = useState([])
  const [professionals, setProfessionals] = useState([])
  const [procedures, setProcedures]     = useState([])
  const [insurancePlans, setInsurancePlans] = useState([])

  async function load() {
    if (!instance) return
    setLoading(true)
    const queries = [
      supabase.from('mensagens_geral').select('id, numero, type, mensagem, "horaLastMessage", created_at').eq('instancia', instance).order('id', { ascending: false }).limit(20000),
      supabase.from('conversations').select('*').eq('instancia', instance),
      supabase.from('attendances').select('*').eq('instancia', instance),
      supabase.from('appointments').select('*, agendas(name, color)').eq('instancia', instance),
      supabase.from('alerts').select('*').eq('instancia', instance),
      supabase.from('kanban_cards').select('*').eq('instancia', instance),
      supabase.from('kanban_columns').select('*').eq('instancia', instance).order('position'),
      supabase.from('users').select('id, name, email, role, active').eq('company_id', companyId),
      supabase.from('sectors').select('*').eq('instancia', instance),
      supabase.from('sector_members').select('*'),
      supabase.from('professionals').select('*').eq('instancia', instance),
      supabase.from('procedures').select('*').eq('instancia', instance),
      supabase.from('insurance_plans').select('*').eq('instancia', instance),
    ]
    if (contactsTable) queries.push(supabase.from(contactsTable).select('*').eq('instancia', instance))

    const results = await Promise.all(queries)
    setMsgs(results[0].data || [])
    setConvs(results[1].data || [])
    setAtts(results[2].data || [])
    setAppts(results[3].data || [])
    setAlerts(results[4].data || [])
    setKanbanCards(results[5].data || [])
    setKanbanColumns(results[6].data || [])
    setUsers((results[7].data || []).filter(u => u.active !== false))
    setSectors(results[8].data || [])
    setSectorMembers(results[9].data || [])
    setProfessionals(results[10].data || [])
    setProcedures(results[11].data || [])
    setInsurancePlans(results[12].data || [])
    const leadsData = contactsTable ? (results[13].data || []) : []
    setLeads(leadsData)
    setLastRefresh(new Date())
    setLoading(false)

    // Inferência automática de origem para leads sem origem definida.
    // Lê primeiras mensagens cliente, detecta canal por palavra-chave, atualiza banco silenciosamente.
    if (contactsTable && leadsData.length) {
      const msgsAll = results[0].data || []
      const semOrigem = leadsData.filter(l => !l.origem || l.origem === '' || /desconhecid/i.test(l.origem))
      if (semOrigem.length) {
        const updates = []
        for (const lead of semOrigem) {
          const leadMsgs = msgsAll
            .filter(m => m.numero === lead.numero && (m.type || '').toLowerCase() === 'cliente')
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .slice(0, 5)
          const inferred = inferOrigem(leadMsgs)
          if (inferred) updates.push({ id: lead.id, origem: inferred })
        }
        if (updates.length) {
          await Promise.all(updates.map(u =>
            supabase.from(contactsTable).update({ origem: u.origem }).eq('id', u.id)
          ))
          setLeads(prev => prev.map(l => {
            const u = updates.find(x => x.id === l.id)
            return u ? { ...l, origem: u.origem } : l
          }))
        }
      }
    }
  }

  useEffect(() => { load() }, [instance, companyId, contactsTable])

  // Range do período ativo
  const range = useMemo(() => getPeriodRange(period), [period])

  return (
    <div className="page-enter" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            style={{
              padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${period === p.key ? '#2563EB' : 'var(--border)'}`,
              background: period === p.key ? '#2563EB' : '#fff',
              color: period === p.key ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: period === p.key ? '0 1px 4px rgba(37,99,235,0.3)' : 'none',
            }}>{p.label}</button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.filter(t => aiEnabled || t.key !== 'leads' || contactsTable).map(t => {
          const locked = !advancedAllowed && ADVANCED_TABS.includes(t.key)
          return (
            <button key={t.key} onClick={() => {
              if (locked) {
                setLimitModal(upgradeMessage('advanced_metrics', null, limits.plan))
                return
              }
              setTab(t.key)
            }}
              title={locked ? `Disponível a partir do plano Pro` : ''}
              style={{
                padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid #2563EB' : '2px solid transparent',
                color: tab === t.key ? '#2563EB' : (locked ? '#94A3B8' : 'var(--text-secondary)'),
                fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: -1,
                opacity: locked ? 0.6 : 1,
              }}>
              {locked ? <Lock size={12} /> : <t.icon size={14} />} {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'overview'    && <OverviewTab    {...{ msgs, convs, atts, appts, alerts, kanbanCards, range, period, loading }} />}
      {tab === 'atendimento' && <AtendimentoTab {...{ msgs, convs, atts, range, period, loading }} />}
      {tab === 'equipe'      && <EquipeTab      {...{ msgs, convs, atts, users, sectors, sectorMembers, range, period, loading }} />}
      {tab === 'agenda'      && <AgendaTab      {...{ appts, range, period, loading }} />}
      {tab === 'financeiro'  && <FinanceiroTab  {...{ appts, professionals, procedures, insurancePlans, range, period, loading }} />}
      {tab === 'leads'       && <LeadsTab       {...{ leads, range, period, loading, contactsTable }} />}
      {tab === 'atividades'  && <AtividadesTab  {...{ kanbanCards, kanbanColumns, users, range, period, loading }} />}

      <LimitReachedModal
        open={!!limitModal}
        title={limitModal?.title}
        body={limitModal?.body}
        cta={limitModal?.cta}
        planName={limits.plan}
        onClose={() => setLimitModal(null)}
      />
    </div>
  )
}

// ─── Tab: Visão Geral ───────────────────────────────────────────────────────
function OverviewTab({ msgs, convs, atts, appts, alerts, kanbanCards, range, period, loading }) {
  const { from, to } = range
  const m = msgs.filter(x => inPeriod(x.created_at, from, to))
  const c = convs.filter(x => inPeriod(x.closed_at, from, to))

  // Tickets novos: primeiro registro de cada numero dentro do período
  const firstByNumero = useMemo(() => {
    const seen = {}
    const sorted = [...msgs].sort((a, b) => a.id - b.id)
    sorted.forEach(x => { if (!seen[x.numero]) seen[x.numero] = x.created_at })
    return seen
  }, [msgs])
  const ticketsNovos = Object.values(firstByNumero).filter(ts => inPeriod(ts, from, to)).length

  // Tickets ativos: tem mensagem mas não fechado e não atribuído
  const closedSet = new Set(convs.map(c => c.session_id))
  const attSet = new Set(atts.map(a => a.numero))
  const allNumbers = new Set(msgs.map(x => x.numero).filter(Boolean))
  const ticketsAtivos = [...allNumbers].filter(n => !closedSet.has(n) && !attSet.has(n)).length

  // Hoje agendamentos
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
  const apptsHoje = appts.filter(a => {
    const d = new Date(a.starts_at)
    return d >= todayStart && d < todayEnd && a.status !== 'cancelado'
  }).length

  const alertasPend = alerts.filter(a => !a.resolved).length
  const cardsAtrasados = kanbanCards.filter(c => c.due_date && new Date(`${c.due_date}T23:59:59`) < new Date()).length

  // Volume mensagens por dia
  const dayVolume = useMemo(() => {
    const map = {}
    m.forEach(x => {
      if (!x.created_at) return
      const d = new Date(x.created_at)
      const k = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => {
      const parse = s => { const [d, mo] = s.split('/'); return new Date(2026, +mo - 1, +d) }
      return parse(a[0]) - parse(b[0])
    })
  }, [m])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Inbox size={18} color="#2563EB" />} bg="#EFF6FF" value={ticketsNovos} label="Tickets novos" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<MessageSquare size={18} color="#7C3AED" />} bg="#F5F3FF" value={ticketsAtivos} label="Tickets ativos" sub="aguardando atendimento" loading={loading} />
        <KpiCard icon={<CheckCircle2 size={18} color="#16A34A" />} bg="#F0FDF4" value={c.length} label="Tickets finalizados" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<Calendar size={18} color="#0891B2" />} bg="#ECFEFF" value={apptsHoje} label="Agendamentos hoje" sub="exceto cancelados" loading={loading} />
        <KpiCard icon={<BellRing size={18} color="#D97706" />} bg="#FFFBEB" value={alertasPend} label="Alertas pendentes" sub="aguardando resolução" loading={loading} alert={alertasPend > 0} />
        <KpiCard icon={<AlertCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={cardsAtrasados} label="Atividades atrasadas" sub="data vencida" loading={loading} alert={cardsAtrasados > 0} />
      </div>

      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Clock size={15} color="#2563EB" />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Mensagens por dia</div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel(period)}</span>
        </div>
        <BarTimeline data={dayVolume} />
      </div>
    </div>
  )
}

// ─── Tab: Atendimento ───────────────────────────────────────────────────────
function AtendimentoTab({ msgs, convs, atts, range, period, loading }) {
  const { from, to } = range
  const closedInPeriod = convs.filter(c => inPeriod(c.closed_at, from, to))

  // Motivos de encerramento
  const reasonsMap = useMemo(() => {
    const map = {}
    closedInPeriod.forEach(c => { map[c.reason || 'outro'] = (map[c.reason || 'outro'] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [closedInPeriod])

  // Tempo médio de ticket: closed_at - primeira msg do session_id
  const ticketDurations = useMemo(() => {
    const firstMsg = {}
    msgs.forEach(x => {
      if (!firstMsg[x.numero] || new Date(x.created_at) < new Date(firstMsg[x.numero])) {
        firstMsg[x.numero] = x.created_at
      }
    })
    return closedInPeriod.map(c => {
      const start = firstMsg[c.session_id]
      if (!start || !c.closed_at) return null
      return new Date(c.closed_at).getTime() - new Date(start).getTime()
    }).filter(d => d != null && d > 0)
  }, [closedInPeriod, msgs])
  const avgTicket = ticketDurations.length ? ticketDurations.reduce((a, b) => a + b, 0) / ticketDurations.length : 0

  // Tempo médio até primeiro atendimento humano: assumed_at - primeira msg cliente
  const attTimes = useMemo(() => {
    const firstCli = {}
    msgs.forEach(x => {
      if ((x.type || '').toLowerCase() === 'cliente') {
        if (!firstCli[x.numero] || new Date(x.created_at) < new Date(firstCli[x.numero])) {
          firstCli[x.numero] = x.created_at
        }
      }
    })
    return atts.map(a => {
      const start = firstCli[a.numero]
      if (!start || !a.assumed_at) return null
      if (!inPeriod(a.assumed_at, from, to)) return null
      return new Date(a.assumed_at).getTime() - new Date(start).getTime()
    }).filter(d => d != null && d > 0)
  }, [atts, msgs, from, to])
  const avgAtendimento = attTimes.length ? attTimes.reduce((a, b) => a + b, 0) / attTimes.length : 0

  // Tipos de mensagem
  const typeCounts = useMemo(() => {
    const map = { cliente: 0, atendente: 0, ia: 0, outro: 0 }
    msgs.filter(x => inPeriod(x.created_at, from, to)).forEach(x => {
      const t = (x.type || 'outro').toLowerCase()
      if (map[t] != null) map[t]++; else map.outro++
    })
    return map
  }, [msgs, from, to])

  // Mensagens por hora (heatmap simples)
  const hourCounts = useMemo(() => {
    const arr = Array(24).fill(0)
    msgs.filter(x => inPeriod(x.created_at, from, to)).forEach(x => {
      const d = new Date(x.created_at); if (isNaN(d.getTime())) return
      arr[d.getHours()]++
    })
    return arr
  }, [msgs, from, to])

  // % tickets que viraram atendimento humano
  const numTicketsClosed = closedInPeriod.length
  const closedHadAtt = closedInPeriod.filter(c => atts.some(a => a.numero === c.session_id)).length
  const taxaHumano = numTicketsClosed ? Math.round((closedHadAtt / numTicketsClosed) * 100) : 0

  // Auto-encerrados
  const autoEncerrados = closedInPeriod.filter(c => c.reason === 'auto_encerrado').length

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Clock size={18} color="#2563EB" />} bg="#EFF6FF" value={formatDuration(avgAtendimento)} label="Tempo até atendimento" sub="cliente → assumir" loading={loading} />
        <KpiCard icon={<Headset size={18} color="#7C3AED" />} bg="#F5F3FF" value={formatDuration(avgTicket)} label="Duração média do ticket" sub="abertura → fechamento" loading={loading} />
        <KpiCard icon={<TrendingUp size={18} color="#16A34A" />} bg="#F0FDF4" value={`${taxaHumano}%`} label="Atendimento humano" sub="tickets que assumiram" loading={loading} />
        <KpiCard icon={<XCircle size={18} color="#6B7280" />} bg="#F3F4F6" value={autoEncerrados} label="Auto-encerrados" sub="expirados após 6h" loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={ListChecks} text="Motivos de encerramento" right={periodLabel(period)} />
          {reasonsMap.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <DonutChart data={reasonsMap.map(([k, v]) => ({ value: v, color: REASON_META[k]?.color || '#94A3B8', label: REASON_META[k]?.label || k }))} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {reasonsMap.map(([k, v]) => {
                  const meta = REASON_META[k] || { label: k, color: '#94A3B8' }
                  const total = reasonsMap.reduce((a, b) => a + b[1], 0)
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
                      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{meta.label}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{v}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>{Math.round(v / total * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={MessageSquare} text="Tipos de mensagem" right={periodLabel(period)} />
          {[['cliente', '#94A3B8'], ['atendente', '#16A34A'], ['ia', '#2563EB']].map(([k, color]) => {
            const v = typeCounts[k] || 0
            const total = Object.values(typeCounts).reduce((a, b) => a + b, 0) || 1
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, textTransform: 'capitalize', color: 'var(--text-primary)' }}>{k}</span>
                  <span style={{ fontWeight: 700, color }}>{v}</span>
                </div>
                <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(v / total) * 100}%`, background: color, transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="nx-card" style={{ padding: '1.25rem' }}>
        <SectionTitle icon={Clock} text="Mensagens por hora do dia" right={periodLabel(period)} />
        <HourChart data={hourCounts} />
      </div>
    </div>
  )
}

// ─── Tab: Equipe ────────────────────────────────────────────────────────────
function EquipeTab({ msgs, convs, atts, users, sectors, sectorMembers, range, period, loading }) {
  const { from, to } = range

  // Ranking atendentes
  const ranking = useMemo(() => {
    return users.map(u => {
      const myMsgs = msgs.filter(x => (x.type || '').toLowerCase() === 'atendente' && inPeriod(x.created_at, from, to))
      // Filtrar mensagens do próprio atendente (assumimos que mensagens com type=atendente foram enviadas por algum atendente,
      // e a atribuição vem das attendances; usamos email como liga)
      const myAtts = atts.filter(a => a.attendant_email === u.email)
      const myAttsInPeriod = myAtts.filter(a => inPeriod(a.assumed_at, from, to))
      const myClosedSet = new Set(myAtts.map(a => a.numero))
      const myConvs = convs.filter(c => myClosedSet.has(c.session_id) && inPeriod(c.closed_at, from, to))
      // Mensagens enviadas pelo atendente: assumimos pela proximidade temporal de suas attendances
      const myNumeros = new Set(myAtts.map(a => a.numero))
      const sentMsgs = myMsgs.filter(m => myNumeros.has(m.numero)).length
      return {
        id: u.id, name: u.name, email: u.email,
        tickets: myAttsInPeriod.length,
        finalizados: myConvs.length,
        mensagens: sentMsgs,
      }
    }).sort((a, b) => b.tickets - a.tickets)
  }, [users, atts, convs, msgs, from, to])

  // Por setor
  const bySector = useMemo(() => {
    const map = {}
    atts.filter(a => inPeriod(a.assumed_at, from, to)).forEach(a => {
      const k = a.sector_name || 'Sem setor'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [atts, from, to])

  const totalAttsInPeriod = bySector.reduce((a, b) => a + b[1], 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Users} text="Ranking de atendentes" right={periodLabel(period)} />
          {ranking.length === 0 ? <Empty /> : (
            <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr><th>Atendente</th><th style={{ textAlign: 'right' }}>Tickets</th><th style={{ textAlign: 'right' }}>Finalizados</th><th style={{ textAlign: 'right' }}>Msgs</th></tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.id}>
                    <td className="td-name">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: i === 0 ? '#FEF3C7' : '#EFF6FF', border: `1px solid ${i === 0 ? '#FDE68A' : '#BFDBFE'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#D97706' : '#2563EB' }}>
                          {i === 0 ? '🏆' : r.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#2563EB' }}>{r.tickets}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#16A34A' }}>{r.finalizados}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{r.mensagens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Layers} text="Atendimentos por setor" right={periodLabel(period)} />
          {bySector.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bySector.map(([name, count], i) => {
                const sector = sectors.find(s => s.name === name)
                const color = sector?.color || ORIGEM_COLORS[i % ORIGEM_COLORS.length]
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{name}</span>
                      <span style={{ fontWeight: 700, color }}>{count} ({Math.round(count / totalAttsInPeriod * 100)}%)</span>
                    </div>
                    <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / Math.max(...bySector.map(b => b[1]))) * 100}%`, background: color, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Agenda ────────────────────────────────────────────────────────────
function AgendaTab({ appts, range, period, loading }) {
  const { from, to } = range
  const inRange = appts.filter(a => inPeriod(a.starts_at, from, to))

  const counts = inRange.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc }, {})
  const total = inRange.length
  const noShow = counts.faltou || 0
  const cancelado = counts.cancelado || 0
  const taxaNoShow = total ? Math.round((noShow / total) * 100) : 0
  const taxaCancel = total ? Math.round((cancelado / total) * 100) : 0
  const taxaConfirm = total ? Math.round(((counts.confirmado || 0) + (counts.concluido || 0)) / total * 100) : 0

  const byAgenda = useMemo(() => {
    const map = {}
    inRange.forEach(a => {
      const name = a.agendas?.name || 'Sem nome'
      if (!map[name]) map[name] = { total: 0, color: a.agendas?.color || '#2563EB' }
      map[name].total++
    })
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total)
  }, [inRange])

  const byDayOfWeek = useMemo(() => {
    const arr = Array(7).fill(0)
    inRange.forEach(a => { const d = new Date(a.starts_at); if (!isNaN(d.getTime())) arr[d.getDay()]++ })
    return arr
  }, [inRange])
  const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Calendar size={18} color="#2563EB" />} bg="#EFF6FF" value={total} label="Total" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<CheckCircle2 size={18} color="#16A34A" />} bg="#F0FDF4" value={`${taxaConfirm}%`} label="Confirmação" sub="confirmado + concluído" loading={loading} />
        <KpiCard icon={<AlertCircle size={18} color="#D97706" />} bg="#FFFBEB" value={`${taxaNoShow}%`} label="No-show" sub="pacientes que faltaram" loading={loading} alert={taxaNoShow > 15} />
        <KpiCard icon={<XCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={`${taxaCancel}%`} label="Cancelamento" sub="taxa de cancelamento" loading={loading} alert={taxaCancel > 20} />
      </div>

      <div className="nx-card" style={{ padding: '1.25rem', marginBottom: 14 }}>
        <SectionTitle icon={Flag} text="Distribuição por status" right={periodLabel(period)} />
        {total === 0 ? <Empty /> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(APPT_STATUS).map(([k, meta]) => {
              const v = counts[k] || 0
              return (
                <div key={k} style={{ flex: '1 1 130px', padding: '10px 14px', background: meta.color + '11', border: `1px solid ${meta.color}33`, borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: meta.color, fontWeight: 700, textTransform: 'uppercase' }}>{meta.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: meta.color, marginTop: 2 }}>{v}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total ? Math.round(v / total * 100) : 0}% do total</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Calendar} text="Por agenda" right={periodLabel(period)} />
          {byAgenda.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byAgenda.map(([name, info]) => {
                const max = Math.max(...byAgenda.map(([, i]) => i.total))
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{name}</span>
                      <span style={{ fontWeight: 700, color: info.color }}>{info.total}</span>
                    </div>
                    <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(info.total / max) * 100}%`, background: info.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={BarChart2} text="Por dia da semana" right={periodLabel(period)} />
          {total === 0 ? <Empty /> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
              {byDayOfWeek.map((v, i) => {
                const max = Math.max(...byDayOfWeek)
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB' }}>{v || ''}</div>
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${max ? (v / max) * 100 : 0}%`, minHeight: v ? 4 : 0, background: '#2563EB', borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{dayLabels[i]}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Financeiro ────────────────────────────────────────────────────────
function FinanceiroTab({ appts, professionals, procedures, insurancePlans, range, period, loading }) {
  const { from, to } = range
  const inRange = appts.filter(a => inPeriod(a.starts_at, from, to))

  // KPIs
  const faturado = inRange.filter(a => a.payment_status === 'pago').reduce((s, a) => s + Number(a.price || 0), 0)
  const aReceber = inRange.filter(a => a.payment_status === 'pendente' && a.status !== 'cancelado' && a.status !== 'faltou').reduce((s, a) => s + Number(a.price || 0), 0)
  const perdidoFaltas = inRange.filter(a => a.status === 'faltou').reduce((s, a) => s + Number(a.price || 0), 0)
  const concluidos = inRange.filter(a => a.payment_status === 'pago').length
  const ticketMedio = concluidos ? faturado / concluidos : 0

  // Faturamento por profissional
  const byProfessional = useMemo(() => {
    const map = {}
    inRange.filter(a => a.payment_status === 'pago').forEach(a => {
      const id = a.professional_id || 'sem'
      const pro = professionals.find(p => p.id === id)
      const name = pro?.name || (id === 'sem' ? 'Sem profissional' : 'Removido')
      const color = pro?.color || '#6B7280'
      if (!map[id]) map[id] = { name, color, value: 0, count: 0 }
      map[id].value += Number(a.price || 0)
      map[id].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [inRange, professionals])

  // Faturamento por procedimento
  const byProcedure = useMemo(() => {
    const map = {}
    inRange.filter(a => a.payment_status === 'pago').forEach(a => {
      const id = a.procedure_id || 'sem'
      const proc = procedures.find(p => p.id === id)
      const name = proc?.name || (id === 'sem' ? 'Sem procedimento' : 'Removido')
      if (!map[id]) map[id] = { name, value: 0, count: 0 }
      map[id].value += Number(a.price || 0)
      map[id].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value).slice(0, 10)
  }, [inRange, procedures])

  // Faturamento por convênio (Particular = null)
  const byInsurance = useMemo(() => {
    const map = {}
    inRange.filter(a => a.payment_status === 'pago').forEach(a => {
      const id = a.insurance_plan_id || 'particular'
      const plan = insurancePlans.find(p => p.id === id)
      const name = plan?.name || 'Particular'
      if (!map[id]) map[id] = { name, value: 0, count: 0 }
      map[id].value += Number(a.price || 0)
      map[id].count++
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [inRange, insurancePlans])

  const totalIns = byInsurance.reduce((s, x) => s + x.value, 0) || 1
  const maxPro   = Math.max(1, ...byProfessional.map(x => x.value))
  const maxProc  = Math.max(1, ...byProcedure.map(x => x.value))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<DollarSign size={18} color="#16A34A" />} bg="#F0FDF4" value={fmtMoney(faturado)} label="Faturado" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<Clock size={18} color="#D97706" />} bg="#FFFBEB" value={fmtMoney(aReceber)} label="A receber" sub="agendamentos pendentes" loading={loading} alert={aReceber > 0} />
        <KpiCard icon={<TrendingUp size={18} color="#2563EB" />} bg="#EFF6FF" value={fmtMoney(ticketMedio)} label="Ticket médio" sub={`${concluidos} pagamentos`} loading={loading} />
        <KpiCard icon={<XCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={fmtMoney(perdidoFaltas)} label="Perdido em faltas" sub="pacientes que faltaram" loading={loading} alert={perdidoFaltas > 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Stethoscope} text="Faturamento por profissional" right={periodLabel(period)} />
          {byProfessional.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byProfessional.map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontWeight: 700, color: p.color }}>{fmtMoney(p.value)} <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>· {p.count}x</span></span>
                  </div>
                  <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(p.value / maxPro) * 100}%`, background: p.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={ListChecks} text="Top procedimentos" right={periodLabel(period)} />
          {byProcedure.length === 0 ? <Empty /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byProcedure.map((p, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{p.name}</span>
                    <span style={{ fontWeight: 700, color: '#16A34A', flexShrink: 0 }}>{fmtMoney(p.value)} <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>· {p.count}x</span></span>
                  </div>
                  <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(p.value / maxProc) * 100}%`, background: '#16A34A' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="nx-card" style={{ padding: '1.25rem' }}>
        <SectionTitle icon={Layers} text="Faturamento por forma de pagamento" right={periodLabel(period)} />
        {byInsurance.length === 0 ? <Empty /> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <DonutChart data={byInsurance.map((p, i) => ({
              value: p.value,
              color: p.name === 'Particular' ? '#16A34A' : ORIGEM_COLORS[(i + 1) % ORIGEM_COLORS.length],
              label: p.name,
            }))} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {byInsurance.map((p, i) => {
                const color = p.name === 'Particular' ? '#16A34A' : ORIGEM_COLORS[(i + 1) % ORIGEM_COLORS.length]
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{p.name}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMoney(p.value)}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>{Math.round(p.value / totalIns * 100)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Leads ─────────────────────────────────────────────────────────────
function LeadsTab({ leads, range, period, loading, contactsTable }) {
  const { from, to } = range
  if (!contactsTable) {
    return <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Tabela de contatos não configurada.</div>
  }
  const filtered = leads.filter(l => inPeriod(l.created_at, from, to) || (!from && !to))

  const totalLeads   = filtered.length
  const comContato   = filtered.filter(l => l.primeiro_contato === 'sim').length
  const semResposta  = filtered.filter(l => l.primeiro_contato === 'sim' && !l.ultima_mensagem).length
  const comUltimaMsg = filtered.filter(l => !!l.ultima_mensagem).length

  const origensMap = useMemo(() => {
    const map = {}
    filtered.forEach(l => { const k = l.origem || 'WhatsApp · origem não informada'; map[k] = (map[k] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const classifMap = useMemo(() => {
    const map = {}
    filtered.forEach(l => { const k = l.classificacao_lead || 'Sem classificação'; map[k] = (map[k] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const maxOrigem = origensMap[0]?.[1] || 1
  const maxClassif = classifMap[0]?.[1] || 1

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Users size={18} color="#2563EB" />} bg="#EFF6FF" value={totalLeads} label="Total de leads" sub={periodLabel(period)} loading={loading} />
        <KpiCard icon={<MessageSquare size={18} color="#16A34A" />} bg="#F0FDF4" value={comContato} label="Leads contactados" sub={`${totalLeads ? Math.round(comContato / totalLeads * 100) : 0}% do total`} loading={loading} />
        <KpiCard icon={<Inbox size={18} color="#F59E0B" />} bg="#FFFBEB" value={semResposta} label="Sem resposta" sub="aguardando retorno" loading={loading} alert={semResposta > 0} />
        <KpiCard icon={<TrendingUp size={18} color="#7C3AED" />} bg="#F5F3FF" value={comUltimaMsg} label="Com última mensagem" sub="registraram interação" loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={BarChart2} text="Fontes de lead" right={periodLabel(period)} />
          {origensMap.length === 0 ? <Empty /> : origensMap.map(([k, v], i) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{k}</span>
                <span style={{ fontWeight: 700, color: ORIGEM_COLORS[i % ORIGEM_COLORS.length] }}>{v}</span>
              </div>
              <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(v / maxOrigem) * 100}%`, background: ORIGEM_COLORS[i % ORIGEM_COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={TrendingUp} text="Classificação de lead" right={periodLabel(period)} />
          {classifMap.length === 0 ? <Empty /> : classifMap.map(([k, v]) => {
            const cs = CLASSIF_COLORS[k] || { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' }
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: cs.color, background: cs.bg, border: `1px solid ${cs.border}`, borderRadius: 20, padding: '1px 10px', fontSize: 11 }}>{k}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
                <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(v / maxClassif) * 100}%`, background: cs.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Atividades ────────────────────────────────────────────────────────
function AtividadesTab({ kanbanCards, kanbanColumns, users, range, period, loading }) {
  const { from, to } = range
  const cards = kanbanCards
  const inPeriodCards = cards.filter(c => inPeriod(c.created_at, from, to) || (!from && !to))
  const total = inPeriodCards.length
  const atrasados = cards.filter(c => c.due_date && new Date(`${c.due_date}T23:59:59`) < new Date()).length
  const semAtribuir = cards.filter(c => !c.assigned_user_id).length
  const urgentes = cards.filter(c => c.priority === 'urgente').length

  const byColumn = useMemo(() => {
    return kanbanColumns.map(col => ({
      name: col.name,
      color: col.color,
      count: cards.filter(c => c.column_id === col.id).length,
    })).sort((a, b) => b.count - a.count)
  }, [kanbanColumns, cards])

  const byUser = useMemo(() => {
    const map = {}
    cards.forEach(c => {
      const k = c.assigned_user_name || 'Sem atribuição'
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [cards])

  const byPriority = useMemo(() => {
    const map = {}
    cards.forEach(c => { map[c.priority || 'normal'] = (map[c.priority || 'normal'] || 0) + 1 })
    return ['urgente', 'alta', 'normal', 'baixa'].map(p => [p, map[p] || 0])
  }, [cards])

  const maxCol = Math.max(1, ...byColumn.map(c => c.count))
  const maxUser = Math.max(1, ...byUser.map(([, v]) => v))

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
        <KpiCard icon={<Kanban size={18} color="#2563EB" />} bg="#EFF6FF" value={cards.length} label="Total de cards" sub="todos os cards" loading={loading} />
        <KpiCard icon={<AlertCircle size={18} color="#DC2626" />} bg="#FEF2F2" value={atrasados} label="Atrasados" sub="data vencida" loading={loading} alert={atrasados > 0} />
        <KpiCard icon={<Flag size={18} color="#D97706" />} bg="#FFFBEB" value={urgentes} label="Urgentes" sub="prioridade urgente" loading={loading} alert={urgentes > 0} />
        <KpiCard icon={<Users size={18} color="#6B7280" />} bg="#F3F4F6" value={semAtribuir} label="Sem atribuição" sub="aguardando designação" loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Layers} text="Por coluna" right="todas" />
          {byColumn.length === 0 ? <Empty /> : byColumn.map(col => (
            <div key={col.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{col.name}</span>
                <span style={{ fontWeight: 700, color: col.color }}>{col.count}</span>
              </div>
              <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(col.count / maxCol) * 100}%`, background: col.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="nx-card" style={{ padding: '1.25rem' }}>
          <SectionTitle icon={Users} text="Por atendente" right="todos" />
          {byUser.length === 0 ? <Empty /> : byUser.map(([name, count], i) => (
            <div key={name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{name}</span>
                <span style={{ fontWeight: 700, color: ORIGEM_COLORS[i % ORIGEM_COLORS.length] }}>{count}</span>
              </div>
              <div style={{ height: 7, background: '#F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(count / maxUser) * 100}%`, background: ORIGEM_COLORS[i % ORIGEM_COLORS.length] }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="nx-card" style={{ padding: '1.25rem', marginTop: 14 }}>
        <SectionTitle icon={Flag} text="Por prioridade" right="todos" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {byPriority.map(([k, v]) => {
            const meta = PRIORITY_META[k]
            return (
              <div key={k} style={{ padding: '10px 12px', background: meta.color + '11', border: `1px solid ${meta.color}33`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: meta.color, fontWeight: 700, textTransform: 'uppercase' }}>{meta.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: meta.color, marginTop: 2 }}>{v}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Componentes auxiliares ─────────────────────────────────────────────────
function KpiCard({ icon, bg, value, label, sub, loading, alert }) {
  return (
    <div className="nx-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        {alert && <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 8px' }}>Atenção</span>}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{loading ? '—' : value}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, text, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <Icon size={15} color="#2563EB" />
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{text}</div>
      {right && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{right}</span>}
    </div>
  )
}

function Empty() {
  return <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Sem dados</div>
}

function BarTimeline({ data }) {
  if (data.length === 0) return <Empty />
  const max = Math.max(...data.map(d => d[1]))
  const BAR_H = 90
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {data.map(([k, v]) => (
          <div key={k} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#2563EB', minWidth: 0 }}>{v}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: BAR_H }}>
        {data.map(([k, v]) => (
          <div key={k} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', minWidth: 0 }}>
            <div style={{ width: '100%', height: `${Math.max((v / max) * 100, 5)}%`, background: '#2563EB', borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
        {data.map(([k]) => (
          <div key={k} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</div>
        ))}
      </div>
    </div>
  )
}

function HourChart({ data }) {
  const max = Math.max(...data, 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div title={`${i}h: ${v} mensagens`} style={{
              width: '100%',
              height: `${Math.max((v / max) * 100, v ? 4 : 0)}%`,
              background: v > max * 0.7 ? '#DC2626' : v > max * 0.4 ? '#D97706' : '#2563EB',
              borderRadius: '3px 3px 0 0', opacity: v ? 0.85 : 0.2,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
        {data.map((_, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>{i % 3 === 0 ? `${i}h` : ''}</div>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ data }) {
  const total = data.reduce((a, b) => a + b.value, 0)
  if (total === 0) return null
  const SIZE = 120
  const RADIUS = 50
  const CIRC = 2 * Math.PI * RADIUS
  let acc = 0
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ flexShrink: 0 }}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="#F1F5F9" strokeWidth={14} />
      {data.map((d, i) => {
        const portion = d.value / total
        const dash = portion * CIRC
        const offset = -acc * CIRC
        acc += portion
        return (
          <circle key={i}
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none" stroke={d.color} strokeWidth={14}
            strokeDasharray={`${dash} ${CIRC - dash}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dasharray 0.4s' }}
          />
        )
      })}
      <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: '#0F172A' }}>{total}</text>
      <text x={SIZE / 2} y={SIZE / 2 + 12} textAnchor="middle" style={{ fontSize: 10, fill: '#64748B' }}>total</text>
    </svg>
  )
}
