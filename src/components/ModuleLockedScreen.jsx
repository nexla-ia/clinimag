import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Lock, MessageCircle, CheckCircle2, MessageSquare, Users, BellRing, Contact2,
  Calendar, Kanban, GitMerge, DollarSign, Stethoscope, BarChart2, Instagram,
  Sparkles, Zap, Target, TrendingUp, Clock, ShieldCheck, FileText, Bell,
} from 'lucide-react'
import './ModuleLockedScreen.css'

// Módulo não contratado: a tela aparece com uma PRÉVIA desfocada + cadeado e um
// convite pra liberar (abre ticket no suporte). Serve pra o cliente ver o que está
// perdendo — melhor que esconder o item do menu.
export const MODULE_INFO = {
  conversas: {
    label: 'Conversas', icon: MessageSquare, preview: 'chat',
    title: ['Todas as conversas do', 'WhatsApp', 'da clínica num lugar só'],
    sub: 'Atendimento em equipe, com setores, etiquetas, respostas rápidas e histórico de cada paciente.',
    features: [
      [Users, 'Atendimento em equipe', 'Setores e atendentes sem conflito'],
      [Zap, 'Respostas rápidas', 'Mensagens prontas com 1 clique'],
      [Sparkles, 'IA que ajuda', 'Triagem e agendamento automáticos'],
    ],
  },
  instagram: {
    label: 'Instagram', icon: Instagram, preview: 'chat',
    title: ['Responda o', 'Instagram Direct', 'junto com o WhatsApp'],
    sub: 'As mensagens do Insta caem na mesma caixa de atendimento da equipe.',
    features: [
      [MessageCircle, 'Direct unificado', 'Insta e WhatsApp na mesma tela'],
      [Sparkles, 'IA atende', 'Responde e qualifica no Direct'],
      [Calendar, 'Agenda integrada', 'Agendamentos direto pelo Insta'],
    ],
  },
  grupos: {
    label: 'Grupos', icon: Users, preview: 'chat',
    title: ['Os', 'grupos do WhatsApp', 'dentro da plataforma'],
    sub: 'Acompanhe e responda os grupos da clínica sem depender do celular.',
    features: [
      [Users, 'Todos os grupos', 'Lista com não lidas e busca'],
      [MessageCircle, 'Responder e citar', 'Igual ao WhatsApp'],
      [Bell, 'Notificações', 'Saiba quando alguém falar'],
    ],
  },
  alertas: {
    label: 'Alertas', icon: BellRing, preview: 'list',
    title: ['Nenhum paciente', 'esquecido', 'no meio do dia'],
    sub: 'Alertas automáticos de quem ficou sem resposta, retornos e pendências.',
    features: [
      [BellRing, 'Alertas automáticos', 'Avisos na hora certa'],
      [Clock, 'Sem resposta', 'Quem está esperando há mais tempo'],
      [Target, 'Prioridade', 'O que resolver primeiro'],
    ],
  },
  contatos: {
    label: 'Pacientes', icon: Contact2, preview: 'list',
    title: ['O', 'cadastro completo', 'de cada paciente'],
    sub: 'Ficha, histórico de atendimentos, documentos e etiquetas em um só lugar.',
    features: [
      [Contact2, 'Ficha do paciente', 'Dados, histórico e anotações'],
      [FileText, 'Documentos', 'Arquivos e prontuário'],
      [Target, 'Etiquetas', 'Organize por tipo e origem'],
    ],
  },
  agenda: {
    label: 'Agenda', icon: Calendar, preview: 'calendar',
    title: ['Agenda online com', 'lembretes automáticos', 'no WhatsApp'],
    sub: 'Menos faltas: o paciente recebe o lembrete e confirma sozinho.',
    features: [
      [Calendar, 'Agenda por profissional', 'Semana e dia, com cores'],
      [Bell, 'Lembretes automáticos', 'Confirmação pelo WhatsApp'],
      [TrendingUp, 'Menos faltas', 'Paciente confirma ou remarca'],
    ],
  },
  kanban: {
    label: 'Kanban', icon: Kanban, preview: 'board',
    title: ['As tarefas da equipe', 'organizadas', 'em quadros'],
    sub: 'Atividades por responsável, prazo e prioridade — ninguém perde o que fazer.',
    features: [
      [Kanban, 'Quadros', 'Colunas do seu jeito'],
      [Users, 'Responsáveis', 'Cada um com suas tarefas'],
      [Clock, 'Prazos', 'Atrasados em destaque'],
    ],
  },
  crm: {
    label: 'CRM', icon: GitMerge, preview: 'board',
    title: ['Veja cada lead', 'virar paciente', 'no seu funil'],
    sub: 'Funil de vendas da clínica com follow-up, temperatura e taxa de conversão.',
    features: [
      [GitMerge, 'Funil visual', 'Do primeiro contato ao agendamento'],
      [Bell, 'Follow-up', 'Alertas de quem esfriou'],
      [TrendingUp, 'Conversão', 'Quantos leads viram pacientes'],
    ],
  },
  financeiro: {
    label: 'Financeiro', icon: DollarSign, preview: 'finance',
    title: ['O', 'financeiro da clínica', 'no automático'],
    sub: 'Contas a receber e a pagar, fluxo de caixa e cobranças que nascem da agenda.',
    features: [
      [DollarSign, 'A receber e a pagar', 'Com vencimentos e baixa'],
      [TrendingUp, 'Fluxo de caixa', 'Saldo por conta bancária'],
      [ShieldCheck, 'Inadimplência', 'Quem está devendo'],
    ],
  },
  catalogo: {
    label: 'Catálogo Clínico', icon: Stethoscope, preview: 'list',
    title: ['Procedimentos,', 'profissionais', 'e convênios'],
    sub: 'Cadastre serviços, valores por convênio e a agenda de cada profissional.',
    features: [
      [Stethoscope, 'Procedimentos', 'Valores e duração'],
      [Users, 'Profissionais', 'Horários e especialidades'],
      [ShieldCheck, 'Convênios', 'Preço por plano'],
    ],
  },
  metricas: {
    label: 'Métricas', icon: BarChart2, preview: 'chart',
    title: ['Os números da clínica', 'em tempo real', ''],
    sub: 'Atendimentos, origem dos pacientes, agendamentos e desempenho da equipe.',
    features: [
      [BarChart2, 'Painel completo', 'Visão geral do mês'],
      [Target, 'Origem dos pacientes', 'De onde vêm os contatos'],
      [TrendingUp, 'Equipe', 'Tempo de resposta e volume'],
    ],
  },
}

