-- ==============================================================
-- Integração Agenda → Financeiro
-- Ao criar um agendamento com valor, cai automaticamente no Financeiro
-- como receita "a receber". Se o agendamento for marcado como pago (ou
-- concluído, que já marca pago), o lançamento vira "pago". Cancelado → o
-- lançamento é cancelado.
--
-- Uma linha por agendamento (appointment_id), sem duplicar.
-- Blindado com EXCEPTION: nunca bloqueia o agendamento.
-- Para usar: cole no SQL Editor do Supabase do projeto.
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
  -- Sem valor não gera financeiro
  IF COALESCE(NEW.price, 0) <= 0 THEN RETURN NEW; END IF;

  SELECT id INTO v_existing
  FROM financial_transactions
  WHERE appointment_id = NEW.id
  LIMIT 1;

  -- Status do lançamento conforme o agendamento
  v_status := CASE
    WHEN lower(COALESCE(NEW.status, '')) = 'cancelado'        THEN 'cancelado'
    WHEN lower(COALESCE(NEW.payment_status, '')) = 'pago'     THEN 'pago'
    ELSE 'pendente'
  END;

  IF v_existing IS NULL THEN
    -- Categoria "Consulta" (receita) se existir
    SELECT id INTO v_cat
    FROM financial_categories
    WHERE (instancia = NEW.instancia OR instancia = '_default_')
      AND tipo IN ('receita', 'ambos')
      AND lower(nome) LIKE '%consulta%'
    ORDER BY (instancia = NEW.instancia) DESC
    LIMIT 1;

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
    -- Já existe: sincroniza valor, status e data de pagamento (sem apagar a
    -- data se já tinha sido preenchida à mão no Financeiro)
    UPDATE financial_transactions
    SET valor = NEW.price,
        status = v_status,
        pagamento_at = CASE
          WHEN v_status = 'pago' THEN COALESCE(pagamento_at, NEW.paid_at::date, CURRENT_DATE)
          ELSE pagamento_at
        END
    WHERE id = v_existing;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_sync_appt ON public.appointments;
CREATE TRIGGER fin_sync_appt
  AFTER INSERT OR UPDATE OF price, status, payment_status, paid_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fin_sync_on_appointment();
