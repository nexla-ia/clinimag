import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Calendar, Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight,
  Clock, User as UserIcon, Phone, ListChecks, CheckCircle2, XCircle, AlertCircle, Settings,
  MessageSquare, History
} from 'lucide-react'
import './Company.css'

const AGENDA_COLORS = ['#2563EB', '#16A34A', '#7C3AED', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#059669']
const SLOT_OPTIONS = [15, 20, 30, 45, 60, 90]
const DAYS_OF_WEEK = [
  { num: 0, label: 'Dom', full: 'Domingo' },
  { num: 1, label: 'Seg', full: 'Segunda' },
  { num: 2, label: 'Ter', full: 'Terça' },
  { num: 3, label: 'Qua', full: 'Quarta' },
  { num: 4, label: 'Qui', full: 'Quinta' },
  { num: 5, label: 'Sex', full: 'Sexta' },
  { num: 6, label: 'Sáb', full: 'Sábado' },
]

const STATUS_OPTIONS = [
  { value: 'agendado',   label: 'Agendado',   color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: Calendar },
  { value: 'confirmado', label: 'Confirmado', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle2 },
  { value: 'concluido',  label: 'Concluído',  color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC', icon: ListChecks },
  { value: 'faltou',     label: 'Faltou',     color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: AlertCircle },
  { value: 'cancelado',  label: 'Cancelado',  color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: XCircle },
]

function getMonday(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // ajusta para segunda-feira
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

function fmtDate(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtDateInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtTimeInput(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseTimeStr(s) {
  if (!s) return [0, 0]
  const [h, m] = s.split(':').map(Number)
  return [h || 0, m || 0]
}

function timeToMinutes(s) {
  const [h, m] = parseTimeStr(s)
  return h * 60 + m
}

function minutesToTime(min) {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function CompanyAgenda() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const instance = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia

  const [tab, setTab]                 = useState('calendario')
  const [agendas, setAgendas]         = useState([])
  const [appointments, setAppointments] = useState([])
  const [savedContacts, setSavedContacts] = useState([])
  const [selectedAgendaId, setSelectedAgendaId] = useState(null)
  const [weekStart, setWeekStart]     = useState(getMonday(new Date()))
  const [loading, setLoading]         = useState(true)

  const [agendaModal, setAgendaModal] = useState(null)
  const [agendaErr, setAgendaErr]     = useState('')
  const [savingAgenda, setSavingAgenda] = useState(false)

  const [apptModal, setApptModal]     = useState(null)
  const [apptErr, setApptErr]         = useState('')
  const [savingAppt, setSavingAppt]   = useState(false)
  const [patientHistory, setPatientHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Carrega agendas + agendamentos + contatos
  useEffect(() => {
    if (!instance) return
    setLoading(true)
    Promise.all([
      supabase.from('agendas').select('*').eq('instancia', instance).order('name'),
      supabase.from('saved_contacts').select('id, nome, numero').eq('instancia', instance).order('nome'),
    ]).then(([{ data: ag }, { data: sc }]) => {
      if (ag) {
        setAgendas(ag)
        if (!selectedAgendaId && ag.length) setSelectedAgendaId(ag[0].id)
      }
      if (sc) setSavedContacts(sc)
      setLoading(false)
    })
  }, [instance])

  // Carrega agendamentos da semana
  useEffect(() => {
    if (!instance) return
    const from = new Date(weekStart); from.setHours(0, 0, 0, 0)
    const to = addDays(weekStart, 7); to.setHours(0, 0, 0, 0)
    supabase.from('appointments').select('*')
      .eq('instancia', instance)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .then(({ data }) => { if (data) setAppointments(data) })
  }, [instance, weekStart])

  // Realtime para agendamentos
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`appointments-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setAppointments(prev => prev.filter(a => a.id !== p.old.id))
          } else if (p.new) {
            setAppointments(prev => {
              const exists = prev.find(a => a.id === p.new.id)
              if (exists) return prev.map(a => a.id === p.new.id ? p.new : a)
              return [...prev, p.new]
            })
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  function openNewAgenda() {
    setAgendaModal({
      name: '', color: AGENDA_COLORS[0],
      working_days: [1, 2, 3, 4, 5],
      start_time: '08:00', end_time: '18:00',
      slot_minutes: 30,
    })
    setAgendaErr('')
  }

  function openEditAgenda(a) {
    setAgendaModal({ ...a })
    setAgendaErr('')
  }

  async function handleSaveAgenda() {
    if (!agendaModal.name?.trim()) { setAgendaErr('Nome é obrigatório'); return }
    if (!agendaModal.working_days?.length) { setAgendaErr('Selecione ao menos um dia'); return }
    if (timeToMinutes(agendaModal.end_time) <= timeToMinutes(agendaModal.start_time)) {
      setAgendaErr('Horário final deve ser depois do inicial'); return
    }
    setSavingAgenda(true)
    const payload = {
      name: agendaModal.name.trim(),
      color: agendaModal.color,
      working_days: agendaModal.working_days,
      start_time: agendaModal.start_time,
      end_time: agendaModal.end_time,
      slot_minutes: agendaModal.slot_minutes,
      instancia: instance,
    }
    const { data, error } = agendaModal.id
      ? await supabase.from('agendas').update(payload).eq('id', agendaModal.id).select().single()
      : await supabase.from('agendas').insert(payload).select().single()
    setSavingAgenda(false)
    if (error) { setAgendaErr('Erro: ' + error.message); return }
    setAgendas(prev => {
      const exists = prev.find(a => a.id === data.id)
      if (exists) return prev.map(a => a.id === data.id ? data : a)
      return [...prev, data]
    })
    if (!selectedAgendaId) setSelectedAgendaId(data.id)
    setAgendaModal(null)
  }

  async function handleDeleteAgenda(id) {
    if (!confirm('Excluir esta agenda? Todos os agendamentos vinculados também serão excluídos.')) return
    await supabase.from('agendas').delete().eq('id', id)
    setAgendas(prev => prev.filter(a => a.id !== id))
    setAppointments(prev => prev.filter(a => a.agenda_id !== id))
    if (selectedAgendaId === id) setSelectedAgendaId(agendas.find(a => a.id !== id)?.id || null)
  }

  function openNewAppt(date, hhmm, prefill = {}) {
    if (!selectedAgendaId) return
    const ag = agendas.find(a => a.id === selectedAgendaId)
    setApptModal({
      agenda_id: selectedAgendaId,
      contact_nome: prefill.nome || '',
      contact_numero: prefill.numero || '',
      date: fmtDateInput(date),
      time: hhmm,
      duration_minutes: ag?.slot_minutes || 30,
      status: 'agendado',
      notes: '',
    })
    setApptErr('')
    setPatientHistory([])
  }

  // Pré-preenche pelo query param (vindo do botão "Agendar" no chat)
  useEffect(() => {
    const numero = searchParams.get('numero')
    const nome = searchParams.get('nome')
    if (numero && agendas.length && selectedAgendaId) {
      const now = new Date()
      const slot = now.getHours().toString().padStart(2, '0') + ':00'
      openNewAppt(now, slot, { numero, nome: nome || '' })
      setTab('calendario')
      searchParams.delete('numero'); searchParams.delete('nome')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, agendas, selectedAgendaId])

  // Carrega últimas mensagens do paciente quando o modal abre com número
  useEffect(() => {
    const num = apptModal?.contact_numero?.replace(/\D/g, '')
    if (!num || !instance) { setPatientHistory([]); return }
    setLoadingHistory(true)
    supabase.from('mensagens_geral').select('id, mensagem, type, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .like('numero', `${num}%`)
      .order('id', { ascending: false }).limit(5)
      .then(({ data }) => {
        if (data) setPatientHistory(data.reverse())
        setLoadingHistory(false)
      })
  }, [apptModal?.contact_numero, instance])

  function openEditAppt(a) {
    const d = new Date(a.starts_at)
    setApptModal({
      ...a,
      date: fmtDateInput(d),
      time: fmtTimeInput(d),
      _prevStatus: a.status,
    })
    setApptErr('')
    setPatientHistory([])
  }

  async function handleSaveAppt() {
    if (!apptModal.contact_nome?.trim()) { setApptErr('Nome do paciente é obrigatório'); return }
    if (!apptModal.date || !apptModal.time) { setApptErr('Data e hora são obrigatórios'); return }
    setSavingAppt(true)
    const startsAt = new Date(`${apptModal.date}T${apptModal.time}:00`)
    const numero = apptModal.contact_numero?.replace(/\D/g, '') || null
    const payload = {
      agenda_id: apptModal.agenda_id,
      instancia: instance,
      contact_nome: apptModal.contact_nome.trim(),
      contact_numero: numero,
      starts_at: startsAt.toISOString(),
      duration_minutes: parseInt(apptModal.duration_minutes) || 30,
      status: apptModal.status,
      notes: apptModal.notes?.trim() || null,
      created_by_email: session?.user?.email,
    }
    const isNew = !apptModal.id
    const prevStatus = apptModal._prevStatus
    const { error } = isNew
      ? await supabase.from('appointments').insert(payload)
      : await supabase.from('appointments').update(payload).eq('id', apptModal.id)
    setSavingAppt(false)
    if (error) { setApptErr('Erro: ' + error.message); return }

    // Registra evento na conversa do paciente (se tem número)
    if (numero) {
      const sessionId = `${numero}@s.whatsapp.net`
      const dateStr = startsAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const ag = agendas.find(a => a.id === payload.agenda_id)
      let msg = null
      if (isNew) {
        msg = `📅 Agendamento criado para ${dateStr}${ag ? ` — ${ag.name}` : ''}`
      } else if (prevStatus && prevStatus !== payload.status) {
        const labels = { agendado: 'Agendado', confirmado: 'Confirmado', concluido: 'Concluído', faltou: 'Faltou', cancelado: 'Cancelado' }
        msg = `📅 Agendamento de ${dateStr} alterado para: ${labels[payload.status] || payload.status}`
      } else {
        msg = `✏️ Agendamento atualizado para ${dateStr}`
      }
      if (msg) {
        await supabase.rpc('send_mensagem_geral', {
          p_instancia: instance,
          p_numero: sessionId,
          p_mensagem: msg,
          p_type: 'atendente',
          p_hora: new Date().toISOString(),
          p_base64: null,
        })
      }

      // Cancelamento: envia mensagem WhatsApp via webhook avisando o paciente
      if (!isNew && prevStatus !== 'cancelado' && payload.status === 'cancelado') {
        const aviso = `Olá ${payload.contact_nome.split(' ')[0]}, infelizmente seu agendamento de ${dateStr} foi cancelado. Em caso de dúvidas, entre em contato.`
        await supabase.rpc('send_mensagem_geral', {
          p_instancia: instance,
          p_numero: sessionId,
          p_mensagem: aviso,
          p_type: 'atendente',
          p_hora: new Date().toISOString(),
          p_base64: null,
        })
        fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: aviso,
            session_id: sessionId,
            phone: numero,
            instancia: instance,
            api_instancia: apiInstancia,
            company: session?.company?.name,
            sender_name: session?.user?.name,
            sender_email: session?.user?.email,
          }),
        }).catch(e => console.warn('webhook cancelamento:', e))
      }
    }
    setApptModal(null)
  }

  async function handleDeleteAppt() {
    if (!apptModal?.id) return
    if (!confirm('Excluir este agendamento?')) return
    await supabase.from('appointments').delete().eq('id', apptModal.id)
    setApptModal(null)
  }

  const selectedAgenda = agendas.find(a => a.id === selectedAgendaId)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Slots de horário com base na agenda selecionada
  const slots = useMemo(() => {
    if (!selectedAgenda) return []
    const start = timeToMinutes(selectedAgenda.start_time)
    const end = timeToMinutes(selectedAgenda.end_time)
    const step = selectedAgenda.slot_minutes
    const arr = []
    for (let m = start; m < end; m += step) arr.push(minutesToTime(m))
    return arr
  }, [selectedAgenda])

  function apptAt(day, hhmm) {
    if (!selectedAgenda) return null
    const slotMs = new Date(`${fmtDateInput(day)}T${hhmm}:00`).getTime()
    return appointments.find(a => {
      if (a.agenda_id !== selectedAgenda.id) return false
      return new Date(a.starts_at).getTime() === slotMs
    })
  }

  function isWorkingDay(day) {
    if (!selectedAgenda) return false
    return (selectedAgenda.working_days || []).includes(day.getDay())
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)' }}>Agenda</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading ? 'Carregando...' : `${agendas.length} agenda(s) — ${appointments.length} agendamento(s) nesta semana`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setTab('calendario')}
            className={tab === 'calendario' ? 'nx-btn-primary' : 'nx-btn-ghost'}
            style={{ fontSize: 12, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} /> Calendário
          </button>
          <button onClick={() => setTab('agendas')}
            className={tab === 'agendas' ? 'nx-btn-primary' : 'nx-btn-ghost'}
            style={{ fontSize: 12, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Settings size={13} /> Agendas
          </button>
        </div>
      </div>

      {tab === 'agendas' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="nx-btn-primary" onClick={openNewAgenda} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nova agenda
            </button>
          </div>
          {agendas.length === 0 ? (
            <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Calendar size={28} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 14 }}>Nenhuma agenda criada. Crie a primeira para começar a agendar.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {agendas.map(a => (
                <div key={a.id} className="nx-card"
                  style={{ padding: '1.1rem 1.25rem', cursor: 'pointer', transition: 'all 0.15s' }}
                  onClick={() => { setSelectedAgendaId(a.id); setTab('calendario') }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.boxShadow = `0 4px 12px ${a.color}22` }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: a.color }} />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button className="table-action" onClick={() => openEditAgenda(a)}>
                        <Pencil size={11} /> Editar
                      </button>
                      <button className="table-action danger" onClick={() => handleDeleteAgenda(a.id)}>
                        <Trash2 size={11} /> Excluir
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={12} /> {a.start_time?.slice(0, 5)} – {a.end_time?.slice(0, 5)} (slots de {a.slot_minutes} min)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {DAYS_OF_WEEK.map(d => (
                        <span key={d.num} style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                          background: (a.working_days || []).includes(d.num) ? a.color + '22' : '#F1F5F9',
                          color: (a.working_days || []).includes(d.num) ? a.color : '#94A3B8',
                          border: `1px solid ${(a.working_days || []).includes(d.num) ? a.color + '44' : 'var(--border)'}`,
                        }}>
                          {d.label}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedAgendaId(a.id); setTab('calendario') }}
                      style={{
                        marginTop: 4,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        background: a.color, color: '#fff', border: 'none',
                        borderRadius: 6, padding: '7px 12px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>
                      <Calendar size={12} /> Abrir agenda
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'calendario' && (
        <>
          {!agendas.length ? (
            <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Calendar size={28} style={{ opacity: 0.2 }} />
              <div style={{ fontSize: 14 }}>Crie ao menos uma agenda na aba "Agendas" para começar.</div>
              <button className="nx-btn-primary" onClick={() => setTab('agendas')} style={{ marginTop: 8 }}>Ir para Agendas</button>
            </div>
          ) : (
            <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Toolbar */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <select className="nx-select" style={{ fontSize: 13 }}
                  value={selectedAgendaId || ''} onChange={e => setSelectedAgendaId(e.target.value)}>
                  {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <button className="nx-btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setWeekStart(addDays(weekStart, -7))}>
                    <ChevronLeft size={14} />
                  </button>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 140, textAlign: 'center' }}>
                    {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}
                  </div>
                  <button className="nx-btn-ghost" style={{ padding: '6px 10px' }} onClick={() => setWeekStart(addDays(weekStart, 7))}>
                    <ChevronRight size={14} />
                  </button>
                  <button className="nx-btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setWeekStart(getMonday(new Date()))}>
                    Hoje
                  </button>
                </div>
              </div>

              {/* Grid */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 880 }}>
                  {/* Header dias */}
                  <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: '#F8FAFC' }}>
                    <div />
                    {weekDays.map((d, i) => {
                      const isToday = d.toDateString() === new Date().toDateString()
                      return (
                        <div key={i} style={{
                          padding: '8px 6px', textAlign: 'center', borderLeft: '1px solid var(--border)',
                          fontSize: 12, fontWeight: 600,
                          color: isToday ? '#2563EB' : 'var(--text-secondary)',
                          background: isToday ? '#EFF6FF' : 'transparent',
                        }}>
                          <div>{DAYS_OF_WEEK[d.getDay()].label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}</div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Slots */}
                  {slots.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      Configure horários nesta agenda.
                    </div>
                  ) : slots.map((hhmm, idx) => (
                    <div key={hhmm} style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)', borderBottom: idx === slots.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                      <div style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right', borderRight: '1px solid var(--border)' }}>
                        {hhmm}
                      </div>
                      {weekDays.map((d, i) => {
                        const working = isWorkingDay(d)
                        const appt = working ? apptAt(d, hhmm) : null
                        const status = appt ? STATUS_OPTIONS.find(s => s.value === appt.status) : null
                        return (
                          <div key={i}
                            onClick={() => working && (appt ? openEditAppt(appt) : openNewAppt(d, hhmm))}
                            style={{
                              minHeight: 46, borderLeft: '1px solid var(--border)',
                              background: !working ? '#F9FAFB' : 'transparent',
                              cursor: working ? 'pointer' : 'not-allowed',
                              padding: 3, position: 'relative',
                            }}
                            onMouseEnter={e => { if (working && !appt) e.currentTarget.style.background = '#EFF6FF' }}
                            onMouseLeave={e => { if (working && !appt) e.currentTarget.style.background = 'transparent' }}
                          >
                            {appt && status && (
                              <div style={{
                                background: status.color,
                                color: '#fff',
                                borderLeft: `3px solid ${status.color}`,
                                borderRadius: 5,
                                padding: '5px 8px',
                                fontSize: 11, fontWeight: 700, lineHeight: 1.3,
                                height: '100%',
                                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                overflow: 'hidden',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                              }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {appt.contact_nome}
                                </div>
                                <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>
                                  {hhmm} · {status.label}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal agenda */}
      {agendaModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 460, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{agendaModal.id ? 'Editar agenda' : 'Nova agenda'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setAgendaModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nome</label>
                <input className="nx-input" autoFocus placeholder="Ex: Dr. João — Cardiologia"
                  value={agendaModal.name} onChange={e => setAgendaModal(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Cor</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {AGENDA_COLORS.map(c => (
                    <button key={c} onClick={() => setAgendaModal(p => ({ ...p, color: c }))}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: agendaModal.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Dias de funcionamento</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS_OF_WEEK.map(d => {
                    const active = (agendaModal.working_days || []).includes(d.num)
                    return (
                      <button key={d.num}
                        onClick={() => setAgendaModal(p => ({
                          ...p,
                          working_days: active
                            ? p.working_days.filter(n => n !== d.num)
                            : [...(p.working_days || []), d.num].sort()
                        }))}
                        style={{
                          padding: '6px 12px', borderRadius: 20,
                          border: `1.5px solid ${active ? agendaModal.color : 'var(--border)'}`,
                          background: active ? agendaModal.color : 'transparent',
                          color: active ? '#fff' : 'var(--text-secondary)',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}>
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Início</label>
                  <input className="nx-input" type="time" value={agendaModal.start_time?.slice(0, 5) || '08:00'}
                    onChange={e => setAgendaModal(p => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Fim</label>
                  <input className="nx-input" type="time" value={agendaModal.end_time?.slice(0, 5) || '18:00'}
                    onChange={e => setAgendaModal(p => ({ ...p, end_time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Slot</label>
                  <select className="nx-select" value={agendaModal.slot_minutes}
                    onChange={e => setAgendaModal(p => ({ ...p, slot_minutes: parseInt(e.target.value) }))}>
                    {SLOT_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {agendaErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{agendaErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setAgendaModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveAgenda} disabled={savingAgenda}>
                  {savingAgenda ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Modal agendamento */}
      {apptModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{apptModal.id ? 'Editar agendamento' : 'Novo agendamento'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setApptModal(null)}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Agenda</label>
                <select className="nx-select" value={apptModal.agenda_id}
                  onChange={e => setApptModal(p => ({ ...p, agenda_id: e.target.value }))}>
                  {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nome do paciente</label>
                <input className="nx-input" autoFocus list="agenda-contact-list" placeholder="Digite ou escolha um contato salvo"
                  value={apptModal.contact_nome}
                  onChange={e => {
                    const value = e.target.value
                    const match = savedContacts.find(c => c.nome === value)
                    setApptModal(p => ({ ...p, contact_nome: value, contact_numero: match?.numero || p.contact_numero }))
                  }} />
                <datalist id="agenda-contact-list">
                  {savedContacts.map(c => <option key={c.id} value={c.nome}>{c.numero}</option>)}
                </datalist>
              </div>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input className="nx-input" placeholder="Ex: 5561991234567"
                  value={apptModal.contact_numero || ''}
                  onChange={e => setApptModal(p => ({ ...p, contact_numero: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Data</label>
                  <input className="nx-input" type="date" value={apptModal.date}
                    onChange={e => setApptModal(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Hora</label>
                  <input className="nx-input" type="time" value={apptModal.time}
                    onChange={e => setApptModal(p => ({ ...p, time: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Duração</label>
                  <input className="nx-input" type="number" min={5} step={5} value={apptModal.duration_minutes}
                    onChange={e => setApptModal(p => ({ ...p, duration_minutes: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STATUS_OPTIONS.map(s => {
                    const active = apptModal.status === s.value
                    return (
                      <button key={s.value}
                        onClick={() => setApptModal(p => ({ ...p, status: s.value }))}
                        style={{
                          padding: '5px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                          background: active ? s.bg : 'transparent',
                          color: active ? s.color : 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        <s.icon size={11} /> {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Observações (opcional)</label>
                <textarea className="nx-input" rows={2} placeholder="Anotações sobre este agendamento..."
                  value={apptModal.notes || ''}
                  onChange={e => setApptModal(p => ({ ...p, notes: e.target.value }))} />
              </div>

              {apptModal.contact_numero && (
                <div style={{
                  background: '#F8FAFC', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <History size={11} /> Últimas mensagens
                    </div>
                    <button onClick={() => navigate(`/painel/conversas?contact=${apptModal.contact_numero.replace(/\D/g, '')}`)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#16A34A', color: '#fff', border: 'none',
                        borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}>
                      <MessageSquare size={11} /> Abrir conversa
                    </button>
                  </div>
                  {loadingHistory ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Carregando histórico...</div>
                  ) : patientHistory.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Sem mensagens anteriores deste número.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {patientHistory.map(m => {
                        const t = (m.type || '').toLowerCase()
                        const isAt = t === 'atendente'
                        const isCli = t === 'cliente'
                        const txt = (m.mensagem || '').replace(/^\*[^*]+\*:\n/, '').trim().slice(0, 90)
                        return (
                          <div key={m.id} style={{
                            fontSize: 11, lineHeight: 1.4,
                            color: 'var(--text-secondary)',
                            paddingLeft: 6, borderLeft: `2px solid ${isAt ? '#16A34A' : isCli ? '#94A3B8' : '#2563EB'}`,
                          }}>
                            <strong style={{ color: isAt ? '#16A34A' : isCli ? '#475569' : '#2563EB' }}>
                              {isAt ? 'Atendente' : isCli ? 'Cliente' : 'IA'}:
                            </strong> {txt}{txt.length >= 90 ? '...' : ''}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {apptErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{apptErr}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                {apptModal.id && (
                  <button onClick={handleDeleteAppt}
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={13} /> Excluir
                  </button>
                )}
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setApptModal(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveAppt} disabled={savingAppt}>
                  {savingAppt ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'var(--text-muted)', marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '0.05em',
}
