// Lista de novidades/atualizações da plataforma
// Sempre que houver mudanças relevantes, adicionar uma entrada NO TOPO desta lista.
// Formato: { date: 'YYYY-MM-DD', title, type, tags, items[] }

export const UPDATES = [
  {
    date: '2026-04-28',
    title: 'Quadro de Atividades (Kanban)',
    type: 'feature',
    tags: ['Atividades', 'Novo'],
    items: [
      'Nova aba "Atividades" no menu lateral com quadro Kanban',
      'Crie colunas customizadas (A Fazer, Em Andamento, Concluído ou o que preferir)',
      'Atalho para criar as 3 colunas padrão automaticamente',
      'Cards com título, descrição, prioridade (Baixa/Normal/Alta/Urgente) e data de vencimento',
      'Atribua cards a qualquer atendente da empresa',
      'Arraste e solte cards entre colunas para mudar status',
      'Filtros: por atendente (incluindo "Meus cards" e "Sem atribuição") e prioridade',
      'Indicadores visuais para vencimento (Atrasado, Hoje, Amanhã, etc.)',
      'Apenas administradores podem criar/excluir colunas; todos podem mexer nos cards',
      'Sincronização em tempo real entre todos os usuários',
    ],
  },
  {
    date: '2026-04-28',
    title: 'Empresas sem IA — interface adaptada',
    type: 'improvement',
    tags: ['Conversas', 'Alertas'],
    items: [
      'Empresas com IA desativada não veem mais a tag "IA" nas conversas em Recepção',
      'Banner "Conversa sob atendimento da IA" trocado por "Conversa aguardando atendimento"',
      'Aba "Alertas" passa a se chamar "Encaminhamentos" e mostra apenas conversas encaminhadas por outros atendentes',
      'Notificações sonoras de alertas da IA são silenciadas para empresas sem IA',
      'Badge de contagem no menu lateral também respeita o filtro',
    ],
  },
  {
    date: '2026-04-28',
    title: 'Aba de Novidades',
    type: 'feature',
    tags: ['Geral'],
    items: [
      'Nova aba "Novidades" no menu lateral com timeline de todas as atualizações da plataforma',
      'Badge "Novo" aparece no menu até o usuário visualizar pela primeira vez',
      'Atualizações organizadas por data, com tipo (Novidade, Melhoria, Correção) e tags por módulo',
    ],
  },
  {
    date: '2026-04-28',
    title: 'Agenda integrada com Conversas',
    type: 'feature',
    tags: ['Agenda', 'Conversas'],
    items: [
      'Botão "Agendar" direto no chat já preenche nome e número do contato',
      'Botão "Abrir conversa" no modal do agendamento leva ao chat do paciente',
      'Mensagens de sistema são registradas automaticamente na conversa quando o agendamento é criado, alterado ou cancelado',
      'Indicador roxo "📅 hoje 14:30" aparece na lista de conversas mostrando o próximo agendamento daquele número',
      'Histórico das últimas 5 mensagens do paciente fica visível dentro do modal de agendamento',
      'Cancelamento envia mensagem automática para o paciente via WhatsApp',
      'Card da agenda agora é clicável e abre direto o calendário daquele profissional',
    ],
  },
  {
    date: '2026-04-27',
    title: 'Módulo de Agenda completo',
    type: 'feature',
    tags: ['Agenda', 'Novo'],
    items: [
      'Nova aba "Agenda" no menu lateral',
      'Crie múltiplas agendas por profissional/sala com cor identificadora',
      'Configure dias de funcionamento, horários de início/fim e duração dos slots (15 a 90 min)',
      'Calendário semanal visual com navegação por semana',
      'Status de cada agendamento: Agendado, Confirmado, Concluído, Faltou ou Cancelado',
      'Autocomplete de paciente puxando os contatos salvos',
      'Sincronização em tempo real entre usuários',
    ],
  },
  {
    date: '2026-04-27',
    title: 'Conexão WhatsApp via QR Code direto no painel',
    type: 'feature',
    tags: ['Administração'],
    items: [
      'Seção "Conexão WhatsApp" na Administração da empresa',
      'Status em tempo real (Conectado / Aguardando leitura / Desconectado)',
      'Botão "Gerar QR Code" mostra o QR vindo da Evolution para escaneamento',
      'Detecção automática de conexão a cada 3 segundos',
      'Botão "Desconectar" para deslogar a instância quando necessário',
    ],
  },
  {
    date: '2026-04-27',
    title: 'Gestão de usuários reforçada',
    type: 'improvement',
    tags: ['Administração'],
    items: [
      'Admin da empresa agora pode editar nome, e-mail, senha e perfil dos usuários',
      'Admin da empresa pode excluir usuários (exceto a si mesmo)',
      'ADM global também tem opção de excluir usuários',
      'Limite de usuários por empresa configurável pelo ADM global',
    ],
  },
  {
    date: '2026-04-26',
    title: 'Contatos salvos',
    type: 'feature',
    tags: ['Conversas', 'Contatos'],
    items: [
      'Nova aba "Contatos" no menu lateral',
      'Clique com o botão direito sobre uma conversa para salvar o contato com nome e notas',
      'Conversas com contatos salvos exibem o nome em vez do número',
      'Botão "Conversar" no contato abre/reaproveita o ticket existente ou cria um novo',
      'Edição e exclusão de contatos com sincronização em tempo real',
    ],
  },
  {
    date: '2026-04-26',
    title: 'Áudio, imagem e PDF nas conversas',
    type: 'feature',
    tags: ['Conversas'],
    items: [
      'Áudios do cliente aparecem com player nativo do navegador',
      'Imagens aparecem na bolha e abrem em tela cheia (lightbox) ao clicar',
      'PDFs aparecem como card clicável com nome do arquivo e link de download',
      'Atendente pode gravar áudio direto do navegador (botão de microfone)',
      'Atendente pode anexar imagens e PDFs (botão de clipe)',
      'Clicar em "enviar" durante gravação para automaticamente e envia',
      'Mídia é salva no banco e renderizada igual em ambos os lados',
    ],
  },
  {
    date: '2026-04-26',
    title: 'Filtros e regras automáticas em Conversas',
    type: 'improvement',
    tags: ['Conversas'],
    items: [
      'Tickets sem atividade por mais de 6h são encerrados automaticamente como "Expirado"',
      'Grupos do WhatsApp (@g.us) são ignorados na lista',
      'Auto-atribuição: enviar mensagem numa conversa não atribuída assume automaticamente em seu nome',
      'Botão "Reabrir conversa" libera tickets finalizados quando precisar continuar o atendimento',
      'Prompts internos da IA aparecendo como mensagem de cliente foram filtrados',
    ],
  },
  {
    date: '2026-04-25',
    title: 'Setores e atribuição de atendentes',
    type: 'feature',
    tags: ['Administração', 'Conversas'],
    items: [
      'Crie setores/departamentos com cor identificadora (Comercial, Suporte, etc.)',
      'Atribua usuários a um setor — eles só veem conversas do setor deles',
      'Admins veem todas as conversas e setores',
      'Tickets na aba "Setores" mostram tag colorida do setor + nome do atendente',
      'Abas Recepção / Setores / Finalizados separam o fluxo de atendimento',
    ],
  },
  {
    date: '2026-04-25',
    title: 'Configurações por empresa',
    type: 'improvement',
    tags: ['Administração'],
    items: [
      'Toggle de IA ativa/desativada — quando desligada, conversas vão direto para a Recepção e a aba "Conversas IA" some do menu',
      'Campo "URL Digisac" — quando preenchido, aparece botão para abrir o painel Digisac da empresa',
      'Limite de usuários ativos por empresa',
      'URL Evolution opcional (padrão: evolutionapi.nexladesenvolvimento.com.br)',
    ],
  },
  {
    date: '2026-04-24',
    title: 'Painel inicial e melhorias de UX',
    type: 'improvement',
    tags: ['Geral'],
    items: [
      'Sessão persistente — atualizar a página mantém o usuário logado na mesma tela',
      'SPA routing corrigido — atualizar não dá mais 404',
      'Menu lateral com badges de contagem em Conversas e Alertas',
      'Tela de Métricas com filtros de período (Hoje, Ontem, Semana, Mês, Todos)',
      'Renome da plataforma para MedicinaMKT',
    ],
  },
]

// Retorna a data mais recente (string YYYY-MM-DD) — usado para badge de "novo" no menu
export function latestUpdateDate() {
  return UPDATES[0]?.date || '2026-01-01'
}
