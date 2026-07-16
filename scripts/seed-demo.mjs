// Cria (ou limpa, com --limpar) a Clínica Demo no banco de produção.
// Acesso: demo@medmag.com.br / demo2026
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n').filter(Boolean).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const INST = 'demo'
const LIMPAR = process.argv.includes('--limpar')

const day = (offset, h, m = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(h, m, 0, 0); return d
}
const iso = d => d.toISOString()

// ─── LIMPEZA ────────────────────────────────────────────────────────────────
async function limpar() {
  const { data: comp } = await sb.from('companies').select('id').eq('instance', INST).maybeSingle()
  const tabelas = ['mensagens_geral', 'appointments', 'financial_transactions', 'financial_categories',
    'bank_accounts', 'saved_contacts', 'professionals', 'procedures', 'agendas', 'contact_tag_assignments',
    'contact_tags', 'quick_messages', 'conversation_reads', 'attendances', 'conversations', 'group_custom_names']
  for (const t of tabelas) {
    const { error } = await sb.from(t).delete().eq('instancia', INST)
    console.log('  limpa', t, error ? '⚠ ' + error.message : '✓')
  }
  if (comp) {
    await sb.from('users').delete().eq('company_id', comp.id)
    await sb.from('companies').delete().eq('id', comp.id)
    console.log('  empresa + usuários removidos ✓')
  }
}

if (LIMPAR) { console.log('Limpando demo...'); await limpar(); console.log('Pronto.'); process.exit(0) }

// ─── GUARDA ─────────────────────────────────────────────────────────────────
const { data: existing } = await sb.from('companies').select('id').eq('instance', INST).maybeSingle()
if (existing) { console.log('Já existe empresa demo (id ' + existing.id + '). Rode com --limpar antes.'); process.exit(1) }

// ─── 1. EMPRESA ─────────────────────────────────────────────────────────────
const { data: comp, error: compErr } = await sb.from('companies').insert({
  name: 'Clínica Demo', slug: 'demo', instance: INST, plan: 'Pro', active: true,
  ai_enabled: false, timezone: 'America/Sao_Paulo',
  contacts_table: 'saved_contacts', history_table: 'mensagens_geral',
}).select('id').single()
if (compErr) { console.error('empresa:', compErr.message); process.exit(1) }
console.log('empresa ✓', comp.id)

// ─── 2. USUÁRIO ─────────────────────────────────────────────────────────────
const { data: userId, error: userErr } = await sb.rpc('create_user', {
  p_name: 'Equipe Demo', p_email: 'demo@medmag.com.br', p_password: 'demo2026',
  p_role: 'admin', p_company_id: comp.id,
})
console.log('usuário ✓', userErr ? '⚠ ' + userErr.message : userId)

// ─── 3. PROFISSIONAIS ───────────────────────────────────────────────────────
const { data: pros } = await sb.from('professionals').insert([
  { instancia: INST, name: 'Dra. Ana Beatriz Rocha', specialty: 'Fisioterapia Pélvica', registration: 'CREFITO 12345-F', color: '#7C3AED', active: true, working_days: [1, 2, 3, 4, 5], start_time: '07:00', end_time: '17:00', valor_atendimento: 180 },
  { instancia: INST, name: 'Dr. Carlos Eduardo Lima', specialty: 'Fisioterapia Ortopédica', registration: 'CREFITO 23456-F', color: '#2563EB', active: true, working_days: [1, 2, 3, 4, 5], start_time: '08:00', end_time: '18:00', valor_atendimento: 150 },
  { instancia: INST, name: 'Dra. Marina Lopes', specialty: 'Pilates Clínico', registration: 'CREFITO 34567-F', color: '#16A34A', active: true, working_days: [1, 2, 3, 4, 5, 6], start_time: '07:00', end_time: '19:00', valor_atendimento: 120 },
]).select('id, name, valor_atendimento')
console.log('profissionais ✓', pros?.length)
const [ana, carlos, marina] = pros

