import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  GraduationCap, MessageSquare, History, Calendar, Kanban, BellRing,
  BarChart3, Stethoscope, Settings2, Sparkles, Check, ArrowRight, Lightbulb,
  PartyPopper, BookOpen, ChevronRight, Bot, Headset, Phone, Star, Zap,
  Mic, Paperclip, FileText, Trophy, Inbox, Users, Flag, Clock, ShieldCheck,
  Camera, Cake, Heart, Instagram, UserPlus, UserCheck, ClipboardList,
  TrendingUp, AlertCircle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import ConfirmModal from '../../components/ConfirmModal'
import './CompanyTutorial.css'

const SEEN_KEY = 'nx_tutorial_completed'

// ─── DADOS ───────────────────────────────────────────────────────────────────
const MODULES = [
  {
    key: 'conversas',
    icon: MessageSquare,
    color: '#2563EB',
    bg: '#DBEAFE',
    emoji: '💬',
    title: 'Conversas',
    subtitle: 'O coração do atendimento',
    intro: 'Aqui você vê tudo que chega da sua clínica em tempo real — WhatsApp, Instagram, Digisac, tudo no mesmo lugar.',
    steps: [
      {
        title: 'Três abas para organizar tudo',
        desc: 'Recepção (sob IA, aguardando humano) · Meu Setor (atendimentos seus) · Finalizados (encerrados). A cor da bolinha mostra onde a conversa está.',
      },
      {
        title: 'Assumir uma conversa',
        desc: 'Clica no botão verde "Assumir atendimento". A conversa sai da Recepção e vem para o Meu Setor. Você também pode mandar mensagem direto na Recepção que assume automaticamente.',
      },
      {
        title: 'Mandar texto, áudio, imagem ou PDF',
        desc: 'Use os botões de microfone (🎤) e clipe (📎) ao lado da caixa de texto. Áudio gravado direto pelo navegador, mídia visualizada na conversa.',
        chips: [{ icon: Mic, label: 'Áudio' }, { icon: Paperclip, label: 'Anexo' }, { icon: FileText, label: 'PDF' }],
      },
      {
        title: 'Salvar contato direto no header',
        desc: 'Botão "Salvar contato" agora fica visível no topo da conversa, do lado de Agendar e Finalizar. Quando o paciente já tá fichado, o botão fica verde mostrando "Editar [nome]". Sem precisar mais lembrar de clicar com botão direito.',
        chips: [{ icon: UserPlus, label: 'Salvar' }, { icon: UserCheck, label: 'Editar' }],
      },
      {
        title: 'Origem do paciente detectada sozinha',
        desc: 'Se o paciente disser "vi vocês no Instagram" ou "minha amiga indicou" nas primeiras mensagens, a plataforma identifica e marca a origem dele automaticamente — sem você precisar perguntar.',
      },
      {
        title: 'Abrir ficha do paciente em 1 clique',
        desc: 'Clica no nome ou na foto do paciente no header do chat e abre a ficha completa: cadastro, histórico clínico, timeline de atendimentos e mais.',
        chips: [{ icon: Camera, label: 'Foto' }, { icon: ClipboardList, label: 'Ficha' }],
      },
      {
        title: 'Finalizar com motivo',
        desc: 'Ao terminar, clica em "Finalizar conversa" e escolhe: Agendado, Resolvido, Encaminhado ou Desistiu. Isso vai virar métrica depois.',
      },
    ],
    tip: 'Tickets sem atividade por 2h fecham automaticamente como "Expirado". Se o paciente voltar, o ticket reabre na Recepção sozinho — sem trabalho manual pra equipe.',
    cta: { label: 'Abrir Conversas', to: '/painel/conversas' },
  },
  {
    key: 'historico',
    icon: History,
    color: '#7C3AED',
    bg: '#EDE9FE',
    emoji: '🤖',
    title: 'Conversas IA',
    subtitle: 'O histórico completo da IA',
    intro: 'Aqui ficam todas as mensagens que a IA processou — útil para auditar respostas e entender o que sua assistente virtual está dizendo aos pacientes.',
    steps: [
      {
        title: 'Veja só as conversas com IA',
        desc: 'Diferente da aba Conversas, aqui você vê o registro puro do que a IA respondeu. Quando alguém assume o atendimento, as mensagens humanas não aparecem aqui.',
      },
      {
        title: 'Tag "Assumido"',
        desc: 'Conversas que foram para atendente humano ganham essa tag verde. Te ajuda a identificar onde a IA precisou passar o bastão.',
      },
      {
        title: 'Pesquise por número',
        desc: 'Use a busca para encontrar rápido o histórico de um paciente específico.',
      },
    ],
    tip: 'Empresas com IA desativada não veem essa aba — só faz sentido se você usa IA.',
    cta: { label: 'Abrir Conversas IA', to: '/painel/historico' },
  },
  {
    key: 'pacientes',
    icon: Users,
    color: '#16A34A',
    bg: '#DCFCE7',
    emoji: '🧑‍⚕️',
    title: 'Pacientes',
    subtitle: 'Ficha completa de cada paciente',
    intro: 'A antiga aba "Contatos" virou Pacientes — agora com ficha clínica completa, foto, timeline de atendimentos e tudo que uma clínica precisa pra acompanhar quem é atendido ali.',
    steps: [
      {
        title: 'Cadastro novo com autocomplete',
        desc: 'Clica em "Novo paciente" e o sistema sugere números que já conversaram com vocês mas ainda não foram cadastrados. Um clique e o telefone vai pro formulário.',
        chips: [{ icon: UserPlus, label: 'Cadastro rápido' }, { icon: Phone, label: 'Sugere telefone' }],
      },
      {
        title: 'Foto no perfil',
        desc: 'Cada paciente pode ter uma foto. Ela aparece como avatar nas Conversas, no header do chat, nos cards de agendamento — toda a plataforma fica com cara de gente.',
        chips: [{ icon: Camera, label: 'Avatar em todo lugar' }],
      },
      {
        title: 'Ficha em 4 abas',
        desc: 'Resumo (visão geral) · Cadastro (dados pessoais, contato, convênio) · Saúde (alergias, medicações, condições, histórico) · Histórico (timeline de atendimentos e agendamentos).',
        chips: [{ icon: ClipboardList, label: 'Resumo' }, { icon: FileText, label: 'Cadastro' }, { icon: Heart, label: 'Saúde' }, { icon: History, label: 'Histórico' }],
      },
      {
        title: 'Banner de aniversário',
        desc: 'Quando o paciente faz aniversário nos próximos 7 dias, a ficha mostra um banner dourado lembrando — perfeito pra mandar mensagem carinhosa e fortalecer relacionamento.',
        chips: [{ icon: Cake, label: 'Lembrete automático' }],
      },
      {
        title: 'Edição em formulário guiado',
        desc: 'Clica em "Editar" e abre um modal com sub-abas: Identificação, Contato, Convênio, Saúde, Notas. Cada campo no lugar certo, sem se perder.',
      },
      {
        title: 'Atalho pra Conversar',
        desc: 'Em qualquer card de paciente, botão verde "Conversar" abre o ticket existente ou cria um novo. E clicando na linha, abre direto a ficha completa.',
      },
      {
        title: 'Origem detectada sozinha',
        desc: 'Não precisa perguntar "como conheceu a clínica?". A plataforma lê as primeiras mensagens do paciente e detecta automaticamente: Indicação, Instagram, Google, Facebook, Anúncio, Site... Tudo isso vira métrica em Métricas → Leads.',
      },
    ],
    tip: 'Use a aba Saúde pra registrar alergias, condições crônicas e medicações em uso — esses campos ficam visíveis no Resumo da ficha, ajudando profissionais a tomar decisão rápida durante o atendimento.',
    cta: { label: 'Abrir Pacientes', to: '/painel/contatos' },
  },
  {
    key: 'agenda',
    icon: Calendar,
    color: '#0891B2',
    bg: '#CFFAFE',
    emoji: '📅',
    title: 'Agenda',
    subtitle: 'Marque consultas direto da plataforma',
    intro: 'Calendário semanal com os agendamentos da clínica. Cria múltiplas agendas (uma por médico ou por sala) com horários, dias e duração de slot configuráveis.',
    steps: [
      {
        title: 'Crie agendas na aba "Agendas"',
        desc: 'Cada agenda tem nome, cor, dias da semana ativos, horário de início/fim e duração de slot (15 a 90 min). Pode vincular a um profissional cadastrado.',
      },
      {
        title: 'Agendar clicando num slot',
        desc: 'No calendário, clica num horário vazio para criar agendamento. Auto-completa nome dos contatos salvos. Selecione profissional + procedimento que o valor vem automático.',
      },
      {
        title: 'Status do agendamento',
        desc: '5 estados: Agendado · Confirmado · Concluído · Faltou · Cancelado. Marcar como Concluído já registra pagamento como Pago.',
      },
      {
        title: 'Validações automáticas',
        desc: 'Não deixa marcar fora do dia/horário do médico, nem dentro do intervalo, nem em conflito com outro paciente do mesmo profissional.',
      },
      {
        title: 'Integração com Conversas',
        desc: 'Cada vez que cria/altera/cancela um agendamento, registra mensagem no chat do paciente. Cancelar manda automaticamente um aviso pelo WhatsApp.',
      },
    ],
    tip: 'Na lista de Conversas aparece uma tag roxa "📅 hoje 14:30" no contato que tem agendamento futuro. Visualmente indica quem espera consulta.',
    cta: { label: 'Abrir Agenda', to: '/painel/agenda' },
  },
  {
    key: 'atividades',
    icon: Kanban,
    color: '#DB2777',
    bg: '#FCE7F3',
    emoji: '📋',
    title: 'Atividades',
    subtitle: 'Quadro Kanban para tarefas internas',
    intro: 'Crie colunas (A Fazer, Em Andamento, Concluído ou o que preferir) e cards de tarefas. Use para checklists internos, follow-up de pacientes, manutenção da clínica.',
    steps: [
      {
        title: 'Crie suas colunas',
        desc: 'Botão "Nova coluna" (só admin). Dá nome e cor. Tem o atalho "Usar padrão" que cria as 3 colunas básicas automaticamente.',
      },
      {
        title: 'Adicionar cards',
        desc: 'Em cada coluna tem botão "Adicionar card". Cada card tem título, descrição, prioridade (Baixa/Normal/Alta/Urgente), data de vencimento e atendente atribuído.',
      },
      {
        title: 'Arrastar entre colunas',
        desc: 'Para mudar de status, segura e arrasta o card. A posição também é salva — você pode reordenar dentro da coluna.',
      },
      {
        title: 'Filtros',
        desc: 'No topo: filtrar por atendente (incluindo "Meus cards" e "Sem atribuição") e por prioridade. Útil quando o quadro fica grande.',
      },
    ],
    tip: 'Cards com data vencida ganham badge vermelho "Atrasado". Use para nunca perder um follow-up importante.',
    cta: { label: 'Abrir Atividades', to: '/painel/atividades' },
  },
  {
    key: 'alertas',
    icon: BellRing,
    color: '#D97706',
    bg: '#FEF3C7',
    emoji: '🔔',
    title: 'Alertas',
    subtitle: 'Avisos da IA e encaminhamentos',
    intro: 'Quando a IA não dá conta, ela manda um alerta para vocês. Quando alguém precisa transferir uma conversa, vira um encaminhamento.',
    steps: [
      {
        title: 'Notificação sonora',
        desc: 'Ative o som no banner amarelo no topo da tela para ser avisado em tempo real quando chega alerta novo.',
      },
      {
        title: 'Encaminhar para colega',
        desc: 'Cada alerta tem botão "Encaminhar". Escolhe um atendente da equipe e ele recebe na tela dele com badge roxa "Encaminhado para você".',
      },
      {
        title: 'Botões de ação rápida',
        desc: 'Em cada alerta tem nome, número (com botão de copiar), atalho para WhatsApp e Digisac (se configurado).',
      },
      {
        title: 'Marcar como resolvido',
        desc: 'Quando lidar com a situação, clica em "Marcar resolvido". Some da fila pendente.',
      },
    ],
    tip: 'Empresas com IA desativada veem só encaminhamentos — alertas gerais da IA não aparecem.',
    cta: { label: 'Abrir Alertas', to: '/painel/alertas' },
  },
  {
    key: 'instagram',
    icon: Instagram,
    color: '#E11D48',
    bg: '#FFE4E6',
    emoji: '📸',
    title: 'Instagram',
    subtitle: 'Em breve · DMs unificadas + IA criando posts',
    intro: 'A aba Instagram já existe no menu (com badge "Em breve") como teaser do que tá vindo. A ideia é centralizar tudo do Insta da clínica dentro da plataforma.',
    steps: [
      {
        title: 'DMs do Instagram nas Conversas',
        desc: 'Mesma caixa de entrada do WhatsApp — DM cai como ticket, IA filtra, equipe assume. Sem precisar abrir o app do celular.',
      },
      {
        title: 'IA gera posts pra clínica',
        desc: 'Conta pra IA o tema (ex: "5 dúvidas sobre clareamento dental") e ela monta carrossel completo: copy, sugestão visual, hashtags. Você só revisa e aprova.',
      },
      {
        title: 'Calendário editorial integrado',
        desc: 'Programa post pra sair na quarta às 18h. A plataforma publica e ainda mede engajamento dentro da própria aba de Métricas.',
      },
    ],
    tip: 'Esse módulo ainda não está liberado — a aba mostra uma página teaser editorial. Assine a newsletter dentro da página pra ser avisado quando entrar em produção.',
    cta: { label: 'Ver teaser', to: '/painel/instagram' },
  },
  {
    key: 'metricas',
    icon: BarChart3,
    color: '#059669',
    bg: '#D1FAE5',
    emoji: '📊',
    title: 'Métricas',
    subtitle: '6 abas para entender sua operação',
    intro: 'Dashboard completo. Use os filtros de período (Hoje, Ontem, Semana, Mês, Todos) no topo — eles afetam todas as abas.',
    steps: [
      {
        title: 'Visão Geral',
        desc: 'KPIs principais: tickets novos, ativos, finalizados, agendamentos hoje, alertas pendentes, atividades atrasadas. Volume de mensagens por dia.',
      },
      {
        title: 'Atendimento',
        desc: 'Tempo médio até atendimento, duração de ticket, taxa de IA→humano, motivos de encerramento, mensagens por hora.',
      },
      {
        title: 'Equipe',
        desc: 'Ranking de atendentes (com troféu pro top 1) e distribuição por setor.',
      },
      {
        title: 'Agenda',
        desc: 'Confirmação, no-show, cancelamento. Distribuição por status e por dia da semana.',
      },
      {
        title: 'Financeiro',
        desc: 'Faturamento, ticket médio, a receber, perdido em faltas. Ranking por profissional e procedimento. Donut por forma de pagamento.',
      },
      {
        title: 'Leads — funil completo de conversão',
        desc: '6 KPIs (total, contactados, agendaram, receita atribuída, tempo até 1º contato, sem resposta), funil visual de 5 etapas (Recebidos → Contactados → Trocaram msg → Agendaram → Compareceram) com taxa de conversão entre etapas, volume diário em barras, tabela de origens com taxa de conversão por canal, e lista acionável de leads sem resposta com badge urgente +24h.',
        chips: [{ icon: Flag, label: 'Funil' }, { icon: TrendingUp, label: 'Atribuição' }, { icon: AlertCircle, label: 'Pendentes' }],
      },
      {
        title: 'Status do lead computado automaticamente',
        desc: '5 estágios atualizados sozinhos: novo → em atendimento → agendado → encerrado / perdido. Sem você ter que classificar manualmente — a plataforma deduz pelo que está acontecendo na conversa.',
      },
      {
        title: 'Atividades (Kanban)',
        desc: 'Visão geral do quadro: cards atrasados, urgentes, sem atribuição, distribuição por coluna.',
      },
    ],
    tip: 'O badge laranja "Atenção" aparece quando algum KPI está em estado crítico (no-show alto, cards atrasados, etc.). Olhe primeiro para esses.',
    cta: { label: 'Abrir Métricas', to: '/painel/metricas' },
  },
  {
    key: 'catalogo',
    icon: Stethoscope,
    color: '#A855F7',
    bg: '#F3E8FF',
    emoji: '🩺',
    title: 'Catálogo Clínico',
    subtitle: 'Médicos, procedimentos e convênios',
    intro: 'Aqui é onde você cadastra a estrutura da clínica. Tudo que cadastrar aparece automaticamente nos modais de agendamento.',
    steps: [
      {
        title: 'Profissionais',
        desc: 'Nome, especialidade, registro (CRM/CRO), cor, dias e horários de atendimento, intervalo (almoço). Tudo isso vira validação na agenda.',
      },
      {
        title: 'Procedimentos',
        desc: 'Tipo (Consulta/Exame/Procedimento), duração padrão e valor particular. Pode ser específico de um profissional ou da clínica toda.',
      },
      {
        title: 'Convênios e valores',
        desc: 'Cadastre os planos aceitos. Em cada procedimento, defina o valor diferenciado por convênio. O sistema usa o valor certo conforme a forma de pagamento escolhida.',
      },
    ],
    tip: 'No agendamento, ao escolher procedimento + convênio, o valor é preenchido automaticamente. Se o paciente pagar diferente, é só editar no campo.',
    cta: { label: 'Abrir Catálogo', to: '/painel/catalogo' },
  },
  {
    key: 'suporte',
    icon: Headset,
    color: '#C9A074',
    bg: '#FFFBEB',
    emoji: '🎧',
    title: 'Suporte direto com a Nexla',
    subtitle: 'Gente de verdade do outro lado',
    intro: 'Não tem central de URA, não tem ticket genérico que demora 2 dias. Você fala direto com a equipe que cuida da plataforma — em chat, com print, em poucos minutos.',
    steps: [
      {
        title: 'Botão flutuante em qualquer tela',
        desc: 'No canto inferior direito tem um ícone de fone cobre. Click abre o chat de suporte sem você sair do que estava fazendo. Em telas com input no rodapé (Conversas), ele sobe sozinho pra não atrapalhar.',
        chips: [{ icon: Headset, label: 'Sempre acessível' }],
      },
      {
        title: 'Abrir um chamado novo',
        desc: 'Click em "Novo chamado". Em uma linha você descreve o problema, e na descrição conta com calma. A gente recebe na hora — e responde, em média, em menos de 5 minutos em horário comercial.',
      },
      {
        title: 'Pode mandar print',
        desc: 'Dentro do chat tem botão de clipe pra anexar imagem (até 2MB). Print do erro ajuda muito a gente entender e resolver rápido.',
        chips: [{ icon: Camera, label: 'Imagem' }],
      },
      {
        title: 'Chat realtime com indicador de "digitando"',
        desc: 'Quando alguém da equipe está digitando uma resposta, você vê 3 bolinhas pulsando — igual WhatsApp. E quando você manda mensagem, aparece "Visto" embaixo quando a gente lê.',
      },
      {
        title: 'Histórico de chamados',
        desc: 'Cada chamado fica salvo. Quando vier um problema parecido depois, é só abrir e mostrar a solução de antes. Status: Aguardando · Respondido · Encerrado.',
      },
      {
        title: 'Marcar como resolvido',
        desc: 'Quando o problema acabar, clica em "Marcar como resolvido" no rodapé do chat. Se voltar a acontecer, é só responder no mesmo chamado e ele reabre.',
      },
    ],
    tip: 'Quanto mais detalhe e print, mais rápido a gente resolve. Se for urgente, fala "URGENTE" no resumo — a equipe prioriza.',
    cta: { label: 'Abrir um chamado agora', to: '/painel/conversas' },
  },
  {
    key: 'admin',
    icon: Settings2,
    color: '#475569',
    bg: '#E2E8F0',
    emoji: '⚙️',
    title: 'Administração',
    subtitle: 'Conexão, equipe e setores',
    intro: 'Painel de configurações. Visível só para usuários com perfil Admin.',
    steps: [
      {
        title: 'Conexão WhatsApp',
        desc: 'Status da instância em tempo real. Botão "Gerar QR Code" mostra o QR pra escanear no celular. Detecta a conexão automaticamente.',
      },
      {
        title: 'Setores',
        desc: 'Crie setores como "Comercial", "Suporte", "Recepção". Cada conversa atribuída fica visível só para quem é desse setor (admin vê tudo).',
      },
      {
        title: 'Usuários',
        desc: 'Crie acessos para sua equipe (respeitando o limite do seu plano). Defina perfil Admin ou Operador. Pode editar nome, e-mail, senha e excluir.',
      },
    ],
    tip: 'Operadores só veem conversas do setor deles + Recepção. Use isso para organizar grupos de atendimento sem confundir.',
    cta: { label: 'Abrir Administração', to: '/painel/admin' },
  },
]

