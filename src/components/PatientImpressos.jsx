import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Printer, Trash2, FileText, Plus, Check } from 'lucide-react'

// Tipos de impresso disponíveis na ficha.
const DOC_TYPES = [
  { key: 'receituario', label: 'Receituário',           titulo: 'Receituário' },
  { key: 'exames',      label: 'Solicitação de exames', titulo: 'Solicitação de Exames' },
  { key: 'atestado',    label: 'Atestado',              titulo: 'Atestado Médico' },
  { key: 'declaracao',  label: 'Declaração',            titulo: 'Declaração' },
  { key: 'outros',      label: 'Outros',                titulo: 'Documento' },
]

function ageStr(birth) {
  if (!birth) return ''
  const b = new Date(birth)
  if (isNaN(b)) return ''
  const now = new Date()
  let anos = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) anos--
  return anos >= 0 ? `${anos} anos` : ''
}

function fmtCpf(cpf) {
  const d = (cpf || '').toString().replace(/\D/g, '')
  if (d.length !== 11) return cpf || ''
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export default function PatientImpressos({ patient, instance, company, professionals = [], user }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState('receituario')
  const [titulo, setTitulo] = useState('Receituário')
  const [corpo, setCorpo] = useState('')
  const [professionalName, setProfessionalName] = useState(user?.name || '')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  // Opções de impressão (o que ocultar)
  const [hideDate, setHideDate] = useState(false)
  const [hideCpf, setHideCpf] = useState(false)
  const [hideSign, setHideSign] = useState(false)

  useEffect(() => {
    if (!patient?.id) return
    supabase.from('patient_documents')
      .select('*')
      .eq('contact_id', patient.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setDocs(data)
        setLoading(false)
      })
  }, [patient?.id])

  function selectTipo(t) {
    setTipo(t.key)
    // Só troca o título se ainda estiver no título padrão (não sobrescreve edição manual).
    const curDef = DOC_TYPES.find(x => x.key === tipo)?.titulo
    if (!titulo.trim() || titulo === curDef) setTitulo(t.titulo)
  }

  function buildPrintHtml({ titulo, corpo, professionalName, createdAt }) {
    const esc = s => (s || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const dataStr = new Date(createdAt || Date.now())
      .toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const cidade = company?.city || company?.cidade || ''
    const idade = ageStr(patient?.birth_date)
    const cpf = patient?.cpf ? fmtCpf(patient.cpf) : ''
    const nasc = patient?.birth_date ? new Date(patient.birth_date).toLocaleDateString('pt-BR') : ''
    const clinicaLinha2 = [company?.address, company?.phone].filter(Boolean).map(esc).join(' · ')

    const patLinha = [
      idade ? `Idade: ${esc(idade)}` : '',
      (!hideCpf && cpf) ? `CPF: ${esc(cpf)}` : '',
      nasc ? `Nascimento: ${esc(nasc)}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 40px 46px; font-size: 14px; }
        .clinic { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 6px; }
        .clinic-name { font-size: 18px; font-weight: 800; letter-spacing: 0.01em; }
        .clinic-sub { font-size: 11px; color: #555; margin-top: 3px; }
        .doc-title { text-align: center; font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin: 22px 0 16px; }
        .pat { font-size: 13px; margin-bottom: 4px; }
        .pat b { font-weight: 700; }
        .pat-sub { font-size: 12px; color: #444; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #ddd; }
        .body { white-space: pre-wrap; line-height: 1.7; min-height: 320px; font-size: 15px; }
        .date-line { margin-top: 44px; text-align: right; font-size: 13px; }
        .sign { margin-top: 60px; text-align: center; }
        .sign-line { width: 320px; margin: 0 auto; border-top: 1px solid #111; padding-top: 6px; font-size: 13px; }
        .sign-role { font-size: 11px; color: #666; }
        @media print { @page { margin: 14mm; } body { padding: 0; } button { display: none; } }
      </style></head><body>
      <div class="clinic">
        <div class="clinic-name">${esc(company?.name || 'Clínica')}</div>
        ${clinicaLinha2 ? `<div class="clinic-sub">${clinicaLinha2}</div>` : ''}
      </div>
      <div class="doc-title">${esc(titulo)}</div>
      <div class="pat"><b>Paciente:</b> ${esc(patient?.nome || patient?.numero || '—')}</div>
      ${patLinha ? `<div class="pat-sub">${patLinha}</div>` : '<div class="pat-sub"></div>'}
      <div class="body">${esc(corpo)}</div>
      ${hideDate ? '' : `<div class="date-line">${cidade ? esc(cidade) + ', ' : ''}${dataStr}</div>`}
      ${hideSign ? '' : `<div class="sign">
        <div class="sign-line">
          ${esc(professionalName || '')}
          <div class="sign-role">Assinatura e carimbo do profissional</div>
        </div>
      </div>`}
      <script>window.onload = () => { window.print() }</script>
      </body></html>`
  }

  function doPrint(doc) {
    const w = window.open('', '_blank', 'width=820,height=1000')
    if (!w) { alert('Libere os pop-ups para imprimir.'); return }
    w.document.write(buildPrintHtml(doc))
    w.document.close()
  }

  function imprimirAtual() {
    if (!corpo.trim()) return
    doPrint({ titulo: titulo.trim() || 'Documento', corpo, professionalName, createdAt: Date.now() })
  }

  async function salvar(alsoPrint) {
    if (!corpo.trim() || saving || !patient?.id) return
    setSaving(true)
    const row = {
      instancia: instance,
      contact_id: patient.id,
      tipo,
      titulo: titulo.trim() || DOC_TYPES.find(t => t.key === tipo)?.titulo || 'Documento',
      corpo,
      professional_name: professionalName || null,
      created_by: user?.name || user?.email || null,
    }
    const { data, error } = await supabase.from('patient_documents').insert(row).select().single()
    setSaving(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setDocs(prev => [data, ...prev])
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000)
    if (alsoPrint) doPrint(data)
    setCorpo('')
  }

  async function excluir(docId) {
    setDocs(prev => prev.filter(d => d.id !== docId))
    await supabase.from('patient_documents').delete().eq('id', docId)
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 11px', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-primary)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Editor */}
      <div className="nx-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <FileText size={16} color="#2563EB" />
          <span style={{ fontSize: 14, fontWeight: 700 }}>Novo impresso</span>
        </div>

        {/* Tipo */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {DOC_TYPES.map(t => (
            <button key={t.key} onClick={() => selectTipo(t)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '6px 13px', borderRadius: 999, cursor: 'pointer',
                border: '1px solid ' + (tipo === t.key ? '#2563EB' : 'var(--border)'),
                background: tipo === t.key ? '#EFF6FF' : '#fff',
                color: tipo === t.key ? '#1D4ED8' : 'var(--text-secondary)',
              }}>{t.label}</button>
          ))}
        </div>

        {/* Título + profissional */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>TÍTULO</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} style={inputStyle} placeholder="Título do documento" />
          </div>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>PROFISSIONAL (assinatura)</label>
            {professionals.length > 0 ? (
              <select value={professionalName} onChange={e => setProfessionalName(e.target.value)} style={inputStyle}>
                <option value="">— selecione —</option>
                {user?.name && !professionals.some(p => p.name === user.name) && <option value={user.name}>{user.name}</option>}
                {professionals.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            ) : (
              <input value={professionalName} onChange={e => setProfessionalName(e.target.value)} style={inputStyle} placeholder="Nome do profissional" />
            )}
          </div>
        </div>

        {/* Corpo */}
        <textarea value={corpo} onChange={e => setCorpo(e.target.value)}
          placeholder="Escreva aqui o conteúdo do documento…"
          rows={9}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 160, lineHeight: 1.6 }} />

        {/* Opções de impressão */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '12px 2px 0' }}>
          {[
            { v: hideDate, set: setHideDate, l: 'Ocultar data na impressão' },
            { v: hideCpf, set: setHideCpf, l: 'Ocultar CPF na impressão' },
            { v: hideSign, set: setHideSign, l: 'Ocultar assinatura na impressão' },
          ].map((o, i) => (
            <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={o.v} onChange={e => o.set(e.target.checked)} />
              {o.l}
            </label>
          ))}
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          {savedFlash && <span style={{ fontSize: 12.5, color: '#16A34A', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'center' }}><Check size={14} /> Salvo</span>}
          <button className="nx-btn-ghost" onClick={imprimirAtual} disabled={!corpo.trim()}
            style={{ fontSize: 13, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: corpo.trim() ? 1 : 0.5 }}>
            <Printer size={15} /> Imprimir
          </button>
          <button className="nx-btn-primary" onClick={() => salvar(true)} disabled={!corpo.trim() || saving}
            style={{ fontSize: 13, padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {saving ? 'Salvando…' : <><Plus size={15} /> Salvar e imprimir</>}
          </button>
        </div>
      </div>

      {/* Histórico */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', margin: '2px 2px 10px' }}>
          Impressos salvos {docs.length > 0 && `(${docs.length})`}
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 12 }}>Carregando…</div>
        ) : docs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10 }}>
            Nenhum impresso ainda. Crie o primeiro acima.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map(d => (
              <div key={d.id} className="nx-card" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', color: '#2563EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileText size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.titulo || DOC_TYPES.find(t => t.key === d.tipo)?.titulo || 'Documento'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {new Date(d.created_at).toLocaleDateString('pt-BR')} {new Date(d.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {d.professional_name ? ` · ${d.professional_name}` : ''}
                  </div>
                </div>
                <button className="nx-btn-ghost" onClick={() => doPrint(d)} title="Imprimir"
                  style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                  <Printer size={14} /> Imprimir
                </button>
                <button onClick={() => excluir(d.id)} title="Excluir"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'inline-flex' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