// ─── 4. PROCEDIMENTOS ───────────────────────────────────────────────────────
const { data: procs } = await sb.from('procedures').insert([
  { instancia: INST, name: 'Avaliação Fisioterapêutica', type: 'consulta', duration_minutes: 60, price_particular: 200, active: true },
  { instancia: INST, name: 'Sessão de Fisioterapia', type: 'procedimento', duration_minutes: 50, price_particular: 150, active: true },
  { instancia: INST, name: 'Pilates Clínico', type: 'procedimento', duration_minutes: 50, price_particular: 120, active: true },
  { instancia: INST, name: 'Liberação Miofascial', type: 'procedimento', duration_minutes: 40, price_particular: 130, active: true },
]).select('id, name')
console.log('procedimentos ✓', procs?.length)
const [avaliacao, fisio, pilates] = procs

// ─── 5. AGENDA ──────────────────────────────────────────────────────────────
const { data: agendaRow } = await sb.from('agendas').insert({
  instancia: INST, name: 'Agenda Principal', color: '#2563EB',
  working_days: [1, 2, 3, 4, 5, 6], start_time: '07:00', end_time: '19:00', slot_minutes: 30, active: true,
}).select('id').single()
console.log('agenda ✓')

// ─── 6. PACIENTES ───────────────────────────────────────────────────────────
// Números propositalmente inválidos (55 00 9...) pra nunca cair em WhatsApp real
const PACIENTES = [
  ['Mariana Souza', '5500900000001', 'Instagram'], ['João Pedro Alves', '5500900000002', 'Indicação'],
  ['Fernanda Castro', '5500900000003', 'Google'], ['Ricardo Mendes', '5500900000004', 'Indicação'],
  ['Beatriz Nogueira', '5500900000005', 'Instagram'], ['Antônio Ferreira', '5500900000006', 'Convênio'],
  ['Larissa Campos', '5500900000007', 'Site'], ['Gustavo Henrique', '5500900000008', 'Indicação'],
  ['Camila Duarte', '5500900000009', 'Instagram'], ['Paulo Roberto', '5500900000010', 'Passou na frente'],
  ['Helena Martins', '5500900000011', 'Google'], ['Rafael Barbosa', '5500900000012', 'Indicação'],
]
const { error: pacErr } = await sb.from('saved_contacts').insert(
  PACIENTES.map(([nome, numero, origem]) => ({ instancia: INST, nome, numero, referral_source: origem }))
)
console.log('pacientes ✓', pacErr ? '⚠ ' + pacErr.message : PACIENTES.length)