// Prévias ilustrativas (dados fictícios), desfocadas atrás do cadeado.
function Preview({ type }) {
  if (type === 'chat') return (
    <div className="mls-pv-list">
      {[['A', 'Ana Souza', 'Queria agendar uma consulta', '2min', '#60A5FA'],
        ['J', 'João Lima', 'Obrigado pelo retorno!', '9min', '#34D399'],
        ['M', 'Maria Clara', 'Qual o valor da avaliação?', '21min', '#F472B6'],
        ['P', 'Paulo Reis', 'Pode ser às 15h?', '1h', '#FBBF24']].map(([i, n, m, t, c]) => (
        <div key={n} className="mls-pv-row">
          <div className="mls-pv-avatar" style={{ background: c }}>{i}</div>
          <div className="mls-pv-text"><strong>{n}</strong><span>{m}</span></div>
          <div className="mls-pv-time">{t}</div>
        </div>
      ))}
    </div>
  )
  if (type === 'board') return (
    <div className="mls-pv-board">
      {[['Novo', '#64748B', 3], ['Em contato', '#2563EB', 2], ['Agendou', '#7C3AED', 2], ['Paciente', '#059669', 1]].map(([t, c, n]) => (
        <div key={t} className="mls-pv-col">
          <div className="mls-pv-col-head"><span style={{ background: c }} />{t}</div>
          {Array.from({ length: n }).map((_, i) => <div key={i} className="mls-pv-card"><i /><i /></div>)}
        </div>
      ))}
    </div>
  )
  if (type === 'calendar') return (
    <div className="mls-pv-cal">
      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((d, di) => (
        <div key={d} className="mls-pv-day">
          <div className="mls-pv-day-head">{d}</div>
          {[0, 1, 2].map(k => (di + k) % 3 !== 2 && (
            <div key={k} className="mls-pv-ev" style={{ background: ['#DBEAFE', '#DCFCE7', '#F3E8FF'][(di + k) % 3], borderColor: ['#60A5FA', '#34D399', '#A78BFA'][(di + k) % 3] }} />
          ))}
        </div>
      ))}
    </div>
  )
  if (type === 'finance') return (
    <div className="mls-pv-fin">
      <div className="mls-pv-kpis">
        {[['A receber', 'R$ 18.420', '#059669'], ['Recebido', 'R$ 32.150', '#2563EB'], ['A pagar', 'R$ 6.980', '#DC2626']].map(([l, v, c]) => (
          <div key={l} className="mls-pv-kpi"><span>{l}</span><strong style={{ color: c }}>{v}</strong></div>
        ))}
      </div>
      <div className="mls-pv-bars">{[40, 62, 48, 75, 58, 90, 70].map((h, i) => <div key={i} style={{ height: `${h}%` }} />)}</div>
    </div>
  )
  if (type === 'chart') return (
    <div className="mls-pv-fin">
      <div className="mls-pv-kpis">
        {[['Conversas', '1.284'], ['Agendados', '312'], ['Conversão', '24%']].map(([l, v]) => (
          <div key={l} className="mls-pv-kpi"><span>{l}</span><strong>{v}</strong></div>
        ))}
      </div>
      <div className="mls-pv-bars mls-pv-bars--blue">{[30, 45, 38, 60, 72, 66, 84].map((h, i) => <div key={i} style={{ height: `${h}%` }} />)}</div>
    </div>
  )
  return (
    <div className="mls-pv-list">
      {['Consulta inicial', 'Retorno', 'Avaliação', 'Procedimento'].map((n, i) => (
        <div key={n} className="mls-pv-row">
          <div className="mls-pv-avatar" style={{ background: ['#60A5FA', '#34D399', '#A78BFA', '#FBBF24'][i] }}>{n[0]}</div>
          <div className="mls-pv-text"><strong>{n}</strong><span>Detalhes e histórico</span></div>
        </div>
      ))}
    </div>
  )
}

