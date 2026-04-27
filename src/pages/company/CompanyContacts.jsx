import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Contact2, Search, Pencil, Trash2, X, Plus, Phone, Copy, Check } from 'lucide-react'
import './Company.css'

export default function CompanyContacts() {
  const { session } = useAuth()
  const instance = session?.company?.instance

  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    supabase.from('saved_contacts').select('*')
      .eq('instancia', instance).order('nome', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setContacts(data)
        setLoading(false)
      })

    const ch = supabase.channel(`saved-contacts-${instance}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_contacts', filter: `instancia=eq.${instance}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setContacts(prev => prev.filter(c => c.id !== p.old.id))
          } else if (p.new) {
            setContacts(prev => {
              const exists = prev.find(c => c.id === p.new.id)
              if (exists) return prev.map(c => c.id === p.new.id ? p.new : c).sort((a, b) => a.nome.localeCompare(b.nome))
              return [...prev, p.new].sort((a, b) => a.nome.localeCompare(b.nome))
            })
          }
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [instance])

  function openNew() {
    setEditing({ numero: '', nome: '', notes: '' })
    setErr('')
  }

  function openEdit(contact) {
    setEditing({ ...contact })
    setErr('')
  }

  async function handleSave() {
    if (!editing.nome?.trim()) { setErr('Nome é obrigatório'); return }
    if (!editing.numero?.toString().trim()) { setErr('Número é obrigatório'); return }
    setSaving(true)
    const numero = editing.numero.toString().replace(/\D/g, '')
    const isNew = !editing.id
    const payload = {
      numero,
      instancia: instance,
      nome: editing.nome.trim(),
      notes: editing.notes?.trim() || null,
      created_by_email: session?.user?.email,
    }
    const { error } = isNew
      ? await supabase.from('saved_contacts').insert(payload)
      : await supabase.from('saved_contacts').update({ nome: payload.nome, notes: payload.notes }).eq('id', editing.id)
    setSaving(false)
    if (error) { setErr('Erro: ' + error.message); return }
    setEditing(null)
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este contato?')) return
    await supabase.from('saved_contacts').delete().eq('id', id)
  }

  function copyNumber(id, num) {
    navigator.clipboard.writeText(num).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  const filtered = contacts.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.numero.includes(search)
  )

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: 4 }}>
            Contatos
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {loading ? 'Carregando...' : `${contacts.length} contato${contacts.length === 1 ? '' : 's'} salvo${contacts.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <button className="nx-btn-primary" onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Novo contato
        </button>
      </div>

      <div className="nx-card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Search size={15} style={{ color: 'var(--text-muted)' }} />
        <input
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-primary)' }}
          placeholder="Buscar por nome ou número..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {!loading && filtered.length === 0 && (
        <div className="nx-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Contact2 size={28} style={{ opacity: 0.2 }} />
          <div style={{ fontSize: 14 }}>
            {search ? 'Nenhum contato encontrado.' : 'Nenhum contato salvo. Clique com o botão direito numa conversa para salvar.'}
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="nx-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Número</th>
                <th>Notas</th>
                <th style={{ textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td className="td-name">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: '#EFF6FF', border: '1px solid #BFDBFE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#2563EB',
                      }}>{c.nome.charAt(0).toUpperCase()}</div>
                      <span style={{ fontWeight: 500 }}>{c.nome}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Phone size={11} style={{ color: '#6B7280' }} />
                      {c.numero}
                      <button onClick={() => copyNumber(c.id, c.numero)}
                        title="Copiar número"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          background: copiedId === c.id ? '#F0FDF4' : 'transparent',
                          border: `1px solid ${copiedId === c.id ? '#BBF7D0' : 'var(--border)'}`,
                          color: copiedId === c.id ? '#16A34A' : '#6B7280',
                          borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        }}>
                        {copiedId === c.id ? <Check size={9} /> : <Copy size={9} />}
                      </button>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.notes || '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="table-action" onClick={() => openEdit(c)}>
                        <Pencil size={11} /> Editar
                      </button>
                      <button className="table-action danger" onClick={() => handleDelete(c.id)}>
                        <Trash2 size={11} /> Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          backdropFilter: 'blur(4px)', padding: '1.5rem',
        }}>
          <div className="nx-card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{editing.id ? 'Editar contato' : 'Novo contato'}</div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setEditing(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome</label>
                <input className="nx-input" autoFocus placeholder="Ex: João Silva"
                  value={editing.nome} onChange={e => setEditing(p => ({ ...p, nome: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Número</label>
                <input className="nx-input" placeholder="Ex: 5561991234567" disabled={!!editing.id}
                  value={editing.numero} onChange={e => setEditing(p => ({ ...p, numero: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas (opcional)</label>
                <textarea className="nx-input" rows={3} placeholder="Anotações sobre este contato..."
                  value={editing.notes || ''} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626', marginBottom: 12 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="nx-btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
                <button className="nx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
