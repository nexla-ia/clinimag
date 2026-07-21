# Med Mag — Documentação dos recursos "estilo WhatsApp"

> Guia técnico de tudo que foi feito pra deixar o atendimento **muito próximo do WhatsApp**.
> Feito pra **replicar em outra plataforma**: cada item traz o que faz, o banco (SQL),
> a lógica no front, o webhook/n8n quando tem, e os cuidados (gotchas).

**Stack:** React + Vite • Supabase (Postgres + Realtime + RPC) • n8n → Evolution API (WhatsApp) • deploy Vercel.
Todas as telas ficam em `src/pages/company/`. Envio de WhatsApp sempre passa por **webhook do n8n → Evolution**.

---

## 0. Conceitos transversais (leia primeiro — vale pra tudo)

### 0.1 Tabela central de mensagens: `mensagens_geral`
Toda mensagem (recebida e enviada, privada e de grupo) vive em `mensagens_geral`. Campos-chave:

| campo | pra que serve |
|---|---|
| `instancia` | identifica a empresa/número (multi-tenant) |
| `numero` | JID do contato: `55DDDNUMERO@s.whatsapp.net` (privado) |
| `idgrupo` | JID do grupo: `...@g.us` (nulo em conversa privada) |
| `type` | `cliente` (recebida), `atendente`/`humano` (enviada por gente), `ia`/`bot` |
| `mensagem` | texto |
| `base64` | mídia (áudio/img/pdf/vídeo) embutida |
| `id_mensagem` | **ID da mensagem no WhatsApp** (vem da Evolution) — chave pra citar/deduplicar |
| `quoted_id_mensagem` | quando é resposta: o `id_mensagem` da mensagem citada |
| `quoted_text` | trecho da mensagem citada (pra exibir sem depender do original carregado) |
| `horaLastMessage` / `created_at` | timestamp |
| `aplicativo` | `whatsapp` / `instagram` (separar telas) |

### 0.2 Realtime (o que faz a tela viver)
Cada tela assina `postgres_changes` (INSERT/UPDATE) em `mensagens_geral` filtrando por `instancia`, e faz **append/patch no estado**. É isso que faz a mensagem aparecer na hora, sem F5.

```js
supabase.channel('conversas-mensagens')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'mensagens_geral', filter: `instancia=eq.${instance}` },
    (p) => { /* casa com a conversa aberta e dá setMessages(...) */ })
  .subscribe()
```

### 0.3 Envio: sempre via webhook n8n → Evolution
Enviar tem **dois passos**:
1. **Loga no banco** (`RPC send_mensagem_geral`) → aparece na thread interna.
2. **Dispara o webhook** do n8n (`.../webhook/envioNexla`) → n8n manda pela Evolution → WhatsApp do cliente.

Os dois são independentes de propósito (se um falhar, o outro não trava).

### 0.4 Deploy-safe (não quebrar quando falta migration)
Padrão usado em tudo: **`select('*')`** em vez de listar colunas + **fallback** quando um parâmetro/coluna novo não existe ainda. Ex.: a RPC de envio só manda `p_quoted` se for resposta e, se a função antiga reclamar, reenvia sem ele. Assim o front pode subir antes da migration rodar.

### 0.5 Timezone é OFFSET, não IANA
`companies.timezone` guarda **offset** (`-03:00`, `-04:00`), não `America/Sao_Paulo`. No Postgres: `starts_at AT TIME ZONE (offset)::interval`. No front, ancora a data no offset da empresa, não do browser.

### 0.6 Funções SQL com `crypt`/`gen_random_uuid` (pgcrypto)
`SECURITY DEFINER` + `SET search_path TO 'public','extensions'` — sem o `extensions` no path, o `crypt` some e quebra (login etc).

### 0.7 RLS permissiva por instância
As tabelas usam `FOR ALL TO authenticated, anon USING(true) WITH CHECK(true)` — o isolamento é por `instancia` na query, não por RLS.

---

## 1. Conversas privadas — recursos WhatsApp

