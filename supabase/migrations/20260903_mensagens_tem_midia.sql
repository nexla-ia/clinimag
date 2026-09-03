-- ============================================================================
-- Egress: coluna leve tem_midia para não trafegar base64 na carga do thread
-- ----------------------------------------------------------------------------
-- Problema: abrir uma conversa baixava o base64 (mídia inteira) de até 50
-- mensagens, TODA vez — o maior consumo de "Saída" (egress) do projeto.
--
-- Solução: uma coluna boolean tem_midia (só diz SE existe mídia, sem o conteúdo).
-- O frontend passa a carregar o thread sem o base64 e busca o base64 sob demanda,
-- apenas das mídias que aparecem na tela.
-- ============================================================================

alter table public.mensagens_geral
  add column if not exists tem_midia boolean;

-- Mantém tem_midia automaticamente ao inserir/alterar o base64.
create or replace function public.mensagens_set_tem_midia()
returns trigger
language plpgsql
as $$
begin
  new.tem_midia := (new.base64 is not null and length(new.base64) > 0);
  return new;
end;
$$;

drop trigger if exists trg_mensagens_tem_midia on public.mensagens_geral;
create trigger trg_mensagens_tem_midia
  before insert or update of base64 on public.mensagens_geral
  for each row
  execute function public.mensagens_set_tem_midia();

-- Backfill só das linhas COM mídia (minoria) — as de texto ficam NULL e o
-- frontend as trata como "sem mídia". Leve, roda rápido.
update public.mensagens_geral
  set tem_midia = true
  where base64 is not null and tem_midia is distinct from true;
