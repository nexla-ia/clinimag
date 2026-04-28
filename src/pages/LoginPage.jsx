import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, Loader2, ArrowLeft, Sparkles, Calendar, Bot, MessageSquare } from 'lucide-react'
import './LoginPage.css'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('empresa')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '' })

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
    if (result.ok) {
      navigate(tab === 'adm' ? '/adm' : '/painel')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="login-root">
      {/* Botão voltar */}
      <Link to="/" className="login-back">
        <ArrowLeft size={14} /> Voltar para o site
      </Link>

      <div className="login-shell">
        {/* COLUNA ESQUERDA — branding */}
        <div className="login-left">
          <Link to="/" className="login-brand">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 2 L26 14 L14 26 L2 14 Z" fill="url(#logingrad)" />
              <defs>
                <linearGradient id="logingrad" x1="0" y1="0" x2="28" y2="28">
                  <stop offset="0%" stopColor="#FDE047" />
                  <stop offset="50%" stopColor="#4ADE80" />
                  <stop offset="100%" stopColor="#22D3EE" />
                </linearGradient>
              </defs>
            </svg>
            <span>MedicinaMKT</span>
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
              <input className="login-input" type="email" name="email" placeholder={tab === 'adm' ? 'admin@medicinamkt.com' : 'usuario@empresa.com'} value={form.email} onChange={handleChange} autoComplete="email" />
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

            <div className="login-footer">MedicinaMKT v2.0 · Plataforma exclusiva · Acesso restrito</div>
          </form>
        </div>
      </div>
    </div>
  )
}