### 1.1 ⭐ Juntar conversa "rachada" pelo 9 do celular (canonicalização BR)
**Problema mais importante que resolvemos.** O WhatsApp entrega a mensagem do **cliente** com o número **SEM** o 9 extra (`556981117022`), mas ao abrir a conversa pela ficha/agenda o número às vezes vinha **COM** o 9 (`5569981117022`). Isso criava **duas conversas do mesmo paciente** — cada atendente via só metade (um via o que mandou, outro via as respostas).

**Solução:** canonicalizar o número (tirar o 9 extra, igual o WhatsApp entrega) em **toda** a tela: lista, carregamento, realtime, envio, atribuição, leituras.

```js
// tira o 9 extra do celular BR (13 díg → 12) e devolve o JID canônico
function normalizeBRDigits(raw) {
  let d = (raw || '').replace(/@.*/, '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 11 || d.length === 10) d = '55' + d
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') d = '55' + d.slice(2,4) + d.slice(5)
  return d
}
function canonSession(numero) {
  if (!numero || String(numero).includes('@g.us')) return numero
  const d = normalizeBRDigits(numero)
  return d ? `${d}@s.whatsapp.net` : numero
}
// todas as formas do MESMO número que podem existir no banco (com e sem 9)
function numeroVariants(numero) {
  const out = new Set(); const bare = String(numero||'').replace(/@.*/,'')
  if (bare) { out.add(bare); out.add(`${bare}@s.whatsapp.net`) }
  const d = normalizeBRDigits(numero)
  if (d) {
    out.add(d); out.add(`${d}@s.whatsapp.net`)
    if (d.length === 12 && d.startsWith('55')) {          // reinsere o 9
      const w = '55' + d.slice(2,4) + '9' + d.slice(4)
      out.add(w); out.add(`${w}@s.whatsapp.net`)
    }
  }
  return [...out]
}
```

**Onde aplicar:**
- **Lista de conversas:** dedup por `canonSession(numero)` → 1 entrada por paciente.
- **Carregar mensagens** (inicial, "carregar anteriores", busca, pular): `.in('numero', numeroVariants(selected.session_id))` no lugar de `.eq('numero', ...)` → junta as duas formas.
- **Realtime:** `sid = canonSession(row.numero)`; casa a conversa aberta com `canonSession(selected) === sid`.
- **Enviar / auto-atribuir / leituras / finalizar / atendimentos:** sempre `canonSession(...)`.

**Cuidado:** `canonSession` é **no-op** pra número já canônico (12 díg) — não afeta o que já funcionava. E enviar pro número sem-9 funciona: a Evolution resolve, e é a forma que o cliente usa.

### 1.2 Responder/citar mensagem (enviada) — igual arrastar-e-responder
Arrasta/clica na mensagem → responde **citando** ela. Banco: coluna `quoted_id_mensagem` guarda o `id_mensagem` da original. A RPC de envio ganhou `p_quoted`.

```sql
ALTER TABLE mensagens_geral ADD COLUMN IF NOT EXISTS quoted_id_mensagem text;

-- RETURNS void! (mensagens_geral.id é INTEGER; RETURNS uuid quebra TUDO com 22P02)
CREATE OR REPLACE FUNCTION send_mensagem_geral(
  p_instancia text, p_numero text, p_mensagem text, p_type text, p_hora text,
  p_base64 text DEFAULT NULL, p_nome text DEFAULT NULL, p_quoted text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO mensagens_geral
    (instancia, numero, mensagem, type, "horaLastMessage", base64, nome, quoted_id_mensagem, created_at)
  VALUES (p_instancia, p_numero, p_mensagem, p_type, p_hora, p_base64, p_nome, p_quoted, NOW());
END; $$;
```

**Webhook próprio pra resposta:** `.../webhook/respondermensagem` (diferente do envio normal), com payload `quoted_id`, `quoted_text`, `quoted_fromMe`, `quoted_remoteJid`. Na Evolution o quote precisa de `quoted.key` = `{ remoteJid, fromMe, id }`.

**Render:** a bolha mostra um bloco de citação clicável (rola até a original e pisca). O bloco aparece pra **qualquer** mensagem com `quoted_id_mensagem` (serve pra enviada e recebida).

