-- ============================================================================
-- Financeiro: categoria certa na cobrança que vem da AGENDA
-- ----------------------------------------------------------------------------
-- Problema (avivar, 29/10): fin_sync_on_appointment escolhia a categoria com
-- `lower(nome) LIKE '%consulta%'` (a da clínica primeiro). Quando a clínica criou
-- "Consulta Pélvica", TODA cobrança da agenda (Pilates inclusive) passou a cair
-- nela, e era preciso trocar à mão.
--
-- Agora a categoria é escolhida assim (fin_categoria_for_proc):
--   1. a categoria definida no próprio procedimento (Catálogo Clínico →
--      procedures.fin_categoria_id);
--   2. uma categoria DA CLÍNICA cujo nome aparece no nome do procedimento
--      (ex.: "Pilates" ⊂ "Pilates 2x por semana") — a de nome mais longo;
--   3. a categoria com o nome do TIPO do serviço ("Consulta", "Procedimento",
--      "Exame"; mensalidade → "Consulta"), da clínica antes da padrão;
--   4. o comportamento antigo (qualquer '%consulta%').
--
-- Também corrige as cobranças já lançadas pela agenda que ficaram na categoria
-- do jeito antigo, quando o procedimento tem uma categoria específica (1 ou 2).
--
-- Seguro rodar mais de uma vez. Cole no SQL Editor do Supabase (sbzwtnxx).
-- ============================================================================

SET search_path TO public;

ALTER TABLE public.procedures
  ADD COLUMN IF NOT EXISTS fin_categoria_id uuid;

-- Categoria ESPECÍFICA do procedimento (regras 1 e 2). NULL se não houver.
CREATE OR REPLACE FUNCTION public.fin_categoria_especifica(p_instancia text, p_procedure_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_cat  uuid;
  v_name text;
BEGIN
  IF p_procedure_id IS NULL THEN RETURN NULL; END IF;
  SELECT fin_categoria_id, name INTO v_cat, v_name FROM procedures WHERE id = p_procedure_id;
  IF v_cat IS NOT NULL THEN RETURN v_cat; END IF;
  IF COALESCE(btrim(v_name), '') = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_cat FROM financial_categories
   WHERE instancia = p_instancia
     AND tipo IN ('receita', 'ambos')
     AND length(btrim(nome)) >= 3
     AND position(lower(btrim(nome)) IN lower(v_name)) > 0
   ORDER BY length(btrim(nome)) DESC
   LIMIT 1;
  RETURN v_cat;
END;
$$;

-- Categoria final da cobrança (regras 1 → 4).
CREATE OR REPLACE FUNCTION public.fin_categoria_for_proc(p_instancia text, p_procedure_id uuid, p_type text)
RETURNS uuid LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_cat  uuid;
  v_tipo text;
BEGIN
  v_cat := public.fin_categoria_especifica(p_instancia, p_procedure_id);
  IF v_cat IS NOT NULL THEN RETURN v_cat; END IF;

  v_tipo := CASE lower(COALESCE(p_type, ''))
              WHEN 'procedimento' THEN 'procedimento'
              WHEN 'exame'        THEN 'exame'
              ELSE 'consulta' END;
  SELECT id INTO v_cat FROM financial_categories
   WHERE (instancia = p_instancia OR instancia = '_default_')
     AND tipo IN ('receita', 'ambos')
     AND lower(btrim(nome)) IN (v_tipo, v_tipo || 's')
   ORDER BY (instancia = p_instancia) DESC
   LIMIT 1;
  IF v_cat IS NOT NULL THEN RETURN v_cat; END IF;

  SELECT id INTO v_cat FROM financial_categories
   WHERE (instancia = p_instancia OR instancia = '_default_')
     AND tipo IN ('receita', 'ambos') AND lower(nome) LIKE '%consulta%'
   ORDER BY (instancia = p_instancia) DESC, length(nome) ASC
   LIMIT 1;
  RETURN v_cat;
END;
$$;

-- Mesma função de 20260818_mensalidade_financeiro, trocando só a escolha da categoria.
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

      v_cat := public.fin_categoria_for_proc(NEW.instancia, NEW.procedure_id, v_proc_type);

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

  -- ── Demais tipos: cobrança avulsa por atendimento ────────────────────────
  IF COALESCE(NEW.price, 0) <= 0 THEN RETURN NEW; END IF;

  SELECT id INTO v_existing FROM financial_transactions WHERE appointment_id = NEW.id LIMIT 1;

  v_status := CASE
    WHEN lower(COALESCE(NEW.status, '')) = 'cancelado'    THEN 'cancelado'
    WHEN lower(COALESCE(NEW.payment_status, '')) = 'pago' THEN 'pago'
    ELSE 'pendente'
  END;

  IF v_existing IS NULL THEN
    v_cat := public.fin_categoria_for_proc(NEW.instancia, NEW.procedure_id, v_proc_type);
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

-- ── Correção das cobranças já lançadas pela agenda ──────────────────────────
-- Só mexe nas que ainda estão na categoria que a regra ANTIGA escolheria
-- (as que a clínica já trocou à mão ficam como estão) e só quando o
-- procedimento tem categoria específica (regra 1 ou 2).
WITH alvo AS (
  SELECT ft.id,
         public.fin_categoria_especifica(
           ft.instancia,
           COALESCE(a.procedure_id,
                    CASE WHEN ft.mensalidade_key ~ '^[^|]*\|[0-9a-f-]{36}\|'
                         THEN split_part(ft.mensalidade_key, '|', 2)::uuid END)
         ) AS nova,
         (SELECT c.id FROM financial_categories c
           WHERE (c.instancia = ft.instancia OR c.instancia = '_default_')
             AND c.tipo IN ('receita', 'ambos') AND lower(c.nome) LIKE '%consulta%'
           ORDER BY (c.instancia = ft.instancia) DESC
           LIMIT 1) AS antiga
    FROM public.financial_transactions ft
    LEFT JOIN public.appointments a ON a.id = ft.appointment_id
   WHERE ft.created_by LIKE 'Agenda%'
     AND ft.tipo = 'receita'
)
UPDATE public.financial_transactions ft
   SET categoria_id = alvo.nova
  FROM alvo
 WHERE ft.id = alvo.id
   AND alvo.nova IS NOT NULL
   AND ft.categoria_id IS NOT DISTINCT FROM alvo.antiga
   AND alvo.nova IS DISTINCT FROM ft.categoria_id;
