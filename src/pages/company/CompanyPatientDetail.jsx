import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import ConfirmModal from '../../components/ConfirmModal'
import {
  ArrowLeft, Pencil, Camera, Phone, Mail, MapPin, Calendar, ShieldCheck,
  AlertTriangle, Pill, Heart, Cake, MessageSquare, X, Trash2, CreditCard,
  Activity, Briefcase, Users, Clock, CheckCircle2, XCircle, Clipboard,
  FileText, Plus, AlertCircle, Upload, Image, Download, ZoomIn,
} from 'lucide-react'
import { TagPicker, TagList, useContactTags } from '../../components/Tags'
import './CompanyPatientDetail.css'

const STATUS_META = {
  agendado:   { label: 'Agendado',   color: '#2563EB', bg: '#EFF6FF' },
  confirmado: { label: 'Confirmado', color: '#16A34A', bg: '#F0FDF4' },
  concluido:  { label: 'Concluído',  color: '#0891B2', bg: '#ECFEFF' },
  faltou:     { label: 'Faltou',     color: '#D97706', bg: '#FFFBEB' },
  cancelado:  { label: 'Cancelado',  color: '#DC2626', bg: '#FEF2F2' },
}

const GENDER_OPTIONS = ['Feminino', 'Masculino', 'Não-binário', 'Prefiro não informar']
const MARITAL_OPTIONS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)']
const BLOOD_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const REFERRAL_OPTIONS = ['Indicação', 'Instagram', 'Facebook', 'Google', 'Site', 'Convênio', 'Passou na frente', 'Outro']

function fmtCpf(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function calcAge(birth) {
  if (!birth) return null
  const dt = new Date(`${birth}T12:00:00`)
  if (isNaN(dt.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dt.getFullYear()
  const m = now.getMonth() - dt.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dt.getDate())) age--
  return age
}

function daysUntilBirthday(birth) {
  if (!birth) return null
  const dt = new Date(`${birth}T12:00:00`)
  if (isNaN(dt.getTime())) return null
  const now = new Date()
  const next = new Date(now.getFullYear(), dt.getMonth(), dt.getDate())
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next.setFullYear(now.getFullYear() + 1)
  }
  return Math.round((next - now) / 86400000) + (next.getDate() === now.getDate() && next.getMonth() === now.getMonth() ? 0 : 0)
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')
}

