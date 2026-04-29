import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Sparkles, MessageSquare, Calendar, BarChart3,
  Users, Bot, Stethoscope, Headset, Check, ChevronRight, ChevronLeft, Star, Zap, ShieldCheck,
  Phone, Mail, Activity, Clock, TrendingUp, Lock, FileText, Trash2, Server, Quote,
  Building2, Network, Wallet, Bot as BotIcon,
} from 'lucide-react'
import './Landing.css'

const TESTIMONIALS = [
  {
    quote: 'Antes a gente perdia 3 ou 4 pacientes por dia só porque a secretária não dava conta do WhatsApp. Hoje a IA filtra, agenda e me chama só quando é caso especial. Mudou o jogo.',
    highlight: '3 ou 4 pacientes por dia',
    strong: 'Mudou o jogo.',
    authorName: 'Dra. Camila Vieira',
    authorRole: 'Clínica de Olhos · Brasília',
    initials: 'CV',
  },
]

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="lp">
      {/* NAV */}
      <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand">
            <div className="lp-brand-mark">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 2 L26 14 L14 26 L2 14 Z" fill="url(#g1)" />
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="28" y2="28">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="lp-brand-text">MedicinaMKT</span>
          </Link>

          <div className="lp-nav-links">
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
            <a href="#contato">Contato</a>
          </div>

          <div className="lp-nav-cta">
            <Link to="/login" className="lp-btn-ghost-sm">Acessar conta</Link>
            <a href="#planos" className="lp-btn-primary-sm">Começar agora <ArrowRight size={14} /></a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="lp-hero">
        <div className="lp-hero-bg">
          <div className="lp-grain" />
          <div className="lp-hero-glow lp-glow-1" />
          <div className="lp-hero-glow lp-glow-2" />
        </div>

        <div className="lp-container">
          <div className="lp-hero-grid">
            <div className="lp-hero-left">
              <div className="lp-eyebrow">
                <span className="lp-pulse-dot" />
                Para clínicas, consultórios e operadoras de saúde
              </div>

              <h1 className="lp-h1">
                A central de <span className="lp-h1-em">atendimento</span>,
                <br />
                <span className="lp-h1-accent">agenda e gestão</span>
                <br />
                que sua clínica precisa.
              </h1>

              <p className="lp-hero-sub">
                Centralize WhatsApp, Instagram e Digisac numa caixa única.
                <strong> Atenda com IA, agende com inteligência e meça cada real</strong> que entra
                — tudo em um só lugar.
              </p>

              <div className="lp-hero-actions">
                <a href="#planos" className="lp-btn-primary">
                  Experimentar grátis
                  <ArrowRight size={16} />
                </a>
                <a href="#como-funciona" className="lp-btn-ghost">
                  Como funciona
                  <ArrowRight size={16} />
                </a>
              </div>

              <p className="lp-microcopy">
                Sem cartão de crédito · Setup guiado em 24h · Cancele quando quiser
              </p>

              <div className="lp-hero-trust">
                <div className="lp-trust-item">
                  <ShieldCheck size={14} />
                  <span>LGPD Compliance</span>
                </div>
                <div className="lp-trust-divider" />
                <div className="lp-trust-item">
                  <Activity size={14} />
                  <span>99.9% uptime</span>
                </div>
                <div className="lp-trust-divider" />
                <div className="lp-trust-item">
                  <Clock size={14} />
                  <span>Setup em 24h</span>
                </div>
              </div>
            </div>

            <div className="lp-hero-right">
              <DashboardMock />
            </div>
          </div>
        </div>

      </header>

      {/* STATS */}
      <section className="lp-stats">
        <div className="lp-container">
          <div className="lp-stats-grid">
            <Stat number="3.2x" label="Mais agendamentos confirmados" />
            <Stat number="68%" label="Redução no tempo de atendimento" />
            <Stat number="24/7" label="IA atendendo seus pacientes" />
            <Stat number="<2%" label="Taxa de mensagens não respondidas" />
          </div>
          <p className="lp-stats-note">
            Média dos clientes MedicinaMKT nos últimos 6 meses · Atualizado mensalmente
          </p>
        </div>
      </section>

      {/* QUALQUER OPERAÇÃO */}
      <section className="lp-versatility">
        <div className="lp-container">
          <SectionHeader
            kicker="Para qualquer operação de saúde"
            title={<>Funciona do consultório solo<br /><em>à rede com várias unidades</em></>}
          />
          <div className="lp-versatility-grid">
            <VersatilityCard
              tone="amber"
              icon={<Users size={20} />}
              title="1 a 50+ profissionais"
              description="Do consultório solo à clínica com várias salas atendendo em paralelo. A plataforma escala com você sem trocar de sistema."
            />
            <VersatilityCard
              tone="green"
              icon={<Network size={20} />}
              title="Várias unidades, uma operação"
              description="Filiais sincronizadas em tempo real. Recepção de qualquer unidade vê a conversa, agenda no profissional certo e o paciente nem percebe."
            />
            <VersatilityCard
              tone="blue"
              icon={<Wallet size={20} />}
              title="Convênio e particular no mesmo fluxo"
              description="Cadastre valores por convênio, por procedimento e por médico. O agendamento puxa o preço certo automaticamente — sem planilha paralela."
            />
            <VersatilityCard
              tone="pink"
              icon={<BotIcon size={20} />}
              title="Atendimento humano + IA sob demanda"
              description="Comece com a equipe atendendo no inbox unificado. Ative a IA quando quiser — em horários específicos, fins de semana, ou pra qualificar antes de passar pra recepção."
            />
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section className="lp-features" id="recursos">
        <div className="lp-container">
          <SectionHeader
            kicker="O que faz por você"
            title={<>Tudo que sua clínica<br /><em>precisa em um só lugar</em></>}
          />

          <div className="lp-features-grid">
            <FeatureCard
              variant="primary"
              icon={<Bot size={22} />}
              title="IA que conversa, qualifica e agenda"
              description="Atendente virtual 24/7 que entende seu paciente, responde dúvidas, qualifica o lead e agenda automaticamente — sem você levantar um dedo."
              tags={['WhatsApp', 'Instagram', 'Digisac']}
            />
            <FeatureCard
              icon={<MessageSquare size={22} />}
              title="Atendimento humano organizado"
              description="Recepção, setores e finalizados em abas. Cada atendente vê só o seu setor. Áudios, imagens e PDFs renderizados direto no chat."
            />
            <FeatureCard
              icon={<Calendar size={22} />}
              title="Agenda médica completa"
              description="Cadastre profissionais, dias de atendimento, intervalos e procedimentos. Validação automática de conflitos e horários."
            />
            <FeatureCard
              icon={<Stethoscope size={22} />}
              title="Catálogo clínico"
              description="Médicos, procedimentos, exames, valores particulares e por convênio. Tudo cadastrado e refletido no agendamento."
            />
            <FeatureCard
              icon={<BarChart3 size={22} />}
              title="Métricas que importam"
              description="Faturamento por médico, taxa de no-show, ticket médio, tempo de resposta. Dashboard com 6 abas de análise."
            />
            <FeatureCard
              icon={<Users size={22} />}
              title="Gestão de equipe e setores"
              description="Convide atendentes, atribua a setores, defina permissões. Cada conversa fica com quem deve atender."
            />
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="lp-how" id="como-funciona">
        <div className="lp-container">
          <SectionHeader
            kicker="Em 3 passos"
            title={<>Da bagunça do WhatsApp<br /><em>ao controle total</em></>}
            light
          />

          <div className="lp-steps">
            <StepCard
              number="01"
              title="Conecte seu WhatsApp"
              description="Escaneou o QR Code, está dentro. Sua instância fica online em segundos e começa a receber as mensagens automaticamente."
            />
            <StepCard
              number="02"
              title="Configure profissionais e procedimentos"
              description="Cadastre médicos com horários, intervalos e dias de atendimento. Adicione procedimentos com valor particular e por convênio."
            />
            <StepCard
              number="03"
              title="Deixe a IA trabalhar"
              description="A IA atende, qualifica, agenda e te avisa quando precisa de atenção humana. Você foca no que importa: cuidar dos pacientes."
            />
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <TestimonialsSection items={TESTIMONIALS} />

      {/* SEGURANÇA & LGPD */}
      <section className="lp-security" id="seguranca">
        <div className="lp-container">
          <SectionHeader
            kicker="Segurança em primeiro lugar"
            title={<>Conformidade que <em>clínica de verdade</em><br />exige</>}
          />
          <div className="lp-security-grid">
            <SecurityItem
              icon={<Server size={18} />}
              title="Dados em servidor brasileiro"
              description="Infraestrutura hospedada no Brasil, em conformidade com LGPD."
              flag="🇧🇷"
            />
            <SecurityItem
              icon={<Lock size={18} />}
              title="Criptografia ponta a ponta"
              description="Mensagens e dados de pacientes criptografados em trânsito e em repouso."
            />
            <SecurityItem
              icon={<FileText size={18} />}
              title="Cláusula de tratamento de dados"
              description="DPO designado e termo de tratamento de dados de pacientes incluído no contrato."
            />
            <SecurityItem
              icon={<Trash2 size={18} />}
              title="Política de retenção e exclusão"
              description="Você controla por quanto tempo os dados ficam armazenados e pode solicitar exclusão a qualquer momento."
            />
          </div>
          <div className="lp-security-cta">
            <a href="/seguranca" className="lp-security-link">
              Ver política de privacidade completa
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section className="lp-pricing" id="planos">
        <div className="lp-container">
          <p className="lp-pricing-anchor">
            Uma secretária CLT custa <strong>R$ 3.500+/mês</strong>.<br />
            A MedicinaMKT atende 24/7 a partir de <strong>R$ 297</strong>.
          </p>
          <SectionHeader
            kicker="Escolha seu plano"
            title={<>Comece pequeno,<br /><em>cresça quando quiser</em></>}
          />

          <div className="lp-pricing-grid">
            <PricingCard
              name="Starter"
              price="297"
              tagline="Para consultórios em começo de jornada"
              features={[
                'Até 3 usuários',
                'IA de atendimento 24/7',
                '1 agenda profissional',
                'Catálogo de procedimentos',
                'Métricas básicas',
                'Suporte por e-mail',
              ]}
              cta="Começar Starter"
            />
            <PricingCard
              featured
              name="Pro"
              price="597"
              tagline="Para clínicas com 2-5 profissionais"
              features={[
                'Até 10 usuários',
                'IA de atendimento 24/7',
                'Agendas ilimitadas',
                'Convênios + financeiro completo',
                'Quadro Kanban de tarefas',
                'Métricas avançadas',
                'Suporte prioritário',
              ]}
              cta="Começar Pro"
              badge="Mais escolhido"
            />
            <PricingCard
              name="Business"
              price="Sob medida"
              tagline="Para grupos clínicos e operadoras"
              features={[
                'Usuários ilimitados',
                'Múltiplas instâncias WhatsApp',
                'Integrações personalizadas',
                'Onboarding dedicado',
                'SLA de resposta',
                'Gerente de conta exclusivo',
                'Treinamento da equipe',
              ]}
              cta="Falar com vendas"
              custom
            />
          </div>

          <p className="lp-pricing-note">
            Valores em BRL. Não cobramos por mensagem enviada. Você pode cancelar quando quiser.
          </p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="lp-cta" id="contato">
        <div className="lp-container">
          <div className="lp-cta-card">
            <div className="lp-cta-text">
              <h2 className="lp-h2">
                Sua clínica merece <em>uma operação digital</em> de alta performance.
              </h2>
              <p>
                Pare de perder paciente no WhatsApp. Pare de depender de planilha.
                Comece agora — sem cartão de crédito.
              </p>
            </div>
            <div className="lp-cta-actions">
              <a href="#planos" className="lp-btn-primary lp-btn-large">
                Experimentar grátis
                <ArrowRight size={18} />
              </a>
              <a href="https://wa.me/5561999999999" target="_blank" rel="noreferrer" className="lp-btn-ghost lp-btn-large">
                <Phone size={16} />
                Falar com humano
              </a>
              <p className="lp-microcopy lp-cta-microcopy">
                Sem cartão de crédito · Setup guiado em 24h · Cancele quando quiser
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <Link to="/" className="lp-brand">
                <div className="lp-brand-mark">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M14 2 L26 14 L14 26 L2 14 Z" fill="url(#g2)" />
                    <defs>
                      <linearGradient id="g2" x1="0" y1="0" x2="28" y2="28">
                        <stop offset="0%" stopColor="#10B981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <span className="lp-brand-text">MedicinaMKT</span>
              </Link>
              <p>
                A central de atendimento, agenda e gestão para clínicas que valorizam tempo, dinheiro e o paciente.
              </p>
            </div>
            <div className="lp-footer-col">
              <h4>Produto</h4>
              <a href="#recursos">Recursos</a>
              <a href="#como-funciona">Como funciona</a>
              <a href="#planos">Planos</a>
              <Link to="/login">Acessar conta</Link>
            </div>
            <div className="lp-footer-col">
              <h4>Empresa</h4>
              <a href="#contato">Contato</a>
              <a href="#">Termos de uso</a>
              <a href="#">Privacidade</a>
              <a href="#">LGPD</a>
            </div>
            <div className="lp-footer-col">
              <h4>Falar com a gente</h4>
              <a href="https://wa.me/5561999999999"><Phone size={12} /> WhatsApp</a>
              <a href="mailto:contato@medicinamkt.com"><Mail size={12} /> contato@medicinamkt.com</a>
            </div>
          </div>
          <div className="lp-footer-bottom">
            <span>© 2026 MedicinaMKT · Todos os direitos reservados</span>
            <span className="lp-footer-made">Feito com <span className="lp-heart">♥</span> para a saúde</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ─── Subcomponentes ──────────────────────────────────────────────────────── */
function SectionHeader({ kicker, title, light }) {
  return (
    <div className={`lp-section-header ${light ? 'light' : ''}`}>
      <div className="lp-kicker">
        <span className="lp-kicker-line" />
        {kicker}
      </div>
      <h2 className="lp-h2">{title}</h2>
    </div>
  )
}

function Stat({ number, label }) {
  return (
    <div className="lp-stat">
      <div className="lp-stat-number">{number}</div>
      <div className="lp-stat-label">{label}</div>
    </div>
  )
}

function FeatureCard({ icon, title, description, variant, tags }) {
  return (
    <div className={`lp-feature ${variant === 'primary' ? 'primary' : ''}`}>
      <div className="lp-feature-icon">{icon}</div>
      <h3 className="lp-feature-title">{title}</h3>
      <p className="lp-feature-desc">{description}</p>
      {tags && (
        <div className="lp-feature-tags">
          {tags.map(t => <span key={t}>{t}</span>)}
        </div>
      )}
      <div className="lp-feature-arrow"><ArrowUpRight size={18} /></div>
    </div>
  )
}

function StepCard({ number, title, description }) {
  return (
    <div className="lp-step">
      <div className="lp-step-number">{number}</div>
      <h3 className="lp-step-title">{title}</h3>
      <p className="lp-step-desc">{description}</p>
    </div>
  )
}

function VersatilityCard({ tone, icon, title, description }) {
  return (
    <div className={`lp-versatility-card lp-tone-${tone}`}>
      <div className="lp-versatility-icon">{icon}</div>
      <h3 className="lp-versatility-title">{title}</h3>
      <p className="lp-versatility-desc">{description}</p>
    </div>
  )
}

function SecurityItem({ icon, title, description, flag }) {
  return (
    <div className="lp-security-item">
      <div className="lp-security-icon">
        {flag ? <span className="lp-security-flag">{flag}</span> : icon}
      </div>
      <div>
        <h4 className="lp-security-title">{title}</h4>
        <p className="lp-security-desc">{description}</p>
      </div>
    </div>
  )
}

function TestimonialsSection({ items }) {
  const [idx, setIdx] = useState(0)
  const total = items.length
  useEffect(() => {
    if (total <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % total), 8000)
    return () => clearInterval(t)
  }, [total])
  const t = items[idx]
  return (
    <section className="lp-testimonial">
      <div className="lp-container">
        <div className="lp-testimonial-card" key={idx}>
          <div className="lp-quote-mark">&ldquo;</div>
          <p className="lp-quote">
            {renderQuote(t)}
          </p>
          <div className="lp-quote-author">
            <div className="lp-avatar">{t.initials}</div>
            <div>
              <div className="lp-author-name">{t.authorName}</div>
              <div className="lp-author-role">{t.authorRole}</div>
            </div>
          </div>
          {total > 1 && (
            <div className="lp-testimonial-nav">
              <button
                className="lp-testimonial-arrow"
                onClick={() => setIdx(i => (i - 1 + total) % total)}
                aria-label="Depoimento anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="lp-testimonial-dots">
                {items.map((_, i) => (
                  <button
                    key={i}
                    className={`lp-testimonial-dot ${i === idx ? 'active' : ''}`}
                    onClick={() => setIdx(i)}
                    aria-label={`Depoimento ${i + 1}`}
                  />
                ))}
              </div>
              <button
                className="lp-testimonial-arrow"
                onClick={() => setIdx(i => (i + 1) % total)}
                aria-label="Próximo depoimento"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function renderQuote(t) {
  // Quebra a quote pra aplicar <em> no highlight e <strong> no fechamento
  let txt = t.quote
  const parts = []
  if (t.highlight && txt.includes(t.highlight)) {
    const [before, after] = txt.split(t.highlight)
    parts.push(before, <em key="hl">{t.highlight}</em>)
    txt = after
  }
  if (t.strong && txt.includes(t.strong)) {
    const [before, after] = txt.split(t.strong)
    parts.push(before, <strong key="st">{t.strong}</strong>, after)
  } else {
    parts.push(txt)
  }
  return parts
}

function PricingCard({ name, price, tagline, features, cta, featured, badge, custom }) {
  return (
    <div className={`lp-plan ${featured ? 'featured' : ''}`}>
      {badge && <div className="lp-plan-badge">{badge}</div>}
      <div className="lp-plan-name">{name}</div>
      <div className="lp-plan-price">
        {custom ? (
          <span className="lp-plan-custom">{price}</span>
        ) : (
          <>
            <span className="lp-plan-currency">R$</span>
            <span className="lp-plan-value">{price}</span>
            <span className="lp-plan-period">/mês</span>
          </>
        )}
      </div>
      <p className="lp-plan-tagline">{tagline}</p>
      <ul className="lp-plan-features">
        {features.map(f => (
          <li key={f}><Check size={14} /> {f}</li>
        ))}
      </ul>
      <Link to="/login" className={`lp-plan-cta ${featured ? 'featured' : ''}`}>
        {cta} <ArrowRight size={14} />
      </Link>
      {!custom && (
        <p className="lp-plan-microcopy">Sem cartão · Setup em 24h</p>
      )}
    </div>
  )
}

function DashboardMock() {
  const [view, setView] = useState('conversas')

  const VIEWS = [
    { key: 'conversas',  icon: MessageSquare, label: 'Conversas' },
    { key: 'agenda',     icon: Calendar,      label: 'Agenda' },
    { key: 'metricas',   icon: BarChart3,     label: 'Métricas' },
    { key: 'catalogo',   icon: Stethoscope,   label: 'Catálogo' },
    { key: 'equipe',     icon: Users,         label: 'Equipe' },
  ]

  const FLOATING = {
    conversas: { left: { icon: Zap, label: 'Tempo médio:', value: '2min 14s' }, right: { icon: TrendingUp, label: 'Conversão:', value: '+47%', green: true } },
    agenda:    { left: { icon: Calendar, label: 'Hoje:', value: '14 consultas' }, right: { icon: TrendingUp, label: 'Ocupação:', value: '92%', green: true } },
    metricas:  { left: { icon: TrendingUp, label: 'Faturado:', value: 'R$ 38,4k' }, right: { icon: Sparkles, label: 'Ticket médio:', value: 'R$ 280', green: true } },
    catalogo:  { left: { icon: Stethoscope, label: 'Profissionais:', value: '8 ativos' }, right: { icon: Activity, label: 'Procedimentos:', value: '47', green: true } },
    equipe:    { left: { icon: Headset, label: 'Online agora:', value: '5 atendentes' }, right: { icon: Sparkles, label: 'Resp. média:', value: '1min 22s', green: true } },
  }

  const float = FLOATING[view]

  return (
    <div className="lp-mock">
      <div className="lp-mock-glow" />
      <div className="lp-mock-window">
        <div className="lp-mock-bar">
          <div className="lp-mock-dots">
            <span /><span /><span />
          </div>
          <div className="lp-mock-url">app.medicinamkt.com / {view}</div>
        </div>
        <div className="lp-mock-body">
          <div className="lp-mock-side">
            <div className="lp-mock-logo">M</div>
            {VIEWS.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                title={v.label}
                className={`lp-mock-nav-item ${view === v.key ? 'active' : ''}`}
              >
                <v.icon size={11} />
              </button>
            ))}
          </div>

          <div className="lp-mock-scene" key={view}>
            {view === 'conversas'  && <SceneConversas />}
            {view === 'agenda'     && <SceneAgenda />}
            {view === 'metricas'   && <SceneMetricas />}
            {view === 'catalogo'   && <SceneCatalogo />}
            {view === 'equipe'     && <SceneEquipe />}
          </div>
        </div>
      </div>

      <div className="lp-mock-floating" key={`fl-${view}`}>
        <div className="lp-mock-stat">
          <float.left.icon size={14} /> {float.left.label} <strong>{float.left.value}</strong>
        </div>
      </div>
      <div className="lp-mock-floating-2" key={`fr-${view}`}>
        <div className={`lp-mock-stat ${float.right.green ? 'green' : ''}`}>
          <float.right.icon size={14} /> {float.right.label} <strong>{float.right.value}</strong>
        </div>
      </div>
    </div>
  )
}

function SceneConversas() {
  return (
    <>
      <div className="lp-mock-list">
        <div className="lp-mock-list-header">Conversas <span>14</span></div>
        <div className="lp-mock-msg">
          <div className="lp-mock-avatar" style={{ background: '#FEF3C7' }}>M</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Maria Silva</div>
            <div className="lp-mock-msg-text">Quero marcar uma consulta...</div>
          </div>
          <div className="lp-mock-tag">📅</div>
        </div>
        <div className="lp-mock-msg active">
          <div className="lp-mock-avatar" style={{ background: '#DBEAFE' }}>R</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Roberto Alves</div>
            <div className="lp-mock-msg-text">Tem horário sexta?</div>
          </div>
          <div className="lp-mock-tag green">✓</div>
        </div>
        <div className="lp-mock-msg">
          <div className="lp-mock-avatar" style={{ background: '#FCE7F3' }}>P</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Patrícia Souza</div>
            <div className="lp-mock-msg-text">Obrigada! Até amanhã.</div>
          </div>
        </div>
        <div className="lp-mock-msg">
          <div className="lp-mock-avatar" style={{ background: '#D1FAE5' }}>F</div>
          <div className="lp-mock-msg-content">
            <div className="lp-mock-msg-name">Fernando R.</div>
            <div className="lp-mock-msg-text">Confirmado às 14h</div>
          </div>
        </div>
      </div>
      <div className="lp-mock-chat">
        <div className="lp-mock-chat-header">
          <div>
            <div className="lp-mock-chat-name">Roberto Alves</div>
            <div className="lp-mock-chat-meta">Recepção · sob atendimento da IA</div>
          </div>
        </div>
        <div className="lp-mock-bubble client">Tem horário sexta de manhã?</div>
        <div className="lp-mock-bubble ai">
          <div className="lp-mock-bubble-tag"><Sparkles size={9} /> IA</div>
          Tenho terça e quinta às 9h ou 10h. Qual prefere?
        </div>
        <div className="lp-mock-bubble client small">Quinta às 10h</div>
        <div className="lp-mock-bubble ai">
          <div className="lp-mock-bubble-tag"><Sparkles size={9} /> IA</div>
          ✅ Agendado! Quinta 28/04 às 10h com Dra. Camila
        </div>
      </div>
    </>
  )
}

function SceneAgenda() {
  const days = ['Seg 27', 'Ter 28', 'Qua 29', 'Qui 30', 'Sex 01']
  const slots = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
  const appts = {
    '09:00-1': { name: 'Maria S.', color: '#FCD34D' },
    '10:00-2': { name: 'Roberto A.', color: '#4ADE80' },
    '11:00-0': { name: 'Patrícia', color: '#A78BFA' },
    '14:00-3': { name: 'Fernando', color: '#F472B6' },
    '15:00-1': { name: 'Camila N.', color: '#22D3EE' },
    '16:00-4': { name: 'Lucas M.', color: '#FB923C' },
    '08:00-2': { name: 'Júlia P.', color: '#4ADE80' },
  }
  return (
    <div className="lp-scene-agenda">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Agenda da semana</div>
          <div className="lp-scene-sub">Dra. Camila · Cardiologia</div>
        </div>
        <div className="lp-scene-pill">Hoje</div>
      </div>
      <div className="lp-cal">
        <div className="lp-cal-row lp-cal-head">
          <div />
          {days.map(d => <div key={d} className={d === 'Ter 28' ? 'today' : ''}>{d}</div>)}
        </div>
        {slots.map(s => (
          <div key={s} className="lp-cal-row">
            <div className="lp-cal-time">{s}</div>
            {[0, 1, 2, 3, 4].map(i => {
              const a = appts[`${s}-${i}`]
              return (
                <div key={i} className="lp-cal-slot">
                  {a && (
                    <div className="lp-cal-appt" style={{ background: a.color }}>
                      {a.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneMetricas() {
  const bars = [
    { label: 'Seg', value: 60, color: '#FCD34D' },
    { label: 'Ter', value: 85, color: '#4ADE80' },
    { label: 'Qua', value: 45, color: '#22D3EE' },
    { label: 'Qui', value: 95, color: '#A78BFA' },
    { label: 'Sex', value: 75, color: '#F472B6' },
    { label: 'Sáb', value: 35, color: '#FB923C' },
  ]
  return (
    <div className="lp-scene-metricas">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Faturamento</div>
          <div className="lp-scene-sub">Esta semana</div>
        </div>
        <div className="lp-scene-pill green">+24%</div>
      </div>
      <div className="lp-kpi-row">
        <div className="lp-kpi-card" style={{ background: '#FEF3C7' }}>
          <div className="lp-kpi-label">Faturado</div>
          <div className="lp-kpi-value">R$ 38.4k</div>
        </div>
        <div className="lp-kpi-card" style={{ background: '#DCFCE7' }}>
          <div className="lp-kpi-label">Concluídos</div>
          <div className="lp-kpi-value">137</div>
        </div>
        <div className="lp-kpi-card" style={{ background: '#FCE7F3' }}>
          <div className="lp-kpi-label">No-show</div>
          <div className="lp-kpi-value">4%</div>
        </div>
      </div>
      <div className="lp-bars">
        {bars.map((b, i) => (
          <div key={b.label} className="lp-bar-col">
            <div className="lp-bar-track">
              <div
                className="lp-bar-fill"
                style={{ height: `${b.value}%`, background: b.color, animationDelay: `${i * 0.06}s` }}
              />
            </div>
            <div className="lp-bar-label">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneCatalogo() {
  const procs = [
    { name: 'Consulta cardiológica', price: 'R$ 350', type: 'Consulta', color: '#A78BFA' },
    { name: 'Eletrocardiograma',     price: 'R$ 180', type: 'Exame',    color: '#4ADE80' },
    { name: 'Ecocardiograma',        price: 'R$ 420', type: 'Exame',    color: '#4ADE80' },
    { name: 'Holter 24h',            price: 'R$ 580', type: 'Procedimento', color: '#FB923C' },
    { name: 'Teste ergométrico',     price: 'R$ 320', type: 'Procedimento', color: '#FB923C' },
  ]
  return (
    <div className="lp-scene-catalogo">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Procedimentos</div>
          <div className="lp-scene-sub">Catálogo da clínica</div>
        </div>
        <div className="lp-scene-pill">Cardiologia</div>
      </div>
      <div className="lp-proc-list">
        {procs.map(p => (
          <div key={p.name} className="lp-proc-row">
            <div className="lp-proc-icon" style={{ background: `${p.color}33`, color: p.color }}>
              <Stethoscope size={11} />
            </div>
            <div className="lp-proc-content">
              <div className="lp-proc-name">{p.name}</div>
              <div className="lp-proc-meta">
                <span style={{ color: p.color, background: `${p.color}22`, padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: 8, textTransform: 'uppercase' }}>{p.type}</span>
              </div>
            </div>
            <div className="lp-proc-price">{p.price}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SceneEquipe() {
  const team = [
    { name: 'Dra. Camila', role: 'Cardiologia',  status: 'online',  load: 4, color: '#A78BFA' },
    { name: 'Dr. Lucas',   role: 'Pediatria',    status: 'online',  load: 6, color: '#4ADE80' },
    { name: 'Dra. Bia',    role: 'Dermatologia', status: 'busy',    load: 8, color: '#F472B6' },
    { name: 'Dr. Hugo',    role: 'Ortopedia',    status: 'online',  load: 3, color: '#FB923C' },
    { name: 'Dra. Lara',   role: 'Endocrino',    status: 'offline', load: 0, color: '#94A3B8' },
  ]
  return (
    <div className="lp-scene-equipe">
      <div className="lp-scene-header">
        <div>
          <div className="lp-scene-title">Equipe</div>
          <div className="lp-scene-sub">5 profissionais</div>
        </div>
        <div className="lp-scene-pill green">4 online</div>
      </div>
      <div className="lp-team-list">
        {team.map(t => (
          <div key={t.name} className="lp-team-row">
            <div className="lp-team-avatar" style={{ background: t.color }}>{t.name.split(' ')[1]?.[0] || t.name[0]}</div>
            <div className="lp-team-content">
              <div className="lp-team-name">{t.name}</div>
              <div className="lp-team-role">{t.role}</div>
            </div>
            <div className={`lp-team-status ${t.status}`}>
              {t.status === 'online' ? 'Online' : t.status === 'busy' ? 'Ocupado' : 'Offline'}
            </div>
            <div className="lp-team-load">{t.load} {t.load === 1 ? 'ticket' : 'tickets'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