// ─── 7. CONVERSAS 1:1 ───────────────────────────────────────────────────────
const conversa = (numero, nome, thread) => thread.map(([tipo, texto, off, h, m]) => ({
  instancia: INST, numero: numero + '@s.whatsapp.net', mensagem: texto,
  type: tipo, nome: tipo === 'Cliente' ? nome : tipo === 'atendente' ? 'Equipe Demo' : null,
  horaLastMessage: iso(day(off, h, m)), created_at: iso(day(off, h, m)),
}))
const msgs = [
  ...conversa('5500900000001', 'Mariana Souza', [
    ['Cliente', 'Oi! Vi o perfil de vocês no Instagram, queria saber mais sobre o pilates clínico 😊', -2, 9, 12],
    ['atendente', 'Oi Mariana, seja bem-vinda! 💚 O Pilates Clínico aqui é conduzido pela Dra. Marina, em turmas de até 4 pessoas. A primeira aula experimental é gratuita!', -2, 9, 20],
    ['Cliente', 'Adorei! Quais horários têm disponíveis?', -2, 9, 25],
    ['atendente', 'Temos vagas às terças e quintas às 7h, 12h e 18h. Qual encaixa melhor pra você?', -2, 9, 31],
    ['Cliente', 'Terça às 18h seria perfeito!', -2, 10, 2],
    ['atendente', 'Fechado! ✅ Já deixei agendada sua aula experimental de terça às 18h com a Dra. Marina. Qualquer coisa é só chamar!', -2, 10, 8],
  ]),
  ...conversa('5500900000002', 'João Pedro Alves', [
    ['Cliente', 'Boa tarde, meu ortopedista pediu 10 sessões de fisioterapia pro meu joelho. Vocês atendem por convênio?', -1, 14, 3],
    ['atendente', 'Boa tarde, João! Atendemos sim — trabalhamos com os principais convênios e também particular (R$ 150 a sessão). Pode me mandar uma foto do pedido médico?', -1, 14, 15],
    ['Cliente', '📎 Mídia', -1, 14, 22],
    ['atendente', 'Recebido! Com o Dr. Carlos você consegue começar ainda essa semana. Que tal quinta às 10h pra avaliação?', -1, 14, 30],
    ['Cliente', 'Pode ser, obrigado!', -1, 15, 1],
  ]),
  ...conversa('5500900000003', 'Fernanda Castro', [
    ['Cliente', 'Olá! Estou com dores fortes na lombar, atendem hoje?', 0, 8, 5],
    ['atendente', 'Olá Fernanda! Temos um encaixe hoje às 16h com a Dra. Ana. Quer que eu reserve?', 0, 8, 12],
    ['Cliente', 'Sim, por favor!', 0, 8, 14],
  ]),
  ...conversa('5500900000005', 'Beatriz Nogueira', [
    ['Cliente', 'Oi! Quanto fica o pacote mensal de pilates 2x por semana?', 0, 9, 40],
    ['atendente', 'Oi Bia! O plano 2x/semana fica R$ 480/mês (8 sessões). Inclui avaliação postural de entrada 😉', 0, 9, 52],
    ['Cliente', 'Vou fechar! Como faço o pagamento?', 0, 10, 30],
  ]),
  ...conversa('5500900000007', 'Larissa Campos', [
    ['Cliente', 'Bom dia, preciso remarcar minha sessão de amanhã, tive um imprevisto no trabalho 😔', 0, 7, 55],
    ['atendente', 'Bom dia Larissa, sem problema! Tenho sexta às 9h ou às 14h com o Dr. Carlos. Qual prefere?', 0, 8, 3],
  ]),
  ...conversa('5500900000009', 'Camila Duarte', [
    ['Cliente', 'A consulta de avaliação precisa de algum preparo? Levo exames?', 0, 11, 20],
  ]),
]
const { error: msgErr } = await sb.from('mensagens_geral').insert(msgs)
console.log('conversas ✓', msgErr ? '⚠ ' + msgErr.message : msgs.length + ' mensagens')

// ─── 8. GRUPO ───────────────────────────────────────────────────────────────
const GID = '120363000000000099@g.us'
const grupoMsgs = [
  ['Cliente', '5500900000001', 'Mariana Souza', 'Gente, a aula de hoje foi ótima! 💪', -1, 19, 10],
  ['Cliente', '5500900000005', 'Beatriz Nogueira', 'Verdade! Dra. Marina pegou pesado hoje kkk', -1, 19, 14],
  ['atendente', null, 'Equipe Demo', 'Que bom que gostaram! 🎉 Lembrete: amanhã a turma das 7h começa 10 min mais cedo pra avaliação postural.', -1, 19, 30],
  ['Cliente', '5500900000009', 'Camila Duarte', 'Anotado, obrigada!', -1, 19, 42],
]
await sb.from('mensagens_geral').insert(grupoMsgs.map(([tipo, num, nome, texto, off, h, m]) => ({
  instancia: INST, idgrupo: GID, nomegrupo: 'Turma Pilates — Clínica Demo',
  numero: num ? num + '@s.whatsapp.net' : GID, mensagem: texto, type: tipo, nome,
  horaLastMessage: iso(day(off, h, m)), created_at: iso(day(off, h, m)),
})))
console.log('grupo ✓')

