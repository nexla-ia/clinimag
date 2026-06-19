import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  Plus, Edit2, Trash2, Check, X, Search, Loader2, Lock, Calendar,
  AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtBRL(val) {
  const n = parseFloat(val) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtDateBR(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function monthLabel(str) {
  const [y, m] = str.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m, 10) - 1]}/${y}`
}

function addMonths(str, n) {
  const [y, m] = str.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonthsToDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1 + n, d)
  const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`
}

function isOverdue(vencimento, status) {
  return status === 'pendente' && vencimento < todayStr()
}

function daysDiff(dateStr) {
  return Math.floor((new Date(todayStr() + 'T00:00:00') - new Date(dateStr + 'T00:00:00')) / 86400000)
}

const FORMAS_PAGAMENTO = [
  'PIX', 'Dinheiro', 'Cartão Débito', 'Cartão Crédito',
  'Boleto', 'Convênio', 'Transferência', 'Cheque',
]

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--text-muted)', marginBottom: 4,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}

const STATUS_BADGE = {
  pendente:  { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Pendente' },
  pago:      { bg: '#F0FDF4', color: '#14532D', border: '#BBF7D0', label: 'Pago' },
  cancelado: { bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1', label: 'Cancelado' },
}

const TABS = [
  { key: 'receber',      label: 'A Receber' },
  { key: 'pagar',        label: 'A Pagar' },
  { key: 'fluxo',        label: 'Fluxo de Caixa' },
  { key: 'dre',          label: 'DRE' },
  { key: 'inadimplencia',label: 'Inadimplência' },
  { key: 'categorias',   label: 'Por Categoria' },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color, bg, loading, sub }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 14,
      padding: '1.1rem 1.3rem', display: 'flex', alignItems: 'center', gap: 14,
      flex: 1, minWidth: 160, boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
    }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
        {loading
          ? <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-muted)' }}>—</div>
          : <>
              <div style={{ fontSize: 18, fontWeight: 800, color }}>{fmtBRL(value)}</div>
              {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
            </>
        }
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pendente
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{ width: 38, height: 20, borderRadius: 20, border: 'none', cursor: 'pointer', background: value ? '#2563EB' : '#CBD5E1', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
    </button>
  )
}

function NavBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
      {children}
    </button>
  )
}

// ─── Transaction row (shared between receber/pagar/inadimplência) ─────────────