export default function ModuleLockedScreen({ moduleKey }) {
  const { session } = useAuth()
  const company = session?.company
  const info = MODULE_INFO[moduleKey] || MODULE_INFO.metricas
  const Icon = info.icon
  const [state, setState] = useState('idle') // idle | sending | sent | error

  // Pede a liberação: abre um ticket no suporte (o time responde pelo chat da plataforma).
  async function requestUnlock() {
    if (state === 'sending' || state === 'sent') return
    setState('sending')
    const userId = session?.user?.id
    const userName = session?.user?.name || 'Cliente'
    const { data: ticket, error } = await supabase.from('support_tickets').insert({
      company_id: company?.id,
      subject: `Quero liberar o módulo ${info.label}`,
      status: 'open',
      created_by_user_id: userId,
      created_by_name: userName,
      last_sender: 'company',
    }).select().single()
    if (error || !ticket) { setState('error'); return }
    await supabase.from('support_messages').insert({
      ticket_id: ticket.id, sender_type: 'company', sender_user_id: userId, sender_name: userName,
      message: `Olá, time da Med Mag! 👋\n\nSou da clínica ${company?.name || ''} e tenho interesse no módulo ${info.label}. Podem me passar como liberar?`,
    })
    setState('sent')
  }

  return (
    <div className="mls">
      <div className="mls-bg"><div className="mls-orb mls-orb-1" /><div className="mls-orb mls-orb-2" /></div>

      <div className="mls-content">
        <div className="mls-badge"><Lock size={11} /><span>Não incluso no seu plano</span></div>

        <div className="mls-module"><Icon size={18} /> {info.label}</div>

        <h1 className="mls-title">
          <span>{info.title[0]}</span>
          <span className="mls-grad">{info.title[1]}</span>
          {info.title[2] && <span>{info.title[2]}</span>}
        </h1>
        <p className="mls-sub">{info.sub}</p>

        <div className="mls-preview">
          <div className="mls-preview-window"><Preview type={info.preview} /></div>
          <div className="mls-preview-overlay"><div className="mls-preview-lock"><Lock size={24} /></div></div>
        </div>

        <div className="mls-features">
          {info.features.map(([FIcon, t, d]) => (
            <div key={t} className="mls-feature">
              <div className="mls-feature-icon"><FIcon size={16} /></div>
              <div><div className="mls-feature-title">{t}</div><div className="mls-feature-desc">{d}</div></div>
            </div>
          ))}
        </div>

        {state === 'sent' ? (
          <div className="mls-success">
            <CheckCircle2 size={20} />
            <div>
              <div className="mls-success-title">Pedido enviado pro time!</div>
              <div className="mls-success-sub">A gente responde pelo chat de suporte, no canto inferior direito.</div>
            </div>
          </div>
        ) : (
          <button type="button" className="mls-cta" onClick={requestUnlock} disabled={state === 'sending'}>
            <Sparkles size={16} />
            <span>{state === 'sending' ? 'Enviando...' : `Quero liberar o ${info.label}`}</span>
            {state !== 'sending' && <span className="mls-cta-arrow">→</span>}
          </button>
        )}
        {state === 'error' && <div className="mls-error">Não deu pra enviar agora. Tente de novo ou fale com o suporte.</div>}
        <div className="mls-note">Prévia ilustrativa · Liberamos o módulo na sua conta sem perder nada do que já existe</div>
      </div>
    </div>
  )
}
