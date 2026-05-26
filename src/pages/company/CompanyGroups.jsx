import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Users, ChevronLeft, Send } from 'lucide-react'
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

export default function CompanyGroups() {
  const { session } = useAuth()
  const instance = session?.company?.instance
  const apiInstancia = session?.company?.api_instancia
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const selectedRef = useRef(null)
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

  async function handleSend() {
    const text = msgText.trim()
    if (!text || !selected || sending) return
    setSending(true)
    setMsgText('')
    try {
      const hora = new Date().toISOString()
      await supabase.from(CONV_TABLE).insert({
        instancia: instance,
        numero: session?.user?.email || 'atendente',
        idgrupo: selected.idgrupo,
        nomegrupo: selected.nomegrupo || null,
        mensagem: text,
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
          mensagem: text,
          session_id: selected.idgrupo,
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
                return (
                  <div key={msg.id} className={`msg-row ${isAtendente ? 'client' : 'ai'}`}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAtendente ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                      {!isAtendente && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#4F46E5', marginBottom: 3, marginLeft: 2 }}>
                          {senderLabel(msg)}
                        </span>
                      )}
                      <div className="msg-bubble">
                        {msg.mensagem}
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
            <div className="chat-input-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              <textarea
                className="chat-textarea"
                rows={1}
                placeholder="Mensagem para o grupo…"
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                disabled={sending}
                style={{ flex: 1, resize: 'none', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--bg-input, #fff)' }}
              />
              <button
                className="nx-btn-primary"
                onClick={handleSend}
                disabled={!msgText.trim() || sending}
                style={{ padding: '0 16px', height: 38, flexShrink: 0 }}
              >
                <Send size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
