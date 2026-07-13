-- ==============================================================
-- Financeiro/Agenda — versão CANÔNICA do gatilho (função + trigger juntos)
-- Garante o estado final correto independentemente da ordem em que as
-- migrations anteriores foram aplicadas. Inclui a blindagem de plano
-- (agendamento de plano NÃO gera cobrança avulsa) e recria o trigger.
--
-- Seguro rodar a qualquer momento. Rode este DEPOIS dos outros.
-- ==============================================================

SET search_path TO public;

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
  -- Agendamentos de plano de tratamento não geram cobrança avulsa (a cobrança
  -- do paciente do plano é a mensalidade).
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

-- (Re)cria o trigger junto da função — nunca fica função sem trigger nem
-- trigger apontando pra versão sem a blindagem.
DROP TRIGGER IF EXISTS fin_sync_appt ON public.appointments;
CREATE TRIGGER fin_sync_appt
  AFTER INSERT OR UPDATE OF price, status, payment_status, paid_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fin_sync_on_appointment();

-- Foreign keys dos vínculos de plano (integridade + permite embeds no futuro)
DO $$ BEGIN
  ALTER TABLE public.appointments
    ADD CONSTRAINT appointments_treatment_plan_id_fkey
    FOREIGN KEY (treatment_plan_id) REFERENCES public.treatment_plans(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
