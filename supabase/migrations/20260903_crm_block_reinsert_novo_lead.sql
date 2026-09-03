-- ============================================================================
-- CRM: não recriar como "Novo Lead" quem já passou pelo funil
-- ----------------------------------------------------------------------------
-- Problema: o n8n insere leads em crm_contacts sem checar se a pessoa já existe.
-- Resultado: quem já foi atendido (ou movido/removido) volta a aparecer como
-- "Novo Lead" quando manda mensagem de novo, e gera cards duplicados.
--
-- Solução: um gatilho BEFORE INSERT que, se já existir um card com o mesmo
-- telefone (com ou sem o 9º dígito) na mesma instância — em QUALQUER etapa,
-- inclusive já atendido/removido — cancela o INSERT silenciosamente (retorna
-- 0 linhas, sem erro). O card existente permanece onde está.
--
-- Não interfere no fluxo manual da plataforma: ao "Adicionar ao CRM" um contato
-- que já existe, o app faz UPDATE (move/revive), não INSERT — então o gatilho
-- (que só age em INSERT) não é acionado.
--
-- OBS n8n: se o nó de inserção lê a linha de volta (Prefer: return=representation
-- + single), quando o lead for bloqueado ele receberá 0 linhas. Prefira, no n8n,
-- checar antes com um SELECT — ou usar return=minimal — para não logar "erro".
-- ============================================================================

-- Normaliza telefone BR igual ao frontend (normalizeBRDigits): só dígitos,
-- garante o 55, e remove o 9º dígito do celular -> forma canônica sem o 9.
create or replace function public.crm_norm_phone(p text)
returns text
language plpgsql
immutable
as $$
declare d text;
begin
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  if d = '' then
    return '';
  end if;
  -- número local (DDD + fone) sem código do país -> prefixa 55
  if length(d) in (10, 11) then
    d := '55' || d;
  end if;
  -- 55 + DDD(2) + 9 + 8 dígitos  ->  tira o 9 (canônico sem o 9)
  if length(d) = 13 and left(d, 2) = '55' and substr(d, 5, 1) = '9' then
    d := '55' || substr(d, 3, 2) || substr(d, 6);
  end if;
  return d;
end;
$$;

create or replace function public.crm_block_reinsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.crm_contacts c
    where c.instancia = new.instancia
      and public.crm_norm_phone(c.phone) = public.crm_norm_phone(new.phone)
  ) then
    -- Já passou pelo funil: não recria como novo lead.
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_block_reinsert on public.crm_contacts;
create trigger trg_crm_block_reinsert
  before insert on public.crm_contacts
  for each row
  execute function public.crm_block_reinsert();
