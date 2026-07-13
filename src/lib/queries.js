import { supabase } from './supabase'

// Helpers de consulta com agregação no servidor (RPCs de Fase 1 de performance).
// Cada um tenta a RPC e, se ela ainda não existir no banco, cai no comportamento
// antigo — assim o deploy do front não depende da migration já ter sido aplicada.

// Números (session_ids) distintos de uma instância. Shape: [{ numero }]
export async function fetchDistinctNumeros(instancia) {
  const { data, error } = await supabase.rpc('api_distinct_numeros', { p_instancia: instancia })
  if (!error) return data || []
  // Fallback: RPC ausente no banco
  const { data: rows } = await supabase
    .from('mensagens_geral')
    .select('numero')
    .eq('instancia', instancia)
    .limit(5000)
  return rows || []
}

// Grupos distintos de uma instância, nomegrupo da msg mais recente. Shape: [{ idgrupo, nomegrupo }]
export async function fetchDistinctGrupos(instancia) {
  const { data, error } = await supabase.rpc('api_distinct_grupos', { p_instancia: instancia })
  if (!error) return data || []
  // Fallback: RPC ausente no banco
  const { data: rows } = await supabase
    .from('mensagens_geral')
    .select('idgrupo, nomegrupo')
    .eq('instancia', instancia)
    .not('idgrupo', 'is', null)
    .order('id', { ascending: false })
    .limit(20000)
  return rows || []
}

// CompanyConversations: contatos únicos (WhatsApp) de uma instância.
// Shape: [{ numero, created_at, horaLastMessage, outside_assumed }] ordenado
// pela mensagem mais recente. O componente mapeia para o formato de contato.
export async function fetchConversaContatos(instancia) {
  const { data, error } = await supabase.rpc('api_conversas_contatos', { p_instancia: instancia })
  if (!error && data) return data
  // Fallback: baixa as mensagens e deduplica client-side (comportamento antigo)
  const { data: rows } = await supabase
    .from('mensagens_geral')
    .select('id, numero, idgrupo, type, mensagem, base64, "horaLastMessage", created_at')
    .eq('instancia', instancia)
    .or('aplicativo.eq.whatsapp,aplicativo.is.null')
    .order('id', { ascending: false })
    .limit(50000)
  const all = rows || []
  const hasOutsideHuman = new Set()
  for (const row of all) {
    if (row.idgrupo) continue
    const t = (row.type || '').toLowerCase()
    if ((t === 'atendente' || t === 'humano') && row.numero) hasOutsideHuman.add(row.numero)
  }
  const seen = new Set()
  const out = []
  for (const row of all) {
    const sid = row.numero
    if (!sid || seen.has(sid)) continue
    if (sid.includes('@g.us')) continue
    if (row.idgrupo) continue
    seen.add(sid)
    out.push({
      numero: sid,
      created_at: row.created_at,
      horaLastMessage: row.horaLastMessage,
      outside_assumed: hasOutsideHuman.has(sid),
      preview: (row.mensagem || '').trim() || (row.base64 ? '📎 Mídia' : ''),
      last_tipo: (row.type || '').toLowerCase(),
    })
  }
  return out
}

// CompanyGroups: lista de grupos de uma instância, última msg de cada.
// Shape: [{ idgrupo, nomegrupo, mensagem, numero, nome, created_at, horaLastMessage }]
// ordenado pela mensagem mais recente. O componente mapeia para seu formato.
export async function fetchGruposLista(instancia) {
  const { data, error } = await supabase.rpc('api_grupos_lista', { p_instancia: instancia })
  if (!error && data) return data
  // Fallback: baixa e deduplica client-side (comportamento antigo)
  const { data: rows } = await supabase
    .from('mensagens_geral')
    .select('id, idgrupo, nomegrupo, mensagem, numero, nome, "horaLastMessage", created_at')
    .eq('instancia', instancia)
    .not('idgrupo', 'is', null)
    .order('id', { ascending: false })
    .limit(20000)
  const seen = new Set()
  const out = []
  for (const row of rows || []) {
    if (!row.idgrupo || seen.has(row.idgrupo)) continue
    seen.add(row.idgrupo)
    out.push(row)
  }
  return out
}

// AdmOperacao: estatísticas de mensagens de uma instância desde sinceISO.
// Retorna { total, byType: { cliente, ia, humano, tool } }.
export async function fetchOperacaoMsgStats(instancia, sinceISO) {
  const { data, error } = await supabase.rpc('api_operacao_msg_stats', {
    p_instancia: instancia, p_since: sinceISO,
  })
  if (!error && data) {
    const byType = { cliente: 0, ia: 0, humano: 0, tool: 0 }
    let total = 0
    data.forEach(r => {
      const n = Number(r.total) || 0
      total += n
      if (byType[r.type] !== undefined) byType[r.type] = n
    })
    return { total, byType }
  }
  // Fallback: agrega client-side (comportamento antigo)
  const { data: rows } = await supabase
    .from('mensagens_geral')
    .select('id, type')
    .eq('instancia', instancia)
    .gte('created_at', sinceISO)
    .limit(20000)
  const byType = { cliente: 0, ia: 0, humano: 0, tool: 0 }
  ;(rows || []).forEach(x => { const t = (x.type || '').toLowerCase(); if (byType[t] !== undefined) byType[t]++ })
  return { total: (rows || []).length, byType }
}

// AdmDashboard: agregados de mensagens na janela (sinceISO) no timezone tz.
// Retorna { byInstance: { [inst]: { total, today, lastMsg } }, hours: number[24] }.
export async function fetchDashboardMsgStats(sinceISO, tz) {
  const [statsRes, hoursRes] = await Promise.all([
    supabase.rpc('api_adm_msg_stats', { p_since: sinceISO, p_tz: tz }),
    supabase.rpc('api_adm_msg_hours', { p_since: sinceISO, p_tz: tz }),
  ])
  if (!statsRes.error && !hoursRes.error) {
    const byInstance = {}
    ;(statsRes.data || []).forEach(r => {
      byInstance[r.instancia] = { total: Number(r.total) || 0, today: Number(r.today) || 0, lastMsg: r.last_msg }
    })
    const hours = Array(24).fill(0)
    ;(hoursRes.data || []).forEach(r => { hours[r.hour] = Number(r.total) || 0 })
    return { byInstance, hours }
  }
  // Fallback: agrega client-side no timezone local do browser (comportamento antigo)
  const { data: rows } = await supabase
    .from('mensagens_geral')
    .select('id, instancia, type, created_at')
    .gte('created_at', sinceISO)
    .limit(50000)
  const byInstance = {}
  const hours = Array(24).fill(0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  ;(rows || []).forEach(m => {
    const inst = m.instancia
    if (!byInstance[inst]) byInstance[inst] = { total: 0, today: 0, lastMsg: null }
    byInstance[inst].total++
    if (m.created_at) {
      const d = new Date(m.created_at)
      if (d >= today) byInstance[inst].today++
      hours[d.getHours()]++
      if (!byInstance[inst].lastMsg || m.created_at > byInstance[inst].lastMsg) byInstance[inst].lastMsg = m.created_at
    }
  })
  return { byInstance, hours }
}
