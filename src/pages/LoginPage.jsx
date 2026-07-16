import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, Loader2, Sparkles, Calendar, Bot, MessageSquare } from 'lucide-react'
import TrialCTA from '../components/TrialCTA'
import './LoginPage.css'

export default function LoginPage() {
  const { login, masterEnter } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('empresa')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '' })
  // Acesso mestre: { companies, masterEmail } quando o login mestre valida
  const [masterPick, setMasterPick] = useState(null)
  const [masterFilter, setMasterFilter] = useState('')
  const [entering, setEntering] = useState(null)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) { setError('Preencha todos os campos.'); return }
    setLoading(true)
    const result = await login(form.email, form.password, tab)
    setLoading(false)
    if (result.ok && result.master) {
      setMasterPick({ companies: result.companies, masterEmail: result.masterEmail })
      setMasterFilter('')
    } else if (result.ok) {
      navigate(tab === 'adm' ? '/adm' : '/painel')
    } else {
      setError(result.error)
    }
  }

  async function handleMasterEnter(c) {
    if (entering) return
    setEntering(c.id)
    const r = await masterEnter(c.id, masterPick.masterEmail)
    setEntering(null)
    if (r.ok) navigate('/painel')
    else setError(r.error)
  }

  return (
    <div className="login-root">
      <div className="login-shell">
        {/* COLUNA ESQUERDA — branding */}
        <div className="login-left">
          <Link to="/" className="login-brand">
            <img src="/lohomed.png" alt="Med Mag" className="login-logo" />
            <div className="login-brand-text">
              <small>O SAC inteligente da sua clínica</small>
            </div>
          </Link>

          <div className="login-eyebrow">
            <span className="login-pulse" />
            Central de controle inteligente
          </div>

          <h1 className="login-headline">
            Bem-vindo de volta à sua <em>operação digital</em>.
          </h1>

          <p className="login-sub">
            Gerencie IA, agenda, atendimento e equipe em um painel unificado feito para clínicas que valorizam tempo, dinheiro e o paciente.
          </p>

          <div className="login-features">
            <div className="login-feat" style={{ background: '#FEF3C7', borderColor: '#FCD34D' }}>
              <Bot size={14} />
              <span>IA atendendo 24/7</span>
            </div>
            <div className="login-feat" style={{ background: '#DCFCE7', borderColor: '#86EFAC' }}>
              <Calendar size={14} />
              <span>Agenda integrada</span>
            </div>
            <div className="login-feat" style={{ background: '#DBEAFE', borderColor: '#93C5FD' }}>
              <MessageSquare size={14} />
              <span>Caixa unificada</span>
            </div>
            <div className="login-feat" style={{ background: '#FCE7F3', borderColor: '#F9A8D4' }}>
              <Sparkles size={14} />
              <span>Métricas reais</span>
            </div>
          </div>

          <div className="login-decor login-decor-1" />
          <div className="login-decor login-decor-2" />
          <div className="login-decor login-decor-3" />
        </div>

        {/* COLUNA DIREITA — formulário */}
        <div className="login-right">
          {/* wrapper coluna para empilhar form + trial CTA */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {masterPick ? (
            <div className="login-card">
              <div className="login-card-header">
                <h2 className="login-card-title">Acesso mestre</h2>
                <p className="login-card-sub">Escolha a empresa que deseja acessar</p>
              </div>
              {masterPick.companies.length > 6 && (
                <input
                  className="login-input"
                  placeholder="Buscar empresa..."
                  value={masterFilter}
                  onChange={e => setMasterFilter(e.target.value)}
                  style={{ marginBottom: 10 }}
                  autoFocus
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                {masterPick.companies
                  .filter(c => !masterFilter || c.name.toLowerCase().includes(masterFilter.toLowerCase()) || (c.instance || '').includes(masterFilter.toLowerCase()))
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => c.active && handleMasterEnter(c)}
                      disabled={!c.active || !!entering}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        padding: '11px 14px', borderRadius: 10, cursor: c.active ? 'pointer' : 'not-allowed',
                        border: '1.5px solid #E2E8F0', background: '#F8FAFC',
                        color: '#0F172A', opacity: c.active ? 1 : 0.45, fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { if (c.active) e.currentTarget.style.borderColor = '#2563EB' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0' }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13,
                      }}>
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          {c.instance} · {c.plan || 'sem plano'}{!c.active && ' · inativa'}
                        </div>
                      </div>
                      {entering === c.id && <Loader2 size={14} className="spin" />}
                    </button>
                  ))}
              </div>
              {error && <div className="login-error" style={{ marginTop: 10 }}>{error}</div>}
              <button
                type="button"
                onClick={() => { setMasterPick(null); setError('') }}
                style={{
                  marginTop: 12, width: '100%', padding: '9px 0', borderRadius: 10,
                  background: 'transparent', border: '1px solid #E2E8F0',
                  color: '#64748B', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit',
                }}
              >
                Voltar ao login
              </button>
            </div>
          ) : (
          <form className="login-card" onSubmit={handleSubmit}>
            <div className="login-card-header">
              <h2 className="login-card-title">Acesso ao painel</h2>
              <p className="login-card-sub">Entre com suas credenciais</p>
            </div>

            <div className="login-tabs">
              <button type="button" className={`login-tab ${tab === 'empresa' ? 'active' : ''}`} onClick={() => { setTab('empresa'); setError('') }}>
                Acesso Empresa
              </button>
              <button type="button" className={`login-tab ${tab === 'adm' ? 'active' : ''}`} onClick={() => { setTab('adm'); setError('') }}>
                ADM Global
              </button>
            </div>

            {tab === 'adm' && (
              <div className="adm-notice">
                <span className="adm-dot" />
                Acesso administrativo global — todas as empresas
              </div>
            )}

            <div className="login-field">
              <label className="login-label">E-mail</label>
              <input className="login-input" type="email" name="email" placeholder={tab === 'adm' ? 'admin@medmag.com' : 'usuario@empresa.com'} value={form.email} onChange={handleChange} autoComplete="email" />
            </div>

            <div className="login-field">
              <label className="login-label">Senha</label>
              <div className="login-input-wrap">
                <input className="login-input" type={showPass ? 'text' : 'password'} name="password" placeholder="••••••••" value={form.password} onChange={handleChange} style={{ paddingRight: 44 }} autoComplete="current-password" />
                <button type="button" className="login-eye" onClick={() => setShowPass(v => !v)}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {tab === 'empresa' && (
              <div className="login-forgot"><a href="#">Esqueceu a senha?</a></div>
            )}

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? <><Loader2 size={15} className="spin" /> Verificando...</> : tab === 'adm' ? 'Acesso administrativo' : 'Entrar no painel'}
            </button>

            <div className="login-footer">Med Mag v2.0 · Plataforma exclusiva · Acesso restrito</div>
          </form>
          )}

          {/* Trial CTA — visível somente no tab empresa */}
          {tab === 'empresa' && !masterPick && (
            <TrialCTA compact />
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
