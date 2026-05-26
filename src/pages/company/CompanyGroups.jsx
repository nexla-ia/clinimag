import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Users, ChevronLeft, Send, Mic, Square, Paperclip, Trash2, Film, FileText } from 'lucide-react'
import './Company.css'

const CONV_TABLE = 'mensagens_geral'

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const hhmm = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return hhmm
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `Ontem ${hhmm}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm}`
}

function parseTs(row) {
  const raw = row.horaLastMessage || row.created_at
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
  if (b64.startsWith('T2dn')) return { type: 'audio', mime: 'audio/ogg' }
  if (b64.startsWith('//uQ') || b64.startsWith('SUQz')) return { type: 'audio', mime: 'audio/mpeg' }
  if (b64.startsWith('GkXf')) return { type: 'audio', mime: 'audio/webm' }
  if (b64.startsWith('/9j/')) return { type: 'image', mime: 'image/jpeg' }
  if (b64.startsWith('iVBOR')) return { type: 'image', mime: 'image/png' }
  if (b64.startsWith('UklGR')) return { type: 'image', mime: 'image/webp' }
  if (b64.startsWith('R0lGOD')) return { type: 'image', mime: 'image/gif' }
  if (b64.startsWith('JVBERi')) return { type: 'pdf', mime: 'application/pdf' }
  try {
    if (b64.length > 100 && atob(b64.slice(0, 16)).slice(4, 8) === 'ftyp') return { type: 'video', mime: 'video/mp4' }
  } catch {}
  return null
}

