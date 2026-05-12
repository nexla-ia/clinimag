import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../../components/ConfirmModal'
import LimitReachedModal from '../../components/LimitReachedModal'
import { getEffectiveLimits, reachedLimit, upgradeMessage, formatLimit } from '../../lib/planLimits'
import {
  Calendar, Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight,
  Clock, User as UserIcon, Phone, ListChecks, CheckCircle2, XCircle, AlertCircle, Settings,
  MessageSquare, History, Lock
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

/**
 * Normaliza número de WhatsApp pro formato da Evolution API.
 * O session_id da Evolution é "55<DDD><8 dígitos>@s.whatsapp.net" — sem o 9
 * extra que a Anatel mandou colocar em 2012. Se o usuário digitar com o 9,
 * a gente remove pra bater com o saved_contacts.
 *   "(69) 99269-5898"      → "556992695898"
 *   "5569992695898"        → "556992695898"  (remove 9 extra)
 *   "556992695898"         → "556992695898"  (já tá certo)
 *   "69992695898"          → "556992695898"  (sem 55, adiciona)
 */
function normalizeWhatsAppNumber(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (!d) return ''
  // Adiciona 55 se veio só com DDD + número (11 ou 10 dígitos)
  if (d.length === 11 || d.length === 10) d = '55' + d
  // Remove o 9 extra: 13 dígitos, começa com 55, e o 5º dígito é 9
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
    d = '55' + d.slice(2, 4) + d.slice(5)
  }
  return d
}

function formatPhoneDisplay(num) {
  const d = normalizeWhatsAppNumber(num)
  if (d.length !== 12) return num || ''
  return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
}

/**
 * Chave de busca por telefone — descarta 55 e 9 extra, pra match começar do DDD.
 * Usado nas sugestões da agenda: usuário digita "699926..." ou "5569992...",
 * ambos viram "69926..." e bate contra o saved_contacts.
 */
