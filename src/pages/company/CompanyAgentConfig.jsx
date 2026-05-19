import { useState, useEffect, useRef } from 'react'
import {
  Bot, Building2, ListOrdered, Users, CreditCard, Settings, PenLine,
  ChevronRight, Plus, Trash2, Save, CheckCircle2, Sparkles, Info,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import './CompanyAgentConfig.css'

const SECTIONS = [
  { id: 'identidade',     label: 'Identidade',        sub: 'Nome, função e personalidade', emoji: '🤖', Icon: Bot,          color: '#4F46E5', bg: '#EEF2FF', softBg: '#E0E7FF', border: '#C7D2FE' },
  { id: 'clinica',        label: 'Clínica',            sub: 'Dados, endereço e contatos',   emoji: '🏥', Icon: Building2,    color: '#0891B2', bg: '#ECFEFF', softBg: '#CFFAFE', border: '#A5F3FC' },
  { id: 'menu',           label: 'Menu Inicial',       sub: 'Opções do primeiro contato',   emoji: '📋', Icon: ListOrdered,  color: '#D97706', bg: '#FFFBEB', softBg: '#FEF3C7', border: '#FDE68A' },
  { id: 'profissionais',  label: 'Profissionais',      sub: 'Equipe e especialidades',      emoji: '👩‍⚕️', Icon: Users,       color: '#16A34A', bg: '#F0FDF4', softBg: '#DCFCE7', border: '#BBF7D0' },
  { id: 'convenios',      label: 'Convênios',          sub: 'Planos e formas de pagamento', emoji: '💳', Icon: CreditCard,   color: '#7C3AED', bg: '#F5F3FF', softBg: '#EDE9FE', border: '#DDD6FE' },
  { id: 'regras',         label: 'Regras',             sub: 'O que o agente pode e não pode',emoji: '⚙️', Icon: Settings,    color: '#DC2626', bg: '#FEF2F2', softBg: '#FEE2E2', border: '#FECACA' },
  { id: 'escrita',        label: 'Forma de Escrever',  sub: 'Tom, estilo e restrições',     emoji: '✍️', Icon: PenLine,     color: '#DB2777', bg: '#FDF2F8', softBg: '#FCE7F3', border: '#FBCFE8' },
]

const DEFAULT_CONFIG = {
  identidade: {
    nome: '',
    funcao: '',
    especialidade: '',
    fingir_humano: true,
    resposta_se_ia: 'Sou a [nome]! Posso te ajudar com o que precisar 😊',
  },
  clinica: {
    nome: '',
    endereco_principal: '',
    endereco_secundario: '',
    telefone: '',
    instagram: '',
    site: '',
    google: '',
    horario: 'Segunda a sexta, 08h às 18h',
  },
  menu: {
    pular_se_duvida: true,
    opcoes: [
      { num: 1, label: 'Agendar consulta' },
      { num: 2, label: 'Cirurgias e procedimentos' },
      { num: 3, label: 'Exames' },
      { num: 4, label: 'Convênios e pagamento' },
      { num: 5, label: 'Falar com a equipe' },
      { num: 6, label: 'Dúvidas' },
    ],
  },
  profissionais: [],
  convenios: {
    aceitos: '',
    nao_aceitos: '',
    formas_pagamento: '',
    parcelamento: '',
  },
  regras: {
    confirmar_agendamento: false,
    informar_valor_procedimento: false,
    quando_encaminhar: ['paciente_irritado', 'fora_escopo', 'pediu_humano', 'agendamento'],
  },
  escrita: {
    max_linhas: 4,
    usar_emoji: true,
    tom: 'amigavel',
    expressoes_proibidas: 'Deixa eu ver aqui...\nClaro, com prazer!\nÓtima pergunta!\nEntendido!\nCertamente!\nFico feliz em ajudar\nProntamente!\nConforme combinado\nPrezado(a)',
  },
}

function mergeDeep(target, source) {
  const out = { ...target }
  for (const key of Object.keys(source || {})) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = mergeDeep(target[key] || {}, source[key])
    } else {
      out[key] = source[key]
    }
  }
  return out
}

function isFilled(id, cfg) {
  if (id === 'identidade')    return !!(cfg.identidade?.nome)
  if (id === 'clinica')       return !!(cfg.clinica?.nome)
  if (id === 'menu')          return (cfg.menu?.opcoes?.length || 0) > 0
  if (id === 'profissionais') return (cfg.profissionais?.length || 0) > 0
  if (id === 'convenios')     return !!(cfg.convenios?.aceitos)
  return true
}