export default function CompanyGroups() {
  const { session } = useAuth()
  const instance = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia
  const instanceOwner = session?.company?.numero_base || null
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState(null)
  const [recordTime, setRecordTime] = useState(0)
  const [attachedFile, setAttachedFile] = useState(null)
  const bottomRef = useRef(null)
  const selectedRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordStartRef = useRef(null)
  const recordTimerRef = useRef(null)
  const fileInputRef = useRef(null)
  selectedRef.current = selected

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    supabase.from(CONV_TABLE)
      .select('id, idgrupo, nomegrupo, mensagem, numero, nome, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .not('idgrupo', 'is', null)
      .order('id', { ascending: false })
      .limit(20000)
      .then(({ data, error }) => {
        if (error || !data) { setLoading(false); return }
        const seen = new Set()
        const unique = []
        for (const row of data) {
          if (!row.idgrupo || seen.has(row.idgrupo)) continue
          seen.add(row.idgrupo)
          unique.push({
            idgrupo: row.idgrupo,
            nomegrupo: row.nomegrupo || null,
            lastMsg: row.mensagem || '',
            lastTs: parseTs(row),
            lastSenderRow: row,
          })
        }
        setGroups(unique)
        setLoading(false)
      })
  }, [instance])

  useEffect(() => {
    if (!selected || !instance) return
    setLoadingMsgs(true)
    setMessages([])
    supabase.from(CONV_TABLE)
      .select('id, numero, nome, type, mensagem, base64, "horaLastMessage", created_at')
      .eq('instancia', instance)
      .eq('idgrupo', selected.idgrupo)
      .order('id', { ascending: true })
      .limit(2000)
      .then(({ data, error }) => {
        if (!error && data) setMessages(data)
        setLoadingMsgs(false)
      })
  }, [selected?.idgrupo, instance])

  useEffect(() => {
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
    const isVideo = file.type.startsWith('video/')
    const MAX = isVideo ? 50 * 1024 * 1024 : 15 * 1024 * 1024
    if (file.size > MAX) return
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
    const filePrefix = attachedFile
      ? (attachedFile.kind === 'image' ? '🖼️ ' : attachedFile.kind === 'pdf' ? '📄 ' : attachedFile.kind === 'video' ? '🎬 ' : '📎 ') + attachedFile.name
      : null
    const mensagemPayload = audio
      ? (text || '🎤 Áudio')
      : attachedFile
        ? (text ? `${filePrefix}\n${text}` : filePrefix)
        : text
    const mediaBase64 = audio?.base64 || attachedFile?.base64 || null
    setMsgText('')
    setRecordedAudio(null)
    setRecordTime(0)
    setAttachedFile(null)
    try {
      const hora = new Date().toISOString()
      await supabase.from(CONV_TABLE).insert({
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
      })
      fetch('https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mensagem: mensagemPayload,
          audio_base64: audio?.base64 || null,
          audio_mime: audio?.mime || null,
          audio_duration: audio?.duration || null,
          file_base64: attachedFile?.base64 || null,
          file_mime: attachedFile?.mime || null,
          file_name: attachedFile?.name || null,
          file_kind: attachedFile?.kind || null,
          session_id: selected.idgrupo,
          numero: instanceOwner || selected.idgrupo,
          idgrupo: selected.idgrupo,
          nomegrupo: selected.nomegrupo || null,
          instancia: instance,
          api_instancia: apiInstancia,
          sender_name: session?.user?.name,
          sender_email: session?.user?.email,
          company: session?.company?.name,
          ai_enabled: false,
        }),
      }).catch(e => console.warn('webhook grupo:', e))
    } finally {
      setSending(false)
    }
  }

  const hasSelected = !!selected

  return (
    <div className={`contacts-root${hasSelected ? ' has-selected' : ''}`}>

      {/* Lista de grupos */}
      <div className="contacts-list">
        <div className="contacts-list-header">
          <div className="contacts-list-title">Grupos</div>
        </div>
        <div className="contacts-list-body">
          {loading && (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              Carregando grupos…
            </div>
          )}
          {!loading && groups.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
              Nenhum grupo encontrado
            </div>
          )}
          {groups.map(g => (
            <div
              key={g.idgrupo}
              className={`contact-item${selected?.idgrupo === g.idgrupo ? ' selected' : ''}`}
              onClick={() => setSelected(g)}
            >
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: '#E0E7FF', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                <Users size={18} color="#4F46E5" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {groupLabel(g)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {formatTime(g.lastTs)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                  {g.lastSenderRow && <strong style={{ fontWeight: 600 }}>{senderLabel(g.lastSenderRow)}: </strong>}
                  {g.lastMsg}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Painel de mensagens */}
      <div className="chat-panel">
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
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {groupLabel(selected)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {selected.idgrupo}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                return (
                  <div key={msg.id} className={`msg-row ${isAtendente ? 'client' : 'ai'}`}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAtendente ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                      {!isAtendente && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#4F46E5', marginBottom: 3, marginLeft: 2 }}>
                          {senderLabel(msg)}
                        </span>
                      )}
                      <div className="msg-bubble" style={{ maxWidth: '100%', wordBreak: 'break-word', padding: media?.type === 'image' ? 4 : undefined }}>
                        {media?.type === 'audio' && (
                          <audio controls src={`data:${media.mime};base64,${msg.base64}`} style={{ maxWidth: 240, height: 32 }} />
                        )}
                        {media?.type === 'image' && (
                          <img src={`data:${media.mime};base64,${msg.base64}`} alt="imagem"
                            style={{ maxWidth: 240, maxHeight: 280, borderRadius: 8, display: 'block' }} />
                        )}
                        {media?.type === 'video' && (
                          <video controls src={`data:${media.mime};base64,${msg.base64}`}
                            style={{ maxWidth: 240, borderRadius: 8, display: 'block' }} />
                        )}
                        {(!media || media.type === 'pdf') && msg.mensagem && (
                          <span>{msg.mensagem}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        {formatTime(ts)}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Barra de envio */}
            <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border)' }}>
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

              {/* Input row */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="nx-input chat-composer-input"
                  style={{ flex: 1 }}
                  placeholder={attachedFile ? 'Mensagem opcional para acompanhar o arquivo…' : recordedAudio ? 'Mensagem opcional para acompanhar o áudio…' : 'Mensagem para o grupo…'}
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  disabled={sending || recording}
                />
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf,video/*" style={{ display: 'none' }} onChange={handlePickFile} />
                {!recording && !recordedAudio && !attachedFile && (
                  <>
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
  )
}
