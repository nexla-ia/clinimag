import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  Plus, X, Search, Clock, AlertTriangle, Phone, Mail,
  UserPlus, Flag, Edit2, Trash2, Check, Loader2, ChevronDown,
  MessageSquare, ArrowRight, Tag, Users, MoreHorizontal,
  Thermometer, GitMerge, StickyNote, Kanban, Filter, List,
  ChevronRight, BookMarked, Zap, GripVertical,
} from 'lucide-react'
import { useContactTags, TagPicker, TagList } from '../../components/Tags'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:   '#0F172A', blue:  '#2563EB', blueDim: '#EFF6FF',
  slate:  '#475569', muted: '#94A3B8', border:  '#E2E8F0',
  bg:     '#F1F5F9', card:  '#FFFFFF',
  emerald:'#059669', rose:  '#E11D48',
}

const TEMP = {
  frio:   { label: 'Frio',   color: '#0891B2', bg: '#ECFEFF',  dot: '#0891B2', icon: '❄️' },
  morno:  { label: 'Morno',  color: '#D97706', bg: '#FFFBEB',  dot: '#D97706', icon: '🌤️' },
  quente: { label: 'Quente', color: '#DC2626', bg: '#FFF1F2',  dot: '#DC2626', icon: '🔥' },
}

const ORIGENS = ['WhatsApp','Instagram','Google','Facebook','Indicação','TikTok','Site','Convênio','Anúncio','Outro']

const ORIGEM_COLORS = {
  WhatsApp: '#25D366', Instagram: '#E1306C', Google: '#4285F4',
  Facebook: '#1877F2', Indicação: '#7C3AED', TikTok: '#000000',
  Site: '#0891B2', Convênio: '#059669', Anúncio: '#D97706', Outro: '#6B7280',
}

const DEFAULT_STAGES = [
  { nome: 'Novo Lead',        cor: '#64748B', posicao: 0, alerta_dias: 3  },
  { nome: 'Primeiro Contato', cor: '#2563EB', posicao: 1, alerta_dias: 5  },
  { nome: 'Agendou',          cor: '#7C3AED', posicao: 2, alerta_dias: 7  },
  { nome: 'Compareceu',       cor: '#0891B2', posicao: 3, alerta_dias: 14 },
  { nome: 'Retorno',          cor: '#D97706', posicao: 4, alerta_dias: 30 },
  { nome: 'Fidelizado',       cor: '#059669', posicao: 5, alerta_dias: 90 },
  { nome: 'Perdido',          cor: '#DC2626', posicao: 6, alerta_dias: null },
]