### 1.3 Mostrar a mensagem que o CLIENTE respondeu (citação recebida)
Quando o cliente responde citando algo, a Evolution manda `contextInfo` no `messages.upsert`:
```
data.message.extendedTextMessage.contextInfo.stanzaId       // id da citada
data.message.extendedTextMessage.contextInfo.quotedMessage  // conteúdo citado
```
**No n8n** (fluxo que grava a mensagem recebida), preencher:
- `quoted_id_mensagem` = `...contextInfo.stanzaId`
- `quoted_text` = `contextInfo.quotedMessage.conversation` (ou `.extendedTextMessage.text` etc — pegar tolerante; imagem/áudio ficam em `imageMessage.contextInfo` etc).

```sql
ALTER TABLE mensagens_geral ADD COLUMN IF NOT EXISTS quoted_text text;
```
**Render:** se a original não está carregada, cai no `quoted_text` (mostra o trecho, sem link). Se está, mostra autor + link pra pular.

### 1.4 Buscar palavras na conversa (histórico inteiro) — lupa do WhatsApp
Lupa no cabeçalho → barra de busca. Procura no **banco** (não só no que está na tela) por `ilike` em `mensagem`, filtrando pela conversa. Lista os resultados (autor, data, trecho com o termo destacado). Clicar **pula pra mensagem** — se for antiga, carrega o intervalo até ela antes de rolar.

```js
// busca (debounce 300ms), escapando % _ do ilike
const esc = q.replace(/[\\%_]/g, s => '\\' + s)
supabase.from('mensagens_geral').select('*')
  .eq('instancia', instance).in('numero', numeroVariants(selected.session_id))
  .is('idgrupo', null).ilike('mensagem', `%${esc}%`)
  .order('id', { ascending: false }).limit(80)
```
Pra pular numa mensagem antiga: busca `.gte('id', row.id).lt('id', oldestLoadedId)`, prepend, e rola pela âncora `data-db-id={msg.id}`.

### 1.5 Motivos de encerramento editáveis (Finalizar conversa)
Os motivos padrão (Agendado, Resolvido, Encaminhado…) viram **linhas no banco**, semeadas 1x por instância (linha sentinela `__seeded__` evita ressemear o que foi apagado de propósito). Cada motivo tem **✏️ editar** (nome+cor) e **🗑️ excluir**, + link "Restaurar padrões".

```sql
CREATE TABLE conversation_close_reasons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia text NOT NULL, value text NOT NULL, label text NOT NULL,
  color text DEFAULT '#6B7280', created_at timestamptz DEFAULT now(),
  UNIQUE (instancia, value));
```
Sem migration extra: os padrão são semeados com `created_at` fixo (2020) pra ficarem sempre no topo; os criados depois pegam `now()`.

### 1.6 Outros (já existiam / reforçados)
Editar e apagar mensagem (com `id_mensagem`), marcar não-lido, "aguardando paciente", atribuição de atendimento por setor, transferir/puxar conversa, etiquetas.

---

## 2. Grupos — recursos WhatsApp

Mesma tabela `mensagens_geral`, filtrando por `idgrupo` (`...@g.us`). Diferença: em grupo as mensagens são **linhas cruas** no estado (não mapeadas).

- **Responder no grupo:** webhook próprio `.../webhook/respondermensagemgrupo`. O quote em grupo precisa de **`participant`** (JID de quem enviou a citada) além de `remoteJid` = idgrupo — sem `participant` a Evolution não cita em grupo.
- **Buscar grupo por nome:** filtro na lista (nome custom da clínica ou nome real).
- **Buscar palavras no grupo:** igual §1.4, filtrando por `idgrupo`. Busca no texto (`mensagem`), não no nome do remetente.
- **Marcar grupo como não lido:** recua o `last_read_at` em `conversation_reads`.
- **Número junto do nome:** mostra `Nome · 55...` na frente de quem enviou.
- **Renomear grupo** (só na plataforma): tabela de nomes custom por `(instancia, idgrupo)`.
- **Badge de não lidos na sidebar** (ver §4.2).

---

## 3. Agenda + Lembretes

### 3.1 Lembretes por agendamento (múltiplos + padrões)
Cada agendamento carrega **sua lista de avisos** (não é mais 1 config global). Ex.: avisar 7 dias antes E 1 dia antes.

