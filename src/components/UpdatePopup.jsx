import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { UPDATES } from '../data/updates'
import './UpdatePopup.css'

// Pop-up de "Nova atualização" — aparece UMA vez por usuário (por atualização
// marcada com popup:true). O "Entendi!" grava no localStorage e não mostra mais.
// O × (ou clicar fora) só fecha por agora — volta no próximo acesso até acknowledgear.
const seenKey = (date, user) => `nx_update_popup_${date}_${user || 'anon'}`

export default function UpdatePopup({ userKey }) {
  const navigate = useNavigate()
  const location = useLocation()
  const feat = UPDATES.find(u => u.popup)   // a atualização em destaque
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!feat || !userKey) return
    // Não atropela o onboarding: no tutorial o popup não aparece (todo usuário
    // ativo já saiu do tutorial, então isso não impede os existentes de verem).
    if (location.pathname.startsWith('/painel/tutorial')) return
    let seen = false
    try { seen = localStorage.getItem(seenKey(feat.date, userKey)) === '1' } catch {}
    if (seen) return
    const t = setTimeout(() => setOpen(true), 650) // deixa a tela assentar antes
    return () => clearTimeout(t)
  }, [feat, userKey, location.pathname])

  if (!open || !feat) return null

  function close(persist) {
    if (persist) { try { localStorage.setItem(seenKey(feat.date, userKey), '1') } catch {} }
    setClosing(true)
    setTimeout(() => { setOpen(false); setClosing(false) }, 200)
  }

  const highlights = feat.highlights?.length
    ? feat.highlights
    : (feat.items || []).map(t => ({ text: t }))

  return (
    <div className={`nxup-overlay ${closing ? 'closing' : ''}`}
      onMouseDown={e => { if (e.target === e.currentTarget) close(false) }}>
      <div className="nxup-card" role="dialog" aria-modal="true" aria-label="Nova atualização">
        <button className="nxup-x" onClick={() => close(false)} aria-label="Fechar">×</button>

        <div className="nxup-hero">
          <span className="nxup-eyebrow">✦ Nova atualização</span>
          <h2 className="nxup-title">{feat.title}</h2>
          {feat.tags?.length > 0 && (
            <div className="nxup-tags">{feat.tags.map(t => <span key={t}>{t}</span>)}</div>
          )}
          <div className="nxup-spark" aria-hidden="true">🎉</div>
        </div>

        <div className="nxup-body">
          {feat.intro && <p className="nxup-intro">{feat.intro}</p>}
          <ul className="nxup-list">
            {highlights.map((h, i) => (
              <li key={i} style={{ animationDelay: `${0.09 * i + 0.12}s` }}>
                <span className="nxup-ic">{h.icon || '✨'}</span>
                <span>
                  {h.title && <strong>{h.title}</strong>}
                  <span className="nxup-htext">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="nxup-actions">
            <button className="nxup-link" onClick={() => { close(true); navigate('/painel/novidades') }}>
              Ver todas as novidades
            </button>
            <button className="nxup-btn" onClick={() => close(true)}>Entendi!</button>
          </div>
        </div>
      </div>
    </div>
  )
}
