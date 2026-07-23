import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
// Carregado sob demanda: o bundle do emoji-picker (~300KB) só baixa ao abrir o picker.
const EmojiPicker = lazy(() => import('emoji-picker-react'))
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { fetchGruposLista } from '../../lib/queries'
import { Users, User, ChevronLeft, Send, Mic, Square, Paperclip, Trash2, Film, FileText, BellOff, Bell, ChevronRight, Loader2, Phone, X, MessageCircle, UserPlus, Check, Download, Pencil, Reply, Mail, MailOpen, Search } from 'lucide-react'
import { useContactTags, TagList, TagPicker, TagFilter, buildTagFilter } from '../../components/Tags'
import QuickMessages from '../../components/QuickMessages'
import './Company.css'

function getMutedGroups(instance) {
  try { return JSON.parse(localStorage.getItem(`muted_groups_${instance}`) || '[]') } catch { return [] }
}
function setMutedGroups(instance, arr) {
  localStorage.setItem(`muted_groups_${instance}`, JSON.stringify(arr))
}

const CONV_TABLE = 'mensagens_geral'

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

// Offset "-04:00" → minutos. Formata sempre a partir do UTC + fuso da clínica.
function tzOffsetMinutes(tz) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec((tz || '-03:00').trim())
  if (!m) return -180
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10))
}
function formatTime(ts, tz) {
  if (!ts) return ''
  const t = new Date(ts)
  if (isNaN(t)) return ''
  const off = tzOffsetMinutes(tz) * 60000
  const loc = new Date(t.getTime() + off)
  const nowLoc = new Date(Date.now() + off)
  const hhmm = `${String(loc.getUTCHours()).padStart(2, '0')}:${String(loc.getUTCMinutes()).padStart(2, '0')}`
  const sameDay = d => d.getUTCFullYear() === loc.getUTCFullYear() && d.getUTCMonth() === loc.getUTCMonth() && d.getUTCDate() === loc.getUTCDate()
  if (sameDay(nowLoc)) return hhmm
  if (sameDay(new Date(nowLoc.getTime() - 86400000))) return `Ontem ${hhmm}`
  return `${String(loc.getUTCDate()).padStart(2, '0')}/${String(loc.getUTCMonth() + 1).padStart(2, '0')} ${hhmm}`
}

// ── Contato compartilhado (vCard do WhatsApp) ───────────────────────────────
function parseVCard(vcard) {
  const lines = String(vcard || '').split(/\r?\n/)
  let name = '', phone = '', digits = ''
  for (const l of lines) {
    if (/^FN:/i.test(l)) name = l.slice(3).trim()
    else if (/^TEL/i.test(l)) {
      const w = l.match(/waid=(\d+)/i)
      if (w && !digits) digits = w[1]
      const val = l.split(':').slice(1).join(':').trim()
      if (val && !phone) phone = val
    }
  }
  if (!digits) digits = (phone || '').replace(/\D/g, '')
  return { name, phone: phone || (digits ? '+' + digits : ''), digits }
}
function contactCardsOf(card) {
  if (!card) return []
  const arr = Array.isArray(card) ? card : (Array.isArray(card.contacts) ? card.contacts : [card])
  return arr.map(c => {
    const p = parseVCard(c?.vcard)
    return { name: c?.displayName || p.name || p.phone || 'Contato', phone: p.phone, digits: p.digits }
  }).filter(c => c.digits || c.phone || c.name)
}

// created_at (UTC do banco) primeiro; horaLastMessage às vezes vem em -03:00 (n8n)
function parseTs(row) {
  const raw = row.created_at || row.horaLastMessage
  if (!raw) return null
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [date, time] = raw.split(' ')
    const [d, m, y] = date.split('/')
    return new Date(`${y}-${m}-${d}T${time || '00:00:00'}`).toISOString()
  }
  return raw
}

function groupLabel(g) {
  if (g.nomegrupo) return g.nomegrupo
  return g.idgrupo.replace('@g.us', '')
}

function senderLabel(row) {
  if (row.nome) return row.nome
  return (row.numero || '').replace(/@.*$/, '')
}

function detectMedia(b64) {
  if (!b64 || b64.length < 10) return null
  // Data URI: extrai mime e retorna com raw = parte pura do base64
  if (b64.startsWith('data:')) {
    const m = b64.match(/^data:([^;]+);base64,(.+)/)
    if (!m) return null
    const mime = m[1]
    const raw = m[2]
    const kind = mime.startsWith('image/') ? 'image'
      : mime.startsWith('audio/') ? 'audio'
      : mime.startsWith('video/') ? 'video'
      : mime === 'application/pdf' ? 'pdf'
      : null
    if (!kind) return null
    return { type: kind, mime, src: b64, raw }
  }
  // Base64 puro — detecta pelo header
  const mk = (type, mime) => ({ type, mime, src: `data:${mime};base64,${b64}`, raw: b64 })
  if (b64.startsWith('T2dn')) return mk('audio', 'audio/ogg')
  if (b64.startsWith('//uQ') || b64.startsWith('SUQz')) return mk('audio', 'audio/mpeg')
  if (b64.startsWith('GkXf')) return mk('audio', 'audio/webm')
  if (b64.startsWith('/9j/')) return mk('image', 'image/jpeg')
  if (b64.startsWith('iVBOR')) return mk('image', 'image/png')
  if (b64.startsWith('UklGR')) return mk('image', 'image/webp')
  if (b64.startsWith('R0lGOD')) return mk('image', 'image/gif')
  if (b64.startsWith('JVBERi')) return mk('pdf', 'application/pdf')
  try {
    if (b64.length > 100 && atob(b64.slice(0, 16)).slice(4, 8) === 'ftyp') return mk('video', 'video/mp4')
  } catch {}
  return null
}

