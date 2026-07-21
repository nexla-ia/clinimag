import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
// Carregado sob demanda: o bundle do emoji-picker (~300KB) só baixa ao abrir o picker.
const EmojiPicker = lazy(() => import('emoji-picker-react'))
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchConversaContatos } from '../../lib/queries'
import { MessageSquare, Bot, User, PhoneCall, CheckCircle2, X, Send, Headset, Sparkles, Inbox, UserCheck, Archive, Mic, Square, Trash2, Paperclip, FileText, Image as ImageIcon, Calendar, UserPlus, BookUser, Lock, ArrowRightLeft, ChevronLeft, Pencil, Film, Mail, MailOpen, AlertCircle, Plus, Reply, Search } from 'lucide-react'
import { useContactTags, TagPicker, TagList, TagFilter, stripPhoneSuffix, buildTagFilter } from '../../components/Tags'
import QuickMessages from '../../components/QuickMessages'
import ConfirmModal from '../../components/ConfirmModal'
import './Company.css'

const CONV_TABLE = 'mensagens_geral'

function formatPhone(val) {
  return (val || '').replace(/@.*$/, '')
}

function getMessageContent(row) {
  return (row.mensagem || '').replace(/^\*[^*]+\*:\n/, '').trim()
}

function getMessageType(row) { return (row.type || 'human').toLowerCase() }

function parseTimestamp(val) {
  if (!val) return null
  if (/^\d{2}\/\d{2}\/\d{4}/.test(val)) {
    const [date, time] = val.split(' ')
    const [d, m, y] = date.split('/')
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).toISOString()
  }
  return val
}

function getTimestamp(row) { return parseTimestamp(row.horaLastMessage) || row.created_at || null }

const INJECTED_PROMPT_RE = /responda em portugu[eê]s|de forma objetiva|solicite\s|n[aã]o informar|indicar que|apresentaremos|breve explica[çc][aã]o|orienta[çc][õo]es gerais|avalia[çc][aã]o pr[eé]-operat/i

const URL_REGEX = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]{2,})/gi

function renderTextWithLinks(text, linkStyle) {
  const parts = text.split(URL_REGEX)
  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0
      const href = part.startsWith('http') ? part : `https://${part}`
      return <a key={i} href={href} target="_blank" rel="noreferrer noopener" style={linkStyle}>{part}</a>
    }
    return part
  })
}

function detectMedia(b64) {
  if (!b64 || b64.length < 10) return null
  if (b64.startsWith('T2dn')) return { type: 'audio', mime: 'audio/ogg' }
  if (b64.startsWith('//uQ') || b64.startsWith('SUQz')) return { type: 'audio', mime: 'audio/mpeg' }
  if (b64.startsWith('GkXf')) return { type: 'audio', mime: 'audio/webm' }
  if (b64.startsWith('/9j/')) return { type: 'image', mime: 'image/jpeg' }
  if (b64.startsWith('iVBOR')) return { type: 'image', mime: 'image/png' }
  if (b64.startsWith('UklGR')) return { type: 'image', mime: 'image/webp' }
  if (b64.startsWith('R0lGOD')) return { type: 'image', mime: 'image/gif' }
  if (b64.startsWith('JVBERi')) return { type: 'pdf', mime: 'application/pdf' }
  // MP4/MOV/3GP: verifica marcador 'ftyp' no offset 4
  try {
    if (b64.length > 100 && atob(b64.slice(0, 16)).slice(4, 8) === 'ftyp') {
      return { type: 'video', mime: 'video/mp4' }
    }
  } catch {}
  return null
}

function toImgSrc(val) {
  if (!val) return null
  if (val.startsWith('data:') || val.startsWith('http')) return val
  const media = detectMedia(val)
  const mime = media?.mime || 'image/jpeg'
  return `data:${mime};base64,${val}`
}

function isToolMessage(row) {
  const type = getMessageType(row)
  const content = row.mensagem || ''
  if (type === 'tool') return true
  if (type === 'ia' && /^Calling \w+ with input:/i.test(content.trim())) return true
  if (type === 'ia' && content.length > 800) return true
  if (type === 'cliente' && content.length > 200 && INJECTED_PROMPT_RE.test(content)) return true
  return false
}

function formatMsgTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return hhmm
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${hhmm}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm}`
}

function formatApptShort(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const hh = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d >= today && d < new Date(today.getTime() + 86400000)) return `hoje ${hh}`
  if (d >= tomorrow && d < new Date(tomorrow.getTime() + 86400000)) return `amanhã ${hh}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hh}`
}

function formatContactTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const diffMin = Math.floor((now - date) / 60000)
  const diffH = Math.floor(diffMin / 60)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  if (diffH < 24) return `${diffH}h`
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const REASONS = [
  { value: 'agendado',       label: 'Agendado',    color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  { value: 'resolvido',      label: 'Resolvido',   color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  { value: 'encaminhado',    label: 'Encaminhado', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  { value: 'sem_resposta',   label: 'Paciente não respondeu', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'desistiu',       label: 'Desistiu',    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { value: 'auto_encerrado', label: 'Expirado',    color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
]

const AUTO_CLOSE_HOURS = 2
const CLIENT_TYPES = ['cliente', 'human']
// Esperando o paciente = atendente/IA respondeu por último (não foi o cliente).
// Nesses casos NÃO auto-encerra — a demora é do paciente, não da secretária.
function isWaitingPatient(c) {
  return !!c?.lastTipo && !CLIENT_TYPES.includes(c.lastTipo)
}
const MANUAL_REASONS = REASONS.filter(r => r.value !== 'auto_encerrado')

// Motivos que a clínica ganha "de fábrica" — semeados no banco uma única vez
// por instância, e daí editáveis/removíveis como qualquer outro. Não precisa
// de migration nova: usa a tabela conversation_close_reasons que já existe.
// O created_at fixo (2020) garante que os padrão fiquem SEMPRE no topo, na
// ordem certa; motivos criados depois pegam now() e caem embaixo.
const DEFAULT_SEED = [
  { value: 'agendado',     label: 'Agendado',              color: '#16A34A', created_at: '2020-01-01T00:00:01Z' },
  { value: 'resolvido',    label: 'Resolvido',             color: '#2563EB', created_at: '2020-01-01T00:00:02Z' },
  { value: 'encaminhado',  label: 'Encaminhado',           color: '#7C3AED', created_at: '2020-01-01T00:00:03Z' },
  { value: 'sem_resposta', label: 'Paciente não respondeu', color: '#D97706', created_at: '2020-01-01T00:00:04Z' },
  { value: 'desistiu',     label: 'Desistiu',              color: '#DC2626', created_at: '2020-01-01T00:00:05Z' },
]
// Linha sentinela: marca que a instância JÁ foi semeada, pra não
// ressurgir um padrão que a clínica apagou de propósito.
const SEED_SENTINEL = '__seeded__'

// Motivo personalizado só tem cor; deriva o fundo/borda como as etiquetas.
function reasonStyle(color) {
  return { color, bg: (color || '#6B7280') + '15', border: (color || '#6B7280') + '44' }
}
const REASON_COLORS = ['#16A34A', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#0891B2', '#DC2626', '#6B7280']
function slugify(s) {
  // NFD separa o acento em codepoint próprio (U+0300–U+036F); removemos essa
  // faixa e tudo que não for a-z0-9 vira "_".
  return (s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'motivo'
}

const SPEEDS = [1, 1.5, 2]

function AudioPlayer({ src, style = {} }) {
  const ref = useRef(null)
  const [speed, setSpeed] = useState(1)
  function changeSpeed(s) {
    setSpeed(s)
    if (ref.current) ref.current.playbackRate = s
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4, ...style }}>
      <audio ref={ref} controls src={src} style={{ width:260, maxWidth:'100%', height:32, display:'block' }} />
      <div style={{ display:'flex', gap:4 }}>
        {SPEEDS.map(s => (
          <button key={s} onClick={() => changeSpeed(s)}
            style={{
              fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, cursor:'pointer',
              border: speed === s ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              background: speed === s ? '#EFF6FF' : 'transparent',
              color: speed === s ? '#2563EB' : '#64748B',
            }}>
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CompanyConversations() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const instance      = session?.company?.instance
  const apiInstancia  = session?.company?.api_instancia
  const contactsTable = session?.company?.contacts_table

  const isAdmin = session?.user?.role === 'admin'
  const userSector = session?.user?.sector // { id, name, color } or null
  const aiEnabled = session?.company?.ai_enabled !== false

  const [contacts, setContacts]         = useState([])
  const [closedMap, setClosedMap]       = useState({}) // session_id → reason
  const [attendancesMap, setAttendancesMap] = useState({}) // numero → attendance record
  const [assuming, setAssuming]         = useState(null)
  const [transferModal, setTransferModal] = useState(null)
  const [transferringTo, setTransferringTo] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [companyUsers, setCompanyUsers] = useState([]) // outros atendentes pra transferir
  const [tab, setTab]                 = useState('recepcao')
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [search, setSearch]           = useState('')
  const [tagFilter, setTagFilter]     = useState([])
  const [onlyUnread, setOnlyUnread]   = useState(false)
  const { tagsOf, assignments: tagAssignments } = useContactTags(instance)
  const [selected, setSelected]       = useState(null)
  const [messages, setMessages]       = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false)
  const [loadingMoreMsgs, setLoadingMoreMsgs] = useState(false)
  const [closeModal, setCloseModal]   = useState(null)
  const [reason, setReason]           = useState('')
  const [customReasons, setCustomReasons] = useState([]) // motivos criados pela empresa
  const [addingReason, setAddingReason]   = useState(false)
  const [newReasonLabel, setNewReasonLabel] = useState('')
  const [newReasonColor, setNewReasonColor] = useState(REASON_COLORS[0])
  const [savingReason, setSavingReason]   = useState(false)
  const [editReason, setEditReason]       = useState(null) // { value, label, color } em edição
  const [selectedIds, setSelectedIds] = useState([])   // seleção múltipla para encerrar em lote
  const [closing, setClosing]         = useState(false)
  const [toast, setToast]             = useState(null)
  const [msgText, setMsgText]         = useState('')
  const [sending, setSending]         = useState(false)
  const [closedLoaded, setClosedLoaded] = useState(false)
  const [lightbox, setLightbox]       = useState(null)
  const [recording, setRecording]     = useState(false)
  const [recordedAudio, setRecordedAudio] = useState(null) // { base64, mime, duration }
  const [recordTime, setRecordTime]   = useState(0)
  const [attachedFile, setAttachedFile] = useState(null) // { base64, mime, name, size, kind: 'image'|'pdf'|'file' }
  const [savedContacts, setSavedContacts] = useState({}) // numero (só dígitos) → { id, nome, notes }
  const [clientesMap, setClientesMap]     = useState({}) // numero (só dígitos) → { nome, pushname, ... }
  const [futureAppts, setFutureAppts]     = useState({}) // numero (só dígitos) → { starts_at, status, agenda_name }
  const [contextMenu, setContextMenu] = useState(null) // { x, y, contact }
  const [saveContactModal, setSaveContactModal] = useState(null) // { numero, nome, notes }
  const [savingContact, setSavingContact] = useState(false)
  const [editingMsgId, setEditingMsgId]   = useState(null)
  const [replyingTo, setReplyingTo]       = useState(null) // { id_mensagem, content, type, numero }
  const [searchOpen, setSearchOpen]       = useState(false) // busca dentro da conversa (estilo WhatsApp)
  const [searchTerm, setSearchTerm]       = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [jumpingTo, setJumpingTo]         = useState(null)   // id da msg sendo carregada pra pular
  const [confirmDelMsg, setConfirmDelMsg] = useState(null)
  const [editingText, setEditingText]     = useState('')
  const [savingEdit, setSavingEdit]       = useState(false)
  const [showEmoji, setShowEmoji]         = useState(false)
  const emojiPickerRef                    = useRef(null)
  const [readsMap, setReadsMap]           = useState({}) // session_id → last_read_at ISO
  const [readsLoaded, setReadsLoaded]     = useState(false)
  const [unreadCounts, setUnreadCounts]   = useState({}) // session_id → number
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const recordTimerRef   = useRef(null)
  const recordStartRef   = useRef(0)
  const fileInputRef     = useRef(null)
  const composerRef      = useRef(null)
  const bottomRef    = useRef(null)
  const chatBodyRef  = useRef(null)
  const skipScrollRef = useRef(false)

  // Auto-cresce o composer conforme digita (até ~5 linhas), tipo WhatsApp
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [msgText])
  const selectedRef  = useRef(null)
  const sentCacheRef = useRef([])
  const autoCloseDone = useRef(false)
  const initialCountsDone = useRef(false)

  useEffect(() => { selectedRef.current = selected }, [selected])

  // Fecha emoji picker ao clicar fora
  useEffect(() => {
    if (!showEmoji) return
    function handleClick(e) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setShowEmoji(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showEmoji])

  // Carrega leituras do usuário atual
  useEffect(() => {
    if (!instance || !session?.user?.email) return
    supabase.from('conversation_reads')
      .select('session_id, last_read_at')
      .eq('instancia', instance)
      .eq('user_email', session.user.email)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.session_id] = r.last_read_at })
          setReadsMap(map)
        }
        setReadsLoaded(true)
      })
  }, [instance, session?.user?.email])

  // Calcula contagem inicial de não lidos (roda uma vez após contatos e leituras carregados)
  useEffect(() => {
    if (initialCountsDone.current || !readsLoaded || loadingContacts || !contacts.length || !instance) return
    initialCountsDone.current = true
    const unread = contacts.filter(c => {
      const lr = readsMap[c.session_id]
      return !lr || (c.lastTs && new Date(c.lastTs) > new Date(lr))
    })
    if (!unread.length) return
    Promise.all(
      unread.map(c =>
        supabase.from(CONV_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('numero', c.session_id)
          .eq('instancia', instance)
          .ilike('type', 'cliente')
          .gt('created_at', readsMap[c.session_id] || '1970-01-01T00:00:00Z')
          .then(({ count }) => [c.session_id, count || 0])
      )
    ).then(pairs => {
      const counts = {}
      pairs.forEach(([sid, cnt]) => { if (cnt > 0) counts[sid] = cnt })
      setUnreadCounts(counts)
    })
  }, [readsLoaded, loadingContacts, contacts, readsMap, instance])

  // Carrega agendamentos futuros (próximo por contato)
  useEffect(() => {
    if (!instance) return
    const now = new Date().toISOString()
    supabase.from('appointments')
      .select('contact_numero, starts_at, status, agenda_id, agendas(name)')
      .eq('instancia', instance)
      .gte('starts_at', now)
      .neq('status', 'cancelado')
      .neq('status', 'concluido')
      .order('starts_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(a => {
            if (!a.contact_numero) return
            if (!map[a.contact_numero]) map[a.contact_numero] = {
              starts_at: a.starts_at, status: a.status,
              agenda_name: a.agendas?.name || '',
            }
          })
          setFutureAppts(map)
        }
      })

    const ch = supabase.channel(`convs-appts-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `instancia=eq.${instance}` },
        () => {
          const ts = new Date().toISOString()
          supabase.from('appointments')
            .select('contact_numero, starts_at, status, agendas(name)')
            .eq('instancia', instance)
            .gte('starts_at', ts)
            .neq('status', 'cancelado')
            .neq('status', 'concluido')
            .order('starts_at', { ascending: true })
            .then(({ data }) => {
              if (data) {
                const map = {}
                data.forEach(a => {
                  if (!a.contact_numero) return
                  if (!map[a.contact_numero]) map[a.contact_numero] = {
                    starts_at: a.starts_at, status: a.status,
                    agenda_name: a.agendas?.name || '',
                  }
                })
                setFutureAppts(map)
              }
            })
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega contatos salvos
  useEffect(() => {
    if (!instance) return
    supabase.from('saved_contacts').select('*').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(c => { map[c.numero] = c })
          setSavedContacts(map)
        }
      })
    const ch = supabase.channel(`convs-saved-contacts-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_contacts', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setSavedContacts(prev => { const n = { ...prev }; delete n[p.old.numero]; return n })
          } else if (p.new) {
            setSavedContacts(prev => ({ ...prev, [p.new.numero]: p.new }))
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega contacts_table (clientes) para fallback de nome/pushname
  useEffect(() => {
    if (!instance || !contactsTable) return
    supabase.from(contactsTable).select('numero, nome, foto').eq('instancia', instance)
      .then(({ data }) => {
        if (!data) return
        const map = {}
        data.forEach(c => {
          if (c.numero) map[c.numero.replace(/\D/g, '')] = c
        })
        setClientesMap(map)
      })
  }, [instance, contactsTable])

  // Abre conversa via ?contact=xxxx (vindo da página Contatos)
  useEffect(() => {
    const target = searchParams.get('contact')
    if (!target || loadingContacts) return
    const cleanTarget = target.replace(/\D/g, '')
    const sessionId = `${cleanTarget}@s.whatsapp.net`
    const existing = contacts.find(c => c.session_id === sessionId || c.phone === cleanTarget)
    if (existing) {
      setSelected(existing)
      // Se está finalizada, força aba certa para visualizar
      if (closedMap[existing.session_id]) setTab('finalizados')
      else if (attendancesMap[existing.session_id]) setTab('meu-setor')
      else setTab('recepcao')
    } else {
      const synthetic = { session_id: sessionId, phone: cleanTarget, lastTs: null }
      setContacts(prev => [synthetic, ...prev])
      setSelected(synthetic)
      setTab('recepcao')
    }
    searchParams.delete('contact')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, loadingContacts])

  // Fecha menu de contexto ao clicar fora
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [contextMenu])

  function openSaveContact(contact) {
    const numero = contact.phone.replace(/\D/g, '')
    const existing = savedContacts[numero]
    setSaveContactModal({
      id: existing?.id || null,
      numero,
      nome: existing?.nome || '',
      notes: existing?.notes || '',
    })
    setContextMenu(null)
  }

  async function handleSaveContact() {
    if (!saveContactModal?.nome.trim()) return
    setSavingContact(true)
    const { id, numero, nome, notes } = saveContactModal
    const { error } = id
      ? await supabase.from('saved_contacts').update({ nome: nome.trim(), notes: notes?.trim() || null }).eq('id', id)
      : await supabase.from('saved_contacts').insert({
          numero, instancia: instance,
          nome: nome.trim(), notes: notes?.trim() || null,
          created_by_email: session?.user?.email,
        })
    setSavingContact(false)
    if (!error) setSaveContactModal(null)
    else setToast({ message: 'Erro ao salvar: ' + error.message, color: '#DC2626' })
  }

  // Carrega atendimentos ativos (quem está em qual setor + atendente)
  useEffect(() => {
    if (!instance) return
    supabase.from('attendances').select('*').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.numero] = r })
          setAttendancesMap(map)
        }
      })
  }, [instance])

  // Carrega outros usuários da empresa pra opção de transferir conversa
  useEffect(() => {
    const companyId = session?.company?.id
    if (!companyId) return
    supabase.from('users').select('id, name, email, role').eq('company_id', companyId)
      .then(({ data }) => setCompanyUsers(data || []))
  }, [session?.company?.id])

  // Realtime: attendances
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`convs-attendances-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendances', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setAttendancesMap(prev => { const n = { ...prev }; delete n[p.old.numero]; return n })
          } else if (p.new) {
            setAttendancesMap(prev => ({ ...prev, [p.new.numero]: p.new }))
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Carrega todos os contatos únicos da mensagens_geral (apenas WhatsApp)
  useEffect(() => {
    if (!instance) return
    setLoadingContacts(true)
    // Contatos únicos vêm já agregados do servidor (RPC) — antes baixava
    // até 50.000 mensagens só para deduplicar no cliente.
    fetchConversaContatos(instance)
      .then((rows) => {
        const unique = (rows || []).map((r) => ({
          session_id: r.numero,
          phone: formatPhone(r.numero),
          lastTs: getTimestamp(r),
          outsideAssumed: r.outside_assumed,
          preview: r.preview || '',
          lastTipo: r.last_tipo || '',
        }))
        setContacts(unique)
        setLoadingContacts(false)
      })
  }, [instance])

  // Motivos de encerramento da empresa — todos vêm do banco. Na primeira
  // vez que a instância é vista, semeamos os padrão (marcando com a linha
  // sentinela) pra que apareçam "de fábrica" mas continuem editáveis.
  useEffect(() => {
    if (!instance) return
    let cancel = false
    async function loadReasons() {
      const fetchRows = () => supabase.from('conversation_close_reasons')
        .select('value, label, color')
        .eq('instancia', instance)
        .order('created_at', { ascending: true })
      let { data, error } = await fetchRows()
      // Tabela ainda sem migration → cai no fallback do código.
      if (error) return
      const seeded = (data || []).some(r => r.value === SEED_SENTINEL)
      if (!seeded) {
        const rows = [
          ...DEFAULT_SEED.map(d => ({ instancia: instance, value: d.value, label: d.label, color: d.color, created_at: d.created_at })),
          { instancia: instance, value: SEED_SENTINEL, label: '', color: '#6B7280', created_at: '2020-01-01T00:00:09Z' },
        ]
        const { error: seedErr } = await supabase.from('conversation_close_reasons')
          .upsert(rows, { onConflict: 'instancia,value', ignoreDuplicates: true })
        if (!seedErr) {
          const res = await fetchRows()
          if (!res.error) data = res.data
        }
      }
      if (!cancel) setCustomReasons((data || []).filter(r => r.value !== SEED_SENTINEL))
    }
    loadReasons()
    return () => { cancel = true }
  }, [instance])

  // Motivos que aparecem no seletor. Se o banco trouxe motivos (já semeado),
  // usa SÓ eles — todos editáveis. Antes da migration, cai nos fixos do código.
  const dbReasons = customReasons.filter(r => r.value !== SEED_SENTINEL)
  const manualReasons = dbReasons.length
    ? dbReasons.map(r => ({ value: r.value, label: r.label, custom: true, ...reasonStyle(r.color) }))
    : MANUAL_REASONS
  // Lookup de qualquer motivo. Prioriza o do banco (rótulo/cor que a clínica
  // editou); cai no código pra 'auto_encerrado' e padrão já apagados que
  // ainda aparecem em conversas antigas.
  function findReason(value) {
    return manualReasons.find(r => r.value === value)
      || REASONS.find(r => r.value === value)
      || null
  }

  async function handleAddReason() {
    const label = newReasonLabel.trim()
    if (!label || savingReason) return
    let value = slugify(label)
    // evita colidir com fixo ou já existente
    const used = new Set([...REASONS, ...customReasons].map(r => r.value))
    if (used.has(value)) value = value + '_' + Math.floor(Math.random() * 1000)
    setSavingReason(true)
    const { data, error } = await supabase.from('conversation_close_reasons')
      .insert({ instancia: instance, value, label, color: newReasonColor })
      .select('value, label, color').single()
    setSavingReason(false)
    if (error) {
      setToast({ message: /conversation_close_reasons/.test(error.message)
        ? 'Falta rodar a migration close_reasons no Supabase.' : 'Erro: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 4000)
      return
    }
    setCustomReasons(prev => [...prev, data])
    setReason(data.value)
    setNewReasonLabel('')
    setNewReasonColor(REASON_COLORS[0])
    setAddingReason(false)
  }

  async function handleUpdateReason() {
    if (!editReason) return
    const label = (editReason.label || '').trim()
    if (!label || savingReason) return
    setSavingReason(true)
    const { error } = await supabase.from('conversation_close_reasons')
      .update({ label, color: editReason.color })
      .eq('instancia', instance).eq('value', editReason.value)
    setSavingReason(false)
    if (error) {
      setToast({ message: 'Erro ao salvar: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 4000)
      return
    }
    setCustomReasons(prev => prev.map(r => r.value === editReason.value ? { ...r, label, color: editReason.color } : r))
    setEditReason(null)
  }

  async function handleDeleteReason(value) {
    await supabase.from('conversation_close_reasons')
      .delete().eq('instancia', instance).eq('value', value)
    setCustomReasons(prev => prev.filter(r => r.value !== value))
    if (reason === value) setReason('')
    if (editReason?.value === value) setEditReason(null)
  }

  // Traz de volta os motivos padrão que a clínica apagou (sem mexer nos que
  // ela editou — ignoreDuplicates não sobrescreve os que já existem).
  async function handleRestoreDefaults() {
    if (savingReason) return
    setSavingReason(true)
    const rows = DEFAULT_SEED.map(d => ({ instancia: instance, value: d.value, label: d.label, color: d.color, created_at: d.created_at }))
    const { error } = await supabase.from('conversation_close_reasons')
      .upsert(rows, { onConflict: 'instancia,value', ignoreDuplicates: true })
    if (!error) {
      const { data } = await supabase.from('conversation_close_reasons')
        .select('value, label, color').eq('instancia', instance)
        .order('created_at', { ascending: true })
      setCustomReasons((data || []).filter(r => r.value !== SEED_SENTINEL))
    }
    setSavingReason(false)
  }

  // Carrega sessões encerradas com motivo
  useEffect(() => {
    if (!instance) return
    supabase.from('conversations').select('session_id, reason').eq('instancia', instance)
      .then(({ data }) => {
        if (data) {
          const map = {}
          data.forEach(r => { map[r.session_id] = r.reason || 'resolvido' })
          setClosedMap(map)
        }
        setClosedLoaded(true)
      })
  }, [instance])

  // Auto-encerra tickets sem atividade após AUTO_CLOSE_HOURS horas
  useEffect(() => {
    if (autoCloseDone.current || loadingContacts || !closedLoaded || !instance || !contacts.length) return
    autoCloseDone.current = true

    const cutoff = Date.now() - AUTO_CLOSE_HOURS * 3600_000
    const toClose = contacts.filter(c =>
      !closedMap[c.session_id] &&
      c.lastTs &&
      new Date(c.lastTs).getTime() < cutoff &&
      !isWaitingPatient(c)   // esperando o paciente → não encerra
    )
    if (!toClose.length) return

    toClose.forEach(c => {
      supabase.from('conversations').upsert({
        session_id: c.session_id,
        instancia: instance,
        reason: 'auto_encerrado',
        closed_at: new Date().toISOString(),
      }, { onConflict: 'session_id,instancia', ignoreDuplicates: true }).then(() => {})
      supabase.from('attendances').delete().eq('numero', c.session_id).eq('instancia', instance).then(() => {})
    })

    setClosedMap(prev => {
      const next = { ...prev }
      toClose.forEach(c => { next[c.session_id] = 'auto_encerrado' })
      return next
    })
    setAttendancesMap(prev => {
      const next = { ...prev }
      toClose.forEach(c => { delete next[c.session_id] })
      return next
    })
  }, [loadingContacts, closedLoaded, contacts, closedMap, instance])

  // Realtime: nova mensagem
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`convs-msgs-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: CONV_TABLE, filter: `instancia=eq.${instance}` },
        (p) => {
          const row = p.new
          if (!row || isToolMessage(row)) return
          // Ignora mensagens que não são do WhatsApp (Instagram tem tela separada)
          if (row.aplicativo && row.aplicativo !== 'whatsapp') return
          // Mensagem de grupo → tela de grupos, não toca aqui
          if (row.idgrupo) return
          const sid = row.numero
          if (!sid || sid.includes('@g.us')) return
          const incomingType = (row.type || '').toLowerCase()
          const ts = getTimestamp(row)

          // Reabre ticket encerrado: remove do closed e limpa attendance
          setClosedMap(prev => {
            if (!prev[sid]) return prev
            supabase.from('conversations').delete().eq('session_id', sid).eq('instancia', instance)
            supabase.from('attendances').delete().eq('numero', sid).eq('instancia', instance)
            setAttendancesMap(at => { const n = { ...at }; delete n[sid]; return n })
            const next = { ...prev }; delete next[sid]; return next
          })

          const isClientMsg = incomingType === 'cliente' || incomingType === 'human'
          if (isClientMsg && selectedRef.current?.session_id !== sid) {
            setUnreadCounts(prev => ({ ...prev, [sid]: (prev[sid] || 0) + 1 }))
          }

          const newPreview = (row.mensagem || '').trim() || (row.base64 ? '📎 Mídia' : '')
          setContacts(prev => {
            const exists = prev.find(c => c.session_id === sid)
            const isOutsideHuman = incomingType === 'atendente' || incomingType === 'humano'
            if (exists) {
              return [
                { ...exists, lastTs: ts, outsideAssumed: exists.outsideAssumed || isOutsideHuman, preview: newPreview || exists.preview, lastTipo: incomingType },
                ...prev.filter(c => c.session_id !== sid)
              ]
            }
            return [{ session_id: sid, phone: formatPhone(sid), lastTs: ts, outsideAssumed: isOutsideHuman, preview: newPreview, lastTipo: incomingType }, ...prev]
          })

          if (selectedRef.current?.session_id === sid) {
            const sentNome = sentCacheRef.current.find(
              s => s.content === getMessageContent(row) && (Date.now() - s.at) < 30000
            )?.nome || null
            setMessages(msgs => {
              if (msgs.some(m => m.id === row.id)) return msgs
              return [...msgs, {
                id: row.id,
                id_mensagem: row.id_mensagem || null,
                quoted_id_mensagem: row.quoted_id_mensagem || null,
                quoted_text: row.quoted_text || null,
                type: getMessageType(row),
                content: getMessageContent(row),
                base64: row.base64 || null,
                apagada: false,
                nome: sentNome || row.nome || null,
                ts,
              }]
            })
            // O realtime corta payloads grandes (~1 MB): vídeo/PDF chega sem o
            // base64 e a bolha vira só texto até dar F5. Se a mensagem anuncia
            // mídia mas o base64 não veio, busca a linha completa.
            if (!row.base64 && /🎤|🖼️|📄|🎬|📎/.test(row.mensagem || '')) {
              supabase.from(CONV_TABLE)
                .select('id, base64')
                .eq('id', row.id)
                .single()
                .then(({ data }) => {
                  if (data?.base64) {
                    setMessages(msgs => msgs.map(m => m.id === data.id ? { ...m, base64: data.base64 } : m))
                  }
                })
            }
          }
        }
      )
      // Filtra só UPDATEs de exclusão (apagada=true) — dispara apenas quando
      // alguém apaga (raro), não em todo envio. Mantém o realtime leve.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: CONV_TABLE, filter: 'apagada=eq.true' },
        (p) => {
          const row = p.new
          if (!row || !row.apagada) return
          // Só age na conversa aberta (isso já restringe à instância certa)
          if (selectedRef.current?.session_id !== row.numero) return
          setMessages(prev => prev.map(m => m.id === row.id ? { ...m, apagada: true } : m))
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Realtime: conversa encerrada por outro usuário
  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`convs-closed-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `instancia=eq.${instance}` },
        (p) => {
          if (!p.new) return
          setClosedMap(prev => ({ ...prev, [p.new.session_id]: p.new.reason || 'resolvido' }))
          setSelected(prev => prev?.session_id === p.new.session_id ? null : prev)
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  const MSG_PAGE = 50

  // Ao trocar de conversa, cancela qualquer resposta/edição/busca em andamento
  useEffect(() => {
    setReplyingTo(null)
    setEditingMsgId(null)
    setSearchOpen(false)
    setSearchTerm('')
    setSearchResults([])
  }, [selected?.session_id])

  // Carrega mensagens da conversa selecionada (apenas as 50 mais recentes)
  useEffect(() => {
    if (!selected || !instance) return
    setLoadingMsgs(true)
    setMessages([])
    setHasMoreMsgs(false)
    supabase.from(CONV_TABLE).select('*')
      .eq('instancia', instance)
      .eq('numero', selected.session_id)
      .is('idgrupo', null)
      .or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
      .then(({ data, error }) => {
        if (!error && data) {
          const sorted = [...data].reverse()
          setHasMoreMsgs(data.length === MSG_PAGE)
          setMessages(sorted.filter(r => !isToolMessage(r)).map(r => ({
            id: r.id,
            id_mensagem: r.id_mensagem || null,
            quoted_id_mensagem: r.quoted_id_mensagem || null,
            quoted_text: r.quoted_text || null,
            type: getMessageType(r),
            content: getMessageContent(r),
            base64: r.base64 || null,
            apagada: r.apagada || false,
            nome: r.nome || null,
            ts: getTimestamp(r),
          })))
        }
        setLoadingMsgs(false)
      })
  }, [selected, instance])

  async function loadMoreMessages() {
    if (loadingMoreMsgs || !hasMoreMsgs || !selected || !instance) return
    const oldestId = messages[0]?.id
    if (!oldestId) return
    setLoadingMoreMsgs(true)
    const prevScrollHeight = chatBodyRef.current?.scrollHeight || 0
    const { data, error } = await supabase.from(CONV_TABLE)
      .select('*')
      .eq('instancia', instance)
      .eq('numero', selected.session_id)
      .is('idgrupo', null)
      .or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .lt('id', oldestId)
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
    if (!error && data) {
      const sorted = [...data].reverse()
      setHasMoreMsgs(data.length === MSG_PAGE)
      const older = sorted.filter(r => !isToolMessage(r)).map(r => ({
        id: r.id,
        id_mensagem: r.id_mensagem || null,
        quoted_id_mensagem: r.quoted_id_mensagem || null,
        quoted_text: r.quoted_text || null,
        type: getMessageType(r),
        content: getMessageContent(r),
        base64: r.base64 || null,
        apagada: r.apagada || false,
        nome: r.nome || null,
        ts: getTimestamp(r),
      }))
      skipScrollRef.current = true
      setMessages(prev => [...older, ...prev])
      requestAnimationFrame(() => {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - prevScrollHeight
        }
      })
    }
    setLoadingMoreMsgs(false)
  }

  async function handleDeleteMessage(msg) {
    // A mensagem recém-enviada pode ainda não ter id_mensagem (o n8n preenche
    // alguns segundos depois). Se faltar no estado local, busca no banco.
    let idMsg = msg?.id_mensagem
    if (!idMsg && msg?.id) {
      const { data } = await supabase.from(CONV_TABLE).select('id_mensagem').eq('id', msg.id).maybeSingle()
      idMsg = data?.id_mensagem || null
    }
    if (!idMsg) {
      setToast({ message: 'A mensagem ainda está sincronizando. Tente de novo em alguns segundos.', color: '#D97706' })
      setTimeout(() => setToast(null), 3500)
      return
    }
    const contactDigits = (selected?.session_id || '').replace(/\D/g, '')
    const payload = {
      id_mensagem: idMsg,
      fromMe: String(msg.type !== 'cliente'),   // atendente/IA = "true", cliente = "false"
      api: apiInstancia || '',
      instancia: instance || '',
      // Número da conversa (contato) — é o que vai no remoteJid do Evolution numa DM
      numero: contactDigits,
      remoteJid: contactDigits ? `${contactDigits}@s.whatsapp.net` : '',
      // Número da própria empresa (instância) — caso o fluxo precise
      numero_empresa: session?.company?.numero_base || '',
    }
    console.log('[apagarmeg] enviando webhook:', payload)
    // Envia como form-urlencoded (requisição "simples") para NÃO disparar o
    // preflight CORS — assim a requisição chega no n8n mesmo que o webhook não
    // devolva cabeçalho CORS. Os campos chegam em body.* no n8n.
    try {
      await fetch('https://n8n.nexladesenvolvimento.com.br/webhook/apagarmeg', {
        method: 'POST',
        body: new URLSearchParams(payload),
        keepalive: true,
      })
    } catch (e) {
      // O request costuma ser entregue mesmo quando o fetch rejeita (CORS na resposta)
      console.warn('[apagarmeg] fetch rejeitou (provável CORS na resposta; o request foi enviado):', e)
    }
    // Marca como apagada (persistente) e risca na tela
    await supabase.from(CONV_TABLE).update({ apagada: true }).eq('id', msg.id)
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, apagada: true } : m))
    setToast({ message: 'Mensagem apagada.', color: '#16A34A' })
    setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    if (skipScrollRef.current) { skipScrollRef.current = false; return }
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingMsgs])

  // Scroll para o fim ao abrir edição (evita textarea ficar atrás do compositor)
  useEffect(() => {
    if (editingMsgId) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [editingMsgId])

  function handleSelectContact(c) {
    setSelected(c)
    if (!unreadCounts[c.session_id]) return
    setUnreadCounts(prev => { const n = { ...prev }; delete n[c.session_id]; return n })
    const now = new Date().toISOString()
    setReadsMap(prev => ({ ...prev, [c.session_id]: now }))
    if (session?.user?.email) {
      supabase.from('conversation_reads').upsert({
        instancia: instance,
        session_id: c.session_id,
        user_email: session.user.email,
        last_read_at: now,
      }, { onConflict: 'instancia,session_id,user_email' }).then(() => {})
    }
  }

  // Marca como NÃO lida: recua a leitura para antes da última mensagem do
  // paciente, para o contador voltar a acusar pendência.
  async function handleMarkUnread(c) {
    setContextMenu(null)
    const { data } = await supabase.from(CONV_TABLE)
      .select('created_at')
      .eq('numero', c.session_id)
      .eq('instancia', instance)
      .ilike('type', 'cliente')
      .order('created_at', { ascending: false })
      .limit(1)
    const lastClientTs = data?.[0]?.created_at
    if (!lastClientTs) return // sem mensagem do paciente não há o que marcar
    const before = new Date(new Date(lastClientTs).getTime() - 1000).toISOString()

    setUnreadCounts(prev => ({ ...prev, [c.session_id]: prev[c.session_id] || 1 }))
    setReadsMap(prev => ({ ...prev, [c.session_id]: before }))
    // Sai da conversa, senão ela continua aberta "não lida" e confunde
    if (selectedRef.current?.session_id === c.session_id) setSelected(null)

    if (session?.user?.email) {
      await supabase.from('conversation_reads').upsert({
        instancia: instance,
        session_id: c.session_id,
        user_email: session.user.email,
        last_read_at: before,
      }, { onConflict: 'instancia,session_id,user_email' })
    }
  }

  async function handleMarkRead(c) {
    setContextMenu(null)
    setUnreadCounts(prev => { const n = { ...prev }; delete n[c.session_id]; return n })
    const now = new Date().toISOString()
    setReadsMap(prev => ({ ...prev, [c.session_id]: now }))
    if (session?.user?.email) {
      await supabase.from('conversation_reads').upsert({
        instancia: instance,
        session_id: c.session_id,
        user_email: session.user.email,
        last_read_at: now,
      }, { onConflict: 'instancia,session_id,user_email' })
    }
  }

  async function handleAssume(contact, e) {
    e?.stopPropagation()
    if (attendancesMap[contact.session_id] || assuming === contact.session_id) return
    setAssuming(contact.session_id)
    const name = session?.user?.name || 'Atendente'
    const sectorLabel = userSector ? ` (${userSector.name})` : ''

    const payload = {
      numero: contact.session_id,
      instancia: instance,
      sector_id: userSector?.id || null,
      sector_name: userSector?.name || null,
      sector_color: userSector?.color || '#6B7280',
      attendant_name: name,
      attendant_email: session?.user?.email,
      assumed_at: new Date().toISOString(),
    }

    // INSERT sem ON CONFLICT UPDATE — se outro atendente assumiu primeiro,
    // o banco retorna 23505 e a gente confere QUEM é em vez de sobrescrever.
    let { error: insertErr } = await supabase.from('attendances').insert(payload)

    if (insertErr?.code === '23505') {
      // Já existe linha. Pode ser outro atendente de verdade, ou uma linha
      // órfã do ticket anterior correndo contra a limpeza do "finalizar".
      const { data: existing } = await supabase.from('attendances')
        .select('*')
        .eq('numero', contact.session_id)
        .eq('instancia', instance)
        .maybeSingle()

      if (existing && existing.attendant_email !== session?.user?.email) {
        // Outro atendente de verdade — mostra quem e sincroniza a tela.
        setAttendancesMap(prev => ({ ...prev, [contact.session_id]: existing }))
        setAssuming(null)
        setToast({
          message: `Essa conversa já está com ${existing.attendant_name || 'outro atendente'}${existing.sector_name ? ` (${existing.sector_name})` : ''}.`,
          color: '#DC2626',
        })
        setTimeout(() => setToast(null), 4000)
        return
      }

      if (existing) {
        // A linha já era minha (tela desatualizada) — só sincroniza e segue.
        setAttendancesMap(prev => ({ ...prev, [contact.session_id]: existing }))
        setTab('meu-setor')
        setAssuming(null)
        return
      }

      // A linha órfã sumiu entre o insert e a checagem — tenta uma vez mais.
      ;({ error: insertErr } = await supabase.from('attendances').insert(payload))
    }

    if (insertErr) {
      setAssuming(null)
      setToast({ message: 'Não consegui assumir: ' + insertErr.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 4000)
      return
    }

    const assumeMsg = `▶ Atendimento assumido por ${name}${sectorLabel}`
    await supabase.rpc('send_mensagem_geral', {
      p_instancia: instance,
      p_numero: contact.session_id,
      p_mensagem: assumeMsg,
      p_type: 'atendente',
      p_hora: new Date().toISOString(),
    })

    // Assumir NÃO dispara webhook de envio: o fluxo do n8n montava "*Nome*:"
    // e mandava a mensagem vazia pro WhatsApp do paciente. O aviso de assumido
    // fica só na plataforma (send_mensagem_geral acima). Se a IA precisar
    // saber que a conversa foi assumida, o n8n deve consultar a tabela
    // attendances em vez de receber esse ping.

    setAttendancesMap(prev => ({
      ...prev,
      [contact.session_id]: {
        numero: contact.session_id, instancia: instance,
        sector_id: userSector?.id, sector_name: userSector?.name,
        sector_color: userSector?.color || '#6B7280',
        attendant_name: name, attendant_email: session?.user?.email,
      }
    }))
    setTab('meu-setor')
    setAssuming(null)
  }

  async function handlePullConversation(contact) {
    const att = attendancesMap[contact.session_id]
    if (!att) return
    const meName = session?.user?.name || 'Atendente'
    const meEmail = session?.user?.email

    const { data: memberData } = await supabase
      .from('sector_members')
      .select('sector_id, sectors(id, name, color)')
      .eq('user_id', session?.user?.id)
      .maybeSingle()
    const mySector = memberData?.sectors || null

    const updated = {
      attendant_name:  meName,
      attendant_email: meEmail,
      sector_id:    mySector?.id ?? att.sector_id ?? null,
      sector_name:  mySector?.name ?? att.sector_name ?? null,
      sector_color: mySector?.color ?? att.sector_color ?? '#6B7280',
    }

    const { error } = await supabase
      .from('attendances')
      .update(updated)
      .eq('numero', contact.session_id)
      .eq('instancia', instance)

    if (error) {
      setToast({ message: 'Erro ao puxar conversa: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
      return
    }

    const prevName = att.attendant_name || 'outro atendente'
    await supabase.rpc('send_mensagem_geral', {
      p_instancia: instance,
      p_numero: contact.session_id,
      p_mensagem: `↩ Atendimento retomado por ${meName} (era de ${prevName})`,
      p_type: 'atendente',
      p_hora: new Date().toISOString(),
    })

    setAttendancesMap(prev => ({
      ...prev,
      [contact.session_id]: { ...(prev[contact.session_id] || {}), ...updated },
    }))
    setToast({ message: `Conversa puxada para você`, color: '#16A34A' })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleTransfer() {
    if (!transferModal || !transferringTo || transferring) return
    const target = companyUsers.find(u => u.email === transferringTo)
    if (!target) return
    setTransferring(true)

    // Tenta achar o setor do novo atendente
    const { data: memberData } = await supabase
      .from('sector_members')
      .select('sector_id, sectors(id, name, color)')
      .eq('user_id', target.id)
      .maybeSingle()
    const targetSector = memberData?.sectors || null

    const updated = {
      attendant_name: target.name,
      attendant_email: target.email,
      sector_id:    targetSector?.id ?? null,
      sector_name:  targetSector?.name ?? null,
      sector_color: targetSector?.color ?? '#6B7280',
    }

    const { error } = await supabase
      .from('attendances')
      .update(updated)
      .eq('numero', transferModal.session_id)
      .eq('instancia', instance)

    if (error) {
      setTransferring(false)
      setToast({ message: 'Erro ao transferir: ' + error.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
      return
    }

    // Mensagem-marco no histórico
    const meName = session?.user?.name || 'Atendente'
    const handoverMsg = `↪ Atendimento transferido por ${meName} para ${target.name}`
    await supabase.rpc('send_mensagem_geral', {
      p_instancia: instance,
      p_numero: transferModal.session_id,
      p_mensagem: handoverMsg,
      p_type: 'atendente',
      p_hora: new Date().toISOString(),
    })

    setAttendancesMap(prev => ({
      ...prev,
      [transferModal.session_id]: {
        ...(prev[transferModal.session_id] || {}),
        ...updated,
      },
    }))
    setTransferring(false)
    setTransferModal(null)
    setTransferringTo('')
    setToast({ message: `Conversa transferida pra ${target.name}`, color: '#7C3AED' })
    setTimeout(() => setToast(null), 3500)
  }

  async function startRecording() {
    if (recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm'
      const mr = new MediaRecorder(stream, { mimeType })
      mr._stream = stream
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorderRef.current = mr
      recordStartRef.current = Date.now()
      mr.start()
      setRecording(true)
      setRecordTime(0)
      recordTimerRef.current = setInterval(() => {
        setRecordTime(Math.floor((Date.now() - recordStartRef.current) / 1000))
      }, 500)
    } catch (e) {
      console.error('Erro ao acessar microfone:', e)
      setToast({ message: 'Não foi possível acessar o microfone', color: '#DC2626' })
      setTimeout(() => setToast(null), 3000)
    }
  }

  function stopRecording({ persistPreview = true } = {}) {
    return new Promise(resolve => {
      const mr = mediaRecorderRef.current
      if (!mr) return resolve(null)
      mr.onstop = async () => {
        const mimeType = mr.mimeType
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const buf = await blob.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        const base64 = btoa(bin)
        const duration = Math.floor((Date.now() - recordStartRef.current) / 1000)
        const audioData = { base64, mime: mimeType, duration }
        if (persistPreview) setRecordedAudio(audioData)
        mr._stream?.getTracks().forEach(t => t.stop())
        resolve(audioData)
      }
      mr.stop()
      if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
      setRecording(false)
    })
  }

  function discardAudio() {
    setRecordedAudio(null)
    setRecordTime(0)
  }

  async function handlePickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // O arquivo viaja como base64 (~1,33x o tamanho) num JSON até o Supabase e
    // o n8n — que corta em 16 MB. Acima de ~10 MB o envio quebra nos dois.
    const MAX = 10 * 1024 * 1024
    if (file.size > MAX) {
      setToast({ message: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB) — o limite é 10 MB.`, color: '#DC2626' })
      setTimeout(() => setToast(null), 5000)
      return
    }
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    }
    const base64 = btoa(bin)
    const kind = file.type.startsWith('image/') ? 'image'
      : file.type === 'application/pdf' ? 'pdf'
      : file.type.startsWith('video/') ? 'video'
      : 'file'
    setAttachedFile({ base64, mime: file.type || 'application/octet-stream', name: file.name, size: file.size, kind })
  }

  function discardFile() {
    setAttachedFile(null)
  }

  // Helper: usuário atual pode responder essa conversa?
  // Regra: dono da conversa OU admin OU conversa ainda sem atendimento.
  function canRespond(contact) {
    if (!contact) return false
    if (closedMap[contact.session_id]) return false
    const att = attendancesMap[contact.session_id]
    if (!att) return true
    if (isAdmin) return true
    return att.attendant_email === session?.user?.email
  }

  async function handleSend() {
    if (sending || !selected) return
    if (!canRespond(selected)) {
      const att = attendancesMap[selected.session_id]
      setToast({
        message: `Conversa em atendimento por ${att?.attendant_name || 'outro atendente'}. Peça pra ele transferir ou finalize antes.`,
        color: '#DC2626',
      })
      setTimeout(() => setToast(null), 4000)
      return
    }
    let audio = recordedAudio
    if (recording) {
      audio = await stopRecording({ persistPreview: false })
    }
    if (!msgText.trim() && !audio && !attachedFile) return
    setSending(true)
    try {
      // Auto-assume se ainda não está atribuído a ninguém
      if (!attendancesMap[selected.session_id] && !closedMap[selected.session_id]) {
        const name = session?.user?.name || 'Atendente'
        const newAtt = {
          numero: selected.session_id, instancia: instance,
          sector_id: userSector?.id || null,
          sector_name: userSector?.name || null,
          sector_color: userSector?.color || '#6B7280',
          attendant_name: name, attendant_email: session?.user?.email,
          assumed_at: new Date().toISOString(),
        }
        await supabase.from('attendances').upsert(newAtt, { onConflict: 'numero,instancia' })
        setAttendancesMap(prev => ({ ...prev, [selected.session_id]: newAtt }))
        setTab('meu-setor')
      }
      const text = msgText.trim()
      const file = attachedFile
      // Foto do reply antes de limpar o estado (o envio é assíncrono)
      const replySnap = replyingTo
      setReplyingTo(null)
      setMsgText('')
      setRecordedAudio(null)
      setRecordTime(0)
      setAttachedFile(null)

      const filePrefix = file
        ? (file.kind === 'image' ? '🖼️ ' : file.kind === 'pdf' ? '📄 ' : file.kind === 'video' ? '🎬 ' : '📎 ') + file.name
        : null
      const mensagemPayload = audio
        ? (text || '🎤 Áudio')
        : file
          ? (text ? `${filePrefix}\n${text}` : filePrefix)
          : text
      const mediaBase64 = audio?.base64 || file?.base64 || null
      const senderName = session?.user?.name || null
      sentCacheRef.current = [
        { content: mensagemPayload, nome: senderName, at: Date.now() },
        ...sentCacheRef.current.filter(s => Date.now() - s.at < 30000),
      ]
      // Monta os params. p_quoted só entra quando é resposta — assim o envio
      // normal não depende da migration que adicionou esse parâmetro.
      const rpcParams = {
        p_instancia: instance,
        p_numero: selected.session_id,
        p_mensagem: mensagemPayload,
        p_type: 'atendente',
        p_hora: new Date().toISOString(),
        p_base64: mediaBase64,
        p_nome: senderName,
      }
      if (replySnap?.id_mensagem) rpcParams.p_quoted = replySnap.id_mensagem
      let { error: insErr } = await supabase.rpc('send_mensagem_geral', rpcParams)
      // Se a migration do reply ainda não rodou, reenvia sem o vínculo (a
      // mensagem vai igual, só não fica marcada como resposta no banco).
      if (insErr && rpcParams.p_quoted && /p_quoted|schema cache|PGRST202|could not find/i.test(insErr.message || insErr.code || '')) {
        delete rpcParams.p_quoted
        ;({ error: insErr } = await supabase.rpc('send_mensagem_geral', rpcParams))
        setToast({ message: 'Mensagem enviada, mas a resposta citada precisa da migration no Supabase.', color: '#D97706' })
        setTimeout(() => setToast(null), 5000)
      }
      if (insErr) console.error('send_mensagem_geral:', insErr)

      // Respondendo uma mensagem → webhook próprio (monta o quote na Evolution)
      const webhookUrl = replySnap
        ? 'https://n8n.nexladesenvolvimento.com.br/webhook/respondermensagem'
        : 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla'
      const quotedPayload = replySnap ? {
        quoted_id:        replySnap.id_mensagem,
        quoted_text:      replySnap.content,
        // A original era nossa (atendente/IA)? A Evolution precisa disso pra key
        quoted_fromMe:    ['atendente', 'humano', 'ia', 'bot'].includes((replySnap.type || '').toLowerCase()),
        quoted_remoteJid: replySnap.numero,
      } : {}

      // Aguarda resposta do n8n (retorna instancia + mensagem + id_mensagem) para gravar no banco
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mensagem: mensagemPayload,
          audio_base64: audio?.base64 || null,
          audio_mime: audio?.mime || null,
          audio_duration: audio?.duration || null,
          file_base64: file?.base64 || null,
          file_mime: file?.mime || null,
          file_name: file?.name || null,
          file_kind: file?.kind || null,
          session_id: selected.session_id,
          phone: selected.phone,
          instancia: instance,
          api_instancia: apiInstancia,
          ai_enabled: session?.company?.ai_enabled !== false,
          company: session?.company?.name,
          sender_name: session?.user?.name,
          sender_email: session?.user?.email,
          ...quotedPayload,
        }),
      })
        .then(r => r.text())
        .then(async text => {
          // Nó de erro do n8n (Respond to Webhook) devolve texto começando com
          // "ERRO" quando o WhatsApp recusou o envio — avisa e marca a bolha.
          if (/^ERRO/i.test((text || '').trim())) {
            setToast({
              message: '⚠️ O WhatsApp está com instabilidade e essa mensagem NÃO foi entregue. Tente enviar de novo.',
              color: '#DC2626',
            })
            setTimeout(() => setToast(null), 7000)
            setMessages(prev => {
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].type === 'atendente' && prev[i].content === mensagemPayload) {
                  const n = [...prev]; n[i] = { ...n[i], falhou: true }; return n
                }
              }
              return prev
            })
            return
          }
          // Resposta do n8n: instancia / mensagem / id_mensagem, uma por linha.
          // A mensagem pode ter quebra de linha, então ancora pelas pontas
          // (1ª = instancia, última = id) e o miolo é a mensagem inteira.
          const lines = text.trim().split('\n')
          if (lines.length < 3) return
          const instResp = lines[0].trim()
          const msgId    = lines[lines.length - 1].trim()
          const msgResp  = lines.slice(1, -1).join('\n').trim()
          if (!msgId || !instResp || !msgResp) return
          // id_mensagem nunca tem espaço — se tiver, o corte saiu errado e
          // gravar isso apontaria a lixeira pra mensagem errada no WhatsApp.
          if (/\s/.test(msgId)) return
          // Acha a linha pelo conteúdo da mensagem + instancia + numero (mais recente)
          const { data: row } = await supabase
            .from('mensagens_geral')
            .select('id')
            .eq('instancia', instResp)
            .eq('numero', selected.session_id)
            .eq('mensagem', msgResp)
            .eq('type', 'atendente')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (row?.id) {
            supabase.from('mensagens_geral')
              .update({ id_mensagem: msgId })
              .eq('id', row.id)
              .then(() => {})
            // Propaga pro estado local pra lixeira aparecer sem precisar recarregar
            setMessages(prev => prev.map(m => m.id === row.id ? { ...m, id_mensagem: msgId } : m))
          }
        })
        .catch(e => console.warn('webhook envio:', e))
    } finally {
      setSending(false)
    }
  }

  async function handleSaveEdit(msg) {
    const newText = editingText.trim()
    if (!newText || savingEdit) return
    setSavingEdit(true)
    try {
      // Busca id_mensagem atualizado do banco (pode ter sido preenchido pelo n8n após o envio)
      const { data: fresh } = await supabase
        .from('mensagens_geral')
        .select('id_mensagem')
        .eq('id', msg.id)
        .maybeSingle()
      const id_mensagem = fresh?.id_mensagem || msg.id_mensagem

      const res = await fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexlaeditar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msg.id,
          id_mensagem,
          message: newText,
          session_id: selected?.session_id,
          phone: selected?.phone,
          instancia: instance,
          api_instancia: apiInstancia,
          ai_enabled: session?.company?.ai_enabled !== false,
          company: session?.company?.name,
          sender_name: session?.user?.name,
          sender_email: session?.user?.email,
        }),
      })
      if (!res.ok) throw new Error('status ' + res.status)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: newText } : m))
      setEditingMsgId(null)
      setEditingText('')
      setToast({ message: 'Mensagem editada', color: '#16A34A' })
      setTimeout(() => setToast(null), 2500)
    } catch (e) {
      setToast({ message: 'Erro ao editar: ' + e.message, color: '#DC2626' })
      setTimeout(() => setToast(null), 3500)
    } finally {
      setSavingEdit(false)
    }
  }

  // Começa a responder uma mensagem (cita ela). Só dá pra citar mensagem que
  // já tem id_mensagem do WhatsApp — sem ele a Evolution não sabe o que citar.
  function startReply(msg) {
    if (!msg?.id_mensagem) return
    const clean = (msg.content || '').replace(/^\*[^*]+\*:\n?/, '').trim()
    setReplyingTo({
      id_mensagem: msg.id_mensagem,
      content: clean.slice(0, 200) || (msg.base64 ? '📎 Mídia' : ''),
      type: msg.type,
      numero: selected?.session_id,
    })
    setEditingMsgId(null)
    setTimeout(() => composerRef.current?.focus(), 30)
  }

  // Rola até a mensagem original citada e dá um flash de destaque nela.
  function scrollToOriginal(idMensagem) {
    if (!idMensagem) return
    const el = document.querySelector(`[data-msg-id="${CSS.escape(idMensagem)}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'box-shadow 0.25s, transform 0.25s'
    el.style.boxShadow = '0 0 0 3px #16A34A88'
    el.style.borderRadius = '10px'
    el.style.transform = 'scale(1.015)'
    setTimeout(() => { el.style.boxShadow = 'none'; el.style.transform = 'none' }, 1100)
  }

  // Rola até uma mensagem pelo id do banco (usado pela busca) e destaca em azul.
  function flashDbMessage(id) {
    const el = document.querySelector(`[data-db-id="${id}"]`)
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'box-shadow 0.25s, transform 0.25s'
    el.style.boxShadow = '0 0 0 3px #2563EB99'
    el.style.borderRadius = '10px'
    el.style.transform = 'scale(1.015)'
    setTimeout(() => { el.style.boxShadow = 'none'; el.style.transform = 'none' }, 1300)
    return true
  }

  // Mapeia uma linha do banco pro formato de mensagem da tela.
  function rowToMsg(r) {
    return {
      id: r.id,
      id_mensagem: r.id_mensagem || null,
      quoted_id_mensagem: r.quoted_id_mensagem || null,
      quoted_text: r.quoted_text || null,
      type: getMessageType(r),
      content: getMessageContent(r),
      base64: r.base64 || null,
      apagada: r.apagada || false,
      nome: r.nome || null,
      ts: getTimestamp(r),
    }
  }

  // Busca dentro da conversa (histórico inteiro, não só o que está carregado).
  useEffect(() => {
    if (!searchOpen || !selected || !instance) return
    const q = searchTerm.trim()
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return }
    let cancel = false
    setSearchLoading(true)
    const esc = q.replace(/[\\%_]/g, s => '\\' + s)
    const h = setTimeout(async () => {
      const { data } = await supabase.from(CONV_TABLE)
        .select('*')
        .eq('instancia', instance)
        .eq('numero', selected.session_id)
        .is('idgrupo', null)
        .or('aplicativo.eq.whatsapp,aplicativo.is.null')
        .ilike('mensagem', `%${esc}%`)
        .order('id', { ascending: false })
        .limit(80)
      if (cancel) return
      setSearchResults((data || []).filter(r => !isToolMessage(r) && !r.apagada))
      setSearchLoading(false)
    }, 300)
    return () => { cancel = true; clearTimeout(h) }
  }, [searchTerm, searchOpen, selected?.session_id, instance])

  // Pula pra uma mensagem achada na busca. Se ela for antiga (fora da janela
  // carregada), busca o intervalo até ela antes de rolar.
  async function jumpToSearchResult(row) {
    if (messages.some(m => m.id === row.id)) { flashDbMessage(row.id); return }
    setJumpingTo(row.id)
    const oldestId = messages[0]?.id
    let query = supabase.from(CONV_TABLE).select('*')
      .eq('instancia', instance).eq('numero', selected.session_id)
      .is('idgrupo', null).or('aplicativo.eq.whatsapp,aplicativo.is.null')
      .gte('id', row.id).order('id', { ascending: false }).limit(1000)
    if (oldestId) query = query.lt('id', oldestId)
    const { data } = await query
    if (data) {
      const mapped = [...data].reverse().filter(r => !isToolMessage(r)).map(rowToMsg)
      setMessages(prev => {
        const have = new Set(prev.map(m => m.id))
        return [...mapped.filter(m => !have.has(m.id)), ...prev]
      })
      setHasMoreMsgs(true) // ainda pode haver mais antigas antes do resultado
    }
    setJumpingTo(null)
    // espera o React pintar as novas bolhas antes de rolar
    setTimeout(() => flashDbMessage(row.id), 180)
  }

  // Trecho do resultado com o termo destacado (janela em volta do match).
  function searchSnippet(row, term) {
    const t = getMessageContent(row)
    const q = term.trim()
    const i = t.toLowerCase().indexOf(q.toLowerCase())
    if (i < 0) return t
    const start = Math.max(0, i - 24)
    return (
      <>
        {start > 0 ? '…' : ''}{t.slice(start, i)}
        <mark style={{ background: '#FDE68A', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>{t.slice(i, i + q.length)}</mark>
        {t.slice(i + q.length)}
      </>
    )
  }
  function searchWho(row) {
    const ty = (row.type || '').toLowerCase()
    if (ty === 'cliente') return resolveName(selected?.phone) !== selected?.phone ? resolveName(selected?.phone) : 'Cliente'
    if (ty === 'atendente' || ty === 'humano') return row.nome || 'Você'
    return 'IA'
  }
  function searchDate(row) {
    const ts = getTimestamp(row)
    if (!ts) return ''
    const d = new Date(ts)
    if (isNaN(d)) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  async function handleReopen(contact) {
    if (!contact || !instance) return
    await supabase.from('conversations').delete().eq('session_id', contact.session_id).eq('instancia', instance)
    await supabase.from('attendances').delete().eq('numero', contact.session_id).eq('instancia', instance)
    setClosedMap(prev => { const n = { ...prev }; delete n[contact.session_id]; return n })
    setAttendancesMap(prev => { const n = { ...prev }; delete n[contact.session_id]; return n })
    setTab('recepcao')
    setToast({ message: 'Conversa reaberta', color: '#16A34A' })
    setTimeout(() => setToast(null), 2500)
  }

  async function handleClose() {
    if (!reason || !closeModal) return
    const ids = closeModal.bulk ? [...selectedIds] : [closeModal.session_id]
    if (!ids.length) return
    setClosing(true)
    const nowISO = new Date().toISOString()
    const { error } = await supabase.from('conversations').upsert(
      ids.map(sid => ({ session_id: sid, instancia: instance, reason, closed_at: nowISO })),
      { onConflict: 'session_id,instancia' }
    )
    if (error) { setClosing(false); return }
    // Espera a limpeza dos atendimentos aterrissar. Sem o await, reabrir e
    // assumir logo em seguida corre contra esse delete e bate na trava de
    // duplicidade ("já foi assumida por outro atendente" sem ter ninguém).
    await Promise.all(ids.map(sid =>
      supabase.from('attendances').delete().eq('numero', sid).eq('instancia', instance)
    ))
    setClosing(false)
    setClosedMap(prev => { const n = { ...prev }; ids.forEach(sid => { n[sid] = reason }); return n })
    setAttendancesMap(prev => { const n = { ...prev }; ids.forEach(sid => delete n[sid]); return n })
    if (selected && ids.includes(selected.session_id)) setSelected(null)
    setSelectedIds([])
    setCloseModal(null)
    setReason('')
    setTab('finalizados')
    const label = findReason(reason)?.label || reason
    const color = findReason(reason)?.color || '#16A34A'
    setToast({ message: ids.length > 1 ? `${ids.length} conversas finalizadas — ${label}` : `Conversa finalizada — ${label}`, color })
    setTimeout(() => setToast(null), 3500)
  }

  // Resolve nome do contato: saved_contacts > clientes.nome > clientes.pushname > telefone
  function resolveName(phone) {
    const clean = (phone || '').replace(/\D/g, '')
    return savedContacts[clean]?.nome
        || clientesMap[clean]?.nome
        || clientesMap[clean]?.pushname
        || phone
  }

  const closed = new Set(Object.keys(closedMap))
  const recepcao    = contacts.filter(c => !closed.has(c.session_id) && !attendancesMap[c.session_id])
  const meuSetor    = contacts.filter(c => !closed.has(c.session_id) && attendancesMap[c.session_id] &&
    (isAdmin || !userSector || attendancesMap[c.session_id].sector_id === userSector.id))
  const finalizados = contacts.filter(c => closed.has(c.session_id))

  const tabList = [
    { id: 'recepcao',    label: 'Recepção',              icon: Inbox,      count: recepcao.length },
    { id: 'meu-setor',  label: isAdmin ? 'Setores' : 'Meu setor', icon: UserCheck, count: meuSetor.length },
    { id: 'finalizados', label: 'Finalizados',            icon: Archive,    count: finalizados.length },
  ]

  const currentList = tab === 'recepcao' ? recepcao : tab === 'meu-setor' ? meuSetor : finalizados
  const tagMatch = buildTagFilter(tagFilter, tagAssignments)
  const filtered = currentList
    .filter(c => {
      if (!search) return true
      const cleanNum = c.phone.replace(/\D/g, '')
      const nome = resolveName(c.phone)
      const searchDigits = search.replace(/\D/g, '')
      const phoneMatch = searchDigits.length > 0 && cleanNum.includes(searchDigits)
      const nameMatch = nome.toLowerCase().includes(search.toLowerCase())
      return phoneMatch || nameMatch
    })
    .filter(c => tagMatch(c.phone))
    .filter(c => !onlyUnread || unreadCounts[c.session_id] > 0)
  const isClosed = selected ? closed.has(selected.session_id) : false

  // Seleção múltipla (só nas abas não-finalizadas)
  const selectableIds = filtered.map(c => c.session_id)
  const allSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length
  const toggleSelect = (sid) => setSelectedIds(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid])
  const toggleAll = () => setSelectedIds(allSelected ? [] : selectableIds)

  return (
    <div className={`contacts-root ${selected ? 'has-selected' : ''}`}>
      <div className="contacts-list">
        {/* Abas */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          {tabList.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(null); setSelectedIds([]) }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid #2563EB' : '2px solid transparent',
                color: tab === t.id ? '#2563EB' : 'var(--text-muted)',
                fontSize: 11, fontWeight: tab === t.id ? 700 : 500,
                transition: 'all 0.15s',
              }}
            >
              <t.icon size={14} />
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, minWidth: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 20, padding: '0 4px',
                  background: tab === t.id ? '#2563EB' : '#E2E8F0',
                  color: tab === t.id ? '#fff' : 'var(--text-muted)',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="contacts-list-header" style={{ paddingTop: 10 }}>
          <input
            className="contacts-search"
            placeholder="Buscar por telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TagFilter instancia={instance} value={tagFilter} onChange={setTagFilter} />
            <button
              type="button"
              onClick={() => setOnlyUnread(v => !v)}
              title="Mostrar só conversas não lidas"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                background: onlyUnread ? '#2563EB' : '#fff',
                color: onlyUnread ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${onlyUnread ? '#2563EB' : 'var(--border)'}`,
              }}
            >
              <Inbox size={13} /> Não lidas
            </button>
          </div>
        </div>

        {tab !== 'finalizados' && filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: selectedIds.length ? '#EFF6FF' : 'var(--bg-surface)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 15, height: 15, cursor: 'pointer' }} />
              {selectedIds.length ? `${selectedIds.length} selecionada${selectedIds.length > 1 ? 's' : ''}` : 'Selecionar todas'}
            </label>
            {selectedIds.length > 0 && (
              <>
                <button onClick={() => setSelectedIds([])} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Limpar</button>
                <button onClick={() => { setCloseModal({ bulk: true }); setReason('') }}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16A34A', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  <CheckCircle2 size={13} /> Encerrar {selectedIds.length}
                </button>
              </>
            )}
          </div>
        )}

        <div className="contacts-list-body">
          {loadingContacts && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
          )}
          {!loadingContacts && filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhuma conversa aqui.
            </div>
          )}
          {filtered.map(c => {
            const att = attendancesMap[c.session_id]
            const isAssuming = assuming === c.session_id
            const closedReason = closedMap[c.session_id]
            const rs = closedReason ? findReason(closedReason) : null
            const cleanNum = c.phone.replace(/\D/g, '')
            const saved = savedContacts[cleanNum]
            const cliente = clientesMap[cleanNum]
            const displayName = saved?.nome || cliente?.nome || cliente?.pushname || null
            const nextAppt = futureAppts[cleanNum]
            return (
              <div
                key={c.session_id}
                className={`contact-item ${selected?.session_id === c.session_id ? 'selected' : ''} ${unreadCounts[c.session_id] ? 'unread' : ''}`}
                onClick={() => handleSelectContact(c)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, contact: c })
                }}
              >
                {tab !== 'finalizados' && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.session_id)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggleSelect(c.session_id)}
                    style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer', marginRight: 2 }}
                  />
                )}
                {(() => {
                  const contactPhoto = toImgSrc(saved?.photo) || toImgSrc(cliente?.foto)
                  return (
                    <div className="contact-avatar" style={contactPhoto ? { background: 'transparent', overflow: 'hidden' } : {}}>
                      {contactPhoto
                        ? <img src={contactPhoto} alt={displayName || c.phone} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : displayName
                          ? <span style={{ fontWeight: 700, fontSize: 12, color: '#2563EB' }}>{displayName.charAt(0).toUpperCase()}</span>
                          : <User size={14} style={{ opacity: 0.4 }} />}
                    </div>
                  )
                })()}
                <div className="contact-info" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <div className="contact-name" style={{ fontWeight: unreadCounts[c.session_id] ? 800 : displayName ? 600 : 400 }}>
                      {displayName || c.phone}
                    </div>
                    {displayName && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.phone}</span>
                    )}
                    <TagList tags={tagsOf(c.phone)} max={2} size="sm" />
                    {nextAppt && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                        color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE',
                        lineHeight: '16px',
                      }}>
                        <Calendar size={9} /> {formatApptShort(nextAppt.starts_at)}
                      </span>
                    )}
                    {tab === 'recepcao' && c.outsideAssumed && (
                      <span title="Alguém respondeu direto pelo WhatsApp, fora da plataforma" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', lineHeight: '16px' }}>
                        <PhoneCall size={9} /> Atendido fora
                      </span>
                    )}
                    {tab === 'recepcao' && aiEnabled && !c.outsideAssumed && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', lineHeight: '16px' }}>
                        <Sparkles size={9} /> IA
                      </span>
                    )}
                    {tab === 'meu-setor' && att && (
                      <>
                        {att.sector_name && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: '#fff', background: att.sector_color || '#6B7280', lineHeight: '16px' }}>
                            {att.sector_name}
                          </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', lineHeight: '16px' }}>
                          <Headset size={9} /> {att.attendant_name?.split(' ')[0]}
                        </span>
                      </>
                    )}
                    {tab === 'finalizados' && rs && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`, lineHeight: '16px' }}>{rs.label}</span>
                    )}
                    {tab !== 'finalizados' && isWaitingPatient(c) && (
                      <span title="O atendente já respondeu — aguardando o paciente responder" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', lineHeight: '16px' }}>
                        ⏳ Aguardando paciente
                      </span>
                    )}
                  </div>
                  {c.preview && (
                    <div style={{
                      fontSize: 12,
                      color: unreadCounts[c.session_id] ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: unreadCounts[c.session_id] ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%', marginTop: 2,
                    }}>
                      {c.preview}
                    </div>
                  )}
                  {tab === 'recepcao' && (
                    <button
                      onClick={e => handleAssume(c, e)}
                      disabled={isAssuming}
                      style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#16A34A', color: '#fff', border: 'none', cursor: 'pointer', opacity: isAssuming ? 0.6 : 1 }}
                    >
                      <Headset size={10} />
                      {isAssuming ? 'Assumindo...' : 'Assumir atendimento'}
                    </button>
                  )}
                </div>
                <div className="contact-meta">
                  {c.lastTs && <div className="contact-time" style={{ fontWeight: unreadCounts[c.session_id] ? 700 : 400, color: unreadCounts[c.session_id] ? '#2563EB' : undefined }}>{formatContactTime(c.lastTs)}</div>}
                  {unreadCounts[c.session_id] > 0 && (
                    <div style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#2563EB', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', marginTop: 3 }}>
                      {unreadCounts[c.session_id] > 99 ? '99+' : unreadCounts[c.session_id]}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="chat-panel">
        {!selected ? (
          <div className="chat-empty">
            <MessageSquare size={32} style={{ opacity: 0.2 }} />
            <div style={{ fontSize: 14 }}>Selecione uma conversa</div>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <button
                type="button"
                className="chat-back-mobile"
                onClick={() => setSelected(null)}
                aria-label="Voltar para a lista">
                <ChevronLeft size={20} />
              </button>
              {(() => {
                const cleanNum = selected.phone.replace(/\D/g, '')
                const saved = savedContacts[cleanNum]
                const cliente = clientesMap[cleanNum]
                const headerName = saved?.nome || cliente?.nome || cliente?.pushname || null
                return (
                  <>
                    {(() => {
                      const headerPhoto = toImgSrc(saved?.photo) || toImgSrc(cliente?.foto)
                      return (
                        <div className="contact-avatar"
                          style={{
                            width: 38, height: 38,
                            background: headerPhoto ? 'transparent' : undefined,
                            overflow: 'hidden',
                            cursor: saved ? 'pointer' : 'default',
                          }}
                          onClick={() => saved && navigate(`/painel/contatos/${saved.id}`)}
                          title={saved ? 'Abrir ficha do paciente' : ''}
                        >
                          {headerPhoto
                            ? <img src={headerPhoto} alt={headerName || selected.phone} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : headerName
                              ? <span style={{ fontWeight: 700, fontSize: 14, color: '#2563EB' }}>{headerName.charAt(0).toUpperCase()}</span>
                              : <User size={14} style={{ opacity: 0.4 }} />}
                        </div>
                      )
                    })()}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)', cursor: saved ? 'pointer' : 'default' }}
                        onClick={() => saved && navigate(`/painel/contatos/${saved.id}`)}
                      >
                        {headerName || selected.phone}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {headerName && <span style={{ fontFamily: 'monospace' }}>{selected.phone}</span>}
                        {!loadingMsgs && <span>{messages.length} mensagem(ns)</span>}
                      </div>
                    </div>
                  </>
                )
              })()}
              <button
                className="nx-btn-ghost"
                style={{ fontSize: 12, padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 6, color: searchOpen ? '#2563EB' : 'var(--text-muted)', borderColor: searchOpen ? '#BFDBFE' : undefined, background: searchOpen ? '#EFF6FF' : undefined }}
                onClick={() => setSearchOpen(v => !v)}
                title="Pesquisar nesta conversa"
              >
                <Search size={15} /> <span className="btn-label">Pesquisar</span>
              </button>
              {!isClosed && (() => {
                const cleanNum = selected.phone.replace(/\D/g, '')
                const saved = savedContacts[cleanNum]
                const nome = saved?.nome || ''
                const hasContact = !!saved
                return (
                  <>
                    <TagPicker
                      instancia={instance}
                      numero={selected.phone}
                      userEmail={session?.user?.email}
                      anchor="bottom-right"
                    />
                    <button
                      className="nx-btn-ghost"
                      style={{
                        fontSize: 12, padding: '7px 14px',
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: hasContact ? '#16A34A' : '#C9A074',
                        borderColor: hasContact ? '#BBF7D0' : '#F0E0B6',
                        background: hasContact ? '#F0FDF4' : '#FFFBEB',
                      }}
                      title={hasContact ? `Já salvo como ${saved.nome}` : 'Salvar contato pra aparecer com nome'}
                      onClick={() => openSaveContact(selected)}
                    >
                      {hasContact ? <UserCheck size={14} /> : <UserPlus size={14} />}
                      <span className="btn-label">{hasContact ? `Editar ${saved.nome}` : 'Salvar contato'}</span>
                    </button>
                    <button
                      className="nx-btn-ghost"
                      style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, color: '#7C3AED' }}
                      onClick={() => navigate(`/painel/agenda?numero=${cleanNum}${nome ? `&nome=${encodeURIComponent(nome)}` : ''}`)}
                    >
                      <Calendar size={14} /> <span className="btn-label">Agendar</span>
                    </button>
                    {(() => {
                      const att = attendancesMap[selected.session_id]
                      const myEmail = session?.user?.email
                      const isOwner = att?.attendant_email === myEmail
                      const isElse  = att && !isOwner

                      return (
                        <>
                          {/* Transferir — só o dono ou admin vê */}
                          {att && (isOwner || isAdmin) && (
                            <button
                              className="nx-btn-ghost"
                              style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, color: '#0891B2' }}
                              onClick={() => { setTransferModal(selected); setTransferringTo('') }}
                              title="Passar essa conversa pra outro atendente"
                            >
                              <ArrowRightLeft size={14} /> <span className="btn-label">Transferir</span>
                            </button>
                          )}
                          {/* Puxar para mim — quando está com outro atendente */}
                          {isElse && (
                            <button
                              className="nx-btn-ghost"
                              style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6, color: '#D97706', borderColor: '#FDE68A', background: '#FFFBEB' }}
                              onClick={() => handlePullConversation(selected)}
                              title={`Puxar de volta de ${att.attendant_name || 'outro atendente'}`}
                            >
                              <Inbox size={14} /> <span className="btn-label">Puxar para mim</span>
                            </button>
                          )}
                        </>
                      )
                    })()}
                    {(() => {
                      const att = attendancesMap[selected.session_id]
                      const isOwner = !att || isAdmin || att.attendant_email === session?.user?.email
                      if (!isOwner) return null
                      return (
                        <button
                          className="nx-btn-ghost"
                          style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => { setCloseModal(selected); setReason('') }}
                        >
                          <CheckCircle2 size={14} /> <span className="btn-label">Finalizar conversa</span>
                        </button>
                      )
                    })()}
                  </>
                )
              })()}
              {isClosed && (
                <>
                  <TagPicker
                    instancia={instance}
                    numero={selected.phone}
                    userEmail={session?.user?.email}
                    anchor="bottom-right"
                  />
                  {(() => {
                    const cleanNum = selected.phone.replace(/\D/g, '')
                    const saved = savedContacts[cleanNum]
                    const hasContact = !!saved
                    return (
                      <button
                        className="nx-btn-ghost"
                        style={{
                          fontSize: 12, padding: '7px 14px',
                          display: 'flex', alignItems: 'center', gap: 6,
                          color: hasContact ? '#16A34A' : '#C9A074',
                          borderColor: hasContact ? '#BBF7D0' : '#F0E0B6',
                          background: hasContact ? '#F0FDF4' : '#FFFBEB',
                        }}
                        title={hasContact ? `Já salvo como ${saved.nome}` : 'Salvar contato pra aparecer com nome'}
                        onClick={() => openSaveContact(selected)}
                      >
                        {hasContact ? <UserCheck size={14} /> : <UserPlus size={14} />}
                        <span className="btn-label">{hasContact ? `Editar ${saved.nome}` : 'Salvar contato'}</span>
                      </button>
                    )
                  })()}
                  {(() => {
                    const rs = findReason(closedMap[selected.session_id])
                    return rs ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                        color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`,
                      }}>{rs.label}</span>
                    ) : null
                  })()}
                </>
              )}
            </div>

            {/* Busca dentro da conversa (histórico inteiro) */}
            {searchOpen && (
              <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
                  <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    autoFocus
                    placeholder="Pesquisar palavras nesta conversa..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false) }}
                    style={{ flex: 1, fontSize: 13, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)' }}
                  />
                  {searchTerm.trim().length >= 2 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, ...(searchLoading ? {} : {}) }}>
                      {searchLoading ? '...' : `${searchResults.length} resultado${searchResults.length === 1 ? '' : 's'}`}
                    </span>
                  )}
                  <button onClick={() => setSearchOpen(false)} title="Fechar busca" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'inline-flex', flexShrink: 0 }}><X size={16} /></button>
                </div>
                {searchTerm.trim().length >= 2 && (
                  <div style={{ maxHeight: 280, overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
                    {searchLoading ? (
                      <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text-muted)' }}>Procurando...</div>
                    ) : searchResults.length === 0 ? (
                      <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text-muted)' }}>Nenhuma mensagem com “{searchTerm.trim()}”.</div>
                    ) : searchResults.map(r => (
                      <button
                        key={r.id}
                        onClick={() => jumpToSearchResult(r)}
                        disabled={jumpingTo === r.id}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', padding: '9px 16px', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #F8FAFC)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: (r.type || '').toLowerCase() === 'cliente' ? 'var(--text-secondary)' : '#16A34A' }}>{searchWho(r)}</span>
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{jumpingTo === r.id ? 'abrindo...' : searchDate(r)}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{searchSnippet(r, searchTerm)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Banner: conversa assumida por outro atendente (não-dono e não-admin) */}
            {(() => {
              if (isClosed) return null
              const att = attendancesMap[selected.session_id]
              if (!att) return null
              const isOwner = att.attendant_email === session?.user?.email
              if (isOwner || isAdmin) return null
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  background: 'linear-gradient(90deg, #FEF3C7 0%, #FED7AA 100%)',
                  borderBottom: '1px solid #FDBA74',
                  padding: '10px 20px', flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#92400E' }}>
                    <Lock size={14} style={{ color: '#D97706' }} />
                    <span>
                      Conversa em atendimento por <strong>{att.attendant_name}</strong> — você não pode responder.
                      Peça pra ele <strong>transferir</strong> ou aguarde a conversa ser finalizada pra abrir novo ticket.
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Banner Recepção: botão assumir
                Nova lógica: se já tem mensagem de atendente/humano no histórico,
                significa que alguém respondeu por fora (direto no WhatsApp) — mostra
                aviso laranja em vez do banner azul "sob IA". */}
            {(() => {
              if (isClosed || attendancesMap[selected.session_id]) return null
              const respondidaPorFora = messages.some(m => {
                const t = (m.type || '').toLowerCase()
                return t === 'atendente' || t === 'humano'
              })
              if (respondidaPorFora) {
                return (
                  <div className="chat-banner chat-banner-wa">
                    <div className="chat-banner-text">
                      <PhoneCall size={15} style={{ color: '#D97706', flexShrink: 0 }} />
                      <span><span className="chat-banner-long">Conversa atendida </span><strong>direto no WhatsApp</strong> <span className="chat-banner-long">(fora da plataforma) — IA não está mais respondendo</span></span>
                    </div>
                    <button
                      onClick={e => handleAssume(selected, e)}
                      disabled={assuming === selected.session_id}
                      title="Trazer essa conversa pro seu setor pra continuar dentro da plataforma"
                      className="chat-banner-btn"
                      style={{
                        background: 'transparent', color: '#92400E',
                        border: '1.5px solid #D97706',
                        opacity: assuming === selected.session_id ? 0.6 : 1,
                      }}>
                      <UserCheck size={14} />
                      {assuming === selected.session_id ? 'Trazendo...' : 'Trazer pro meu setor'}
                    </button>
                  </div>
                )
              }
              return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: aiEnabled ? '#EFF6FF' : '#F8FAFC',
                borderBottom: `1px solid ${aiEnabled ? '#BFDBFE' : 'var(--border)'}`,
                padding: '10px 20px', flexShrink: 0, gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: aiEnabled ? '#1E40AF' : 'var(--text-secondary)' }}>
                  {aiEnabled ? (
                    <>
                      <Sparkles size={15} style={{ color: '#2563EB' }} />
                      <span>Conversa sob atendimento da <strong>IA</strong></span>
                    </>
                  ) : (
                    <>
                      <Inbox size={15} style={{ color: '#64748B' }} />
                      <span>Conversa aguardando atendimento</span>
                    </>
                  )}
                </div>
                <button
                  onClick={e => handleAssume(selected, e)}
                  disabled={assuming === selected.session_id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#16A34A', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '10px 22px',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(22,163,74,0.3)',
                    opacity: assuming === selected.session_id ? 0.6 : 1,
                    flexShrink: 0,
                  }}
                >
                  <Headset size={16} />
                  {assuming === selected.session_id ? 'Assumindo...' : 'Assumir atendimento'}
                </button>
              </div>
              )
            })()}

            {/* Banner Finalizados */}
            {isClosed && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#F8FAFC', borderBottom: '1px solid var(--border)',
                padding: '8px 18px', flexShrink: 0,
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                <Archive size={13} />
                <span style={{ flex: 1 }}>
                  Conversa encerrada. Se o cliente enviar nova mensagem, um novo ticket será aberto automaticamente.
                </span>
                <button
                  onClick={() => handleReopen(selected)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: '#2563EB', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '5px 12px',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <MessageSquare size={11} /> Reabrir conversa
                </button>
              </div>
            )}

            <div className="chat-body" ref={chatBodyRef}>
              {loadingMsgs && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '2rem' }}>
                  Carregando mensagens...
                </div>
              )}
              {!loadingMsgs && hasMoreMsgs && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                  <button
                    onClick={loadMoreMessages}
                    disabled={loadingMoreMsgs}
                    style={{
                      fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)',
                      border: '1px solid var(--border)', borderRadius: 20,
                      padding: '4px 14px', cursor: loadingMoreMsgs ? 'default' : 'pointer',
                      opacity: loadingMoreMsgs ? 0.6 : 1,
                    }}
                  >
                    {loadingMoreMsgs ? 'Carregando...' : 'Carregar mensagens anteriores'}
                  </button>
                </div>
              )}
              {!loadingMsgs && messages.length === 0 && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '2rem' }}>Sem mensagens.</div>
              )}
              {messages.map(msg => {
                const isCliente    = msg.type === 'cliente'
                const isAtendente  = msg.type === 'atendente'
                const isLeft       = isCliente
                const isImage      = isCliente && /^(esta imagem|a imagem|esse documento|este documento|essa imagem|o documento|a foto|essa foto)/i.test(msg.content.trim())
                const labelColor   = isCliente ? 'var(--text-muted)' : isAtendente ? '#16A34A' : '#2563EB'
                return (
                  <div key={msg.id} data-msg-id={msg.id_mensagem || undefined} data-db-id={msg.id}>
                    <div className="msg-label" style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      justifyContent: isLeft ? 'flex-start' : 'flex-end',
                      color: labelColor,
                    }}>
                      {isCliente
                        ? <><User size={10} /> {resolveName(selected?.phone) !== selected?.phone ? resolveName(selected?.phone) : 'Cliente'}</>
                        : isAtendente
                          ? <><Headset size={10} /> {msg.nome || 'Atendente'}</>
                          : <><Bot size={10} /> IA</>}
                    </div>
                    <div className={`msg-row ${isLeft ? 'ai' : 'client'}`}>
                      {(() => {
                        const media = detectMedia(msg.base64)
                        const rawContent = msg.content || ''
                        const fileLineMatch = rawContent.match(/^(🎤 Áudio|🖼️ [^\n]+|📄 [^\n]+|🎬 [^\n]+|📎 [^\n]+)(\n([\s\S]*))?$/)
                        const fileLine = fileLineMatch?.[1] || null
                        const extraText = fileLineMatch?.[3]?.trim() || ''
                        const isPlaceholder = !!fileLine
                        const displayContent = isPlaceholder ? extraText : rawContent
                        const hasOnlyMedia = media && !displayContent
                        const bubbleStyle = isAtendente
                          ? hasOnlyMedia
                            ? { background: 'transparent', padding: 0, boxShadow: 'none', border: 'none' }
                            : { background: '#16A34A', color: '#fff', borderBottomRightRadius: 4 }
                          : hasOnlyMedia
                            ? { background: 'transparent', padding: 0, boxShadow: 'none', border: 'none' }
                            : {}
                        return (
                          <div className="msg-bubble" style={bubbleStyle}>
                            {/* Bloco de citação (respondendo a outra mensagem) */}
                            {(msg.quoted_id_mensagem || msg.quoted_text) && (() => {
                              const orig = msg.quoted_id_mensagem ? messages.find(m => m.id_mensagem === msg.quoted_id_mensagem) : null
                              const origIsCliente = orig ? orig.type === 'cliente' : false
                              const author = !orig ? '' : origIsCliente
                                ? (resolveName(selected?.phone) !== selected?.phone ? resolveName(selected?.phone) : 'Cliente')
                                : (orig.nome || 'Você')
                              // Sem a original carregada, mostra o trecho citado que o WhatsApp mandou.
                              const origText = orig
                                ? ((orig.content || '').replace(/^\*[^*]+\*:\n?/, '').trim() || (orig.base64 ? '📎 Mídia' : ''))
                                : (msg.quoted_text || '(mensagem original)')
                              const canScroll = !!orig
                              const accent = isAtendente ? 'rgba(255,255,255,0.9)' : '#16A34A'
                              return (
                                <div
                                  onClick={() => canScroll && scrollToOriginal(msg.quoted_id_mensagem)}
                                  title={canScroll ? 'Ir para a mensagem original' : undefined}
                                  style={{
                                    display: 'flex', gap: 8, cursor: canScroll ? 'pointer' : 'default', marginBottom: 6,
                                    background: isAtendente ? 'rgba(255,255,255,0.15)' : 'rgba(22,163,74,0.08)',
                                    borderRadius: 6, padding: '5px 9px', maxWidth: 280,
                                  }}>
                                  <div style={{ width: 3, borderRadius: 2, background: accent, flexShrink: 0 }} />
                                  <div style={{ minWidth: 0 }}>
                                    {author && <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 1 }}>{author}</div>}
                                    <div style={{
                                      fontSize: 12, opacity: 0.85,
                                      color: isAtendente ? 'rgba(255,255,255,0.92)' : 'var(--text-secondary)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260,
                                    }}>{origText}</div>
                                  </div>
                                </div>
                              )
                            })()}
                            {media && (() => {
                              const src = `data:${media.mime};base64,${msg.base64}`
                              if (media.type === 'audio') return (
                                <AudioPlayer src={src} style={{ marginBottom: hasOnlyMedia ? 0 : 6 }} />
                              )
                              if (media.type === 'image') return (
                                <img src={src} alt="mídia" style={{ maxWidth: 280, width: '100%', borderRadius: 8, display: 'block', marginBottom: hasOnlyMedia ? 0 : 6, cursor: 'zoom-in' }}
                                  onClick={() => setLightbox(src)} />
                              )
                              if (media.type === 'video') return (
                                <video controls style={{ maxWidth: 280, width: '100%', borderRadius: 8, display: 'block', marginBottom: hasOnlyMedia ? 0 : 6 }}>
                                  <source src={src} type={media.mime} />
                                </video>
                              )
                              if (media.type === 'pdf') {
                                const fileName = (fileLine || '').replace(/^📄\s*/, '').trim() || 'documento.pdf'
                                return (
                                  <a href={src} download={fileName} target="_blank" rel="noreferrer"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 10,
                                      background: '#FEF2F2', border: '1px solid #FECACA',
                                      borderRadius: 8, padding: '10px 14px', textDecoration: 'none',
                                      minWidth: 220, marginBottom: hasOnlyMedia ? 0 : 6,
                                    }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: 6, background: '#FEE2E2',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      color: '#DC2626', fontWeight: 700, fontSize: 11, flexShrink: 0,
                                    }}>PDF</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {fileName}
                                      </div>
                                      <div style={{ fontSize: 11, color: '#6B7280' }}>Clique para baixar/abrir</div>
                                    </div>
                                  </a>
                                )
                              }
                              return null
                            })()}
                            {isImage && !msg.base64 && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 600, color: '#6B7280',
                                background: '#F3F4F6', border: '1px solid #E5E7EB',
                                borderRadius: 6, padding: '2px 8px', marginBottom: 6,
                              }}>🖼️ Imagem enviada</div>
                            )}
                            {fileLine?.startsWith('🎬') && !media && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 10,
                                background: '#F5F3FF', border: '1px solid #DDD6FE',
                                borderRadius: 8, padding: '10px 14px', marginBottom: extraText ? 6 : 0,
                                minWidth: 200,
                              }}>
                                <div style={{
                                  width: 36, height: 36, borderRadius: 6, background: '#EDE9FE',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#7C3AED', flexShrink: 0,
                                }}>
                                  <Film size={18} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {fileLine.replace(/^🎬\s*/, '')}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#6B7280' }}>Vídeo enviado</div>
                                </div>
                              </div>
                            )}
                            {isAtendente && editingMsgId === msg.id ? (
                              <div>
                                <textarea
                                  autoFocus
                                  value={editingText}
                                  onChange={e => setEditingText(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(msg) }
                                    if (e.key === 'Escape') { setEditingMsgId(null); setEditingText('') }
                                  }}
                                  style={{
                                    width: '100%', minHeight: 44, maxHeight: 120, boxSizing: 'border-box',
                                    background: 'rgba(255,255,255,0.15)',
                                    border: '1.5px solid rgba(255,255,255,0.45)',
                                    borderRadius: 8, padding: '8px 10px',
                                    color: '#fff', fontSize: 13.5,
                                    lineHeight: 1.5, resize: 'none',
                                    fontFamily: 'inherit', outline: 'none',
                                  }}
                                />
                                <div style={{ display: 'flex', gap: 6, marginTop: 7, justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={() => { setEditingMsgId(null); setEditingText('') }}
                                    style={{
                                      fontSize: 11, fontWeight: 600, padding: '4px 11px',
                                      borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)',
                                      background: 'transparent', color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                                    }}
                                  >Cancelar</button>
                                  <button
                                    onClick={() => handleSaveEdit(msg)}
                                    disabled={savingEdit}
                                    style={{
                                      fontSize: 11, fontWeight: 700, padding: '4px 13px',
                                      borderRadius: 6, border: 'none',
                                      background: 'rgba(255,255,255,0.92)', color: '#16A34A',
                                      cursor: savingEdit ? 'default' : 'pointer',
                                      opacity: savingEdit ? 0.65 : 1,
                                    }}
                                  >{savingEdit ? 'Salvando...' : 'Salvar'}</button>
                                </div>
                              </div>
                            ) : displayContent ? (
                              <span style={{ whiteSpace: 'pre-wrap', ...(msg.apagada ? { textDecoration: 'line-through', opacity: 0.6 } : {}) }}>
                                {renderTextWithLinks(displayContent, {
                                  color: isAtendente ? 'rgba(255,255,255,0.9)' : '#2563EB',
                                  textDecoration: 'underline',
                                  wordBreak: 'break-all',
                                })}
                              </span>
                            ) : null}
                            {msg.apagada && (
                              <div style={{ fontSize: 10.5, fontStyle: 'italic', opacity: 0.7, marginTop: displayContent ? 4 : 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Trash2 size={10} /> {isCliente ? 'mensagem apagada pelo cliente' : 'mensagem apagada'}
                              </div>
                            )}
                            {msg.falhou && (
                              <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, color: isAtendente ? '#FDE68A' : '#DC2626' }}>
                                <AlertCircle size={10} /> não entregue no WhatsApp
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: isLeft ? 'flex-start' : 'flex-end', gap: 5 }}>
                      {msg.id_mensagem && !msg.apagada && editingMsgId !== msg.id && (
                        <button
                          onClick={() => startReply(msg)}
                          title="Responder"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4, border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: '#16A34A', opacity: 0.6, padding: 0,
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                        >
                          <Reply size={12} />
                        </button>
                      )}
                      {isAtendente && !msg.base64 && !msg.apagada && editingMsgId !== msg.id && (
                        <button
                          onClick={() => { setEditingMsgId(msg.id); setEditingText(msg.content || '') }}
                          title="Editar mensagem"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4, border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: 'var(--text-muted)', opacity: 0.55, padding: 0,
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
                        >
                          <Pencil size={10} />
                        </button>
                      )}
                      {!msg.apagada && editingMsgId !== msg.id && (
                        <button
                          onClick={() => setConfirmDelMsg(msg)}
                          title="Apagar mensagem"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 18, height: 18, borderRadius: 4, border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            color: '#DC2626', opacity: 0.5, padding: 0,
                            transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                      {msg.ts && (
                        <div className="msg-time" style={{ textAlign: isLeft ? 'left' : 'right' }}>
                          {formatMsgTime(msg.ts)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {!isClosed && (
              <div style={{ padding: '12px 18px', borderTop: '0.5px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                {/* Faixa "Respondendo" — mostra a mensagem citada acima do input */}
                {replyingTo && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#F0FDF4', borderLeft: '3px solid #16A34A',
                    borderRadius: 6, padding: '7px 12px', marginBottom: 8,
                  }}>
                    <Reply size={14} style={{ color: '#16A34A', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#16A34A' }}>
                        Respondendo {['atendente','humano','ia','bot'].includes((replyingTo.type||'').toLowerCase()) ? 'à sua mensagem' : 'ao cliente'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {replyingTo.content || '(mídia)'}
                      </div>
                    </div>
                    <button onClick={() => setReplyingTo(null)} title="Cancelar resposta"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0 }}>
                      <X size={15} />
                    </button>
                  </div>
                )}
                {attachedFile && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#EFF6FF', border: '1px solid #BFDBFE',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                  }}>
                    {attachedFile.kind === 'image' ? (
                      <img src={`data:${attachedFile.mime};base64,${attachedFile.base64}`}
                        alt={attachedFile.name}
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                    ) : attachedFile.kind === 'video' ? (
                      <div style={{
                        width: 44, height: 44, borderRadius: 6,
                        background: '#EDE9FE', color: '#7C3AED',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Film size={20} />
                      </div>
                    ) : (
                      <div style={{
                        width: 44, height: 44, borderRadius: 6,
                        background: attachedFile.kind === 'pdf' ? '#FEE2E2' : '#E5E7EB',
                        color: attachedFile.kind === 'pdf' ? '#DC2626' : '#6B7280',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <FileText size={20} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {attachedFile.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {attachedFile.size >= 1024 * 1024
                          ? (attachedFile.size / (1024 * 1024)).toFixed(1) + ' MB'
                          : (attachedFile.size / 1024).toFixed(0) + ' KB'
                        } · {attachedFile.kind === 'pdf' ? 'PDF' : attachedFile.kind === 'image' ? 'Imagem' : attachedFile.kind === 'video' ? 'Vídeo' : 'Arquivo'}
                      </div>
                    </div>
                    <button onClick={discardFile} title="Remover arquivo"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#FEF2F2', border: '1px solid #FECACA',
                        color: '#DC2626', borderRadius: 6, padding: '5px 10px',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                      }}>
                      <Trash2 size={11} /> Remover
                    </button>
                  </div>
                )}
                {recordedAudio && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#F0FDF4', border: '1px solid #BBF7D0',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                  }}>
                    <AudioPlayer src={`data:${recordedAudio.mime};base64,${recordedAudio.base64}`} style={{ flex: 1 }} />
                    <button onClick={discardAudio} title="Descartar áudio"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#FEF2F2', border: '1px solid #FECACA',
                        color: '#DC2626', borderRadius: 6, padding: '5px 10px',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                      }}>
                      <Trash2 size={11} /> Descartar
                    </button>
                  </div>
                )}
                {recording && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                    fontSize: 12, color: '#DC2626', fontWeight: 600,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', animation: 'pulse-dot 1.2s infinite' }} />
                    Gravando... {String(Math.floor(recordTime / 60)).padStart(2, '0')}:{String(recordTime % 60).padStart(2, '0')}
                    <button onClick={() => stopRecording()} style={{
                      marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: '#DC2626', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}>
                      <Square size={11} /> Parar
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, position: 'relative' }}>
                  {/* Emoji picker popup */}
                  {showEmoji && (
                    <div ref={emojiPickerRef} style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 9999 }}>
                      <Suspense fallback={<div style={{ width: 320, height: 380, background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }} />}>
                        <EmojiPicker
                          onEmojiClick={({ emoji }) => {
                            setMsgText(prev => prev + emoji)
                            setShowEmoji(false)
                          }}
                          searchPlaceholder="Buscar emoji..."
                          skinTonesDisabled
                          height={380}
                          width={320}
                          previewConfig={{ showPreview: false }}
                        />
                      </Suspense>
                    </div>
                  )}
                  <textarea
                    ref={composerRef}
                    rows={1}
                    className="nx-input chat-composer-input"
                    style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: 120, overflowY: 'auto', lineHeight: 1.4, fontFamily: 'inherit' }}
                    placeholder={
                      !canRespond(selected) ? "Conversa está com outro atendente — você não pode responder"
                      : recordedAudio ? "Mensagem opcional para acompanhar o áudio..."
                      : attachedFile ? "Mensagem opcional para acompanhar o arquivo..."
                      : "Digite uma mensagem...  (Shift+Enter pula linha)"
                    }
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                      if (e.key === 'Escape' && replyingTo) { setReplyingTo(null) }
                    }}
                    disabled={sending || recording || !canRespond(selected)}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf,video/*"
                    style={{ display: 'none' }}
                    onChange={handlePickFile}
                  />
                  {!recording && !recordedAudio && !attachedFile && (
                    <>
                      <button
                        onClick={() => setShowEmoji(v => !v)}
                        title="Emojis"
                        disabled={!canRespond(selected)}
                        style={{
                          padding: '0 12px', flexShrink: 0,
                          background: showEmoji ? '#FEF9C3' : '#fff',
                          border: `1px solid ${showEmoji ? '#FDE047' : 'var(--border)'}`,
                          borderRadius: 8, fontSize: 17, lineHeight: 1,
                          cursor: canRespond(selected) ? 'pointer' : 'not-allowed',
                          opacity: canRespond(selected) ? 1 : 0.45,
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        😊
                      </button>
                      <QuickMessages
                        instancia={instance}
                        onSelect={text => setMsgText(prev => prev ? prev + ' ' + text : text)}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Anexar imagem, PDF ou vídeo"
                        disabled={!canRespond(selected)}
                        style={{
                          padding: '0 14px', flexShrink: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, color: '#6B7280',
                          cursor: canRespond(selected) ? 'pointer' : 'not-allowed',
                          opacity: canRespond(selected) ? 1 : 0.45,
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        <Paperclip size={15} />
                      </button>
                      <button
                        onClick={startRecording}
                        title="Gravar áudio"
                        disabled={!canRespond(selected)}
                        style={{
                          padding: '0 14px', flexShrink: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, color: '#6B7280',
                          cursor: canRespond(selected) ? 'pointer' : 'not-allowed',
                          opacity: canRespond(selected) ? 1 : 0.45,
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        <Mic size={15} />
                      </button>
                    </>
                  )}
                  <button
                    className="nx-btn-primary"
                    style={{ padding: '0 16px', flexShrink: 0 }}
                    onClick={handleSend}
                    disabled={(!msgText.trim() && !recordedAudio && !attachedFile && !recording) || sending || !canRespond(selected)}
                  >
                    <Send size={14} />
                  </button>
                </div>
                <a
                  href={`https://wa.me/${selected.phone}`}
                  target="_blank" rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: '#25D366', color: '#fff', borderRadius: 8,
                    padding: '9px 18px', fontSize: 13, fontWeight: 600,
                    textDecoration: 'none', boxShadow: '0 1px 4px rgba(37,211,102,0.3)',
                  }}
                >
                  <PhoneCall size={15} /> WhatsApp
                </a>
                {session?.company?.digisac_url && (
                  <a
                    href={session.company.digisac_url}
                    target="_blank" rel="noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: '#7C3AED', color: '#fff', borderRadius: 8,
                      padding: '9px 18px', fontSize: 13, fontWeight: 600,
                      textDecoration: 'none', boxShadow: '0 1px 4px rgba(124,58,237,0.3)',
                    }}
                  >
                    <PhoneCall size={15} /> Digisac
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {contextMenu && createPortal(
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 99998,
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
          padding: 4, minWidth: 180,
        }}
        onClick={e => e.stopPropagation()}
        >
          {(() => {
            const cleanNum = contextMenu.contact.phone.replace(/\D/g, '')
            const saved = savedContacts[cleanNum]
            const isUnread = unreadCounts[contextMenu.contact.session_id] > 0
            const itemStyle = {
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 12px', border: 'none', background: 'transparent',
              fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer',
              borderRadius: 6, textAlign: 'left',
            }
            const hoverOn  = e => e.currentTarget.style.background = '#F8FAFC'
            const hoverOff = e => e.currentTarget.style.background = 'transparent'
            return (
              <>
                <button
                  onClick={() => openSaveContact(contextMenu.contact)}
                  style={itemStyle}
                  onMouseEnter={hoverOn}
                  onMouseLeave={hoverOff}
                >
                  <User size={13} />
                  {saved ? 'Editar paciente' : 'Salvar paciente'}
                </button>
                <button
                  onClick={() => isUnread
                    ? handleMarkRead(contextMenu.contact)
                    : handleMarkUnread(contextMenu.contact)}
                  style={itemStyle}
                  onMouseEnter={hoverOn}
                  onMouseLeave={hoverOff}
                >
                  {isUnread ? <MailOpen size={13} /> : <Mail size={13} />}
                  {isUnread ? 'Marcar como lida' : 'Marcar como não lida'}
                </button>
              </>
            )
          })()}
        </div>
      , document.body)}

      {saveContactModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {saveContactModal.id ? 'Editar paciente' : 'Salvar paciente'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                  {saveContactModal.numero}
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSaveContactModal(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome</label>
                <input className="nx-input" autoFocus placeholder="Ex: João Silva"
                  value={saveContactModal.nome}
                  onChange={e => setSaveContactModal(p => ({ ...p, nome: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSaveContact()} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas (opcional)</label>
                <textarea className="nx-input" rows={3} placeholder="Anotações sobre este contato..."
                  value={saveContactModal.notes || ''}
                  onChange={e => setSaveContactModal(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setSaveContactModal(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleSaveContact}
                disabled={!saveContactModal.nome.trim() || savingContact}>
                {savingContact ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {lightbox && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, cursor: 'zoom-out' }}
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="mídia" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
        </div>
      , document.body)}

      {toast && createPortal(
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
          background: '#fff', border: `1.5px solid ${toast.color}`,
          borderRadius: 10, padding: '12px 20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, fontWeight: 600, color: toast.color,
        }}>
          <CheckCircle2 size={16} />
          {toast.message}
        </div>
      , document.body)}

      <ConfirmModal
        open={!!confirmDelMsg}
        variant="danger"
        title="Apagar mensagem?"
        message="A mensagem será apagada no WhatsApp e ficará riscada aqui. Não dá pra desfazer."
        confirmLabel="Apagar"
        cancelLabel="Cancelar"
        onConfirm={() => { const m = confirmDelMsg; setConfirmDelMsg(null); handleDeleteMessage(m) }}
        onCancel={() => setConfirmDelMsg(null)}
      />

      {transferModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }} onClick={() => !transferring && setTransferModal(null)}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 440, maxHeight: 'calc(100vh - 3rem)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ArrowRightLeft size={16} style={{ color: '#0891B2' }} /> Transferir conversa
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  Pra qual atendente passar essa conversa?
                </div>
              </div>
              <button onClick={() => !transferring && setTransferModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '1rem 1.5rem', flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {(() => {
                const others = companyUsers.filter(u => u.email !== session?.user?.email && u.role !== 'admin')
                if (!others.length) {
                  return (
                    <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                      Não tem outro atendente cadastrado nessa empresa pra receber.
                    </div>
                  )
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {others.map(u => (
                      <label key={u.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                        border: `1.5px solid ${transferringTo === u.email ? '#0891B2' : 'var(--border)'}`,
                        background: transferringTo === u.email ? '#ECFEFF' : '#fff',
                        transition: 'all 0.15s',
                      }}>
                        <input type="radio" name="transfer-target" checked={transferringTo === u.email}
                          onChange={() => setTransferringTo(u.email)}
                          style={{ width: 16, height: 16 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{u.email}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )
              })()}
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setTransferModal(null)} disabled={transferring}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center', background: '#0891B2', borderColor: '#0891B2' }}
                onClick={handleTransfer} disabled={!transferringTo || transferring}>
                {transferring ? 'Transferindo...' : 'Transferir conversa'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {closeModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {closeModal.bulk ? `Finalizar ${selectedIds.length} conversas` : 'Finalizar conversa'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {closeModal.bulk ? 'O mesmo motivo será aplicado a todas — qual foi o resultado?' : `${closeModal.phone} — qual foi o resultado?`}
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                onClick={() => setCloseModal(null)}><X size={16} /></button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto' }}>
              {manualReasons.map(r => (
                editReason && editReason.value === r.value ? (
                  <div key={r.value} style={{ border: `1.5px solid ${editReason.color}`, borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      className="nx-input" autoFocus placeholder="Nome do motivo" maxLength={40}
                      value={editReason.label}
                      onChange={e => setEditReason(er => ({ ...er, label: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateReason(); if (e.key === 'Escape') setEditReason(null) }}
                    />
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {REASON_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setEditReason(er => ({ ...er, color: c }))}
                          style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                            border: 'none', outline: editReason.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="nx-btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                        onClick={() => setEditReason(null)}>Cancelar</button>
                      <button className="nx-btn-primary" style={{ padding: '6px 14px', fontSize: 12, justifyContent: 'center' }}
                        onClick={handleUpdateReason} disabled={!editReason.label.trim() || savingReason}>
                        {savingReason ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                ) : (
                <label key={r.value} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${reason === r.value ? r.border : 'var(--border)'}`,
                  background: reason === r.value ? r.bg : 'var(--bg-surface)',
                  transition: 'all 0.15s',
                }}>
                  <input type="radio" style={{ display: 'none' }} value={r.value}
                    checked={reason === r.value} onChange={() => setReason(r.value)} />
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: reason === r.value ? r.color : 'var(--border)',
                  }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: reason === r.value ? r.color : 'var(--text-primary)' }}>
                    {r.label}
                  </div>
                  {r.custom && (
                    <>
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setEditReason({ value: r.value, label: r.label, color: r.color }) }}
                        title="Editar nome e cor"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'inline-flex', opacity: 0.6 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); handleDeleteReason(r.value) }}
                        title="Remover este motivo"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'inline-flex', opacity: 0.6 }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </label>
                )
              ))}

              {/* Criar novo motivo */}
              {addingReason ? (
                <div style={{ border: '1.5px dashed var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    className="nx-input" autoFocus placeholder="Nome do motivo (ex: Orçamento enviado)"
                    value={newReasonLabel} maxLength={40}
                    onChange={e => setNewReasonLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddReason() }}
                  />
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {REASON_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setNewReasonColor(c)}
                        style={{ width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                          border: 'none', outline: newReasonColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="nx-btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => { setAddingReason(false); setNewReasonLabel('') }}>Cancelar</button>
                    <button className="nx-btn-primary" style={{ padding: '6px 14px', fontSize: 12, justifyContent: 'center' }}
                      onClick={handleAddReason} disabled={!newReasonLabel.trim() || savingReason}>
                      {savingReason ? 'Salvando...' : 'Adicionar'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingReason(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px', borderRadius: 8, border: '1.5px dashed var(--border)',
                    background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  <Plus size={13} /> Nova opção de encerramento
                </button>
              )}

              {dbReasons.length > 0 && !addingReason && !editReason && (
                <button
                  onClick={handleRestoreDefaults}
                  disabled={savingReason}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 2, alignSelf: 'center', padding: '2px 6px' }}
                  title="Traz de volta os motivos padrão que foram removidos (não altera os que você editou)"
                >
                  Restaurar motivos padrão
                </button>
              )}
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setCloseModal(null)}>Cancelar</button>
              <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: reason ? 1 : 0.5 }}
                onClick={handleClose} disabled={!reason || closing}>
                <CheckCircle2 size={13} /> {closing ? 'Finalizando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
