import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Mock data (contacts/conversations/alerts — migrar para API depois) ────────
export const mockContacts = {
  'comp-1': [
    { id: 'c1', name: 'Roberto Alves',    phone: '+55 11 91234-5678', status: 'attended',  lastMsg: 'Quero agendar uma consulta para amanhã.', time: '14:32', unread: 0 },
    { id: 'c2', name: 'Patrícia Souza',   phone: '+55 11 99876-5432', status: 'waiting',   lastMsg: 'Olá, vocês têm horário na sexta?',          time: '13:10', unread: 2 },
    { id: 'c3', name: 'Fernando Rocha',   phone: '+55 21 98765-4321', status: 'help',      lastMsg: 'Não consigo entender o que a IA disse...',  time: '12:55', unread: 1 },
    { id: 'c4', name: 'Camila Nunes',     phone: '+55 11 94567-8901', status: 'scheduled', lastMsg: 'Confirmado! Às 15h de quinta.',              time: '11:30', unread: 0 },
    { id: 'c5', name: 'Tiago Moreira',    phone: '+55 31 93456-7890', status: 'attended',  lastMsg: 'Ok, obrigado pelo atendimento.',             time: '10:05', unread: 0 },
  ],
  'comp-2': [
    { id: 'c6', name: 'Bruna Cavalcanti', phone: '+55 81 97654-3210', status: 'waiting',   lastMsg: 'Gostaria de ver o apartamento no centro.',  time: '15:00', unread: 3 },
    { id: 'c7', name: 'Henrique Leal',    phone: '+55 11 96543-2109', status: 'help',      lastMsg: 'A IA não sabe responder sobre o contrato.', time: '14:20', unread: 1 },
    { id: 'c8', name: 'Monique Farias',   phone: '+55 85 95432-1098', status: 'scheduled', lastMsg: 'Visita marcada para sábado às 10h.',         time: '09:45', unread: 0 },
  ],
  'comp-3': [
    { id: 'c9',  name: 'Lucas Pimentel',  phone: '+55 11 94321-0987', status: 'waiting',   lastMsg: 'Quanto custa banho e tosa poodle médio?',   time: '16:10', unread: 1 },
    { id: 'c10', name: 'Vanessa Lima',    phone: '+55 11 93210-9876', status: 'attended',  lastMsg: 'Perfeito! Até amanhã então.',                time: '13:25', unread: 0 },
  ],
}

export const mockConversations = {
  c1: [
    { id: 1, from: 'client', text: 'Boa tarde! Gostaria de agendar uma consulta.',        time: '14:20' },
    { id: 2, from: 'ai',     text: 'Olá! Sou a assistente da Clínica Saúde Total. Posso te ajudar com o agendamento. Qual especialidade você precisa?', time: '14:20' },
    { id: 3, from: 'client', text: 'Clínica geral, por favor.',                           time: '14:25' },
    { id: 4, from: 'ai',     text: 'Perfeito! Temos horários disponíveis na terça (manhã e tarde) e quinta (tarde). Qual preferir?', time: '14:25' },
    { id: 5, from: 'client', text: 'Terça de manhã seria ótimo.',                         time: '14:28' },
    { id: 6, from: 'ai',     text: 'Ótimo! Tenho disponível às 9h, 10h e 11h. Qual horário prefere?', time: '14:28' },
    { id: 7, from: 'client', text: 'Às 10h perfeito.',                                    time: '14:30' },
    { id: 8, from: 'ai',     text: '✅ Agendamento confirmado! Terça-feira às 10h com Dr. Marcos. Vou te enviar o endereço e instruções. Até lá!', time: '14:32', type: 'scheduled' },
  ],
  c2: [
    { id: 1, from: 'client', text: 'Olá, vocês têm horário disponível na sexta-feira?',  time: '13:05' },
    { id: 2, from: 'ai',     text: 'Olá! Sexta-feira temos alguns horários. Para qual especialidade você precisa?', time: '13:06' },
    { id: 3, from: 'client', text: 'Dermatologista.',                                     time: '13:10' },
    { id: 4, from: 'ai',     text: 'Verificando disponibilidade para dermatologia na sexta...', time: '13:10', pending: true },
  ],
  c3: [
    { id: 1, from: 'client', text: 'Oi, quero saber sobre exames de sangue.',            time: '12:40' },
    { id: 2, from: 'ai',     text: 'Claro! Realizamos diversos exames laboratoriais. Quer agendar ou tem alguma dúvida específica?', time: '12:41' },
    { id: 3, from: 'client', text: 'Preciso saber se o plano de saúde cobre.',           time: '12:50' },
    { id: 4, from: 'ai',     text: '🆘 Preciso de ajuda para responder sobre cobertura de plano de saúde. Aguardando atendente humano.', time: '12:55', type: 'help' },
  ],
}