function TxRow({ tx, catMap, onPaid, onEdit, onDelete, showDays }) {
  const cat = catMap[tx.categoria_id]
  const overdue = isOverdue(tx.vencimento, tx.status)
  const days = showDays ? daysDiff(tx.vencimento) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: overdue ? '#FFFBEB' : '#fff', transition: 'background 0.1s' }}
      onMouseEnter={e => { if (!overdue) e.currentTarget.style.background = '#F8FAFC' }}
      onMouseLeave={e => { e.currentTarget.style.background = overdue ? '#FFFBEB' : '#fff' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: cat?.cor || (tx.tipo === 'receita' ? '#16A34A' : '#DC2626') }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: overdue ? '#92400E' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
            {tx.descricao}
          </span>
          {overdue && <span style={{ fontSize: 9, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 7px', textTransform: 'uppercase', flexShrink: 0 }}>Vencido</span>}
          {tx.recorrente && <span style={{ fontSize: 9, fontWeight: 700, background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE', borderRadius: 20, padding: '2px 7px', textTransform: 'uppercase', flexShrink: 0 }}>Recorrente</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {tx.contact_nome && <span>{tx.contact_nome}</span>}
          {cat && <span style={{ color: cat.cor || '#94A3B8' }}>● {cat.nome}</span>}
          {tx.centro_custo && <span>· {tx.centro_custo}</span>}
          {tx.forma_pagamento && <span style={{ background: '#F1F5F9', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>{tx.forma_pagamento}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'center', minWidth: 90, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? '#D97706' : 'var(--text-secondary)' }}>{fmtDateBR(tx.vencimento)}</div>
        {showDays && days !== null && <div style={{ fontSize: 10, color: '#DC2626', marginTop: 1 }}>{days}d atraso</div>}
        {!showDays && tx.total_parcelas > 1 && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{tx.parcela_atual}/{tx.total_parcelas}</div>}
      </div>
      <div style={{ textAlign: 'right', minWidth: 110, flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: tx.tipo === 'receita' ? '#16A34A' : '#DC2626' }}>{fmtBRL(tx.valor)}</div>
      </div>
      {!showDays && (
        <div style={{ minWidth: 80, flexShrink: 0 }}>
          <StatusBadge status={tx.status} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {tx.status === 'pendente' && onPaid && (
          <button onClick={() => onPaid(tx)} title={tx.tipo === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A', cursor: 'pointer' }}>
            <Check size={14} />
          </button>
        )}
        {onEdit && (
          <button onClick={() => onEdit(tx)} title="Editar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', cursor: 'pointer' }}>
            <Edit2 size={13} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(tx)} title="Excluir" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', cursor: 'pointer' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CompanyFinanceiro() {
  const { session } = useAuth()
  const instance = session?.company?.instance
  const isAdmin = session?.user?.role === 'admin'

  const [tab, setTab] = useState('receber')
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // filters
  const [filterMonth, setFilterMonth] = useState(currentMonthStr())
  const [filterStatus, setFilterStatus] = useState('todos')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterForma, setFilterForma] = useState('todos')

  // DRE
  const [dreYear, setDreYear] = useState(new Date().getFullYear())

  // por categoria
  const [catPeriod, setCatPeriod] = useState(currentMonthStr())
  const [catTipo, setCatTipo] = useState('receita')

  // modal
  const [modal, setModal] = useState(null)
  const [modalErr, setModalErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── Access control ────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: '2rem' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Lock size={28} color="#94A3B8" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 6 }}>Acesso restrito</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Apenas administradores podem acessar o módulo financeiro.</div>
        </div>
      </div>
    )
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!instance) return
    setLoading(true)
    const yearNow = new Date().getFullYear()
    Promise.all([
      supabase.from('financial_transactions').select('*')
        .eq('instancia', instance)
        .gte('vencimento', `${yearNow - 1}-01-01`)
        .lte('vencimento', `${yearNow + 1}-12-31`)
        .order('vencimento', { ascending: false }),
      supabase.from('financial_categories').select('*')
        .in('instancia', [instance, '_default_'])
        .order('nome'),
    ]).then(([{ data: tx }, { data: cats }]) => {
      if (tx) setTransactions(tx)
      if (cats) setCategories(cats)
      setLoading(false)
    })
  }, [instance])

  // ── Derived ───────────────────────────────────────────────────────────────
  const catMap = useMemo(() => {
    const m = {}
    categories.forEach(c => { m[c.id] = c })
    return m
  }, [categories])

  const currentMonth = currentMonthStr()

  const summary = useMemo(() => {
    let aReceber = 0, aPagar = 0, recebido = 0, pago = 0
    transactions.filter(t => t.vencimento?.startsWith(currentMonth)).forEach(t => {
      const v = parseFloat(t.valor) || 0
      if (t.tipo === 'receita') {
        if (t.status === 'pendente') aReceber += v
        if (t.status === 'pago') recebido += v
      } else {
        if (t.status === 'pendente') aPagar += v
        if (t.status === 'pago') pago += v
      }
    })
    return { aReceber, aPagar, recebido, pago, saldo: recebido - pago }
  }, [transactions, currentMonth])

  const tipoAtual = tab === 'receber' ? 'receita' : 'despesa'
  const filteredTx = useMemo(() => {
    if (tab !== 'receber' && tab !== 'pagar') return []
    const search = filterSearch.toLowerCase().trim()
    return transactions.filter(t => {
      if (t.tipo !== tipoAtual) return false
      if (!t.vencimento?.startsWith(filterMonth)) return false
      if (filterStatus !== 'todos' && t.status !== filterStatus) return false
      if (filterForma !== 'todos' && t.forma_pagamento !== filterForma) return false
      if (search) {
        const d = (t.descricao || '').toLowerCase()
        const n = (t.contact_nome || '').toLowerCase()
        if (!d.includes(search) && !n.includes(search)) return false
      }
      return true
    }).sort((a, b) => {
      const ao = isOverdue(a.vencimento, a.status) ? 0 : 1
      const bo = isOverdue(b.vencimento, b.status) ? 0 : 1
      if (ao !== bo) return ao - bo
      return a.vencimento?.localeCompare(b.vencimento) || 0
    })
  }, [transactions, tab, tipoAtual, filterMonth, filterStatus, filterSearch, filterForma])

  const fluxoRows = useMemo(() => {
    const rows = []
    for (let i = -6; i <= 3; i++) {
      const m = addMonths(currentMonth, i)
      const tx = transactions.filter(t => t.vencimento?.startsWith(m) && t.status !== 'cancelado')
      let recPrev = 0, despPrev = 0, recReal = 0, despReal = 0
      tx.forEach(t => {
        const v = parseFloat(t.valor) || 0
        if (t.tipo === 'receita') { recPrev += v; if (t.status === 'pago') recReal += v }
        else { despPrev += v; if (t.status === 'pago') despReal += v }
      })
      rows.push({ month: m, recPrev, despPrev, saldoPrev: recPrev - despPrev, recReal, despReal, saldoReal: recReal - despReal })
    }
    return rows
  }, [transactions, currentMonth])

  const dreData = useMemo(() => {
    let totRec = 0, totDesp = 0
    const months = []
    for (let mo = 1; mo <= 12; mo++) {
      const m = `${dreYear}-${String(mo).padStart(2, '0')}`
      const tx = transactions.filter(t => t.vencimento?.startsWith(m) && t.status !== 'cancelado')
      let rec = 0, desp = 0
      tx.forEach(t => {
        const v = parseFloat(t.valor) || 0
        if (t.tipo === 'receita') rec += v; else desp += v
      })
      totRec += rec; totDesp += desp
      months.push({ month: m, rec, desp, resultado: rec - desp })
    }
    // category breakdown for year
    const txYear = transactions.filter(t => t.vencimento?.startsWith(String(dreYear)) && t.status !== 'cancelado')
    const byRec = {}, byDesp = {}
    txYear.forEach(t => {
      const v = parseFloat(t.valor) || 0
      const key = t.categoria_id || '__sem__'
      if (t.tipo === 'receita') byRec[key] = (byRec[key] || 0) + v
      else byDesp[key] = (byDesp[key] || 0) + v
    })
    const sort = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])
    return { months, totRec, totDesp, totResultado: totRec - totDesp, catRec: sort(byRec), catDesp: sort(byDesp) }
  }, [transactions, dreYear])

  const agingData = useMemo(() => {
    const today = todayStr()
    const overdue = transactions.filter(t => t.tipo === 'receita' && t.status === 'pendente' && t.vencimento < today)
    const buckets = [
      { label: '1–30 dias', key: '0-30', color: '#D97706', items: [] },
      { label: '31–60 dias', key: '31-60', color: '#EA580C', items: [] },
      { label: '61–90 dias', key: '61-90', color: '#DC2626', items: [] },
      { label: '90+ dias',  key: '90+',   color: '#7F1D1D', items: [] },
    ]
    overdue.forEach(t => {
      const d = daysDiff(t.vencimento)
      if (d <= 30) buckets[0].items.push(t)
      else if (d <= 60) buckets[1].items.push(t)
      else if (d <= 90) buckets[2].items.push(t)
      else buckets[3].items.push(t)
    })
    buckets.forEach(b => { b.total = b.items.reduce((s, t) => s + (parseFloat(t.valor) || 0), 0) })
    return buckets
  }, [transactions])

  const catAnalysis = useMemo(() => {
    const tx = transactions.filter(t => t.vencimento?.startsWith(catPeriod) && t.tipo === catTipo && t.status !== 'cancelado')
    const total = tx.reduce((s, t) => s + (parseFloat(t.valor) || 0), 0)
    const byCat = {}
    tx.forEach(t => {
      const key = t.categoria_id || '__sem__'
      if (!byCat[key]) byCat[key] = { count: 0, total: 0 }
      byCat[key].count++
      byCat[key].total += parseFloat(t.valor) || 0
    })
    const items = Object.entries(byCat)
      .map(([key, val]) => ({ key, ...val, cat: catMap[key] || null }))
      .sort((a, b) => b.total - a.total)
    return { total, items, txCount: tx.length }
  }, [transactions, catPeriod, catTipo, catMap])

  function catsForTipo(t) {
    return categories.filter(c => c.tipo === t || c.tipo === 'ambos')
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function openNew() {
    setModal({
      mode: 'new',
      data: {
        tipo: tab === 'pagar' ? 'despesa' : 'receita',
        descricao: '', valor: '', vencimento: todayStr(),
        categoria_id: '', contact_nome: '', centro_custo: '',
        forma_pagamento: '', observacoes: '',
        parcelado: false, num_parcelas: 2,
        recorrente: false, recorrencia_meses: 3,
      },
    })
    setModalErr('')
  }

  function openEdit(tx) {
    setModal({
      mode: 'edit',
      data: { ...tx, valor: tx.valor?.toString() || '', parcelado: false, num_parcelas: 2, recorrente: false, recorrencia_meses: 3 },
    })
    setModalErr('')
  }

  async function handleSave() {
    const { data } = modal
    if (!data.descricao?.trim()) { setModalErr('Descrição é obrigatória.'); return }
    if (!data.valor || isNaN(parseFloat(data.valor)) || parseFloat(data.valor) <= 0) { setModalErr('Informe um valor válido.'); return }
    if (!data.vencimento) { setModalErr('Data de vencimento é obrigatória.'); return }
    setSaving(true); setModalErr('')

    if (modal.mode === 'edit') {
      const payload = {
        tipo: data.tipo, descricao: data.descricao.trim(), valor: parseFloat(data.valor),
        vencimento: data.vencimento, categoria_id: data.categoria_id || null,
        contact_nome: data.contact_nome?.trim() || null, centro_custo: data.centro_custo?.trim() || null,
        forma_pagamento: data.forma_pagamento || null, observacoes: data.observacoes?.trim() || null,
        status: data.status,
      }
      const { data: updated, error } = await supabase.from('financial_transactions').update(payload).eq('id', data.id).select().single()
      setSaving(false)
      if (error) { setModalErr('Erro: ' + error.message); return }
      setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))
      setModal(null)
      return
    }

    // new
    const isParcelado = data.parcelado && !data.recorrente
    const isRecorrente = data.recorrente
    const numRows = isParcelado
      ? Math.max(2, Math.min(24, parseInt(data.num_parcelas) || 2))
      : isRecorrente
        ? Math.max(2, Math.min(24, parseInt(data.recorrencia_meses) || 3))
        : 1

    const grupoParcelasId = isParcelado ? crypto.randomUUID() : null
    const grupoRecId = isRecorrente ? crypto.randomUUID() : null

    const rows = Array.from({ length: numRows }, (_, i) => ({
      instancia: instance,
      tipo: data.tipo,
      descricao: isParcelado ? `${data.descricao.trim()} (${i + 1}/${numRows})` : data.descricao.trim(),
      valor: parseFloat(data.valor),
      vencimento: numRows > 1 ? addMonthsToDate(data.vencimento, i) : data.vencimento,
      categoria_id: data.categoria_id || null,
      contact_nome: data.contact_nome?.trim() || null,
      centro_custo: data.centro_custo?.trim() || null,
      forma_pagamento: data.forma_pagamento || null,
      observacoes: data.observacoes?.trim() || null,
      status: 'pendente',
      created_by: session?.user?.id || null,
      grupo_parcelas: grupoParcelasId,
      parcela_atual: isParcelado ? i + 1 : null,
      total_parcelas: isParcelado ? numRows : null,
      recorrente: isRecorrente || false,
      recorrencia_tipo: isRecorrente ? 'mensal' : null,
      grupo_recorrencia: grupoRecId,
    }))

    const { data: inserted, error } = await supabase.from('financial_transactions').insert(rows).select()
    setSaving(false)
    if (error) { setModalErr('Erro: ' + error.message); return }
    if (inserted) setTransactions(prev => [...inserted, ...prev])
    setModal(null)
  }

  async function handleMarkPaid(tx) {
    const { data: updated } = await supabase.from('financial_transactions')
      .update({ status: 'pago', pagamento_at: todayStr() })
      .eq('id', tx.id).select().single()
    if (updated) setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    await supabase.from('financial_transactions').delete().eq('id', confirmDelete.id)
    setTransactions(prev => prev.filter(t => t.id !== confirmDelete.id))
    setDeleting(false); setConfirmDelete(null)
  }

  const modalD = modal?.data || {}

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={22} color="#0891B2" /> Financeiro
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${transactions.length} lançamento(s) registrados`}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <SummaryCard label="A Receber" value={summary.aReceber} icon={ArrowUpCircle} color="#16A34A" bg="#F0FDF4" loading={loading} sub="este mês" />
        <SummaryCard label="A Pagar" value={summary.aPagar} icon={ArrowDownCircle} color="#DC2626" bg="#FEF2F2" loading={loading} sub="este mês" />
        <SummaryCard label="Recebido" value={summary.recebido} icon={TrendingUp} color="#0891B2" bg="#ECFEFF" loading={loading} sub="este mês" />
        <SummaryCard label="Saldo do mês" value={summary.saldo} icon={summary.saldo >= 0 ? TrendingUp : TrendingDown} color={summary.saldo >= 0 ? '#2563EB' : '#DC2626'} bg={summary.saldo >= 0 ? '#EFF6FF' : '#FEF2F2'} loading={loading} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t.key ? '#0891B2' : 'var(--text-muted)',
            borderBottom: tab === t.key ? '2px solid #0891B2' : '2px solid transparent',
            marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── A Receber / A Pagar ── */}
      {(tab === 'receber' || tab === 'pagar') && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ position: 'relative' }}>
              <Calendar size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input type="month" className="nx-input" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ paddingLeft: 28, fontSize: 13, width: 160 }} />
            </div>
            <select className="nx-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 13, width: 130 }}>
              <option value="todos">Todos status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <select className="nx-select" value={filterForma} onChange={e => setFilterForma(e.target.value)} style={{ fontSize: 13, width: 150 }}>
              <option value="todos">Todas formas</option>
              {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="nx-input" placeholder="Buscar descrição ou paciente..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} style={{ paddingLeft: 28, fontSize: 13 }} />
            </div>
            <button className="nx-btn-primary" onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13 }}>
              <Plus size={14} /> Novo lançamento
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-muted)', gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Carregando...
            </div>
          ) : filteredTx.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <DollarSign size={28} style={{ opacity: 0.2, marginBottom: 8 }} />
              <div style={{ fontSize: 14 }}>Nenhum lançamento encontrado para este período.</div>
              <button className="nx-btn-ghost" onClick={openNew} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Plus size={13} /> Criar lançamento
              </button>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {filteredTx.map((tx, idx) => (
                <div key={tx.id} style={{ borderBottom: idx < filteredTx.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <TxRow tx={tx} catMap={catMap} onPaid={handleMarkPaid} onEdit={openEdit} onDelete={setConfirmDelete} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Fluxo de Caixa ── */}
      {tab === 'fluxo' && (
        <div>
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                    {['Mês', 'Rec. Prevista', 'Desp. Prevista', 'Saldo Previsto', 'Rec. Recebida', 'Desp. Paga', 'Saldo Real'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Mês' ? 'left' : 'right', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fluxoRows.map((row, idx) => {
                    const isCurrent = row.month === currentMonth
                    const isFuture = row.month > currentMonth
                    return (
                      <tr key={row.month} style={{ borderBottom: idx < fluxoRows.length - 1 ? '1px solid #F1F5F9' : 'none', background: isCurrent ? '#EFF6FF' : 'transparent' }}>
                        <td style={{ padding: '10px 14px', fontWeight: isCurrent ? 700 : 600, color: isCurrent ? '#2563EB' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {monthLabel(row.month)}
                          {isCurrent && <span style={{ fontSize: 9, background: '#BFDBFE', color: '#1D4ED8', borderRadius: 20, padding: '2px 7px', marginLeft: 7, fontWeight: 700, textTransform: 'uppercase' }}>Atual</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#16A34A', fontWeight: 600 }}>{fmtBRL(row.recPrev)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>{fmtBRL(row.despPrev)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: row.saldoPrev >= 0 ? '#2563EB' : '#DC2626' }}>{fmtBRL(row.saldoPrev)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: isFuture ? '#CBD5E1' : '#16A34A', fontWeight: 600 }}>{isFuture ? '—' : fmtBRL(row.recReal)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: isFuture ? '#CBD5E1' : '#DC2626', fontWeight: 600 }}>{isFuture ? '—' : fmtBRL(row.despReal)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: isFuture ? '#CBD5E1' : (row.saldoReal >= 0 ? '#2563EB' : '#DC2626') }}>{isFuture ? '—' : fmtBRL(row.saldoReal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            * Previsto = todos os lançamentos do mês (exceto cancelados). Real = apenas com status "pago".
          </div>
        </div>
      )}

      {/* ── DRE ── */}
      {tab === 'dre' && (
        <div>
          {/* Year nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <NavBtn onClick={() => setDreYear(y => y - 1)}><ChevronLeft size={14} /></NavBtn>
            <span style={{ fontWeight: 700, fontSize: 15, minWidth: 48, textAlign: 'center' }}>{dreYear}</span>
            <NavBtn onClick={() => setDreYear(y => y + 1)}><ChevronRight size={14} /></NavBtn>
          </div>

          {/* DRE table */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                    {['Mês', 'Receitas', 'Despesas', 'Resultado', 'Margem'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Mês' ? 'left' : 'right', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dreData.months.map((row, idx) => {
                    const isCurrent = row.month === currentMonth
                    const margem = row.rec > 0 ? ((row.resultado / row.rec) * 100).toFixed(1) : null
                    const hasData = row.rec > 0 || row.desp > 0
                    return (
                      <tr key={row.month} style={{ borderBottom: idx < 11 ? '1px solid #F1F5F9' : 'none', background: isCurrent ? '#EFF6FF' : 'transparent' }}>
                        <td style={{ padding: '10px 14px', fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#2563EB' : 'var(--text-primary)' }}>
                          {monthLabel(row.month)}
                          {isCurrent && <span style={{ fontSize: 9, background: '#BFDBFE', color: '#1D4ED8', borderRadius: 20, padding: '2px 7px', marginLeft: 6, fontWeight: 700, textTransform: 'uppercase' }}>Atual</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: hasData && row.rec > 0 ? '#16A34A' : '#CBD5E1', fontWeight: 600 }}>{row.rec > 0 ? fmtBRL(row.rec) : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: hasData && row.desp > 0 ? '#DC2626' : '#CBD5E1', fontWeight: 600 }}>{row.desp > 0 ? fmtBRL(row.desp) : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: !hasData ? '#CBD5E1' : row.resultado >= 0 ? '#16A34A' : '#DC2626' }}>{hasData ? fmtBRL(row.resultado) : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: margem !== null ? (parseFloat(margem) >= 0 ? '#0891B2' : '#DC2626') : '#CBD5E1', fontWeight: 600 }}>{margem !== null ? `${margem}%` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F1F5F9', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <td style={{ padding: '10px 14px', fontSize: 12 }}>Total {dreYear}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#16A34A' }}>{fmtBRL(dreData.totRec)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#DC2626' }}>{fmtBRL(dreData.totDesp)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: dreData.totResultado >= 0 ? '#16A34A' : '#DC2626' }}>{fmtBRL(dreData.totResultado)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {dreData.totRec > 0 ? `${((dreData.totResultado / dreData.totRec) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Category breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { title: 'Receitas por Categoria', data: dreData.catRec, color: '#16A34A' },
              { title: 'Despesas por Categoria', data: dreData.catDesp, color: '#DC2626' },
            ].map(({ title, data, color }) => (
              <div key={title}>
                <div style={{ fontWeight: 700, fontSize: 13, color, marginBottom: 8 }}>{title}</div>
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  {data.length === 0
                    ? <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sem lançamentos em {dreYear}</div>
                    : data.map(([key, total]) => {
                        const cat = catMap[key]
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F8FAFC' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat?.cor || '#CBD5E1', flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)' }}>{cat?.nome || 'Sem categoria'}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>{fmtBRL(total)}</span>
                          </div>
                        )
                      })
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Inadimplência ── */}
      {tab === 'inadimplencia' && (
        <div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            {agingData.map(b => (
              <div key={b.key} style={{ background: '#fff', border: `1px solid ${b.total > 0 ? b.color + '44' : 'var(--border)'}`, borderRadius: 12, padding: '1rem 1.2rem', flex: 1, minWidth: 130 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <AlertTriangle size={12} color={b.total > 0 ? b.color : '#CBD5E1'} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: b.total > 0 ? b.color : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{b.label}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: b.total > 0 ? b.color : 'var(--text-muted)' }}>{fmtBRL(b.total)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{b.items.length} lançamento(s)</div>
              </div>
            ))}
          </div>

          {agingData.every(b => b.items.length === 0) ? (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '2.5rem', textAlign: 'center' }}>
              <Check size={28} color="#16A34A" style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 700, fontSize: 15, color: '#14532D', marginBottom: 4 }}>Sem inadimplência</div>
              <div style={{ fontSize: 13, color: '#16A34A' }}>Todas as contas a receber estão em dia ou já foram recebidas.</div>
            </div>
          ) : (
            agingData.filter(b => b.items.length > 0).map(b => (
              <div key={b.key} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: b.color }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: b.color }}>{b.label} — {fmtBRL(b.total)}</span>
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  {b.items.map((tx, idx) => (
                    <div key={tx.id} style={{ borderBottom: idx < b.items.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <TxRow tx={tx} catMap={catMap} onPaid={handleMarkPaid} onEdit={openEdit} showDays />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Por Categoria ── */}
      {tab === 'categorias' && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <input type="month" className="nx-input" value={catPeriod} onChange={e => setCatPeriod(e.target.value)} style={{ fontSize: 13, width: 160 }} />
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {[{ v: 'receita', label: 'Receitas', c: '#16A34A' }, { v: 'despesa', label: 'Despesas', c: '#DC2626' }].map(opt => (
                <button key={opt.v} onClick={() => setCatTipo(opt.v)} style={{
                  padding: '7px 18px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: catTipo === opt.v ? opt.c : '#F8FAFC',
                  color: catTipo === opt.v ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>

          {catAnalysis.items.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Nenhum lançamento de {catTipo === 'receita' ? 'receita' : 'despesa'} no período.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {/* header */}
              <div style={{ display: 'flex', padding: '9px 14px', background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categoria</span>
                <span style={{ minWidth: 50, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Qtd</span>
                <span style={{ minWidth: 120, textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</span>
                <span style={{ minWidth: 60, textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>%</span>
              </div>
              {catAnalysis.items.map(item => {
                const pct = catAnalysis.total > 0 ? (item.total / catAnalysis.total * 100) : 0
                const color = catTipo === 'receita' ? '#16A34A' : '#DC2626'
                const barColor = item.cat?.cor || color
                return (
                  <div key={item.key} style={{ padding: '10px 14px', borderBottom: '1px solid #F8FAFC' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: barColor, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.cat?.nome || 'Sem categoria'}</span>
                      <span style={{ minWidth: 50, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{item.count}</span>
                      <span style={{ minWidth: 120, textAlign: 'right', fontSize: 13, fontWeight: 700, color }}>{fmtBRL(item.total)}</span>
                      <span style={{ minWidth: 60, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 4, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: barColor, width: `${pct}%`, borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })}
              {/* total row */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', background: '#F8FAFC', borderTop: '2px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total</span>
                <span style={{ minWidth: 50, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{catAnalysis.txCount}</span>
                <span style={{ minWidth: 120, textAlign: 'right', fontSize: 13, fontWeight: 800, color: catTipo === 'receita' ? '#16A34A' : '#DC2626' }}>{fmtBRL(catAnalysis.total)}</span>
                <span style={{ minWidth: 60, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>100%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      {modal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflow: 'auto' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{modal.mode === 'edit' ? 'Editar lançamento' : 'Novo lançamento'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setModal(null)}><X size={16} /></button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Tipo */}
              <div>
                <label style={labelStyle}>Tipo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: 'receita', label: 'Receita', c: '#16A34A' }, { v: 'despesa', label: 'Despesa', c: '#DC2626' }].map(opt => (
                    <button key={opt.v} type="button"
                      onClick={() => setModal(p => ({ ...p, data: { ...p.data, tipo: opt.v, categoria_id: '' } }))}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', transition: 'all 0.15s', background: modalD.tipo === opt.v ? opt.c : '#F1F5F9', color: modalD.tipo === opt.v ? '#fff' : 'var(--text-secondary)' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label style={labelStyle}>Descrição *</label>
                <input className="nx-input" autoFocus placeholder="Ex: Consulta João, Aluguel..."
                  value={modalD.descricao || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, descricao: e.target.value } }))} />
              </div>

              {/* Valor + Vencimento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Valor (R$) *</label>
                  <input className="nx-input" type="number" min="0" step="0.01" placeholder="0,00"
                    value={modalD.valor || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, valor: e.target.value } }))} />
                </div>
                <div>
                  <label style={labelStyle}>Vencimento *</label>
                  <input className="nx-input" type="date"
                    value={modalD.vencimento || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, vencimento: e.target.value } }))} />
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label style={labelStyle}>Categoria</label>
                <select className="nx-select" value={modalD.categoria_id || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, categoria_id: e.target.value } }))}>
                  <option value="">Sem categoria</option>
                  {catsForTipo(modalD.tipo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              {/* Forma de pagamento */}
              <div>
                <label style={labelStyle}>Forma de pagamento</label>
                <select className="nx-select" value={modalD.forma_pagamento || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, forma_pagamento: e.target.value } }))}>
                  <option value="">Não informado</option>
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              {/* Paciente + Centro de custo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Paciente / Contato</label>
                  <input className="nx-input" placeholder="Nome do paciente"
                    value={modalD.contact_nome || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, contact_nome: e.target.value } }))} />
                </div>
                <div>
                  <label style={labelStyle}>Centro de custo</label>
                  <input className="nx-input" placeholder="Ex: Clínica, Administrativo"
                    value={modalD.centro_custo || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, centro_custo: e.target.value } }))} />
                </div>
              </div>

              {/* Status — só no edit */}
              {modal.mode === 'edit' && (
                <div>
                  <label style={labelStyle}>Status</label>
                  <select className="nx-select" value={modalD.status || 'pendente'} onChange={e => setModal(p => ({ ...p, data: { ...p.data, status: e.target.value } }))}>
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              )}

              {/* Parcelas ou Recorrência — só no new */}
              {modal.mode === 'new' && (
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Parcelado */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: modalD.parcelado ? 10 : 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>Parcelado?</span>
                      <Toggle value={modalD.parcelado || false} onChange={v => setModal(p => ({ ...p, data: { ...p.data, parcelado: v, recorrente: v ? false : p.data.recorrente } }))} />
                    </div>
                    {modalD.parcelado && (
                      <div>
                        <label style={labelStyle}>Nº de parcelas (2–24)</label>
                        <input className="nx-input" type="number" min="2" max="24" value={modalD.num_parcelas || 2}
                          onChange={e => setModal(p => ({ ...p, data: { ...p.data, num_parcelas: parseInt(e.target.value) || 2 } }))} style={{ width: 100 }} />
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          Serão criados {modalD.num_parcelas} lançamentos com vencimentos mensais a partir de {fmtDateBR(modalD.vencimento)}.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recorrente */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: modalD.recorrente ? 10 : 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', flex: 1 }}>Recorrente?</span>
                      <Toggle value={modalD.recorrente || false} onChange={v => setModal(p => ({ ...p, data: { ...p.data, recorrente: v, parcelado: v ? false : p.data.parcelado } }))} />
                    </div>
                    {modalD.recorrente && (
                      <div>
                        <label style={labelStyle}>Repetir por quantos meses?</label>
                        <select className="nx-select" value={modalD.recorrencia_meses || 3}
                          onChange={e => setModal(p => ({ ...p, data: { ...p.data, recorrencia_meses: parseInt(e.target.value) } }))}>
                          {[2, 3, 6, 12, 24].map(n => <option key={n} value={n}>{n} meses</option>)}
                        </select>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          Serão criados {modalD.recorrencia_meses || 3} lançamentos mensais idênticos (ex: aluguel, mensalidade).
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Observações */}
              <div>
                <label style={labelStyle}>Observações</label>
                <textarea className="nx-input" rows={2} placeholder="Informações adicionais (opcional)"
                  value={modalD.observacoes || ''} onChange={e => setModal(p => ({ ...p, data: { ...p.data, observacoes: e.target.value } }))}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {modalErr && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
                  {modalErr}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</> : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Confirm delete ── */}
      {confirmDelete && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#DC2626' }}>Excluir lançamento</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setConfirmDelete(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', fontSize: 14, color: 'var(--text-secondary)' }}>
              Excluir <strong>"{confirmDelete.descricao}"</strong> de <strong>{fmtBRL(confirmDelete.valor)}</strong>? Esta ação não pode ser desfeita.
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {deleting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
