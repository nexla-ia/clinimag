-- ============================================================================
-- CRM: etapas de conversão / não-convertido, motivos de não-conversão e
-- auto-avanço do "Novo Lead" quando a clínica responde.
-- ----------------------------------------------------------------------------
-- 1) crm_stages ganha flags is_conversion / is_lost (marcadas no modal da etapa).
-- 2) crm_loss_reasons: motivos de "não convertido" por instância (editáveis),
--    espelhando conversation_close_reasons. O motivo escolhido é gravado em
--    crm_contacts.motivo_perda (que as métricas já leem).
-- 3) Gatilho crm_advance_on_reply: quando o lead está na 1ª etapa (Novo Lead)
--    e recebe uma resposta de volta (type atendente/ia), avança 1 etapa. Só 1x.
-- ============================================================================

-- 1) Flags de etapa -----------------------------------------------------------
alter table public.crm_stages add column if not exists is_conversion boolean not null default false;
alter table public.crm_stages add column if not exists is_lost       boolean not null default false;

-- 2) Motivos de não-conversão (por instância) ---------------------------------
create table if not exists public.crm_loss_reasons (
  id         uuid primary key default gen_random_uuid(),
  instancia  text not null,
  value      text not null,
  label      text not null,
  color      text,
  created_at timestamptz not null default now(),
  unique (instancia, value)
);
alter table public.crm_loss_reasons enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid = 'public.crm_loss_reasons'::regclass and polname = 'allow all') then
    create policy "allow all" on public.crm_loss_reasons for all using (true) with check (true);
  end if;
end $$;

-- Semeia os motivos padrão pra cada instância que já tem funil de CRM.
insert into public.crm_loss_reasons (instancia, value, label, color)
select f.instancia, d.value, d.label, d.color
  from (select distinct instancia from public.crm_funnels) f
  cross join (values
    ('preco',        'Preço',                 '#F97316'),
    ('nao_respondeu','Não respondeu',         '#64748B'),
    ('concorrencia', 'Concorrência',          '#8B5CF6'),
    ('sem_interesse','Sem interesse',         '#EF4444'),
    ('sem_encaixe',  'Sem encaixe na agenda', '#0EA5E9'),
    ('outro',        'Outro',                 '#94A3B8')
  ) as d(value, label, color)
on conflict (instancia, value) do nothing;

-- 3) Auto-avanço do Novo Lead ao receber resposta -----------------------------
-- Índice pra casar telefone normalizado rápido (crm_norm_phone é IMMUTABLE).
create index if not exists crm_contacts_norm_phone_idx
  on public.crm_contacts (instancia, public.crm_norm_phone(phone));

create or replace function public.crm_advance_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact     public.crm_contacts%rowtype;
  v_cur_pos     integer;
  v_min_pos     integer;
  v_next_stage  uuid;
begin
  if TG_TABLE_NAME <> 'mensagens_geral' then return new; end if;
  -- Grupo não é lead individual.
  if new.idgrupo is not null and new.idgrupo <> '' then return new; end if;
  if new.numero is null then return new; end if;
  -- Só "resposta de volta" (clínica -> lead): atendente ou IA.
  if lower(coalesce(new.type, '')) not in ('atendente', 'ia') then return new; end if;

  -- Acha o lead pelo telefone normalizado (com/sem 9) na mesma instância.
  select c.* into v_contact
    from public.crm_contacts c
   where c.instancia = new.instancia
     and public.crm_norm_phone(c.phone) = public.crm_norm_phone(new.numero)
   order by c.created_at asc
   limit 1;
  if v_contact.id is null or v_contact.stage_id is null or v_contact.funil_id is null then
    return new;
  end if;

  -- Posição da etapa atual e a menor posição do funil (a "1ª etapa").
  select posicao into v_cur_pos from public.crm_stages where id = v_contact.stage_id;
  select min(posicao) into v_min_pos from public.crm_stages where funil_id = v_contact.funil_id;
  if v_cur_pos is null or v_min_pos is null or v_cur_pos <> v_min_pos then
    return new; -- só avança quem está na 1ª etapa (Novo Lead)
  end if;

  -- Próxima etapa (menor posição acima da atual).
  select id into v_next_stage
    from public.crm_stages
   where funil_id = v_contact.funil_id and posicao > v_cur_pos
   order by posicao asc
   limit 1;
  if v_next_stage is null then return new; end if;

  update public.crm_contacts
     set stage_id = v_next_stage, data_entrada_etapa = now()
   where id = v_contact.id;
  return new;
end;
$$;

drop trigger if exists trg_crm_advance_on_reply on public.mensagens_geral;
create trigger trg_crm_advance_on_reply
  after insert on public.mensagens_geral
  for each row
  execute function public.crm_advance_on_reply();
