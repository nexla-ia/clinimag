import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { X, Eye, EyeOff, Loader2, KeyRound, CheckCircle2 } from 'lucide-react'

// Modal de troca de senha pelo próprio usuário.
export default function ChangePasswordModal({ onClose }) {
  const { changeOwnPassword } = useAuth()
  const [cur, setCur]         = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!cur || !next || !confirm) { setError('Preencha todos os campos.'); return }
    if (next.length < 6) { setError('A nova senha precisa ter pelo menos 6 caracteres.'); return }
    if (next !== confirm) { setError('A confirmação não bate com a nova senha.'); return }
    if (next === cur) { setError('A nova senha precisa ser diferente da atual.'); return }
    setLoading(true)
    const r = await changeOwnPassword(cur, next)
    setLoading(false)
    if (r.ok) { setDone(true); setTimeout(onClose, 1600) }
    else setError(r.error || 'Não consegui trocar a senha.')
  }

  const inputWrap = { position: 'relative', display: 'flex', alignItems: 'center' }
  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 40px 10px 12px',
    borderRadius: 9, border: '1px solid #E2E8F0', fontSize: 13.5, fontFamily: 'inherit',
    color: '#0F172A', outline: 'none', background: '#fff',
  }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16,
        boxShadow: '0 24px 60px rgba(0,0,0,0.24)', padding: 22, position: 'relative',
      }}>
        <button onClick={onClose} title="Fechar" style={{
          position: 'absolute', top: 14, right: 14, border: 'none', background: 'transparent',
          cursor: 'pointer', color: '#94A3B8', display: 'flex',
        }}><X size={18} /></button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={17} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Trocar senha</div>
        </div>
        <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 16 }}>
          Confirme sua senha atual e escolha uma nova.
        </div>

        {done ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 0 8px' }}>
            <CheckCircle2 size={40} color="#16A34A" />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Senha alterada!</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Use a nova senha no próximo login.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Senha atual</label>
              <div style={inputWrap}>
                <input type={show ? 'text' : 'password'} value={cur} onChange={e => setCur(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password" style={inputStyle} autoFocus />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nova senha</label>
              <div style={inputWrap}>
                <input type={show ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)}
                  placeholder="mínimo 6 caracteres" autoComplete="new-password" style={inputStyle} />
                <button type="button" onClick={() => setShow(v => !v)} title={show ? 'Ocultar' : 'Mostrar'}
                  style={{ position: 'absolute', right: 10, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', display: 'flex' }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Confirmar nova senha</label>
              <div style={inputWrap}>
                <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="repita a nova senha" autoComplete="new-password" style={inputStyle} />
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, borderRadius: 9, padding: '9px 11px', marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid #E2E8F0',
                background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button type="submit" disabled={loading} style={{
                flex: 1.4, padding: '10px 0', borderRadius: 10, border: 'none',
                background: loading ? '#93C5FD' : '#2563EB', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
                {loading ? <><Loader2 size={14} className="spin" /> Salvando...</> : 'Salvar nova senha'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