// ─── 9. ETIQUETAS ───────────────────────────────────────────────────────────
const { data: tags } = await sb.from('contact_tags').insert([
  { instancia: INST, name: 'Pilates', color: '#16A34A' },
  { instancia: INST, name: 'Plano Mensal', color: '#3B82F6' },
  { instancia: INST, name: 'Pós-cirúrgico', color: '#F97316' },
]).select('id, name')
if (tags?.length === 3) {
  await sb.from('contact_tag_assignments').insert([
    { instancia: INST, numero: '5500900000001', tag_id: tags[0].id },
    { instancia: INST, numero: '5500900000005', tag_id: tags[0].id },
    { instancia: INST, numero: '5500900000005', tag_id: tags[1].id },
    { instancia: INST, numero: '5500900000002', tag_id: tags[2].id },
  ])
}
console.log('etiquetas ✓')

// ─── 10. MENSAGENS RÁPIDAS ──────────────────────────────────────────────────
await sb.from('quick_messages').insert([
  { instancia: INST, titulo: 'Saudação', mensagem: 'Olá! 😊 Seja bem-vindo(a) à Clínica Demo. Como posso ajudar?' },
  { instancia: INST, titulo: 'Horários', mensagem: 'Atendemos de segunda a sexta das 7h às 19h e sábados das 7h às 12h.' },
  { instancia: INST, titulo: 'Confirmação', mensagem: 'Seu horário está confirmado! ✅ Qualquer imprevisto, avise com 12h de antecedência.' },
])
console.log('mensagens rápidas ✓')

// ─── 11. AGENDAMENTOS ───────────────────────────────────────────────────────
const appt = (nome, numero, off, h, m, pro, proc, status, pago) => ({
  instancia: INST, agenda_id: agendaRow.id, contact_nome: nome, contact_numero: numero,
  starts_at: iso(day(off, h, m)), duration_minutes: 50, status,
  professional_id: pro.id, procedure_id: proc.id, price: pro.valor_atendimento,
  payment_status: pago ? 'pago' : 'pendente', paid_at: pago ? iso(day(off, h + 1)) : null,
  created_by_email: 'demo@medmag.com.br',
})
const appts = [
  // passado (concluído e pago)
  appt('Mariana Souza', '5500900000001', -3, 18, 0, marina, pilates, 'concluido', true),
  appt('Beatriz Nogueira', '5500900000005', -3, 7, 0, marina, pilates, 'concluido', true),
  appt('João Pedro Alves', '5500900000002', -2, 10, 0, carlos, avaliacao, 'concluido', true),
  appt('Ricardo Mendes', '5500900000004', -2, 14, 0, carlos, fisio, 'concluido', true),
  appt('Helena Martins', '5500900000011', -1, 9, 0, ana, avaliacao, 'concluido', true),
  appt('Gustavo Henrique', '5500900000008', -1, 11, 0, carlos, fisio, 'faltou', false),
  // hoje
  appt('Fernanda Castro', '5500900000003', 0, 16, 0, ana, avaliacao, 'confirmado', false),
  appt('Camila Duarte', '5500900000009', 0, 17, 0, ana, avaliacao, 'agendado', false),
  appt('Mariana Souza', '5500900000001', 0, 18, 0, marina, pilates, 'confirmado', false),
  // próximos dias
  appt('João Pedro Alves', '5500900000002', 1, 10, 0, carlos, fisio, 'agendado', false),
  appt('Beatriz Nogueira', '5500900000005', 1, 7, 0, marina, pilates, 'agendado', false),
  appt('Larissa Campos', '5500900000007', 2, 9, 0, carlos, fisio, 'agendado', false),
  appt('Ricardo Mendes', '5500900000004', 2, 14, 0, carlos, fisio, 'agendado', false),
  appt('Paulo Roberto', '5500900000010', 3, 8, 0, ana, avaliacao, 'agendado', false),
  appt('Rafael Barbosa', '5500900000012', 3, 15, 0, carlos, fisio, 'agendado', false),
  appt('Mariana Souza', '5500900000001', 5, 18, 0, marina, pilates, 'agendado', false),
  appt('Beatriz Nogueira', '5500900000005', 5, 7, 0, marina, pilates, 'agendado', false),
]
const { error: apErr } = await sb.from('appointments').insert(appts)
console.log('agendamentos ✓', apErr ? '⚠ ' + apErr.message : appts.length)

