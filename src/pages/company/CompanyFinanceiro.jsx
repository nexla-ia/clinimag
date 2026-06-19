import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  DollarSign, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
  Plus, Edit2, Trash2, Check, X, ChevronLeft, ChevronRight,
  Search, Loader2, Lock, Calendar, Filter,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  // str = "2026-06"
  const [y, m] = str.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m, 10) - 1]}/${y}`
}

function addMonths(str, n) {
  const [y, m] = str.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isOverdue(vencimento, status) {
  if (status !== 'pendente') return false
  return vencimento < todayStr()
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const STATUS_BADGE = {
  pendente:  { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Pendente' },
  pago:      { bg: '#F0FDF4', color: '#14532D', border: '#BBF7D0', label: 'Pago' },
  cancelado: { bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1', label: 'Cancelado' },
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color, bg, textColor, loading }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '1.1rem 1.3rem',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flex: 1,
      minWidth: 180,
      boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
          {label}
        </div>
        {loading ? (
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-muted)' }}>—</div>
        ) : (
          <div style={{ fontSize: 18, fontWeight: 800, color: textColor || color }}>
            {fmtBRL(value)}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pendente
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CompanyFinanceiro() {
  const { session } = useAuth()
  const instance = session?.company?.instance
  const isAdmin = session?.user?.role === 'admin'

  // ── State ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('receber') // 'receber' | 'pagar' | 'fluxo'
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterMonth, setFilterMonth] = useState(currentMonthStr())
  const [filterStatus, setFilterStatus] = useState('todos')
  const [filterSearch, setFilterSearch] = useState('')

  // Fluxo
  const [fluxoMonth, setFluxoMonth] = useState(currentMonthStr())

  // Modal
  const [modal, setModal] = useState(null) // null | { mode: 'new'|'edit', data: {} }
  const [modalErr, setModalErr] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── Access control ─────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', gap: 16, padding: '2rem',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, background: '#F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={28} color="#94A3B8" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 6 }}>
            Acesso restrito
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Apenas administradores podem acessar o módulo financeiro.
          </div>
        </div>
      </div>
    )
  }

  // ── Load data ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!instance) return
    setLoading(true)
    Promise.all([
      // transactions: load 6 months back + 3 months forward for fluxo; for lists filter client-side
      supabase.from('financial_transactions').select('*')
        .eq('instancia', instance)
        .gte('vencimento', addMonths(currentMonthStr(), -6) + '-01')
        .lte('vencimento', addMonths(currentMonthStr(), 3) + '-31')
        .order('vencimento', { ascending: false }),
      // categories: company-specific + defaults
      supabase.from('financial_categories').select('*')
        .in('instancia', [instance, '_default_'])
        .order('nome'),
    ]).then(([{ data: tx }, { data: cats }]) => {
      if (tx) setTransactions(tx)
      if (cats) setCategories(cats)
      setLoading(false)
    })
  }, [instance])

  // ── Derived data ───────────────────────────────────────────────────────────
  const catMap = useMemo(() => {
    const m = {}
    categories.forEach(c => { m[c.id] = c })
    return m
  }, [categories])

  // Summary cards — current month
  const currentMonth = currentMonthStr()
  const monthTx = useMemo(() =>
    transactions.filter(t => t.vencimento?.startsWith(currentMonth))
  , [transactions, currentMonth])

  const summary = useMemo(() => {
    let aReceber = 0, aPagar = 0, recebido = 0, pago = 0
    monthTx.forEach(t => {
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
  }, [monthTx])

  // Filtered list for tabs 1 and 2
  const tipo = tab === 'receber' ? 'receita' : 'despesa'
  const filteredTx = useMemo(() => {
    if (tab === 'fluxo') return []
    const search = filterSearch.toLowerCase().trim()
    return transactions.filter(t => {
      if (t.tipo !== tipo) return false
      if (!t.vencimento?.startsWith(filterMonth)) return false
      if (filterStatus !== 'todos' && t.status !== filterStatus) return false
      if (search) {
        const d = (t.descricao || '').toLowerCase()
        const n = (t.contact_nome || '').toLowerCase()
        if (!d.includes(search) && !n.includes(search)) return false
      }
      return true
    }).sort((a, b) => {
      // Overdue first, then by date
      const ao = isOverdue(a.vencimento, a.status) ? 0 : 1
      const bo = isOverdue(b.vencimento, b.status) ? 0 : 1
      if (ao !== bo) return ao - bo
      return a.vencimento?.localeCompare(b.vencimento) || 0
    })
  }, [transactions, tab, tipo, filterMonth, filterStatus, filterSearch])

  // Fluxo data — last 6 months + next 3
  const fluxoRows = useMemo(() => {
    const rows = []
    for (let i = -6; i <= 3; i++) {
      const m = addMonths(currentMonthStr(), i)
      const tx = transactions.filter(t => t.vencimento?.startsWith(m))
      let recPrev = 0, despPrev = 0, recReal = 0, despReal = 0
      tx.forEach(t => {
        const v = parseFloat(t.valor) || 0
        if (t.tipo === 'receita') {
          recPrev += v
          if (t.status === 'pago') recReal += v
        } else {
          despPrev += v
          if (t.status === 'pago') despReal += v
        }
      })
      rows.push({ month: m, recPrev, despPrev, saldoPrev: recPrev - despPrev, recReal, despReal, saldoReal: recReal - despReal })
    }
    return rows
  }, [transactions])

  // ── Categories filtered by tipo ────────────────────────────────────────────
  function catsForTipo(t) {
    return categories.filter(c => c.tipo === t || c.tipo === 'ambos')
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function openNew() {
    setModal({
      mode: 'new',
      data: {
        tipo: tab === 'receber' ? 'receita' : 'despesa',
        descricao: '',
        valor: '',
        vencimento: todayStr(),
        categoria_id: '',
        contact_nome: '',
        centro_custo: '',
        observacoes: '',
        parcelado: false,
        num_parcelas: 2,
      },
    })
    setModalErr('')
  }

  function openEdit(tx) {
    setModal({
      mode: 'edit',
      data: {
        ...tx,
        valor: tx.valor?.toString() || '',
        parcelado: false,
        num_parcelas: 2,
      },
    })
    setModalErr('')
  }

  async function handleSave() {
    const { data } = modal
    if (!data.descricao?.trim()) { setModalErr('Descrição é obrigatória.'); return }
    if (!data.valor || isNaN(parseFloat(data.valor)) || parseFloat(data.valor) <= 0) {
      setModalErr('Informe um valor válido.'); return
    }
    if (!data.vencimento) { setModalErr('Data de vencimento é obrigatória.'); return }

    setSaving(true)
    setModalErr('')

    if (modal.mode === 'edit') {
      const payload = {
        tipo: data.tipo,
        descricao: data.descricao.trim(),
        valor: parseFloat(data.valor),
        vencimento: data.vencimento,
        categoria_id: data.categoria_id || null,
        contact_nome: data.contact_nome?.trim() || null,
        centro_custo: data.centro_custo?.trim() || null,
        observacoes: data.observacoes?.trim() || null,
        status: data.status,
      }
      const { data: updated, error } = await supabase
        .from('financial_transactions').update(payload).eq('id', data.id).select().single()
      setSaving(false)
      if (error) { setModalErr('Erro: ' + error.message); return }
      setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))
      setModal(null)
    } else {
      // New — possibly installments
      const numParcelas = data.parcelado ? Math.max(2, Math.min(24, parseInt(data.num_parcelas) || 2)) : 1
      const grupoId = numParcelas > 1 ? crypto.randomUUID() : null

      const rows = []
      for (let i = 0; i < numParcelas; i++) {
        const venc = numParcelas > 1 ? addMonthsToDate(data.vencimento, i) : data.vencimento
        const desc = numParcelas > 1 ? `${data.descricao.trim()} (${i + 1}/${numParcelas})` : data.descricao.trim()
        rows.push({
          instancia: instance,
          tipo: data.tipo,
          descricao: desc,
          valor: parseFloat(data.valor),
          vencimento: venc,
          categoria_id: data.categoria_id || null,
          contact_nome: data.contact_nome?.trim() || null,
          centro_custo: data.centro_custo?.trim() || null,
          observacoes: data.observacoes?.trim() || null,
          status: 'pendente',
          created_by: session?.user?.id || null,
          grupo_parcelas: grupoId,
          parcela_atual: numParcelas > 1 ? i + 1 : null,
          total_parcelas: numParcelas > 1 ? numParcelas : null,
        })
      }

      const { data: inserted, error } = await supabase
        .from('financial_transactions').insert(rows).select()
      setSaving(false)
      if (error) { setModalErr('Erro: ' + error.message); return }
      if (inserted) setTransactions(prev => [...inserted, ...prev])
      setModal(null)
    }
  }

  function addMonthsToDate(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1 + n, d)
    // Clamp day if month overflow
    const result = new Date(dt.getFullYear(), dt.getMonth() + 1, 0)
    const clampedDay = Math.min(d, result.getDate())
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
  }

  async function handleMarkPaid(tx) {
    const today = todayStr()
    const { data: updated, error } = await supabase
      .from('financial_transactions')
      .update({ status: 'pago', pagamento_at: today })
      .eq('id', tx.id).select().single()
    if (!error && updated) {
      setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    await supabase.from('financial_transactions').delete().eq('id', confirmDelete.id)
    setTransactions(prev => prev.filter(t => t.id !== confirmDelete.id))
    setDeleting(false)
    setConfirmDelete(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={22} color="#0891B2" /> Financeiro
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${transactions.length} lançamento(s) nos últimos 9 meses`}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <SummaryCard
          label="A Receber"
          value={summary.aReceber}
          icon={ArrowUpCircle}
          color="#16A34A"
          bg="#F0FDF4"
          loading={loading}
        />
        <SummaryCard
          label="A Pagar"
          value={summary.aPagar}
          icon={ArrowDownCircle}
          color="#DC2626"
          bg="#FEF2F2"
          loading={loading}
        />
        <SummaryCard
          label="Recebido"
          value={summary.recebido}
          icon={TrendingUp}
          color="#0891B2"
          bg="#ECFEFF"
          loading={loading}
        />
        <SummaryCard
          label="Saldo do mês"
          value={summary.saldo}
          icon={summary.saldo >= 0 ? TrendingUp : TrendingDown}
          color={summary.saldo >= 0 ? '#2563EB' : '#DC2626'}
          bg={summary.saldo >= 0 ? '#EFF6FF' : '#FEF2F2'}
          loading={loading}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'receber', label: 'Contas a Receber' },
          { key: 'pagar',   label: 'Contas a Pagar' },
          { key: 'fluxo',   label: 'Fluxo de Caixa' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '9px 18px', fontSize: 13, fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t.key ? '#0891B2' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid #0891B2' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Lists (tabs 1 & 2) ── */}
      {tab !== 'fluxo' && (
        <>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ position: 'relative' }}>
              <Calendar size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="month"
                className="nx-input"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                style={{ paddingLeft: 28, fontSize: 13, width: 160 }}
              />
            </div>
            <select
              className="nx-select"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ fontSize: 13, width: 130 }}>
              <option value="todos">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                className="nx-input"
                placeholder="Buscar descrição ou paciente..."
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                style={{ paddingLeft: 28, fontSize: 13 }}
              />
            </div>
            <button className="nx-btn-primary" onClick={openNew}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: 13 }}>
              <Plus size={14} /> Novo lançamento
            </button>
          </div>

          {/* List */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--text-muted)', gap: 8 }}>
              <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Carregando...
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
              {filteredTx.map((tx, idx) => {
                const cat = catMap[tx.categoria_id]
                const overdue = isOverdue(tx.vencimento, tx.status)
                return (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                    borderBottom: idx < filteredTx.length - 1 ? '1px solid var(--border)' : 'none',
                    background: overdue ? '#FFFBEB' : '#fff',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { if (!overdue) e.currentTarget.style.background = '#F8FAFC' }}
                    onMouseLeave={e => { e.currentTarget.style.background = overdue ? '#FFFBEB' : '#fff' }}
                  >
                    {/* Category dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: cat?.cor || (tx.tipo === 'receita' ? '#16A34A' : '#DC2626'),
                    }} />

                    {/* Description block */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: overdue ? '#92400E' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                          {tx.descricao}
                        </span>
                        {overdue && (
                          <span style={{ fontSize: 9, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 20, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                            Vencido
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {tx.contact_nome && <span>{tx.contact_nome}</span>}
                        {cat && <span style={{ color: cat.cor || '#94A3B8' }}>{cat.nome}</span>}
                        {tx.centro_custo && <span>· {tx.centro_custo}</span>}
                      </div>
                    </div>

                    {/* Center: date + parcela */}
                    <div style={{ textAlign: 'center', minWidth: 80, flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: overdue ? '#D97706' : 'var(--text-secondary)' }}>
                        {fmtDateBR(tx.vencimento)}
                      </div>
                      {tx.total_parcelas > 1 && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {tx.parcela_atual}/{tx.total_parcelas}
                        </div>
                      )}
                    </div>

                    {/* Value */}
                    <div style={{ textAlign: 'right', minWidth: 110, flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: tx.tipo === 'receita' ? '#16A34A' : '#DC2626' }}>
                        {fmtBRL(tx.valor)}
                      </div>
                    </div>

                    {/* Status */}
                    <div style={{ minWidth: 80, flexShrink: 0 }}>
                      <StatusBadge status={tx.status} />
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {tx.status === 'pendente' && (
                        <button
                          onClick={() => handleMarkPaid(tx)}
                          title="Marcar como pago"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 30, height: 30, borderRadius: 8,
                            background: '#F0FDF4', border: '1px solid #BBF7D0',
                            color: '#16A34A', cursor: 'pointer',
                          }}>
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(tx)}
                        title="Editar"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 30, height: 30, borderRadius: 8,
                          background: '#EFF6FF', border: '1px solid #BFDBFE',
                          color: '#2563EB', cursor: 'pointer',
                        }}>
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(tx)}
                        title="Excluir"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 30, height: 30, borderRadius: 8,
                          background: '#FEF2F2', border: '1px solid #FECACA',
                          color: '#DC2626', cursor: 'pointer',
                        }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
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
                      <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Mês' ? 'left' : 'right', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fluxoRows.map((row, idx) => {
                    const isCurrent = row.month === currentMonthStr()
                    const isFuture = row.month > currentMonthStr()
                    return (
                      <tr key={row.month} style={{
                        borderBottom: idx < fluxoRows.length - 1 ? '1px solid #F1F5F9' : 'none',
                        background: isCurrent ? '#EFF6FF' : 'transparent',
                      }}>
                        <td style={{ padding: '10px 14px', fontWeight: isCurrent ? 700 : 600, color: isCurrent ? '#2563EB' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {monthLabel(row.month)}
                          {isCurrent && <span style={{ fontSize: 9, background: '#BFDBFE', color: '#1D4ED8', borderRadius: 20, padding: '2px 7px', marginLeft: 7, fontWeight: 700, textTransform: 'uppercase' }}>Atual</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#16A34A', fontWeight: 600 }}>{fmtBRL(row.recPrev)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>{fmtBRL(row.despPrev)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: row.saldoPrev >= 0 ? '#2563EB' : '#DC2626' }}>{fmtBRL(row.saldoPrev)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: isFuture ? '#94A3B8' : '#16A34A', fontWeight: 600 }}>{isFuture ? '—' : fmtBRL(row.recReal)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: isFuture ? '#94A3B8' : '#DC2626', fontWeight: 600 }}>{isFuture ? '—' : fmtBRL(row.despReal)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: isFuture ? '#94A3B8' : (row.saldoReal >= 0 ? '#2563EB' : '#DC2626') }}>{isFuture ? '—' : fmtBRL(row.saldoReal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            * Previsto = total de lançamentos do mês (todos os status, exceto cancelados). Real = apenas lançamentos com status "pago".
          </div>
        </div>
      )}

      {/* ── Transaction Modal ── */}
      {modal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 500, maxHeight: '92vh', overflow: 'auto' }}>
            {/* Modal header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {modal.mode === 'edit' ? 'Editar lançamento' : 'Novo lançamento'}
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setModal(null)}>
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Tipo toggle */}
              <div>
                <label style={labelStyle}>Tipo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v: 'receita', label: 'Receita' }, { v: 'despesa', label: 'Despesa' }].map(opt => (
                    <button key={opt.v} type="button"
                      onClick={() => setModal(p => ({ ...p, data: { ...p.data, tipo: opt.v, categoria_id: '' } }))}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', transition: 'all 0.15s',
                        background: modal.data.tipo === opt.v
                          ? (opt.v === 'receita' ? '#16A34A' : '#DC2626')
                          : '#F1F5F9',
                        color: modal.data.tipo === opt.v ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label style={labelStyle}>Descrição *</label>
                <input className="nx-input" autoFocus placeholder="Ex: Consulta João, Aluguel..."
                  value={modal.data.descricao}
                  onChange={e => setModal(p => ({ ...p, data: { ...p.data, descricao: e.target.value } }))} />
              </div>

              {/* Valor + Vencimento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Valor (R$) *</label>
                  <input className="nx-input" type="number" min="0" step="0.01" placeholder="0,00"
                    value={modal.data.valor}
                    onChange={e => setModal(p => ({ ...p, data: { ...p.data, valor: e.target.value } }))} />
                </div>
                <div>
                  <label style={labelStyle}>Vencimento *</label>
                  <input className="nx-input" type="date"
                    value={modal.data.vencimento}
                    onChange={e => setModal(p => ({ ...p, data: { ...p.data, vencimento: e.target.value } }))} />
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label style={labelStyle}>Categoria</label>
                <select className="nx-select"
                  value={modal.data.categoria_id || ''}
                  onChange={e => setModal(p => ({ ...p, data: { ...p.data, categoria_id: e.target.value } }))}>
                  <option value="">Sem categoria</option>
                  {catsForTipo(modal.data.tipo).map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              {/* Paciente + Centro de custo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Paciente</label>
                  <input className="nx-input" placeholder="Nome do paciente"
                    value={modal.data.contact_nome || ''}
                    onChange={e => setModal(p => ({ ...p, data: { ...p.data, contact_nome: e.target.value } }))} />
                </div>
                <div>
                  <label style={labelStyle}>Centro de custo</label>
                  <input className="nx-input" placeholder="Ex: Clínica, Administrativo"
                    value={modal.data.centro_custo || ''}
                    onChange={e => setModal(p => ({ ...p, data: { ...p.data, centro_custo: e.target.value } }))} />
                </div>
              </div>

              {/* Status (only on edit) */}
              {modal.mode === 'edit' && (
                <div>
                  <label style={labelStyle}>Status</label>
                  <select className="nx-select"
                    value={modal.data.status || 'pendente'}
                    onChange={e => setModal(p => ({ ...p, data: { ...p.data, status: e.target.value } }))}>
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              )}

              {/* Parcelas (only on new) */}
              {modal.mode === 'new' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Parcelado?</label>
                    <button type="button"
                      onClick={() => setModal(p => ({ ...p, data: { ...p.data, parcelado: !p.data.parcelado } }))}
                      style={{
                        width: 38, height: 20, borderRadius: 20, border: 'none', cursor: 'pointer',
                        background: modal.data.parcelado ? '#2563EB' : '#CBD5E1',
                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      }}>
                      <span style={{
                        position: 'absolute', top: 2, left: modal.data.parcelado ? 20 : 2,
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }} />
                    </button>
                  </div>
                  {modal.data.parcelado && (
                    <div>
                      <label style={labelStyle}>Nº de parcelas (2–24)</label>
                      <input className="nx-input" type="number" min="2" max="24"
                        value={modal.data.num_parcelas}
                        onChange={e => setModal(p => ({ ...p, data: { ...p.data, num_parcelas: parseInt(e.target.value) || 2 } }))}
                        style={{ width: 100 }}
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Serão criados {modal.data.num_parcelas} lançamentos com vencimentos mensais a partir de {fmtDateBR(modal.data.vencimento)}.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Observações */}
              <div>
                <label style={labelStyle}>Observações</label>
                <textarea className="nx-input" rows={2} placeholder="Informações adicionais (opcional)"
                  value={modal.data.observacoes || ''}
                  onChange={e => setModal(p => ({ ...p, data: { ...p.data, observacoes: e.target.value } }))}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </div>

            {/* Modal footer */}
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

      {/* ── Delete confirm ── */}
      {confirmDelete && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#DC2626' }}>Excluir lançamento</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setConfirmDelete(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', fontSize: 14, color: 'var(--text-secondary)' }}>
              Tem certeza que deseja excluir o lançamento <strong>"{confirmDelete.descricao}"</strong> de <strong>{fmtBRL(confirmDelete.valor)}</strong>? Essa ação não pode ser desfeita.
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
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