```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminders jsonb DEFAULT '[]'::jsonb;
-- ex.: [{"offset_minutes":10080,"sent_at":null},{"offset_minutes":1440,"sent_at":null}]

CREATE TABLE reminder_presets (        -- combos reusáveis ("padrão")
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia text NOT NULL, name text NOT NULL,
  offsets jsonb NOT NULL DEFAULT '[]', is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now());
```
Cada aviso dispara em `starts_at - offset` e é marcado com `sent_at` pra não repetir. **Timing:** marcar hoje pro dia 23 com "1 dia antes" → o aviso sai **no dia 22**, não hoje (hoje só a confirmação de criação).

### 3.2 Motor de lembrete (cron) — ⚠️ anti-duplicação
`process_appointment_reminders()` roda via **pg_cron** a cada X min, varre agendamentos com aviso vencido e não enviado, manda 1 msg (loga + webhook) e marca `sent_at`.

**Duas armadilhas que nos morderam:**

1. **Dois agendadores = lembrete em dobro.** Se tiver dois `cron.job` (ou pg_cron + Schedule do n8n) chamando a função, nos minutos coincidentes os dois rodam juntos, os dois veem `sent_at=NULL`, os dois disparam. Sintoma: 2 msgs idênticas e 2 linhas em `mensagens_geral` com ~1ms de diferença.
   - **Fix 1 (trava):** advisory lock no início da função.
     ```sql
     IF NOT pg_try_advisory_xact_lock(778899) THEN RETURN 0; END IF;
     ```
   - **Fix 2 (limpeza):** deixar **só um** cron. `SELECT jobid, schedule, jobname FROM cron.job;` → `SELECT cron.unschedule('nome-do-duplicado');`

2. **JOIN fan-out:** se `companies.instance` não for único, o JOIN duplica cada agendamento. (No nosso caso era 1, mas vale checar.)

### 3.3 Só notificar na CRIAÇÃO do agendamento
Depois de criado, **nenhuma** mensagem automática por mudança (confirmar/cancelar/remarcar). Só sai:
- a **confirmação na criação** (padrão ou personalizada), e
- os **lembretes** que a clínica definiu.

No `handleSaveAppt`: `patientMsg` só é montada quando `isNew`. A seção "Mensagem de confirmação" no modal só aparece na criação.

### 3.4 Bloquear horário (ausência/almoço/férias)
Tabela `agenda_blocks` (por agenda). Slot bloqueado aparece **listrado** (`repeating-linear-gradient`) com cadeado e **não aceita** agendamento (clique abre desbloquear, drop recusado, e o salvar valida contra o bloqueio).

### 3.5 Zebra nas linhas de horário
Slots alternam branco/cinza (`idx % 2` no fundo da linha do grid) pra não se misturarem visualmente. Chips de turma também alternam tom.

### 3.6 Gotcha de layout
Grid items têm `min-width: auto` por padrão → nome grande estica a coluna. Corrigir com `minWidth: 0` na célula e no chip + `title` (tooltip).

---

## 4. Sidebar / badges

### 4.1 Badge de conversas (Recepção)
Contagem = conversas em mensagens_geral **sem encerrar e sem atendente ativo**. Recalcula por realtime.

### 4.2 Badge de grupos não lidos (bug clássico que corrigimos)
**Erro:** o badge só contava mensagem que chegava **ao vivo com o app aberto** — começava em 0 a cada F5. **Fix:** calcular a contagem **inicial no load** (grupos não silenciados com msg de cliente depois da última leitura), e o contador ao vivo **deduplica por grupo** (conta grupos, não mensagens). Reusa a RPC `api_grupos_lista` (com fallback).

---

## 5. Financeiro (não é WhatsApp, mas caiu bugs sérios)

### 5.1 ⭐ Paginação — o cap de 1000 escondia dados
**Erro grave:** o PostgREST devolve **no máximo 1000 linhas por request**. Clínica com muito movimento passa disso; como vinha ordenado por vencimento DESC, os **mais antigos (contas vencidas!) eram cortados e sumiam** — e distorciam todos os totais.
- **Fix:** paginar com `.range(from, from+999)` num loop até trazer tudo.

### 5.2 Tratar erro no load (não deixar tela "vazia" enganosa)
Se a query falha (timeout/instabilidade) e você faz `if (data) setX(data)` sem tratar, a lista fica vazia e parece "não tem conta". **Fix:** capturar o erro, mostrar aviso + "Tentar de novo", e **não** exibir o "nenhum lançamento" enganoso.