// ─── 12. FINANCEIRO ─────────────────────────────────────────────────────────
const { data: cats } = await sb.from('financial_categories').insert([
  { instancia: INST, nome: 'Consultas e Sessões', tipo: 'receita', cor: '#16A34A' },
  { instancia: INST, nome: 'Mensalidades Pilates', tipo: 'receita', cor: '#3B82F6' },
  { instancia: INST, nome: 'Aluguel', tipo: 'despesa', cor: '#DC2626' },
  { instancia: INST, nome: 'Materiais e Insumos', tipo: 'despesa', cor: '#F97316' },
  { instancia: INST, nome: 'Folha de Pagamento', tipo: 'despesa', cor: '#7C3AED' },
]).select('id, nome')
const cat = n => cats.find(c => c.nome.includes(n))?.id
const { data: banks } = await sb.from('bank_accounts').insert([
  { instancia: INST, nome: 'Conta Corrente — Sicoob', banco: 'Sicoob', tipo: 'corrente', saldo_inicial: 5000, ativo: true },
  { instancia: INST, nome: 'Caixa da Clínica', tipo: 'caixa', saldo_inicial: 800, ativo: true },
]).select('id')
const hoje = new Date().toISOString().slice(0, 10)
const dataOff = off => { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10) }
const fin = []
// receitas dos atendimentos concluídos
for (const a of appts.filter(x => x.payment_status === 'pago')) {
  fin.push({
    instancia: INST, tipo: 'receita', descricao: `Sessão — ${a.contact_nome}`, valor: a.price,
    status: 'pago', categoria_id: cat('Consultas'), vencimento: a.starts_at.slice(0, 10),
    pagamento_at: a.starts_at.slice(0, 10), contact_nome: a.contact_nome,
    bank_account_id: banks[0].id, created_by: 'Agenda (automático)',
  })
}
fin.push(
  { instancia: INST, tipo: 'receita', descricao: 'Mensalidade Pilates — Beatriz Nogueira', valor: 480, status: 'pago', categoria_id: cat('Mensalidades'), vencimento: dataOff(-5), pagamento_at: dataOff(-5), contact_nome: 'Beatriz Nogueira', bank_account_id: banks[0].id, created_by: 'Equipe Demo' },
  { instancia: INST, tipo: 'receita', descricao: 'Mensalidade Pilates — Mariana Souza', valor: 480, status: 'pendente', categoria_id: cat('Mensalidades'), vencimento: dataOff(3), contact_nome: 'Mariana Souza', created_by: 'Equipe Demo' },
  { instancia: INST, tipo: 'despesa', descricao: 'Aluguel da sala — julho', valor: 3200, status: 'pago', categoria_id: cat('Aluguel'), vencimento: dataOff(-10), pagamento_at: dataOff(-10), bank_account_id: banks[0].id, created_by: 'Equipe Demo' },
  { instancia: INST, tipo: 'despesa', descricao: 'Materiais de fisioterapia (faixas, bolas)', valor: 420, status: 'pendente', categoria_id: cat('Materiais'), vencimento: dataOff(4), created_by: 'Equipe Demo' },
  { instancia: INST, tipo: 'despesa', descricao: 'Folha — fisioterapeutas (julho)', valor: 8500, status: 'pendente', categoria_id: cat('Folha'), vencimento: dataOff(9), created_by: 'Equipe Demo' },
)
const { error: finErr } = await sb.from('financial_transactions').insert(fin)
console.log('financeiro ✓', finErr ? '⚠ ' + finErr.message : fin.length + ' lançamentos')

console.log('\n═══ CLÍNICA DEMO CRIADA ═══')
console.log('Login: demo@medmag.com.br / demo2026')