// ─── COMPONENTE ──────────────────────────────────────────────────────────────
export default function CompanyTutorial() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userKey = session?.user?.email
  const onboardingDone = userKey && localStorage.getItem(`nx_onboarding_done_${userKey}`) === 'true'
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
  })
  const [activeKey, setActiveKey] = useState(MODULES[0].key)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const isAdmin = session?.user?.role === 'admin'
  const aiEnabled = session?.company?.ai_enabled !== false
  const contentRef = useRef(null)

  function finishOnboarding() {
    if (!userKey) return
    localStorage.setItem(`nx_onboarding_done_${userKey}`, 'true')
    navigate('/painel/conversas', { replace: true })
  }

  function skipOnboarding() {
    if (!userKey) return
    setConfirmSkip(true)
  }
  function confirmSkipAction() {
    if (!userKey) return
    localStorage.setItem(`nx_onboarding_done_${userKey}`, 'true')
    setConfirmSkip(false)
    navigate('/painel/conversas', { replace: true })
  }

  // Filtra módulos pelo perfil
  const visibleModules = useMemo(() => {
    return MODULES.filter(m => {
      if (m.key === 'historico' && !aiEnabled) return false
      if ((m.key === 'admin' || m.key === 'catalogo') && !isAdmin) return false
      return true
    })
  }, [isAdmin, aiEnabled])

  const active = visibleModules.find(m => m.key === activeKey) || visibleModules[0]

  function toggleComplete(key) {
    setCompleted(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem(SEEN_KEY, JSON.stringify(next))
      return next
    })
  }

  function selectModule(key) {
    setActiveKey(key)
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalCompleted = visibleModules.filter(m => completed.includes(m.key)).length
  const pct = Math.round((totalCompleted / visibleModules.length) * 100)
  const allDone = totalCompleted === visibleModules.length

  return (
    <div className="tut-root">
      {/* Banner de onboarding obrigatório */}
      {!onboardingDone && (
        <div className="tut-onboard-banner">
          <div className="tut-onboard-icon">
            <Sparkles size={16} />
          </div>
          <div className="tut-onboard-text">
            <strong>Bem-vindo à plataforma!</strong>
            <span>Conhece todos os capítulos antes de começar — assim você aproveita o máximo desde o primeiro dia.</span>
          </div>
          <button className="tut-onboard-skip" onClick={skipOnboarding}>
            Pular por agora
          </button>
        </div>
      )}

      {/* Hero — estética 'diário de bordo' */}
      <div className="tut-hero">
        <div className="tut-hero-bg" />
        <div className="tut-hero-content">
          <div className="tut-hero-eyebrow">
            <BookOpen size={14} />
            Manual da plataforma
          </div>
          <h1 className="tut-hero-title">
            <em>Vamos</em> dominar a plataforma<br />
            juntos, {session?.user?.name?.split(' ')[0] || 'amig@'}.
          </h1>
          <p className="tut-hero-sub">
            Cada bloco abaixo é um capítulo do manual. Leia no seu ritmo, marque os
            que terminou e siga em frente. Não tem prova no final, prometo.
          </p>

          <div className="tut-hero-stats">
            <div className="tut-hero-stat">
              <div className="tut-hero-stat-value">{visibleModules.length}</div>
              <div className="tut-hero-stat-label">capítulos no total</div>
            </div>
            <div className="tut-hero-stat">
              <div className="tut-hero-stat-value">{totalCompleted}</div>
              <div className="tut-hero-stat-label">já dominei</div>
            </div>
            <div className="tut-hero-stat">
              <div className="tut-hero-stat-value">{pct}%</div>
              <div className="tut-hero-stat-label">{allDone ? 'tudo concluído' : 'do tutorial'}</div>
            </div>
          </div>

          {allDone && !onboardingDone && (
            <button className="tut-finish-btn" onClick={finishOnboarding}>
              <PartyPopper size={16} />
              Concluir tutorial e ir para o painel
              <ArrowRight size={16} />
            </button>
          )}
          {allDone && onboardingDone && (
            <div className="tut-trophy-badge">
              <Trophy size={14} /> Tutorial 100% dominado
            </div>
          )}
        </div>
      </div>

      {/* Layout principal */}
      <div className="tut-shell">
        {/* Navegação lateral */}
        <aside className="tut-nav">
          <div className="tut-nav-title">CAPÍTULOS</div>
          {visibleModules.map((m, i) => {
            const done = completed.includes(m.key)
            const isActive = m.key === activeKey
            return (
              <button
                key={m.key}
                onClick={() => selectModule(m.key)}
                className={`tut-nav-item ${isActive ? 'active' : ''} ${done ? 'done' : ''}`}
                style={isActive ? { borderColor: m.color } : {}}
              >
                <div className="tut-nav-badge" style={{ background: m.bg, color: m.color }}>
                  {done ? <Check size={14} /> : String(i + 1).padStart(2, '0')}
                </div>
                <div className="tut-nav-info">
                  <div className="tut-nav-name">{m.title}</div>
                  <div className="tut-nav-meta">
                    <span style={{ color: m.color, fontWeight: 700 }}>{m.subtitle}</span>
                    {done && <span className="tut-nav-done-pill">concluído</span>}
                  </div>
                </div>
                <ChevronRight size={14} className="tut-nav-arrow" />
              </button>
            )
          })}
        </aside>

        {/* Conteúdo */}
        <main className="tut-content" ref={contentRef}>
          <ModuleGuide
            module={active}
            done={completed.includes(active.key)}
            onToggle={() => toggleComplete(active.key)}
          />
        </main>
      </div>

      <ConfirmModal
        open={confirmSkip}
        variant="warning"
        title="Pular tutorial?"
        message="Sem stress — você pode voltar aqui a qualquer momento pelo menu lateral. Mas perder esse manual pode te custar tempo lá na frente."
        confirmLabel="Pular mesmo assim"
        cancelLabel="Continuar tutorial"
        onConfirm={confirmSkipAction}
        onCancel={() => setConfirmSkip(false)}
      />
    </div>
  )
}