// Paleta pras etapas personalizadas
const STAGE_COLORS = ['#64748B','#2563EB','#7C3AED','#0891B2','#D97706','#059669','#DC2626','#DB2777','#4F46E5','#0F766E']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function daysIn(dateStr) {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}
function initials(nome, phone) {
  if (nome) return nome.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
  return (phone || '??').slice(-2)
}
function fmtPhone(p) {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
  if (d.length >= 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9,13)}`
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  return p
}
function relTime(dateStr) {
  if (!dateStr) return null
  const d = daysIn(dateStr)
  if (d === 0) return 'hoje'
  if (d === 1) return 'ontem'
  return `${d}d atrás`
}
// Telefone canônico (tira o "9" extra do celular BR) pra casar o mesmo contato
// entre crm_contacts, saved_contacts e clientes (que às vezes têm o 9, às vezes não).
function normPhone(p) {
  let d = (p || '').replace(/@.*/, '').replace(/\D/g, '')
  if (d.length === 13 && d[4] === '9') d = d.slice(0, 4) + d.slice(5)
  return d
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CompanyCRM() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const instance = session?.company?.instance

  const [loading, setLoading]         = useState(true)
  const [funnels, setFunnels]         = useState([])
  const [stages, setStages]           = useState([])
  const [contacts, setContacts]       = useState([])
  const [memberships, setMemberships] = useState([]) // vínculos extras lead↔funil (crm_contact_funnels)
  const [supportsRemovido, setSupportsRemovido] = useState(false) // coluna removido existe? (migração rodou)
  const [nameMap, setNameMap]         = useState({}) // telefone canônico → nome (contatos salvos + clientes)
  const [panelTimeline, setPanelTimeline] = useState([])
  const [panelLoading, setPanelLoading]  = useState(false)
  const [users, setUsers]               = useState([])
  const [kanbanCols, setKanbanCols]     = useState([])
  const [kanbanModal, setKanbanModal]   = useState(null)
  const [savingKanban, setSavingKanban] = useState(false)
  const [activeView, setActiveView]     = useState('board')
  const [lists, setLists]               = useState([])
  const [listModal, setListModal]       = useState(null)
  const [activeList, setActiveList]     = useState(null)
  const [savingList, setSavingList]     = useState(false)
  const [activeFunnel, setActiveFunnel] = useState(null)
  const [funnelModal, setFunnelModal] = useState(null)  // { id, nome } — criar/renomear funil; null = fechado
  const [savingFunnel, setSavingFunnel] = useState(false)
  const [confirmDelFunnel, setConfirmDelFunnel] = useState(null)
  const [moveMenu, setMoveMenu]       = useState(null)  // { contactId, funnelPick, x, y } — menu "mover para funil"
  const [dragFunnel, setDragFunnel]   = useState(null)  // id do funil sob o card sendo arrastado (highlight)
  const springRef = useRef({ funnelId: null, timer: null }) // spring-load: abre o funil ao pairar o card sobre a aba
  function clearSpring() { if (springRef.current.timer) clearTimeout(springRef.current.timer); springRef.current = { funnelId: null, timer: null } }
  const [search, setSearch]           = useState('')
  const [filterTemp, setFilterTemp]   = useState('todos')
  const [temperatures, setTemperatures] = useState([]) // temperaturas personalizadas (crm_temperatures)
  const [tempModal, setTempModal]     = useState(null)  // gerenciar temperaturas { nome, cor } | null
  const [savingTemp, setSavingTemp]   = useState(false)
  const [dragging, setDragging]       = useState(null)
  const [dragOver, setDragOver]       = useState(null)
  const [draggingStage, setDraggingStage] = useState(null) // etapa (coluna) sendo arrastada
  const [panel, setPanel]             = useState(null)
  const [panelNote, setPanelNote]     = useState('')
  const [editingName, setEditingName] = useState(false)   // editar o nome no cabeçalho do painel
  const [nameDraft, setNameDraft]     = useState('')
  const [newModal, setNewModal]       = useState(false)
  const [stageModal, setStageModal]   = useState(null)  // { id, nome, cor, alerta_dias } — null = fechado
  const [savingStage, setSavingStage] = useState(false)
  const [confirmDelStage, setConfirmDelStage] = useState(null)
  const [newForm, setNewForm]         = useState({ nome:'', phone:'', email:'', origem:'', temperatura:'morno', stage_id:'', observacoes:'' })
  const [saving, setSaving]           = useState(false)
  const [confirmDel, setConfirmDel]   = useState(null)
  // Etiquetas coloridas — as MESMAS das Conversas (contact_tags), casadas por
  // telefone canônico (sem o 9 extra), pra ser o mesmo sistema em todo lugar.
  const { tagsOf } = useContactTags(instance)

  // Busca TODAS as linhas de uma tabela paginando (o PostgREST corta em 1000,
  // mesmo com .limit maior). applyFilters recebe o query builder e devolve ele.
  async function fetchAll(table, columns, applyFilters) {
    let from = 0, out = []
    for (;;) {
      const { data, error } = await applyFilters(supabase.from(table).select(columns)).range(from, from + 999)
      if (error) break
      out.push(...(data || []))
      if (!data || data.length < 1000) break
      from += 1000
    }
    return out
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  async function load() {
    if (!instance) return
    setLoading(true)
    const [{ data: fn }, { data: st }, { data: kc }, { data: ls }] = await Promise.all([
      supabase.from('crm_funnels').select('*').eq('instancia', instance).order('posicao'),
      supabase.from('crm_stages').select('*').eq('instancia', instance).order('posicao'),
      supabase.from('kanban_columns').select('id,name,color').eq('instancia', instance).order('position'),
      supabase.from('crm_lists').select('*').eq('instancia', instance).order('created_at'),
    ])
    // Soft-delete: se a coluna `removido` existe (migração rodou), esconde os removidos.
    // Sonda a coluna pra não quebrar antes da migração.
    const { error: remProbe } = await supabase.from('crm_contacts').select('removido').limit(1)
    const hasRemovido = !remProbe
    setSupportsRemovido(hasRemovido)
    // crm_contacts pode passar de 1000 → pagina (senão leads antigos somem do board e das stats)
    const ct = await fetchAll('crm_contacts', '*', q => {
      let qq = q.eq('instancia', instance)
      if (hasRemovido) qq = qq.not('removido', 'is', true)
      return qq.order('created_at', { ascending: false })
    })
    // Vínculos extras (lead em vários funis). Resiliente: se a tabela ainda não foi
    // criada (migração não rodou), fica vazio e o CRM funciona como 1 funil por lead.
    const { data: mbs } = await supabase.from('crm_contact_funnels').select('*').eq('instancia', instance)
    setMemberships(mbs || [])
    // Temperaturas personalizadas (resiliente: sem a tabela, fica só nos 3 padrões).
    const { data: temps } = await supabase.from('crm_temperatures').select('*').eq('instancia', instance).order('posicao')
    setTemperatures(temps || [])
    if (kc) setKanbanCols(kc)
    if (ls) setLists(ls)

    let myFunnels = fn || [], myStages = st || []

    if (myFunnels.length === 0) {
      const { data: nf } = await supabase.from('crm_funnels')
        .insert({ instancia: instance, nome: 'Funil Principal', posicao: 0 }).select().single()
      if (nf) {
        myFunnels = [nf]
        const { data: ns } = await supabase.from('crm_stages')
          .insert(DEFAULT_STAGES.map(s => ({ ...s, funil_id: nf.id, instancia: instance }))).select()
        if (ns) myStages = ns.sort((a,b) => a.posicao - b.posicao)
      }
    }

    setFunnels(myFunnels)
    setStages(myStages)
    setContacts(ct || [])
    setActiveFunnel(prev => prev || myFunnels[0]?.id || null)
    setLoading(false)

    // Resolve o nome dos leads puxando de onde a clínica realmente batiza o
    // contato: contatos salvos (Conversas) e a tabela de clientes (pushname).
    // Sem isso, um lead sem nome no CRM mostrava só o número, mesmo já tendo
    // sido salvo com nome nas Conversas.
    loadNameMap()
  }

  // Monta telefone-canônico → nome. clientes primeiro, saved_contacts por cima
  // (o nome salvo à mão pela clínica tem prioridade sobre o pushname).
  async function loadNameMap() {
    if (!instance) return
    const map = {}
    // clientes primeiro (pushname), saved_contacts por cima (nome salvo à mão vence).
    const clientes = await fetchAll('clientes', 'numero,nome', q => q.eq('instancia', instance))
    for (const c of clientes) {
      const k = normPhone(c.numero)
      if (k && c.nome && c.nome.trim()) map[k] = c.nome.trim()
    }
    const salvos = await fetchAll('saved_contacts', 'numero,nome', q => q.eq('instancia', instance))
    for (const s of salvos) {
      const k = normPhone(s.numero)
      if (k && s.nome && s.nome.trim()) map[k] = s.nome.trim()
    }
    setNameMap(map)
  }

  // Nome exibido: nome do próprio lead > contato salvo/cliente > número formatado.
  // Exceção: quando o n8n gravou o nome da PRÓPRIA clínica no lead (acontece quando
  // a clínica responde e o fluxo pega o remetente errado), ignoramos esse nome e
  // usamos o nome real do cliente (contatos salvos / clientes).
  const ownName = (session?.company?.name || '').trim().toLowerCase()
  function bestName(c) {
    const crmNome = (c?.nome || '').trim()
    if (crmNome && crmNome.toLowerCase() !== ownName) return crmNome
    return nameMap[normPhone(c?.phone)] || ''
  }
  function resolveName(c) {
    return bestName(c) || fmtPhone(c?.phone) || 'Sem nome'
  }
  function resolveInitials(c) {
    return initials(bestName(c), c?.phone)
  }

  const cleanNum = p => (p||'').replace(/@.*$/,'').replace(/\D/g,'')

  async function loadPanelData(contact) {
    if (!instance || !contact?.phone) return
    setPanelLoading(true)
    const phone = cleanNum(contact.phone)
    // Variantes do número (com/sem o "9" extra) + formas com @ — pra casar o
    // histórico mesmo quando cada tabela guarda o número num formato diferente.
    const alt = phone.length === 12 ? phone.slice(0,4) + '9' + phone.slice(4)
              : (phone.length === 13 && phone[4] === '9' ? phone.slice(0,4) + phone.slice(5) : phone)
    const digitVars = [...new Set([phone, alt].filter(Boolean))]
    const numeroVars = [...new Set(digitVars.flatMap(x => [x, `${x}@s.whatsapp.net`, `${x}@c.us`]))]

    const [
      { data: crmIx },
      { data: msgs  },
      { data: appts },
      { data: finTx },
      { data: usrs  },
      { data: kCards },
    ] = await Promise.all([
      supabase.from('crm_interactions').select('*')
        .eq('instancia', instance).in('phone', digitVars)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('mensagens_geral')
        .select('id,numero,type,mensagem,created_at')
        .eq('instancia', instance).in('numero', numeroVars)
        .order('created_at', { ascending: false }).limit(40),
      supabase.from('appointments')
        .select('id,contact_nome,contact_numero,starts_at,status,price,procedure_name:procedures(name)')
        .eq('instancia', instance).in('contact_numero', numeroVars)
        .order('starts_at', { ascending: false }).limit(30),
      supabase.from('financial_transactions')
        .select('id,tipo,valor,status,descricao,vencimento,contact_nome,forma_pagamento')
        .eq('instancia', instance)
        .order('vencimento', { ascending: false }).limit(50),
      supabase.from('users').select('id,name,email').eq('company_id', session?.company?.id),
      supabase.from('kanban_cards')
        .select('id,title,description,priority,due_date,column_id,assigned_user_name,created_at')
        .eq('crm_contact_id', contact.id)
        .order('created_at', { ascending: false }),
    ])

    if (usrs) setUsers(usrs)

    const myAppts = appts || []
    // Usa o nome RESOLVIDO (contato salvo/cliente) pra casar o financeiro — antes,
    // lead sem nome no crm_contacts não trazia nenhuma transação.
    const nome0 = (bestName(contact) || '').toLowerCase().split(' ')[0]
    const myFin = (finTx||[]).filter(t =>
      nome0 && nome0.length >= 3 && t.contact_nome && t.contact_nome.toLowerCase().includes(nome0)
    )

    const TYPE_META = {
      nota:         { label:'Nota',          color:'#7C3AED', bg:'#F5F3FF' },
      etapa:        { label:'Etapa',         color:'#2563EB', bg:'#EFF6FF' },
      mensagem:     { label:'Mensagem',      color:'#059669', bg:'#ECFDF5' },
      agendamento:  { label:'Agendamento',   color:'#D97706', bg:'#FFFBEB' },
      financeiro:   { label:'Financeiro',    color:'#0891B2', bg:'#ECFEFF' },
      tarefa:       { label:'Tarefa',        color:'#6B7280', bg:'#F1F5F9' },
      kanban:       { label:'Kanban',        color:'#7C3AED', bg:'#F3E8FF' },
    }

    const APPT_STATUS = { agendado:'Agendado', confirmado:'Confirmado', concluido:'Concluído', faltou:'Faltou', cancelado:'Cancelado' }
    const fmtBRL = v => Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})

    const timeline = [
      ...(crmIx||[]).map(ix => ({
        id:`crm-${ix.id}`, date: ix.created_at, source:'crm', tipo: ix.tipo,
        conteudo: ix.conteudo, autor: ix.autor_nome, meta: TYPE_META[ix.tipo]||TYPE_META.nota,
      })),
      ...(msgs||[]).map(m => ({
        id:`msg-${m.id}`, date: m.created_at, source:'whatsapp', tipo:'mensagem',
        conteudo: (m.mensagem||'').slice(0,200),
        subtype: (m.type||'').toLowerCase(),
        meta: TYPE_META.mensagem,
      })),
      ...myAppts.map(a => ({
        id:`appt-${a.id}`, date: a.starts_at, source:'agenda', tipo:'agendamento',
        conteudo: `${APPT_STATUS[a.status]||a.status}${a.procedure_name?.name ? ` · ${a.procedure_name.name}` : ''}${a.price ? ` · ${fmtBRL(a.price)}` : ''}`,
        status: a.status,
        meta: TYPE_META.agendamento,
      })),
      ...myFin.map(t => ({
        id:`fin-${t.id}`, date: t.vencimento+'T12:00:00', source:'financeiro', tipo:'financeiro',
        conteudo: `${t.tipo==='receita'?'↑':'↓'} ${t.descricao} · ${fmtBRL(t.valor)} · ${t.status}${t.forma_pagamento?' · '+t.forma_pagamento:''}`,
        fintipo: t.tipo,
        meta: TYPE_META.financeiro,
      })),
      ...(kCards||[]).map(k => {
        const col = kanbanCols.find(c => c.id === k.column_id)
        const PRIO = { baixa:'#6B7280', normal:'#2563EB', alta:'#D97706', urgente:'#DC2626' }
        return {
          id:`kb-${k.id}`, date: k.created_at, source:'kanban', tipo:'kanban',
          conteudo: k.title,
          kbPrio: k.priority,
          kbPrioColor: PRIO[k.priority]||PRIO.normal,
          kbCol: col?.name || 'Kanban',
          kbColColor: col?.color || '#6B7280',
          kbDue: k.due_date,
          kbAssigned: k.assigned_user_name,
          kbDesc: k.description,
          kbId: k.id,
          meta: TYPE_META.kanban,
        }
      }),
    ].sort((a,b) => new Date(b.date) - new Date(a.date))

    setPanelTimeline(timeline)
    setPanelLoading(false)
  }

  async function createKanbanCard() {
    if (!kanbanModal || !panel) return
    if (!kanbanModal.title?.trim()) return
    setSavingKanban(true)
    const col = kanbanCols.find(c => c.id === kanbanModal.column_id) || kanbanCols[0]
    const { data, error } = await supabase.from('kanban_cards').insert({
      instancia: instance,
      column_id: col?.id,
      crm_contact_id: panel.id,
      contact_nome: bestName(panel) || panel.phone,
      title: kanbanModal.title.trim(),
      description: kanbanModal.description?.trim() || null,
      due_date: kanbanModal.due_date || null,
      priority: kanbanModal.priority || 'normal',
      assigned_user_id: kanbanModal.assigned_user_id || null,
      assigned_user_name: kanbanModal.assigned_user_name || null,
      position: 9999,
      created_by_email: session?.user?.email,
    }).select().single()
    setSavingKanban(false)
    if (error) { alert('Erro ao criar tarefa: ' + error.message); return }
    // Adiciona à timeline otimisticamente
    const PRIO = { baixa:'#6B7280', normal:'#2563EB', alta:'#D97706', urgente:'#DC2626' }
    const entry = {
      id:`kb-${data.id}`, date: data.created_at, source:'kanban', tipo:'kanban',
      conteudo: data.title,
      kbPrio: data.priority, kbPrioColor: PRIO[data.priority]||PRIO.normal,
      kbCol: col?.name||'Kanban', kbColColor: col?.color||'#6B7280',
      kbDue: data.due_date, kbAssigned: data.assigned_user_name,
      kbDesc: data.description, kbId: data.id,
      meta: { label:'Kanban', color:'#7C3AED', bg:'#F3E8FF' },
    }
    setPanelTimeline(p => [entry, ...p])
    // Loga no histórico CRM
    await supabase.from('crm_interactions').insert({
      instancia: instance, phone: cleanNum(panel.phone), tipo:'tarefa',
      conteudo: `Tarefa criada no Kanban: ${data.title}`,
      autor_nome: session?.user?.name || session?.user?.email,
    })
    setKanbanModal(null)
  }

  useEffect(() => { load() }, [instance])
  useEffect(() => { if (panel) { setPanelTimeline([]); loadPanelData(panel); setEditingName(false) } }, [panel?.id])

  // ── Computed ────────────────────────────────────────────────────────────────
  // Opções de origem = padrão + as que a clínica já criou nos leads (viram sugestão
  // automaticamente). Assim dá pra digitar uma nova (ex: "Eventos") e ela reaparece.
  const origemOptions = useMemo(() => {
    const seen = new Set(), out = []
    for (const o of ORIGENS) { const k = o.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(o) } }
    for (const c of contacts) {
      const o = (c.origem || '').trim(); if (!o) continue
      const k = o.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(o) }
    }
    return out
  }, [contacts])

  const funStages = useMemo(
    () => stages.filter(s => s.funil_id === activeFunnel).sort((a,b) => a.posicao - b.posicao),
    [stages, activeFunnel]
  )

  // ── Multi-funil: o mesmo lead pode aparecer em vários funis ──────────────────
  // Funil PRINCIPAL = crm_contacts.funil_id (ou o 1º funil, p/ leads legados).
  // Funis ADICIONAIS = linhas em crm_contact_funnels (memberships), etapa própria.
  const primaryFunnelId = funnels[0]?.id || null
  const primaryFunnelOf = c => c?.funil_id || primaryFunnelId
  const membershipMap = useMemo(() => {
    const m = {}; memberships.forEach(mb => { m[`${mb.contact_id}|${mb.funil_id}`] = mb }); return m
  }, [memberships])
  const extraByContact = useMemo(() => {
    const m = {}; memberships.forEach(mb => { (m[mb.contact_id] || (m[mb.contact_id] = [])).push(mb) }); return m
  }, [memberships])
  const funnelsSetOf = c => {
    const s = new Set(); const p = primaryFunnelOf(c); if (p) s.add(p)
    ;(extraByContact[c.id] || []).forEach(mb => s.add(mb.funil_id)); return s
  }
  const isPrimaryFunnel = (c, fid) => fid === primaryFunnelOf(c)
  const stageInFunnel = (c, fid) => isPrimaryFunnel(c, fid) ? c.stage_id : (membershipMap[`${c.id}|${fid}`]?.stage_id || null)
  const entradaInFunnel = (c, fid) => isPrimaryFunnel(c, fid) ? c.data_entrada_etapa : (membershipMap[`${c.id}|${fid}`]?.data_entrada_etapa || c.data_entrada_etapa)

  // ── Temperaturas: 3 padrões (frio/morno/quente) + as personalizadas ─────────
  const tempList = useMemo(() => {
    const defs = ['frio','morno','quente'].map(k => ({ key: k, label: TEMP[k].label, color: TEMP[k].color, bg: TEMP[k].bg, dot: TEMP[k].dot, icon: TEMP[k].icon, custom: false }))
    const cust = (temperatures || []).map(t => ({ key: t.id, label: t.nome, color: t.cor || '#64748B', bg: (t.cor || '#64748B') + '18', dot: t.cor || '#64748B', icon: '●', custom: true, id: t.id }))
    return [...defs, ...cust]
  }, [temperatures])
  const tempMap = useMemo(() => { const m = {}; tempList.forEach(t => { m[t.key] = t }); return m }, [tempList])
  const tempOf = k => tempMap[k] || { key: k, label: 'Sem temp.', color: '#94A3B8', bg: '#F1F5F9', dot: '#94A3B8', icon: '•', custom: false }

  async function createTemperature() {
    const nome = (tempModal?.nome || '').trim()
    if (!nome || savingTemp) return
    setSavingTemp(true)
    const maxPos = Math.max(-1, ...temperatures.map(t => t.posicao ?? 0))
    const { data, error } = await supabase.from('crm_temperatures')
      .insert({ instancia: instance, nome, cor: tempModal.cor || '#64748B', posicao: maxPos + 1 }).select().single()
    setSavingTemp(false)
    if (error) { alert('Não consegui criar: ' + error.message + '\n(A migração crm_temperatures já rodou?)'); return }
    if (data) { setTemperatures(prev => [...prev, data]); setTempModal(m => ({ ...m, nome: '' })) }
  }
  async function deleteTemperature(t) {
    const { error } = await supabase.from('crm_temperatures').delete().eq('id', t.id)
    if (error) { alert('Erro: ' + error.message); return }
    setTemperatures(prev => prev.filter(x => x.id !== t.id))
  }

  const filteredContacts = useMemo(() => {
    const q = search.toLowerCase().trim()
    return contacts.filter(c => {
      if (!funnelsSetOf(c).has(activeFunnel)) return false
      if (filterTemp !== 'todos' && c.temperatura !== filterTemp) return false
      if (q && !bestName(c).toLowerCase().includes(q) && !(c.phone||'').includes(q) && !(c.email||'').toLowerCase().includes(q)) return false
      return true
    })
  }, [contacts, memberships, search, filterTemp, activeFunnel, funnels])

  const byStage = useMemo(() => {
    const map = {}
    funStages.forEach(s => { map[s.id] = [] })
    filteredContacts.forEach(c => {
      // Usa a etapa/entrada DESTE funil (principal ou vínculo). Sobrescreve no card
      // pra o arraste (fromStage) e o "dias na etapa" saírem certos por funil.
      const sid = stageInFunnel(c, activeFunnel)
      const key = (sid && map[sid] !== undefined) ? sid : (funStages[0]?.id || '__none__')
      if (map[key]) map[key].push({ ...c, stage_id: sid, data_entrada_etapa: entradaInFunnel(c, activeFunnel) })
    })
    return map
  }, [filteredContacts, funStages, memberships, activeFunnel])

  // ── Drag & Drop ─────────────────────────────────────────────────────────────
  function onDragStart(e, contact) {
    setDragging({ id: contact.id, fromStage: contact.stage_id })
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, stageId) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(stageId)
  }
  async function onDrop(e, toStageId) {
    e.preventDefault()
    setDragOver(null)
    // Se está arrastando uma COLUNA (etapa), reordena as etapas em vez de mover card.
    if (draggingStage) {
      const fromId = draggingStage.id
      setDraggingStage(null)
      await reorderStages(fromId, toStageId)
      return
    }
    const drag = dragging
    if (!drag || drag.fromStage === toStageId) { setDragging(null); return }
    setDragging(null)

    const now = new Date().toISOString()
    const contact = contacts.find(c => c.id === drag.id)
    if (!contact) return
    const fromStage = stages.find(s => s.id === drag.fromStage)
    const toStage   = stages.find(s => s.id === toStageId)

    const ok = await setStageInFunnel(contact, activeFunnel, toStageId, now)
    if (!ok) return
    await supabase.from('crm_interactions').insert({
      instancia: instance, phone: contact.phone || '',
      tipo: 'etapa',
      conteudo: `Movido de "${fromStage?.nome||'Sem etapa'}" → "${toStage?.nome||'Sem etapa'}"${isPrimaryFunnel(contact, activeFunnel) ? '' : ' (funil adicional)'}`,
      metadata: { from: drag.fromStage, to: toStageId, funil: activeFunnel },
      autor_nome: session?.user?.name || session?.user?.email,
    })
  }

  // Grava a etapa do lead NAQUELE funil: principal → crm_contacts; adicional → a
  // linha em crm_contact_funnels. Otimista, reverte se o banco recusar.
  async function setStageInFunnel(contact, funnelId, toStageId, now = new Date().toISOString()) {
    if (isPrimaryFunnel(contact, funnelId)) {
      const snap = contacts
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, stage_id: toStageId, funil_id: funnelId, data_entrada_etapa: now } : c))
      if (panel?.id === contact.id) setPanel(p => ({ ...p, stage_id: toStageId, funil_id: funnelId }))
      const { error } = await supabase.from('crm_contacts').update({ stage_id: toStageId, funil_id: funnelId, data_entrada_etapa: now }).eq('id', contact.id)
      if (error) { setContacts(snap); alert('Não consegui mover o lead: ' + error.message); return false }
      return true
    }
    const mb = membershipMap[`${contact.id}|${funnelId}`]
    if (!mb) return false
    const snap = memberships
    setMemberships(prev => prev.map(x => x.id === mb.id ? { ...x, stage_id: toStageId, data_entrada_etapa: now } : x))
    const { error } = await supabase.from('crm_contact_funnels').update({ stage_id: toStageId, data_entrada_etapa: now }).eq('id', mb.id)
    if (error) { setMemberships(snap); alert('Não consegui mover o lead: ' + error.message); return false }
    return true
  }

  // Adiciona o lead a um funil extra (cria o vínculo na 1ª etapa) / remove o vínculo.
  async function addMembership(contactId, funnelId) {
    const first = stages.filter(s => s.funil_id === funnelId).sort((a,b) => (a.posicao??0)-(b.posicao??0))[0]
    const { data, error } = await supabase.from('crm_contact_funnels')
      .insert({ instancia: instance, contact_id: contactId, funil_id: funnelId, stage_id: first?.id || null, data_entrada_etapa: new Date().toISOString() })
      .select().single()
    if (error) { alert('Não consegui adicionar ao funil: ' + error.message + '\n(A migração crm_contact_funnels já rodou?)'); return }
    if (data) setMemberships(prev => [...prev, data])
  }
  async function removeMembership(mb) {
    const snap = memberships
    setMemberships(prev => prev.filter(x => x.id !== mb.id))
    const { error } = await supabase.from('crm_contact_funnels').delete().eq('id', mb.id)
    if (error) { setMemberships(snap); alert('Não consegui remover do funil: ' + error.message) }
  }

  // ── Contact CRUD ────────────────────────────────────────────────────────────
  async function createContact() {
    if (!newForm.phone.trim()) return
    setSaving(true)
    const phone = newForm.phone.replace(/\D/g,'')
    const payload = {
      nome: newForm.nome.trim() || null,
      email: newForm.email.trim() || null,
      origem: newForm.origem || null,
      temperatura: newForm.temperatura,
      stage_id: newForm.stage_id || funStages[0]?.id || null,
      funil_id: activeFunnel,
      observacoes: newForm.observacoes || null,
      data_entrada_etapa: new Date().toISOString(),
    }
    const resetForm = () => setNewForm({ nome:'', phone:'', email:'', origem:'', temperatura:'morno', stage_id:'', observacoes:'' })
    // Já existe lead com esse número (UNIQUE instancia+phone), inclusive removido?
    const { data: existing } = await supabase.from('crm_contacts').select('*').eq('instancia', instance).eq('phone', phone).maybeSingle()
    if (existing) {
      const isRemoved = supportsRemovido && existing.removido === true
      if (!isRemoved) {
        setSaving(false)
        alert('Já existe um lead com esse número no CRM.')
        const live = contacts.find(c => c.id === existing.id)
        setNewModal(false); resetForm()
        if (live) setPanel(live)
        return
      }
      // Estava removido → revive com os dados novos (não cria duplicado)
      const revive = { ...payload }
      if (supportsRemovido) { revive.removido = false; revive.removido_at = null }
      const { data: upd, error } = await supabase.from('crm_contacts').update(revive).eq('id', existing.id).select().single()
      setSaving(false)
      if (error) { alert('Erro: '+error.message); return }
      setContacts(p => [upd, ...p.filter(c => c.id !== upd.id)])
      setNewModal(false); resetForm()
      return
    }
    const { data: nc, error } = await supabase.from('crm_contacts').insert({ instancia: instance, phone, ...payload }).select().single()
    setSaving(false)
    if (error) { alert('Erro: '+error.message); return }
    setContacts(p => [nc, ...p])
    setNewModal(false); resetForm()
  }

  async function patchContact(id, changes) {
    const { error } = await supabase.from('crm_contacts').update(changes).eq('id', id)
    if (error) { alert('Não consegui salvar: ' + error.message); return }
    setContacts(p => p.map(c => c.id===id ? {...c,...changes} : c))
    if (panel?.id === id) setPanel(p => ({...p,...changes}))
  }

  // ── Etapas (colunas) — criar / editar / mover / excluir ─────────────────────
  // opts.funilId: funil onde criar (default = ativo). opts.assignTo: id do lead que
  // deve ir pra nova etapa assim que ela for criada (quando vem do painel).
  function openStageModal(stage, opts = {}) {
    setStageModal(stage
      ? { id: stage.id, nome: stage.nome, cor: stage.cor || STAGE_COLORS[0], alerta_dias: stage.alerta_dias ?? '' }
      : { id: null, nome: '', cor: STAGE_COLORS[0], alerta_dias: '', funil_id: opts.funilId || activeFunnel, assignTo: opts.assignTo || null })
  }

  async function handleSaveStage() {
    if (!stageModal || savingStage) return
    const nome = (stageModal.nome || '').trim()
    if (!nome) return
    const alerta = stageModal.alerta_dias === '' || stageModal.alerta_dias == null
      ? null : (parseInt(stageModal.alerta_dias) || null)
    setSavingStage(true)
    if (stageModal.id) {
      const { error } = await supabase.from('crm_stages')
        .update({ nome, cor: stageModal.cor, alerta_dias: alerta }).eq('id', stageModal.id)
      if (!error) setStages(prev => prev.map(s => s.id === stageModal.id ? { ...s, nome, cor: stageModal.cor, alerta_dias: alerta } : s))
      else { alert('Erro: ' + error.message); setSavingStage(false); return }
    } else {
      const targetFunnel = stageModal.funil_id || activeFunnel
      const maxPos = Math.max(-1, ...stages.filter(s => s.funil_id === targetFunnel).map(s => s.posicao ?? 0))
      const { data, error } = await supabase.from('crm_stages')
        .insert({ instancia: instance, funil_id: targetFunnel, nome, cor: stageModal.cor, alerta_dias: alerta, posicao: maxPos + 1 })
        .select().single()
      if (!error && data) {
        setStages(prev => [...prev, data])
        // Veio do painel de um lead → já joga o lead na etapa recém-criada.
        if (stageModal.assignTo) {
          const now = new Date().toISOString()
          await supabase.from('crm_contacts').update({ stage_id: data.id, data_entrada_etapa: now }).eq('id', stageModal.assignTo)
          setContacts(prev => prev.map(c => c.id === stageModal.assignTo ? { ...c, stage_id: data.id, data_entrada_etapa: now } : c))
          if (panel?.id === stageModal.assignTo) setPanel(p => ({ ...p, stage_id: data.id }))
        }
      }
      else { alert('Erro: ' + error.message); setSavingStage(false); return }
    }
    setSavingStage(false)
    setStageModal(null)
  }

  // Troca a posição com a etapa vizinha (mover ← / →)
  async function handleMoveStage(stage, dir) {
    const idx = funStages.findIndex(s => s.id === stage.id)
    const j = idx + dir
    if (j < 0 || j >= funStages.length) return
    const other = funStages[j]
    const a = stage.posicao ?? idx, b = other.posicao ?? j
    setStages(prev => prev.map(s => s.id === stage.id ? { ...s, posicao: b } : s.id === other.id ? { ...s, posicao: a } : s))
    await Promise.all([
      supabase.from('crm_stages').update({ posicao: b }).eq('id', stage.id),
      supabase.from('crm_stages').update({ posicao: a }).eq('id', other.id),
    ])
  }

  // Reordena as etapas arrastando a coluna: tira a etapa "de" e insere na posição
  // da etapa "para", depois renumera a posicao (0..n) e persiste só as que mudaram.
  async function reorderStages(fromId, toId) {
    if (!fromId || fromId === toId) return
    const ordered = funStages.slice() // já ordenado por posicao
    const fromIdx = ordered.findIndex(s => s.id === fromId)
    const toIdx = ordered.findIndex(s => s.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const [moved] = ordered.splice(fromIdx, 1)
    ordered.splice(toIdx, 0, moved)
    const newPos = {}
    ordered.forEach((s, i) => { newPos[s.id] = i })
    const changed = ordered.filter(s => (funStages.find(x => x.id === s.id)?.posicao) !== newPos[s.id])
    if (!changed.length) return
    setStages(prev => prev.map(s => newPos[s.id] !== undefined ? { ...s, posicao: newPos[s.id] } : s))
    const results = await Promise.all(changed.map(s =>
      supabase.from('crm_stages').update({ posicao: newPos[s.id] }).eq('id', s.id)
    ))
    const err = results.find(r => r.error)
    if (err) { alert('Erro ao reordenar as etapas: ' + err.error.message); load() }
  }

  // Exclui a etapa. Se tiver leads, move-os pra primeira etapa restante.
  async function handleDeleteStage(stage) {
    const remaining = funStages.filter(s => s.id !== stage.id)
    const fallback = remaining[0]
    // SEMPRE reatribui pelo banco (não pelo byStage, que é filtrado por busca/temperatura
    // e poderia esconder leads reais → ficariam órfãos apontando pra etapa deletada).
    if (fallback) {
      const now = new Date().toISOString()
      const { error } = await supabase.from('crm_contacts')
        .update({ stage_id: fallback.id, data_entrada_etapa: now })
        .eq('instancia', instance).eq('stage_id', stage.id)
      if (error) { alert('Erro ao mover os leads da etapa: ' + error.message); return }
      setContacts(prev => prev.map(c => c.stage_id === stage.id ? { ...c, stage_id: fallback.id, data_entrada_etapa: now } : c))
    }
    const { error: delErr } = await supabase.from('crm_stages').delete().eq('id', stage.id)
    if (delErr) { alert('Erro ao excluir a etapa: ' + delErr.message); return }
    setStages(prev => prev.filter(s => s.id !== stage.id))
    setConfirmDelStage(null)
    setStageModal(null)
  }

  // ── Funis (quadros de CRM) — criar / renomear / excluir ──────────────────────
  async function handleSaveFunnel() {
    if (!funnelModal || savingFunnel) return
    const nome = (funnelModal.nome || '').trim()
    if (!nome) return
    setSavingFunnel(true)
    if (funnelModal.id) {
      // Renomear
      const { error } = await supabase.from('crm_funnels').update({ nome }).eq('id', funnelModal.id)
      if (error) { alert('Erro: ' + error.message); setSavingFunnel(false); return }
      setFunnels(prev => prev.map(f => f.id === funnelModal.id ? { ...f, nome } : f))
    } else {
      // Criar funil novo + etapas padrão (pra já vir usável)
      const maxPos = Math.max(-1, ...funnels.map(f => f.posicao ?? 0))
      const { data: nf, error } = await supabase.from('crm_funnels')
        .insert({ instancia: instance, nome, posicao: maxPos + 1 }).select().single()
      if (error || !nf) { alert('Erro ao criar funil: ' + (error?.message || '')); setSavingFunnel(false); return }
      const { data: ns } = await supabase.from('crm_stages')
        .insert(DEFAULT_STAGES.map(s => ({ ...s, funil_id: nf.id, instancia: instance }))).select()
      setFunnels(prev => [...prev, nf])
      if (ns) setStages(prev => [...prev, ...ns])
      setActiveFunnel(nf.id)
    }
    setSavingFunnel(false)
    setFunnelModal(null)
  }

  // Exclui um funil. Os leads dele são movidos pro primeiro funil restante (na
  // primeira etapa), pra não virarem órfãos. Bloqueia excluir o último funil.
  async function deleteFunnel(id) {
    if (funnels.length <= 1) { alert('Você precisa ter pelo menos um funil.'); return }
    const target = funnels.find(f => f.id !== id)
    const targetStage = stages.filter(s => s.funil_id === target.id).sort((a,b) => a.posicao - b.posicao)[0]
    const now = new Date().toISOString()
    const { error: mvErr } = await supabase.from('crm_contacts')
      .update({ funil_id: target.id, stage_id: targetStage?.id || null, data_entrada_etapa: now })
      .eq('instancia', instance).eq('funil_id', id)
    if (mvErr) { alert('Erro ao mover os leads: ' + mvErr.message); return }
    const { error: delErr } = await supabase.from('crm_funnels').delete().eq('id', id)
    if (delErr) { alert('Erro ao excluir o funil: ' + delErr.message); return }
    setContacts(prev => prev.map(c => c.funil_id === id
      ? { ...c, funil_id: target.id, stage_id: targetStage?.id || null, data_entrada_etapa: now } : c))
    setStages(prev => prev.filter(s => s.funil_id !== id))
    setFunnels(prev => prev.filter(f => f.id !== id))
    setMemberships(prev => prev.filter(m => m.funil_id !== id)) // vínculos desse funil caem por CASCADE
    if (activeFunnel === id) setActiveFunnel(target.id)
    setConfirmDelFunnel(null)
    setFunnelModal(null)
  }

  // Move um lead pra outro funil (e etapa). Sem stageId → cai na 1ª etapa do
  // destino. Usado pelo menu do card, pelo drag na aba e pelo seletor do painel.
  async function moveContactToFunnel(contactId, funnelId, stageId, { switchTo = false } = {}) {
    const destStages = stages.filter(s => s.funil_id === funnelId).sort((a,b) => a.posicao - b.posicao)
    const toStage = stageId || destStages[0]?.id || null
    const contact = contacts.find(c => c.id === contactId)
    if (!contact) { setMoveMenu(null); return }
    if (contact.funil_id === funnelId && contact.stage_id === toStage) { setMoveMenu(null); return }
    const now = new Date().toISOString()
    const snapshot = contacts
    setContacts(prev => prev.map(c => c.id === contactId
      ? { ...c, funil_id: funnelId, stage_id: toStage, data_entrada_etapa: now } : c))
    setMoveMenu(null)
    if (switchTo) setActiveFunnel(funnelId)
    const { error } = await supabase.from('crm_contacts')
      .update({ funil_id: funnelId, stage_id: toStage, data_entrada_etapa: now }).eq('id', contactId)
    if (error) { setContacts(snapshot); alert('Não consegui mover o lead: ' + error.message); return }
    // Se já existia um vínculo EXTRA nesse funil, remove (agora virou o principal).
    const dupMb = membershipMap[`${contactId}|${funnelId}`]
    if (dupMb) { setMemberships(prev => prev.filter(x => x.id !== dupMb.id)); supabase.from('crm_contact_funnels').delete().eq('id', dupMb.id).then(() => {}) }
    const fromF = funnels.find(f => f.id === contact.funil_id)
    const toF   = funnels.find(f => f.id === funnelId)
    await supabase.from('crm_interactions').insert({
      instancia: instance, phone: contact.phone || '', tipo: 'etapa',
      conteudo: `Movido para o funil "${toF?.nome || '?'}"${fromF ? ` (de "${fromF.nome}")` : ''}`,
      metadata: { fromFunnel: contact.funil_id, toFunnel: funnelId, toStage },
      autor_nome: session?.user?.name || session?.user?.email,
    })
    if (panel?.id === contactId) setPanel(p => ({ ...p, funil_id: funnelId, stage_id: toStage }))
  }

  async function deleteContact(id) {
    // Soft-delete: marca removido em vez de apagar, pra o gatilho de autocriação
    // NÃO trazer o mesmo número de volta como "novo lead". Se a migração ainda não
    // rodou (sem a coluna), cai no delete de verdade (comportamento antigo).
    if (supportsRemovido) {
      await supabase.from('crm_contact_funnels').delete().eq('contact_id', id) // tira dos funis adicionais
      const { error } = await supabase.from('crm_contacts').update({ removido: true, removido_at: new Date().toISOString() }).eq('id', id)
      if (error) { alert('Não consegui remover: ' + error.message); return }
    } else {
      await supabase.from('crm_contacts').delete().eq('id', id)
    }
    setContacts(p => p.filter(c => c.id!==id))
    setMemberships(p => p.filter(m => m.contact_id !== id))
    setConfirmDel(null)
    if (panel?.id === id) setPanel(null)
  }

  async function addNote() {
    if (!panelNote.trim() || !panel) return
    const row = {
      instancia: instance, phone: cleanNum(panel.phone), tipo: 'nota',
      conteudo: panelNote.trim(),
      autor_nome: session?.user?.name || session?.user?.email,
    }
    const { data } = await supabase.from('crm_interactions').insert(row).select().single()
    if (data) {
      const entry = {
        id:`crm-${data.id}`, date: data.created_at, source:'crm', tipo:'nota',
        conteudo: data.conteudo, autor: data.autor_nome,
        meta: { label:'Nota', color:'#7C3AED', bg:'#F5F3FF' },
      }
      setPanelTimeline(p => [entry, ...p])
    }
    setPanelNote('')
  }

  async function saveList() {
    if (!listModal?.nome?.trim()) return
    setSavingList(true)
    if (listModal.id) {
      const { data } = await supabase.from('crm_lists')
        .update({ nome: listModal.nome, filtros: listModal.filtros })
        .eq('id', listModal.id).select().single()
      if (data) { setLists(p => p.map(l => l.id === data.id ? data : l)); setActiveList(data) }
    } else {
      const { data } = await supabase.from('crm_lists')
        .insert({ instancia: instance, nome: listModal.nome, filtros: listModal.filtros })
        .select().single()
      if (data) { setLists(p => [...p, data]); setActiveList(data) }
    }
    setSavingList(false)
    setListModal(null)
  }

  async function deleteList(id) {
    await supabase.from('crm_lists').delete().eq('id', id)
    setLists(p => p.filter(l => l.id !== id))
    if (activeList?.id === id) setActiveList(null)
  }

  function applyListFilter(c, filtros) {
    const f = filtros || {}
    if (f.temperatura && f.temperatura !== 'todos' && c.temperatura !== f.temperatura) return false
    if (f.stage_id && c.stage_id !== f.stage_id) return false
    const dias = daysIn(c.data_entrada_etapa)
    if (f.dias_min && dias < Number(f.dias_min)) return false
    if (f.dias_max && dias > Number(f.dias_max)) return false
    if (f.origem && !(c.origem||'').toLowerCase().includes(f.origem.toLowerCase())) return false
    if (f.tag && !(c.tags||[]).includes(f.tag)) return false
    if (f.responsavel_nome && !(c.responsavel_nome||'').toLowerCase().includes(f.responsavel_nome.toLowerCase())) return false
    if (f.sem_responsavel === true && c.responsavel_id) return false
    return true
  }

  const staleLeads = useMemo(() =>
    contacts.filter(c => {
      const st = stages.find(s => s.id === c.stage_id)
      return st?.alerta_dias && daysIn(c.data_entrada_etapa) > st.alerta_dias
    }).sort((a,b) => daysIn(b.data_entrada_etapa) - daysIn(a.data_entrada_etapa))
  , [contacts, stages])

  const activeListContacts = useMemo(() => {
    if (!activeList) return []
    return contacts.filter(c => applyListFilter(c, activeList.filtros))
  }, [contacts, stages, activeList])

  const totalLeads = filteredContacts.length
  const quentes    = filteredContacts.filter(c => c.temperatura === 'quente').length
  const staleCount = staleLeads.length

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',gap:10,color:C.muted }}>
      <Loader2 size={20} style={{ animation:'spin 1s linear infinite' }} />
      <span style={{ fontSize:14 }}>Carregando CRM...</span>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ height:'calc(100vh - 64px)', display:'flex', flexDirection:'column', overflow:'hidden', background: C.bg, fontFamily:'"Inter",system-ui,sans-serif' }}>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        .crm-card{cursor:grab;transition:box-shadow 0.15s,transform 0.15s}
        .crm-card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.1);transform:translateY(-1px)}
        .crm-card:active{cursor:grabbing}
        .crm-move-btn{opacity:0;transition:opacity 0.12s,background 0.12s}
        .crm-card:hover .crm-move-btn{opacity:1}
        .crm-col-drop{background:rgba(37,99,235,0.06)!important;border-color:#93C5FD!important}
        .crm-btn{transition:all 0.15s}
        .crm-btn:hover{opacity:0.85}
      `}</style>

      {/* Sugestões de origem (padrão + as criadas pela clínica) — usadas nos combos */}
      <datalist id="crm-origem-list">
        {origemOptions.map(o => <option key={o} value={o} />)}
      </datalist>

      {/* ── Top Bar ── */}
      <div style={{ background: C.card, borderBottom:`1px solid ${C.border}`, padding:'12px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:32,height:32,borderRadius:9,background:C.navy,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <GitMerge size={15} color="#fff"/>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:C.navy, lineHeight:1 }}>CRM</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>Pipeline de pacientes</div>
          </div>
        </div>

        {/* Funis (quadros) — trocar, criar, e ALVO de arrasto: solte um card aqui
            pra movê-lo pra esse funil (cai na 1ª etapa e abre o funil). */}
        <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:8, flexWrap:'wrap' }}>
          {funnels.map(f => {
            const isActive = activeFunnel === f.id
            const isTarget = dragFunnel === f.id
            return (
              <button key={f.id}
                onClick={() => setActiveFunnel(f.id)}
                onDragOver={e => {
                  if (dragging && !draggingStage) {
                    e.preventDefault(); e.dataTransfer.dropEffect='move'; setDragFunnel(f.id)
                    // spring-load: pairou sobre a aba de outro funil → abre esse funil
                    // pra você soltar o card na etapa que quiser.
                    if (activeFunnel !== f.id && springRef.current.funnelId !== f.id) {
                      clearSpring()
                      springRef.current = { funnelId: f.id, timer: setTimeout(() => { setActiveFunnel(f.id); setDragFunnel(null); springRef.current = { funnelId: null, timer: null } }, 600) }
                    }
                  }
                }}
                onDragLeave={() => { setDragFunnel(cur => cur === f.id ? null : cur); if (springRef.current.funnelId === f.id) clearSpring() }}
                onDrop={e => {
                  e.preventDefault(); setDragFunnel(null); clearSpring()
                  // Se o funil já abriu (spring), o card cai no funil ativo → aqui só
                  // move quando soltou na aba ANTES de abrir (atalho: 1ª etapa).
                  if (dragging && !draggingStage && activeFunnel !== f.id) { const cid = dragging.id; setDragging(null); moveContactToFunnel(cid, f.id, null, { switchTo:true }) }
                }}
                className="crm-btn" title={isActive ? 'Renomear no lápis' : `Ver funil "${f.nome}"`}
                style={{
                  padding:'5px 10px 5px 12px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
                  display:'inline-flex', alignItems:'center', gap:6,
                  background: isTarget ? '#DBEAFE' : isActive ? C.navy : 'transparent',
                  color: isTarget ? C.blue : isActive ? '#fff' : C.slate,
                  border: `1px solid ${isTarget ? C.blue : isActive ? C.navy : C.border}`,
                  boxShadow: isTarget ? '0 0 0 2px rgba(37,99,235,0.25)' : 'none',
                  transition:'all 0.12s',
                }}>
                <span style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.nome}</span>
                {isActive && (
                  <span onClick={e => { e.stopPropagation(); setFunnelModal({ id:f.id, nome:f.nome }) }}
                    title="Renomear / excluir funil"
                    style={{ display:'inline-flex', alignItems:'center', marginLeft:-1, opacity:0.85, cursor:'pointer' }}>
                    <Edit2 size={11}/>
                  </span>
                )}
              </button>
            )
          })}
          <button onClick={() => setFunnelModal({ id:null, nome:'' })} title="Novo funil de CRM"
            className="crm-btn" style={{
              width:26, height:26, borderRadius:8, cursor:'pointer', flexShrink:0,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              background:'transparent', color:C.muted, border:`1px dashed ${C.border}`,
            }}>
            <Plus size={13}/>
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ display:'flex', gap:16, marginLeft:8 }}>
          {[
            { v: totalLeads, l: 'leads',   c: C.blue },
            { v: quentes,    l: '🔥 quentes', c: '#DC2626' },
            { v: staleCount, l: '⚠️ parados', c: '#D97706' },
          ].map(s => (
            <div key={s.l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:s.c, lineHeight:1 }}>{s.v}</div>
              <div style={{ fontSize:9, color:C.muted, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Atalho: criar/gerenciar temperaturas (mesmo do "+" no painel do lead) */}
        <button onClick={() => setTempModal(tempModal ? null : { nome:'', cor: STAGE_COLORS[0] })}
          className="crm-btn" title="Criar / gerenciar temperaturas"
          style={{ display:'inline-flex', alignItems:'center', gap:5, marginLeft:10, padding:'6px 11px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', border:`1px solid ${tempModal ? '#2563EB' : C.border}`, background: tempModal ? '#EFF6FF' : 'transparent', color: tempModal ? C.blue : C.slate }}>
          <Thermometer size={13} /> Temperaturas
        </button>

        <div style={{ flex:1 }} />

        {/* View switcher */}
        <div style={{ display:'flex', gap:2, background:C.bg, borderRadius:10, padding:3 }}>
          {[
            { id:'board',   label:'Board',   Icon:Kanban },
            { id:'alertas', label:`Alertas${staleLeads.length ? ` (${staleLeads.length})` : ''}`, Icon:AlertTriangle, warn: staleLeads.length > 0 },
            { id:'listas',  label:'Listas',  Icon:BookMarked },
          ].map(v => (
            <button key={v.id} onClick={() => setActiveView(v.id)} style={{
              display:'flex', alignItems:'center', gap:5, padding:'5px 11px',
              borderRadius:8, border:'none', cursor:'pointer', fontSize:11, fontWeight:700,
              background: activeView === v.id ? C.card : 'transparent',
              color: activeView === v.id ? C.navy : v.warn ? '#D97706' : C.muted,
              boxShadow: activeView === v.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition:'all 0.15s',
            }}>
              <v.Icon size={11}/> {v.label}
            </button>
          ))}
        </div>

        {activeView === 'board' && <>
          {/* Search */}
          <div style={{ position:'relative' }}>
            <Search size={12} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:C.muted, pointerEvents:'none' }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar lead..."
              style={{ paddingLeft:28, paddingRight:10, height:32, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, outline:'none', width:160, background:C.card, color:C.navy }}/>
          </div>

          {/* Temp filter */}
          <select value={filterTemp} onChange={e=>setFilterTemp(e.target.value)}
            style={{ height:32, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, padding:'0 10px', background:C.card, color:C.navy, outline:'none', cursor:'pointer' }}>
            <option value="todos">Todos</option>
            {tempList.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
          </select>
        </>}

        <button onClick={() => { setNewForm({ nome:'', phone:'', email:'', origem:'', temperatura:'morno', stage_id: funStages[0]?.id||'', observacoes:'' }); setNewModal(true) }}
          className="crm-btn" style={{ display:'flex', alignItems:'center', gap:6, padding:'0 14px', height:32, borderRadius:8, background:C.navy, color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:700 }}>
          <UserPlus size={13}/> Novo Lead
        </button>
      </div>

      {/* ── Alertas View ── */}
      {activeView === 'alertas' && (
        <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
          <div style={{ maxWidth:900, margin:'0 auto' }}>
            {staleLeads.length === 0 ? (
              <div style={{ textAlign:'center', padding:'4rem', color:C.muted }}>
                <Check size={40} style={{ marginBottom:12, color:'#059669', opacity:.5 }}/>
                <div style={{ fontSize:15, fontWeight:700, color:C.navy }}>Nenhum lead parado</div>
                <div style={{ fontSize:12, marginTop:4 }}>Todos os leads estão dentro do prazo de cada etapa.</div>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <AlertTriangle size={16} color="#D97706"/>
                  <span style={{ fontWeight:800, fontSize:14, color:C.navy }}>Leads parados além do limite</span>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#FFFBEB', color:'#D97706', fontWeight:700, border:'1px solid #FDE68A' }}>{staleLeads.length}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {staleLeads.map(c => {
                    const stage = stages.find(s => s.id === c.stage_id)
                    const days = daysIn(c.data_entrada_etapa)
                    const over = stage?.alerta_dias ? days - stage.alerta_dias : 0
                    const temp = tempOf(c.temperatura)
                    return (
                      <div key={c.id} onClick={() => setPanel(c)}
                        style={{ background:C.card, border:'1.5px solid #FDE68A', borderLeft:'4px solid #D97706', borderRadius:10, padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:14, transition:'box-shadow 0.15s' }}
                        onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'}
                        onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                        <div style={{ width:38,height:38,borderRadius:'50%',background:stage?.cor||C.slate,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:14,flexShrink:0 }}>
                          {resolveInitials(c)}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>{resolveName(c)}</div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                            {stage?.nome} · {temp.icon} {temp.label}
                            {c.responsavel_nome && <span> · {c.responsavel_nome}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontWeight:800, fontSize:18, color:'#DC2626', lineHeight:1 }}>{days}d</div>
                          <div style={{ fontSize:9.5, color:'#D97706', fontWeight:700 }}>+{over}d acima do limite</div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                            style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:8,background:'#ECFDF5',border:'1px solid #BBF7D0',color:'#059669',cursor:'pointer',textDecoration:'none' }}>
                            <Phone size={12}/>
                          </a>
                          <button onClick={e=>{e.stopPropagation();setPanel(c)}}
                            style={{ display:'flex',alignItems:'center',justifyContent:'center',width:30,height:30,borderRadius:8,background:C.bg,border:`1px solid ${C.border}`,color:C.slate,cursor:'pointer' }}>
                            <ChevronRight size={12}/>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Listas View ── */}
      {activeView === 'listas' && (
        <div style={{ flex:1, overflow:'hidden', display:'flex' }}>
          {/* Sidebar: saved lists */}
          <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${C.border}`, background:C.card, display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ fontWeight:800, fontSize:12, color:C.navy, marginBottom:10 }}>Listas salvas</div>
              <button onClick={() => setListModal({ nome:'', filtros:{ temperatura:'todos', stage_id:'', dias_min:'', dias_max:'', origem:'', tag:'', sem_responsavel:false } })}
                style={{ display:'flex',alignItems:'center',gap:6,width:'100%',padding:'7px 10px',borderRadius:8,border:`1.5px dashed ${C.border}`,background:'transparent',color:C.muted,cursor:'pointer',fontSize:11,fontWeight:600 }}>
                <Plus size={11}/> Nova lista
              </button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'8px' }}>
              {lists.length === 0 && (
                <div style={{ fontSize:11, color:C.muted, textAlign:'center', padding:'2rem 1rem', lineHeight:1.6 }}>
                  Crie listas com filtros para segmentar seus leads.
                </div>
              )}
              {lists.map(l => {
                const cnt = contacts.filter(c => applyListFilter(c, l.filtros)).length
                return (
                  <div key={l.id}
                    style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', marginBottom:2, display:'flex', alignItems:'center', gap:8,
                      background: activeList?.id === l.id ? '#EFF6FF' : 'transparent',
                      border: `1px solid ${activeList?.id === l.id ? '#BFDBFE' : 'transparent'}`,
                    }}
                    onClick={() => setActiveList(l)}>
                    <Filter size={11} color={activeList?.id === l.id ? C.blue : C.muted}/>
                    <span style={{ flex:1, fontSize:12, fontWeight:600, color: activeList?.id === l.id ? C.blue : C.navy, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.nome}</span>
                    <span style={{ fontSize:10, fontWeight:700, color: activeList?.id === l.id ? C.blue : C.muted, background: activeList?.id === l.id ? '#DBEAFE' : C.bg, padding:'1px 6px', borderRadius:10 }}>{cnt}</span>
                  </div>
                )
              })}
            </div>

            {/* Automações rápidas */}
            <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}` }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Automações</div>
              <div style={{ fontSize:11, color:C.slate, display:'flex', alignItems:'center', gap:6, padding:'5px 0' }}>
                <Zap size={11} color="#D97706"/>
                <span>Agenda → "Agendou"</span>
                <span style={{ marginLeft:'auto', fontSize:9.5, padding:'2px 6px', borderRadius:10, background:'#ECFDF5', color:'#059669', fontWeight:700 }}>Ativo</span>
              </div>
            </div>
          </div>

          {/* Main: filter builder + results */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
            {!activeList ? (
              <div style={{ textAlign:'center', padding:'4rem', color:C.muted }}>
                <Filter size={40} style={{ marginBottom:12, opacity:.3 }}/>
                <div style={{ fontSize:14, fontWeight:700, color:C.navy }}>Selecione ou crie uma lista</div>
                <div style={{ fontSize:12, marginTop:4 }}>Listas filtram seus leads por critérios salvos.</div>
              </div>
            ) : (
              <div style={{ maxWidth:860, margin:'0 auto' }}>
                {/* List header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                  <Filter size={15} color={C.blue}/>
                  <span style={{ fontWeight:800, fontSize:16, color:C.navy }}>{activeList.nome}</span>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:C.blueDim, color:C.blue, fontWeight:700 }}>{activeListContacts.length} leads</span>
                  <div style={{ flex:1 }}/>
                  <button onClick={() => setListModal({ ...activeList })} style={{ padding:'5px 12px', borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.slate, cursor:'pointer', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                    <Edit2 size={11}/> Editar filtros
                  </button>
                  <button onClick={() => { if(confirm('Apagar lista?')) deleteList(activeList.id) }} style={{ padding:'5px 10px', borderRadius:8, border:'1px solid #FECACA', background:'#FFF1F2', color:'#DC2626', cursor:'pointer', fontSize:11 }}>
                    <Trash2 size={11}/>
                  </button>
                </div>

                {/* Filter pills */}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                  {Object.entries(activeList.filtros||{}).map(([k,v]) => {
                    if (!v || v === 'todos' || v === '') return null
                    const labels = { temperatura:'Temp', stage_id:'Etapa', dias_min:'Mín dias', dias_max:'Máx dias', origem:'Origem', tag:'Tag', responsavel_nome:'Responsável', sem_responsavel:'Sem responsável' }
                    const stage = k === 'stage_id' ? stages.find(s=>s.id===v) : null
                    const display = stage?.nome || (k==='sem_responsavel'?'Sem responsável':String(v))
                    return (
                      <span key={k} style={{ fontSize:10.5, padding:'3px 10px', borderRadius:20, background:C.blueDim, color:C.blue, fontWeight:700, border:'1px solid #BFDBFE' }}>
                        {labels[k]||k}: {display}
                      </span>
                    )
                  })}
                </div>

                {/* Results */}
                {activeListContacts.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'3rem', color:C.muted, fontSize:12 }}>Nenhum lead corresponde a esses filtros.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {activeListContacts.map(c => {
                      const stage = stages.find(s => s.id === c.stage_id)
                      const temp = tempOf(c.temperatura)
                      const days = daysIn(c.data_entrada_etapa)
                      return (
                        <div key={c.id} onClick={() => setPanel(c)}
                          style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12, transition:'all 0.15s' }}
                          onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 4px 14px rgba(0,0,0,0.07)';e.currentTarget.style.borderColor='#BFDBFE'}}
                          onMouseLeave={e=>{e.currentTarget.style.boxShadow='none';e.currentTarget.style.borderColor=C.border}}>
                          <div style={{ width:36,height:36,borderRadius:'50%',background:stage?.cor||C.slate,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:13,flexShrink:0 }}>
                            {resolveInitials(c)}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{resolveName(c)}</div>
                            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                              {stage?.nome||'—'} · {temp.icon} {temp.label} · {days}d
                              {c.responsavel_nome && <> · {c.responsavel_nome}</>}
                            </div>
                          </div>
                          {(c.tags||[]).slice(0,2).map(t => (
                            <span key={t} style={{ fontSize:10, padding:'2px 7px', borderRadius:20, background:C.bg, color:C.slate }}>{t}</span>
                          ))}
                          <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                            style={{ display:'flex',alignItems:'center',justifyContent:'center',width:28,height:28,borderRadius:8,background:'#ECFDF5',border:'1px solid #BBF7D0',color:'#059669',textDecoration:'none' }}>
                            <Phone size={11}/>
                          </a>
                          <ChevronRight size={13} color={C.muted}/>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pipeline Board ── */}
      {activeView === 'board' && <div style={{ flex:1, overflowX:'auto', overflowY:'hidden', display:'flex', gap:12, padding:'16px 20px', alignItems:'flex-start' }}>
        {funStages.map(stage => {
          const cards = byStage[stage.id] || []
          const isOver = dragOver === stage.id
          const stageTotal = cards.length

          return (
            <div key={stage.id}
              onDragOver={e => onDragOver(e, stage.id)}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => onDrop(e, stage.id)}
              className={isOver ? 'crm-col-drop' : ''}
              style={{
                width: 272, flexShrink:0, display:'flex', flexDirection:'column',
                background: isOver ? 'rgba(37,99,235,0.05)' : C.card,
                border: `1.5px solid ${isOver ? '#93C5FD' : C.border}`,
                borderRadius:14, overflow:'hidden', maxHeight:'100%', transition:'all 0.15s',
                opacity: draggingStage?.id === stage.id ? 0.4 : 1,
              }}>

              {/* Column header — arraste pra reordenar a etapa (igual bloco de kanban) */}
              <div
                draggable
                onDragStart={e => { setDraggingStage(stage); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', stage.id) } catch (_) {} }}
                onDragEnd={() => setDraggingStage(null)}
                title="Arraste para reordenar a etapa"
                style={{ padding:'12px 14px 10px', borderBottom:`1px solid ${C.border}`, background:C.card, flexShrink:0, cursor:'grab' }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <GripVertical size={13} color={C.muted} style={{ flexShrink:0, marginLeft:-3 }}/>
                  <div style={{ width:10,height:10,borderRadius:'50%',background:stage.cor,flexShrink:0 }}/>
                  <span style={{ fontWeight:700, fontSize:12.5, color:C.navy, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stage.nome}</span>
                  <button onClick={() => openStageModal(stage)} title="Editar etapa"
                    className="crm-stage-edit"
                    style={{ background:'none', border:'none', cursor:'pointer', color:C.muted, padding:2, display:'inline-flex', flexShrink:0 }}>
                    <Edit2 size={12}/>
                  </button>
                  <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:stage.cor, borderRadius:20, padding:'1px 8px', minWidth:20, textAlign:'center', flexShrink:0 }}>{stageTotal}</span>
                </div>
                {stage.alerta_dias && (
                  <div style={{ fontSize:9.5, color:C.muted, marginTop:4, paddingLeft:18 }}>alerta após {stage.alerta_dias}d</div>
                )}
              </div>

              {/* Cards */}
              <div style={{ flex:1, overflowY:'auto', padding:'8px', display:'flex', flexDirection:'column', gap:7 }}>
                {cards.map(contact => {
                  const days = daysIn(contact.data_entrada_etapa)
                  const stale = stage.alerta_dias && days > stage.alerta_dias
                  const temp = tempOf(contact.temperatura)
                  const initStr = resolveInitials(contact)
                  const origemColor = ORIGEM_COLORS[contact.origem] || '#6B7280'

                  return (
                    <div key={contact.id}
                      draggable
                      onDragStart={e => onDragStart(e, contact)}
                      onDragEnd={() => { setDragging(null); clearSpring() }}
                      onClick={() => setPanel(contact)}
                      onContextMenu={e => {
                        // Botão direito no card → mesmo menu "mover para funil", no cursor.
                        if (funnels.length <= 1) return
                        e.preventDefault()
                        setMoveMenu({ contactId: contact.id, funnelPick: null, x: e.clientX, y: e.clientY, anchor: 'left' })
                      }}
                      className="crm-card"
                      style={{
                        position:'relative',
                        background: stale ? '#FFFBEB' : C.card,
                        border: `1px solid ${stale ? '#FDE68A' : C.border}`,
                        borderRadius:10, padding:'10px 12px',
                        opacity: dragging?.id === contact.id ? 0.4 : 1,
                      }}>

                      {/* Menu "mover para funil" (aparece no hover do card) */}
                      {funnels.length > 1 && (
                        <button className="crm-move-btn"
                          title="Mover para outro funil"
                          onClick={e => {
                            e.stopPropagation()
                            const r = e.currentTarget.getBoundingClientRect()
                            setMoveMenu(cur => cur?.contactId === contact.id ? null : { contactId: contact.id, funnelPick: null, x: r.right, y: r.bottom, anchor: 'right' })
                          }}
                          style={{ position:'absolute', top:5, right:6, width:22, height:22, borderRadius:6, border:`1px solid ${C.border}`, background:C.card, color:C.slate, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', zIndex:2 }}
                          onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                          onMouseLeave={e=>e.currentTarget.style.background=C.card}>
                          <MoreHorizontal size={13}/>
                        </button>
                      )}

                      <div style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
                        {/* Avatar */}
                        <div style={{
                          width:34,height:34,borderRadius:'50%',flexShrink:0,
                          background:`linear-gradient(135deg, ${stage.cor}22, ${stage.cor}44)`,
                          border:`1.5px solid ${stage.cor}66`,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:11,fontWeight:800,color:stage.cor,
                        }}>{initStr}</div>

                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, fontSize:12.5, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {resolveName(contact)}
                          </div>
                          {resolveName(contact) !== fmtPhone(contact.phone) && (
                            <div style={{ fontSize:10.5, color:C.muted, marginTop:1 }}>{fmtPhone(contact.phone)}</div>
                          )}
                        </div>

                        {/* Temperature dot */}
                        <div title={temp.label} style={{ width:8,height:8,borderRadius:'50%',background:temp.dot,flexShrink:0,marginTop:3 }}/>
                      </div>

                      {/* Origem + etiquetas coloridas */}
                      {(() => {
                        const etiquetas = tagsOf(normPhone(contact.phone))
                        if (!contact.origem && etiquetas.length === 0 && (contact.tags||[]).length === 0) return null
                        return (
                          <div style={{ display:'flex', gap:5, marginTop:8, flexWrap:'wrap', alignItems:'center' }}>
                            {contact.origem && (
                              <span style={{ fontSize:9.5, fontWeight:700, padding:'2px 7px', borderRadius:20, background:origemColor+'18', color:origemColor }}>
                                {contact.origem}
                              </span>
                            )}
                            <TagList tags={etiquetas} max={3} />
                            {(contact.tags||[]).slice(0,2).map(t => (
                              <span key={t} style={{ fontSize:9.5, padding:'2px 6px', borderRadius:20, background:'#F1F5F9', color:C.slate }}>{t}</span>
                            ))}
                          </div>
                        )
                      })()}

                      {/* Footer */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color: stale ? '#D97706' : C.muted }}>
                          {stale ? <AlertTriangle size={10} color="#D97706"/> : <Clock size={10}/>}
                          {days === 0 ? 'hoje' : `${days}d nesta etapa`}
                        </div>
                        {contact.data_ult_contato && (
                          <div style={{ fontSize:9.5, color:C.muted }}>
                            último: {relTime(contact.data_ult_contato)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Add card button */}
                <button onClick={() => { setNewForm(p => ({...p, stage_id: stage.id})); setNewModal(true) }}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', border:`1.5px dashed ${C.border}`, borderRadius:9, background:'transparent', color:C.muted, cursor:'pointer', fontSize:11, width:'100%', transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=stage.cor;e.currentTarget.style.color=stage.cor}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted}}>
                  <Plus size={12}/> Adicionar lead
                </button>
              </div>
            </div>
          )
        })}

        {/* Coluna: adicionar nova etapa */}
        <button onClick={() => openStageModal(null)}
          style={{ width:200, flexShrink:0, alignSelf:'flex-start', border:`1.5px dashed ${C.border}`, borderRadius:14, background:'transparent', color:C.muted, cursor:'pointer', padding:'16px 14px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12.5, fontWeight:700, transition:'all 0.15s' }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;e.currentTarget.style.color=C.blue}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted}}>
          <Plus size={14}/> Nova etapa
        </button>
      </div>}

      {/* ── Menu "mover para funil" (aberto pelo botão ⋯ do card) ── */}
      {moveMenu && (() => {
        const mc = contacts.find(c => c.id === moveMenu.contactId)
        if (!mc) return null
        const others = funnels.filter(f => f.id !== (mc.funil_id || activeFunnel))
        const W = 220
        // anchor 'left' = abre à direita/abaixo do cursor (botão direito);
        // 'right' = alinha a borda direita no ponto (botão ⋯ do canto do card).
        const rawLeft = moveMenu.anchor === 'left' ? (moveMenu.x || 0) : ((moveMenu.x || 0) - W)
        const left = Math.max(8, Math.min(rawLeft, window.innerWidth - W - 8))
        const top  = Math.max(8, Math.min((moveMenu.y || 0) + (moveMenu.anchor === 'left' ? 2 : 6), window.innerHeight - 330))
        return (
          <>
            <div onClick={() => setMoveMenu(null)} style={{ position:'fixed', inset:0, zIndex:300 }} />
            <div style={{ position:'fixed', left, top, width:W, zIndex:301, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:'0 12px 36px rgba(0,0,0,0.18)', padding:6, maxHeight:322, overflowY:'auto' }}>
              <div style={{ fontSize:9.5, fontWeight:800, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em', padding:'5px 8px 7px' }}>Mover para funil</div>
              {others.length === 0 ? (
                <div style={{ fontSize:11, color:C.muted, padding:'4px 8px 8px', lineHeight:1.5 }}>Crie outro funil no <strong>+</strong> lá em cima pra poder mover.</div>
              ) : others.map(f => {
                const fStages = stages.filter(s => s.funil_id === f.id).sort((a,b) => a.posicao - b.posicao)
                const expanded = moveMenu.funnelPick === f.id
                return (
                  <div key={f.id}>
                    <button onClick={() => setMoveMenu(m => ({ ...m, funnelPick: expanded ? null : f.id }))}
                      style={{ display:'flex', alignItems:'center', gap:7, width:'100%', padding:'8px', border:'none', background: expanded ? C.bg : 'transparent', borderRadius:8, cursor:'pointer', fontSize:12.5, fontWeight:700, color:C.navy, textAlign:'left' }}>
                      <GitMerge size={13} color={C.slate}/>
                      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.nome}</span>
                      <ChevronRight size={13} color={C.muted} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}/>
                    </button>
                    {expanded && (
                      <div style={{ padding:'2px 0 6px 8px', display:'flex', flexDirection:'column', gap:1 }}>
                        {fStages.length === 0 && <div style={{ fontSize:10.5, color:C.muted, padding:'4px 8px' }}>Esse funil não tem etapas.</div>}
                        {fStages.map(s => (
                          <button key={s.id} onClick={() => moveContactToFunnel(mc.id, f.id, s.id)}
                            style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', border:'none', background:'transparent', borderRadius:7, cursor:'pointer', fontSize:12, color:C.slate, textAlign:'left', width:'100%' }}
                            onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <span style={{ width:8, height:8, borderRadius:'50%', background:s.cor, flexShrink:0 }}/>
                            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.nome}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )
      })()}

      {/* ── Side Panel ── */}
      {panel && (() => {
        const c = contacts.find(x => x.id === panel.id) || panel
        const stage = stages.find(s => s.id === c.stage_id)
        const temp = tempOf(c.temperatura)
        // Etapas do funil DO CONTATO (não do funil ativo) — pro seletor de etapa
        // funcionar mesmo quando o lead aberto está em outro funil (Alertas/Listas).
        const panelStages = stages.filter(s => s.funil_id === (c.funil_id || activeFunnel)).sort((a,b) => a.posicao - b.posicao)

        return (
          <div style={{
            position:'fixed', top:0, right:0, bottom:0, width:400,
            background:C.card, borderLeft:`1px solid ${C.border}`,
            display:'flex', flexDirection:'column', zIndex:50,
            animation:'slideIn 0.2s ease',
            boxShadow:'-8px 0 32px rgba(0,0,0,0.08)',
          }}>

            {/* Panel header */}
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
              <div style={{
                width:44,height:44,borderRadius:'50%',
                background:`linear-gradient(135deg,${stage?.cor||'#6B7280'}22,${stage?.cor||'#6B7280'}55)`,
                border:`2px solid ${stage?.cor||'#6B7280'}66`,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:15,fontWeight:800,color:stage?.cor||C.slate,flexShrink:0,
              }}>{resolveInitials(c)}</div>

              <div style={{ flex:1, minWidth:0 }}>
                {editingName ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onBlur={() => { const v = nameDraft.trim(); if (v !== (c.nome || '')) patchContact(c.id, { nome: v || null }); setEditingName(false) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { const v = nameDraft.trim(); if (v !== (c.nome || '')) patchContact(c.id, { nome: v || null }); setEditingName(false) }
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                    placeholder="Nome do lead"
                    style={{ width:'100%', border:`1px solid #93C5FD`, borderRadius:7, padding:'5px 9px', fontSize:14, fontWeight:700, color:C.navy, background:'#EFF6FF', outline:'none', boxSizing:'border-box' }}
                  />
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ fontWeight:800, fontSize:15, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {resolveName(c)}
                    </div>
                    <button
                      onClick={() => { setNameDraft(c.nome || bestName(c) || ''); setEditingName(true) }}
                      title="Editar o nome do lead"
                      style={{ background:'none', border:'none', cursor:'pointer', padding:2, color:C.muted, flexShrink:0, display:'inline-flex' }}
                    >
                      <Edit2 size={13}/>
                    </button>
                  </div>
                )}
                {resolveName(c) !== fmtPhone(c.phone) && <div style={{ fontSize:11.5, color:C.muted }}>{fmtPhone(c.phone)}</div>}
              </div>

              <button onClick={() => setPanel(null)} style={{ width:28,height:28,borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted }}>
                <X size={14}/>
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:16 }}>

              {/* Temperatura (3 padrões + personalizadas) */}
              <div style={{ background:C.bg, borderRadius:10, padding:'10px 12px' }}>
                <div style={{ fontSize:9.5,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6 }}>Temperatura</div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                  {tempList.map(t => {
                    const on = c.temperatura === t.key
                    return (
                      <button key={t.key} onClick={() => patchContact(c.id, { temperatura: t.key })}
                        style={{ padding:'5px 9px', borderRadius:6, border:`1.5px solid ${on ? t.color : C.border}`, background:on ? t.bg : 'transparent', cursor:'pointer', fontSize:11.5, fontWeight:700, color:on ? t.color : C.muted, transition:'all 0.15s', display:'inline-flex', alignItems:'center', gap:4 }}>
                        {t.custom ? <span style={{ width:8, height:8, borderRadius:'50%', background:t.color, display:'inline-block' }} /> : t.icon} {t.label}
                      </button>
                    )
                  })}
                  <button onClick={() => setTempModal(tempModal ? null : { nome:'', cor: STAGE_COLORS[0] })} title="Criar/gerenciar temperaturas"
                    style={{ width:26, height:26, borderRadius:6, border:`1px dashed ${C.border}`, background:'transparent', color:C.muted, cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* Funis & etapas — o MESMO lead pode aparecer em vários funis, etapa própria em cada */}
              <div style={{ background:C.bg, borderRadius:10, padding:'10px 12px' }}>
                <div style={{ fontSize:9.5,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8 }}>Funis &amp; etapas</div>
                <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                  {funnels.filter(f => funnelsSetOf(c).has(f.id)).map(f => {
                    const isPrim = f.id === primaryFunnelOf(c)
                    const fStages = stages.filter(s => s.funil_id === f.id).sort((a,b)=>(a.posicao??0)-(b.posicao??0))
                    const curStage = stageInFunnel(c, f.id)
                    const mb = membershipMap[`${c.id}|${f.id}`]
                    return (
                      <div key={f.id} style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11.5, fontWeight:700, color:C.navy, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {f.nome} {isPrim && <span style={{ fontSize:9, fontWeight:700, color:C.muted }}>(principal)</span>}
                          </div>
                          <select value={curStage||''} onChange={e => {
                              if (e.target.value === '__new__') { if (isPrim) openStageModal(null, { funilId: f.id, assignTo: c.id }); return }
                              setStageInFunnel(c, f.id, e.target.value)
                            }}
                            style={{ width:'100%', border:'none', background:'transparent', fontSize:12, fontWeight:600, color:C.slate, cursor:'pointer', outline:'none', padding:'2px 0' }}>
                            {fStages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                            {isPrim && <option value="__new__">➕ Nova etapa…</option>}
                          </select>
                        </div>
                        {!isPrim && mb && (
                          <button onClick={() => removeMembership(mb)} title="Tirar deste funil"
                            style={{ width:26, height:26, borderRadius:7, border:'1px solid #FECACA', background:'#FFF1F2', color:'#DC2626', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <X size={13}/>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {(() => {
                  const avail = funnels.filter(f => !funnelsSetOf(c).has(f.id))
                  if (!avail.length) return null
                  return (
                    <select value="" onChange={e => { if (e.target.value) addMembership(c.id, e.target.value) }}
                      style={{ marginTop:9, width:'100%', border:`1px dashed ${C.border}`, borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, color:C.blue, cursor:'pointer', outline:'none', padding:'7px 8px' }}>
                      <option value="">➕ Aparecer em outro funil…</option>
                      {avail.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  )
                })()}
              </div>

              {/* Editable fields */}
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <PanelField label="Nome" value={c.nome||''} onSave={v => patchContact(c.id,{nome:v})} placeholder="Nome do paciente"/>
                <PanelField label="Telefone" value={c.phone||''} onSave={v => patchContact(c.id,{phone:v.replace(/\D/g,'')})} placeholder="55119..."/>
                <PanelField label="E-mail" value={c.email||''} onSave={v => patchContact(c.id,{email:v})} placeholder="email@exemplo.com"/>

                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Origem</div>
                  <ComboField
                    value={c.origem || ''}
                    listId="crm-origem-list"
                    placeholder="Escolha ou digite (ex: Eventos)"
                    onSave={v => patchContact(c.id, { origem: v || null })}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',boxSizing:'border-box' }}
                  />
                  <div style={{ fontSize:10,color:C.muted,marginTop:4 }}>Pode criar uma origem nova — ela vira sugestão pros próximos.</div>
                </div>

                {/* Etiquetas coloridas — as mesmas das Conversas */}
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:6 }}>
                    <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em' }}>Etiquetas</div>
                    <TagPicker instancia={instance} numero={normPhone(c.phone)} userEmail={session?.user?.email} anchor="bottom-right" />
                  </div>
                  {tagsOf(normPhone(c.phone)).length > 0
                    ? <TagList tags={tagsOf(normPhone(c.phone))} />
                    : <div style={{ fontSize:11.5, color:C.muted }}>Nenhuma etiqueta ainda — clique em "Etiquetas" pra adicionar.</div>}
                </div>

                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Tags</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:5 }}>
                    {(c.tags||[]).map(t => (
                      <span key={t} style={{ display:'flex',alignItems:'center',gap:4,fontSize:10,padding:'3px 8px',borderRadius:20,background:'#F1F5F9',color:C.slate,border:`1px solid ${C.border}` }}>
                        {t}
                        <button onClick={() => patchContact(c.id,{tags:(c.tags||[]).filter(x=>x!==t)})} style={{ border:'none',background:'none',cursor:'pointer',color:C.muted,padding:0,lineHeight:1 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <form onSubmit={e=>{e.preventDefault();const v=e.target.tag.value.trim();if(v&&!(c.tags||[]).includes(v)){patchContact(c.id,{tags:[...(c.tags||[]),v]});e.target.tag.value=''}}}>
                    <input name="tag" placeholder="+ adicionar tag" style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',fontSize:11,color:C.navy,background:C.card,outline:'none' }}/>
                  </form>
                </div>

                {/* Responsável */}
                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Responsável</div>
                  <select value={c.responsavel_id||''} onChange={e => {
                    const u = users.find(x => x.id === e.target.value)
                    patchContact(c.id,{responsavel_id: e.target.value||null, responsavel_nome: u?.name||u?.email||null})
                  }}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',cursor:'pointer' }}>
                    <option value="">— sem responsável —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name||u.email}</option>)}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Observações</div>
                  <textarea value={c.observacoes||''} onChange={e => patchContact(c.id,{observacoes:e.target.value})}
                    placeholder="Anotações sobre este lead..." rows={3}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:7,padding:'7px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',resize:'vertical',boxSizing:'border-box' }}/>
                </div>

                {/* Motivo de perda (só se estiver na etapa "Perdido") */}
                {stage?.nome?.toLowerCase().includes('perdido') && (
                  <div>
                    <div style={{ fontSize:10,fontWeight:700,color:'#DC2626',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:5 }}>Motivo de perda</div>
                    <select value={c.motivo_perda||''} onChange={e=>patchContact(c.id,{motivo_perda:e.target.value})}
                      style={{ width:'100%',border:`1px solid #FECACA`,borderRadius:7,padding:'6px 10px',fontSize:12,color:'#DC2626',background:'#FFF1F2',outline:'none',cursor:'pointer' }}>
                      <option value="">— selecionar —</option>
                      {['Preço','Não respondeu','Concorrência','Sem interesse','Sem encaixe na agenda','Outro'].map(m=><option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Add note */}
              <div>
                <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8 }}>Adicionar nota</div>
                <div style={{ display:'flex', gap:7 }}>
                  <textarea value={panelNote} onChange={e=>setPanelNote(e.target.value)} placeholder="Nota rápida..." rows={2}
                    style={{ flex:1,border:`1px solid ${C.border}`,borderRadius:8,padding:'7px 10px',fontSize:12,color:C.navy,background:C.card,outline:'none',resize:'none' }}/>
                  <button onClick={addNote} disabled={!panelNote.trim()}
                    style={{ width:36,height:36,borderRadius:8,background:C.navy,color:'#fff',border:'none',cursor:panelNote.trim()?'pointer':'not-allowed',display:'flex',alignItems:'center',justifyContent:'center',alignSelf:'flex-end',opacity:panelNote.trim()?1:0.4 }}>
                    <Check size={14}/>
                  </button>
                </div>
              </div>

              {/* Timeline unificada */}
              <div>
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em' }}>Histórico completo</div>
                  {panelLoading && <Loader2 size={11} color={C.muted} style={{animation:'spin 1s linear infinite'}}/>}
                  {!panelLoading && panelTimeline.length > 0 && (
                    <span style={{ fontSize:10,color:C.muted }}>· {panelTimeline.length} eventos</span>
                  )}
                </div>

                {/* Legend pills */}
                <div style={{ display:'flex',gap:5,flexWrap:'wrap',marginBottom:12 }}>
                  {[
                    { src:'crm',        label:'Notas/Etapas', color:'#7C3AED' },
                    { src:'whatsapp',   label:'WhatsApp',     color:'#059669' },
                    { src:'agenda',     label:'Agenda',       color:'#D97706' },
                    { src:'financeiro', label:'Financeiro',   color:'#0891B2' },
                    { src:'kanban',     label:'Kanban',       color:'#7C3AED' },
                  ].map(p => {
                    const cnt = panelTimeline.filter(t => t.source === p.src).length
                    if (!cnt) return null
                    return (
                      <span key={p.src} style={{ fontSize:9.5,padding:'2px 8px',borderRadius:20,background:p.color+'15',color:p.color,fontWeight:700,border:`1px solid ${p.color}30` }}>
                        {p.label} ({cnt})
                      </span>
                    )
                  })}
                </div>

                {panelTimeline.length === 0 && !panelLoading && (
                  <div style={{ textAlign:'center',padding:'1.5rem',color:C.muted,fontSize:12 }}>Nenhum histórico encontrado</div>
                )}

                <div style={{ display:'flex',flexDirection:'column',gap:0,position:'relative' }}>
                  {panelTimeline.length > 0 && <div style={{ position:'absolute',left:11,top:4,bottom:0,width:1,background:C.border }}/>}
                  {panelTimeline.map(ev => {
                    const SOURCE_ICON = {
                      crm:        ev.tipo === 'nota' ? StickyNote : ArrowRight,
                      whatsapp:   MessageSquare,
                      agenda:     Flag,
                      financeiro: ev.fintipo === 'receita' ? ArrowRight : ArrowRight,
                      kanban:     Kanban,
                    }
                    const Icon = SOURCE_ICON[ev.source] || StickyNote
                    const m = ev.meta
                    const fmtDate = d => {
                      const dt = new Date(d)
                      return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) + ' ' + dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
                    }
                    const isMsg = ev.source === 'whatsapp'
                    const msgBubble = isMsg && ev.subtype === 'cliente'
                    const isKb = ev.source === 'kanban'

                    return (
                      <div key={ev.id} style={{ display:'flex',gap:10,marginBottom:10,position:'relative' }}>
                        <div style={{ width:22,height:22,borderRadius:'50%',background:m.bg,border:`1.5px solid ${m.color}40`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,zIndex:1,marginTop:1 }}>
                          <Icon size={10} color={m.color}/>
                        </div>
                        <div style={{ flex:1,minWidth:0,paddingTop:0 }}>
                          {isKb ? (
                            <div style={{ background:'#FAF5FF',border:'1px solid #E9D5FF',borderRadius:8,padding:'8px 10px' }}>
                              <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap' }}>
                                <span style={{ fontSize:11,fontWeight:700,color:C.navy }}>{ev.conteudo}</span>
                                <span style={{ fontSize:9.5,padding:'1px 6px',borderRadius:10,background:ev.kbColColor+'20',color:ev.kbColColor,fontWeight:700,border:`1px solid ${ev.kbColColor}40` }}>{ev.kbCol}</span>
                                <span style={{ fontSize:9.5,padding:'1px 6px',borderRadius:10,background:ev.kbPrioColor+'15',color:ev.kbPrioColor,fontWeight:700 }}>
                                  {ev.kbPrio==='urgente'?'🔴':ev.kbPrio==='alta'?'🟡':ev.kbPrio==='normal'?'🔵':'⚪'} {ev.kbPrio}
                                </span>
                              </div>
                              {ev.kbDesc && <div style={{ fontSize:11,color:C.slate,marginBottom:4 }}>{ev.kbDesc}</div>}
                              <div style={{ fontSize:9.5,color:C.muted,display:'flex',gap:10,flexWrap:'wrap' }}>
                                {ev.kbDue && <span>Prazo: {new Date(ev.kbDue+'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                                {ev.kbAssigned && <span>Responsável: {ev.kbAssigned}</span>}
                                <span>{fmtDate(ev.date)}</span>
                              </div>
                            </div>
                          ) : isMsg ? (
                            <div style={{
                              background: msgBubble ? '#ECFDF5' : '#EFF6FF',
                              border:`1px solid ${msgBubble ? '#A7F3D0' : '#BFDBFE'}`,
                              borderRadius: msgBubble ? '0 8px 8px 8px' : '8px 0 8px 8px',
                              padding:'6px 10px', fontSize:11.5, color:C.navy, lineHeight:1.45,
                              wordBreak:'break-word',
                            }}>
                              {ev.conteudo || '(mídia)'}
                              <div style={{ fontSize:9.5,color:C.muted,marginTop:3,textAlign:msgBubble?'left':'right' }}>
                                {ev.subtype==='cliente'?'Paciente':ev.subtype==='ia'?'IA':'Equipe'} · {fmtDate(ev.date)}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontSize:12,color:ev.source==='financeiro'?(ev.fintipo==='receita'?'#059669':'#DC2626'):C.navy,lineHeight:1.4,wordBreak:'break-word' }}>
                                {ev.conteudo}
                              </div>
                              <div style={{ fontSize:9.5,color:C.muted,marginTop:2 }}>
                                {ev.autor && <span>{ev.autor} · </span>}
                                {fmtDate(ev.date)}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Panel footer */}
            <div style={{ padding:'12px 20px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
              <button onClick={() => setConfirmDel(c)} style={{ display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:8,border:`1px solid #FECACA`,background:'#FFF1F2',color:'#DC2626',cursor:'pointer',fontSize:12,fontWeight:600 }}>
                <Trash2 size={12}/> Remover
              </button>
              <button onClick={() => setKanbanModal({ title:`Follow-up: ${resolveName(c)}`, description:'', column_id: kanbanCols[0]?.id||'', due_date:'', priority:'normal', assigned_user_id:'', assigned_user_name:'' })}
                style={{ display:'flex',alignItems:'center',gap:5,padding:'7px 12px',borderRadius:8,border:`1px solid #E9D5FF`,background:'#FAF5FF',color:'#7C3AED',cursor:'pointer',fontSize:12,fontWeight:600 }}>
                <Kanban size={12}/> Criar tarefa
              </button>
              <div style={{ flex:1 }}/>
              {/* Abre a conversa DENTRO da plataforma */}
              <button onClick={() => navigate(`/painel/conversas?contact=${cleanNum(c.phone)}`)}
                title="Abrir a conversa deste contato na plataforma"
                style={{ display:'flex',alignItems:'center',gap:5,padding:'7px 14px',borderRadius:8,border:`1px solid #BFDBFE`,background:'#EFF6FF',color:'#2563EB',cursor:'pointer',fontSize:12,fontWeight:700 }}>
                <MessageSquare size={12}/> Conversa
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── New Lead Modal ── */}
      {newModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={e=>{if(e.target===e.currentTarget)setNewModal(false)}}>
          <div style={{ background:C.card,borderRadius:16,padding:'24px',width:440,boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
              <div style={{ fontWeight:800,fontSize:16,color:C.navy }}>Novo Lead</div>
              <button onClick={()=>setNewModal(false)} style={{ width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted }}><X size={14}/></button>
            </div>

            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              {[
                { label:'Nome',     key:'nome',     placeholder:'Nome do paciente', required:false },
                { label:'Telefone', key:'phone',    placeholder:'55 11 9...',       required:true  },
                { label:'E-mail',   key:'email',    placeholder:'email@...',        required:false },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>
                    {f.label}{f.required&&<span style={{color:'#DC2626'}}>*</span>}
                  </label>
                  <input value={newForm[f.key]} onChange={e=>setNewForm(p=>({...p,[f.key]:e.target.value}))}
                    placeholder={f.placeholder}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',boxSizing:'border-box' }}/>
                </div>
              ))}

              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>Origem</label>
                  <input list="crm-origem-list" value={newForm.origem} onChange={e=>setNewForm(p=>({...p,origem:e.target.value}))}
                    placeholder="Escolha ou digite (ex: Eventos)"
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',boxSizing:'border-box' }}/>
                </div>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>Temperatura</label>
                  <select value={newForm.temperatura} onChange={e=>setNewForm(p=>({...p,temperatura:e.target.value}))}
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',cursor:'pointer',boxSizing:'border-box' }}>
                    {tempList.map(t=><option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:4 }}>Etapa inicial</label>
                <select value={newForm.stage_id} onChange={e=>setNewForm(p=>({...p,stage_id:e.target.value}))}
                  style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',fontSize:13,color:C.navy,background:C.card,outline:'none',cursor:'pointer',boxSizing:'border-box' }}>
                  {funStages.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display:'flex',gap:8,marginTop:20,justifyContent:'flex-end' }}>
              <button onClick={()=>setNewModal(false)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13,color:C.slate }}>Cancelar</button>
              <button onClick={createContact} disabled={!newForm.phone.trim()||saving}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 20px',borderRadius:8,background:C.navy,color:'#fff',border:'none',cursor:newForm.phone.trim()?'pointer':'not-allowed',fontSize:13,fontWeight:700,opacity:newForm.phone.trim()?1:0.5 }}>
                {saving ? <Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> : <UserPlus size={13}/>}
                Adicionar Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: criar / gerenciar temperaturas (aberto pelo "+" do painel ou pela barra) ── */}
      {tempModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:260, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => { if (e.target === e.currentTarget) setTempModal(null) }}>
          <div style={{ background:C.card, borderRadius:16, padding:'22px', width:400, maxWidth:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontWeight:800, fontSize:16, color:C.navy, display:'flex', alignItems:'center', gap:8 }}>
                <Thermometer size={16} color={C.blue}/> Temperaturas
              </div>
              <button onClick={() => setTempModal(null)} style={{ width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted }}><X size={14}/></button>
            </div>
            <div style={{ fontSize:11.5, color:C.muted, marginBottom:10 }}>Frio, Morno e Quente são padrão. Crie as suas (ex: Curioso, VIP) com uma cor.</div>
            <input autoFocus placeholder="Nome da temperatura (ex: Curioso, VIP)" value={tempModal.nome}
              onChange={e => setTempModal(m => ({ ...m, nome: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') createTemperature() }}
              style={{ width:'100%', border:`1px solid ${C.border}`, borderRadius:8, padding:'8px 11px', fontSize:13, marginBottom:10, boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:14 }}>
              {STAGE_COLORS.map(cc => (
                <button key={cc} type="button" onClick={() => setTempModal(m => ({ ...m, cor: cc }))}
                  style={{ width:24, height:24, borderRadius:'50%', background:cc, border:'none', cursor:'pointer', outline: tempModal.cor === cc ? `2px solid ${cc}` : '2px solid transparent', outlineOffset:2 }} />
              ))}
            </div>
            {temperatures.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Suas temperaturas</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {temperatures.map(t => (
                    <span key={t.id} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, background:C.bg, borderRadius:14, padding:'4px 9px' }}>
                      <span style={{ width:9, height:9, borderRadius:'50%', background:t.cor }} />{t.nome}
                      <button onClick={() => deleteTemperature(t)} title="Excluir" style={{ background:'none', border:'none', cursor:'pointer', color:C.muted, padding:0, display:'inline-flex' }}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setTempModal(null)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${C.border}`, background:'none', cursor:'pointer', fontSize:13, color:C.slate }}>Fechar</button>
              <button onClick={createTemperature} disabled={!tempModal.nome.trim() || savingTemp}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:C.blue, color:'#fff', cursor: tempModal.nome.trim() ? 'pointer' : 'not-allowed', fontSize:13, fontWeight:700, opacity: tempModal.nome.trim() ? 1 : 0.5 }}>
                {savingTemp ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Plus size={13}/>} Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: criar/editar etapa ── */}
      {stageModal && (() => {
        const editing = !!stageModal.id
        const idx = editing ? funStages.findIndex(s => s.id === stageModal.id) : -1
        const liveStage = editing ? funStages.find(s => s.id === stageModal.id) : null
        return (
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:260,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
            onClick={e=>{if(e.target===e.currentTarget)setStageModal(null)}}>
            <div style={{ background:C.card,borderRadius:16,padding:'24px',width:420,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18 }}>
                <div style={{ fontWeight:800,fontSize:16,color:C.navy }}>{editing ? 'Editar etapa' : 'Nova etapa'}</div>
                <button onClick={()=>setStageModal(null)} style={{ width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted }}><X size={14}/></button>
              </div>

              <div style={{ display:'flex',flexDirection:'column',gap:14 }}>
                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:5 }}>Nome da etapa</label>
                  <input autoFocus value={stageModal.nome} maxLength={40}
                    onChange={e=>setStageModal(p=>({...p,nome:e.target.value}))}
                    onKeyDown={e=>{ if(e.key==='Enter') handleSaveStage() }}
                    placeholder="Ex: Aguardando retorno"
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 11px',fontSize:13,color:C.navy,background:C.card,outline:'none',boxSizing:'border-box' }}/>
                </div>

                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6 }}>Cor</label>
                  <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                    {STAGE_COLORS.map(c => (
                      <button key={c} type="button" onClick={()=>setStageModal(p=>({...p,cor:c}))}
                        style={{ width:24,height:24,borderRadius:'50%',background:c,cursor:'pointer',border:'none',outline:stageModal.cor===c?`2px solid ${c}`:'2px solid transparent',outlineOffset:2 }}/>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:5 }}>Alertar se parar (dias)</label>
                  <input type="number" min="1" value={stageModal.alerta_dias ?? ''}
                    onChange={e=>setStageModal(p=>({...p,alerta_dias:e.target.value}))}
                    placeholder="deixe vazio pra não alertar"
                    style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 11px',fontSize:13,color:C.navy,background:C.card,outline:'none',boxSizing:'border-box' }}/>
                  <div style={{ fontSize:10.5,color:C.muted,marginTop:5 }}>O lead vira "parado" se ficar mais que isso na etapa. Vazio = sem alerta (ex: Perdido/Fidelizado).</div>
                </div>

                {editing && funStages.length > 1 && (
                  <div style={{ display:'flex',alignItems:'center',gap:8,borderTop:`1px solid ${C.border}`,paddingTop:12 }}>
                    <span style={{ fontSize:11,fontWeight:600,color:C.muted,flex:1 }}>Posição no funil</span>
                    <button onClick={()=>handleMoveStage(liveStage, -1)} disabled={idx<=0} title="Mover pra esquerda"
                      style={{ width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.card,cursor:idx<=0?'not-allowed':'pointer',color:C.slate,opacity:idx<=0?0.4:1,display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronRight size={14} style={{transform:'rotate(180deg)'}}/></button>
                    <button onClick={()=>handleMoveStage(liveStage, +1)} disabled={idx>=funStages.length-1} title="Mover pra direita"
                      style={{ width:30,height:30,borderRadius:8,border:`1px solid ${C.border}`,background:C.card,cursor:idx>=funStages.length-1?'not-allowed':'pointer',color:C.slate,opacity:idx>=funStages.length-1?0.4:1,display:'flex',alignItems:'center',justifyContent:'center' }}><ChevronRight size={14}/></button>
                  </div>
                )}
              </div>

              <div style={{ display:'flex',gap:8,marginTop:22,alignItems:'center' }}>
                {editing && funStages.length > 1 && (
                  <button onClick={()=>setConfirmDelStage(liveStage)}
                    style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,border:'1px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:13,fontWeight:600 }}>
                    <Trash2 size={13}/> Excluir
                  </button>
                )}
                <div style={{ flex:1 }}/>
                <button onClick={()=>setStageModal(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13,color:C.slate }}>Cancelar</button>
                <button onClick={handleSaveStage} disabled={!stageModal.nome.trim()||savingStage}
                  style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 20px',borderRadius:8,background:C.navy,color:'#fff',border:'none',cursor:stageModal.nome.trim()?'pointer':'not-allowed',fontSize:13,fontWeight:700,opacity:stageModal.nome.trim()?1:0.5 }}>
                  {savingStage ? <Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> : <Check size={13}/>}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Confirm: excluir etapa ── */}
      {confirmDelStage && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:270,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
          onClick={e=>{if(e.target===e.currentTarget)setConfirmDelStage(null)}}>
          <div style={{ background:C.card,borderRadius:16,padding:'24px',width:400,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight:800,fontSize:15,color:C.navy,marginBottom:8 }}>Excluir "{confirmDelStage.nome}"?</div>
            <div style={{ fontSize:12.5,color:C.slate,lineHeight:1.6,marginBottom:18 }}>
              {(byStage[confirmDelStage.id]||[]).length > 0
                ? <>Os <strong>{(byStage[confirmDelStage.id]||[]).length} leads</strong> desta etapa vão pra <strong>{funStages.find(s=>s.id!==confirmDelStage.id)?.nome}</strong>. Essa ação não pode ser desfeita.</>
                : <>A etapa será removida do funil. Essa ação não pode ser desfeita.</>}
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={()=>setConfirmDelStage(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13,color:C.slate }}>Cancelar</button>
              <button onClick={()=>handleDeleteStage(confirmDelStage)}
                style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 18px',borderRadius:8,background:'#DC2626',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700 }}>
                <Trash2 size={13}/> Excluir etapa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: criar / renomear funil ── */}
      {funnelModal && (() => {
        const editing = !!funnelModal.id
        return (
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:260,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
            onClick={e=>{if(e.target===e.currentTarget)setFunnelModal(null)}}>
            <div style={{ background:C.card,borderRadius:16,padding:'24px',width:400,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18 }}>
                <div style={{ fontWeight:800,fontSize:16,color:C.navy,display:'flex',alignItems:'center',gap:8 }}>
                  <GitMerge size={16} color={C.blue}/> {editing ? 'Renomear funil' : 'Novo funil de CRM'}
                </div>
                <button onClick={()=>setFunnelModal(null)} style={{ width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:C.muted }}><X size={14}/></button>
              </div>
              <label style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:5 }}>Nome do funil</label>
              <input autoFocus value={funnelModal.nome} maxLength={40}
                onChange={e=>setFunnelModal(p=>({...p,nome:e.target.value}))}
                onKeyDown={e=>{ if(e.key==='Enter') handleSaveFunnel() }}
                placeholder="Ex: Pós-venda, Retornos, Estética..."
                style={{ width:'100%',border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 11px',fontSize:13,color:C.navy,background:C.card,outline:'none',boxSizing:'border-box' }}/>
              {!editing && (
                <div style={{ fontSize:10.5,color:C.muted,marginTop:7,lineHeight:1.5 }}>Já vem com as etapas padrão (Novo Lead, Primeiro Contato...). Você edita as etapas depois.</div>
              )}
              <div style={{ display:'flex',gap:8,marginTop:22,alignItems:'center' }}>
                {editing && funnels.length > 1 && (
                  <button onClick={()=>setConfirmDelFunnel(funnels.find(f=>f.id===funnelModal.id))}
                    style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,border:'1px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:13,fontWeight:600 }}>
                    <Trash2 size={13}/> Excluir
                  </button>
                )}
                <div style={{ flex:1 }}/>
                <button onClick={()=>setFunnelModal(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13,color:C.slate }}>Cancelar</button>
                <button onClick={handleSaveFunnel} disabled={!funnelModal.nome.trim()||savingFunnel}
                  style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 20px',borderRadius:8,background:C.navy,color:'#fff',border:'none',cursor:funnelModal.nome.trim()?'pointer':'not-allowed',fontSize:13,fontWeight:700,opacity:funnelModal.nome.trim()?1:0.5 }}>
                  {savingFunnel ? <Loader2 size={13} style={{animation:'spin 1s linear infinite'}}/> : <Check size={13}/>}
                  {editing ? 'Salvar' : 'Criar funil'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Confirm: excluir funil ── */}
      {confirmDelFunnel && (() => {
        const cnt = contacts.filter(c => c.funil_id === confirmDelFunnel.id).length
        const target = funnels.find(f => f.id !== confirmDelFunnel.id)
        return (
          <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:280,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}
            onClick={e=>{if(e.target===e.currentTarget)setConfirmDelFunnel(null)}}>
            <div style={{ background:C.card,borderRadius:16,padding:'24px',width:410,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ fontWeight:800,fontSize:15,color:C.navy,marginBottom:8 }}>Excluir funil "{confirmDelFunnel.nome}"?</div>
              <div style={{ fontSize:12.5,color:C.slate,lineHeight:1.6,marginBottom:18 }}>
                As etapas desse funil serão removidas.{' '}
                {cnt > 0
                  ? <>Os <strong>{cnt} leads</strong> vão pro funil <strong>{target?.nome}</strong> (na primeira etapa).</>
                  : <>Ele não tem leads.</>}{' '}
                Essa ação não pode ser desfeita.
              </div>
              <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
                <button onClick={()=>setConfirmDelFunnel(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13,color:C.slate }}>Cancelar</button>
                <button onClick={()=>deleteFunnel(confirmDelFunnel.id)}
                  style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 18px',borderRadius:8,background:'#DC2626',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700 }}>
                  <Trash2 size={13}/> Excluir funil
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Confirm Delete ── */}
      {/* Modal: lista dinâmica */}
      {listModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:250,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div style={{ background:C.card,borderRadius:14,padding:24,width:'100%',maxWidth:480,boxShadow:'0 20px 60px rgba(0,0,0,0.25)',maxHeight:'90vh',overflowY:'auto' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <div style={{ fontWeight:800,fontSize:15,color:C.navy,display:'flex',alignItems:'center',gap:8 }}>
                <Filter size={15} color={C.blue}/> {listModal.id ? 'Editar lista' : 'Nova lista'}
              </div>
              <button onClick={()=>setListModal(null)} style={{ background:'none',border:'none',cursor:'pointer',color:C.muted }}><X size={16}/></button>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Nome da lista *</label>
                <input className="nx-input" value={listModal.nome} onChange={e=>setListModal(p=>({...p,nome:e.target.value}))} placeholder="Ex: Leads quentes sem resposta" style={{ width:'100%',boxSizing:'border-box' }}/>
              </div>
              <div style={{ borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:2 }}>
                <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10 }}>Filtros</div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Temperatura</label>
                    <select className="nx-select" value={listModal.filtros?.temperatura||'todos'} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,temperatura:e.target.value}}))} style={{ width:'100%',boxSizing:'border-box' }}>
                      <option value="todos">Todas</option>
                      {tempList.map(t=><option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Etapa</label>
                    <select className="nx-select" value={listModal.filtros?.stage_id||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,stage_id:e.target.value}}))} style={{ width:'100%',boxSizing:'border-box' }}>
                      <option value="">Todas</option>
                      {stages.map(s=><option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Mín. dias parado</label>
                    <input type="number" className="nx-input" value={listModal.filtros?.dias_min||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,dias_min:e.target.value}}))} placeholder="Ex: 3" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Máx. dias parado</label>
                    <input type="number" className="nx-input" value={listModal.filtros?.dias_max||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,dias_max:e.target.value}}))} placeholder="Ex: 30" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Origem</label>
                    <input className="nx-input" value={listModal.filtros?.origem||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,origem:e.target.value}}))} placeholder="Ex: Instagram" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Tag</label>
                    <input className="nx-input" value={listModal.filtros?.tag||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,tag:e.target.value}}))} placeholder="Ex: VIP" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11,color:C.muted,display:'block',marginBottom:3 }}>Responsável</label>
                    <input className="nx-input" value={listModal.filtros?.responsavel_nome||''} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,responsavel_nome:e.target.value}}))} placeholder="Nome" style={{ width:'100%',boxSizing:'border-box' }}/>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:8,paddingTop:18 }}>
                    <input type="checkbox" id="sem_resp" checked={!!listModal.filtros?.sem_responsavel} onChange={e=>setListModal(p=>({...p,filtros:{...p.filtros,sem_responsavel:e.target.checked}}))}/>
                    <label htmlFor="sem_resp" style={{ fontSize:11,color:C.slate,cursor:'pointer' }}>Sem responsável</label>
                  </div>
                </div>
                {/* Preview count */}
                <div style={{ marginTop:12,padding:'8px 12px',background:C.bg,borderRadius:8,fontSize:12,color:C.slate }}>
                  <span style={{ fontWeight:700,color:C.navy }}>{contacts.filter(c=>applyListFilter(c,listModal.filtros)).length}</span> leads correspondem a esses filtros
                </div>
              </div>
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end',marginTop:20 }}>
              <button onClick={()=>setListModal(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13 }}>Cancelar</button>
              <button onClick={saveList} disabled={savingList||!listModal.nome?.trim()}
                style={{ padding:'8px 18px',borderRadius:8,background:savingList||!listModal.nome?.trim()?C.muted:C.blue,color:'#fff',border:'none',cursor:savingList?'wait':'pointer',fontSize:13,fontWeight:700 }}>
                {savingList ? 'Salvando…' : 'Salvar lista'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: criar tarefa no Kanban */}
      {kanbanModal && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:250,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div style={{ background:C.card,borderRadius:14,padding:24,width:'100%',maxWidth:440,boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <div style={{ fontWeight:800,fontSize:15,color:C.navy,display:'flex',alignItems:'center',gap:8 }}>
                <Kanban size={16} color="#7C3AED"/> Criar tarefa no Kanban
              </div>
              <button onClick={()=>setKanbanModal(null)} style={{ background:'none',border:'none',cursor:'pointer',color:C.muted }}><X size={16}/></button>
            </div>
            <div style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Título *</label>
                <input className="nx-input" value={kanbanModal.title} onChange={e=>setKanbanModal(p=>({...p,title:e.target.value}))} placeholder="O que precisa ser feito?" style={{ width:'100%',boxSizing:'border-box' }}/>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Coluna</label>
                <select className="nx-select" value={kanbanModal.column_id} onChange={e=>setKanbanModal(p=>({...p,column_id:e.target.value}))} style={{ width:'100%',boxSizing:'border-box' }}>
                  {kanbanCols.length === 0 && <option value="">— sem colunas —</option>}
                  {kanbanCols.map(col => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Prioridade</label>
                  <select className="nx-select" value={kanbanModal.priority} onChange={e=>setKanbanModal(p=>({...p,priority:e.target.value}))} style={{ width:'100%',boxSizing:'border-box' }}>
                    <option value="baixa">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Prazo</label>
                  <input type="date" className="nx-input" value={kanbanModal.due_date} onChange={e=>setKanbanModal(p=>({...p,due_date:e.target.value}))} style={{ width:'100%',boxSizing:'border-box' }}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Responsável</label>
                <select className="nx-select" value={kanbanModal.assigned_user_id||''} onChange={e=>{
                  const u = users.find(x=>x.id===e.target.value)
                  setKanbanModal(p=>({...p,assigned_user_id:e.target.value||null,assigned_user_name:u?.name||u?.email||null}))
                }} style={{ width:'100%',boxSizing:'border-box' }}>
                  <option value="">— sem responsável —</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name||u.email}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4 }}>Descrição</label>
                <textarea className="nx-input" value={kanbanModal.description||''} onChange={e=>setKanbanModal(p=>({...p,description:e.target.value}))} placeholder="Detalhes da tarefa..." rows={2} style={{ width:'100%',boxSizing:'border-box',resize:'vertical' }}/>
              </div>
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end',marginTop:20 }}>
              <button onClick={()=>setKanbanModal(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13 }}>Cancelar</button>
              <button onClick={createKanbanCard} disabled={savingKanban||!kanbanModal.title?.trim()||!kanbanModal.column_id}
                style={{ padding:'8px 18px',borderRadius:8,background:savingKanban||!kanbanModal.title?.trim()||!kanbanModal.column_id?C.muted:'#7C3AED',color:'#fff',border:'none',cursor:savingKanban?'wait':'pointer',fontSize:13,fontWeight:700 }}>
                {savingKanban ? 'Criando…' : 'Criar tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ background:C.card,borderRadius:14,padding:'24px',width:360,boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight:800,fontSize:15,color:C.navy,marginBottom:8 }}>Remover lead?</div>
            <div style={{ fontSize:13,color:C.muted,marginBottom:20 }}>
              Isso remove <strong>{resolveName(confirmDel)}</strong> do CRM. Não pode ser desfeito.
            </div>
            <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
              <button onClick={()=>setConfirmDel(null)} style={{ padding:'8px 16px',borderRadius:8,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:13 }}>Cancelar</button>
              <button onClick={()=>deleteContact(confirmDel.id)} style={{ padding:'8px 16px',borderRadius:8,background:'#DC2626',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:700 }}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PanelField — editable inline ──────────────────────────────────────────────
// Campo com lista de sugestões (datalist) que também aceita texto livre. Salva no
// blur/Enter, sem gravar a cada tecla. Usado na Origem (editável) do CRM.
function ComboField({ value, listId, placeholder, onSave, style }) {
  const [val, setVal] = useState(value || '')
  useEffect(() => { setVal(value || '') }, [value])
  const commit = () => { const v = val.trim(); if (v !== (value || '')) onSave(v) }
  return (
    <input
      list={listId}
      value={val}
      placeholder={placeholder}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setVal(value || ''); e.currentTarget.blur() } }}
      style={style}
    />
  )
}

function PanelField({ label, value, onSave, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const inputRef              = useRef(null)

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    if (val.trim() !== value) onSave(val.trim())
  }

  return (
    <div>
      <div style={{ fontSize:10,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4 }}>{label}</div>
      {editing
        ? <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)}
            onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape'){setVal(value);setEditing(false)}}}
            style={{ width:'100%',border:`1px solid #93C5FD`,borderRadius:7,padding:'6px 10px',fontSize:12,color:'#0F172A',background:'#EFF6FF',outline:'none',boxSizing:'border-box' }}/>
        : <div onClick={()=>setEditing(true)} style={{ padding:'6px 10px',borderRadius:7,border:`1px solid transparent`,fontSize:12,color:val?'#0F172A':'#94A3B8',cursor:'text',transition:'all 0.1s' }}
            onMouseEnter={e=>{e.currentTarget.style.border=`1px solid #E2E8F0`;e.currentTarget.style.background='#F8FAFC'}}
            onMouseLeave={e=>{e.currentTarget.style.border='1px solid transparent';e.currentTarget.style.background='transparent'}}>
            {val || <span style={{color:'#94A3B8',fontStyle:'italic'}}>{placeholder}</span>}
          </div>
      }
    </div>
  )
}
