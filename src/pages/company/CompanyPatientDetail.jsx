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
      }
      if (plans) setInsurancePlans(plans)
      setLoading(false)
    })
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
