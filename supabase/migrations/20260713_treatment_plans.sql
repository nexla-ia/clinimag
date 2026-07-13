-- ==============================================================
-- Planos de tratamento recorrentes (multi-fisioterapeuta) — FASE 1: base
-- - professionals ganha valor por atendimento (repasse)
-- - treatment_plans: mensalidade, duração em meses, padrão semanal
-- - treatment_plan_slots: cada atendimento recorrente da semana (dia/hora/fisio)
-- - appointments e financial_transactions ganham vínculo com o plano
-- - o gatilho Agenda→Financeiro passa a IGNORAR agendamentos de plano
--   (a cobrança do paciente é a mensalidade, não por atendimento)
--
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

-- Valor por atendimento do profissional (base do repasse)
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS valor_atendimento numeric(10,2) DEFAULT 0;

-- ── Planos de tratamento ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.treatment_plans (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia      text        NOT NULL,
  contact_numero text,
  contact_nome   text        NOT NULL,
  valor_mensal   numeric(10,2) NOT NULL DEFAULT 0,   -- mensalidade do paciente
  meses          integer     NOT NULL DEFAULT 1,     -- duração do plano
  data_inicio    date        NOT NULL,
  status         text        NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','concluido','cancelado')),
  observacoes    text,
  created_by     text,
  created_at     timestamptz DEFAULT now()
);

-- Padrão semanal: uma linha por atendimento recorrente na semana
CREATE TABLE IF NOT EXISTS public.treatment_plan_slots (
  id                uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id           uuid  REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  instancia         text  NOT NULL,
  weekday           integer NOT NULL,   -- 0=Dom ... 6=Sáb
  hora              time  NOT NULL,
  professional_id   uuid,
  professional_nome text,
  created_at        timestamptz DEFAULT now()
);

-- Vínculos
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS treatment_plan_id uuid;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS treatment_plan_id uuid,
  ADD COLUMN IF NOT EXISTS professional_id   uuid,
  ADD COLUMN IF NOT EXISTS competencia       date;   -- mês de referência (mensalidade / repasse)

-- RLS
ALTER TABLE public.treatment_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plan_slots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "treatment_plans_all"      ON public.treatment_plans      FOR ALL TO authenticated, anon USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "treatment_plan_slots_all" ON public.treatment_plan_slots FOR ALL TO authenticated, anon USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS treatment_plans_inst_idx    ON public.treatment_plans (instancia);
CREATE INDEX IF NOT EXISTS treatment_plan_slots_plan_idx ON public.treatment_plan_slots (plan_id);
CREATE INDEX IF NOT EXISTS appointments_plan_idx       ON public.appointments (treatment_plan_id);
CREATE INDEX IF NOT EXISTS fin_transactions_plan_idx   ON public.financial_transactions (treatment_plan_id);

-- ── Gatilho Agenda→Financeiro: ignora agendamentos de plano ─────────────────
-- (a cobrança do paciente do plano é a mensalidade, não por atendimento)
CREATE OR REPLACE FUNCTION public.fin_sync_on_appointment()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_existing uuid;
  v_cat      uuid;
  v_desc     text;
  v_status   text;
BEGIN
  -- Agendamentos de plano de tratamento não geram cobrança avulsa
  IF NEW.treatment_plan_id IS NOT NULL THEN RETURN NEW; END IF;
  -- Sem valor não gera financeiro
  IF COALESCE(NEW.price, 0) <= 0 THEN RETURN NEW; END IF;

  SELECT id INTO v_existing FROM financial_transactions WHERE appointment_id = NEW.id LIMIT 1;

  v_status := CASE
    WHEN lower(COALESCE(NEW.status, '')) = 'cancelado'    THEN 'cancelado'
    WHEN lower(COALESCE(NEW.payment_status, '')) = 'pago' THEN 'pago'
    ELSE 'pendente'
  END;

  IF v_existing IS NULL THEN
    SELECT id INTO v_cat FROM financial_categories
     WHERE (instancia = NEW.instancia OR instancia = '_default_')
       AND tipo IN ('receita', 'ambos') AND lower(nome) LIKE '%consulta%'
     ORDER BY (instancia = NEW.instancia) DESC LIMIT 1;

    v_desc := COALESCE((SELECT name FROM procedures WHERE id = NEW.procedure_id), 'Consulta')
              || ' — ' || COALESCE(NEW.contact_nome, 'Paciente');

    INSERT INTO financial_transactions
      (instancia, tipo, descricao, valor, status, categoria_id, vencimento,
       pagamento_at, contact_nome, appointment_id, created_by)
    VALUES
      (NEW.instancia, 'receita', v_desc, NEW.price, v_status, v_cat, NEW.starts_at::date,
       CASE WHEN v_status = 'pago' THEN COALESCE(NEW.paid_at::date, CURRENT_DATE) ELSE NULL END,
       NEW.contact_nome, NEW.id, 'Agenda (automático)');
  ELSE
    UPDATE financial_transactions
       SET valor = NEW.price, status = v_status,
           pagamento_at = CASE WHEN v_status = 'pago' THEN COALESCE(pagamento_at, NEW.paid_at::date, CURRENT_DATE) ELSE pagamento_at END
     WHERE id = v_existing;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