function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function CompanyPatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const instance = session?.company?.instance

  const [patient, setPatient] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [insurancePlans, setInsurancePlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumo')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [uploadApptId, setUploadApptId] = useState(null)
  const fileInputRef = useRef(null)
  const attachInputRef = useRef(null)
  const [anamneses, setAnamneses] = useState([])
  const [orcamentos, setOrcamentos] = useState([])
  const [procedures, setProcedures] = useState([])
  const [anamneseTemplates, setAnamneseTemplates] = useState([])
  const [anamneseModal, setAnamneseModal] = useState(null)
  const [orcamentoModal, setOrcamentoModal] = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('saved_contacts').select('*').eq('id', id).single(),
      supabase.from('insurance_plans').select('id, name').eq('instancia', instance),
    ]).then(([{ data: p }, { data: plans }]) => {
      if (p) {
        setPatient(p)
        if (p.numero) {
          // contact_numero nos appointments é salvo só com dígitos (sem @s.whatsapp.net)
          const numDigits = (p.numero || '').replace(/@.*$/, '').replace(/\D/g, '')
          supabase.from('appointments')
            .select('*, agendas(name, color), professionals(name)')
            .eq('instancia', instance)
            .eq('contact_numero', numDigits)
            .order('starts_at', { ascending: false })
            .then(({ data: ap }) => { if (ap) setAppointments(ap) })
          supabase.from('prontuario_attachments')
            .select('*')
            .eq('instancia', instance)
            .eq('contact_numero', numDigits)
            .order('uploaded_at', { ascending: false })
            .then(({ data: att }) => { if (att) setAttachments(att) })
        }
      supabase.from('anamnese_responses')
        .select('*').eq('instancia', instance).eq('contact_id', id)
        .order('filled_at', { ascending: false })
        .then(({ data: r }) => { if (r) setAnamneses(r) })
      supabase.from('orcamentos')
        .select('*, orcamento_items(*)')
        .eq('instancia', instance).eq('contact_id', id)
        .order('created_at', { ascending: false })
        .then(({ data: o }) => { if (o) setOrcamentos(o) })
      }
      if (plans) setInsurancePlans(plans)
      setLoading(false)
    })
    supabase.from('anamnese_templates')
      .select('*').eq('instancia', instance)
      .order('nome', { ascending: true })
      .then(({ data: t }) => { if (t) setAnamneseTemplates(t) })
    supabase.from('procedures')
      .select('id,name,price_particular')
      .eq('instancia', instance).order('name')
      .then(({ data: pr }) => { if (pr) setProcedures(pr) })
  }, [id, instance])

  async function handleAttachUpload(files) {
    if (!files?.length || !patient) return
    const numDigits = (patient.numero || '').replace(/@.*$/, '').replace(/\D/g, '')
    setUploading(true)
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()
      const uniqueName = `${instance}/${numDigits}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: storageErr } = await supabase.storage
        .from('prontuario')
        .upload(uniqueName, file, { contentType: file.type, upsert: false })
      if (storageErr) { console.error('upload:', storageErr); continue }
      const { data: { publicUrl } } = supabase.storage.from('prontuario').getPublicUrl(uniqueName)
      const { data: row } = await supabase.from('prontuario_attachments').insert({
        instancia: instance,
        contact_numero: numDigits,
        appointment_id: uploadApptId || null,
        file_path: publicUrl,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: session?.user?.name || session?.user?.email || null,
      }).select().single()
      if (row) setAttachments(prev => [row, ...prev])
    }
    setUploading(false)
    setUploadApptId(null)
  }

  async function handleDeleteAttachment(att) {
    const path = att.file_path.split('/prontuario/')[1]
    if (path) await supabase.storage.from('prontuario').remove([path])
    await supabase.from('prontuario_attachments').delete().eq('id', att.id)
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  async function handleDeleteAnamnese(resp) {
    if (!confirm('Apagar esta anamnese? Esta ação não pode ser desfeita.')) return
    await supabase.from('anamnese_responses').delete().eq('id', resp.id)
    setAnamneses(prev => prev.filter(r => r.id !== resp.id))
  }

  async function handleSaveAnamnese(templateName, templateId, questions, answers) {
    const numDigits = (patient.numero || '').replace(/@.*$/, '').replace(/\D/g, '')
    const { data } = await supabase.from('anamnese_responses').insert({
      instancia: instance,
      contact_id: id,
      contact_numero: numDigits,
      template_id: templateId || null,
      template_name: templateName,
      questions,
      answers,
      filled_by: session?.user?.name || session?.user?.email || null,
      filled_at: new Date().toISOString(),
    }).select().single()
    if (data) setAnamneses(prev => [data, ...prev])
    setAnamneseModal(null)
  }

  async function handleCreateTemplate(nome, questions) {
    const { data, error } = await supabase.from('anamnese_templates').insert({
      instancia: instance,
      nome,
      questions,
      created_by: session?.user?.name || session?.user?.email || null,
    }).select().single()
    if (error || !data) {
      alert('Erro ao salvar modelo: ' + (error?.message || 'tente novamente'))
      return null
    }
    setAnamneseTemplates(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    return data
  }

  async function handleDeleteOrcamento(orc) {
    if (!confirm('Apagar este orçamento? Esta ação não pode ser desfeita.')) return
    await supabase.from('orcamentos').delete().eq('id', orc.id)
    setOrcamentos(prev => prev.filter(o => o.id !== orc.id))
  }

  async function handleSaveOrcamento(form) {
    const numDigits = (patient.numero || '').replace(/@.*$/, '').replace(/\D/g, '')
    const { data: orc, error } = await supabase.from('orcamentos').insert({
      instancia: instance,
      contact_id: id,
      contact_numero: numDigits,
      status: form.status,
      desconto: parseFloat(form.desconto) || 0,
      entrada: parseFloat(form.entrada) || 0,
      parcelas: parseInt(form.parcelas) || 1,
      notes: form.notes?.trim() || null,
      created_by: session?.user?.name || session?.user?.email || null,
    }).select().single()
    if (error || !orc) {
      alert('Erro ao salvar orçamento: ' + (error?.message || 'tente novamente'))
      return false
    }
    const validItems = form.items.filter(it => it.procedimento?.trim())
    let savedItems = []
    if (validItems.length > 0) {
      const { data } = await supabase.from('orcamento_items').insert(
        validItems.map((it, i) => ({
          orcamento_id: orc.id,
          procedimento: it.procedimento.trim(),
          dente: it.dente?.trim() || null,
          faces: it.faces?.trim() || null,
          valor: parseFloat(it.valor) || 0,
          ordem: i,
        }))
      ).select()
      savedItems = data || []
    }
    const saved = { ...orc, orcamento_items: savedItems }
    setOrcamentos(prev => [saved, ...prev])
    setOrcamentoModal(null)
    return saved
  }

  function printOrcamento(orc, pat) {
    const items = orc.orcamento_items || []
    const subtotal = items.reduce((s, it) => s + Number(it.valor || 0), 0)
    const desconto = Number(orc.desconto || 0)
    const total = subtotal - desconto
    const parcelas = Number(orc.parcelas || 1)
    const entrada = Number(orc.entrada || 0)
    const parcVal = parcelas > 0 && (total - entrada) > 0 ? (total - entrada) / parcelas : 0
    const fmt = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
    const fmtD = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
    const w = window.open('', '_blank', 'width=750,height=900')
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Orçamento</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f3f4f6; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; border: 1px solid #e5e7eb; }
        td { padding: 8px 10px; border: 1px solid #e5e7eb; }
        .totals { margin-left: auto; width: 260px; }
        .totals td { border: none; }
        .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #111; }
        .footer { margin-top: 32px; font-size: 11px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 12px; }
        @media print { button { display: none; } }
      </style></head><body>
      <h1>Orçamento</h1>
      <div class="sub">
        Paciente: <strong>${pat?.nome || pat?.numero || '—'}</strong> &nbsp;·&nbsp;
        Data: ${fmtD(orc.created_at)} &nbsp;·&nbsp;
        Status: ${orc.status}
        ${orc.created_by ? ' &nbsp;·&nbsp; Por: ' + orc.created_by : ''}
      </div>
      <table>
        <thead><tr><th>#</th><th>Procedimento</th><th>Dente</th><th>Faces</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>
          ${items.map((it, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${it.procedimento || '—'}</td>
              <td>${it.dente || '—'}</td>
              <td>${it.faces || '—'}</td>
              <td style="text-align:right">${fmt(it.valor)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Subtotal</td><td style="text-align:right">${fmt(subtotal)}</td></tr>
        ${desconto > 0 ? `<tr><td style="color:#dc2626">Desconto</td><td style="text-align:right;color:#dc2626">− ${fmt(desconto)}</td></tr>` : ''}
        <tr class="total-row"><td>Total</td><td style="text-align:right">${fmt(total)}</td></tr>
        ${entrada > 0 ? `<tr><td style="font-size:11px;color:#666">Entrada</td><td style="text-align:right;font-size:11px;color:#666">${fmt(entrada)}</td></tr>` : ''}
        ${parcelas > 1 ? `<tr><td style="font-size:11px;color:#666">${parcelas}x de</td><td style="text-align:right;font-size:11px;color:#666">${fmt(parcVal)}</td></tr>` : ''}
      </table>
      ${orc.notes ? `<div style="font-size:12px;color:#555;margin-top:8px"><strong>Obs:</strong> ${orc.notes}</div>` : ''}
      <div class="footer">Documento gerado em ${new Date().toLocaleString('pt-BR')}</div>
      <script>window.onload = () => { window.print() }</script>
      </body></html>`)
    w.document.close()
  }

  async function handleUpdateOrcamentoStatus(orcId, newStatus) {
    const updates = { status: newStatus, ...(newStatus === 'aprovado' ? { approved_at: new Date().toISOString() } : {}) }
    await supabase.from('orcamentos').update(updates).eq('id', orcId)
    setOrcamentos(prev => prev.map(o => o.id === orcId ? { ...o, ...updates } : o))

    // Ao aprovar: gera lançamentos no financeiro (a receber) se ainda não existirem
    if (newStatus === 'aprovado') {
      const { count } = await supabase.from('financial_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('orcamento_id', orcId)
      if (count > 0) return // já foi gerado anteriormente

      const orc = orcamentos.find(o => o.id === orcId)
      if (!orc) return
      const items = orc.orcamento_items || []
      const subtotal = items.reduce((s, it) => s + Number(it.valor || 0), 0)
      const desconto = Number(orc.desconto || 0)
      const total = subtotal - desconto
      const entrada = Number(orc.entrada || 0)
      const nParcelas = Math.max(1, Number(orc.parcelas || 1))
      const valorParcela = (total - entrada) / nParcelas
      const grupoId = crypto.randomUUID()
      const today = new Date()
      const isoDate = (d) => d.toISOString().split('T')[0]
      const procedDesc = items.map(it => it.procedimento).filter(Boolean).join(', ') || 'Orçamento aprovado'
      const patNome = patient?.nome || patient?.numero || null

      const rows = []

      if (entrada > 0) {
        rows.push({
          instancia: instance, tipo: 'receita',
          descricao: `Entrada — ${procedDesc}`,
          valor: entrada, status: 'pendente',
          vencimento: isoDate(today),
          parcela_atual: 0, total_parcelas: nParcelas,
          grupo_parcelas: grupoId,
          contact_id: orc.contact_id, contact_nome: patNome,
          orcamento_id: orcId,
          created_by: session?.user?.name || session?.user?.email || null,
        })
      }

      for (let i = 0; i < nParcelas; i++) {
        const venc = new Date(today)
        venc.setMonth(venc.getMonth() + i + (entrada > 0 ? 1 : 0))
        rows.push({
          instancia: instance, tipo: 'receita',
          descricao: nParcelas > 1
            ? `${procedDesc} (${i + 1}/${nParcelas})`
            : procedDesc,
          valor: valorParcela, status: 'pendente',
          vencimento: isoDate(venc),
          parcela_atual: i + 1, total_parcelas: nParcelas,
          grupo_parcelas: grupoId,
          contact_id: orc.contact_id, contact_nome: patNome,
          orcamento_id: orcId,
          created_by: session?.user?.name || session?.user?.email || null,
        })
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('financial_transactions').insert(rows)
        if (!error) {
          alert(`✅ ${rows.length} lançamento(s) criado(s) no Financeiro como "a receber".`)
        }
      }
    }
  }

  function startEdit() {
    setEditing({ ...patient })
    setErr('')
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 500 * 1024) {
      setErr('Foto muito grande (máx 500KB)')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      setEditing(p => ({ ...p, photo: ev.target.result }))
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!editing.nome?.trim()) { setErr('Nome é obrigatório'); return }
    setSaving(true)
    const numero = editing.numero?.toString().replace(/\D/g, '') || ''
    const cpf = editing.cpf?.toString().replace(/\D/g, '') || null
    const payload = {
      numero,
      nome: editing.nome.trim(),
      nome_social: editing.nome_social?.trim() || null,
      cpf,
      rg: editing.rg?.trim() || null,
      birth_date: editing.birth_date || null,
      gender: editing.gender || null,
      marital_status: editing.marital_status || null,
      profession: editing.profession?.trim() || null,
      email: editing.email?.trim() || null,
      address: editing.address?.trim() || null,
      phone_secondary: editing.phone_secondary?.replace(/\D/g, '') || null,
      emergency_contact: editing.emergency_contact?.trim() || null,
      emergency_phone: editing.emergency_phone?.replace(/\D/g, '') || null,
      guardian_name: editing.guardian_name?.trim() || null,
      guardian_phone: editing.guardian_phone?.replace(/\D/g, '') || null,
      insurance_plan_id: editing.insurance_plan_id || null,
      insurance_card: editing.insurance_card?.trim() || null,
      blood_type: editing.blood_type || null,
      weight: editing.weight ? parseFloat(editing.weight) : null,
      height: editing.height ? parseFloat(editing.height) : null,
      allergies: editing.allergies?.trim() || null,
      chronic_conditions: editing.chronic_conditions?.trim() || null,
      medications: editing.medications?.trim() || null,
      clinical_notes: editing.clinical_notes?.trim() || null,
      referral_source: editing.referral_source || null,
      notes: editing.notes?.trim() || null,
      photo: editing.photo || null,
    }
    const { error } = await supabase.from('saved_contacts').update(payload).eq('id', id)
    setSaving(false)
    if (error) { setErr('Erro: ' + error.message); return }
    setPatient(prev => ({ ...prev, ...payload }))
    setEditing(null)
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('saved_contacts').delete().eq('id', id)
    setDeleting(false)
    navigate('/painel/contatos')
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Carregando ficha...</div>
  if (!patient) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
      <div>Paciente não encontrado.</div>
      <button className="nx-btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/painel/contatos')}>
        <ArrowLeft size={14} /> Voltar
      </button>
    </div>
  )

  const age = calcAge(patient.birth_date)
  const daysToBirthday = daysUntilBirthday(patient.birth_date)
  const isBirthdayWeek = daysToBirthday !== null && daysToBirthday >= 0 && daysToBirthday <= 7
  const plan = insurancePlans.find(p => p.id === patient.insurance_plan_id)

  const futureAppts = appointments.filter(a => new Date(a.starts_at) > new Date() && a.status !== 'cancelado')
  const pastAppts = appointments.filter(a => new Date(a.starts_at) <= new Date() || a.status === 'cancelado')
  const concluded = appointments.filter(a => a.status === 'concluido').length
  const totalSpent = appointments.filter(a => a.payment_status === 'pago').reduce((s, a) => s + Number(a.price || 0), 0)

  return (
    <div className="pat-root">
      {/* Voltar */}
      <button className="pat-back" onClick={() => navigate('/painel/contatos')}>
        <ArrowLeft size={14} /> Voltar para Pacientes
      </button>

      {/* Banner aniversário */}
      {isBirthdayWeek && (
        <div className="pat-bday-banner">
          <Cake size={18} />
          <div>
            <strong>Aniversariante!</strong>
            <span>
              {daysToBirthday === 0
                ? `Hoje é o aniversário de ${patient.nome.split(' ')[0]} 🎉`
                : daysToBirthday === 1
                  ? `Amanhã é o aniversário de ${patient.nome.split(' ')[0]}`
                  : `Faltam ${daysToBirthday} dias para o aniversário de ${patient.nome.split(' ')[0]}`}
              {age != null && ` — vai fazer ${age + (daysToBirthday > 0 ? 1 : 0)} anos.`}
            </span>
          </div>
        </div>
      )}

      {/* Cabeçalho da ficha */}
      <div className="pat-header">
        <div className="pat-photo">
          {patient.photo ? (
            <img src={patient.photo} alt={patient.nome} />
          ) : (
            <span>{patient.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="pat-header-info">
          <h1 className="pat-name">{patient.nome}</h1>
          <div className="pat-meta">
            {age != null && <span>{age} anos</span>}
            {patient.gender && <span>· {patient.gender}</span>}
            {plan ? <span>· <ShieldCheck size={12} style={{ verticalAlign: 'middle' }} /> {plan.name}</span> : <span>· Particular</span>}
            {patient.profession && <span>· {patient.profession}</span>}
          </div>
          <PatientTagsRow instancia={instance} numero={patient.numero} userEmail={session?.user?.email} />
          <div className="pat-actions">
            {patient.numero && (
              <button className="pat-btn pat-btn-primary" onClick={() => navigate(`/painel/conversas?contact=${patient.numero}`)}>
                <MessageSquare size={14} /> Conversar
              </button>
            )}
            {patient.numero && (
              <button className="pat-btn pat-btn-ghost" onClick={() => navigate(`/painel/agenda?numero=${patient.numero}&nome=${encodeURIComponent(patient.nome)}`)}>
                <Calendar size={14} /> Agendar
              </button>
            )}
            <button className="pat-btn pat-btn-ghost" onClick={startEdit}>
              <Pencil size={14} /> Editar ficha
            </button>
            <button className="pat-btn pat-btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pat-tabs">
        {[
          { key: 'resumo',      label: 'Resumo' },
          { key: 'cadastro',    label: 'Cadastro' },
          { key: 'saude',       label: 'Saúde' },
          { key: 'prontuario',  label: `Prontuário (${appointments.filter(a => a.prontuario).length})` },
          { key: 'anamneses',   label: `Anamneses (${anamneses.length})` },
          { key: 'orcamentos',  label: `Orçamentos (${orcamentos.length})` },
          { key: 'historico',   label: `Histórico (${appointments.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`pat-tab ${tab === t.key ? 'active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === 'resumo' && (
        <div className="pat-resumo">
          <div className="pat-kpi-row">
            <KpiCard
              icon={<Calendar size={18} />}
              color="#2563EB"
              bg="#EFF6FF"
              label="Próxima consulta"
              value={futureAppts.length ? new Date(futureAppts[futureAppts.length - 1].starts_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
              sub={futureAppts.length ? new Date(futureAppts[futureAppts.length - 1].starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Sem agendamento'}
            />
            <KpiCard
              icon={<CheckCircle2 size={18} />}
              color="#16A34A"
              bg="#F0FDF4"
              label="Consultas realizadas"
              value={concluded}
              sub={`de ${appointments.length} agendamentos`}
            />
            <KpiCard
              icon={<Activity size={18} />}
              color="#7C3AED"
              bg="#F5F3FF"
              label="Total pago"
              value={`R$ ${totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`}
              sub="histórico do paciente"
            />
            <KpiCard
              icon={<Clock size={18} />}
              color="#D97706"
              bg="#FFFBEB"
              label="Cadastrado em"
              value={fmtDate(patient.created_at?.split('T')[0])}
              sub="há tempos com a gente"
            />
          </div>

          {patient.notes && (
            <div className="pat-section-card">
              <SectionTitle icon={Clipboard} title="Notas internas" />
              <p className="pat-text">{patient.notes}</p>
            </div>
          )}

          <div className="pat-resumo-grid">
            <div className="pat-section-card">
              <SectionTitle icon={Phone} title="Contato rápido" />
              <Field label="Telefone principal" value={patient.numero || '—'} mono />
              {patient.phone_secondary && <Field label="Telefone secundário" value={patient.phone_secondary} mono />}
              {patient.email && <Field label="E-mail" value={patient.email} />}
              {patient.emergency_phone && <Field label="Contato de emergência" value={`${patient.emergency_contact || ''} · ${patient.emergency_phone}`} />}
            </div>

            <div className="pat-section-card">
              <SectionTitle icon={Heart} title="Resumo de saúde" />
              {!patient.allergies && !patient.chronic_conditions && !patient.medications ? (
                <p className="pat-empty">Sem informações de saúde cadastradas.</p>
              ) : (
                <>
                  {patient.allergies && (
                    <div className="pat-health-tag pat-health-allergy">
                      <AlertTriangle size={12} /> <strong>Alergias:</strong> {patient.allergies}
                    </div>
                  )}
                  {patient.chronic_conditions && (
                    <div className="pat-health-tag pat-health-chronic">
                      <Activity size={12} /> <strong>Crônicas:</strong> {patient.chronic_conditions}
                    </div>
                  )}
                  {patient.medications && (
                    <div className="pat-health-tag pat-health-meds">
                      <Pill size={12} /> <strong>Medicamentos:</strong> {patient.medications}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'cadastro' && (
        <div className="pat-resumo">
          <div className="pat-section-card">
            <SectionTitle icon={CreditCard} title="Identificação" />
            <FieldGrid>
              <Field label="Nome completo" value={patient.nome} large />
              {patient.nome_social && <Field label="Nome social" value={patient.nome_social} large />}
              <Field label="CPF" value={patient.cpf ? fmtCpf(patient.cpf) : '—'} mono />
              <Field label="RG" value={patient.rg || '—'} mono />
              <Field label="Data de nascimento" value={patient.birth_date ? `${fmtDate(patient.birth_date)} (${age} anos)` : '—'} />
              <Field label="Gênero" value={patient.gender || '—'} />
              <Field label="Estado civil" value={patient.marital_status || '—'} />
              <Field label="Profissão" value={patient.profession || '—'} />
              <Field label="Origem / Indicação" value={patient.referral_source || '—'} />
            </FieldGrid>
          </div>

          <div className="pat-section-card">
            <SectionTitle icon={Phone} title="Contato" />
            <FieldGrid>
              <Field label="Telefone principal (WhatsApp)" value={patient.numero || '—'} mono />
              <Field label="Telefone secundário" value={patient.phone_secondary || '—'} mono />
              <Field label="E-mail" value={patient.email || '—'} />
              <Field label="Endereço" value={patient.address || '—'} large />
              <Field label="Contato de emergência" value={patient.emergency_contact || '—'} />
              <Field label="Telefone de emergência" value={patient.emergency_phone || '—'} mono />
              <Field label="Responsável legal" value={patient.guardian_name || '—'} />
              <Field label="Telefone do responsável" value={patient.guardian_phone || '—'} mono />
            </FieldGrid>
          </div>

          <div className="pat-section-card">
            <SectionTitle icon={Activity} title="Antropometria" />
            <FieldGrid>
              <Field label="Tipo sanguíneo" value={patient.blood_type || '—'} />
              <Field label="Peso" value={patient.weight ? `${patient.weight} kg` : '—'} />
              <Field label="Altura" value={patient.height ? `${patient.height} m` : '—'} />
              {patient.weight && patient.height && (
                <Field label="IMC" value={`${(patient.weight / (patient.height * patient.height)).toFixed(1)}`} />
              )}
            </FieldGrid>
          </div>

          <div className="pat-section-card">
            <SectionTitle icon={ShieldCheck} title="Convênio" />
            <FieldGrid>
              <Field label="Plano" value={plan?.name || 'Particular'} />
              <Field label="Carteirinha" value={patient.insurance_card || '—'} mono />
            </FieldGrid>
          </div>
        </div>
      )}

      {tab === 'saude' && (
        <div className="pat-resumo">
          <div className="pat-section-card">
            <SectionTitle icon={AlertTriangle} title="Alergias" />
            <p className="pat-text-block">{patient.allergies || 'Sem alergias registradas.'}</p>
          </div>
          <div className="pat-section-card">
            <SectionTitle icon={Activity} title="Condições crônicas" />
            <p className="pat-text-block">{patient.chronic_conditions || 'Sem condições crônicas registradas.'}</p>
          </div>
          <div className="pat-section-card">
            <SectionTitle icon={Pill} title="Medicamentos em uso" />
            <p className="pat-text-block">{patient.medications || 'Sem medicamentos registrados.'}</p>
          </div>
          <div className="pat-section-card">
            <SectionTitle icon={FileText} title="Observações clínicas" />
            <p className="pat-text-block">{patient.clinical_notes || 'Sem observações clínicas.'}</p>
          </div>
        </div>
      )}

      {tab === 'prontuario' && (
        <div className="pat-resumo">
          {/* Resumo de saúde rápido */}
          {(patient.blood_type || patient.allergies || patient.medications || patient.chronic_conditions) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {patient.blood_type && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA' }}>
                  🩸 {patient.blood_type}
                </span>
              )}
              {patient.allergies && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:999, background:'#FFFBEB', color:'#D97706', border:'1px solid #FDE68A' }}>
                  <AlertTriangle size={10} /> Alergia: {patient.allergies.slice(0,40)}{patient.allergies.length>40?'…':''}
                </span>
              )}
              {patient.medications && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:999, background:'#F0FDF4', color:'#16A34A', border:'1px solid #BBF7D0' }}>
                  <Pill size={10} /> Medicamentos em uso
                </span>
              )}
              {patient.chronic_conditions && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:999, background:'#F5F3FF', color:'#7C3AED', border:'1px solid #DDD6FE' }}>
                  <Activity size={10} /> {patient.chronic_conditions.slice(0,40)}{patient.chronic_conditions.length>40?'…':''}
                </span>
              )}
            </div>
          )}

          {/* Upload geral */}
          <div className="pat-section-card" style={{ padding: '12px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'inline-flex', alignItems:'center', gap:6 }}>
                <Image size={13} /> Fotos e documentos — {attachments.length} arquivo(s)
              </div>
              <button
                onClick={() => { setUploadApptId(null); attachInputRef.current?.click() }}
                disabled={uploading}
                style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#0891B2', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', opacity: uploading?0.6:1 }}>
                <Upload size={12} /> {uploading ? 'Enviando...' : 'Adicionar arquivo'}
              </button>
            </div>
            <input ref={attachInputRef} type="file" multiple accept="image/*,application/pdf,video/mp4,video/quicktime,.doc,.docx"
              style={{ display:'none' }} onChange={e => handleAttachUpload(e.target.files)} />

            {attachments.length > 0 && (
              <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(88px, 1fr))', gap:8 }}>
                {attachments.filter(a => !a.appointment_id).map(att => (
                  <AttachmentThumb key={att.id} att={att} onZoom={setLightbox} onDelete={handleDeleteAttachment} />
                ))}
              </div>
            )}
          </div>

          {/* Consultas com prontuário e fotos */}
          {appointments.filter(a => a.prontuario || attachments.some(att => att.appointment_id === a.id)).length === 0 ? (
            <div className="pat-empty-card">
              <FileText size={28} style={{ opacity:0.2 }} />
              <span>Nenhum registro ainda. Preencha o campo Prontuário ao salvar um agendamento ou adicione fotos acima.</span>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {appointments.filter(a => a.prontuario || attachments.some(att => att.appointment_id === a.id)).map(a => {
                const status = STATUS_META[a.status] || STATUS_META.agendado
                const apptAtts = attachments.filter(att => att.appointment_id === a.id)
                return (
                  <div key={a.id} className="pat-section-card" style={{ borderLeft:`4px solid ${status.color}`, padding:'14px 16px' }}>
                    {/* Cabeçalho da consulta */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:10 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:999, fontWeight:700, background:status.bg, color:status.color }}>
                          {status.label}
                        </span>
                        <span style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>
                          {fmtDateTime(a.starts_at)}
                        </span>
                        {a.agendas?.name && <span style={{ fontSize:11, color:'var(--text-muted)' }}>· {a.agendas.name}</span>}
                        {a.professionals?.name && <span style={{ fontSize:11, color:'var(--text-muted)' }}>· {a.professionals.name}</span>}
                      </div>
                      <button
                        onClick={() => { setUploadApptId(a.id); attachInputRef.current?.click() }}
                        style={{ display:'inline-flex', alignItems:'center', gap:5, background:'transparent', border:'1px solid #BAE6FD', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:600, color:'#0891B2', cursor:'pointer' }}>
                        <Upload size={11} /> Foto desta consulta
                      </button>
                    </div>

                    {/* Texto do prontuário */}
                    {a.prontuario && (
                      <p style={{ margin:'0 0 10px', fontSize:13, color:'var(--text-secondary)', lineHeight:1.75, whiteSpace:'pre-wrap' }}>
                        {a.prontuario}
                      </p>
                    )}
                    {a.prontuario_by && (
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom: apptAtts.length ? 10 : 0 }}>
                        Registrado por <strong>{a.prontuario_by}</strong>{a.prontuario_at ? ` em ${fmtDateTime(a.prontuario_at)}` : ''}
                      </div>
                    )}

                    {/* Fotos desta consulta */}
                    {apptAtts.length > 0 && (
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(88px, 1fr))', gap:8, marginTop:8 }}>
                        {apptAtts.map(att => (
                          <AttachmentThumb key={att.id} att={att} onZoom={setLightbox} onDelete={handleDeleteAttachment} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'anamneses' && (
        <div className="pat-resumo">
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button
              onClick={() => setAnamneseModal({ step: 'select' })}
              style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#2563EB', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              <Plus size={14} /> Nova anamnese
            </button>
          </div>
          {anamneses.length === 0 ? (
            <div className="pat-empty-card">
              <Clipboard size={28} style={{ opacity:0.2 }} />
              <span>Nenhuma anamnese preenchida ainda. Clique em "Nova anamnese" para começar.</span>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {anamneses.map(resp => (
                <div key={resp.id} className="pat-section-card">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:'var(--text-primary)' }}>{resp.template_name || 'Anamnese'}</div>
                      <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                        Preenchida por <strong>{resp.filled_by || '—'}</strong> em {fmtDateTime(resp.filled_at)}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteAnamnese(resp)}
                      style={{ background:'transparent', border:'1px solid #FCA5A5', borderRadius:6, padding:'5px 7px', cursor:'pointer', color:'#DC2626', display:'flex', alignItems:'center' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {(resp.questions || []).map(q => {
                    const ans = (resp.answers || {})[q.id]
                    if (!ans) return null
                    return (
                      <div key={q.id} style={{ borderTop:'1px solid var(--border)', paddingTop:10, marginTop:10 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', marginBottom:6 }}>{q.text}</div>
                        {q.type === 'yes_no_dontknow' && ans.value && (
                          <span style={{ fontSize:11, padding:'2px 10px', borderRadius:6, fontWeight:700,
                            background: ans.value==='sim' ? '#FEF2F2' : ans.value==='nao' ? '#F0FDF4' : '#F9FAFB',
                            color: ans.value==='sim' ? '#DC2626' : ans.value==='nao' ? '#16A34A' : '#6B7280' }}>
                            {ans.value==='sim' ? 'Sim' : ans.value==='nao' ? 'Não' : 'Não sei'}
                          </span>
                        )}
                        {ans.detail && <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:6, whiteSpace:'pre-wrap' }}>{ans.detail}</div>}
                        {q.type === 'text' && ans.value && <div style={{ fontSize:12, color:'var(--text-secondary)', whiteSpace:'pre-wrap' }}>{ans.value}</div>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'orcamentos' && (
        <div className="pat-resumo">
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button
              onClick={() => setOrcamentoModal({ items:[{ procedimento:'', dente:'', faces:'', valor:'' }], status:'pendente', desconto:'', entrada:'', parcelas:'1', notes:'' })}
              style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#2563EB', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              <Plus size={14} /> Criar orçamento
            </button>
          </div>
          {orcamentos.length === 0 ? (
            <div className="pat-empty-card">
              <FileText size={28} style={{ opacity:0.2 }} />
              <span>Nenhum orçamento criado ainda. Clique em "Criar orçamento" para começar.</span>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {orcamentos.map(orc => {
                const items = orc.orcamento_items || []
                const subtotal = items.reduce((s, it) => s + Number(it.valor || 0), 0)
                const desconto = Number(orc.desconto || 0)
                const total = subtotal - desconto
                const parcelas = Number(orc.parcelas || 1)
                const entrada = Number(orc.entrada || 0)
                const parcVal = parcelas > 0 && (total - entrada) > 0 ? (total - entrada) / parcelas : 0
                const orcStatus = { pendente:{ label:'Pendente', color:'#D97706', bg:'#FFFBEB' }, aprovado:{ label:'Aprovado', color:'#16A34A', bg:'#F0FDF4' }, recusado:{ label:'Recusado', color:'#DC2626', bg:'#FEF2F2' } }[orc.status] || { label:orc.status, color:'#6B7280', bg:'#F9FAFB' }
                return (
                  <div key={orc.id} className="pat-section-card">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:10, padding:'3px 10px', borderRadius:999, fontWeight:700, background:orcStatus.bg, color:orcStatus.color }}>{orcStatus.label}</span>
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>por {orc.created_by || '—'} · {fmtDateTime(orc.created_at)}</span>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        {orc.status !== 'aprovado' && (
                          <button onClick={() => handleUpdateOrcamentoStatus(orc.id, 'aprovado')}
                            style={{ fontSize:11, padding:'4px 10px', background:'#F0FDF4', color:'#16A34A', border:'1px solid #BBF7D0', borderRadius:6, cursor:'pointer', fontWeight:600 }}>
                            Aprovar
                          </button>
                        )}
                        {orc.status !== 'recusado' && (
                          <button onClick={() => handleUpdateOrcamentoStatus(orc.id, 'recusado')}
                            style={{ fontSize:11, padding:'4px 10px', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FCA5A5', borderRadius:6, cursor:'pointer', fontWeight:600 }}>
                            Recusar
                          </button>
                        )}
                        <button onClick={() => printOrcamento(orc, patient)}
                          style={{ fontSize:11, padding:'4px 10px', background:'#F1F5F9', color:'#475569', border:'1px solid #E2E8F0', borderRadius:6, cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                          🖨️ Imprimir
                        </button>
                        <button onClick={() => handleDeleteOrcamento(orc)}
                          style={{ background:'transparent', border:'1px solid #FCA5A5', borderRadius:6, padding:'4px 7px', cursor:'pointer', color:'#DC2626', display:'flex', alignItems:'center' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    {items.length > 0 && (
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:12 }}>
                        <thead>
                          <tr style={{ borderBottom:'2px solid var(--border)' }}>
                            <th style={{ textAlign:'left', padding:'4px 6px', color:'var(--text-muted)', fontWeight:600 }}>Procedimento</th>
                            <th style={{ textAlign:'left', padding:'4px 6px', color:'var(--text-muted)', fontWeight:600, width:60 }}>Dente</th>
                            <th style={{ textAlign:'left', padding:'4px 6px', color:'var(--text-muted)', fontWeight:600, width:60 }}>Faces</th>
                            <th style={{ textAlign:'right', padding:'4px 6px', color:'var(--text-muted)', fontWeight:600, width:100 }}>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.sort((a,b) => a.ordem - b.ordem).map(it => (
                            <tr key={it.id} style={{ borderBottom:'1px solid var(--border)' }}>
                              <td style={{ padding:'7px 6px', color:'var(--text-primary)' }}>{it.procedimento}</td>
                              <td style={{ padding:'7px 6px', color:'var(--text-secondary)' }}>{it.dente || '—'}</td>
                              <td style={{ padding:'7px 6px', color:'var(--text-secondary)' }}>{it.faces || '—'}</td>
                              <td style={{ padding:'7px 6px', textAlign:'right', fontWeight:600 }}>R$ {Number(it.valor).toLocaleString('pt-BR', { minimumFractionDigits:2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div style={{ display:'flex', justifyContent:'flex-end' }}>
                      <div style={{ minWidth:220, fontSize:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'var(--text-secondary)' }}>
                          <span>Subtotal</span><span>R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
                        </div>
                        {desconto > 0 && (
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'#DC2626' }}>
                            <span>Desconto</span><span>− R$ {desconto.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
                          </div>
                        )}
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderTop:'2px solid var(--border)', fontWeight:700, fontSize:14 }}>
                          <span>Total</span><span>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
                        </div>
                        {entrada > 0 && (
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'var(--text-secondary)', fontSize:11 }}>
                            <span>Entrada</span><span>R$ {entrada.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
                          </div>
                        )}
                        {parcelas > 1 && (
                          <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'var(--text-secondary)', fontSize:11 }}>
                            <span>{parcelas}x</span><span>R$ {parcVal.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {orc.notes && <div style={{ marginTop:10, padding:'8px 10px', background:'#F9FAFB', borderRadius:6, fontSize:12, color:'var(--text-secondary)' }}>{orc.notes}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={lightbox} alt="" style={{ maxWidth:'92vw', maxHeight:'92vh', borderRadius:8, objectFit:'contain' }} />
          <button onClick={() => setLightbox(null)}
            style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.12)', border:'none', borderRadius:'50%', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff' }}>
            <X size={18} />
          </button>
        </div>
      )}

      {tab === 'historico' && (
        <div className="pat-timeline">
          {appointments.length === 0 ? (
            <div className="pat-empty-card">
              <Calendar size={28} style={{ opacity: 0.2 }} />
              <span>Nenhum agendamento ainda. Quando marcar uma consulta, aparece aqui.</span>
              {patient.numero && (
                <button className="pat-btn pat-btn-primary" onClick={() => navigate(`/painel/agenda?numero=${patient.numero}&nome=${encodeURIComponent(patient.nome)}`)}>
                  <Plus size={13} /> Agendar primeira consulta
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="pat-timeline-line" />
              {/* Cadastro */}
              <TimelineEvent
                icon={<Plus size={14} />}
                color="#9CA3AF"
                date={fmtDate(patient.created_at?.split('T')[0])}
                title="Cadastrado na clínica"
                subtitle={`Adicionado por ${patient.created_by_email || 'sistema'}`}
              />
              {appointments.map(a => {
                const status = STATUS_META[a.status] || STATUS_META.agendado
                return (
                  <TimelineEvent
                    key={a.id}
                    icon={<Calendar size={14} />}
                    color={status.color}
                    bg={status.bg}
                    date={fmtDateTime(a.starts_at)}
                    title={`${a.agendas?.name || 'Agendamento'} ${a.professionals?.name ? `· ${a.professionals.name}` : ''}`}
                    subtitle={a.notes || `${status.label}${a.price ? ` · R$ ${Number(a.price).toLocaleString('pt-BR')}` : ''}`}
                    statusLabel={status.label}
                    statusColor={status.color}
                  />
                )
              })}
            </>
          )}
        </div>
      )}

      {/* Modal de edição */}
      {editing && <EditModal
        editing={editing}
        setEditing={setEditing}
        insurancePlans={insurancePlans}
        onSave={handleSave}
        onClose={() => setEditing(null)}
        saving={saving}
        err={err}
        onUploadPhoto={() => fileInputRef.current?.click()}
      />}

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />

      {anamneseModal && (
        <AnamneseModal
          modal={anamneseModal}
          setModal={setAnamneseModal}
          templates={anamneseTemplates}
          onSave={handleSaveAnamnese}
          onCreateTemplate={handleCreateTemplate}
        />
      )}

      {orcamentoModal && (
        <OrcamentoModal
          form={orcamentoModal}
          setForm={setOrcamentoModal}
          onSave={handleSaveOrcamento}
          procedures={procedures}
          patientName={patient?.nome || patient?.numero || ''}
        />
      )}

      <ConfirmModal
        open={confirmDelete}
        variant="delete"
        title="Excluir paciente"
        message={`Tem certeza que deseja excluir "${patient.nome}"? Todos os dados e histórico cadastrados serão removidos. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir paciente"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────
function AttachmentThumb({ att, onZoom, onDelete }) {
  const isImage = (att.file_type || '').startsWith('image/')
  const isPdf   = att.file_type === 'application/pdf'
  const isVideo = (att.file_type || '').startsWith('video/')
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position:'relative', borderRadius:8, overflow:'hidden', background:'#F1F5F9', border:'1px solid var(--border)', aspectRatio:'1', display:'flex', alignItems:'center', justifyContent:'center' }}>
      {isImage ? (
        <img src={att.file_path} alt={att.file_name} style={{ width:'100%', height:'100%', objectFit:'cover', cursor:'zoom-in' }}
          onClick={() => onZoom(att.file_path)} />
      ) : isVideo ? (
        <video src={att.file_path} style={{ width:'100%', height:'100%', objectFit:'cover', cursor:'pointer' }}
          onClick={() => window.open(att.file_path, '_blank')} />
      ) : (
        <a href={att.file_path} target="_blank" rel="noreferrer"
          style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:8, textDecoration:'none', width:'100%', height:'100%' }}>
          <FileText size={22} style={{ color: isPdf ? '#DC2626' : '#2563EB' }} />
          <span style={{ fontSize:9, color:'var(--text-muted)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%', padding:'0 4px' }}>
            {att.file_name}
          </span>
        </a>
      )}
      {hover && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          {isImage && (
            <button onClick={() => onZoom(att.file_path)}
              style={{ background:'rgba(255,255,255,0.9)', border:'none', borderRadius:6, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
              <ZoomIn size={13} />
            </button>
          )}
          <a href={att.file_path} download={att.file_name} target="_blank" rel="noreferrer"
            style={{ background:'rgba(255,255,255,0.9)', border:'none', borderRadius:6, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', textDecoration:'none', color:'inherit' }}>
            <Download size={13} />
          </a>
          <button onClick={() => onDelete(att)}
            style={{ background:'rgba(220,38,38,0.85)', border:'none', borderRadius:6, width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff' }}>
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="pat-section-title">
      <Icon size={13} /> {title}
    </div>
  )
}

function Field({ label, value, mono, large }) {
  return (
    <div className={`pat-field ${large ? 'large' : ''}`}>
      <div className="pat-field-label">{label}</div>
      <div className={`pat-field-value ${mono ? 'mono' : ''}`}>{value}</div>
    </div>
  )
}

function FieldGrid({ children }) {
  return <div className="pat-field-grid">{children}</div>
}

function KpiCard({ icon, color, bg, label, value, sub }) {
  return (
    <div className="pat-kpi">
      <div className="pat-kpi-icon" style={{ background: bg, color }}>{icon}</div>
      <div className="pat-kpi-label">{label}</div>
      <div className="pat-kpi-value">{value}</div>
      <div className="pat-kpi-sub">{sub}</div>
    </div>
  )
}

function TimelineEvent({ icon, color, bg, date, title, subtitle, statusLabel, statusColor }) {
  return (
    <div className="pat-tl-event">
      <div className="pat-tl-dot" style={{ background: color, boxShadow: `0 0 0 4px ${bg || '#fff'}` }}>
        <span style={{ color: '#fff' }}>{icon}</span>
      </div>
      <div className="pat-tl-content">
        <div className="pat-tl-date">{date}</div>
        <div className="pat-tl-title">{title}</div>
        {subtitle && <div className="pat-tl-sub">{subtitle}</div>}
        {statusLabel && (
          <span className="pat-tl-status" style={{ color: statusColor, background: bg, border: `1px solid ${statusColor}33` }}>
            {statusLabel}
          </span>
        )}
      </div>
    </div>
  )
}

function EditModal({ editing, setEditing, insurancePlans, onSave, onClose, saving, err, onUploadPhoto }) {
  const [section, setSection] = useState('identificacao')
  const update = (key, val) => setEditing(p => ({ ...p, [key]: val }))

  return (
    <div className="pat-modal-bg">
      <div className="pat-modal">
        <div className="pat-modal-head">
          <div>
            <div className="pat-modal-title">Editar ficha do paciente</div>
            <div className="pat-modal-sub">{editing.nome || 'Novo paciente'}</div>
          </div>
          <button onClick={onClose} className="pat-modal-close"><X size={16} /></button>
        </div>

        <div className="pat-modal-body">
          {/* Foto */}
          <div className="pat-photo-edit">
            <div className="pat-photo-current">
              {editing.photo ? <img src={editing.photo} alt="" /> : <span>{editing.nome?.charAt(0).toUpperCase() || '?'}</span>}
            </div>
            <div>
              <button type="button" className="pat-btn pat-btn-ghost" onClick={onUploadPhoto}>
                <Camera size={13} /> {editing.photo ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              {editing.photo && (
                <button type="button" className="pat-btn pat-btn-danger" onClick={() => update('photo', null)} style={{ marginLeft: 8 }}>
                  <Trash2 size={13} /> Remover
                </button>
              )}
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>JPG ou PNG, até 500 KB</div>
            </div>
          </div>

          {/* Tabs do modal */}
          <div className="pat-modal-tabs">
            {[
              { key: 'identificacao', label: 'Identificação' },
              { key: 'contato',       label: 'Contato' },
              { key: 'convenio',      label: 'Convênio' },
              { key: 'saude',         label: 'Saúde' },
              { key: 'notas',         label: 'Notas' },
            ].map(t => (
              <button key={t.key} type="button" onClick={() => setSection(t.key)} className={`pat-modal-tab ${section === t.key ? 'active' : ''}`}>
                {t.label}
              </button>
            ))}
          </div>

          {section === 'identificacao' && (
            <div className="pat-modal-fields">
              <ModalField label="Nome completo">
                <input className="nx-input" autoFocus value={editing.nome || ''} onChange={e => update('nome', e.target.value)} />
              </ModalField>
              <ModalField label="Nome social (opcional)">
                <input className="nx-input" placeholder="Como o paciente prefere ser chamado" value={editing.nome_social || ''} onChange={e => update('nome_social', e.target.value)} />
              </ModalField>
              <Row>
                <ModalField label="CPF">
                  <input className="nx-input" placeholder="000.000.000-00" value={fmtCpf(editing.cpf || '')} onChange={e => update('cpf', e.target.value)} />
                </ModalField>
                <ModalField label="RG">
                  <input className="nx-input" value={editing.rg || ''} onChange={e => update('rg', e.target.value)} />
                </ModalField>
              </Row>
              <Row>
                <ModalField label="Data de nascimento">
                  <input className="nx-input" type="date" value={editing.birth_date || ''} onChange={e => update('birth_date', e.target.value)} />
                </ModalField>
                <ModalField label="Gênero">
                  <select className="nx-select" value={editing.gender || ''} onChange={e => update('gender', e.target.value)}>
                    <option value="">—</option>
                    {GENDER_OPTIONS.map(g => <option key={g}>{g}</option>)}
                  </select>
                </ModalField>
              </Row>
              <Row>
                <ModalField label="Estado civil">
                  <select className="nx-select" value={editing.marital_status || ''} onChange={e => update('marital_status', e.target.value)}>
                    <option value="">—</option>
                    {MARITAL_OPTIONS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </ModalField>
                <ModalField label="Profissão">
                  <input className="nx-input" value={editing.profession || ''} onChange={e => update('profession', e.target.value)} />
                </ModalField>
              </Row>
              <ModalField label="Origem / Como conheceu a clínica">
                <select className="nx-select" value={editing.referral_source || ''} onChange={e => update('referral_source', e.target.value)}>
                  <option value="">—</option>
                  {REFERRAL_OPTIONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </ModalField>
            </div>
          )}

          {section === 'contato' && (
            <div className="pat-modal-fields">
              <Row>
                <ModalField label="Telefone (WhatsApp)">
                  <input className="nx-input" placeholder="5561991234567" value={editing.numero || ''} onChange={e => update('numero', e.target.value)} />
                </ModalField>
                <ModalField label="Telefone secundário">
                  <input className="nx-input" value={editing.phone_secondary || ''} onChange={e => update('phone_secondary', e.target.value)} />
                </ModalField>
              </Row>
              <ModalField label="E-mail">
                <input className="nx-input" type="email" value={editing.email || ''} onChange={e => update('email', e.target.value)} />
              </ModalField>
              <ModalField label="Endereço">
                <input className="nx-input" placeholder="Rua, número, bairro, cidade" value={editing.address || ''} onChange={e => update('address', e.target.value)} />
              </ModalField>
              <Row>
                <ModalField label="Contato de emergência (nome)">
                  <input className="nx-input" value={editing.emergency_contact || ''} onChange={e => update('emergency_contact', e.target.value)} />
                </ModalField>
                <ModalField label="Telefone de emergência">
                  <input className="nx-input" value={editing.emergency_phone || ''} onChange={e => update('emergency_phone', e.target.value)} />
                </ModalField>
              </Row>
              <Row>
                <ModalField label="Responsável legal (menor de idade)">
                  <input className="nx-input" value={editing.guardian_name || ''} onChange={e => update('guardian_name', e.target.value)} />
                </ModalField>
                <ModalField label="Telefone do responsável">
                  <input className="nx-input" value={editing.guardian_phone || ''} onChange={e => update('guardian_phone', e.target.value)} />
                </ModalField>
              </Row>
            </div>
          )}

          {section === 'convenio' && (
            <div className="pat-modal-fields">
              <ModalField label="Plano">
                <select className="nx-select" value={editing.insurance_plan_id || ''} onChange={e => update('insurance_plan_id', e.target.value || null)}>
                  <option value="">Particular</option>
                  {insurancePlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </ModalField>
              <ModalField label="Número da carteirinha">
                <input className="nx-input" value={editing.insurance_card || ''} onChange={e => update('insurance_card', e.target.value)} />
              </ModalField>
            </div>
          )}

          {section === 'saude' && (
            <div className="pat-modal-fields">
              <Row>
                <ModalField label="Tipo sanguíneo">
                  <select className="nx-select" value={editing.blood_type || ''} onChange={e => update('blood_type', e.target.value)}>
                    <option value="">—</option>
                    {BLOOD_OPTIONS.map(b => <option key={b}>{b}</option>)}
                  </select>
                </ModalField>
                <ModalField label="Peso (kg)">
                  <input className="nx-input" type="number" step="0.1" placeholder="Ex: 72.5" value={editing.weight || ''} onChange={e => update('weight', e.target.value)} />
                </ModalField>
                <ModalField label="Altura (m)">
                  <input className="nx-input" type="number" step="0.01" placeholder="Ex: 1.78" value={editing.height || ''} onChange={e => update('height', e.target.value)} />
                </ModalField>
              </Row>
              <ModalField label="Alergias">
                <textarea className="nx-input" rows={2} placeholder="Ex: penicilina, dipirona..." value={editing.allergies || ''} onChange={e => update('allergies', e.target.value)} />
              </ModalField>
              <ModalField label="Condições crônicas">
                <textarea className="nx-input" rows={2} placeholder="Ex: hipertensão, diabetes tipo 2..." value={editing.chronic_conditions || ''} onChange={e => update('chronic_conditions', e.target.value)} />
              </ModalField>
              <ModalField label="Medicamentos em uso">
                <textarea className="nx-input" rows={2} placeholder="Ex: Losartana 50mg, Metformina..." value={editing.medications || ''} onChange={e => update('medications', e.target.value)} />
              </ModalField>
              <ModalField label="Observações clínicas">
                <textarea className="nx-input" rows={3} placeholder="Histórico, observações relevantes..." value={editing.clinical_notes || ''} onChange={e => update('clinical_notes', e.target.value)} />
              </ModalField>
            </div>
          )}

          {section === 'notas' && (
            <div className="pat-modal-fields">
              <ModalField label="Notas internas (privadas da equipe)">
                <textarea className="nx-input" rows={5} placeholder="Anotações que só sua equipe vê..." value={editing.notes || ''} onChange={e => update('notes', e.target.value)} />
              </ModalField>
            </div>
          )}
        </div>

        <div className="pat-modal-foot">
          {err && <div className="pat-modal-err">{err}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="pat-btn pat-btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            <button className="pat-btn pat-btn-primary" onClick={onSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Salvando...' : 'Salvar ficha'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModalField({ label, children }) {
  return (
    <div>
      <label className="pat-modal-label">{label}</label>
      {children}
    </div>
  )
}

function Row({ children }) {
  return <div className="pat-modal-row">{children}</div>
}

function AnamneseModal({ modal, setModal, templates, onSave, onCreateTemplate }) {
  const [step, setStep] = useState(modal.step || 'select')
  const [selected, setSelected] = useState(null)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [newTplNome, setNewTplNome] = useState('')
  const [newTplQuestions, setNewTplQuestions] = useState([{ id: crypto.randomUUID(), text: '', type: 'yes_no_dontknow' }])
  const [creatingTpl, setCreatingTpl] = useState(false)
  const [tplErr, setTplErr] = useState('')

  function addQuestion() {
    setNewTplQuestions(qs => [...qs, { id: crypto.randomUUID(), text: '', type: 'yes_no_dontknow' }])
  }
  function removeQuestion(idx) {
    setNewTplQuestions(qs => qs.filter((_, i) => i !== idx))
  }
  function updateQ(idx, key, val) {
    setTplErr('')
    setNewTplQuestions(qs => qs.map((q, i) => i === idx ? { ...q, [key]: val } : q))
  }

  async function handleSaveTemplate() {
    if (!newTplNome.trim()) { setTplErr('Informe o nome do modelo.'); return }
    const emptyQ = newTplQuestions.findIndex(q => !q.text.trim())
    if (emptyQ !== -1) { setTplErr(`Preencha o texto da pergunta ${emptyQ + 1}.`); return }
    setTplErr('')
    setCreatingTpl(true)
    try {
      const tpl = await onCreateTemplate(newTplNome.trim(), newTplQuestions)
      if (tpl) {
        setSelected(tpl)
        setAnswers({})
        setNewTplNome('')
        setNewTplQuestions([{ id: crypto.randomUUID(), text: '', type: 'yes_no_dontknow' }])
        setStep('fill')
      }
    } finally {
      setCreatingTpl(false)
    }
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      await onSave(selected.nome, selected.id, selected.questions, answers)
    } finally {
      setSaving(false)
    }
  }

  const OVERLAY = { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }
  const BOX = { background:'var(--bg-card, #fff)', borderRadius:12, width:'100%', maxWidth:560, maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.18)' }
  const HEAD = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }
  const BODY = { flex:1, overflowY:'auto', padding:'20px' }
  const FOOT = { padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }

  return (
    <div style={OVERLAY} onClick={e => e.target === e.currentTarget && setModal(null)}>
      <div style={BOX}>
        <div style={HEAD}>
          <div style={{ fontWeight:700, fontSize:15 }}>
            {step === 'select' && 'Selecionar modelo de anamnese'}
            {step === 'create' && 'Criar novo modelo'}
            {step === 'fill' && `Preencher: ${selected?.nome}`}
          </div>
          <button onClick={() => setModal(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div style={BODY}>
          {step === 'select' && (
            <div>
              {templates.length === 0 ? (
                <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text-muted)' }}>
                  <Clipboard size={32} style={{ opacity:0.2, marginBottom:8 }} />
                  <p style={{ margin:0, fontSize:13 }}>Nenhum modelo cadastrado ainda.</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
                  {templates.map(t => (
                    <button key={t.id} onClick={() => { setSelected(t); setAnswers({}); setStep('fill') }}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-input, #F9FAFB)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', cursor:'pointer', textAlign:'left' }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13, color:'var(--text-primary)' }}>{t.nome}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{(t.questions || []).length} pergunta(s)</div>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:'#2563EB' }}>Selecionar →</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setStep('create')}
                style={{ display:'inline-flex', alignItems:'center', gap:6, background:'transparent', border:'2px dashed var(--border)', borderRadius:8, padding:'10px 16px', fontSize:13, fontWeight:600, color:'var(--text-secondary)', cursor:'pointer', width:'100%', justifyContent:'center' }}>
                <Plus size={14} /> Criar novo modelo
              </button>
            </div>
          )}

          {step === 'create' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>Nome do modelo</label>
                <input className="nx-input" autoFocus placeholder="Ex: Anamnese Padrão" value={newTplNome} onChange={e => setNewTplNome(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:8 }}>Perguntas</label>
                {newTplQuestions.map((q, i) => (
                  <div key={q.id} style={{ display:'flex', gap:8, marginBottom:10, alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <input className="nx-input" placeholder={`Pergunta ${i+1}`} value={q.text} onChange={e => updateQ(i, 'text', e.target.value)} style={{ marginBottom:6 }} />
                      <select className="nx-select" value={q.type} onChange={e => updateQ(i, 'type', e.target.value)}>
                        <option value="yes_no_dontknow">Sim / Não / Não sei</option>
                        <option value="text">Texto livre</option>
                      </select>
                    </div>
                    {newTplQuestions.length > 1 && (
                      <button onClick={() => removeQuestion(i)}
                        style={{ background:'transparent', border:'1px solid #FCA5A5', borderRadius:6, padding:'6px 8px', cursor:'pointer', color:'#DC2626', marginTop:2 }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addQuestion}
                  style={{ display:'inline-flex', alignItems:'center', gap:5, background:'transparent', border:'1px dashed var(--border)', borderRadius:6, padding:'7px 12px', fontSize:12, fontWeight:600, color:'var(--text-secondary)', cursor:'pointer' }}>
                  <Plus size={12} /> Adicionar pergunta
                </button>
              </div>
              {tplErr && (
                <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#DC2626', fontWeight:600 }}>
                  ⚠️ {tplErr}
                </div>
              )}
            </div>
          )}

          {step === 'fill' && selected && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {(selected.questions || []).map(q => {
                const ans = answers[q.id] || {}
                return (
                  <div key={q.id}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:10 }}>{q.text}</div>
                    {q.type === 'yes_no_dontknow' ? (
                      <>
                        <div style={{ display:'flex', gap:10, marginBottom:8 }}>
                          {['sim', 'nao', 'nao_sei'].map(v => (
                            <label key={v} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:13, cursor:'pointer', fontWeight: ans.value === v ? 700 : 400, color: ans.value === v ? (v==='sim'?'#DC2626':v==='nao'?'#16A34A':'#6B7280') : 'var(--text-secondary)' }}>
                              <input type="radio" name={q.id} value={v} checked={ans.value === v} onChange={() => setAnswers(a => ({ ...a, [q.id]: { ...ans, value: v } }))} style={{ accentColor: v==='sim'?'#DC2626':v==='nao'?'#16A34A':'#9CA3AF' }} />
                              {v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : 'Não sei'}
                            </label>
                          ))}
                        </div>
                        {ans.value === 'sim' && (
                          <textarea className="nx-input" rows={2} placeholder="Informações adicionais..." value={ans.detail || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...ans, detail: e.target.value } }))} />
                        )}
                      </>
                    ) : (
                      <textarea className="nx-input" rows={3} placeholder="Digite aqui..." value={ans.value || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: { value: e.target.value } }))} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={FOOT}>
          <button onClick={() => step === 'select' ? setModal(null) : setStep('select')}
            style={{ flex:1, padding:'9px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:13 }}>
            {step === 'select' ? 'Cancelar' : '← Voltar'}
          </button>
          {step === 'create' && (
            <button onClick={handleSaveTemplate} disabled={creatingTpl}
              style={{ flex:2, padding:'9px', background:'#2563EB', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13, opacity: creatingTpl?0.6:1 }}>
              {creatingTpl ? 'Salvando...' : 'Salvar modelo e preencher'}
            </button>
          )}
          {step === 'fill' && (
            <button onClick={handleSave} disabled={saving}
              style={{ flex:2, padding:'9px', background:'#2563EB', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13, opacity: saving?0.6:1 }}>
              {saving ? 'Salvando...' : 'Salvar anamnese'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function OrcamentoModal({ form, setForm, onSave, procedures = [], patientName = '' }) {
  const [saving, setSaving] = useState(false)
  const [acIdx, setAcIdx] = useState(null) // which row has autocomplete open
  const upd = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const updItem = (i, key, val) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [key]: val } : it) }))
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { procedimento:'', dente:'', faces:'', valor:'' }] }))
  const removeItem = i => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const subtotal = form.items.reduce((s, it) => s + (parseFloat(it.valor) || 0), 0)
  const desconto = parseFloat(form.desconto) || 0
  const total = subtotal - desconto
  const entrada = parseFloat(form.entrada) || 0
  const parcelas = parseInt(form.parcelas) || 1
  const parcVal = parcelas > 0 && (total - entrada) > 0 ? (total - entrada) / parcelas : 0

  function acSuggestions(i) {
    const q = (form.items[i]?.procedimento || '').toLowerCase().trim()
    if (!q || q.length < 1) return procedures.slice(0, 8)
    return procedures.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8)
  }

  function selectProcedure(i, proc) {
    setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i
      ? { ...it, procedimento: proc.name, valor: proc.price_particular ? String(proc.price_particular) : it.valor }
      : it
    )}))
    setAcIdx(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const OVERLAY = { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }
  const BOX = { background:'var(--bg-card, #fff)', borderRadius:12, width:'100%', maxWidth:680, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.18)' }

  return (
    <div style={OVERLAY} onClick={e => e.target === e.currentTarget && setForm(null)}>
      <div style={BOX}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontWeight:700, fontSize:15 }}>Novo orçamento</div>
          <button onClick={() => setForm(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:20 }}>
          {/* Itens */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Procedimentos</div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ fontSize:11, color:'var(--text-muted)' }}>
                  <th style={{ textAlign:'left', padding:'4px 4px', fontWeight:600 }}>Procedimento</th>
                  <th style={{ textAlign:'left', padding:'4px 4px', fontWeight:600, width:70 }}>Dente</th>
                  <th style={{ textAlign:'left', padding:'4px 4px', fontWeight:600, width:70 }}>Faces</th>
                  <th style={{ textAlign:'right', padding:'4px 4px', fontWeight:600, width:110 }}>Valor (R$)</th>
                  <th style={{ width:32 }}></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ padding:'3px 4px', position:'relative' }}>
                      <input
                        className="nx-input"
                        placeholder="Nome do procedimento"
                        value={it.procedimento}
                        onChange={e => { updItem(i, 'procedimento', e.target.value); setAcIdx(i) }}
                        onFocus={() => setAcIdx(i)}
                        onBlur={() => setTimeout(() => setAcIdx(null), 150)}
                        style={{ fontSize:12 }}
                      />
                      {acIdx === i && acSuggestions(i).length > 0 && (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #E2E8F0', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:100, maxHeight:200, overflowY:'auto' }}>
                          {acSuggestions(i).map(proc => (
                            <div key={proc.id}
                              onMouseDown={() => selectProcedure(i, proc)}
                              style={{ padding:'8px 12px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, borderBottom:'1px solid #F1F5F9' }}
                              onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                              <span style={{ fontWeight:500, color:'#0F172A' }}>{proc.name}</span>
                              {proc.price_particular > 0 && (
                                <span style={{ fontSize:11, color:'#2563EB', fontWeight:700 }}>
                                  {Number(proc.price_particular).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding:'3px 4px' }}>
                      <input className="nx-input" placeholder="Ex: 16" value={it.dente} onChange={e => updItem(i, 'dente', e.target.value)} style={{ fontSize:12 }} />
                    </td>
                    <td style={{ padding:'3px 4px' }}>
                      <input className="nx-input" placeholder="—" value={it.faces} onChange={e => updItem(i, 'faces', e.target.value)} style={{ fontSize:12 }} />
                    </td>
                    <td style={{ padding:'3px 4px' }}>
                      <input className="nx-input" type="number" step="0.01" placeholder="0,00" value={it.valor} onChange={e => updItem(i, 'valor', e.target.value)} style={{ fontSize:12, textAlign:'right' }} />
                    </td>
                    <td style={{ padding:'3px 4px' }}>
                      {form.items.length > 1 && (
                        <button onClick={() => removeItem(i)} style={{ background:'transparent', border:'none', cursor:'pointer', color:'#DC2626', padding:2 }}><X size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addItem}
              style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:5, background:'transparent', border:'1px dashed var(--border)', borderRadius:6, padding:'6px 12px', fontSize:12, fontWeight:600, color:'var(--text-secondary)', cursor:'pointer' }}>
              <Plus size={12} /> Adicionar item
            </button>
          </div>

          {/* Totais */}
          <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>Desconto (R$)</label>
              <input className="nx-input" type="number" step="0.01" placeholder="0,00" value={form.desconto} onChange={e => upd('desconto', e.target.value)} />
            </div>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>Entrada (R$)</label>
              <input className="nx-input" type="number" step="0.01" placeholder="0,00" value={form.entrada} onChange={e => upd('entrada', e.target.value)} />
            </div>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>Parcelas</label>
              <input className="nx-input" type="number" min="1" value={form.parcelas} onChange={e => upd('parcelas', e.target.value)} />
            </div>
            <div style={{ flex:1, minWidth:120 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>Status</label>
              <select className="nx-select" value={form.status} onChange={e => upd('status', e.target.value)}>
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="recusado">Recusado</option>
              </select>
            </div>
          </div>

          {/* Resumo */}
          <div style={{ background:'var(--bg-input, #F9FAFB)', borderRadius:8, padding:'12px 16px', fontSize:13, marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ color:'var(--text-secondary)' }}>Subtotal</span>
              <span>R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
            </div>
            {desconto > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, color:'#DC2626' }}>
                <span>Desconto</span><span>− R$ {desconto.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:15, borderTop:'1px solid var(--border)', paddingTop:8, marginTop:4 }}>
              <span>Total</span><span>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits:2 })}</span>
            </div>
            {parcelas > 1 && (
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4, textAlign:'right' }}>
                {entrada > 0 ? `Entrada R$ ${entrada.toLocaleString('pt-BR', { minimumFractionDigits:2 })} + ` : ''}
                {parcelas}x R$ {parcVal.toLocaleString('pt-BR', { minimumFractionDigits:2 })}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>Observações (opcional)</label>
            <textarea className="nx-input" rows={2} placeholder="Condições, validade do orçamento, etc..." value={form.notes} onChange={e => upd('notes', e.target.value)} />
          </div>
        </div>

        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }}>
          <button onClick={() => setForm(null)}
            style={{ flex:1, padding:'9px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:13 }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex:2, padding:'9px', background:'#2563EB', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13, opacity:saving?0.6:1 }}>
            {saving ? 'Salvando...' : 'Salvar orçamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PatientTagsRow({ instancia, numero, userEmail }) {
  const { tagsOf } = useContactTags(instancia)
  if (!numero) return null
  const myTags = tagsOf(numero)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '10px 0 4px' }}>
      {myTags.length > 0 && <TagList tags={myTags} size="sm" />}
      <TagPicker instancia={instancia} numero={numero} userEmail={userEmail} anchor="bottom-left" />
    </div>
  )
}