export const mockAlerts = {
  'comp-1': [
    { id: 'a1', contactName: 'Fernando Rocha',   phone: '+55 21 98765-4321', type: 'help',      message: 'Cliente perguntou sobre cobertura de plano de saúde. IA não conseguiu responder adequadamente.', time: '12:55', resolved: false },
    { id: 'a2', contactName: 'Patrícia Souza',   phone: '+55 11 99876-5432', type: 'schedule',  message: 'Cliente quer agendar para sexta, mas sistema não tem disponibilidade. Verificar agenda manual.', time: '13:10', resolved: false },
    { id: 'a3', contactName: 'Camila Nunes',     phone: '+55 11 94567-8901', type: 'schedule',  message: 'Agendamento confirmado: quinta-feira às 15h. Contato notificado com sucesso.', time: '11:30', resolved: true },
  ],
  'comp-2': [
    { id: 'a4', contactName: 'Henrique Leal',    phone: '+55 11 96543-2109', type: 'help',      message: 'Dúvida sobre cláusulas contratuais. IA redirecionou para atendimento humano.', time: '14:20', resolved: false },
    { id: 'a5', contactName: 'Monique Farias',   phone: '+55 85 95432-1098', type: 'schedule',  message: 'Visita agendada: sábado 10h. Corretor Rafael designado.', time: '09:45', resolved: true },
  ],
  'comp-3': [
    { id: 'a6', contactName: 'Lucas Pimentel',   phone: '+55 11 94321-0987', type: 'schedule',  message: 'Cliente aguarda confirmação de preço para banho e tosa. Aguardando tabela atualizada.', time: '16:10', resolved: false },
  ],
}

// ─── Auth context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

const SESSION_KEY = 'nx_session'

// Token do DISPOSITIVO (navegador) — usado pra travar a conta em uma sessão
// só. É estável e fica salvo no navegador: assim, o MESMO navegador sempre
// reassume a própria sessão (sair e entrar de novo nunca trava). Só troca de
// navegador/computador é que dispara o bloqueio.
function genDeviceToken() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() } catch {}
  return 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