### 5.3 Filtro "Vencidas"
Toggle `Do mês / Vencidas` — "Vencidas" mostra todas as pendentes com vencimento < hoje, **de qualquer mês**, com selo de contagem.

---

## 6. Deduplicação de mensagens (echo da Evolution)

A Evolution reenvia o mesmo evento às vezes. Índice único parcial impede a cópia:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_geral_id_mensagem_instancia_unique
  ON mensagens_geral (id_mensagem, instancia)
  WHERE id_mensagem IS NOT NULL;
```
**No n8n:** o nó do Supabase vai dar erro `23505 (unique_violation)` na 2ª tentativa. Não é perda de dado (a msg já foi salva). Resolver com **UPSERT** (`onConflict: id_mensagem,instancia`, ignorar duplicada) ou **Continue On Fail**.

---

## 7. Webhooks n8n usados

| webhook | quando | payload-chave |
|---|---|---|
| `.../webhook/envioNexla` | envio normal + lembrete | `message`, `session_id`, `phone`, `instancia`, `api_instancia`, `sender_name` |
| `.../webhook/respondermensagem` | responder conversa privada | + `quoted_id`, `quoted_text`, `quoted_fromMe`, `quoted_remoteJid` |
| `.../webhook/respondermensagemgrupo` | responder em grupo | + `quoted_participant` (JID de quem enviou a citada), `quoted_remoteJid` = idgrupo |

**Entrada (recebimento):** o n8n escuta o `messages.upsert` da Evolution e grava em `mensagens_geral`. Ao gravar, extrair `id_mensagem` (key.id) e, se houver, o `contextInfo` (§1.3). Usar **upsert** (§6).

---

## 8. Ordem sugerida de migrations (o que rodar)

Núcleo de mensagens/WhatsApp:
1. `mensagens_geral_id_mensagem_instancia_unique` (dedup — §6)
2. `mensagens_quoted` (coluna `quoted_id_mensagem` + RPC `send_mensagem_geral` com `p_quoted`, **RETURNS void**)
3. `mensagens_quoted_incoming` (coluna `quoted_text` — §1.3)
4. `conversation_reads` (leituras/não-lido)
5. `group_custom_names` (renomear grupo)
6. `close_reasons` (motivos de encerramento — §1.5)

Agenda/lembrete:
7. `reminders_per_appointment` (jsonb `reminders` + `reminder_presets` + motor — §3.1/3.2)
8. `schedule_reminders_cron` (pg_cron — **só UM job!**)
9. `reminder_no_dup` (advisory lock — §3.2)
10. `agenda_blocks` (bloquear horário — §3.4)

> Regra de ouro: front é **deploy-safe** (§0.4), então pode subir antes; mas os recursos só ligam de verdade quando a migration correspondente roda.

---

## 9. Checklist pra replicar noutra plataforma

- [ ] `mensagens_geral` com os campos da §0.1 (principalmente `id_mensagem`, `quoted_id_mensagem`, `quoted_text`, `idgrupo`, `aplicativo`).
- [ ] Índice único de dedup + **upsert no n8n** (§6).
- [ ] RPC `send_mensagem_geral` **RETURNS void** com `p_quoted` (§1.2).
- [ ] Realtime assinando `mensagens_geral` por `instancia` (§0.2).
- [ ] **Canonicalização BR do número** em lista/load/realtime/envio (§1.1) — isso sozinho resolve "some mensagem / conversa dividida".
- [ ] Webhooks: envioNexla + respondermensagem + respondermensagemgrupo (§7); n8n gravando `contextInfo` na entrada (§1.3).
- [ ] Busca na conversa/grupo por `ilike` no banco + pular pra mensagem (§1.4).
- [ ] Lembrete: motor + pg_cron **único** + advisory lock (§3.2).
- [ ] Financeiro (se tiver): **paginar** (§5.1) e tratar erro no load (§5.2).
- [ ] Timezone por **offset** (§0.5).

---

_Gerado a partir do trabalho feito no Med Mag (clinimag). Cada item tem o commit correspondente no histórico do repo._
