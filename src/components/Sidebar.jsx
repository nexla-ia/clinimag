import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut } from 'lucide-react'
import './Sidebar.css'

export default function Sidebar({ links, role }) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/lohomed.png" alt="Med Mag" className="sidebar-logo" />
        <div className="sidebar-brand-tag">{role === 'adm' ? 'ADM Global' : 'Painel'}</div>
      </div>

      <nav className="sidebar-nav">
        {links.map(link => link.section
          ? (
            <div key={`sec-${link.section}`} className="sidebar-section">{link.section}</div>
          )
          : link.onClick
          ? (
            <button
              key={link.key || link.label}
              type="button"
              onClick={link.onClick}
              className={`sidebar-link ${link.active ? 'active' : ''}`}>
              <link.icon size={16} />
              {link.label}
              {link.badge ? <span className={`sidebar-badge nx-badge nx-badge-${link.badgeColor || 'cyan'}`}>{link.badge}</span> : null}
            </button>
          )
          : (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <link.icon size={16} />
              {link.label}
              {link.badge ? <span className={`sidebar-badge nx-badge nx-badge-${link.badgeColor || 'cyan'}`}>{link.badge}</span> : null}
            </NavLink>
          )
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {session?.user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{session?.user?.name}</div>
            <div className="sidebar-user-email">{session?.user?.email}</div>
          </div>
        </div>
        <button className="sidebar-logout" onClick={handleLogout} title="Sair">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}

