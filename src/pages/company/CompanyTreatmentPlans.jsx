import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../../components/ConfirmModal'
import { Repeat, Plus, X, Trash2, Calendar, User as UserIcon, Loader2, CheckCircle2, AlertTriangle, DollarSign, Check } from 'lucide-react'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const lbl = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }

function fmtBRL(v) { return (parseFloat(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function normNum(n) { return (n || '').replace(/\D/g, '') }
function curMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 1)
  return { startISO: start.toISOString(), endISO: end.toISOString(), comp: `${ym}-01`, vencStr: `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }
}

// Gera os agendamentos do plano (dia a dia, respeitando o padrão semanal)
function buildAppointments(plan, slots, profRate, instance) {
  const out = []
  const start = new Date(plan.data_inicio + 'T00:00:00')
  const end = new Date(start); end.setMonth(end.getMonth() + plan.meses)
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay()
    slots.filter(s => Number(s.weekday) === wd && s.hora && s.professional_id).forEach(s => {
      const [hh, mm] = s.hora.split(':')
      const startsAt = new Date(d); startsAt.setHours(+hh, +mm || 0, 0, 0)
      out.push({
        instancia: instance,
        agenda_id: plan.agenda_id || null,
        contact_numero: plan.contact_numero || null,
        contact_nome: plan.contact_nome,
        starts_at: startsAt.toISOString(),
        professional_id: s.professional_id,
        price: profRate[s.professional_id] || 0,
        status: 'agendado',
        treatment_plan_id: plan.id,
      })
    })
  }
  return out
}

export default function CompanyTreatmentPlans() {
  const { session } = useAuth()
  const instance = session?.company?.instance

  const [plans, setPlans] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [agendas, setAgendas] = useState([])
  const [savedContacts, setSavedContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  // Repasse
  const [view, setView] = useState('planos')       // 'planos' | 'repasse'
  const [repMonth, setRepMonth] = useState(curMonth())
  const [repRows, setRepRows] = useState([])
  const [repLoading, setRepLoading] = useState(false)
  const [repExisting, setRepExisting] = useState({})   // professional_id -> financeiro row (repasse ja gerado)
  const [repGen, setRepGen] = useState(false)

  // Carrega planos + conta agendamentos por plano (sem depender de FK/embedding)
  async function fetchPlans() {
    const { data: pl } = await supabase.from('treatment_plans').select('*').eq('instancia', instance).order('created_at', { ascending: false })
    const list = pl || []
    if (list.length) {
      const ids = list.map(p => p.id)
      const { data: appts } = await supabase.from('appointments').select('treatment_plan_id').in('treatment_plan_id', ids)
      const counts = {}
      ;(appts || []).forEach(a => { if (a.treatment_plan_id) counts[a.treatment_plan_id] = (counts[a.treatment_plan_id] || 0) + 1 })
      list.forEach(p => { p._count = counts[p.id] || 0 })
    }
    return list
  }

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    Promise.all([
      fetchPlans(),
      supabase.from('professionals').select('id, name, valor_atendimento, active').eq('instancia', instance).order('name'),
      supabase.from('agendas').select('id, name').eq('instancia', instance).order('name'),
      supabase.from('saved_contacts').select('nome, numero').eq('instancia', instance).order('nome'),
    ]).then(([pl, pr, ag, sc]) => {
      setPlans(pl)
      if (pr.data) setProfessionals(pr.data.filter(x => x.active !== false))
      if (ag.data) setAgendas(ag.data)
      if (sc.data) setSavedContacts(sc.data)
      setLoading(false)
    })
  }, [instance])

  const profRate = useMemo(() => {
    const m = {}; professionals.forEach(p => { m[p.id] = parseFloat(p.valor_atendimento) || 0 }); return m
  }, [professionals])
  const profName = useMemo(() => {
    const m = {}; professionals.forEach(p => { m[p.id] = p.name }); return m
  }, [professionals])

  function openNew() {
    setErr('')
    setModal({
      contact_nome: '', contact_numero: '', valor_mensal: '', meses: 4, data_inicio: todayStr(),
      agenda_id: agendas[0]?.id || '',
      slots: [{ weekday: 1, hora: '08:00', professional_id: '' }],
    })
  }

  // Resumo: atendimentos/mês por profissional e se a soma bate com a mensalidade
  const summary = useMemo(() => {
    if (!modal) return null
    // Ocorrências no 1º mês do padrão
    const start = new Date((modal.data_inicio || todayStr()) + 'T00:00:00')
    const end = new Date(start); end.setMonth(end.getMonth() + 1)
    const perProf = {}
    let total = 0
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const wd = d.getDay()
      modal.slots.filter(s => Number(s.weekday) === wd && s.professional_id).forEach(s => {
        perProf[s.professional_id] = (perProf[s.professional_id] || 0) + 1
        total++
      })
    }
    const rows = Object.entries(perProf).map(([pid, count]) => {
      const valor = count * (profRate[pid] || 0)
      return { pid, nome: profName[pid] || '—', count, valor }
    })
    const somaRepasse = rows.reduce((s, r) => s + r.valor, 0)
    const mensal = parseFloat(modal.valor_mensal) || 0
    return { rows, total, somaRepasse, mensal, bate: Math.abs(somaRepasse - mensal) < 0.5 }
  }, [modal, profRate, profName])

  async function handleSave() {
    if (!modal.contact_nome.trim()) { setErr('Informe o paciente.'); return }
    if (!(parseFloat(modal.valor_mensal) > 0)) { setErr('Informe a mensalidade.'); return }
    if (!modal.meses || modal.meses < 1) { setErr('Informe a duração em meses.'); return }
    const validSlots = modal.slots.filter(s => s.hora && s.professional_id)
    if (!validSlots.length) { setErr('Adicione ao menos um atendimento no padrão semanal.'); return }
    setSaving(true); setErr('')
    try {
      // 1) Cria o plano
      const { data: plan, error: pErr } = await supabase.from('treatment_plans').insert({
        instancia: instance,
        contact_nome: modal.contact_nome.trim(),
        contact_numero: normNum(modal.contact_numero) || null,
        valor_mensal: parseFloat(modal.valor_mensal),
        meses: parseInt(modal.meses),
        data_inicio: modal.data_inicio,
        created_by: session?.user?.email || null,
      }).select().single()
      if (pErr) throw pErr

      // 2) Slots do padrão semanal
      await supabase.from('treatment_plan_slots').insert(validSlots.map(s => ({
        plan_id: plan.id, instancia: instance,
        weekday: Number(s.weekday), hora: s.hora,
        professional_id: s.professional_id, professional_nome: profName[s.professional_id] || null,
      })))

      // 3) Gera os agendamentos de todos os meses
      const appts = buildAppointments({ ...plan, agenda_id: modal.agenda_id }, validSlots, profRate, instance)
      for (let i = 0; i < appts.length; i += 200) {
        await supabase.from('appointments').insert(appts.slice(i, i + 200))
      }

      // 4) Mensalidade: 1 "a receber" por mês
      const fin = []
      const start = new Date(modal.data_inicio + 'T00:00:00')
      for (let m = 0; m < parseInt(modal.meses); m++) {
        const venc = new Date(start); venc.setMonth(venc.getMonth() + m)
        const comp = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, '0')}-01`
        fin.push({
          instancia: instance, tipo: 'receita',
          descricao: `Mensalidade plano — ${modal.contact_nome.trim()} (${m + 1}/${modal.meses})`,
          valor: parseFloat(modal.valor_mensal), status: 'pendente',
          vencimento: `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, '0')}-${String(venc.getDate()).padStart(2, '0')}`,
          contact_nome: modal.contact_nome.trim(),
          treatment_plan_id: plan.id, competencia: comp,
          created_by: 'Plano (automático)',
        })
      }
      if (fin.length) await supabase.from('financial_transactions').insert(fin)

      setModal(null)
      setPlans(await fetchPlans())   // recarrega com a contagem
    } catch (e) {
      setErr('Erro ao salvar: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirmDel) return
    // Remove agendamentos futuros do plano + lançamentos pendentes + o plano
    await supabase.from('appointments').delete().eq('treatment_plan_id', confirmDel.id).gte('starts_at', new Date().toISOString())
    await supabase.from('financial_transactions').delete().eq('treatment_plan_id', confirmDel.id).eq('status', 'pendente')
    await supabase.from('treatment_plans').delete().eq('id', confirmDel.id)
    setPlans(prev => prev.filter(p => p.id !== confirmDel.id))
    setConfirmDel(null)
  }

  // ── Repasse: carrega atendimentos de plano do mês e monta a tabela ─────────
  useEffect(() => {
    if (!instance || view !== 'repasse') return
    setRepLoading(true)
    const { startISO, endISO, comp } = monthRange(repMonth)
    Promise.all([
      supabase.from('appointments')
        .select('professional_id, status')
        .eq('instancia', instance)
        .not('treatment_plan_id', 'is', null)
        .gte('starts_at', startISO).lt('starts_at', endISO),
      // repasses já gerados nesse mês
      supabase.from('financial_transactions')
        .select('id, professional_id, valor, status')
        .eq('instancia', instance).eq('competencia', comp)
        .eq('created_by', 'Repasse (automático)'),
    ]).then(([ap, fin]) => {
      const counts = {}
      ;(ap.data || []).forEach(a => {
        if (!a.professional_id) return
        if ((a.status || '').toLowerCase() === 'cancelado') return   // cancelado não conta
        counts[a.professional_id] = (counts[a.professional_id] || 0) + 1
      })
      const rows = Object.entries(counts).map(([pid, count]) => ({
        pid, nome: profName[pid] || 'Profissional', count,
        rate: profRate[pid] || 0, valor: count * (profRate[pid] || 0),
      })).sort((a, b) => b.valor - a.valor)
      const exist = {}
      ;(fin.data || []).forEach(f => { if (f.professional_id) exist[f.professional_id] = f })
      setRepRows(rows)
      setRepExisting(exist)
      setRepLoading(false)
    })
  }, [instance, view, repMonth, profName, profRate])

  const repTotal = useMemo(() => repRows.reduce((s, r) => s + r.valor, 0), [repRows])

  async function generateRepasse() {
    const { comp, vencStr } = monthRange(repMonth)
    const toCreate = repRows.filter(r => r.valor > 0 && !repExisting[r.pid])
    if (!toCreate.length) return
    setRepGen(true)
    const [y, m] = repMonth.split('-')
    const cat = null
    const rows = toCreate.map(r => ({
      instancia: instance, tipo: 'despesa',
      descricao: `Repasse — ${r.nome} (${r.count} atend. · ${m}/${y})`,
      valor: r.valor, status: 'pendente', vencimento: vencStr,
      categoria_id: cat, professional_id: r.pid, competencia: comp,
      created_by: 'Repasse (automático)',
    }))
    const { data } = await supabase.from('financial_transactions').insert(rows).select('id, professional_id, valor, status')
    if (data) setRepExisting(prev => { const n = { ...prev }; data.forEach(f => { n[f.professional_id] = f }); return n })
    setRepGen(false)
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Repeat size={20} style={{ color: '#4F46E5' }} /> Planos de tratamento
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Recorrência com vários fisioterapeutas — gera os agendamentos e a mensalidade automaticamente.
          </div>
        </div>
        {view === 'planos' && (
          <button className="nx-btn-primary" onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Novo plano
          </button>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ k: 'planos', l: 'Planos', ic: Repeat }, { k: 'repasse', l: 'Repasse aos fisios', ic: DollarSign }].map(t => (
          <button key={t.k} onClick={() => setView(t.k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${view === t.k ? '#4F46E5' : 'var(--border)'}`, background: view === t.k ? '#4F46E5' : '#fff', color: view === t.k ? '#fff' : 'var(--text-secondary)' }}>
            <t.ic size={14} /> {t.l}
          </button>
        ))}
      </div>

      {view === 'repasse' && (
        <div>
          <div className="nx-card" style={{ padding: '1rem 1.25rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Mês de referência</label>
            <input className="nx-input" type="month" value={repMonth} onChange={e => setRepMonth(e.target.value)} style={{ width: 170 }} />
            <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
              Total do mês: <strong style={{ color: '#E11D48' }}>{fmtBRL(repTotal)}</strong>
            </div>
          </div>

          {repLoading ? (
            <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
          ) : repRows.length === 0 ? (
            <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Nenhum atendimento de plano nesse mês.
            </div>
          ) : (
            <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-scroll">
                <table className="data-table" style={{ width: '100%' }}>
                  <thead><tr><th>Fisioterapeuta</th><th style={{ textAlign: 'center' }}>Atend.</th><th style={{ textAlign: 'center' }}>%</th><th style={{ textAlign: 'right' }}>Valor/atend.</th><th style={{ textAlign: 'right' }}>Repasse</th><th style={{ textAlign: 'right' }}>Situação</th></tr></thead>
                  <tbody>
                    {repRows.map(r => {
                      const ex = repExisting[r.pid]
                      return (
                        <tr key={r.pid}>
                          <td className="td-name">{r.nome}</td>
                          <td style={{ textAlign: 'center' }}>{r.count}</td>
                          <td style={{ textAlign: 'center' }}>{repTotal ? Math.round(r.valor / repTotal * 100) : 0}%</td>
                          <td style={{ textAlign: 'right' }}>{fmtBRL(r.rate)}{!r.rate && <span style={{ color: '#D97706', fontSize: 10, marginLeft: 4 }}>sem valor</span>}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtBRL(r.valor)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {ex
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: ex.status === 'pago' ? '#059669' : '#2563EB' }}>{ex.status === 'pago' ? '✓ Pago' : '↳ A pagar gerado'}</span>
                              : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                  Conta todos os atendimentos agendados do mês (menos cancelados). Gera um "a pagar" por fisio no Financeiro.
                </div>
                {repRows.some(r => r.valor > 0 && !repExisting[r.pid]) ? (
                  <button className="nx-btn-primary" onClick={generateRepasse} disabled={repGen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {repGen ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando...</> : <><Check size={14} /> Aprovar e gerar "a pagar"</>}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> Repasse do mês já gerado</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'planos' && (loading ? (
        <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
      ) : plans.length === 0 ? (
        <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Repeat size={28} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>Nenhum plano ainda. Crie o primeiro pra gerar os atendimentos recorrentes.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {plans.map(p => (
            <div key={p.id} className="nx-card" style={{ padding: '1.1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.contact_nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {p.meses} {p.meses === 1 ? 'mês' : 'meses'} · início {new Date(p.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <button onClick={() => setConfirmDel(p)} style={{ width: 28, height: 28, borderRadius: 7, background: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={12} /></button>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#059669', marginTop: 10 }}>{fmtBRL(p.valor_mensal)}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}> /mês</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                {(p._count ?? 0)} agendamentos gerados
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Modal criar plano */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(6px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 620, maxHeight: '92vh', overflow: 'auto', padding: 0 }}>
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Novo plano de tratamento</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Paciente *</label>
                  <input className="nx-input" list="tp-contacts" placeholder="Nome do paciente" value={modal.contact_nome}
                    onChange={e => {
                      const v = e.target.value
                      const match = savedContacts.find(c => c.nome === v)
                      setModal(m => ({ ...m, contact_nome: v, contact_numero: match?.numero || m.contact_numero }))
                    }} />
                  <datalist id="tp-contacts">{savedContacts.map(c => <option key={c.numero} value={c.nome} />)}</datalist>
                </div>
                <div>
                  <label style={lbl}>Telefone</label>
                  <input className="nx-input" placeholder="Só números" value={modal.contact_numero} onChange={e => setModal(m => ({ ...m, contact_numero: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Mensalidade (R$) *</label>
                  <input className="nx-input" type="number" min="0" step="0.01" placeholder="1000,00" value={modal.valor_mensal} onChange={e => setModal(m => ({ ...m, valor_mensal: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Duração (meses) *</label>
                  <input className="nx-input" type="number" min="1" max="24" value={modal.meses} onChange={e => setModal(m => ({ ...m, meses: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Início *</label>
                  <input className="nx-input" type="date" value={modal.data_inicio} onChange={e => setModal(m => ({ ...m, data_inicio: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={lbl}>Agenda</label>
                <select className="nx-select" value={modal.agenda_id} onChange={e => setModal(m => ({ ...m, agenda_id: e.target.value }))}>
                  <option value="">Sem agenda</option>
                  {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {/* Padrão semanal */}
              <div>
                <label style={lbl}>Padrão semanal (dia · hora · fisioterapeuta)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {modal.slots.map((s, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1.4fr 34px', gap: 8, alignItems: 'center' }}>
                      <select className="nx-select" value={s.weekday} onChange={e => setModal(m => { const sl = [...m.slots]; sl[i] = { ...sl[i], weekday: +e.target.value }; return { ...m, slots: sl } })}>
                        {WEEKDAYS.map((w, wi) => <option key={wi} value={wi}>{w}</option>)}
                      </select>
                      <input className="nx-input" type="time" value={s.hora} onChange={e => setModal(m => { const sl = [...m.slots]; sl[i] = { ...sl[i], hora: e.target.value }; return { ...m, slots: sl } })} />
                      <select className="nx-select" value={s.professional_id} onChange={e => setModal(m => { const sl = [...m.slots]; sl[i] = { ...sl[i], professional_id: e.target.value }; return { ...m, slots: sl } })}>
                        <option value="">Fisioterapeuta...</option>
                        {professionals.map(p => <option key={p.id} value={p.id}>{p.name} {profRate[p.id] ? `(${fmtBRL(profRate[p.id])})` : '(sem valor)'}</option>)}
                      </select>
                      <button onClick={() => setModal(m => ({ ...m, slots: m.slots.filter((_, j) => j !== i) }))} style={{ width: 34, height: 34, borderRadius: 8, background: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48', cursor: 'pointer' }}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setModal(m => ({ ...m, slots: [...m.slots, { weekday: 1, hora: '08:00', professional_id: '' }] }))}
                  style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EEF2FF', border: '1px solid #C7D2FE', color: '#4F46E5', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={13} /> Adicionar atendimento na semana
                </button>
              </div>

              {/* Resumo/validação */}
              {summary && summary.total > 0 && (
                <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Divisão no 1º mês ({summary.total} atendimentos)
                  </div>
                  {summary.rows.map(r => (
                    <div key={r.pid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: 'var(--text-primary)' }}>
                      <span>{r.nome} · {r.count} atend. · {summary.mensal ? Math.round(r.valor / summary.mensal * 100) : 0}%</span>
                      <strong>{fmtBRL(r.valor)}</strong>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px dashed var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Soma repasse</span>
                    <strong style={{ color: summary.bate ? '#059669' : '#D97706' }}>{fmtBRL(summary.somaRepasse)}</strong>
                  </div>
                  {!summary.bate && summary.mensal > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '7px 10px', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      A soma do repasse ({fmtBRL(summary.somaRepasse)}) não bate com a mensalidade ({fmtBRL(summary.mensal)}). Ajuste os valores por atendimento no Catálogo, se precisar. (Pode salvar assim mesmo.)
                    </div>
                  )}
                </div>
              )}

              {err && <div style={{ color: '#E11D48', fontSize: 12.5 }}>{err}</div>}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando...</> : <><CheckCircle2 size={14} /> Criar plano e gerar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDel}
        variant="delete"
        title="Excluir plano"
        message={`Excluir o plano de "${confirmDel?.contact_nome || ''}"? Os agendamentos FUTUROS e as mensalidades pendentes desse plano serão removidos. O histórico já realizado é mantido.`}
        confirmLabel="Excluir plano"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
