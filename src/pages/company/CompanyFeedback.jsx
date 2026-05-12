import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Star, Send, Lightbulb, Bug, Heart, HelpCircle, MoreHorizontal,
  CheckCircle2, Clock, Sparkles, MessageCircle, ArrowRight,
} from 'lucide-react'

const CATEGORIES = [
  { value: 'sugestao', label: 'Sugestão',   icon: Lightbulb,    accent: '#D97706', soft: '#FEF3C7' },
  { value: 'bug',      label: 'Bug',        icon: Bug,          accent: '#DC2626', soft: '#FEE2E2' },
  { value: 'elogio',   label: 'Elogio',     icon: Heart,        accent: '#DB2777', soft: '#FCE7F3' },
  { value: 'duvida',   label: 'Dúvida',     icon: HelpCircle,   accent: '#0891B2', soft: '#CFFAFE' },
  { value: 'outro',    label: 'Outro',      icon: MoreHorizontal, accent: '#6366F1', soft: '#E0E7FF' },
]

const STATUS_LABELS = {
  novo:        { label: 'Recebido',      icon: Clock,        color: '#475569', bg: '#F1F5F9' },
  em_analise:  { label: 'Em análise',    icon: Sparkles,     color: '#0891B2', bg: '#CFFAFE' },
  planejado:   { label: 'No roadmap',    icon: ArrowRight,   color: '#7C3AED', bg: '#EDE9FE' },
  feito:       { label: 'Implementado',  icon: CheckCircle2, color: '#16A34A', bg: '#DCFCE7' },
  recusado:    { label: 'Fora do escopo', icon: MessageCircle, color: '#DC2626', bg: '#FEE2E2' },
}

const MAX_MSG = 600

