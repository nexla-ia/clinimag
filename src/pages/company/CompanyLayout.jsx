import React from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Sidebar from '../../components/Sidebar'
import { MessageSquare, History, BellRing, BarChart2, Settings2, Contact2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './Company.css'

export default function CompanyLayout() {
  const { session } = useAuth()
  const instance = session?.company?.instance
  const [activeCount, setActiveCount] = useState(0)
  const [pendingAlerts, setPendingAlerts] = useState(0)

  // Garante que a tabela conversations está no Realtime
  useEffect(() => {
    supabase.rpc('ensure_table_setup', { p_table: 'conversations' })
  }, [])

  // Conta conversas ativas = números únicos na mensagens_geral - encerradas
  useEffect(() => {
    if (!instance) return

    async function refresh() {
      const [{ data: msgs }, { data: closed }] = await Promise.all([
        supabase.from('mensagens_geral').select('numero').eq('instancia', instance),
        supabase.from('conversations').select('session_id').eq('instancia', instance),
      ])
      const closedSet = new Set((closed || []).map(r => r.session_id))
      const unique = new Set((msgs || []).map(r => r.numero))
      setActiveCount([...unique].filter(s => !closedSet.has(s)).length)
    }
    refresh()

    const ch = supabase.channel('layout-conversations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_geral', filter: `instancia=eq.${instance}` },
        () => refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations', filter: `instancia=eq.${instance}` },
        () => refresh())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  // Conta alertas pendentes reais
  useEffect(() => {
    if (!instance) return
    supabase.from('alerts').select('id', { count: 'exact' })
      .eq('instancia', instance).eq('resolved', false)
      .then(({ count }) => setPendingAlerts(count || 0))

    const ch = supabase.channel('layout-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: `instancia=eq.${instance}` },
        () => {
          supabase.from('alerts').select('id', { count: 'exact' })
            .eq('instancia', instance).eq('resolved', false)
            .then(({ count }) => setPendingAlerts(count || 0))
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  const isAdmin = session?.user?.role === 'admin'

  const links = [
    { to: '/painel/conversas', icon: MessageSquare, label: 'Conversas',
      badge: activeCount > 0 ? activeCount : null, badgeColor: 'cyan' },
    { to: '/painel/historico', icon: History,       label: 'Conversas IA' },
    { to: '/painel/contatos',  icon: Contact2,      label: 'Contatos' },
    { to: '/painel/alertas',   icon: BellRing,      label: 'Alertas',
      badge: pendingAlerts > 0 ? pendingAlerts : null, badgeColor: 'amber' },
    ...(isAdmin ? [
      { to: '/painel/metricas', icon: BarChart2, label: 'Métricas' },
      { to: '/painel/admin',    icon: Settings2, label: 'Administração' },
    ] : []),
  ]

  return (
    <div className="company-root">
      <Sidebar links={links} role="company" />
      <div className="company-main-wrap">
        <div className="company-topbar">
          <div className="company-topbar-name">{session?.company?.name}</div>
          <span className={`nx-badge nx-badge-${session?.company?.plan === 'Business' ? 'violet' : session?.company?.plan === 'Pro' ? 'cyan' : 'gray'}`}>
            {session?.company?.plan}
          </span>
        </div>
        <main className="company-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