export default function CompanyGroups() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const instance = session?.company?.instance
  const companyTz = session?.company?.timezone || '-03:00'
  const apiInstancia = session?.company?.api_instancia
  const instanceOwner = session?.company?.numero_base || null
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [sendErr, setSendErr] = useState('')
  const [customNames, setCustomNames] = useState({}) // idgrupo → nome definido pela clínica
  const [renameModal, setRenameModal] = useState(null) // { idgrupo, nome }
  const [savingName, setSavingName] = useState(false)
  const [renameErr, setRenameErr] = useState('')
  const [editingMsgId, setEditingMsgId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null) // { id_mensagem, content, nome }
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [readsMap, setReadsMap] = useState({})     // idgrupo → last_read_at ISO
  const [readsLoaded, setReadsLoaded] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState({}) // idgrupo → number
  const initialCountsDone = useRef(false)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState(null)
  const [recordTime, setRecordTime] = useState(0)
  const [attachedFile, setAttachedFile] = useState(null)
  const [mutedGroups, setMutedGroupsState] = useState(() => getMutedGroups(instance))
  const [contextMenu, setContextMenu] = useState(null) // { x, y, group }
  const [tagFilter, setTagFilter] = useState([])
  const [search, setSearch] = useState('')
  const { tagsOf, assignments: tagAssignments } = useContactTags(instance)
  const [groupInfo, setGroupInfo] = useState(null)
  const [groupInfoLoading, setGroupInfoLoading] = useState(false)
  const [groupInfoOpen, setGroupInfoOpen] = useState(false)
  const [activeMember, setActiveMember] = useState(null)
  const [savingContact, setSavingContact] = useState(null)
  const [savedContact, setSavedContact] = useState(null)
  const [memberMenu, setMemberMenu] = useState(null)   // { x, y, numero, nome } — menu ao clicar no nome no thread
  const [lightbox, setLightbox] = useState(null)       // src da imagem em tela cheia
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false)
  const [loadingMoreMsgs, setLoadingMoreMsgs] = useState(false)
  const [searchOpen, setSearchOpen]       = useState(false) // busca dentro do grupo (estilo WhatsApp)
  const [searchTerm, setSearchTerm]       = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [jumpingTo, setJumpingTo]         = useState(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [mentionMembers, setMentionMembers] = useState([])   // lista de membros para mention
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const mentionRef = useRef(null)
  const bottomRef = useRef(null)
  const chatBodyRef = useRef(null)
  const skipScrollRef = useRef(false)
  const selectedRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordStartRef = useRef(null)
  const recordTimerRef = useRef(null)
  const fileInputRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const composerRef = useRef(null)
  selectedRef.current = selected

  // Auto-cresce o composer conforme digita (até ~5 linhas), tipo WhatsApp
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [msgText])

  // Fecha emoji picker ao clicar fora
  useEffect(() => {
    if (!showEmoji) return
    function handleOutside(e) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) setShowEmoji(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [showEmoji])

  // Fecha mention dropdown ao clicar fora
  useEffect(() => {
    if (!mentionOpen) return
    function handleOutside(e) {
      if (mentionRef.current && !mentionRef.current.contains(e.target)) setMentionOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [mentionOpen])

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

  // Calcula contagem inicial de não lidos nos grupos
  useEffect(() => {
    if (initialCountsDone.current || !readsLoaded || loading || !groups.length || !instance) return
    initialCountsDone.current = true
    const unread = groups.filter(g => {
      const lr = readsMap[g.idgrupo]
      return !lr || (g.lastTs && new Date(g.lastTs) > new Date(lr))
    })
    if (!unread.length) return
    Promise.all(
      unread.map(g =>
        supabase.from(CONV_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('instancia', instance)
          .eq('idgrupo', g.idgrupo)
          .ilike('type', 'cliente')
          .gt('created_at', readsMap[g.idgrupo] || '1970-01-01T00:00:00Z')
          .then(({ count }) => [g.idgrupo, count || 0])
      )
    ).then(pairs => {
      const counts = {}
      pairs.forEach(([gid, cnt]) => { if (cnt > 0) counts[gid] = cnt })
      setUnreadCounts(counts)
    })
  }, [readsLoaded, loading, groups, readsMap, instance])

  function handleSelectGroup(g) {
    setSelected(g)
    setGroupInfoOpen(false)
    setGroupInfo(null)
    setMentionMembers([])
    setMentionOpen(false)
    if (unreadCounts[g.idgrupo]) {
      setUnreadCounts(prev => { const n = { ...prev }; delete n[g.idgrupo]; return n })
      const now = new Date().toISOString()
      setReadsMap(prev => ({ ...prev, [g.idgrupo]: now }))
      if (session?.user?.email) {
        supabase.from('conversation_reads').upsert({
          instancia: instance,
          session_id: g.idgrupo,
          user_email: session.user.email,
          last_read_at: now,
        }, { onConflict: 'instancia,session_id,user_email' }).then(() => {})
      }
    }
  }

  // Marca o grupo como NÃO lido: recua a leitura pra antes da última mensagem
  // do grupo, fazendo o balãozinho voltar a acusar pendência.
  async function handleMarkGroupUnread(g) {
    setContextMenu(null)
    const { data } = await supabase.from(CONV_TABLE)
      .select('created_at')
      .eq('instancia', instance).eq('idgrupo', g.idgrupo)
      .order('created_at', { ascending: false }).limit(1)
    const lastTs = data?.[0]?.created_at || g.lastTs
    if (!lastTs) return
    const before = new Date(new Date(lastTs).getTime() - 1000).toISOString()
    setUnreadCounts(prev => ({ ...prev, [g.idgrupo]: prev[g.idgrupo] || 1 }))
    setReadsMap(prev => ({ ...prev, [g.idgrupo]: before }))
    if (selectedRef.current?.idgrupo === g.idgrupo) setSelected(null)
    if (session?.user?.email) {
      await supabase.from('conversation_reads').upsert({
        instancia: instance, session_id: g.idgrupo,
        user_email: session.user.email, last_read_at: before,
      }, { onConflict: 'instancia,session_id,user_email' })
    }
  }

  async function handleMarkGroupRead(g) {
    setContextMenu(null)
    setUnreadCounts(prev => { const n = { ...prev }; delete n[g.idgrupo]; return n })
    const now = new Date().toISOString()
    setReadsMap(prev => ({ ...prev, [g.idgrupo]: now }))
    if (session?.user?.email) {
      await supabase.from('conversation_reads').upsert({
        instancia: instance, session_id: g.idgrupo,
        user_email: session.user.email, last_read_at: now,
      }, { onConflict: 'instancia,session_id,user_email' })
    }
  }

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    // Lista de grupos já agregada no servidor (RPC) — antes baixava até
    // 20.000 mensagens só para deduplicar por grupo no cliente.
    fetchGruposLista(instance)
      .then((rows) => {
        const unique = (rows || []).map((row) => ({
          idgrupo: row.idgrupo,
          nomegrupo: row.nomegrupo || null,
          lastMsg: row.mensagem || '',
          lastTs: parseTs(row),
          lastSenderRow: row,
        }))
        setGroups(unique)
        setLoading(false)
      })
  }, [instance])

  // Nomes personalizados dos grupos (se a migration ainda não rodou, ignora)
  useEffect(() => {
    if (!instance) return
    supabase.from('group_custom_names')
      .select('idgrupo, nome')
      .eq('instancia', instance)
      .then(({ data }) => {
        if (data) setCustomNames(Object.fromEntries(data.map(r => [r.idgrupo, r.nome])))
      })
  }, [instance])

  // Nome exibido: apelido da clínica > nome do WhatsApp > código
  const labelOf = (g) => customNames[g.idgrupo] || groupLabel(g)

  async function handleSaveGroupName() {
    if (!renameModal || savingName) return
    const nome = (renameModal.nome || '').trim()
    setSavingName(true)
    setRenameErr('')
    if (nome) {
      const { error } = await supabase.from('group_custom_names').upsert({
        instancia: instance,
        idgrupo: renameModal.idgrupo,
        nome,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'instancia,idgrupo' })
      if (error) {
        setSavingName(false)
        setRenameErr(/group_custom_names/.test(error.message)
          ? 'Falta rodar a migration group_custom_names no Supabase.'
          : 'Erro: ' + error.message)
        return
      }
      setCustomNames(prev => ({ ...prev, [renameModal.idgrupo]: nome }))
    } else {
      // Campo vazio = volta pro nome original do WhatsApp
      await supabase.from('group_custom_names').delete()
        .eq('instancia', instance).eq('idgrupo', renameModal.idgrupo)
      setCustomNames(prev => { const n = { ...prev }; delete n[renameModal.idgrupo]; return n })
    }
    setSavingName(false)
    setRenameModal(null)
  }

  const MSG_PAGE = 50

  useEffect(() => {
    setReplyingTo(null); setEditingMsgId(null)
    setSearchOpen(false); setSearchTerm(''); setSearchResults([])
  }, [selected?.idgrupo])

  // Busca dentro do grupo (histórico inteiro, não só o que está carregado)
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
        .eq('idgrupo', selected.idgrupo)
        .ilike('mensagem', `%${esc}%`)
        .order('id', { ascending: false })
        .limit(80)
      if (cancel) return
      setSearchResults((data || []).filter(r => !r.apagada))
      setSearchLoading(false)
    }, 300)
    return () => { cancel = true; clearTimeout(h) }
  }, [searchTerm, searchOpen, selected?.idgrupo, instance])

  // Rola até a mensagem pelo id do banco e destaca (usado pela busca)
  function flashDbMessage(id) {
    const el = document.querySelector(`[data-db-id="${id}"]`)
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'box-shadow 0.25s, transform 0.25s'
    el.style.boxShadow = '0 0 0 3px #4F46E599'
    el.style.borderRadius = '10px'
    el.style.transform = 'scale(1.015)'
    setTimeout(() => { el.style.boxShadow = 'none'; el.style.transform = 'none' }, 1300)
    return true
  }

  // Pula pra mensagem achada; se for antiga (fora da janela), carrega o intervalo
  async function jumpToSearchResult(row) {
    if (messages.some(m => m.id === row.id)) { flashDbMessage(row.id); return }
    setJumpingTo(row.id)
    const oldestId = messages[0]?.id
    let query = supabase.from(CONV_TABLE).select('*')
      .eq('instancia', instance).eq('idgrupo', selected.idgrupo)
      .gte('id', row.id).order('id', { ascending: false }).limit(1000)
    if (oldestId) query = query.lt('id', oldestId)
    const { data } = await query
    if (data) {
      const older = [...data].reverse()
      setMessages(prev => {
        const have = new Set(prev.map(m => m.id))
        return [...older.filter(m => !have.has(m.id)), ...prev]
      })
      setHasMoreMsgs(true)
    }
    setJumpingTo(null)
    setTimeout(() => flashDbMessage(row.id), 180)
  }

  function searchSnippet(row, term) {
    const t = row.mensagem || ''
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
    if (ty === 'atendente' || ty === 'humano') return row.nome || 'Você'
    return row.nome || (row.numero || '').replace(/@.*$/, '') || 'Membro'
  }
  function searchDate(row) {
    return formatTime(parseTs(row), companyTz)
  }

  useEffect(() => {
    if (!selected || !instance) return
    setLoadingMsgs(true)
    setMessages([])
    setHasMoreMsgs(false)
    supabase.from(CONV_TABLE)
      .select('*')
      .eq('instancia', instance)
      .eq('idgrupo', selected.idgrupo)
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
      .then(({ data, error }) => {
        if (!error && data) {
          setMessages([...data].reverse())
          setHasMoreMsgs(data.length === MSG_PAGE)
        }
        setLoadingMsgs(false)
      })
  }, [selected?.idgrupo, instance])

  useEffect(() => {
    if (skipScrollRef.current) { skipScrollRef.current = false; return }
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingMsgs])

  useEffect(() => {
    if (!instance) return
    const ch = supabase.channel(`groups-rt-${instance}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: CONV_TABLE, filter: `instancia=eq.${instance}` },
        (p) => {
          const row = p.new
          if (!row?.idgrupo) return
          const incomingType = (row.type || '').toLowerCase()
          const isClientMsg = incomingType === 'cliente' || incomingType === 'human'
          if (isClientMsg && selectedRef.current?.idgrupo !== row.idgrupo) {
            setUnreadCounts(prev => ({ ...prev, [row.idgrupo]: (prev[row.idgrupo] || 0) + 1 }))
          }
          setGroups(prev => {
            const updated = {
              idgrupo: row.idgrupo,
              nomegrupo: row.nomegrupo || null,
              lastMsg: row.mensagem || '',
              lastTs: parseTs(row),
              lastSenderRow: row,
            }
            const exists = prev.find(g => g.idgrupo === row.idgrupo)
            if (exists) return [updated, ...prev.filter(g => g.idgrupo !== row.idgrupo)]
            return [updated, ...prev]
          })
          if (selectedRef.current?.idgrupo === row.idgrupo) {
            setMessages(msgs => [...msgs, row])
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
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

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

  function discardAudio() { setRecordedAudio(null); setRecordTime(0) }

  async function handlePickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // O arquivo viaja como base64 (~1,33x o tamanho) num JSON até o Supabase e
    // o n8n — que corta em 16 MB. Acima de ~10 MB o envio quebra nos dois.
    const MAX = 10 * 1024 * 1024
    if (file.size > MAX) {
      setSendErr(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB) — o limite é 10 MB. Comprima o vídeo ou envie direto pelo WhatsApp.`)
      setTimeout(() => setSendErr(''), 8000)
      return
    }
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
    const base64 = btoa(bin)
    const kind = file.type.startsWith('image/') ? 'image'
      : file.type === 'application/pdf' ? 'pdf'
      : file.type.startsWith('video/') ? 'video'
      : 'file'
    setAttachedFile({ base64, mime: file.type || 'application/octet-stream', name: file.name, size: file.size, kind })
  }

  function discardFile() { setAttachedFile(null) }

  async function handleSend() {
    let audio = recordedAudio
    if (recording) audio = await stopRecording({ persistPreview: false })
    const text = msgText.trim()
    if (!text && !audio && !attachedFile) return
    if (!selected || sending) return
    setSending(true)
    const replySnap = replyingTo
    // Resposta nativa (balão de citação no WhatsApp) só é possível com o id do
    // WhatsApp. Sem ele (mensagem antiga ou enviada com menção), embute uma
    // citação curta no próprio texto pro cliente ver o que estamos reforçando.
    const nativeQuote = !!replySnap?.id_mensagem
    const citation = (replySnap && !nativeQuote)
      ? `↩️ _${(replySnap.content || 'mensagem').replace(/\s+/g, ' ').trim().slice(0, 120)}_\n\n`
      : ''
    const sentText = citation + text
    const filePrefix = attachedFile
      ? (attachedFile.kind === 'image' ? '🖼️ ' : attachedFile.kind === 'pdf' ? '📄 ' : attachedFile.kind === 'video' ? '🎬 ' : '📎 ') + attachedFile.name
      : null
    const mensagemPayload = audio
      ? (sentText || '🎤 Áudio')
      : attachedFile
        ? (sentText ? `${filePrefix}\n${sentText}` : filePrefix)
        : sentText
    const mediaBase64 = audio?.base64 || attachedFile?.base64 || null
    setReplyingTo(null)
    setMsgText('')
    setRecordedAudio(null)
    setRecordTime(0)
    setAttachedFile(null)
    try {
      const hora = new Date().toISOString()
      const insertObj = {
        instancia: instance,
        numero: instanceOwner || selected.idgrupo,
        idgrupo: selected.idgrupo,
        nomegrupo: selected.nomegrupo || null,
        mensagem: mensagemPayload,
        base64: mediaBase64,
        type: 'atendente',
        nome: session?.user?.name || null,
        horaLastMessage: hora,
        created_at: hora,
      }
      if (nativeQuote) insertObj.quoted_id_mensagem = replySnap.id_mensagem
      let ins = await supabase.from(CONV_TABLE).insert(insertObj).select('id').single()
      // Se a coluna quoted ainda não existe, reinsere sem ela (mensagem vai igual)
      if (ins.error && insertObj.quoted_id_mensagem && /quoted_id_mensagem/i.test(ins.error.message || '')) {
        delete insertObj.quoted_id_mensagem
        ins = await supabase.from(CONV_TABLE).insert(insertObj).select('id').single()
      }
      const { data: insRow, error: insErr } = ins
      const insertedId = insRow?.id
      // Sem isso o insert falha calado: a mensagem some da tela (o chat só
      // renderiza pelo realtime) e ninguém fica sabendo o motivo.
      if (insErr) {
        console.error('grupo insert:', insErr)
        setSendErr('A mensagem não foi salva: ' + insErr.message)
        setTimeout(() => setSendErr(''), 6000)
      }
      if (/@\d+/.test(text) && !nativeQuote) {
        // Mensagem com menção → só para infogrupo (resposta embutida vai junto).
        fetch('https://n8n.nexladesenvolvimento.com.br/webhook/infogrupo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evento:       'mencao',
            instancia:    instance,
            apikey:       apiInstancia,
            idgrupo:      selected.idgrupo,
            nomegrupo:    selected.nomegrupo || null,
            mensagem:     sentText,
            sender_name:  session?.user?.name,
            sender_email: session?.user?.email,
          }),
        })
          .then(r => r.text())
          .then(t => {
            // Se o infogrupo devolver o id_mensagem (mesmo formato do envioNexla:
            // instancia / mensagem / id_mensagem), grava — assim a mensagem com
            // menção fica respondível/editável depois.
            const lines = (t || '').trim().split('\n')
            const msgId = lines.length >= 3 ? lines[lines.length - 1].trim() : ''
            if (insertedId && msgId && !/\s/.test(msgId)) {
              supabase.from(CONV_TABLE).update({ id_mensagem: msgId }).eq('id', insertedId).then(() => {})
              setMessages(prev => prev.map(m => m.id === insertedId ? { ...m, id_mensagem: msgId } : m))
            }
          })
          .catch(e => console.warn('webhook mencao:', e))
      } else {
        // Resposta nativa → webhook próprio de grupo; senão envioNexla
        const webhookUrl = nativeQuote
          ? 'https://n8n.nexladesenvolvimento.com.br/webhook/respondermensagemgrupo'
          : 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla'
        const quotedPayload = nativeQuote ? {
          quoted_id:          replySnap.id_mensagem,
          quoted_text:        replySnap.content,
          quoted_fromMe:      ['atendente', 'humano', 'ia', 'bot'].includes((replySnap.type || '').toLowerCase()),
          quoted_remoteJid:   selected.idgrupo,       // em grupo, a "conversa" é o grupo
          quoted_participant: replySnap.numero || null, // quem mandou a original no grupo
        } : {}
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: sentText,
            mensagem: mensagemPayload,
            audio_base64: audio?.base64 || null,
            audio_mime: audio?.mime || null,
            audio_duration: audio?.duration || null,
            file_base64: attachedFile?.base64 || null,
            file_mime: attachedFile?.mime || null,
            file_name: attachedFile?.name || null,
            file_kind: attachedFile?.kind || null,
            // Alias: a mídia (áudio OU arquivo) também vai como "base64"/"mime",
            // o mesmo nome da coluna do banco, pro fluxo de grupo no n8n achar
            // o campo sem depender do nome específico acima.
            base64: mediaBase64,
            mime: audio?.mime || attachedFile?.mime || null,
            number: selected.idgrupo,
            session_id: selected.idgrupo,
            numero: instanceOwner || selected.idgrupo,
            idgrupo: selected.idgrupo,
            nomegrupo: selected.nomegrupo || null,
            instancia: instance,
            api_instancia: apiInstancia,
            sender_name: session?.user?.name,
            sender_email: session?.user?.email,
            company: session?.company?.name,
            ...quotedPayload,
            ai_enabled: false,
          }),
        })
          .then(r => r.text())
          .then(t => {
            // Nó de erro do n8n responde texto começando com "ERRO" quando o
            // WhatsApp recusou o envio.
            if (/^ERRO/i.test((t || '').trim())) {
              setSendErr('⚠️ O WhatsApp está com instabilidade e essa mensagem NÃO foi entregue no grupo. Tente de novo.')
              setTimeout(() => setSendErr(''), 8000)
              return
            }
            // Se o n8n devolver o id_mensagem do WhatsApp (mesmo formato das
            // conversas: instancia / mensagem / id_mensagem, uma por linha),
            // grava na linha — é o que permite editar/apagar depois no WhatsApp.
            const lines = (t || '').trim().split('\n')
            const msgId = lines.length >= 3 ? lines[lines.length - 1].trim() : ''
            if (insertedId && msgId && !/\s/.test(msgId)) {
              supabase.from(CONV_TABLE).update({ id_mensagem: msgId }).eq('id', insertedId).then(() => {})
              setMessages(prev => prev.map(m => m.id === insertedId ? { ...m, id_mensagem: msgId } : m))
            }
          })
          .catch(e => console.warn('webhook grupo:', e))
      }
    } finally {
      setSending(false)
      // Mantém o foco na caixa pra digitar a próxima sem clicar de novo (igual WhatsApp)
      setTimeout(() => composerRef.current?.focus(), 0)
    }
  }

  async function handleSaveEdit(msg) {
    const newText = editingText.trim()
    if (!newText || savingEdit) return
    setSavingEdit(true)
    try {
      // id_mensagem pode ter sido preenchido pelo n8n depois do envio
      const { data: fresh } = await supabase.from(CONV_TABLE)
        .select('id_mensagem').eq('id', msg.id).maybeSingle()
      const id_mensagem = fresh?.id_mensagem || msg.id_mensagem

      // Atualiza já na plataforma (e no banco), independente do WhatsApp —
      // assim a edição não some ao recarregar mesmo se o WhatsApp não editar.
      await supabase.from(CONV_TABLE).update({ mensagem: newText }).eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, mensagem: newText } : m))
      setEditingMsgId(null)
      setEditingText('')

      // Dispara a edição no WhatsApp só se temos o id da mensagem lá
      if (id_mensagem) {
        fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexlaeditar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: msg.id,
            id_mensagem,
            message: newText,
            mensagem: newText,
            session_id: selected?.idgrupo,
            idgrupo: selected?.idgrupo,
            numero: instanceOwner || selected?.idgrupo,
            nomegrupo: selected?.nomegrupo || null,
            instancia: instance,
            api_instancia: apiInstancia,
            company: session?.company?.name,
            sender_name: session?.user?.name,
            sender_email: session?.user?.email,
          }),
        }).catch(e => console.warn('webhook editar grupo:', e))
      } else {
        setSendErr('Editado aqui na plataforma. No WhatsApp não deu pra editar (mensagem antiga, sem identificador).')
        setTimeout(() => setSendErr(''), 7000)
      }
    } catch (e) {
      setSendErr('Erro ao editar: ' + e.message)
      setTimeout(() => setSendErr(''), 5000)
    } finally {
      setSavingEdit(false)
    }
  }

  function startReply(msg) {
    if (!msg || msg.apagada) return
    setReplyingTo({
      // Pode ser null (mensagem antiga/menção sem id do WhatsApp) — nesse caso
      // a citação vai embutida no texto em vez de resposta nativa.
      id_mensagem: msg.id_mensagem || null,
      content: (msg.mensagem || '').slice(0, 200) || (msg.base64 ? '📎 Mídia' : ''),
      nome: msg.nome || null,
      type: msg.type || null,
      numero: (msg.numero || '').replace(/@.*$/, ''), // remetente original (participant do quote em grupo)
    })
    setEditingMsgId(null)
    setTimeout(() => composerRef.current?.focus(), 30)
  }

  function scrollToOriginal(idMensagem) {
    if (!idMensagem) return
    const el = document.querySelector(`[data-msg-id="${CSS.escape(idMensagem)}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'box-shadow 0.25s, transform 0.25s'
    el.style.boxShadow = '0 0 0 3px #4F46E588'
    el.style.borderRadius = '10px'
    el.style.transform = 'scale(1.015)'
    setTimeout(() => { el.style.boxShadow = 'none'; el.style.transform = 'none' }, 1100)
  }

  async function loadMoreMessages() {
    if (loadingMoreMsgs || !selected) return
    const oldestId = messages[0]?.id
    if (!oldestId) return
    setLoadingMoreMsgs(true)
    const prevScrollHeight = chatBodyRef.current?.scrollHeight || 0
    const { data } = await supabase.from(CONV_TABLE)
      .select('*')
      .eq('instancia', instance)
      .eq('idgrupo', selected.idgrupo)
      .lt('id', oldestId)
      .order('id', { ascending: false })
      .limit(MSG_PAGE)
    if (data && data.length > 0) {
      const older = [...data].reverse()
      skipScrollRef.current = true
      setMessages(prev => [...older, ...prev])
      setHasMoreMsgs(data.length === MSG_PAGE)
      requestAnimationFrame(() => {
        if (chatBodyRef.current)
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight - prevScrollHeight
      })
    } else {
      setHasMoreMsgs(false)
    }
    setLoadingMoreMsgs(false)
  }

  function toggleMute(idgrupo) {
    const current = getMutedGroups(instance)
    const next = current.includes(idgrupo)
      ? current.filter(g => g !== idgrupo)
      : [...current, idgrupo]
    setMutedGroups(instance, next)
    setMutedGroupsState(next)
    setContextMenu(null)
  }

  function handleContextMenu(e, group) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, group })
  }

  async function fetchGroupInfo() {
    if (groupInfoLoading || !selected) return
    setGroupInfoLoading(true)
    setGroupInfoOpen(true)
    setGroupInfo(null)
    try {
      const res = await fetch('https://n8n.nexladesenvolvimento.com.br/webhook/infogrupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instancia: instance,
          apikey:    apiInstancia,
          idgrupo:   selected.idgrupo,
        }),
      })
      const data = await res.json()
      setGroupInfo(data)
    } catch (e) {
      setGroupInfo({ error: 'Não foi possível carregar os dados do grupo.' })
    } finally {
      setGroupInfoLoading(false)
    }
  }

  async function fetchMentionMembers() {
    if (!selected) return
    // Reutiliza cache se já buscou antes para esse grupo
    if (mentionMembers.length > 0) { setMentionOpen(true); return }
    setMentionLoading(true)
    setMentionOpen(true)
    try {
      const res = await fetch('https://n8n.nexladesenvolvimento.com.br/webhook/infogrupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instancia: instance, apikey: apiInstancia, idgrupo: selected.idgrupo }),
      })
      const data = await res.json()
      setMentionMembers(Array.isArray(data) ? data : [])
    } catch { setMentionMembers([]) }
    finally { setMentionLoading(false) }
  }

  function handleMentionSelect(member) {
    const numero = (member.phoneNumber || '').replace(/@.*$/, '')
    setMsgText(prev => {
      // Substitui o @ solto pelo @numero
      if (prev.endsWith('@')) return prev.slice(0, -1) + '@' + numero + ' '
      return prev + '@' + numero + ' '
    })
    setMentionOpen(false)
  }

  function handleMsgChange(e) {
    const val = e.target.value
    setMsgText(val)
    // Detecta @ no final (após espaço ou início)
    const atMatch = val.match(/(^|[\s])@$/)
    if (atMatch) {
      fetchMentionMembers()
    } else if (mentionOpen && !val.includes('@')) {
      setMentionOpen(false)
    }
  }

  async function handleSaveMember(numero, nome) {
    if (savingContact === numero) return
    const digits = (numero || '').replace(/\D/g, '')
    if (!digits) return
    setSavingContact(numero)
    try {
      // Salva de verdade como paciente/contato (saved_contacts usa numero só dígitos)
      const { data: existing } = await supabase.from('saved_contacts')
        .select('id').eq('instancia', instance).eq('numero', digits).maybeSingle()
      if (!existing) {
        const { error } = await supabase.from('saved_contacts').insert({
          instancia: instance,
          numero: digits,
          nome: (nome && nome.trim()) || digits,   // provisório — dá pra renomear em Pacientes
          created_by_email: session?.user?.email || null,
        })
        if (error) { alert('Erro ao salvar contato: ' + error.message); return }
      }
      setSavedContact(numero)
      setTimeout(() => setSavedContact(null), 2500)
    } finally {
      setSavingContact(null)
    }
  }

  const hasSelected = !!selected

  const tagMatch = buildTagFilter(tagFilter, tagAssignments)
  const q = search.trim().toLowerCase()
  const filteredGroups = groups.filter(g => {
    if (tagFilter.length > 0 && !tagMatch(g.idgrupo)) return false
    if (q && !labelOf(g).toLowerCase().includes(q)) return false
    return true
  })

  return (
    <>
    <div className={`contacts-root${hasSelected ? ' has-selected' : ''}`}>

      {/* Lista de grupos */}
      <div className="contacts-list">
        <div className="contacts-list-header">
          <div className="contacts-list-title">Grupos</div>
          <input
            className="nx-input"
            placeholder="Buscar grupo por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 8, fontSize: 13 }}
          />
          <TagFilter instancia={instance} value={tagFilter} onChange={setTagFilter} />
        </div>
        <div className="contacts-list-body">
          {loading && (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              Carregando grupos…
            </div>
          )}
          {!loading && filteredGroups.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              {groups.length === 0
                ? 'Nenhum grupo encontrado'
                : q
                  ? `Nenhum grupo com "${search.trim()}"`
                  : 'Nenhum grupo com essa etiqueta'}
            </div>
          )}
          {filteredGroups.map(g => {
            const isMuted = mutedGroups.includes(g.idgrupo)
            const unread = unreadCounts[g.idgrupo] || 0
            return (
              <div
                key={g.idgrupo}
                className={`contact-item${selected?.idgrupo === g.idgrupo ? ' selected' : ''}${unread ? ' unread' : ''}`}
                onClick={() => handleSelectGroup(g)}
                onContextMenu={e => handleContextMenu(e, g)}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: '#E0E7FF', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, position: 'relative',
                }}>
                  <Users size={18} color="#4F46E5" />
                  {isMuted && (
                    <div style={{ position: 'absolute', bottom: -2, right: -2, background: '#6B7280', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BellOff size={8} color="#fff" />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: unread ? 800 : 600, fontSize: 13.5, color: isMuted ? 'var(--text-muted)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {labelOf(g)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: unread ? '#2563EB' : 'var(--text-muted)', fontWeight: unread ? 700 : 400 }}>
                        {formatTime(g.lastTs, companyTz)}
                      </span>
                      {unread > 0 && (
                        <div style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#2563EB', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                          {unread > 99 ? '99+' : unread}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {g.lastSenderRow && <strong style={{ fontWeight: 600 }}>{senderLabel(g.lastSenderRow)}: </strong>}
                    {g.lastMsg}
                  </div>
                  {(() => { const gt = tagsOf(g.idgrupo); return gt.length > 0 ? <TagList tags={gt} size="xs" style={{ marginTop: 4 }} /> : null })()}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Painel de mensagens */}
      <div className="chat-panel" style={{ position: 'relative' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)' }}>
            <Users size={40} strokeWidth={1.2} />
            <span style={{ fontSize: 14 }}>Selecione um grupo</span>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <button
                className="chat-back-mobile nx-btn-ghost"
                onClick={() => setSelected(null)}
                style={{ display: 'none' }}
              >
                <ChevronLeft size={16} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#E0E7FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Users size={17} color="#4F46E5" />
                </div>
                <button
                  onClick={fetchGroupInfo}
                  title="Ver integrantes do grupo"
                  style={{
                    minWidth: 0, background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {labelOf(selected)}
                    <ChevronRight size={14} color="#6B7280" style={{ flexShrink: 0 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#2563EB' }}>
                    Ver integrantes
                  </div>
                </button>
                <button
                  onClick={() => setRenameModal({ idgrupo: selected.idgrupo, nome: customNames[selected.idgrupo] || selected.nomegrupo || '' })}
                  title="Renomear grupo (só muda aqui na plataforma)"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: 'var(--text-muted)', flexShrink: 0, display: 'inline-flex',
                  }}
                >
                  <Pencil size={13} />
                </button>
              </div>
              <button
                onClick={() => setSearchOpen(v => !v)}
                title="Pesquisar neste grupo"
                style={{ background: searchOpen ? '#EEF2FF' : 'none', border: '1px solid ' + (searchOpen ? '#C7D2FE' : 'transparent'), borderRadius: 8, cursor: 'pointer', padding: '6px 8px', color: searchOpen ? '#4F46E5' : 'var(--text-muted)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Search size={15} />
              </button>
              <TagPicker
                instancia={instance}
                numero={selected.idgrupo}
                userEmail={session?.user?.email}
                anchor="bottom-right"
              />
            </div>

            {/* Busca dentro do grupo (histórico inteiro) */}
            {searchOpen && (
              <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
                  <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <input
                    autoFocus
                    placeholder="Pesquisar palavras neste grupo..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false) }}
                    style={{ flex: 1, fontSize: 13, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)' }}
                  />
                  {searchTerm.trim().length >= 2 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
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
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: (r.type || '').toLowerCase() === 'atendente' || (r.type || '').toLowerCase() === 'humano' ? '#16A34A' : '#4F46E5' }}>{searchWho(r)}</span>
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>{jumpingTo === r.id ? 'abrindo...' : searchDate(r)}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{searchSnippet(r, searchTerm)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Painel de integrantes do grupo */}
            {groupInfoOpen && (
              <div style={{
                position: 'absolute', top: 0, right: 0, bottom: 0,
                width: 280, background: '#fff', borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', zIndex: 20,
                boxShadow: '-4px 0 16px rgba(15,23,42,0.08)',
              }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Integrantes</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{labelOf(selected)}</div>
                  </div>
                  <button onClick={() => setGroupInfoOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                  {groupInfoLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 16px', color: 'var(--text-muted)' }}>
                      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: 13 }}>Buscando integrantes…</span>
                    </div>
                  )}
                  {!groupInfoLoading && groupInfo?.error && (
                    <div style={{ padding: '16px', fontSize: 13, color: '#DC2626' }}>{groupInfo.error}</div>
                  )}
                  {!groupInfoLoading && groupInfo && !groupInfo.error && (() => {
                    const members = Array.isArray(groupInfo) ? groupInfo : []
                    if (members.length === 0) return (
                      <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-muted)' }}>Nenhum integrante retornado.</div>
                    )
                    // Admins primeiro
                    const sorted = [...members].sort((a, b) => {
                      const aA = !!a.admin; const bA = !!b.admin
                      return bA - aA
                    })
                    return sorted.map((m, i) => {
                      const numero = (m.phoneNumber || '').replace(/@.*$/, '')
                      const isAdmin = !!m.admin
                      const isSuperAdmin = m.admin === 'superadmin'
                      const isActive = activeMember === numero
                      return (
                        <div key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                          <div
                            onClick={() => setActiveMember(isActive ? null : numero)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 16px', cursor: 'pointer',
                              background: isActive ? '#F5F3FF' : 'transparent',
                              transition: 'background .15s',
                            }}
                          >
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                              background: isSuperAdmin ? '#FEF3C7' : isAdmin ? '#EDE9FE' : '#F1F5F9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: isSuperAdmin ? '#92400E' : isAdmin ? '#7C3AED' : '#6B7280',
                            }}>
                              <Phone size={13} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                +{numero}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, borderRadius: 99, padding: '2px 7px', flexShrink: 0,
                              color: isSuperAdmin ? '#92400E' : isAdmin ? '#7C3AED' : '#6B7280',
                              background: isSuperAdmin ? '#FEF3C7' : isAdmin ? '#EDE9FE' : '#F1F5F9',
                              border: `1px solid ${isSuperAdmin ? '#FDE68A' : isAdmin ? '#DDD6FE' : '#E2E8F0'}`,
                            }}>
                              {isSuperAdmin ? 'Dono' : isAdmin ? 'Admin' : 'Membro'}
                            </span>
                          </div>

                          {/* Mini-menu de ações */}
                          {isActive && (
                            <div style={{
                              display: 'flex', gap: 8, padding: '8px 16px 10px',
                              background: '#F5F3FF',
                            }}>
                              <button
                                onClick={() => navigate(`/painel/conversas?contact=${numero}`)}
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  padding: '7px 10px', borderRadius: 8, border: '1px solid #C4B5FD',
                                  background: '#fff', color: '#7C3AED', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                <MessageCircle size={13} /> Conversar
                              </button>
                              <button
                                onClick={() => handleSaveMember(numero)}
                                disabled={savingContact === numero}
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                  padding: '7px 10px', borderRadius: 8, border: '1px solid #BBF7D0',
                                  background: '#fff', color: '#16A34A', fontSize: 12, fontWeight: 600,
                                  cursor: savingContact === numero ? 'default' : 'pointer',
                                }}
                              >
                                {savedContact === numero
                                  ? <><Check size={13} /> Salvo!</>
                                  : savingContact === numero
                                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</>
                                    : <><UserPlus size={13} /> Salvar</>
                                }
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                  <button onClick={fetchGroupInfo} disabled={groupInfoLoading} style={{
                    width: '100%', padding: '8px', border: '1px solid var(--border)',
                    borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 600,
                    color: 'var(--text-secondary)', cursor: groupInfoLoading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    {groupInfoLoading ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Atualizando…</> : '↻ Atualizar lista'}
                  </button>
                </div>
              </div>
            )}

            <div ref={chatBodyRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!loadingMsgs && hasMoreMsgs && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
                  <button onClick={loadMoreMessages} disabled={loadingMoreMsgs} style={{
                    fontSize: 12, padding: '5px 14px', borderRadius: 20,
                    border: '1px solid var(--border)', background: '#fff',
                    color: 'var(--text-muted)', cursor: 'pointer',
                  }}>
                    {loadingMoreMsgs ? 'Carregando...' : 'Carregar mensagens anteriores'}
                  </button>
                </div>
              )}
              {loadingMsgs && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
                  Carregando mensagens…
                </div>
              )}
              {messages.map(msg => {
                const type = (msg.type || '').toLowerCase()
                const isAtendente = type === 'atendente' || type === 'humano'
                const ts = parseTs(msg)
                const media = detectMedia(msg.base64)
                const cards = contactCardsOf(msg.contact_card)
                // "📇 Nome" é só rótulo pra lista — dentro da bolha o cartão já mostra tudo
                const contactLabelOnly = cards.length > 0 && /^📇/.test((msg.mensagem || '').trim())
                const contactOnly = cards.length > 0 && contactLabelOnly && !media
                return (
                  <div key={msg.id} data-msg-id={msg.id_mensagem || undefined} data-db-id={msg.id} className={`msg-row ${isAtendente ? 'client' : 'ai'}`}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAtendente ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                      {!isAtendente && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            const num = (msg.numero || '').replace(/@.*$/, '')
                            if (!num) return
                            const r = e.currentTarget.getBoundingClientRect()
                            setMemberMenu({ x: r.left, y: r.bottom + 4, numero: num, nome: msg.nome || null })
                          }}
                          title="Conversar ou salvar contato"
                          style={{ fontSize: 11, fontWeight: 600, color: '#4F46E5', marginBottom: 3, marginLeft: 2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                        >
                          {(() => {
                            const num = (msg.numero || '').replace(/@.*$/, '')
                            // Nome + número (igual WhatsApp). Se não tem nome, mostra só o número.
                            if (msg.nome && num) return <>{msg.nome} <span style={{ fontWeight: 400, opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>· {num}</span></>
                            return senderLabel(msg)
                          })()}
                        </span>
                      )}
                      {/* Nome do colaborador que enviou (nosso lado). Igual ao WhatsApp,
                          que mostra quem falou no grupo. Só quando temos o nome. */}
                      {isAtendente && msg.nome && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', marginBottom: 3, marginRight: 2 }}>
                          {msg.nome}
                        </span>
                      )}
                      <div className="msg-bubble" style={{ maxWidth: '100%', wordBreak: 'break-word', padding: media?.type === 'image' ? 4 : (contactOnly ? 0 : undefined), ...(contactOnly ? { background: 'transparent', boxShadow: 'none', border: 'none' } : {}) }}>
                        {/* Bloco de citação (respondendo outra mensagem do grupo) */}
                        {(msg.quoted_id_mensagem || msg.quoted_text) && (() => {
                          const orig = msg.quoted_id_mensagem ? messages.find(m => m.id_mensagem === msg.quoted_id_mensagem) : null
                          let author = !orig ? '' : (orig.nome || senderLabel(orig) || 'Alguém')
                          // Sem a original carregada, usa o quoted_text ("*Nome:*\ntexto") separando autor + texto.
                          let origText
                          if (orig) {
                            origText = (orig.mensagem || '').trim() || (orig.base64 ? '📎 Mídia' : '')
                          } else {
                            const raw = (msg.quoted_text || '').trim()
                            // quoted_text vem "*Andrielly:*\nteste" (: dentro) ou "*Andrielly*:\n..." (: fora)
                            const m = raw.match(/^\*([^*]+?):?\*:?\s*\n?([\s\S]*)$/)
                            if (m) { author = m[1].replace(/:$/, '').trim(); origText = m[2].trim() }
                            else origText = raw || '(mensagem original)'
                          }
                          const canScroll = !!orig
                          const accent = isAtendente ? 'rgba(255,255,255,0.9)' : '#4F46E5'
                          return (
                            <div
                              onClick={() => canScroll && scrollToOriginal(msg.quoted_id_mensagem)}
                              title={canScroll ? 'Ir para a mensagem original' : undefined}
                              style={{
                                display: 'flex', gap: 8, cursor: canScroll ? 'pointer' : 'default', marginBottom: 6,
                                background: isAtendente ? 'rgba(255,255,255,0.15)' : 'rgba(79,70,229,0.08)',
                                borderRadius: 6, padding: '5px 9px', maxWidth: 260,
                              }}>
                              <div style={{ width: 3, borderRadius: 2, background: accent, flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                {author && <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 1 }}>{author}</div>}
                                <div style={{
                                  fontSize: 12, opacity: 0.85,
                                  color: isAtendente ? 'rgba(255,255,255,0.92)' : 'var(--text-secondary)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240,
                                }}>{origText}</div>
                              </div>
                            </div>
                          )
                        })()}
                        {media?.type === 'audio' && (
                          <audio controls src={media.src} style={{ maxWidth: 240, height: 32 }} />
                        )}
                        {media?.type === 'image' && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <img src={media.src} alt="imagem"
                              onClick={() => setLightbox(media.src)}
                              style={{ maxWidth: 240, maxHeight: 280, borderRadius: 8, display: 'block', cursor: 'zoom-in' }} />
                            <a href={media.src} download="imagem.jpg" onClick={e => e.stopPropagation()}
                              title="Baixar imagem"
                              style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 8, background: 'rgba(15,23,42,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                              <Download size={14} />
                            </a>
                          </div>
                        )}
                        {media?.type === 'video' && (
                          <video controls src={media.src}
                            style={{ maxWidth: 240, borderRadius: 8, display: 'block' }} />
                        )}
                        {media?.type === 'pdf' && (
                          <a href={media.src} download="documento.pdf" target="_blank" rel="noreferrer"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 10,
                              background: '#FEF2F2', border: '1px solid #FECACA',
                              borderRadius: 8, padding: '10px 14px', textDecoration: 'none',
                              minWidth: 200, marginBottom: msg.mensagem ? 6 : 0,
                            }}>
                            <div style={{ width: 34, height: 34, borderRadius: 6, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>PDF</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Documento PDF</div>
                              <div style={{ fontSize: 11, color: '#6B7280' }}>Clique para abrir/baixar</div>
                            </div>
                          </a>
                        )}
                        {/* Cartão de contato compartilhado (vCard) */}
                        {cards.map((cc, ci) => (
                          <div key={ci} style={{
                            background: '#fff', border: '1px solid #E9EDF3', borderRadius: 14,
                            overflow: 'hidden', minWidth: 248, maxWidth: 290,
                            marginBottom: (contactOnly ? 0 : 6),
                            boxShadow: '0 1px 2px rgba(15,23,42,0.05), 0 8px 20px -8px rgba(15,23,42,0.14)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 15px 13px' }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div style={{
                                  width: 46, height: 46, borderRadius: '50%',
                                  background: 'linear-gradient(140deg, #EEF2FF 0%, #DDE3FF 100%)',
                                  boxShadow: 'inset 0 0 0 1px rgba(79,70,229,0.14)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#4F46E5', fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em',
                                }}>
                                  {cc.name ? cc.name.trim().charAt(0).toUpperCase() : <User size={20} />}
                                </div>
                                <div style={{
                                  position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: '50%',
                                  background: '#4F46E5', border: '2px solid #fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                                }}>
                                  <User size={9} strokeWidth={2.6} />
                                </div>
                              </div>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em', color: '#9AA6B6', textTransform: 'uppercase', marginBottom: 1 }}>Contato</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>{cc.name}</div>
                                <div style={{ fontSize: 12.5, color: '#64748B', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{cc.phone || 'sem número'}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', borderTop: '1px solid #EEF1F6' }}>
                              <button
                                onClick={e => { e.stopPropagation(); if (cc.digits) navigate(`/painel/conversas?contact=${cc.digits}`) }}
                                disabled={!cc.digits}
                                onMouseEnter={e => { if (cc.digits) e.currentTarget.style.background = '#F0FDF4' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                style={{ flex: 1, padding: '10px 8px', border: 'none', borderRight: '1px solid #EEF1F6', background: 'transparent', color: cc.digits ? '#16A34A' : '#B6C0CE', fontWeight: 700, fontSize: 12.5, cursor: cc.digits ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.12s' }}>
                                <MessageCircle size={14} /> Conversar
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); if (cc.digits) handleSaveMember(cc.digits, cc.name) }}
                                disabled={!cc.digits || savingContact === cc.digits}
                                onMouseEnter={e => { if (cc.digits) e.currentTarget.style.background = '#EEF2FF' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                style={{ flex: 1, padding: '10px 8px', border: 'none', background: 'transparent', color: cc.digits ? '#4F46E5' : '#B6C0CE', fontWeight: 700, fontSize: 12.5, cursor: cc.digits ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.12s' }}>
                                {savedContact === cc.digits ? <><Check size={14} /> Salvo!</> : <><UserPlus size={14} /> Salvar</>}
                              </button>
                            </div>
                          </div>
                        ))}
                        {editingMsgId === msg.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                            <textarea
                              autoFocus
                              value={editingText}
                              onChange={e => setEditingText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(msg) }
                                if (e.key === 'Escape') { setEditingMsgId(null); setEditingText('') }
                              }}
                              rows={2}
                              style={{
                                width: '100%', resize: 'vertical', minHeight: 40, borderRadius: 8,
                                border: 'none', padding: '7px 9px', fontSize: 13, fontFamily: 'inherit',
                                color: '#0F172A', lineHeight: 1.4,
                              }}
                            />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button onClick={() => { setEditingMsgId(null); setEditingText('') }}
                                style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.85)', color: '#475569', cursor: 'pointer' }}>
                                Cancelar
                              </button>
                              <button onClick={() => handleSaveEdit(msg)} disabled={savingEdit || !editingText.trim()}
                                style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.92)', color: '#16A34A', cursor: savingEdit ? 'default' : 'pointer', opacity: savingEdit ? 0.65 : 1 }}>
                                {savingEdit ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          </div>
                        ) : (!media || media.type === 'pdf') && msg.mensagem && !contactLabelOnly && (
                          <span style={{ whiteSpace: 'pre-wrap' }}>
                            {renderTextWithLinks(msg.mensagem, {
                              color: (msg.type || '').toLowerCase() === 'atendente' || (msg.type || '').toLowerCase() === 'humano'
                                ? 'rgba(255,255,255,0.9)' : '#2563EB',
                              textDecoration: 'underline',
                            })}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {formatTime(ts, companyTz)}
                        </span>
                        {/* Responder: qualquer mensagem (inclusive as nossas). Com
                            id_mensagem vira citação nativa; sem ele, citação embutida. */}
                        {!msg.apagada && editingMsgId !== msg.id && (
                          <button
                            onClick={() => startReply(msg)}
                            title="Responder"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 18, height: 18, borderRadius: 4, border: 'none',
                              background: 'transparent', cursor: 'pointer', color: '#4F46E5',
                              opacity: 0.6, padding: 0,
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                          >
                            <Reply size={12} />
                          </button>
                        )}
                        {/* Editar: só nas mensagens de texto do nosso lado */}
                        {isAtendente && msg.mensagem && !media && editingMsgId !== msg.id && (
                          <button
                            onClick={() => { setEditingMsgId(msg.id); setEditingText(msg.mensagem || '') }}
                            title="Editar mensagem"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 18, height: 18, borderRadius: 4, border: 'none',
                              background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)',
                              opacity: 0.55, padding: 0,
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0.55'}
                          >
                            <Pencil size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Barra de envio */}
            <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)' }}>
              {/* Faixa "Respondendo" */}
              {replyingTo && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#EEF2FF', borderLeft: '3px solid #4F46E5',
                  borderRadius: 6, padding: '7px 12px', marginBottom: 8,
                }}>
                  <Reply size={14} style={{ color: '#4F46E5', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5' }}>
                      {['atendente', 'humano', 'ia', 'bot'].includes((replyingTo.type || '').toLowerCase())
                        ? 'Respondendo à sua mensagem'
                        : `Respondendo ${replyingTo.nome ? `a ${replyingTo.nome}` : 'à mensagem'}`}
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
              {/* Preview: arquivo anexado */}
              {attachedFile && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#F8FAFF', border: '1px solid #BFDBFE',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                }}>
                  {attachedFile.kind === 'image' ? (
                    <img src={`data:${attachedFile.mime};base64,${attachedFile.base64}`} alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                  ) : attachedFile.kind === 'video' ? (
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Film size={20} />
                    </div>
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: attachedFile.kind === 'pdf' ? '#FEE2E2' : '#E5E7EB', color: attachedFile.kind === 'pdf' ? '#DC2626' : '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={20} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedFile.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {attachedFile.size >= 1024 * 1024
                        ? (attachedFile.size / (1024 * 1024)).toFixed(1) + ' MB'
                        : (attachedFile.size / 1024).toFixed(0) + ' KB'}
                      {' · '}{attachedFile.kind === 'pdf' ? 'PDF' : attachedFile.kind === 'image' ? 'Imagem' : attachedFile.kind === 'video' ? 'Vídeo' : 'Arquivo'}
                    </div>
                  </div>
                  <button onClick={discardFile} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    <Trash2 size={11} /> Remover
                  </button>
                </div>
              )}

              {/* Preview: áudio gravado */}
              {recordedAudio && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                }}>
                  <audio controls src={`data:${recordedAudio.mime};base64,${recordedAudio.base64}`} style={{ flex: 1, height: 32 }} />
                  <button onClick={discardAudio} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    <Trash2 size={11} /> Descartar
                  </button>
                </div>
              )}

              {/* Indicador de gravação */}
              {recording && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                  fontSize: 12, color: '#DC2626', fontWeight: 600,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', animation: 'pulse-dot 1.2s infinite' }} />
                  Gravando... {String(Math.floor(recordTime / 60)).padStart(2, '0')}:{String(recordTime % 60).padStart(2, '0')}
                  <button onClick={() => stopRecording()} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    <Square size={11} /> Parar
                  </button>
                </div>
              )}

              {/* Erro de envio (insert falhou — sem isso a mensagem some calada) */}
              {sendErr && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626',
                  borderRadius: 8, padding: '7px 12px', marginBottom: 8,
                  fontSize: 12, fontWeight: 600,
                }}>
                  {sendErr}
                </div>
              )}

              {/* Input row */}
              <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
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
                {/* Dropdown de @ menção */}
                {mentionOpen && (
                  <div ref={mentionRef} style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 120,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 6px 24px rgba(15,23,42,0.12)', zIndex: 9999,
                    maxHeight: 220, overflowY: 'auto',
                  }}>
                    <div style={{ padding: '8px 12px 6px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid #F1F5F9' }}>
                      Mencionar integrante
                    </div>
                    {mentionLoading && (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Buscando integrantes…
                      </div>
                    )}
                    {!mentionLoading && mentionMembers.length === 0 && (
                      <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Nenhum integrante encontrado
                      </div>
                    )}
                    {mentionMembers.map((m, i) => {
                      const numero = (m.phoneNumber || '').replace(/@.*$/, '')
                      const isAdmin = !!m.admin
                      return (
                        <div key={i} onClick={() => handleMentionSelect(m)} style={{
                          padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                          borderBottom: '1px solid #F8FAFC',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: isAdmin ? '#EDE9FE' : '#F1F5F9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isAdmin ? '#7C3AED' : '#6B7280', fontSize: 11,
                          }}>
                            <Phone size={11} />
                          </div>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                            +{numero}
                          </span>
                          {isAdmin && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', background: '#EDE9FE', borderRadius: 99, padding: '1px 6px' }}>
                              {m.admin === 'superadmin' ? 'Dono' : 'Admin'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                <textarea
                  ref={composerRef}
                  rows={1}
                  className="nx-input chat-composer-input"
                  style={{ flex: 1, resize: 'none', minHeight: 38, maxHeight: 120, overflowY: 'auto', lineHeight: 1.4, fontFamily: 'inherit' }}
                  placeholder={attachedFile ? 'Mensagem opcional para acompanhar o arquivo…' : recordedAudio ? 'Mensagem opcional para acompanhar o áudio…' : 'Mensagem para o grupo…  (Shift+Enter pula linha)'}
                  value={msgText}
                  onChange={handleMsgChange}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setMentionOpen(false); if (replyingTo) setReplyingTo(null); return }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                  }}
                  // não desabilita no envio: caixa continua focada pra digitar a próxima
                  disabled={recording}
                />
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf,video/*" style={{ display: 'none' }} onChange={handlePickFile} />
                {!recording && !recordedAudio && !attachedFile && (
                  <>
                    <button
                      onClick={() => setShowEmoji(v => !v)}
                      title="Emojis"
                      style={{
                        padding: '0 12px', flexShrink: 0,
                        background: showEmoji ? '#FEF9C3' : '#fff',
                        border: `1px solid ${showEmoji ? '#FDE047' : 'var(--border)'}`,
                        borderRadius: 8, fontSize: 17, lineHeight: 1,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
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
                      style={{ padding: '0 14px', flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, color: '#6B7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <Paperclip size={15} />
                    </button>
                    <button
                      onClick={startRecording}
                      title="Gravar áudio"
                      style={{ padding: '0 14px', flexShrink: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, color: '#6B7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <Mic size={15} />
                    </button>
                  </>
                )}
                <button
                  className="nx-btn-primary"
                  style={{ padding: '0 16px', flexShrink: 0 }}
                  onClick={handleSend}
                  disabled={(!msgText.trim() && !recordedAudio && !attachedFile && !recording) || sending}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {contextMenu && createPortal(
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 99997 }} onClick={() => setContextMenu(null)} />
        <div style={{
          position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 99998,
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
          padding: 4, minWidth: 180,
        }}>
          <button
            onClick={() => {
              const g = contextMenu.group
              setRenameModal({ idgrupo: g.idgrupo, nome: customNames[g.idgrupo] || g.nomegrupo || '' })
              setContextMenu(null)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 12px', border: 'none',
              background: 'none', cursor: 'pointer', borderRadius: 6,
              fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #F3F4F6)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <Pencil size={14} color="#6B7280" /> Renomear grupo
          </button>
          <button
            onClick={() => {
              const g = contextMenu.group
              if (unreadCounts[g.idgrupo] > 0) handleMarkGroupRead(g)
              else handleMarkGroupUnread(g)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 12px', border: 'none',
              background: 'none', cursor: 'pointer', borderRadius: 6,
              fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #F3F4F6)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {unreadCounts[contextMenu.group.idgrupo] > 0
              ? <><MailOpen size={14} color="#6B7280" /> Marcar como lido</>
              : <><Mail size={14} color="#6B7280" /> Marcar como não lido</>}
          </button>
          <button
            onClick={() => toggleMute(contextMenu.group.idgrupo)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 12px', border: 'none',
              background: 'none', cursor: 'pointer', borderRadius: 6,
              fontSize: 13, color: 'var(--text-primary)', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #F3F4F6)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {mutedGroups.includes(contextMenu.group.idgrupo)
              ? <><Bell size={14} color="#16A34A" /> Ativar notificações</>
              : <><BellOff size={14} color="#6B7280" /> Silenciar grupo</>}
          </button>
        </div>
      </>,
      document.body
    )}

    {memberMenu && createPortal(
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 99997 }} onClick={() => setMemberMenu(null)} />
        <div style={{
          position: 'fixed', left: memberMenu.x, top: memberMenu.y, zIndex: 99998,
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
          padding: 6, minWidth: 190,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 10px 6px', fontVariantNumeric: 'tabular-nums' }}>
            {memberMenu.nome ? memberMenu.nome : `+${memberMenu.numero}`}
          </div>
          <button
            onClick={() => { navigate(`/painel/conversas?contact=${memberMenu.numero}`); setMemberMenu(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <MessageCircle size={14} color="#7C3AED" /> Conversar
          </button>
          <button
            onClick={() => { handleSaveMember(memberMenu.numero, memberMenu.nome); setMemberMenu(null) }}
            disabled={savingContact === memberMenu.numero}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {savedContact === memberMenu.numero
              ? <><Check size={14} color="#16A34A" /> Salvo!</>
              : <><UserPlus size={14} color="#16A34A" /> Salvar contato</>}
          </button>
        </div>
      </>,
      document.body
    )}

    {lightbox && createPortal(
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, cursor: 'zoom-out' }}
        onClick={() => setLightbox(null)}
      >
        <img src={lightbox} alt="imagem" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
        <a href={lightbox} download="imagem.jpg" onClick={e => e.stopPropagation()}
          title="Baixar imagem"
          style={{ position: 'fixed', top: 20, right: 20, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <Download size={16} /> Baixar
        </a>
      </div>,
      document.body
    )}

    {/* Renomear grupo (apelido só da plataforma) */}
    {renameModal && createPortal(
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1.5rem',
      }}>
        <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Renomear grupo</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                {renameModal.idgrupo.replace('@g.us', '')}
              </div>
            </div>
            <button onClick={() => setRenameModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Nome do grupo
            </label>
            <input
              className="nx-input"
              autoFocus
              placeholder="Ex: Equipe Recepção"
              value={renameModal.nome}
              onChange={e => setRenameModal(p => ({ ...p, nome: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveGroupName() }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Muda só aqui na plataforma — o nome no WhatsApp continua o mesmo.
              Deixe em branco pra voltar ao nome original.
            </div>
            {renameErr && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginTop: 10 }}>
                {renameErr}
              </div>
            )}
          </div>
          <div style={{ padding: '0 1.5rem 1.25rem', display: 'flex', gap: 10 }}>
            <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setRenameModal(null)}>Cancelar</button>
            <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveGroupName} disabled={savingName}>
              {savingName ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}
