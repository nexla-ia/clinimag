import { useState } from 'react'
import {
  Instagram, Heart, MessageCircle, Send, Bookmark, MoreHorizontal,
  Sparkles, Check, Bell, Mail, ArrowRight, Zap, Clock, Users,
} from 'lucide-react'
import './CompanyInstagram.css'

export default function CompanyInstagram() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSignup(e) {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) return
    // Aqui pode integrar com waitlist real depois
    setSubmitted(true)
  }

  return (
    <div className="ig-root">
      {/* Backdrop animado */}
      <div className="ig-backdrop">
        <div className="ig-orb ig-orb-1" />
        <div className="ig-orb ig-orb-2" />
        <div className="ig-orb ig-orb-3" />
        <div className="ig-grain" />
      </div>

      <div className="ig-container">
        {/* Selo "Em breve" */}
        <div className="ig-badge">
          <span className="ig-badge-dot" />
          Em desenvolvimento
        </div>

        {/* Headline gigante */}
        <h1 className="ig-h1">
          <span className="ig-h1-line">Sua clínica também</span>
          <span className="ig-h1-line">
            no <span className="ig-h1-grad">Instagram</span>.
          </span>
          <span className="ig-h1-soon">Em breve.</span>
        </h1>

        <p className="ig-sub">
          Estamos preparando a integração com <strong>Instagram Direct</strong> para você
          atender mensagens, comentários e stories sem sair da plataforma. Mesma IA,
          mesma agenda, mesma equipe — só que multicanal de verdade.
        </p>

        {/* Preview do que vem por aí */}
        <div className="ig-preview">
          <div className="ig-preview-glow" />
          <div className="ig-mock">
            <div className="ig-mock-bar">
              <Instagram size={14} className="ig-mock-logo" />
              <div className="ig-mock-handle">@clinicasaude</div>
              <MoreHorizontal size={14} className="ig-mock-more" />
            </div>

            {/* Lista de DMs */}
            <div className="ig-mock-body">
              <div className="ig-mock-list">
                <div className="ig-mock-list-title">Direct</div>
                <DM avatar="A" color="linear-gradient(135deg, #F472B6, #EC4899)" name="ana_silva" preview="Vocês fazem botox?" time="2min" unread />
                <DM avatar="J" color="linear-gradient(135deg, #FBBF24, #FB923C)" name="joao.fit" preview="Olá! Queria agendar..." time="14min" />
                <DM avatar="M" color="linear-gradient(135deg, #A78BFA, #6366F1)" name="mariazinha" preview="Obrigada! Foi ótimo." time="1h" />
                <DM avatar="P" color="linear-gradient(135deg, #34D399, #06B6D4)" name="pedrolopes" preview="Stories: tô interessado!" time="2h" comment />
              </div>

              <div className="ig-mock-chat">
                <div className="ig-mock-chat-header">
                  <div className="ig-mock-chat-avatar" style={{ background: 'linear-gradient(135deg, #F472B6, #EC4899)' }}>A</div>
                  <div>
                    <div className="ig-mock-chat-name">ana_silva</div>
                    <div className="ig-mock-chat-meta">online agora</div>
                  </div>
                </div>
                <div className="ig-mock-msgs">
                  <div className="ig-mock-bubble client">Vocês fazem botox?</div>
                  <div className="ig-mock-bubble client">E quanto fica?</div>
                  <div className="ig-mock-bubble ai">
                    <span className="ig-mock-tag"><Sparkles size={9} /> IA</span>
                    Sim! Aplicação de toxina botulínica, R$ 1.200 (3 áreas).
                    Quer agendar uma avaliação?
                  </div>
                  <div className="ig-mock-bubble client">Quero sim!</div>
                  <div className="ig-mock-bubble ai">
                    <span className="ig-mock-tag"><Sparkles size={9} /> IA</span>
                    ✅ Agendado! Quinta às 15h com Dra. Camila.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card flutuante de notificação */}
          <div className="ig-float ig-float-1">
            <div className="ig-float-icon"><Heart size={13} fill="#EC4899" stroke="#EC4899" /></div>
            <div>
              <div className="ig-float-label">Curtida no story</div>
              <div className="ig-float-text">+47 leads do post de hoje</div>
            </div>
          </div>
          <div className="ig-float ig-float-2">
            <div className="ig-float-icon"><MessageCircle size={13} stroke="#8B5CF6" /></div>
            <div>
              <div className="ig-float-label">Comentário respondido</div>
              <div className="ig-float-text">IA respondeu em 12s</div>
            </div>
          </div>
        </div>

        {/* Recursos que vêm */}
        <div className="ig-features">
          <Feature icon={MessageCircle} color="#EC4899" title="Direct unificado" desc="Mensagens do Insta na mesma caixa do WhatsApp." />
          <Feature icon={Heart} color="#FB923C" title="Comentários respondidos" desc="A IA responde comentários que viram leads." />
          <Feature icon={Send} color="#8B5CF6" title="Resposta em stories" desc="Quem reage ao seu story vira conversa direta." />
          <Feature icon={Bookmark} color="#06B6D4" title="Mesma agenda" desc="Pacientes agendam pelo Insta como pelo WhatsApp." />
        </div>

        {/* Waitlist */}
        <div className="ig-waitlist">
          {!submitted ? (
            <form onSubmit={handleSignup}>
              <div className="ig-waitlist-text">
                <Bell size={16} />
                <span>Me avise quando lançar</span>
              </div>
              <div className="ig-waitlist-form">
                <Mail size={15} className="ig-waitlist-icon" />
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <button type="submit">
                  Avise-me <ArrowRight size={14} />
                </button>
              </div>
            </form>
          ) : (
            <div className="ig-waitlist-done">
              <div className="ig-waitlist-check"><Check size={18} /></div>
              <div>
                <div className="ig-waitlist-done-title">Você está na lista!</div>
                <div className="ig-waitlist-done-sub">
                  Vamos te avisar em <strong>{email}</strong> assim que liberar.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Marquee */}
        <div className="ig-marquee">
          <div className="ig-marquee-track">
            {Array.from({ length: 2 }).map((_, i) => (
              <span key={i}>
                Direct · Stories · Comentários · Reels DM · Mensagens permanentes · Resposta automática · Funil unificado · Agenda compartilhada · Histórico cruzado · IA contextual ·{' '}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DM({ avatar, color, name, preview, time, unread, comment }) {
  return (
    <div className={`ig-dm ${unread ? 'unread' : ''}`}>
      <div className="ig-dm-avatar" style={{ background: color }}>{avatar}</div>
      <div className="ig-dm-content">
        <div className="ig-dm-name">{name}</div>
        <div className="ig-dm-preview">
          {comment && <span className="ig-dm-tag">comentário</span>}
          {preview}
        </div>
      </div>
      <div className="ig-dm-time">{time}</div>
      {unread && <div className="ig-dm-unread" />}
    </div>
  )
}

function Feature({ icon: Icon, color, title, desc }) {
  return (
    <div className="ig-feature">
      <div className="ig-feature-icon" style={{ background: `${color}1F`, color }}>
        <Icon size={18} />
      </div>
      <div className="ig-feature-content">
        <div className="ig-feature-title">{title}</div>
        <div className="ig-feature-desc">{desc}</div>
      </div>
    </div>
  )
}
