import React from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'
import { LayoutDashboard, Building2, Users, Eye, Activity } from 'lucide-react'
import './Adm.css'

const links = [
  { to: '/adm',          end: true, icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/adm/empresas',            icon: Building2,       label: 'Empresas'  },
  { to: '/adm/operacao',            icon: Activity,        label: 'Operação'  },
  { to: '/adm/espiao',              icon: Eye,             label: 'Espião'    },
]

export default function AdmLayout() {
  return (
    <div className="adm-root">
      <Sidebar links={links} role="adm" />
      <main className="adm-main">
        <Outlet />
      </main>
    </div>
  )
}