export default function CompanyAgentConfig() {
  const { session } = useAuth()
  const companyId = session?.company?.id
  const instance  = session?.company?.instance
  const userName  = session?.user?.name?.split(' ')[0] || 'amig@'

  const [activeId,  setActiveId]  = useState('identidade')
  const [config,    setConfig]    = useState(DEFAULT_CONFIG)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [loading,   setLoading]   = useState(true)
  const contentRef = useRef(null)

  useEffect(() => {
    if (!instance) return
    supabase.from('agent_configs').select('config').eq('instancia', instance).maybeSingle()
      .then(({ data }) => {
        if (data?.config) setConfig(mergeDeep(DEFAULT_CONFIG, data.config))
        setLoading(false)
      })
  }, [instance])

  async function save() {
    if (!instance) return
    setSaving(true)
    await supabase.from('agent_configs').upsert(
      { instancia: instance, company_id: companyId, config },
      { onConflict: 'instancia' }
    )
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function setField(section, field, value) {
    setConfig(c => ({ ...c, [section]: { ...c[section], [field]: value } }))
  }

  function selectSection(id) {
    setActiveId(id)
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeSection   = SECTIONS.find(s => s.id === activeId)
  const completedCount  = SECTIONS.filter(s => isFilled(s.id, config)).length

  return (
    <div className="agcfg-root">
      {/* Hero */}
      <div className="agcfg-hero">
        <div className="agcfg-hero-bg" />
        <div className="agcfg-hero-content">
          <div className="agcfg-hero-eyebrow">
            <Sparkles size={14} />
            Configuração do Agente IA
          </div>
          <h1 className="agcfg-hero-title">
            Como o seu <em>agente</em> deve<br />
            se comportar, {userName}?
          </h1>
          <p className="agcfg-hero-sub">
            Defina a identidade, os fluxos e as regras do seu assistente virtual.
            Quanto mais detalhado, mais natural e preciso ele vai atender seus pacientes.
          </p>
          <div className="agcfg-hero-stats">
            <div className="agcfg-hero-stat">
              <div className="agcfg-hero-stat-value">{completedCount}</div>
              <div className="agcfg-hero-stat-label">seções preenchidas</div>
            </div>
            <div className="agcfg-hero-stat">
              <div className="agcfg-hero-stat-value">{SECTIONS.length}</div>
              <div className="agcfg-hero-stat-label">seções no total</div>
            </div>
            <div className="agcfg-hero-stat">
              <div className="agcfg-hero-stat-value">{config.profissionais?.length || 0}</div>
              <div className="agcfg-hero-stat-label">profissionais</div>
            </div>
          </div>
        </div>
      </div>

      {/* Shell */}
      <div className="agcfg-shell">
        {/* Sidebar */}
        <aside className="agcfg-nav">
          <div className="agcfg-nav-title">SEÇÕES</div>
          {SECTIONS.map(s => {
            const isActive = s.id === activeId
            const filled   = isFilled(s.id, config)
            return (
              <button
                key={s.id}
                onClick={() => selectSection(s.id)}
                className={`agcfg-nav-item ${isActive ? 'active' : ''}`}
                style={isActive ? { background: s.bg, borderColor: s.color } : {}}
              >
                <div className="agcfg-nav-icon" style={{ background: s.softBg, fontSize: 16 }}>
                  {s.emoji}
                </div>
                <div className="agcfg-nav-info">
                  <div className="agcfg-nav-name">{s.label}</div>
                  <div className="agcfg-nav-sub" style={isActive ? { color: s.color } : {}}>
                    {s.sub}
                  </div>
                </div>
                {filled && <span className="agcfg-nav-check" style={{ color: s.color }}>✓</span>}
                <ChevronRight size={14} className="agcfg-nav-arrow" />
              </button>
            )
          })}
        </aside>

        {/* Content */}
        <main className="agcfg-content" ref={contentRef}>
          {!loading && activeSection && (
            <div className="agcfg-card" key={activeId}>
              {/* Header */}
              <header className="agcfg-card-head" style={{ background: activeSection.bg }}>
                <div className="agcfg-card-emoji">{activeSection.emoji}</div>
                <div className="agcfg-card-head-text">
                  <div className="agcfg-card-kicker" style={{ color: activeSection.color }}>
                    {activeSection.sub}
                  </div>
                  <h2 className="agcfg-card-title">{activeSection.label}</h2>
                </div>
                <div className="agcfg-card-deco" style={{ background: activeSection.color }} />
              </header>

              {/* Body */}
              <div className="agcfg-card-body">
                {activeId === 'identidade'    && <SectionIdentidade    config={config} setField={setField} />}
                {activeId === 'clinica'       && <SectionClinica       config={config} setField={setField} />}
                {activeId === 'menu'          && <SectionMenu          config={config} setConfig={setConfig} />}
                {activeId === 'profissionais' && <SectionProfissionais config={config} setConfig={setConfig} />}
                {activeId === 'convenios'     && <SectionConvenios     config={config} setField={setField} />}
                {activeId === 'regras'        && <SectionRegras        config={config} setField={setField} />}
                {activeId === 'escrita'       && <SectionEscrita       config={config} setField={setField} />}
              </div>

              {/* Footer */}
              <footer className="agcfg-card-foot">
                <span className="agcfg-foot-hint">
                  As alterações só entram em vigor após salvar.
                </span>
                <button
                  className={`agcfg-save-btn ${saved ? 'saved' : ''}`}
                  onClick={save}
                  disabled={saving || saved}
                  style={saved ? {} : { background: activeSection.color }}
                >
                  {saved
                    ? <><CheckCircle2 size={16} /> Salvo!</>
                    : saving
                    ? 'Salvando...'
                    : <><Save size={15} /> Salvar configurações</>
                  }
                </button>
              </footer>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/* ─── Shared primitives ─────────────────────────────────────────────────── */

function Field({ label, hint, children }) {
  return (
    <div className="agcfg-field">
      <label className="agcfg-field-label">{label}</label>
      {hint && <div className="agcfg-field-hint">{hint}</div>}
      {children}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button type="button" className={`agcfg-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
      <span className="agcfg-toggle-knob" />
    </button>
  )
}

function ExampleBox({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="agcfg-example">
      <button className="agcfg-example-toggle" onClick={() => setOpen(o => !o)}>
        <Info size={13} />
        {title}
        <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }} />
      </button>
      {open && <div className="agcfg-example-body">{children}</div>}
    </div>
  )
}

/* ─── Sections ──────────────────────────────────────────────────────────── */

function SectionIdentidade({ config, setField }) {
  const c = config.identidade
  return (
    <div className="agcfg-fields">
      <div className="agcfg-fields-row">
        <Field label="Nome do agente" hint="Como ele se apresenta para os pacientes">
          <input className="agcfg-input" placeholder="Ex: Márcia, Sofia, Carlos..."
            value={c.nome} onChange={e => setField('identidade', 'nome', e.target.value)} />
        </Field>
        <Field label="Função / Cargo" hint="Papel que o agente desempenha">
          <input className="agcfg-input" placeholder="Ex: Secretária, Recepcionista..."
            value={c.funcao} onChange={e => setField('identidade', 'funcao', e.target.value)} />
        </Field>
      </div>
      <Field label="Especialidade da clínica" hint="Área de atuação principal">
        <input className="agcfg-input" placeholder="Ex: Oftalmologia, Dermatologia, Odontologia..."
          value={c.especialidade} onChange={e => setField('identidade', 'especialidade', e.target.value)} />
      </Field>
      <Field label="Identidade como humano">
        <div className="agcfg-toggle-row">
          <Toggle value={c.fingir_humano} onChange={v => setField('identidade', 'fingir_humano', v)} />
          <span className="agcfg-toggle-desc">
            O agente se apresenta como humano e nunca revela que é IA
          </span>
        </div>
      </Field>
      {c.fingir_humano && (
        <Field label="Resposta quando perguntam se é IA" hint="Uma frase natural que desvia sem mentir diretamente">
          <input className="agcfg-input"
            value={c.resposta_se_ia}
            onChange={e => setField('identidade', 'resposta_se_ia', e.target.value)} />
        </Field>
      )}
      <ExampleBox title="Ver exemplo real de identidade">
        <pre>{`Você é humana. Você é a Márcia. Ponto.
Nunca diga que é IA, robô, assistente virtual ou sistema.
Se perguntarem se você é IA, desvie com naturalidade:
→ "Sou a Márcia! Posso te ajudar com o que precisar 😊"`}</pre>
      </ExampleBox>
    </div>
  )
}

function SectionClinica({ config, setField }) {
  const c = config.clinica
  return (
    <div className="agcfg-fields">
      <div className="agcfg-fields-row">
        <Field label="Nome da clínica">
          <input className="agcfg-input" placeholder="Ex: Clínica de Olhos Dr. João Eugênio"
            value={c.nome} onChange={e => setField('clinica', 'nome', e.target.value)} />
        </Field>
        <Field label="Telefone">
          <input className="agcfg-input" placeholder="(61) 3248-4030"
            value={c.telefone} onChange={e => setField('clinica', 'telefone', e.target.value)} />
        </Field>
      </div>
      <Field label="Endereço principal">
        <input className="agcfg-input" placeholder="QI 5, Conjunto 09, Casa 02 — Lago Sul, Brasília-DF"
          value={c.endereco_principal} onChange={e => setField('clinica', 'endereco_principal', e.target.value)} />
      </Field>
      <Field label="Endereço secundário / filial" hint="Opcional — deixe vazio se não tiver">
        <input className="agcfg-input" placeholder="QNM 17 Conjunto H Lote 4/6, Ceilândia Sul..."
          value={c.endereco_secundario} onChange={e => setField('clinica', 'endereco_secundario', e.target.value)} />
      </Field>
      <div className="agcfg-fields-row">
        <Field label="Instagram">
          <input className="agcfg-input" placeholder="@clinica"
            value={c.instagram} onChange={e => setField('clinica', 'instagram', e.target.value)} />
        </Field>
        <Field label="Site">
          <input className="agcfg-input" placeholder="https://..."
            value={c.site} onChange={e => setField('clinica', 'site', e.target.value)} />
        </Field>
      </div>
      <Field label="Link Google Maps / Avaliações">
        <input className="agcfg-input" placeholder="https://g.co/kgs/..."
          value={c.google} onChange={e => setField('clinica', 'google', e.target.value)} />
      </Field>
      <Field label="Horário de funcionamento">
        <textarea className="agcfg-textarea" rows={2}
          placeholder="Segunda a sexta, 08h às 18h. Não atendemos sábados."
          value={c.horario} onChange={e => setField('clinica', 'horario', e.target.value)} />
      </Field>
    </div>
  )
}

function SectionMenu({ config, setConfig }) {
  const menu = config.menu

  function updateOpcao(idx, val) {
    const novas = menu.opcoes.map((o, i) => i === idx ? { ...o, label: val } : o)
    setConfig(c => ({ ...c, menu: { ...c.menu, opcoes: novas } }))
  }
  function addOpcao() {
    const num = (menu.opcoes[menu.opcoes.length - 1]?.num || 0) + 1
    setConfig(c => ({ ...c, menu: { ...c.menu, opcoes: [...c.menu.opcoes, { num, label: '' }] } }))
  }
  function removeOpcao(idx) {
    setConfig(c => ({ ...c, menu: { ...c.menu, opcoes: c.menu.opcoes.filter((_, i) => i !== idx) } }))
  }

  return (
    <div className="agcfg-fields">
      <Field label="Opções do menu" hint="O agente envia este menu no primeiro contato com o paciente">
        <div className="agcfg-menu-list">
          {menu.opcoes.map((o, i) => (
            <div key={i} className="agcfg-menu-item">
              <span className="agcfg-menu-num">{o.num}</span>
              <input className="agcfg-input" placeholder="Ex: Agendar consulta"
                value={o.label} onChange={e => updateOpcao(i, e.target.value)} />
              <button className="agcfg-icon-btn danger" onClick={() => removeOpcao(i)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button className="agcfg-add-btn" onClick={addOpcao}>
            <Plus size={14} /> Adicionar opção
          </button>
        </div>
      </Field>
      <Field label="Comportamento inteligente">
        <div className="agcfg-toggle-row">
          <Toggle
            value={menu.pular_se_duvida}
            onChange={v => setConfig(c => ({ ...c, menu: { ...c.menu, pular_se_duvida: v } }))}
          />
          <span className="agcfg-toggle-desc">
            Pular o menu se o paciente já vier com a dúvida na primeira mensagem
          </span>
        </div>
      </Field>
      <ExampleBox title="Ver exemplo real de menu">
        <pre>{`"Como posso te ajudar?

1 - Agendar consulta
2 - Cirurgias e procedimentos
3 - Exames
4 - Convênios e pagamento
5 - Falar com a equipe
6 - Dúvidas"`}</pre>
      </ExampleBox>
    </div>
  )
}

function SectionProfissionais({ config, setConfig }) {
  const lista = config.profissionais || []

  function update(idx, field, val) {
    setConfig(c => ({ ...c, profissionais: c.profissionais.map((p, i) => i === idx ? { ...p, [field]: val } : p) }))
  }
  function add() {
    setConfig(c => ({ ...c, profissionais: [...c.profissionais, { nome: '', especialidade: '', valor: '', restricoes: '' }] }))
  }
  function remove(idx) {
    setConfig(c => ({ ...c, profissionais: c.profissionais.filter((_, i) => i !== idx) }))
  }

  return (
    <div className="agcfg-fields">
      {lista.length === 0 && (
        <div className="agcfg-empty">
          Nenhum profissional cadastrado ainda. Adicione os médicos ou especialistas da sua equipe.
        </div>
      )}
      {lista.map((p, i) => (
        <div key={i} className="agcfg-pro-card">
          <div className="agcfg-pro-header">
            <span className="agcfg-pro-num">Profissional {i + 1}</span>
            <button className="agcfg-icon-btn danger" onClick={() => remove(i)}><Trash2 size={13} /></button>
          </div>
          <div className="agcfg-fields-row">
            <Field label="Nome">
              <input className="agcfg-input" placeholder="Drª Mariana Dourado"
                value={p.nome} onChange={e => update(i, 'nome', e.target.value)} />
            </Field>
            <Field label="Especialidade">
              <input className="agcfg-input" placeholder="Plástica Ocular, Retina..."
                value={p.especialidade} onChange={e => update(i, 'especialidade', e.target.value)} />
            </Field>
          </div>
          <div className="agcfg-fields-row">
            <Field label="Valor da consulta">
              <input className="agcfg-input" placeholder="R$ 600"
                value={p.valor} onChange={e => update(i, 'valor', e.target.value)} />
            </Field>
            <Field label="Convênios que NÃO atende" hint="Ex: Unity, Quality">
              <input className="agcfg-input" placeholder="Ex: Unity, Quality..."
                value={p.restricoes} onChange={e => update(i, 'restricoes', e.target.value)} />
            </Field>
          </div>
        </div>
      ))}
      <button className="agcfg-add-btn" onClick={add}>
        <Plus size={14} /> Adicionar profissional
      </button>
      <ExampleBox title="Ver exemplo de regras de profissionais">
        <pre>{`DR KLEBER - não atende UNITY
DR FELIPE - não atende UNITY
DR HILTON - não atende UNITY
Drª Stephanie - especialista em oftalmopediatria
  (atende crianças e autistas)
Drª Mariana Dourado - plástica ocular`}</pre>
      </ExampleBox>
    </div>
  )
}

function SectionConvenios({ config, setField }) {
  const c = config.convenios
  return (
    <div className="agcfg-fields">
      <Field label="Convênios aceitos" hint="Liste os planos que a clínica atende (um por linha)">
        <textarea className="agcfg-textarea" rows={6}
          placeholder={'Unimed\nAmil\nSulAmérica\nBradesco Saúde\nNotre Dame Intermédica\n...'}
          value={c.aceitos} onChange={e => setField('convenios', 'aceitos', e.target.value)} />
      </Field>
      <Field label="Convênios NÃO aceitos" hint="Planos que a clínica não trabalha">
        <textarea className="agcfg-textarea" rows={3}
          placeholder={'Quality\nSUS\nCassi\nSTJ\n...'}
          value={c.nao_aceitos} onChange={e => setField('convenios', 'nao_aceitos', e.target.value)} />
      </Field>
      <div className="agcfg-fields-row">
        <Field label="Formas de pagamento">
          <input className="agcfg-input" placeholder="Cartão crédito/débito, Pix, dinheiro..."
            value={c.formas_pagamento} onChange={e => setField('convenios', 'formas_pagamento', e.target.value)} />
        </Field>
        <Field label="Parcelamento" hint="Se disponível">
          <input className="agcfg-input" placeholder="Ex: até 6x sem juros no crédito"
            value={c.parcelamento} onChange={e => setField('convenios', 'parcelamento', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}

function SectionRegras({ config, setField }) {
  const c = config.regras
  const OPTS = [
    { id: 'paciente_irritado',          label: 'Paciente irritado ou exaltado' },
    { id: 'fora_escopo',                label: 'Situação fora do escopo do agente' },
    { id: 'pediu_humano',               label: 'Paciente pediu falar com uma pessoa' },
    { id: 'agendamento',                label: 'Na hora de confirmar o agendamento' },
    { id: 'valor_procedimento',         label: 'Perguntas sobre valor de procedimento cirúrgico' },
    { id: 'sus',                        label: 'Paciente menciona SUS' },
  ]
  function toggle(id) {
    const atual = c.quando_encaminhar || []
    setField('regras', 'quando_encaminhar', atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id])
  }
  return (
    <div className="agcfg-fields">
      <Field label="Confirmação de agendamento">
        <div className="agcfg-toggle-row">
          <Toggle value={c.confirmar_agendamento} onChange={v => setField('regras', 'confirmar_agendamento', v)} />
          <span className="agcfg-toggle-desc">
            O agente pode confirmar ao paciente que está agendado
            {!c.confirmar_agendamento && <em className="agcfg-rec"> — recomendado desligado</em>}
          </span>
        </div>
      </Field>
      <Field label="Valores de procedimentos">
        <div className="agcfg-toggle-row">
          <Toggle value={c.informar_valor_procedimento} onChange={v => setField('regras', 'informar_valor_procedimento', v)} />
          <span className="agcfg-toggle-desc">
            O agente pode informar valores de cirurgias e procedimentos
            {!c.informar_valor_procedimento && <em className="agcfg-rec"> — recomendado desligado</em>}
          </span>
        </div>
      </Field>
      <Field
        label="Quando encaminhar para a equipe humana"
        hint="Marque as situações em que o agente deve parar e chamar um atendente"
      >
        <div className="agcfg-check-list">
          {OPTS.map(o => (
            <label key={o.id} className="agcfg-check-item">
              <input type="checkbox"
                checked={(c.quando_encaminhar || []).includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </Field>
    </div>
  )
}

function SectionEscrita({ config, setField }) {
  const c = config.escrita
  return (
    <div className="agcfg-fields">
      <div className="agcfg-fields-row">
        <Field label="Máximo de linhas por mensagem">
          <select className="agcfg-select" value={c.max_linhas}
            onChange={e => setField('escrita', 'max_linhas', Number(e.target.value))}>
            <option value={2}>2 linhas — bem direto</option>
            <option value={3}>3 linhas</option>
            <option value={4}>4 linhas (recomendado)</option>
            <option value={6}>6 linhas</option>
            <option value={0}>Sem limite</option>
          </select>
        </Field>
        <Field label="Tom geral das mensagens">
          <select className="agcfg-select" value={c.tom}
            onChange={e => setField('escrita', 'tom', e.target.value)}>
            <option value="formal">Formal e profissional</option>
            <option value="amigavel">Amigável e natural (recomendado)</option>
            <option value="casual">Casual e descontraído</option>
          </select>
        </Field>
      </div>
      <Field label="Uso de emojis">
        <div className="agcfg-toggle-row">
          <Toggle value={c.usar_emoji} onChange={v => setField('escrita', 'usar_emoji', v)} />
          <span className="agcfg-toggle-desc">
            Permitir emojis nas mensagens, com moderação — nunca em situações urgentes
          </span>
        </div>
      </Field>
      <Field label="Expressões proibidas" hint="O agente nunca usa essas frases — uma por linha">
        <textarea className="agcfg-textarea" rows={7}
          value={c.expressoes_proibidas}
          onChange={e => setField('escrita', 'expressoes_proibidas', e.target.value)} />
      </Field>
      <ExampleBox title="Ver exemplo de regras de escrita">
        <pre>{`- Mensagens curtas. Máximo 3-4 linhas por mensagem.
- Nunca comece a mensagem com o nome do paciente.
- Tom cordial, acolhedor, calmo. Culto mas sem ser formal.
- Emojis com moderação. Nunca em urgências.
- Nunca use asteriscos para negrito.
- Finalize as mensagens com alguma pergunta.`}</pre>
      </ExampleBox>
    </div>
  )
}
