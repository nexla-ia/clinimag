-- ==============================================================
-- Mensalidade no Catálogo Clínico → financeiro 1x por mês
--
-- Agora o Catálogo Clínico tem o tipo de serviço "mensalidade" (ex:
-- Pilates 2x/semana, com valor MENSAL). Quando o paciente é agendado
-- nesse serviço, o financeiro deve lançar a mensalidade UMA vez por mês
-- (valor cheio), e não por sessão — mesmo com várias sessões no mês.
--
-- Aqui:
--  • financial_transactions.mensalidade_key: chave de dedup
--    (instancia | procedure_id | paciente | AAAA-MM) — garante 1 por mês.
--  • fin_sync_on_appointment: se o procedimento é 'mensalidade', cria 1
--    lançamento mensal (dedup pela chave, usando o valor mensal do
--    procedimento) e NÃO gera cobrança por sessão. Os demais tipos seguem
--    como antes.
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase (sbzwtnxx).
-- ==============================================================

SET search_path TO public;

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS mensalidade_key text;

-- 1 lançamento por (paciente + serviço + mês). NULLs não conflitam, então
-- os lançamentos normais (key nula) convivem sem problema.
CREATE UNIQUE INDEX IF NOT EXISTS fin_tx_mensalidade_key_uq
  ON public.financial_transactions (mensalidade_key);

CREATE OR REPLACE FUNCTION public.fin_sync_on_appointment()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_existing  uuid;
  v_cat       uuid;
  v_desc      text;
  v_status    text;
  v_proc_type text;
  v_proc_name text;
  v_monthly   numeric;
  v_comp      date;
  v_key       text;
BEGIN
  -- Agendamento de plano de tratamento não gera cobrança avulsa.
  IF NEW.treatment_plan_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Tipo + valor mensal do procedimento (uma consulta só).
  SELECT type, name, COALESCE(price_particular, 0)
    INTO v_proc_type, v_proc_name, v_monthly
    FROM procedures WHERE id = NEW.procedure_id;

  -- ── MENSALIDADE: 1 lançamento por mês (paciente + serviço + mês) ──────────
  IF v_proc_type = 'mensalidade' THEN
    IF v_monthly > 0 THEN
      v_comp := date_trunc('month', NEW.starts_at)::date;
      v_key  := NEW.instancia || '|' || NEW.procedure_id::text || '|'
                || COALESCE(NULLIF(btrim(NEW.contact_numero), ''), NEW.contact_nome, '') || '|'
                || to_char(v_comp, 'YYYY-MM');

      SELECT id INTO v_cat FROM financial_categories
       WHERE (instancia = NEW.instancia OR instancia = '_default_')
         AND tipo IN ('receita', 'ambos') AND lower(nome) LIKE '%consulta%'
       ORDER BY (instancia = NEW.instancia) DESC LIMIT 1;

      INSERT INTO financial_transactions
        (instancia, tipo, descricao, valor, status, categoria_id, vencimento,
         contact_nome, competencia, mensalidade_key, created_by)
      VALUES
        (NEW.instancia, 'receita',
         'Mensalidade — ' || COALESCE(v_proc_name, 'Serviço') || ' — '
           || COALESCE(NEW.contact_nome, 'Paciente') || ' (' || to_char(v_comp, 'MM/YYYY') || ')',
         v_monthly, 'pendente', v_cat, NEW.starts_at::date,
         NEW.contact_nome, v_comp, v_key, 'Agenda (mensalidade)')
      ON CONFLICT (mensalidade_key) DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- ── Demais tipos: cobrança avulsa por atendimento (como antes) ───────────
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

    v_desc := COALESCE(v_proc_name, 'Consulta') || ' — ' || COALESCE(NEW.contact_nome, 'Paciente');

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

DROP TRIGGER IF EXISTS fin_sync_appt ON public.appointments;
CREATE TRIGGER fin_sync_appt
  AFTER INSERT OR UPDATE OF price, status, payment_status, paid_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fin_sync_on_appointment();
