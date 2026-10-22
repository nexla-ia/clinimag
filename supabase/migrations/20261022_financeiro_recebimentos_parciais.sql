-- ============================================================================
-- Financeiro: recebimento PARCIAL + VÁRIAS FORMAS (ex.: R$100 dinheiro + R$100 pix)
-- ----------------------------------------------------------------------------
-- Antes: cada lançamento tinha 1 forma/1 conta e status pendente|pago.
-- Agora: um lançamento pode ter VÁRIOS recebimentos (cada um com valor, forma,
-- conta, data). O status passa a ter "parcial" quando o recebido é menor que o
-- total. `valor_pago` guarda a soma recebida (pra lista/KPIs sem join).
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase (sbzwtnxx).
-- ============================================================================

SET search_path TO public;

-- Quanto já foi recebido/pago do lançamento (soma dos recebimentos).
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS valor_pago numeric(12,2) NOT NULL DEFAULT 0;

-- Histórico de recebimentos/pagamentos (1 lançamento → N linhas).
CREATE TABLE IF NOT EXISTS public.financial_payments (
  id              uuid primary key default gen_random_uuid(),
  instancia       text not null,
  transaction_id  uuid not null references public.financial_transactions(id) on delete cascade,
  valor           numeric(12,2) not null,
  juros           numeric(12,2) not null default 0,
  forma_pagamento text,
  bank_account_id uuid,
  pagamento_at    date not null default current_date,
  created_by      text,
  created_at      timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS financial_payments_tx_idx   ON public.financial_payments(transaction_id);
CREATE INDEX IF NOT EXISTS financial_payments_inst_idx ON public.financial_payments(instancia);

ALTER TABLE public.financial_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.financial_payments'::regclass AND polname = 'allow all') THEN
    CREATE POLICY "allow all" ON public.financial_payments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Backfill: lançamentos já PAGOS passam a ter valor_pago = valor (pra "parcial"
-- começar do estado certo). Os pendentes ficam com 0.
UPDATE public.financial_transactions
   SET valor_pago = valor
 WHERE status = 'pago' AND COALESCE(valor_pago, 0) = 0;