const DEVICE_KEY = 'nx_device_id'
function getDeviceToken() {
  try {
    let t = localStorage.getItem(DEVICE_KEY)
    if (!t) { t = genDeviceToken(); localStorage.setItem(DEVICE_KEY, t) }
    return t
  } catch { return genDeviceToken() }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) } catch { return null }
  })
  const [db, setDb] = useState({ companies: [] })
  const [dbLoading, setDbLoading] = useState(false)
  const [dbError, setDbError] = useState(null)

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  }, [session])

  const loadDB = useCallback(async () => {
    setDbLoading(true)
    setDbError(null)
    const { data, error } = await supabase
      .from('companies')
      .select('*, users(*)')
      .order('created_at', { ascending: false })
    if (error) {
      setDbError('Erro ao carregar dados. Verifique as políticas RLS no Supabase.')
    } else if (data) {
      setDb({ companies: data })
    }
    setDbLoading(false)
  }, [])

  useEffect(() => {
    if (session?.role === 'adm') loadDB()
  }, [session?.role, loadDB])

  // Verifica a cada 5 min se o usuário/empresa ainda está ativo no banco.
  // Protege contra o caso de um admin desativar um usuário logado.
  useEffect(() => {
    if (!session || session.role === 'adm') return
    async function checkActive() {
      const [{ data: userData }, { data: companyData }] = await Promise.all([
        supabase.from('users').select('active').eq('id', session.user.id).single(),
        supabase.from('companies').select('active').eq('id', session.company.id).single(),
      ])
      if ((userData && !userData.active) || (companyData && !companyData.active)) {
        logout()
      }
    }
    const id = setInterval(checkActive, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [session?.user?.id, session?.company?.id])

  // Heartbeat da sessão única: mantém a conta "viva" neste dispositivo e
  // desloga se outro dispositivo assumir a conta. Só pra usuário de empresa
  // com token (não vale pro suporte/mestre nem pro ADM). Degrada em silêncio
  // se o RPC ainda não existir.
  useEffect(() => {
    const uid = session?.user?.id
    const token = session?.deviceToken
    if (session?.role !== 'company' || !uid || session?.user?.master || !token) return
    let alive = true
    async function beat() {
      try {
        const { data, error } = await supabase.rpc('touch_login_session', {
          p_user_id: uid, p_token: token,
        })
        if (!alive || error) return
        if (data === false) {
          try { localStorage.setItem('nx_logout_reason', 'Sua conta foi acessada em outro dispositivo, por isso você foi desconectado aqui.') } catch {}
          logout()
        }
      } catch {}
    }
    beat()
    const id = setInterval(beat, 45 * 1000)
    return () => { alive = false; clearInterval(id) }
  }, [session?.user?.id, session?.deviceToken])

  // Mantém o SETOR do usuário sincronizado com o banco. Se um admin remover
  // a pessoa de um setor, ela perde o acesso às conversas daquele setor sem
  // precisar deslogar. Atualiza ao abrir, a cada 60s e ao voltar pra aba.
  useEffect(() => {
    const uid = session?.user?.id
    if (session?.role !== 'company' || !uid || session?.user?.master) return
    let alive = true
    async function refreshSector() {
      try {
        const { data, error } = await supabase
          .from('sector_members')
          .select('sector_id, sectors(id, name, color)')
          .eq('user_id', uid)
          .maybeSingle()
        if (!alive || error) return
        const next = data?.sectors || null
        setSession(prev => {
          if (!prev?.user) return prev
          const curId   = prev.user.sector?.id   ?? null
          const nextId  = next?.id   ?? null
          const curName = prev.user.sector?.name ?? null
          const nextName = next?.name ?? null
          if (curId === nextId && curName === nextName) return prev
          return { ...prev, user: { ...prev.user, sector: next } }
        })
      } catch {}
    }
    refreshSector()
    const id = setInterval(refreshSector, 60 * 1000)
    const onFocus = () => refreshSector()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [session?.user?.id])

  async function login(email, password, mode, opts = {}) {
    const force = !!opts.force  // "sou eu": desconecta a outra sessão e entra
    const { data, error } = await supabase.rpc('login_user', {
      p_email: email,
      p_password: password,
    })

    if (error) {
      return { ok: false, error: 'Erro ao conectar com o servidor. Tente novamente.' }
    }

    if (!data?.length) {
      // Acesso mestre: e-mail mestre + senha mestre → lista de empresas pra
      // escolher qual acessar (RPC devolve vazio se credencial não bater).
      if (mode !== 'adm') {
        try {
          const { data: comps } = await supabase.rpc('master_list_companies', {
            p_email: email, p_password: password,
          })
          if (comps?.length) {
            return { ok: true, master: true, companies: comps, masterEmail: email }
          }
        } catch {}
      }
      return { ok: false, error: 'E-mail ou senha incorretos.' }
    }

    const user = data[0]

    if (mode === 'adm') {
      if (user.role !== 'adm') return { ok: false, error: 'Credenciais ADM inválidas.' }
      setSession({ role: 'adm', user: { name: user.name, email: user.email } })
      return { ok: true }
    }

    if (user.role === 'adm' || !user.company_id) {
      return { ok: false, error: 'E-mail ou senha incorretos.' }
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*, users(*)')
      .eq('id', user.company_id)
      .single()

    if (companyError || !company) {
      return { ok: false, error: 'Erro ao carregar dados da empresa. Tente novamente.' }
    }

    if (!company.active) {
      return { ok: false, error: 'Empresa inativa. Contate o administrador.' }
    }

    // Carrega setor do usuário (graceful: tabela pode não existir ainda)
    let sector = null
    try {
      const { data: memberData } = await supabase
        .from('sector_members')
        .select('sector_id, sectors(id, name, color)')
        .eq('user_id', user.id)
        .maybeSingle()
      sector = memberData?.sectors || null
    } catch {}

    // Login em um único dispositivo: tenta ASSUMIR a sessão do usuário.
    // Se já tem alguém usando a conta (sessão fresca), bloqueia com a
    // mensagem. Se o RPC ainda não existe (migração não rodada) ou der
    // erro de rede, entra normal — degradação segura (fail-open).
    const deviceToken = getDeviceToken()

    // "Sou eu": assume a sessão à força (desconecta a outra) — só chega aqui
    // depois da senha ter sido validada acima.
    if (force) {
      try {
        await supabase.from('users')
          .update({ session_token: deviceToken, session_seen_at: new Date().toISOString() })
          .eq('id', user.id)
      } catch {}
      setSession({ role: 'company', user: { ...user, sector }, company, deviceToken })
      return { ok: true }
    }

    try {
      const { data: claim, error: claimErr } = await supabase.rpc('claim_login_session', {
        p_user_id: user.id, p_token: deviceToken,
      })
      if (!claimErr) {
        if (claim && claim.ok === false) {
          return {
            ok: false,
            blocked: true,
            error: 'Já tem uma pessoa utilizando essa conta no momento. Se foi você, saia da outra tela (ou aguarde ~2 minutos) e tente de novo.',
          }
        }
        setSession({ role: 'company', user: { ...user, sector }, company, deviceToken })
        return { ok: true }
      }
    } catch {}

    setSession({ role: 'company', user: { ...user, sector }, company })
    return { ok: true }
  }

  // Entra numa empresa via acesso mestre (suporte Nexla). Sessão de admin da
  // empresa com identidade "Suporte Nexla" — ações ficam assinadas como suporte.
  async function masterEnter(companyId, masterEmail) {
    const { data: company, error } = await supabase
      .from('companies')
      .select('*, users(*)')
      .eq('id', companyId)
      .single()
    if (error || !company) {
      return { ok: false, error: 'Erro ao carregar dados da empresa.' }
    }
    // Suporte não precisa passar pelo tutorial de onboarding
    try { localStorage.setItem(`nx_onboarding_done_${masterEmail}`, 'true') } catch {}
    setSession({
      role: 'company',
      user: {
        id: null,
        name: 'Suporte Nexla',
        email: masterEmail,
        role: 'admin',
        sector: null,
        master: true,
      },
      company,
    })
    return { ok: true }
  }

  function logout() {
    // Solta a sessão no servidor (best-effort) pra liberar a conta na hora.
    const s = session
    if (s?.role === 'company' && s?.user?.id && s?.deviceToken && !s?.user?.master) {
      try { supabase.rpc('release_login_session', { p_user_id: s.user.id, p_token: s.deviceToken }) } catch {}
    }
    setSession(null)
    localStorage.removeItem(SESSION_KEY)
  }

  async function addCompany(data) {
    const slug = data.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')

    const { data: newComp, error } = await supabase
      .from('companies')
      .insert({
        name: data.name,
        slug,
        plan: data.plan || 'Starter',
        contacts_table: data.contactsTable || null,
        history_table: data.historyTable || null,
        instance: data.instance || null,
        api_instancia: data.apiInstancia || null,
      })
      .select()
      .single()

    if (error) return null

    // Configura RLS + Realtime nas tabelas se já existirem
    if (newComp) {
      if (data.historyTable) await supabase.rpc('ensure_table_setup', { p_table: data.historyTable })
      if (data.contactsTable) await supabase.rpc('ensure_table_setup', { p_table: data.contactsTable })
    }

    await loadDB()
    return newComp
  }

  async function addUser(companyId, userData) {
    const { error } = await supabase.rpc('create_user', {
      p_name: userData.name,
      p_email: userData.email,
      p_password: userData.password,
      p_role: userData.role || 'admin',
      p_company_id: companyId,
    })
    if (error) return { ok: false, error: error.message }
    await loadDB()
    return { ok: true }
  }

  async function updateUser(userId, userData) {
    const updates = {
      name: userData.name,
      email: userData.email,
      role: userData.role,
    }
    const { error } = await supabase.from('users').update(updates).eq('id', userId)
    if (error) return { ok: false, error: error.message }

    if (userData.password) {
      const { error: pwErr } = await supabase.rpc('update_user_password', {
        p_user_id: userId,
        p_password: userData.password,
      })
      if (pwErr) return { ok: false, error: pwErr.message }
    }

    await loadDB()
    return { ok: true }
  }

  // Troca de senha pelo PRÓPRIO usuário: confere a senha atual (via login_user)
  // e só então grava a nova. Não precisa de migração — usa RPCs que já existem.
  async function changeOwnPassword(currentPassword, newPassword) {
    const email = session?.user?.email
    const uid   = session?.user?.id
    if (!email || !uid) return { ok: false, error: 'Sessão inválida. Entre de novo e tente outra vez.' }
    if (!newPassword || newPassword.length < 6) return { ok: false, error: 'A nova senha precisa ter pelo menos 6 caracteres.' }

    // 1) confere a senha atual
    const { data, error } = await supabase.rpc('login_user', { p_email: email, p_password: currentPassword })
    if (error) return { ok: false, error: 'Erro ao validar a senha. Tente de novo.' }
    if (!data?.length) return { ok: false, error: 'Senha atual incorreta.' }

    // 2) grava a nova
    const { error: pwErr } = await supabase.rpc('update_user_password', { p_user_id: uid, p_password: newPassword })
    if (pwErr) return { ok: false, error: pwErr.message }
    return { ok: true }
  }

  async function toggleUserActive(companyId, userId) {
    const company = db.companies.find(c => c.id === companyId)
    const user = company?.users?.find(u => u.id === userId)
    if (!user) return
    const { error } = await supabase.from('users').update({ active: !user.active }).eq('id', userId)
    if (!error) await loadDB()
  }

  async function toggleCompanyActive(companyId) {
    const company = db.companies.find(c => c.id === companyId)
    if (!company) return
    const { error } = await supabase.from('companies').update({ active: !company.active }).eq('id', companyId)
    if (!error) await loadDB()
  }

  return (
    <AuthContext.Provider value={{ session, db, dbLoading, dbError, login, masterEnter, logout, loadDB, addCompany, addUser, updateUser, changeOwnPassword, toggleUserActive, toggleCompanyActive }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