function phoneSearchKey(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('55') && d.length >= 4) d = d.slice(2)
  if (d.length >= 3 && d[2] === '9') d = d.slice(0, 2) + d.slice(3)
  return d
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
  const [chatContacts,  setChatContacts]  = useState([]) // contatos que já conversaram (de mensagens_geral)
  const [professionals, setProfessionals] = useState([])
  const [procedures, setProcedures]   = useState([])
  const [insurancePlans, setInsurancePlans] = useState([])
  const [procedurePrices, setProcedurePrices] = useState([])
  const [selectedAgendaId, setSelectedAgendaId] = useState(null)
  const [weekStart, setWeekStart]     = useState(getMonday(new Date()))
  const [loading, setLoading]         = useState(true)

  const [agendaModal, setAgendaModal] = useState(null)
  const [agendaErr, setAgendaErr]     = useState('')
  const [savingAgenda, setSavingAgenda] = useState(false)
  const [limitModal, setLimitModal]   = useState(null)

  const limits = getEffectiveLimits(session?.company)

  const [apptModal, setApptModal]     = useState(null)
  const [apptErr, setApptErr]         = useState('')
  const [savingAppt, setSavingAppt]   = useState(false)
  const [patientHistory, setPatientHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [confirmDeleteAgenda, setConfirmDeleteAgenda] = useState(null)
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(false)
  const [deletingNow, setDeletingNow] = useState(false)

  // Carrega agendas + agendamentos + contatos
  useEffect(() => {
    if (!instance) return
    setLoading(true)
    Promise.all([
      supabase.from('agendas').select('*').eq('instancia', instance).order('name'),
      supabase.from('saved_contacts').select('id, nome, numero').eq('instancia', instance).order('nome'),
      supabase.from('professionals').select('*').eq('instancia', instance).order('name'),
      supabase.from('procedures').select('*').eq('instancia', instance).order('name'),
      supabase.from('insurance_plans').select('*').eq('instancia', instance).order('name'),
      supabase.from('procedure_prices').select('*'),
      // Números que já conversaram (mensagens_geral) — pega só os 500 mais recentes
      // pra não puxar o banco inteiro; dedup vem no JS
      supabase.from('mensagens_geral').select('numero, created_at').eq('instancia', instance)
        .order('created_at', { ascending: false }).limit(500),
    ]).then(([{ data: ag }, { data: sc }, { data: pros }, { data: procs }, { data: plans }, { data: prices }, { data: mg }]) => {
      if (ag) {
        setAgendas(ag)
        if (!selectedAgendaId && ag.length) setSelectedAgendaId(ag[0].id)
      }
      if (sc) setSavedContacts(sc)
      if (pros) setProfessionals(pros.filter(p => p.active !== false))
      if (procs) setProcedures(procs.filter(p => p.active !== false))
      if (plans) setInsurancePlans(plans.filter(p => p.active !== false))
      if (prices) setProcedurePrices(prices)

      // Monta lista de contatos distintos da mensagens_geral (mais recente primeiro),
      // merging com saved_contacts pra trazer o nome quando existir.
      if (mg) {
        const nameByNumber = {}
        ;(sc || []).forEach(c => {
          const k = normalizeWhatsAppNumber(c.numero)
          if (k) nameByNumber[k] = c.nome
        })
        const seen = new Set()
        const list = []
        mg.forEach(r => {
          const norm = normalizeWhatsAppNumber(r.numero)
          if (!norm || norm.length < 10) return
          // Ignora session_ids de grupos (@g.us)
          if ((r.numero || '').includes('@g.us')) return
          if (seen.has(norm)) return
          seen.add(norm)
          list.push({
            numero: norm,
            nome:   nameByNumber[norm] || null, // pode ser null = sem cadastro
            saved:  !!nameByNumber[norm],
            lastTs: r.created_at,
          })
        })
        setChatContacts(list)
      }

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
    if (reachedLimit(agendas.length, limits.agendas)) {
      setLimitModal(upgradeMessage('agendas', limits.agendas, limits.plan))
      return
    }
    setAgendaModal({
      name: '', color: AGENDA_COLORS[0],
      working_days: [1, 2, 3, 4, 5],
      start_time: '08:00', end_time: '18:00',
      slot_minutes: 30,
      professional_id: null,
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
      professional_id: agendaModal.professional_id || null,
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

  function handleDeleteAgenda(agenda) {
    setConfirmDeleteAgenda(agenda)
  }
  async function confirmDeleteAgendaAction() {
    if (!confirmDeleteAgenda) return
    setDeletingNow(true)
    const id = confirmDeleteAgenda.id
    await supabase.from('agendas').delete().eq('id', id)
    setAgendas(prev => prev.filter(a => a.id !== id))
    setAppointments(prev => prev.filter(a => a.agenda_id !== id))
    if (selectedAgendaId === id) setSelectedAgendaId(agendas.find(a => a.id !== id)?.id || null)
    setDeletingNow(false)
    setConfirmDeleteAgenda(null)
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
      professional_id: ag?.professional_id || null,
      procedure_id: null,
      insurance_plan_id: null,
      price: 0,
      payment_status: 'pendente',
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
      _prevStartsAt: a.starts_at,
    })
    setApptErr('')
    setPatientHistory([])
  }

  async function handleSaveAppt() {
    if (!apptModal.contact_nome?.trim()) { setApptErr('Nome do paciente é obrigatório'); return }
    if (!apptModal.date || !apptModal.time) { setApptErr('Data e hora são obrigatórios'); return }
    const startsAt = new Date(`${apptModal.date}T${apptModal.time}:00`)
    const duration = parseInt(apptModal.duration_minutes) || 30
    const endsAt = new Date(startsAt.getTime() + duration * 60000)

    // Validação: dia/horário do profissional
    if (apptModal.professional_id) {
      const pro = professionals.find(p => p.id === apptModal.professional_id)
      if (pro) {
        const dayOfWeek = startsAt.getDay()
        const workingDays = pro.working_days || [1, 2, 3, 4, 5]
        if (!workingDays.includes(dayOfWeek)) {
          const dayLabel = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dayOfWeek]
          setApptErr(`${pro.name} não atende ${dayLabel.toLowerCase()}. Dias disponíveis: ${workingDays.map(d => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]).join(', ')}`)
          return
        }
        const apptStart = startsAt.getHours() * 60 + startsAt.getMinutes()
        const apptEnd = apptStart + duration
        const proStart = parseInt(pro.start_time?.split(':')[0] || 8) * 60 + parseInt(pro.start_time?.split(':')[1] || 0)
        const proEnd = parseInt(pro.end_time?.split(':')[0] || 18) * 60 + parseInt(pro.end_time?.split(':')[1] || 0)
        if (apptStart < proStart || apptEnd > proEnd) {
          setApptErr(`${pro.name} atende das ${pro.start_time?.slice(0,5)} às ${pro.end_time?.slice(0,5)}. Horário fora do expediente.`)
          return
        }
        // Validação: intervalo (pausa/almoço)
        if (pro.break_start && pro.break_end) {
          const breakStart = parseInt(pro.break_start.split(':')[0]) * 60 + parseInt(pro.break_start.split(':')[1] || 0)
          const breakEnd = parseInt(pro.break_end.split(':')[0]) * 60 + parseInt(pro.break_end.split(':')[1] || 0)
          if (apptStart < breakEnd && breakStart < apptEnd) {
            setApptErr(`${pro.name} está em intervalo das ${pro.break_start.slice(0,5)} às ${pro.break_end.slice(0,5)}. Escolha outro horário.`)
            return
          }
        }
      }

      // Validação: conflito com outro agendamento do mesmo profissional
      const conflict = appointments.find(a => {
        if (a.id === apptModal.id) return false
        if (a.professional_id !== apptModal.professional_id) return false
        if (a.status === 'cancelado') return false
        const aStart = new Date(a.starts_at).getTime()
        const aEnd = aStart + (a.duration_minutes || 30) * 60000
        return startsAt.getTime() < aEnd && aStart < endsAt.getTime()
      })
      if (conflict) {
        const cStart = new Date(conflict.starts_at)
        const cTime = cStart.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        setApptErr(`Conflito de horário: ${conflict.contact_nome} já está marcado às ${cTime} com este profissional.`)
        return
      }
    }

    setSavingAppt(true)
    const numero = normalizeWhatsAppNumber(apptModal.contact_numero) || null
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
    // Auto-marcar como pago se status virou 'concluido'
    let paymentStatus = apptModal.payment_status || 'pendente'
    let paidAt = apptModal.paid_at || null
    if (apptModal.status === 'concluido' && paymentStatus !== 'pago') {
      paymentStatus = 'pago'
      paidAt = new Date().toISOString()
    }

    payload.professional_id = apptModal.professional_id || null
    payload.procedure_id = apptModal.procedure_id || null
    payload.insurance_plan_id = apptModal.insurance_plan_id || null
    payload.price = parseFloat(apptModal.price) || 0
    payload.payment_status = paymentStatus
    payload.paid_at = paidAt

    const isNew = !apptModal.id
    const prevStatus = apptModal._prevStatus
    const prevStartsAt = apptModal._prevStartsAt
    const { error } = isNew
      ? await supabase.from('appointments').insert(payload)
      : await supabase.from('appointments').update(payload).eq('id', apptModal.id)
    setSavingAppt(false)
    if (error) { setApptErr('Erro: ' + error.message); return }

    // ─── Mensagens automáticas pro paciente (chat interno + WhatsApp) ─────
    if (numero) {
      const sessionId = `${numero}@s.whatsapp.net`
      const dateStr   = startsAt.toLocaleString('pt-BR',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const firstName = (payload.contact_nome || '').split(' ')[0] || 'tudo bem'
      const dateChanged = !isNew && prevStartsAt &&
        new Date(prevStartsAt).getTime() !== startsAt.getTime()
      const statusChanged = !isNew && prevStatus && prevStatus !== payload.status

      // Texto patient-friendly por tipo de evento
      let patientMsg = null
      if (isNew && payload.status !== 'cancelado') {
        patientMsg = `Olá ${firstName}! 📅 Seu agendamento foi marcado para *${dateStr}*. Qualquer dúvida é só responder aqui!`
      } else if (statusChanged && payload.status === 'cancelado') {
        patientMsg = `Olá ${firstName}, infelizmente seu agendamento de ${dateStr} foi cancelado. Em caso de dúvidas, entre em contato.`
      } else if (statusChanged && payload.status === 'confirmado') {
        patientMsg = `Olá ${firstName}! ✅ Seu agendamento de *${dateStr}* está confirmado. Até lá!`
      } else if (dateChanged && payload.status !== 'cancelado') {
        const prevStr = new Date(prevStartsAt).toLocaleString('pt-BR',
          { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        patientMsg = `Olá ${firstName}! ✏️ Seu agendamento foi remarcado de ${prevStr} para *${dateStr}*. Se não puder, me avisa por aqui!`
      }
      // concluído / faltou: nenhum envio (são eventos pós-consulta)

      if (patientMsg) {
        // 1) Loga no chat interno (aparece na thread de Conversas)
        await supabase.rpc('send_mensagem_geral', {
          p_instancia: instance,
          p_numero:    sessionId,
          p_mensagem:  patientMsg,
          p_type:      'atendente',
          p_hora:      new Date().toISOString(),
          p_base64:    null,
        })

        // 2) Dispara pelo webhook do n8n → Evolution → WhatsApp do paciente
        fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message:        patientMsg,
            session_id:     sessionId,
            phone:          numero,
            instancia:      instance,
            api_instancia:  apiInstancia,
            company:        session?.company?.name,
            sender_name:    session?.user?.name,
            sender_email:   session?.user?.email,
          }),
        }).catch(e => console.warn('webhook agendamento:', e))
      }
    }
    setApptModal(null)
  }

  function handleDeleteAppt() {
    if (!apptModal?.id) return
    setConfirmDeleteAppt(true)
  }
  async function confirmDeleteApptAction() {
    if (!apptModal?.id) return
    setDeletingNow(true)
    await supabase.from('appointments').delete().eq('id', apptModal.id)
    setDeletingNow(false)
    setConfirmDeleteAppt(false)
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
    const slotStart = new Date(`${fmtDateInput(day)}T${hhmm}:00`).getTime()
    const slotEnd   = slotStart + (selectedAgenda.slot_minutes || 30) * 60_000
    // Aceita agendamento cujo starts_at cai DENTRO do intervalo do slot
    // (não exige match exato — agendamento às 17:01 aparece no slot 17:00 de 30min).
    return appointments.find(a => {
      if (a.agenda_id !== selectedAgenda.id) return false
      const t = new Date(a.starts_at).getTime()
      return t >= slotStart && t < slotEnd
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              {agendas.length} de {formatLimit(limits.agendas)} agendas
              {reachedLimit(agendas.length, limits.agendas) && <span style={{ marginLeft: 8, color: '#C9A074', fontWeight: 700 }}>· limite atingido</span>}
            </div>
            <button
              className="nx-btn-primary"
              onClick={openNewAgenda}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: reachedLimit(agendas.length, limits.agendas) ? 0.7 : 1,
              }}>
              {reachedLimit(agendas.length, limits.agendas) ? <Lock size={13} /> : <Plus size={14} />} Nova agenda
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
                      <button className="table-action danger" onClick={() => handleDeleteAgenda(a)}>
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
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => setTab('agendas')}
                  className="nx-btn-ghost"
                  title="Ver todas as agendas"
                  style={{ fontSize: 12, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ChevronLeft size={14} /> Agendas
                </button>
                <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
                {selectedAgenda && (
                  <span aria-hidden="true" style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: selectedAgenda.color,
                    boxShadow: `0 0 0 3px ${selectedAgenda.color}22`,
                  }} />
                )}
                <select className="nx-select" style={{ fontSize: 13, fontWeight: 600 }}
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
              {professionals.length > 0 && (
                <div>
                  <label style={labelStyle}>Profissional vinculado (opcional)</label>
                  <select className="nx-select" value={agendaModal.professional_id || ''}
                    onChange={e => setAgendaModal(p => ({ ...p, professional_id: e.target.value || null }))}>
                    <option value="">Sem profissional vinculado</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` — ${p.specialty}` : ''}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Quando vinculado, os procedimentos do profissional + da clínica ficam disponíveis no agendamento.
                  </div>
                </div>
              )}
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

      <ConfirmModal
        open={!!confirmDeleteAgenda}
        variant="delete"
        title="Excluir agenda"
        message={`Tem certeza que deseja excluir a agenda "${confirmDeleteAgenda?.name || ''}"? Todos os agendamentos vinculados serão removidos. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir agenda"
        loading={deletingNow}
        onConfirm={confirmDeleteAgendaAction}
        onCancel={() => setConfirmDeleteAgenda(null)}
      />

      <ConfirmModal
        open={confirmDeleteAppt}
        variant="delete"
        title="Excluir agendamento"
        message="Tem certeza que deseja excluir este agendamento? Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={deletingNow}
        onConfirm={confirmDeleteApptAction}
        onCancel={() => setConfirmDeleteAppt(false)}
      />

      <LimitReachedModal
        open={!!limitModal}
        title={limitModal?.title}
        body={limitModal?.body}
        cta={limitModal?.cta}
        planName={limits.plan}
        onClose={() => setLimitModal(null)}
      />

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
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Telefone</label>
                <input className="nx-input" placeholder="Ex: (69) 99269-5898"
                  value={apptModal.contact_numero || ''}
                  onChange={e => setApptModal(p => ({ ...p, contact_numero: e.target.value }))}
                  onBlur={e => {
                    // Ao sair do campo, normaliza pro formato Evolution (sem o 9 extra)
                    const norm = normalizeWhatsAppNumber(e.target.value)
                    if (norm && norm !== e.target.value.replace(/\D/g, '')) {
                      setApptModal(p => ({ ...p, contact_numero: norm }))
                    }
                  }} />
                {(() => {
                  const typedKey = phoneSearchKey(apptModal.contact_numero)
                  if (typedKey.length < 2) return null
                  // chatContacts já vem ordenado por mais recente
                  const matches = chatContacts
                    .filter(c => phoneSearchKey(c.numero).startsWith(typedKey))
                    .slice(0, 6)
                  // Match exato — quando o número digitado bate certinho com alguém
                  const normTyped = normalizeWhatsAppNumber(apptModal.contact_numero)
                  const exact = normTyped && normTyped.length >= 11
                    ? chatContacts.find(c => c.numero === normTyped)
                    : null
                  if (matches.length === 0 && !exact) return null
                  return (
                    <>
                      {exact && (
                        <div style={{
                          marginTop: 6, padding: '6px 10px',
                          background: '#ECFDF5', border: '1px solid #A7F3D0',
                          borderRadius: 8, fontSize: 11.5, color: '#065F46',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>
                          <CheckCircle2 size={11} /> Esse contato já conversou com você
                          {exact.nome ? ` (${exact.nome})` : ' (sem cadastro)'}
                        </div>
                      )}
                      {matches.length > 0 && !exact && (
                        <div style={{
                          marginTop: 6,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, overflow: 'hidden',
                          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                        }}>
                          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                            textTransform: 'uppercase', color: 'var(--text-muted)',
                            background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                            Contatos que já conversaram com você
                          </div>
                          {matches.map(c => (
                            <button key={c.numero} type="button"
                              onClick={() => setApptModal(p => ({
                                ...p,
                                contact_nome: p.contact_nome || c.nome || '',
                                contact_numero: c.numero,
                              }))}
                              style={{
                                width: '100%', textAlign: 'left',
                                padding: '8px 10px',
                                background: 'transparent', border: 'none',
                                borderBottom: '1px solid #F1F5F9', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                                fontFamily: 'inherit',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                {c.nome ? (
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.nome}
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                    textTransform: 'uppercase', color: '#94A3B8',
                                    background: '#F1F5F9', padding: '2px 7px', borderRadius: 999,
                                  }}>
                                    Sem cadastro
                                  </span>
                                )}
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatPhoneDisplay(c.numero)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
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

              {professionals.length > 0 && (
                <div>
                  <label style={labelStyle}>Profissional</label>
                  <select className="nx-select" value={apptModal.professional_id || ''}
                    onChange={e => setApptModal(p => ({ ...p, professional_id: e.target.value || null, procedure_id: null }))}>
                    <option value="">— Selecione —</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` — ${p.specialty}` : ''}</option>)}
                  </select>
                </div>
              )}

              {procedures.length > 0 && (
                <div>
                  <label style={labelStyle}>Procedimento / Consulta / Exame</label>
                  <select className="nx-select" value={apptModal.procedure_id || ''}
                    onChange={e => {
                      const procId = e.target.value || null
                      const proc = procedures.find(x => x.id === procId)
                      // Auto-preenche valor (do convênio se houver, senão particular) e duração
                      let newPrice = apptModal.price
                      let newDuration = apptModal.duration_minutes
                      if (proc) {
                        newDuration = proc.duration_minutes || newDuration
                        const planId = apptModal.insurance_plan_id
                        const priceRow = planId ? procedurePrices.find(pr => pr.procedure_id === procId && pr.insurance_plan_id === planId) : null
                        newPrice = priceRow?.price ?? proc.price_particular ?? 0
                      }
                      setApptModal(p => ({ ...p, procedure_id: procId, price: newPrice, duration_minutes: newDuration }))
                    }}>
                    <option value="">— Selecione —</option>
                    {procedures
                      .filter(pr => !apptModal.professional_id || !pr.professional_id || pr.professional_id === apptModal.professional_id)
                      .map(pr => <option key={pr.id} value={pr.id}>{pr.name} ({pr.duration_minutes} min)</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Forma</label>
                  <select className="nx-select" value={apptModal.insurance_plan_id || ''}
                    onChange={e => {
                      const planId = e.target.value || null
                      const procId = apptModal.procedure_id
                      let newPrice = apptModal.price
                      if (procId) {
                        const proc = procedures.find(x => x.id === procId)
                        const priceRow = planId ? procedurePrices.find(pr => pr.procedure_id === procId && pr.insurance_plan_id === planId) : null
                        newPrice = priceRow?.price ?? proc?.price_particular ?? 0
                      }
                      setApptModal(p => ({ ...p, insurance_plan_id: planId, price: newPrice }))
                    }}>
                    <option value="">Particular</option>
                    {insurancePlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Valor (R$)</label>
                  <input className="nx-input" type="number" step="0.01" min={0}
                    value={apptModal.price ?? 0}
                    onChange={e => setApptModal(p => ({ ...p, price: e.target.value }))} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Pagamento</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { value: 'pendente', label: 'Pendente', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                    { value: 'pago',     label: 'Pago',     color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
                    { value: 'cancelado', label: 'Cancelado', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
                  ].map(s => {
                    const active = apptModal.payment_status === s.value
                    return (
                      <button key={s.value}
                        onClick={() => setApptModal(p => ({ ...p, payment_status: s.value, paid_at: s.value === 'pago' ? new Date().toISOString() : null }))}
                        style={{
                          flex: 1, padding: '7px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                          border: `1.5px solid ${active ? s.color : 'var(--border)'}`,
                          background: active ? s.bg : 'transparent',
                          color: active ? s.color : 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}>
                        {s.label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Marcar status do agendamento como "Concluído" também marca o pagamento como Pago automaticamente.
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