// ─── GUIA DO MÓDULO ──────────────────────────────────────────────────────────
function ModuleGuide({ module: m, done, onToggle }) {
  const Icon = m.icon
  return (
    <article className="tut-guide" key={m.key}>
      {/* Cabeçalho colorido */}
      <header className="tut-guide-head" style={{ background: m.bg }}>
        <div className="tut-guide-emoji">{m.emoji}</div>
        <div className="tut-guide-head-content">
          <div className="tut-guide-kicker" style={{ color: m.color }}>
            <Icon size={13} /> {m.subtitle}
          </div>
          <h2 className="tut-guide-title">{m.title}</h2>
          <p className="tut-guide-intro">{m.intro}</p>
        </div>
        <div className="tut-guide-deco" style={{ background: m.color }} />
      </header>

      {/* Passos */}
      <div className="tut-steps">
        {m.steps.map((step, i) => (
          <div key={i} className="tut-step">
            <div className="tut-step-num" style={{ background: m.color }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="tut-step-line" style={{ background: `${m.color}33` }} />
            <div className="tut-step-card">
              <h3 className="tut-step-title">{step.title}</h3>
              <p className="tut-step-desc">{step.desc}</p>
              {step.chips && (
                <div className="tut-step-chips">
                  {step.chips.map((c, j) => (
                    <span key={j} style={{ background: m.bg, color: m.color, borderColor: `${m.color}44` }}>
                      <c.icon size={11} /> {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Dica em formato post-it */}
      {m.tip && (
        <div className="tut-tip" style={{ '--tip-color': m.color, '--tip-bg': m.bg }}>
          <div className="tut-tip-icon"><Lightbulb size={18} /></div>
          <div>
            <div className="tut-tip-label">Dica de quem usa</div>
            <p className="tut-tip-text">{m.tip}</p>
          </div>
        </div>
      )}

      {/* Footer com CTA + marcar concluído */}
      <footer className="tut-guide-foot">
        <Link to={m.cta.to} className="tut-cta" style={{ background: m.color }}>
          {m.cta.label} <ArrowRight size={15} />
        </Link>
        <button onClick={onToggle} className={`tut-mark ${done ? 'done' : ''}`} style={done ? { background: m.color, borderColor: m.color, color: '#fff' } : {}}>
          {done ? <><Check size={14} /> Capítulo concluído</> : <>Marcar como concluído</>}
        </button>
      </footer>

      {/* Fim do capítulo */}
      <div className="tut-end">
        <div className="tut-end-stars">
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
          <Star size={12} fill="currentColor" />
        </div>
        <span>Fim do capítulo</span>
      </div>
    </article>
  )
}
