-- ==============================================================
-- Financeiro — contas bancárias + detalhes de pagamento
-- - Tabela de contas bancárias (pra ter o movimento por conta)
-- - Lançamentos ganham juros e a conta em que foram pagos
--
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia     text        NOT NULL,
  nome          text        NOT NULL,          -- ex: "Banco do Brasil - CC", "Caixa PJ"
  banco         text,                          -- opcional (nome do banco)
  tipo          text        DEFAULT 'corrente',-- corrente / poupanca / caixa / outro
  saldo_inicial numeric     DEFAULT 0,         -- saldo de abertura da conta
  ativo         boolean     DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bank_accounts_all" ON public.bank_accounts
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS bank_accounts_instancia_idx ON public.bank_accounts (instancia);

-- Lançamentos: juros (pagamento em atraso) + conta bancária usada no pagamento
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS juros           numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fin_transactions_bank_idx
  ON public.financial_transactions (bank_account_id);
