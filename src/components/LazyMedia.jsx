import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const CONV_TABLE = 'mensagens_geral'

// Placeholder de mídia que só baixa o base64 quando entra na tela (IntersectionObserver).
// Economiza egress: mídia que ninguém rola pra ver nunca é baixada. Quando carrega,
// chama onLoaded(base64) e o componente-pai re-renderiza com a mídia de verdade.
export default function LazyMedia({ id, kind, onLoaded }) {
  const ref = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | error

  async function fetchBase64() {
    if (status === 'loading') return
    setStatus('loading')
    const { data, error } = await supabase.from(CONV_TABLE).select('base64').eq('id', id).single()
    if (error || !data?.base64) { setStatus('error'); return }
    onLoaded(data.base64)
  }

  useEffect(() => {
    const el = ref.current
    if (!el || !id) return
    // Sem IntersectionObserver (browser antigo): baixa logo, pra não quebrar.
    if (typeof IntersectionObserver === 'undefined') { fetchBase64(); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); fetchBase64() }
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const label = kind === 'audio' ? '🎤 Áudio'
    : kind === 'video' ? '🎬 Vídeo'
    : kind === 'pdf' ? '📄 Documento'
    : '🖼️ Imagem'
  const tall = kind === 'image' || kind === 'video'

  return (
    <div
      ref={ref}
      onClick={() => { if (status === 'error') fetchBase64() }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        minWidth: 150, minHeight: tall ? 120 : 38, padding: '10px 12px',
        borderRadius: 8, background: 'rgba(120,120,120,0.12)', color: 'inherit',
        fontSize: 13, opacity: 0.85, cursor: status === 'error' ? 'pointer' : 'default',
      }}
      title={status === 'error' ? 'Tocar para carregar' : undefined}
    >
      {status === 'error' ? `${label} · tocar pra carregar` : `${label}…`}
    </div>
  )
}

// Detecta o tipo de mídia pelo rótulo emoji do começo da mensagem (fallback p/
// linhas antigas sem tem_midia). Retorna null quando não anuncia mídia.
export function announcesMediaKind(text) {
  const t = (text || '')
  if (/^🎤/.test(t)) return 'audio'
  if (/^🖼️/.test(t)) return 'image'
  if (/^🎬/.test(t)) return 'video'
  if (/^📄/.test(t)) return 'pdf'
  if (/^📎/.test(t)) return 'file'
  return null
}
