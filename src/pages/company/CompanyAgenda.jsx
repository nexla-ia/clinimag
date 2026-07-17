import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchDistinctGrupos } from '../../lib/queries'
import ConfirmModal from '../../components/ConfirmModal'
import LimitReachedModal from '../../components/LimitReachedModal'
import { getEffectiveLimits, reachedLimit, upgradeMessage, formatLimit } from '../../lib/planLimits'
import {
  Calendar, Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight,
  Clock, User as UserIcon, Phone, ListChecks, CheckCircle2, XCircle, AlertCircle, Settings,
  MessageSquare, History, Lock, Repeat, FileText, Users, Bell
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

// Antecedências de lembrete (em minutos)
const REMINDER_OFFSETS = [
  { value: 120,   label: '2h antes' },
  { value: 1440,  label: '1 dia antes' },
  { value: 2880,  label: '2 dias antes' },
  { value: 10080, label: '7 dias antes' },
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
// Soma meses travando no último dia do mês (evita 31/jan +1 virar 03/mar)
function addMonthsClamp(date, n) {
  const d = new Date(date); const day = d.getDate()
  d.setDate(1); d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last)); return d
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

// Converte UTC timestamp para data/hora na timezone da clínica (independente do browser)
function toClinicTz(dateOrStr, tzOffset) {
  const tz = tzOffset || '-03:00'
  const sign = tz[0] === '-' ? -1 : 1
  const [h, m] = tz.slice(1).split(':').map(Number)
  const shifted = new Date(new Date(dateOrStr).getTime() + sign * (h * 60 + m) * 60000)
  const yr  = shifted.getUTCFullYear()
  const mo  = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hh  = String(shifted.getUTCHours()).padStart(2, '0')
  const mm  = String(shifted.getUTCMinutes()).padStart(2, '0')
  return { dateStr: `${yr}-${mo}-${day}`, timeStr: `${hh}:${mm}` }
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
  const [availableGroups, setAvailableGroups] = useState([]) // grupos WhatsApp da instância
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
  const [reminderPresets, setReminderPresets] = useState([])
  const [savePresetOpen, setSavePresetOpen]   = useState(false)
  const [presetName, setPresetName]           = useState('')
  const [patientHistory, setPatientHistory] = useState([])
  const [patientAppts, setPatientAppts] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [confirmDeleteAgenda, setConfirmDeleteAgenda] = useState(null)
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState(false)
  const [deletingNow, setDeletingNow] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverSlot, setDragOverSlot] = useState(null)
  const [ctxMenu, setCtxMenu] = useState(null) // { x, y, appt }
  const [confirmDeleteApptDirect, setConfirmDeleteApptDirect] = useState(null)
  const [seriesDelete, setSeriesDelete] = useState(null) // { appt, count, fromModal }
  const [recipSearch, setRecipSearch] = useState('')
  const [useCustomMsg, setUseCustomMsg] = useState(false)
  const [customMsg, setCustomMsg] = useState('')

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
      supabase.from('mensagens_geral').select('numero, created_at').eq('instancia', instance)
        .order('created_at', { ascending: false }).limit(500),
      // Grupos da instância
      fetchDistinctGrupos(instance),
    ]).then(([{ data: ag }, { data: sc }, { data: pros }, { data: procs }, { data: plans }, { data: prices }, { data: mg }, grps]) => {
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

      if (grps) {
        const seenG = new Set()
        const groupList = []
        for (const row of grps) {
          if (!row.idgrupo || seenG.has(row.idgrupo)) continue
          seenG.add(row.idgrupo)
          groupList.push({ idgrupo: row.idgrupo, nomegrupo: row.nomegrupo || row.idgrupo.replace('@g.us', '') })
        }
        setAvailableGroups(groupList)
      }

      setLoading(false)
    })
  }, [instance])

  // Padrões de lembrete da empresa (graceful: tabela pode não existir ainda)
  useEffect(() => {
    if (!instance) return
    supabase.from('reminder_presets').select('*').eq('instancia', instance).order('created_at')
      .then(({ data, error }) => { if (!error && data) setReminderPresets(data) })
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

  // Fecha context menu ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!ctxMenu) return
    function close() { setCtxMenu(null) }
    function onKey(e) { if (e.key === 'Escape') setCtxMenu(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [!!ctxMenu])

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
      extra_recipients: [],
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
      recurrence: null,
      recurrence_count: 4,
      recurrence_weekdays: [],
      recurrence_mode: 'meses',
      recurrence_months: 3,
      // Lembretes: começa com o padrão marcado como default (se houver)
      reminder_offsets: (reminderPresets.find(p => p.is_default)?.offsets) || [],
    })
    setApptErr('')
    setPatientHistory([])
    setSavePresetOpen(false)
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

  // Carrega últimas mensagens + agendamentos anteriores do paciente quando o modal abre
  useEffect(() => {
    const normNum = normalizeWhatsAppNumber(apptModal?.contact_numero)
    if (!normNum || normNum.length < 10 || !instance) {
      setPatientHistory([])
      setPatientAppts([])
      return
    }
    setLoadingHistory(true)
    Promise.all([
      supabase.from('mensagens_geral').select('id, mensagem, type, "horaLastMessage", created_at')
        .eq('instancia', instance)
        .like('numero', `${normNum}%`)
        .order('id', { ascending: false }).limit(5),
      supabase.from('appointments').select('id, starts_at, status, procedure_id, notes, prontuario, prontuario_at, prontuario_by')
        .eq('instancia', instance)
        .eq('contact_numero', normNum)
        .order('starts_at', { ascending: false }).limit(20),
    ]).then(([{ data: mgs }, { data: aps }]) => {
      if (mgs) setPatientHistory(mgs.reverse())
      if (aps) setPatientAppts(aps.filter(a => a.id !== apptModal?.id))
      setLoadingHistory(false)
    })
  }, [apptModal?.contact_numero, instance])

  function openEditAppt(a) {
    const tz = session?.company?.timezone || '-03:00'
    const { dateStr, timeStr } = toClinicTz(a.starts_at, tz)
    setApptModal({
      ...a,
      extra_recipients: a.extra_recipients || [],
      date: dateStr,
      time: timeStr,
      _prevStatus: a.status,
      _prevStartsAt: a.starts_at,
      reminder_offsets: Array.isArray(a.reminders) ? a.reminders.map(r => r.offset_minutes) : [],
      _prevReminders: Array.isArray(a.reminders) ? a.reminders : [],
    })
    setApptErr('')
    setPatientHistory([])
    setPatientAppts([])
    setSavePresetOpen(false)
  }

  function toggleReminderOffset(off) {
    setApptModal(p => {
      const cur = p.reminder_offsets || []
      return { ...p, reminder_offsets: cur.includes(off) ? cur.filter(x => x !== off) : [...cur, off].sort((a, b) => a - b) }
    })
  }

  async function handleSaveReminderPreset(makeDefault) {
    const offsets = apptModal?.reminder_offsets || []
    if (!offsets.length) return
    const name = presetName.trim() || `Padrão (${offsets.map(o => REMINDER_OFFSETS.find(r => r.value === o)?.label || o).join(', ')})`
    if (makeDefault) {
      await supabase.from('reminder_presets').update({ is_default: false }).eq('instancia', instance)
    }
    const { data, error } = await supabase.from('reminder_presets')
      .insert({ instancia: instance, name, offsets, is_default: !!makeDefault })
      .select('*').single()
    if (error) {
      setApptErr(/reminder_presets/.test(error.message) ? 'Falta rodar a migration reminder_presets no Supabase.' : 'Erro: ' + error.message)
      return
    }
    setReminderPresets(prev => [...(makeDefault ? prev.map(p => ({ ...p, is_default: false })) : prev), data])
    setSavePresetOpen(false)
    setPresetName('')
  }

  async function handleDeletePreset(id) {
    await supabase.from('reminder_presets').delete().eq('id', id)
    setReminderPresets(prev => prev.filter(p => p.id !== id))
  }

  async function handleSaveAppt() {
    if (!apptModal.contact_nome?.trim()) { setApptErr('Nome do paciente é obrigatório'); return }
    if (!apptModal.date || !apptModal.time) { setApptErr('Data e hora são obrigatórios'); return }
    // Ancora o horário ao fuso da clínica, não do browser
    const tz = session?.company?.timezone || '-03:00'
    const startsAt = new Date(`${apptModal.date}T${apptModal.time}:00${tz}`)
    const duration = parseInt(apptModal.duration_minutes) || 30
    const endsAt = new Date(startsAt.getTime() + duration * 60000)

    // Dia da semana no fuso da clínica (não do browser)
    function dayInTz(date) {
      const sign = tz[0] === '-' ? -1 : 1
      const [h, m] = tz.slice(1).split(':').map(Number)
      return new Date(date.getTime() + sign * (h * 60 + m) * 60000).getUTCDay()
    }

    // Vários pacientes no mesmo horário são permitidos (turmas de pilates,
    // vários profissionais atendendo ao mesmo tempo) — não bloqueia mais
    // por horário repetido, nem na agenda nem por profissional.

    // Validação: dia/horário do profissional
    if (apptModal.professional_id) {
      const pro = professionals.find(p => p.id === apptModal.professional_id)
      if (pro) {
        const dayOfWeek = dayInTz(startsAt)
        const workingDays = pro.working_days || [1, 2, 3, 4, 5]
        if (!workingDays.includes(dayOfWeek)) {
          const dayLabel = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dayOfWeek]
          setApptErr(`${pro.name} não atende ${dayLabel.toLowerCase()}. Dias disponíveis: ${workingDays.map(d => ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d]).join(', ')}`)
          return
        }
        const { timeStr: apptTimeStr } = toClinicTz(startsAt, tz)
        const [apptH, apptM] = apptTimeStr.split(':').map(Number)
        const apptStart = apptH * 60 + apptM
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
      // (Sem bloqueio de conflito por profissional — turma/atendimento
      //  simultâneo é permitido.)
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
      prontuario: apptModal.prontuario?.trim() || null,
      prontuario_at: apptModal.prontuario?.trim()
        ? (apptModal.prontuario_at || new Date().toISOString())
        : null,
      prontuario_by: apptModal.prontuario?.trim()
        ? (session?.user?.name || session?.user?.email || null)
        : null,
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
    payload.extra_recipients = apptModal.extra_recipients?.length ? apptModal.extra_recipients : null
    payload.price = parseFloat(apptModal.price) || 0
    payload.payment_status = paymentStatus
    payload.paid_at = paidAt

    // Lembretes: monta a lista preservando o sent_at dos que já foram enviados
    // (na edição), pra não reenviar um aviso já disparado.
    const prevRem = apptModal._prevReminders || []
    payload.reminders = (apptModal.reminder_offsets || []).map(off => {
      const existing = prevRem.find(r => r.offset_minutes === off)
      return { offset_minutes: off, sent_at: existing?.sent_at || null }
    })

    const isNew = !apptModal.id
    const prevStatus = apptModal._prevStatus
    const prevStartsAt = apptModal._prevStartsAt

    // Recorrência: marca o base e todos os derivados com o mesmo id, para
    // depois ser possível excluir a série inteira de uma vez.
    if (isNew && apptModal.recurrence) {
      payload.recurrence_group_id = (crypto.randomUUID?.() || null)
    }

    const doSave = () => isNew
      ? supabase.from('appointments').insert(payload)
      : supabase.from('appointments').update(payload).eq('id', apptModal.id)

    let { error } = await doSave()

    // Se a migration dos lembretes ainda não rodou, salva sem eles
    if (error && payload.reminders && /reminders/i.test(error.message || '')) {
      delete payload.reminders
      ;({ error } = await doSave())
    }
    // Se a migration da série ainda não rodou, salva sem o vínculo em vez de
    // travar o agendamento (a série só perde o "excluir todos").
    if (error && payload.recurrence_group_id && /recurrence_group_id/i.test(error.message || '')) {
      delete payload.recurrence_group_id
      ;({ error } = await supabase.from('appointments').insert(payload))
    }
    setSavingAppt(false)
    if (error) { setApptErr('Erro: ' + error.message); return }

    // Agendamentos recorrentes (somente ao criar)
    if (isNew && apptModal.recurrence) {
      const rec = apptModal.recurrence
      const mode = apptModal.recurrence_mode || 'ocorrencias'
      const extras = []
      const hh = startsAt.getHours(), mm = startsAt.getMinutes()

      if (rec === 'mensal') {
        const total = mode === 'meses'
          ? Math.max(1, parseInt(apptModal.recurrence_months) || 1)
          : Math.max(2, parseInt(apptModal.recurrence_count) || 2)
        for (let i = 1; i < total; i++) {
          extras.push({ ...payload, starts_at: addMonthsClamp(startsAt, i).toISOString() })
        }
      } else {
        // Semanal / Quinzenal — pode ter vários dias na semana (ex.: 3x/semana)
        let weekdays = (apptModal.recurrence_weekdays?.length ? [...apptModal.recurrence_weekdays] : [startsAt.getDay()])
        if (!weekdays.includes(startsAt.getDay())) weekdays.push(startsAt.getDay())
        weekdays = [...new Set(weekdays)].sort((a, b) => a - b)

        const maxOcc = mode === 'ocorrencias' ? Math.max(2, parseInt(apptModal.recurrence_count) || 2) : Infinity
        const end = mode === 'meses' ? addMonthsClamp(startsAt, Math.max(1, parseInt(apptModal.recurrence_months) || 1)) : null
        const weekInc = rec === 'quinzenal' ? 2 : 1

        // domingo da semana do agendamento base
        const week0 = new Date(startsAt); week0.setHours(0, 0, 0, 0); week0.setDate(week0.getDate() - week0.getDay())
        let occ = 1 // o agendamento base já conta
        for (let w = 0; w < 520; w += weekInc) {
          const weekStart = new Date(week0); weekStart.setDate(weekStart.getDate() + w * 7)
          if (end && weekStart >= end) break
          for (const wd of weekdays) {
            const day = new Date(week0); day.setDate(day.getDate() + w * 7 + wd); day.setHours(hh, mm, 0, 0)
            if (day.getTime() <= startsAt.getTime()) continue   // pula o próprio base e datas passadas
            if (end && day >= end) continue
            if (occ >= maxOcc) break
            extras.push({ ...payload, starts_at: day.toISOString() })
            occ++
          }
          if (occ >= maxOcc) break
        }
      }
      // insere em blocos (pode ser muita coisa: 3x/sem x 3 meses ≈ 39)
      for (let i = 0; i < extras.length; i += 200) {
        await supabase.from('appointments').insert(extras.slice(i, i + 200))
      }
    }

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
      if (useCustomMsg && customMsg.trim()) {
        patientMsg = customMsg.trim()
      } else if (isNew && payload.status !== 'cancelado') {
        // Confirmação simples na HORA do agendamento. A mensagem personalizada
        // do procedimento ("responda SIM") agora vai no lembrete de X horas
        // antes (process_appointment_reminders), não aqui.
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

  // Valor do agendamento: o valor por sessão do profissional manda. Só cai no
  // preço do procedimento (convênio > particular) quando o profissional não
  // tem valor cadastrado no Catálogo.
  function resolveApptPrice(professionalId, procedureId, planId, current = 0) {
    const pro = professionals.find(x => x.id === professionalId)
    const proValue = parseFloat(pro?.valor_atendimento) || 0
    if (proValue > 0) return proValue
    if (!procedureId) return current
    const proc = procedures.find(x => x.id === procedureId)
    const priceRow = planId
      ? procedurePrices.find(pr => pr.procedure_id === procedureId && pr.insurance_plan_id === planId)
      : null
    return priceRow?.price ?? proc?.price_particular ?? 0
  }

  // Abre a confirmação certa: se o agendamento nasceu de uma recorrência,
  // pergunta se é só ele ou a série toda.
  async function askDeleteAppt(appt, fromModal = false) {
    if (!appt?.recurrence_group_id) {
      if (fromModal) setConfirmDeleteAppt(true)
      else setConfirmDeleteApptDirect(appt)
      return
    }
    const { count } = await supabase.from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('recurrence_group_id', appt.recurrence_group_id)
    setSeriesDelete({ appt, count: count || 0, fromModal })
  }

  // scope: 'este' | 'serie'
  async function doDeleteAppt(appt, scope, fromModal) {
    if (!appt?.id) return
    setDeletingNow(true)
    const groupId = appt.recurrence_group_id
    if (scope === 'serie' && groupId) {
      await supabase.from('appointments').delete().eq('recurrence_group_id', groupId)
      setAppointments(prev => prev.filter(a => a.recurrence_group_id !== groupId))
    } else {
      await supabase.from('appointments').delete().eq('id', appt.id)
      setAppointments(prev => prev.filter(a => a.id !== appt.id))
    }
    setDeletingNow(false)
    setSeriesDelete(null)
    setConfirmDeleteApptDirect(null)
    if (fromModal) { setConfirmDeleteAppt(false); setApptModal(null) }
  }

  function handleDeleteAppt() {
    if (!apptModal?.id) return
    askDeleteAppt(apptModal, true)
  }
  async function confirmDeleteApptAction() {
    if (!apptModal?.id) return
    await doDeleteAppt(apptModal, 'este', true)
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

  // Todos os agendamentos que caem no slot (turma pode ter vários no mesmo horário)
  function apptsAt(day, hhmm) {
    if (!selectedAgenda) return []
    const tz = session?.company?.timezone || '-03:00'
    // Ancora o slot na timezone da clínica (não do browser)
    const slotStart = new Date(`${fmtDateInput(day)}T${hhmm}:00${tz}`).getTime()
    const slotEnd   = slotStart + (selectedAgenda.slot_minutes || 30) * 60_000
    return appointments
      .filter(a => {
        if (a.agenda_id !== selectedAgenda.id) return false
        const t = new Date(a.starts_at).getTime()
        return t >= slotStart && t < slotEnd
      })
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  }
  function apptAt(day, hhmm) { return apptsAt(day, hhmm)[0] || null }

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
                        const appts = working ? apptsAt(d, hhmm) : []
                        const slotKey = `${fmtDateInput(d)}_${hhmm}`
                        const isDragOver = dragOverSlot === slotKey
                        return (
                          <div key={i}
                            onClick={() => !draggingId && working && openNewAppt(d, hhmm)}
                            onDragOver={e => {
                              if (!working) return
                              // Turma: pode soltar em qualquer horário de trabalho
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setDragOverSlot(slotKey)
                            }}
                            onDragLeave={e => {
                              if (!e.currentTarget.contains(e.relatedTarget)) setDragOverSlot(null)
                            }}
                            onDrop={async e => {
                              e.preventDefault()
                              if (!working) return
                              const apptId = e.dataTransfer.getData('apptId')
                              if (!apptId) return
                              const droppedAppt = appointments.find(a => a.id === apptId)
                              if (!droppedAppt) return
                              setDragOverSlot(null)
                              setDraggingId(null)
                              const tz = session?.company?.timezone || '-03:00'
                              const newStartsAt = new Date(`${fmtDateInput(d)}T${hhmm}:00${tz}`)
                              if (newStartsAt.toISOString() === droppedAppt.starts_at) return
                              setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, starts_at: newStartsAt.toISOString() } : a))
                              const { error } = await supabase.from('appointments').update({ starts_at: newStartsAt.toISOString() }).eq('id', apptId)
                              if (error) setAppointments(prev => prev.map(a => a.id === apptId ? droppedAppt : a))
                            }}
                            style={{
                              minHeight: 46, borderLeft: '1px solid var(--border)',
                              background: isDragOver ? '#DBEAFE' : !working ? '#F9FAFB' : 'transparent',
                              cursor: working ? 'pointer' : 'not-allowed',
                              padding: 3, position: 'relative',
                              transition: 'background 0.1s',
                              outline: isDragOver ? '2px dashed #2563EB' : 'none',
                              outlineOffset: '-2px',
                              display: 'flex', flexDirection: 'column', gap: 2,
                            }}
                            onMouseEnter={e => { if (working && !appts.length && !draggingId) e.currentTarget.style.background = '#EFF6FF' }}
                            onMouseLeave={e => { if (working && !appts.length && !isDragOver) e.currentTarget.style.background = 'transparent' }}
                          >
                            {appts.map(appt => {
                              const status = STATUS_OPTIONS.find(s => s.value === appt.status)
                              if (!status) return null
                              const many = appts.length > 1
                              return (
                              <div key={appt.id}
                                draggable
                                onClick={e => { e.stopPropagation(); if (!draggingId) openEditAppt(appt) }}
                                onDragStart={e => {
                                  e.dataTransfer.effectAllowed = 'move'
                                  e.dataTransfer.setData('apptId', appt.id)
                                  setDraggingId(appt.id)
                                }}
                                onDragEnd={() => { setDraggingId(null); setDragOverSlot(null) }}
                                onContextMenu={e => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const x = Math.min(e.clientX, window.innerWidth - 185)
                                  const y = Math.min(e.clientY, window.innerHeight - 95)
                                  setCtxMenu({ x, y, appt })
                                }}
                                style={{
                                  background: status.color,
                                  color: '#fff',
                                  borderLeft: `3px solid ${status.color}`,
                                  borderRadius: 5,
                                  padding: many ? '3px 7px' : '5px 8px',
                                  fontSize: 11, fontWeight: 700, lineHeight: 1.25,
                                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                  overflow: 'hidden',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                  opacity: draggingId === appt.id ? 0.35 : 1,
                                  cursor: 'grab',
                                  userSelect: 'none',
                                  transition: 'opacity 0.15s',
                                }}>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {appt.contact_nome}
                                </div>
                                {!many && (
                                  <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.85, marginTop: 1 }}>
                                    {hhmm} · {status.label}
                                  </div>
                                )}
                              </div>
                            )})}
                            {appts.length > 1 && (
                              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', marginTop: 1 }}>
                                {appts.length} na turma
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

      <ConfirmModal
        open={!!confirmDeleteApptDirect}
        variant="delete"
        title="Excluir agendamento"
        message={`Tem certeza que deseja excluir o agendamento de "${confirmDeleteApptDirect?.contact_nome || ''}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={deletingNow}
        onConfirm={() => doDeleteAppt(confirmDeleteApptDirect, 'este', false)}
        onCancel={() => setConfirmDeleteApptDirect(null)}
      />

      {/* Excluir agendamento que veio de uma recorrência: só este ou a série toda */}
      {seriesDelete && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', flexShrink: 0 }}>
                  <Repeat size={15} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                    Excluir agendamento recorrente
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    {seriesDelete.appt?.contact_nome || 'Paciente'} · faz parte de uma série de {seriesDelete.count} agendamentos
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => doDeleteAppt(seriesDelete.appt, 'este', seriesDelete.fromModal)}
                disabled={deletingNow}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: '1.5px solid var(--border)', background: '#fff', fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#2563EB'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Somente este agendamento
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {seriesDelete.appt?.starts_at
                    ? new Date(seriesDelete.appt.starts_at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : 'Este horário'}
                  {seriesDelete.count > 1 && ` — os outros ${seriesDelete.count - 1} continuam na agenda.`}
                </div>
              </button>

              <button
                onClick={() => doDeleteAppt(seriesDelete.appt, 'serie', seriesDelete.fromModal)}
                disabled={deletingNow}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                  border: '1.5px solid #FECACA', background: '#FEF2F2', fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#DC2626'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#FECACA'}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
                  Todos os {seriesDelete.count} agendamentos da série
                </div>
                <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 2 }}>
                  Apaga a recorrência inteira, inclusive os já realizados. Não pode ser desfeito.
                </div>
              </button>
            </div>

            <div style={{ padding: '0 1.5rem 1.25rem' }}>
              <button className="nx-btn-ghost" style={{ width: '100%' }} disabled={deletingNow}
                onClick={() => setSeriesDelete(null)}>
                {deletingNow ? 'Excluindo...' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Context menu botão direito */}
      {ctxMenu && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 99999,
            background: '#fff',
            border: '1px solid rgba(15,23,42,0.1)',
            borderRadius: 10,
            boxShadow: '0 8px 28px -6px rgba(15,23,42,0.2), 0 2px 8px -3px rgba(15,23,42,0.08)',
            padding: 4,
            minWidth: 180,
          }}>
          <button
            onClick={() => { openEditAppt(ctxMenu.appt); setCtxMenu(null) }}
            style={{
              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
              padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: '#1E293B',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Pencil size={13} style={{ color: '#2563EB', flexShrink: 0 }} /> Editar agendamento
          </button>
          <div style={{ height: 1, background: 'rgba(15,23,42,0.06)', margin: '3px 4px' }} />
          <button
            onClick={() => { askDeleteAppt(ctxMenu.appt); setCtxMenu(null) }}
            style={{
              width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
              padding: '8px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: '#DC2626',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Trash2 size={13} style={{ flexShrink: 0 }} /> Apagar agendamento
          </button>
        </div>,
        document.body
      )}

      {/* Modal agendamento */}
      {apptModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{apptModal.id ? 'Editar agendamento' : 'Novo agendamento'}</div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setApptModal(null); setRecipSearch(''); setUseCustomMsg(false); setCustomMsg('') }}><X size={16} /></button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Agenda</label>
                <select className="nx-select" value={apptModal.agenda_id}
                  onChange={e => setApptModal(p => ({ ...p, agenda_id: e.target.value }))}>
                  {agendas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Nome do paciente</label>
                <input className="nx-input" autoFocus placeholder="Digite ou escolha um contato salvo"
                  value={apptModal.contact_nome}
                  onChange={e => setApptModal(p => ({ ...p, contact_nome: e.target.value }))} />
                {(() => {
                  const q = (apptModal.contact_nome || '').trim().toLowerCase()
                  if (q.length < 2) return null
                  const seen = new Set()
                  const matches = []
                  savedContacts.filter(c => c.nome?.toLowerCase().includes(q)).forEach(c => {
                    const norm = normalizeWhatsAppNumber(c.numero)
                    if (seen.has(norm)) return
                    seen.add(norm)
                    matches.push({ nome: c.nome, numero: norm })
                  })
                  chatContacts.filter(c => c.nome && c.nome.toLowerCase().includes(q) && !seen.has(c.numero)).forEach(c => {
                    seen.add(c.numero)
                    matches.push({ nome: c.nome, numero: c.numero })
                  })
                  if (matches.length === 0) return null
                  return (
                    <div style={{
                      marginTop: 6,
                      background: '#fff', border: '1px solid var(--border)',
                      borderRadius: 8, overflow: 'hidden',
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                    }}>
                      <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: 'var(--text-muted)',
                        background: '#F8FAFC', borderBottom: '1px solid var(--border)' }}>
                        Contatos correspondentes
                      </div>
                      {matches.slice(0, 6).map(c => (
                        <button key={c.numero} type="button"
                          onClick={() => setApptModal(p => ({ ...p, contact_nome: c.nome, contact_numero: c.numero }))}
                          style={{
                            width: '100%', textAlign: 'left', padding: '8px 10px',
                            background: 'transparent', border: 'none',
                            borderBottom: '1px solid #F1F5F9', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.nome}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {formatPhoneDisplay(c.numero)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                })()}
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
                  if (matches.length === 0 && !exact) {
                    if (normTyped.length >= 11) {
                      return (
                        <div style={{
                          marginTop: 6, padding: '7px 10px',
                          background: '#FFFBEB', border: '1px solid #FDE68A',
                          borderRadius: 8, fontSize: 11.5, color: '#92400E',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          <AlertCircle size={12} />
                          Número novo — paciente ainda não conversou com a clínica. A mensagem de confirmação pode não ser lida.
                        </div>
                      )
                    }
                    return null
                  }
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

              {/* ── Destinatários extras (contatos adicionais ou grupos) ── */}
              {(() => {
                const extras = apptModal.extra_recipients || []
                const recipMatches = (() => {
                  const q = recipSearch.trim().toLowerCase()
                  if (q.length < 2) return []
                  const results = []
                  // Contatos salvos
                  savedContacts.filter(c => c.nome?.toLowerCase().includes(q)).slice(0, 4).forEach(c => {
                    const num = normalizeWhatsAppNumber(c.numero)
                    if (num && !extras.find(e => e.numero === num))
                      results.push({ label: c.nome, sub: formatPhoneDisplay(num), numero: num })
                  })
                  // Grupos
                  availableGroups.filter(g => g.nomegrupo.toLowerCase().includes(q)).slice(0, 4).forEach(g => {
                    if (!extras.find(e => e.idgrupo === g.idgrupo))
                      results.push({ label: g.nomegrupo, sub: g.idgrupo, idgrupo: g.idgrupo, isGroup: true })
                  })
                  return results.slice(0, 6)
                })()

                function addRecip(item) {
                  setApptModal(p => ({
                    ...p,
                    extra_recipients: [...(p.extra_recipients || []), item.idgrupo
                      ? { nome: item.label, idgrupo: item.idgrupo }
                      : { nome: item.label, numero: item.numero }
                    ],
                  }))
                  setRecipSearch('')
                }
                function removeRecip(idx) {
                  setApptModal(p => ({ ...p, extra_recipients: p.extra_recipients.filter((_, i) => i !== idx) }))
                }

                return (
                  <div>
                    <label style={labelStyle}>Também notificar (opcional)</label>
                    {extras.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {extras.map((e, i) => (
                          <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: e.idgrupo ? '#F5F3FF' : '#EFF6FF',
                            border: `1px solid ${e.idgrupo ? '#DDD6FE' : '#BFDBFE'}`,
                            borderRadius: 20, padding: '3px 10px 3px 8px',
                            fontSize: 12, fontWeight: 600,
                            color: e.idgrupo ? '#7C3AED' : '#1D4ED8',
                          }}>
                            {e.idgrupo ? <Users size={11} /> : <Phone size={11} />}
                            {e.nome}
                            <button type="button" onClick={() => removeRecip(i)} style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: 0, display: 'inline-flex', color: 'inherit', opacity: 0.6,
                            }}><X size={11} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ position: 'relative' }}>
                      <input className="nx-input" placeholder="Buscar contato ou grupo para adicionar…"
                        value={recipSearch}
                        onChange={e => setRecipSearch(e.target.value)}
                        style={{ fontSize: 12 }}
                      />
                      {recipMatches.length > 0 && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, overflow: 'hidden', zIndex: 100,
                          boxShadow: '0 4px 12px rgba(15,23,42,0.10)',
                        }}>
                          {recipMatches.map((item, i) => (
                            <button key={i} type="button" onClick={() => addRecip(item)} style={{
                              width: '100%', textAlign: 'left', padding: '8px 10px',
                              background: 'transparent', border: 'none',
                              borderBottom: '1px solid #F1F5F9', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                background: item.isGroup ? '#EDE9FE' : '#EFF6FF',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {item.isGroup
                                  ? <Users size={12} color="#7C3AED" />
                                  : <Phone size={12} color="#2563EB" />}
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.label}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.isGroup ? 'Grupo' : item.sub}</div>
                              </span>
                              <Plus size={13} color="#6B7280" style={{ flexShrink: 0 }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

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

              {!apptModal.id && (
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Repeat size={11} /> Recorrência
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { value: null,         label: 'Não repetir' },
                      { value: 'semanal',    label: 'Semanal' },
                      { value: 'quinzenal',  label: 'Quinzenal' },
                      { value: 'mensal',     label: 'Mensal' },
                    ].map(r => {
                      const active = apptModal.recurrence === r.value
                      return (
                        <button key={String(r.value)} type="button"
                          onClick={() => setApptModal(p => {
                            const baseWd = p.date ? new Date(p.date + 'T00:00:00').getDay() : new Date().getDay()
                            const initWd = (r.value === 'semanal' || r.value === 'quinzenal') && !(p.recurrence_weekdays?.length) ? [baseWd] : p.recurrence_weekdays
                            return { ...p, recurrence: r.value, recurrence_weekdays: initWd }
                          })}
                          style={{
                            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${active ? '#2563EB' : 'var(--border)'}`,
                            background: active ? '#EFF6FF' : 'transparent',
                            color: active ? '#2563EB' : 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}>
                          {r.label}
                        </button>
                      )
                    })}
                  </div>
                  {/* Dias da semana (para semanal/quinzenal — permite 3x/semana etc.) */}
                  {(apptModal.recurrence === 'semanal' || apptModal.recurrence === 'quinzenal') && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>Dias da semana</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, wd) => {
                          const on = (apptModal.recurrence_weekdays || []).includes(wd)
                          return (
                            <button key={wd} type="button"
                              onClick={() => setApptModal(p => {
                                const cur = p.recurrence_weekdays || []
                                return { ...p, recurrence_weekdays: on ? cur.filter(x => x !== wd) : [...cur, wd] }
                              })}
                              style={{
                                width: 40, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                border: `1.5px solid ${on ? '#2563EB' : 'var(--border)'}`,
                                background: on ? '#EFF6FF' : 'transparent',
                                color: on ? '#2563EB' : 'var(--text-secondary)', cursor: 'pointer',
                              }}>
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Duração: por meses ou por número de ocorrências */}
                  {apptModal.recurrence && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[{ v: 'meses', l: 'Por meses' }, { v: 'ocorrencias', l: 'Nº de vezes' }].map(opt => {
                          const on = (apptModal.recurrence_mode || 'meses') === opt.v
                          return (
                            <button key={opt.v} type="button"
                              onClick={() => setApptModal(p => ({ ...p, recurrence_mode: opt.v }))}
                              style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: `1.5px solid ${on ? '#2563EB' : 'var(--border)'}`, background: on ? '#EFF6FF' : 'transparent', color: on ? '#2563EB' : 'var(--text-secondary)', cursor: 'pointer' }}>
                              {opt.l}
                            </button>
                          )
                        })}
                      </div>
                      {(apptModal.recurrence_mode || 'meses') === 'meses' ? (
                        <>
                          <input className="nx-input" type="number" min={1} max={24} style={{ width: 68, textAlign: 'center' }}
                            value={apptModal.recurrence_months}
                            onChange={e => setApptModal(p => ({ ...p, recurrence_months: Math.min(24, Math.max(1, parseInt(e.target.value) || 1)) }))} />
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>meses</span>
                        </>
                      ) : (
                        <>
                          <input className="nx-input" type="number" min={2} max={200} style={{ width: 68, textAlign: 'center' }}
                            value={apptModal.recurrence_count}
                            onChange={e => setApptModal(p => ({ ...p, recurrence_count: Math.min(200, Math.max(2, parseInt(e.target.value) || 2)) }))} />
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>consultas no total</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Lembretes automáticos do agendamento */}
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <label style={{ ...labelStyle, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Bell size={13} /> Lembretes automáticos (WhatsApp)
                </label>

                {/* Padrões salvos */}
                {reminderPresets.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {reminderPresets.map(pr => {
                      const active = JSON.stringify([...(apptModal.reminder_offsets || [])].sort((a,b)=>a-b)) === JSON.stringify([...pr.offsets].sort((a,b)=>a-b))
                      return (
                        <span key={pr.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <button type="button"
                            onClick={() => setApptModal(p => ({ ...p, reminder_offsets: [...pr.offsets] }))}
                            style={{
                              padding: '4px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                              border: `1.5px solid ${active ? '#2563EB' : 'var(--border)'}`,
                              background: active ? '#EFF6FF' : '#fff', color: active ? '#1D4ED8' : 'var(--text-secondary)',
                            }}>
                            {pr.is_default ? '★ ' : ''}{pr.name}
                          </button>
                          <button type="button" onClick={() => handleDeletePreset(pr.id)} title="Remover padrão"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'inline-flex' }}>
                            <X size={11} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Antecedências (múltiplas) */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {REMINDER_OFFSETS.map(opt => {
                    const active = (apptModal.reminder_offsets || []).includes(opt.value)
                    return (
                      <button key={opt.value} type="button" onClick={() => toggleReminderOffset(opt.value)}
                        style={{
                          padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer',
                          border: `1.5px solid ${active ? '#16A34A' : 'var(--border)'}`,
                          background: active ? '#F0FDF4' : '#fff', color: active ? '#15803D' : 'var(--text-primary)',
                        }}>
                        {active ? '✓ ' : ''}{opt.label}
                      </button>
                    )
                  })}
                </div>

                {(apptModal.reminder_offsets || []).length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Nenhum aviso — o paciente só recebe a confirmação na hora do agendamento.
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    O paciente recebe o aviso {(apptModal.reminder_offsets || []).length > 1 ? 'nesses momentos' : 'nesse momento'} antes da consulta (não agora — hoje só a confirmação de que foi marcado).
                  </div>
                )}

                {/* Salvar como padrão */}
                {(apptModal.reminder_offsets || []).length > 0 && (
                  savePresetOpen ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input className="nx-input" placeholder="Nome do padrão (ex: Consulta)" value={presetName}
                        onChange={e => setPresetName(e.target.value)} style={{ flex: 1, minWidth: 140, fontSize: 12 }} />
                      <button type="button" className="nx-btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }}
                        onClick={() => handleSaveReminderPreset(false)}>Salvar</button>
                      <button type="button" className="nx-btn-primary" style={{ fontSize: 11, padding: '6px 10px' }}
                        onClick={() => handleSaveReminderPreset(true)}>Salvar como padrão ★</button>
                      <button type="button" onClick={() => { setSavePresetOpen(false); setPresetName('') }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={14} /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setSavePresetOpen(true)}
                      style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', fontSize: 11.5, fontWeight: 600, padding: 0 }}>
                      + Salvar essa combinação como padrão
                    </button>
                  )
                )}
              </div>

              {professionals.length > 0 && (
                <div>
                  <label style={labelStyle}>Profissional</label>
                  <select className="nx-select" value={apptModal.professional_id || ''}
                    onChange={e => {
                      const proId = e.target.value || null
                      setApptModal(p => ({
                        ...p,
                        professional_id: proId,
                        procedure_id: null,
                        price: resolveApptPrice(proId, null, p.insurance_plan_id, p.price),
                      }))
                    }}>
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
                      setApptModal(p => ({
                        ...p,
                        procedure_id: procId,
                        duration_minutes: proc?.duration_minutes || p.duration_minutes,
                        price: resolveApptPrice(p.professional_id, procId, p.insurance_plan_id, p.price),
                      }))
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
                      setApptModal(p => ({
                        ...p,
                        insurance_plan_id: planId,
                        price: resolveApptPrice(p.professional_id, p.procedure_id, planId, p.price),
                      }))
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
                  {(() => {
                    const pro = professionals.find(x => x.id === apptModal.professional_id)
                    const proValue = parseFloat(pro?.valor_atendimento) || 0
                    if (!proValue) return null
                    return (
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>
                        Valor por sessão de {pro.name.split(' ')[0]} (Catálogo). Dá pra editar aqui.
                      </div>
                    )
                  })()}
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

              <div>
                <label style={{ ...labelStyle, color: '#0891B2' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <FileText size={11} /> Prontuário do Atendimento
                  </span>
                </label>
                <textarea className="nx-input" rows={4}
                  placeholder="Descreva o que foi realizado neste atendimento (procedimentos, observações clínicas, orientações...)."
                  value={apptModal.prontuario || ''}
                  onChange={e => setApptModal(p => ({ ...p, prontuario: e.target.value }))}
                  style={{ borderColor: apptModal.prontuario ? '#0891B2' : undefined, resize: 'vertical' }} />
                {apptModal.prontuario_at && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Registrado por <strong>{apptModal.prontuario_by || 'sistema'}</strong> em {new Date(apptModal.prontuario_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
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
                  {patientAppts.length > 0 && (
                    <>
                      <div style={{ margin: '10px 0 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Agendamentos anteriores
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {patientAppts.map(a => {
                          const st = STATUS_OPTIONS.find(s => s.value === a.status)
                          const procName = procedures.find(p => p.id === a.procedure_id)?.name
                          const dt = new Date(a.starts_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                          return (
                            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <button type="button"
                                onClick={() => { setApptModal(null); setTimeout(() => openEditAppt({ ...a, contact_nome: apptModal.contact_nome, contact_numero: apptModal.contact_numero }), 50) }}
                                style={{
                                  textAlign: 'left', background: 'transparent', border: 'none',
                                  padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit',
                                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 700, flexShrink: 0,
                                  background: st?.bg || '#F1F5F9', color: st?.color || '#64748B', border: `1px solid ${st?.border || st?.color || '#CBD5E1'}` }}>
                                  {st?.label || a.status}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{dt}</span>
                                {procName && <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {procName}</span>}
                              </button>
                              {a.prontuario && (
                                <div style={{
                                  fontSize: 11, color: '#0C4A6E',
                                  background: '#F0F9FF', border: '1px solid #BAE6FD',
                                  borderRadius: 6, padding: '5px 8px', lineHeight: 1.5,
                                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}>
                                  <span style={{ fontWeight: 700, color: '#0891B2', marginRight: 4 }}>📋</span>
                                  {a.prontuario}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* ── Mensagem de confirmação ── */}
              {apptModal.contact_numero && (() => {
                const tz = session?.company?.timezone || '-03:00'
                const dateStr = (() => {
                  try {
                    const [y, m, d] = apptModal.date.split('-')
                    const [hh, mm] = apptModal.time.split(':')
                    return new Date(`${y}-${m}-${d}T${hh}:${mm}:00${tz}`).toLocaleString('pt-BR',
                      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  } catch { return apptModal.date }
                })()
                const firstName = (apptModal.contact_nome || '').split(' ')[0] || 'tudo bem'
                const proc = procedures.find(x => x.id === apptModal.procedure_id)
                const defaultMsg = !apptModal.id
                  ? (proc?.reminder_message?.trim()
                      ? proc.reminder_message.replace(/\{nome\}/gi, firstName).replace(/\{data\}/gi, dateStr)
                      : `Olá ${firstName}! 📅 Seu agendamento foi marcado para *${dateStr}*. Qualquer dúvida é só responder aqui!`)
                  : `Olá ${firstName}! Só passando pra confirmar seu agendamento de *${dateStr}*. Até lá! 👋`

                return (
                  <div>
                    <label style={labelStyle}>Mensagem de confirmação</label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {[
                        { val: false, label: 'Padrão' },
                        { val: true,  label: 'Personalizar' },
                      ].map(opt => (
                        <button key={String(opt.val)} type="button"
                          onClick={() => {
                            setUseCustomMsg(opt.val)
                            if (opt.val && !customMsg) setCustomMsg(defaultMsg)
                          }}
                          style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            border: `1.5px solid ${useCustomMsg === opt.val ? '#2563EB' : 'var(--border)'}`,
                            background: useCustomMsg === opt.val ? '#EFF6FF' : '#fff',
                            color: useCustomMsg === opt.val ? '#1D4ED8' : 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {useCustomMsg ? (
                      <textarea
                        className="nx-input"
                        rows={4}
                        value={customMsg}
                        onChange={e => setCustomMsg(e.target.value)}
                        placeholder="Digite a mensagem que será enviada ao paciente..."
                        style={{ resize: 'vertical', fontSize: 13 }}
                      />
                    ) : (
                      <div style={{
                        background: '#F0FDF4', border: '1px solid #BBF7D0',
                        borderRadius: 8, padding: '10px 12px',
                        fontSize: 12.5, color: '#0F172A', lineHeight: 1.55,
                      }}>
                        {defaultMsg}
                      </div>
                    )}
                  </div>
                )
              })()}

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