export default function CompanyFeedback() {
  const { session } = useAuth()
  const companyId = session?.company?.id

  const [list, setList]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [submitting, setSubmitting]   = useState(false)

  // Form state
  const [category, setCategory]       = useState('sugestao')
  const [rating, setRating]           = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [message, setMessage]         = useState('')
  const [errMsg, setErrMsg]           = useState('')
  const [sentToast, setSentToast]     = useState(false)

  // Carrega histórico da empresa
  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    supabase.from('feedbacks').select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setList(data || []); setLoading(false) })
  }, [companyId])

  // Realtime — feedbacks novos ou updates do ADM aparecem na hora
  useEffect(() => {
    if (!companyId) return
    const ch = supabase.channel(`feedbacks-${companyId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'feedbacks', filter: `company_id=eq.${companyId}` },
        (p) => {
          if (p.eventType === 'INSERT') {
            setList(prev => [p.new, ...prev.filter(f => f.id !== p.new.id)])
          } else if (p.eventType === 'UPDATE') {
            setList(prev => prev.map(f => f.id === p.new.id ? p.new : f))
          } else if (p.eventType === 'DELETE') {
            setList(prev => prev.filter(f => f.id !== p.old.id))
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [companyId])

  async function handleSubmit() {
    setErrMsg('')
    if (!message.trim()) { setErrMsg('Conta pra gente o que tá pensando 😊'); return }
    if (message.length > MAX_MSG) { setErrMsg(`Texto muito longo (máx ${MAX_MSG} caracteres)`); return }
    if (category !== 'duvida' && category !== 'bug' && rating === 0) {
      // Sugestão/elogio/outro precisam de nota
      setErrMsg('Dá uma nota antes de mandar — ajuda a gente priorizar'); return
    }
    setSubmitting(true)
    const { error } = await supabase.from('feedbacks').insert({
      company_id: companyId,
      user_id:    session?.user?.id || null,
      user_name:  session?.user?.name || 'Anônimo',
      user_email: session?.user?.email || '',
      category,
      rating: rating || null,
      message: message.trim(),
    })
    setSubmitting(false)
    if (error) { setErrMsg('Não rolou enviar: ' + error.message); return }
    // Reset
    setMessage('')
    setRating(0)
    setHoverRating(0)
    setCategory('sugestao')
    setSentToast(true)
    setTimeout(() => setSentToast(false), 3500)
  }

  const selectedCat = CATEGORIES.find(c => c.value === category) || CATEGORIES[0]

  return (
    <div className="page-enter" style={{ padding: '1.5rem', maxWidth: 920, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: 'var(--font-display, "Bricolage Grotesque")',
          fontWeight: 700, fontSize: '1.75rem', letterSpacing: '-0.03em',
          color: 'var(--text-primary)', lineHeight: 1.1,
        }}>
          Conta o que tá pensando
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-secondary)', maxWidth: 580, lineHeight: 1.55 }}>
          O CliniSac evolui com vocês. Manda sugestão, reporta bug, deixa elogio ou dúvida — a gente lê tudo,
          responde e prioriza com base no que mais aparece.
          <span style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', color: 'var(--text-muted)', marginLeft: 4 }}>
            sem rodeios, sem formulário robô.
          </span>
        </div>
      </div>

      {/* Form card */}
      <div style={{
        position: 'relative',
        background: `
          radial-gradient(circle at 0% 0%, ${selectedCat.soft} 0%, transparent 55%),
          linear-gradient(180deg, #FFFFFF 0%, #FBFAFC 100%)
        `,
        border: '1px solid rgba(15, 14, 27, 0.08)',
        borderRadius: 18,
        padding: '1.75rem 1.75rem 1.5rem',
        marginBottom: 32,
        overflow: 'hidden',
        transition: 'background 0.4s ease',
      }}>
        {/* Categoria pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {CATEGORIES.map(c => {
            const CIcon = c.icon
            const active = category === c.value
            return (
              <button key={c.value} type="button"
                onClick={() => setCategory(c.value)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 13px',
                  borderRadius: 999,
                  border: `1.5px solid ${active ? c.accent : 'var(--border)'}`,
                  background: active ? c.soft : '#fff',
                  color: active ? c.accent : 'var(--text-secondary)',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}>
                <CIcon size={13} /> {c.label}
              </button>
            )
          })}
        </div>

        {/* Rating */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
          }}>
            Que nota você dá pra plataforma?
            {(category === 'duvida' || category === 'bug') && (
              <span style={{ marginLeft: 6, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>
                · opcional
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => {
              const filled = (hoverRating || rating) >= n
              return (
                <button key={n} type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: 4, display: 'inline-flex',
                    transition: 'transform 0.15s ease',
                    transform: hoverRating === n ? 'scale(1.12)' : 'scale(1)',
                  }}>
                  <Star size={28}
                    fill={filled ? '#FBBF24' : 'transparent'}
                    color={filled ? '#F59E0B' : '#CBD5E1'}
                    strokeWidth={1.8}
                    style={{ transition: 'fill 0.15s ease, color 0.15s ease' }} />
                </button>
              )
            })}
            {rating > 0 && (
              <span style={{
                marginLeft: 10, fontSize: 12.5, fontWeight: 600,
                color: 'var(--text-secondary)',
              }}>
                {rating === 5 ? 'sensacional ✨' :
                 rating === 4 ? 'muito bom' :
                 rating === 3 ? 'razoável' :
                 rating === 2 ? 'precisa melhorar' :
                                'tá longe ainda'}
              </span>
            )}
          </div>
        </div>

        {/* Mensagem */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
          }}>
            {category === 'bug' ? 'Conta o que aconteceu' :
             category === 'sugestao' ? 'O que você gostaria que tivesse' :
             category === 'elogio' ? 'O que tá funcionando bem' :
             category === 'duvida' ? 'Qual a dúvida' :
             'Manda ver'}
          </div>
          <textarea
            className="nx-input"
            placeholder={
              category === 'bug' ? 'Tela X, cliquei em Y, esperava Z, mas aconteceu W…' :
              category === 'sugestao' ? 'Seria muito útil se desse pra…' :
              category === 'elogio' ? 'Adoramos quando…' :
              category === 'duvida' ? 'Não consegui entender como…' :
              'Conta pra gente…'
            }
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            maxLength={MAX_MSG}
            style={{ resize: 'vertical', minHeight: 100, fontFamily: 'inherit', lineHeight: 1.55 }}
          />
          <div style={{
            marginTop: 4, fontSize: 11,
            color: message.length > MAX_MSG * 0.9 ? '#D97706' : 'var(--text-muted)',
            textAlign: 'right', fontVariantNumeric: 'tabular-nums',
          }}>
            {message.length} / {MAX_MSG}
          </div>
        </div>

        {/* Footer com botão e erro */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 13, color: 'var(--text-muted)',
            fontStyle: 'italic',
            fontFamily: 'Instrument Serif, serif',
          }}>
            {sentToast ? (
              <span style={{ color: '#16A34A', fontWeight: 600, fontFamily: 'inherit', fontStyle: 'normal' }}>
                ✓ Recebido! A gente lê e volta com você.
              </span>
            ) : errMsg ? (
              <span style={{ color: '#DC2626', fontWeight: 600, fontFamily: 'inherit', fontStyle: 'normal' }}>
                {errMsg}
              </span>
            ) : (
              <>Vai pro time direto. Resposta no painel ou no e-mail.</>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !message.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px',
              borderRadius: 12,
              border: 'none', cursor: submitting ? 'wait' : 'pointer',
              background: `linear-gradient(120deg, ${selectedCat.accent} 0%, ${selectedCat.accent}dd 100%)`,
              color: '#fff',
              fontFamily: 'var(--font-display, "Bricolage Grotesque")',
              fontWeight: 700, fontSize: 13.5,
              letterSpacing: '-0.01em',
              opacity: (submitting || !message.trim()) ? 0.6 : 1,
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              boxShadow: `0 6px 18px -6px ${selectedCat.accent}aa`,
            }}
            onMouseEnter={e => { if (!submitting && message.trim()) e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
            <Send size={14} /> {submitting ? 'Enviando…' : 'Mandar feedback'}
          </button>
        </div>
      </div>

      {/* Histórico */}
      <div>
        <div style={{
          fontFamily: 'var(--font-display, "Bricolage Grotesque")',
          fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.02em',
          color: 'var(--text-primary)', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Seus feedbacks anteriores
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
            color: 'var(--text-muted)', background: '#F1F5F9', padding: '2px 8px', borderRadius: 999,
          }}>
            {list.length}
          </span>
        </div>

        {loading ? (
          <div className="nx-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Carregando…
          </div>
        ) : list.length === 0 ? (
          <div className="nx-card" style={{
            padding: '2.5rem 2rem', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <MessageCircle size={32} style={{ opacity: 0.18 }} />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 380, lineHeight: 1.55 }}>
              Ainda não rolou nenhum feedback seu. Quando mandar, fica aqui o histórico — com as respostas do time.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {list.map(f => {
              const cat = CATEGORIES.find(c => c.value === f.category) || CATEGORIES[CATEGORIES.length - 1]
              const CIcon = cat.icon
              const status = STATUS_LABELS[f.status] || STATUS_LABELS.novo
              const SIcon = status.icon
              return (
                <div key={f.id} className="nx-card" style={{ padding: '1.1rem 1.25rem', position: 'relative' }}>
                  {/* Faixa de categoria à esquerda */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: 3, background: cat.accent,
                    borderRadius: '12px 0 0 12px',
                  }} />
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 999,
                        background: cat.soft, color: cat.accent,
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>
                        <CIcon size={11} /> {cat.label}
                      </span>
                      {f.rating && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={11}
                              fill={i < f.rating ? '#FBBF24' : 'transparent'}
                              color={i < f.rating ? '#F59E0B' : '#CBD5E1'}
                              strokeWidth={1.8} />
                          ))}
                        </span>
                      )}
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {new Date(f.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 9px', borderRadius: 999,
                      background: status.bg, color: status.color,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      <SIcon size={10} /> {status.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {f.message}
                  </div>
                  {f.adm_response && (
                    <div style={{
                      marginTop: 12,
                      padding: '10px 14px',
                      background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
                      border: '1px solid #BAE6FD',
                      borderRadius: 10,
                      fontSize: 13,
                      color: '#0C4A6E',
                      lineHeight: 1.5,
                    }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: '#0891B2', marginBottom: 4,
                      }}>
                        Resposta do time
                      </div>
                      {f.adm_response}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
