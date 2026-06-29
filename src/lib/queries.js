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
