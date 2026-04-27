import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { MessageSquare, Bot, User, PhoneCall, CheckCircle2, X, Send, Headset, Sparkles, Inbox, UserCheck, Archive, Mic, Square, Trash2, Paperclip, FileText, Image as ImageIcon } from 'lucide-react'
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
  return null
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
  { value: 'desistiu',       label: 'Desistiu',    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { value: 'auto_encerrado', label: 'Expirado',    color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
]

const AUTO_CLOSE_HOURS = 6
const MANUAL_REASONS = REASONS.filter(r => r.value !== 'auto_encerrado')

export default function CompanyConversations() {
  const { session } = useAuth()
  const instance     = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia

  const isAdmin = session?.user?.role === 'admin'
  const userSector = session?.user?.sector // { id, name, color } or null

  const [contacts, setContacts]         = useState([])
  const [closedMap, setClosedMap]       = useState({}) // session_id → reason
  const [attendancesMap, setAttendancesMap] = useState({}) // numero → attendance record
  const [assuming, setAssuming]         = useState(null)
  const [tab, setTab]                 = useState('recepcao')
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(null)
  const [messages, setMessages]       = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [closeModal, setCloseModal]   = useState(null)
  const [reason, setReason]           = useState('')
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
  const [contextMenu, setContextMenu] = useState(null) // { x, y, contact }
  const [saveContactModal, setSaveContactModal] = useState(null) // { numero, nome, notes }
  const [savingContact, setSavingContact] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const recordTimerRef   = useRef(null)
  const recordStartRef   = useRef(0)
  const fileInputRef     = useRef(null)
  const bottomRef    = useRef(null)
  const selectedRef  = useRef(null)
  const autoCloseDone = useRef(false)

  useEffect(() => { selectedRef.current = selected }, [selected])

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

  // Carrega todos os contatos únicos da mensagens_geral
  useEffect(() => {
    if (!instance) return
    setLoadingContacts(true)
    supabase.from(CONV_TABLE).select('*')
      .eq('instancia', instance)
      .order('id', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          const seen = new Set()
          const unique = []
          for (const row of data) {
            const sid = row.numero
            if (!sid || seen.has(sid)) continue
            if (sid.includes('@g.us')) continue  // ignora grupos do WhatsApp
            seen.add(sid)
            unique.push({ session_id: sid, phone: formatPhone(sid), lastTs: getTimestamp(row) })
          }
          setContacts(unique)
        }
        setLoadingContacts(false)
      })
  }, [instance])

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
      new Date(c.lastTs).getTime() < cutoff
    )
    if (!toClose.length) return

    toClose.forEach(c => {
      supabase.from('conversations').insert({
        session_id: c.session_id,
        instancia: instance,
        reason: 'auto_encerrado',
        closed_at: new Date().toISOString(),
      }).then(() => {})
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
          const sid = row.numero
          if (!sid || sid.includes('@g.us')) return
          const ts = getTimestamp(row)

          // Reabre ticket encerrado: remove do closed e limpa attendance
          setClosedMap(prev => {
            if (!prev[sid]) return prev
            supabase.from('conversations').delete().eq('session_id', sid).eq('instancia', instance)
            supabase.from('attendances').delete().eq('numero', sid).eq('instancia', instance)
            setAttendancesMap(at => { const n = { ...at }; delete n[sid]; return n })
            const next = { ...prev }; delete next[sid]; return next
          })

          setContacts(prev => {
            const exists = prev.find(c => c.session_id === sid)
            if (exists) return [{ ...exists, lastTs: ts }, ...prev.filter(c => c.session_id !== sid)]
            return [{ session_id: sid, phone: formatPhone(sid), lastTs: ts }, ...prev]
          })


          if (selectedRef.current?.session_id === sid) {
            setMessages(msgs => [...msgs, {
              id: row.id,
              type: getMessageType(row),
              content: getMessageContent(row),
              base64: row.base64 || null,
              ts,
            }])
          }
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

  // Carrega mensagens da conversa selecionada
  useEffect(() => {
    if (!selected || !instance) return
    setLoadingMsgs(true)
    setMessages([])
    supabase.from(CONV_TABLE).select('*')
      .eq('instancia', instance)
      .eq('numero', selected.session_id)
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setMessages(data.filter(r => !isToolMessage(r)).map(r => ({
            id: r.id,
            type: getMessageType(r),
            content: getMessageContent(r),
            base64: r.base64 || null,
            ts: getTimestamp(r),
          })))
        }
        setLoadingMsgs(false)
      })
  }, [selected, instance])

  useEffect(() => {
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loadingMsgs])

  async function handleAssume(contact, e) {
    e?.stopPropagation()
    if (attendancesMap[contact.session_id] || assuming === contact.session_id) return
    setAssuming(contact.session_id)
    const name = session?.user?.name || 'Atendente'
    const sectorLabel = userSector ? ` (${userSector.name})` : ''

    await supabase.from('attendances').upsert({
      numero: contact.session_id,
      instancia: instance,
      sector_id: userSector?.id || null,
      sector_name: userSector?.name || null,
      sector_color: userSector?.color || '#6B7280',
      attendant_name: name,
      attendant_email: session?.user?.email,
      assumed_at: new Date().toISOString(),
    }, { onConflict: 'numero,instancia' })

    await supabase.rpc('send_mensagem_geral', {
      p_instancia: instance,
      p_numero: contact.session_id,
      p_mensagem: `▶ Atendimento assumido por ${name}${sectorLabel}`,
      p_type: 'atendente',
      p_hora: new Date().toISOString(),
    })

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
    const MAX = 15 * 1024 * 1024 // 15 MB
    if (file.size > MAX) {
      setToast({ message: 'Arquivo muito grande (máx 15 MB)', color: '#DC2626' })
      setTimeout(() => setToast(null), 3000)
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
      : 'file'
    setAttachedFile({ base64, mime: file.type || 'application/octet-stream', name: file.name, size: file.size, kind })
  }

  function discardFile() {
    setAttachedFile(null)
  }

  async function handleSend() {
    if (sending || !selected) return
    let audio = recordedAudio
    if (recording) {
      audio = await stopRecording({ persistPreview: false })
    }
    if (!msgText.trim() && !audio && !attachedFile) return
    setSending(true)
    try {
      const text = msgText.trim()
      const file = attachedFile
      setMsgText('')
      setRecordedAudio(null)
      setRecordTime(0)
      setAttachedFile(null)

      const mensagemPayload = audio
        ? (text || '🎤 Áudio')
        : file
          ? (text || (file.kind === 'image' ? '🖼️ ' + file.name : file.kind === 'pdf' ? '📄 ' + file.name : '📎 ' + file.name))
          : text
      const mediaBase64 = audio?.base64 || file?.base64 || null
      const { error: insErr } = await supabase.rpc('send_mensagem_geral', {
        p_instancia: instance,
        p_numero: selected.session_id,
        p_mensagem: mensagemPayload,
        p_type: 'atendente',
        p_hora: new Date().toISOString(),
        p_base64: mediaBase64,
      })
      if (insErr) console.error('send_mensagem_geral:', insErr)

      fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
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
          company: session?.company?.name,
          sender_name: session?.user?.name,
          sender_email: session?.user?.email,
        }),
      }).catch(e => console.warn('webhook envio:', e))
    } finally {
      setSending(false)
    }
  }

  async function handleClose() {
    if (!reason || !closeModal) return
    setClosing(true)
    const { error } = await supabase.from('conversations').insert({
      session_id: closeModal.session_id,
      instancia: instance,
      reason,
      closed_at: new Date().toISOString(),
    })
    setClosing(false)
    if (error) return
    const closedId = closeModal.session_id
    setClosedMap(prev => ({ ...prev, [closedId]: reason }))
    supabase.from('attendances').delete().eq('numero', closedId).eq('instancia', instance)
    setAttendancesMap(prev => { const n = { ...prev }; delete n[closedId]; return n })
    if (selected?.session_id === closedId) setSelected(null)
    setCloseModal(null)
    setReason('')
    setTab('finalizados')
    const label = REASONS.find(r => r.value === reason)?.label || reason
    setToast({ message: `Conversa finalizada — ${label}`, color: REASONS.find(r => r.value === reason)?.color || '#16A34A' })
    setTimeout(() => setToast(null), 3500)
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
  const filtered = currentList.filter(c => c.phone.includes(search))
  const isClosed = selected ? closed.has(selected.session_id) : false

  return (
    <div className="contacts-root">
      <div className="contacts-list">
        {/* Abas */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          {tabList.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(null) }}
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
        </div>

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
            const rs = closedReason ? REASONS.find(r => r.value === closedReason) : null
            const cleanNum = c.phone.replace(/\D/g, '')
            const saved = savedContacts[cleanNum]
            return (
              <div
                key={c.session_id}
                className={`contact-item ${selected?.session_id === c.session_id ? 'selected' : ''}`}
                onClick={() => setSelected(c)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, contact: c })
                }}
              >
                <div className="contact-avatar"><User size={14} style={{ opacity: 0.4 }} /></div>
                <div className="contact-info" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <div className="contact-name" style={saved ? { fontWeight: 600 } : {}}>
                      {saved ? saved.nome : c.phone}
                    </div>
                    {saved && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.phone}</span>
                    )}
                    {tab === 'recepcao' && (
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
                  </div>
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
                  {c.lastTs && <div className="contact-time">{formatContactTime(c.lastTs)}</div>}
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
              <div className="contact-avatar" style={{ width: 38, height: 38 }}>
                <User size={14} style={{ opacity: 0.4 }} />
              </div>
              {(() => {
                const cleanNum = selected.phone.replace(/\D/g, '')
                const saved = savedContacts[cleanNum]
                return (
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>
                      {saved ? saved.nome : selected.phone}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {saved && <span style={{ fontFamily: 'monospace' }}>{selected.phone}</span>}
                      {!loadingMsgs && <span>{messages.length} mensagem(ns)</span>}
                    </div>
                  </div>
                )
              })()}
              {!isClosed && (
                <button
                  className="nx-btn-ghost"
                  style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => { setCloseModal(selected); setReason('') }}
                >
                  <CheckCircle2 size={14} /> Finalizar conversa
                </button>
              )}
              {isClosed && (() => {
                const rs = REASONS.find(r => r.value === closedMap[selected.session_id])
                return rs ? (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                    color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`,
                  }}>{rs.label}</span>
                ) : null
              })()}
            </div>

            {/* Banner Recepção: botão assumir */}
            {!isClosed && !attendancesMap[selected.session_id] && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#EFF6FF', borderBottom: '1px solid #BFDBFE',
                padding: '10px 20px', flexShrink: 0, gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E40AF' }}>
                  <Sparkles size={15} style={{ color: '#2563EB' }} />
                  <span>Conversa sob atendimento da <strong>IA</strong></span>
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
            )}

            {/* Banner Finalizados */}
            {isClosed && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#F8FAFC', borderBottom: '1px solid var(--border)',
                padding: '8px 18px', flexShrink: 0,
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                <Archive size={13} />
                Conversa encerrada. Se o cliente enviar nova mensagem, um novo ticket será aberto automaticamente.
              </div>
            )}

            <div className="chat-body">
              {loadingMsgs && (
                <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: '2rem' }}>
                  Carregando mensagens...
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
                  <div key={msg.id}>
                    <div className="msg-label" style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      justifyContent: isLeft ? 'flex-start' : 'flex-end',
                      color: labelColor,
                    }}>
                      {isCliente
                        ? <><User size={10} /> Cliente</>
                        : isAtendente
                          ? <><Headset size={10} /> Atendente</>
                          : <><Bot size={10} /> IA</>}
                    </div>
                    <div className={`msg-row ${isLeft ? 'ai' : 'client'}`}>
                      <div className="msg-bubble" style={isAtendente ? { background: '#16A34A', color: '#fff', borderBottomRightRadius: 4 } : {}}>
                        {(() => {
                          const media = detectMedia(msg.base64)
                          if (!media) return null
                          const src = `data:${media.mime};base64,${msg.base64}`
                          if (media.type === 'audio') return (
                            <audio controls src={src} style={{ width: '100%', maxWidth: 260, display: 'block', marginBottom: 6 }} />
                          )
                          if (media.type === 'image') return (
                            <img src={src} alt="mídia" style={{ maxWidth: 280, width: '100%', borderRadius: 8, display: 'block', marginBottom: 6, cursor: 'zoom-in' }}
                              onClick={() => setLightbox(src)} />
                          )
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
                        {msg.content && <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>}
                      </div>
                    </div>
                    {msg.ts && (
                      <div className="msg-time" style={{ textAlign: isLeft ? 'left' : 'right' }}>
                        {formatMsgTime(msg.ts)}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {!isClosed && (
              <div style={{ padding: '12px 18px', borderTop: '0.5px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
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
                        {(attachedFile.size / 1024).toFixed(0)} KB · {attachedFile.kind === 'pdf' ? 'PDF' : attachedFile.kind === 'image' ? 'Imagem' : 'Arquivo'}
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
                    <audio controls src={`data:${recordedAudio.mime};base64,${recordedAudio.base64}`}
                      style={{ flex: 1, height: 32 }} />
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
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input
                    className="nx-input"
                    style={{ flex: 1, fontSize: 13 }}
                    placeholder={
                      recordedAudio ? "Mensagem opcional para acompanhar o áudio..."
                      : attachedFile ? "Mensagem opcional para acompanhar o arquivo..."
                      : "Digite uma mensagem..."
                    }
                    value={msgText}
                    onChange={e => setMsgText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={sending || recording}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }}
                    onChange={handlePickFile}
                  />
                  {!recording && !recordedAudio && !attachedFile && (
                    <>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Anexar imagem ou PDF"
                        style={{
                          padding: '0 14px', flexShrink: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, color: '#6B7280', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center',
                        }}
                      >
                        <Paperclip size={15} />
                      </button>
                      <button
                        onClick={startRecording}
                        title="Gravar áudio"
                        style={{
                          padding: '0 14px', flexShrink: 0,
                          background: '#fff', border: '1px solid var(--border)',
                          borderRadius: 8, color: '#6B7280', cursor: 'pointer',
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
                    disabled={(!msgText.trim() && !recordedAudio && !attachedFile && !recording) || sending}
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
            return (
              <button
                onClick={() => openSaveContact(contextMenu.contact)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '8px 12px', border: 'none', background: 'transparent',
                  fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer',
                  borderRadius: 6, textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <User size={13} />
                {saved ? 'Editar contato' : 'Salvar contato'}
              </button>
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
                  {saveContactModal.id ? 'Editar contato' : 'Salvar contato'}
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

      {closeModal && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Finalizar conversa</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {closeModal.phone} — qual foi o resultado?
                </div>
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                onClick={() => setCloseModal(null)}><X size={16} /></button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MANUAL_REASONS.map(r => (
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: reason === r.value ? r.color : 'var(--text-primary)' }}>
                    {r.label}
                  </div>
                </label>
              ))}
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
