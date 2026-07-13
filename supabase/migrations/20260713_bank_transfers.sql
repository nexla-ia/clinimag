-- ==============================================================
-- Financeiro — transferências entre contas
-- Move dinheiro de uma conta para outra (ex.: Sicoob → Itaú) ou saída para
-- pessoa/externo. Ajusta o saldo das contas SEM contar como receita/despesa
-- (é neutro no resultado/DRE).
--
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.bank_transfers (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia       text        NOT NULL,
  from_account_id uuid        REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  to_account_id   uuid        REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  to_externo      text,                          -- destino externo (pessoa/empresa) quando não é outra conta
  valor           numeric(12,2) NOT NULL DEFAULT 0,
  data            date        NOT NULL DEFAULT CURRENT_DATE,
  descricao       text,
  created_by      text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bank_transfers_all" ON public.bank_transfers
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS bank_transfers_instancia_idx ON public.bank_transfers (instancia);
CREATE INDEX IF NOT EXISTS bank_transfers_from_idx      ON public.bank_transfers (from_account_id);
CREATE INDEX IF NOT EXISTS bank_transfers_to_idx        ON public.bank_transfers (to_account_id);
