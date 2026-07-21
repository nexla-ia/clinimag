-- ==============================================================
-- Lembrete automático saindo DUPLICADO — trava contra execução concorrente
--
-- DIAGNÓSTICO (Avivar, 21/07): o mesmo lembrete chegou 2x no WhatsApp do
-- paciente, no mesmo minuto. No banco havia DUAS linhas em mensagens_geral
-- criadas com ~1 milissegundo de diferença (ids 10587 e 10588), e o
-- agendamento tinha só 1 aviso marcado como enviado. Ou seja:
-- process_appointment_reminders() rodou DUAS VEZES ao mesmo tempo — as duas
-- viram o aviso como "não enviado", as duas dispararam o webhook. Isso
-- acontece quando há MAIS DE UM agendador chamando a função (ex.: o pg_cron
-- 'appointment-reminders' E um nó Schedule do n8n, os dois a cada 15 min).
--
-- Correção: um advisory lock no início da função. Se outra execução já está
-- rodando, esta sai na hora (RETURN 0). Assim, mesmo com dois agendadores,
-- cada aviso é enviado UMA vez só. (O ideal é também deixar só UM agendador
-- ativo — ver nota no fim.)
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- ==============================================================

SET search_path TO public;

CREATE OR REPLACE FUNCTION public.process_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r             record;
  e             jsonb;
  new_reminders jsonb;
  sent_any      boolean;
  cnt           integer := 0;
  msg           text;
  appt_local    timestamp;
  session_id    text;
  payload       jsonb;
BEGIN
  -- Trava global: se já tem uma execução em andamento (outro agendador
  -- chamou ao mesmo tempo), esta sai sem fazer nada — evita o envio em dobro.
  IF NOT pg_try_advisory_xact_lock(778899) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT
      a.id, a.contact_numero, a.contact_nome, a.starts_at, a.instancia,
      a.reminders, a.procedure_id,
      c.name              AS company_name,
      c.api_instancia,
      COALESCE(NULLIF(c.timezone, ''), '-03:00') AS tz_offset,
      p.name              AS prof_name,
      pr.reminder_message AS proc_msg
    FROM public.appointments a
    JOIN public.companies c   ON c.instance = a.instancia
    LEFT JOIN public.professionals p ON p.id = a.professional_id
    LEFT JOIN public.procedures   pr ON pr.id = a.procedure_id
    WHERE a.status IN ('agendado', 'confirmado')
      AND a.contact_numero IS NOT NULL AND a.contact_numero <> ''
      AND a.starts_at > now()
      AND jsonb_typeof(a.reminders) = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(a.reminders) x
        WHERE (x->>'sent_at') IS NULL
          AND a.starts_at - make_interval(mins => (x->>'offset_minutes')::int) <= now()
      )
  LOOP
    appt_local := r.starts_at AT TIME ZONE (r.tz_offset)::interval;

    -- Texto: usa a mensagem do procedimento se houver, senão o padrão
    IF r.proc_msg IS NOT NULL AND btrim(r.proc_msg) <> '' THEN
      msg := regexp_replace(
               regexp_replace(r.proc_msg, '\{nome\}', COALESCE(r.contact_nome, ''), 'gi'),
               '\{data\}', to_char(appt_local, 'DD/MM, HH24:MI'), 'gi');
    ELSE
      msg := format(
        'Olá %s! 👋 Passando pra lembrar da sua consulta no dia %s às %s%s. Até lá! 🩺',
        r.contact_nome, to_char(appt_local, 'DD/MM'), to_char(appt_local, 'HH24:MI'),
        CASE WHEN r.prof_name IS NOT NULL AND r.prof_name <> ''
          THEN ' com ' || r.prof_name ELSE '' END);
    END IF;

    -- Marca os avisos vencidos como enviados (reconstrói o array)
    new_reminders := '[]'::jsonb;
    sent_any := false;
    FOR e IN SELECT * FROM jsonb_array_elements(r.reminders) LOOP
      IF (e->>'sent_at') IS NULL
         AND r.starts_at - make_interval(mins => (e->>'offset_minutes')::int) <= now() THEN
        new_reminders := new_reminders || jsonb_build_object(
          'offset_minutes', (e->>'offset_minutes')::int,
          'sent_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'));
        sent_any := true;
      ELSE
        new_reminders := new_reminders || e;
      END IF;
    END LOOP;

    IF sent_any THEN
      session_id := r.contact_numero || '@s.whatsapp.net';
      INSERT INTO public.mensagens_geral
        (instancia, numero, mensagem, type, "horaLastMessage", created_at, aplicativo)
      VALUES
        (r.instancia, session_id, msg, 'atendente',
         to_char(now() AT TIME ZONE (r.tz_offset)::interval, 'HH24:MI'), now(), 'whatsapp');

      payload := jsonb_build_object(
        'message', msg, 'session_id', session_id, 'phone', r.contact_numero,
        'instancia', r.instancia, 'api_instancia', r.api_instancia,
        'company', r.company_name,
        'sender_name', 'Sistema (Lembrete automático)', 'sender_email', 'sistema@clinisac');
      BEGIN
        PERFORM net.http_post(
          url := 'https://n8n.nexladesenvolvimento.com.br/webhook/envioNexla',
          body := payload, headers := '{"Content-Type": "application/json"}'::jsonb);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'webhook lembrete fail appt %: %', r.id, SQLERRM;
      END;

      UPDATE public.appointments SET reminders = new_reminders WHERE id = r.id;
      cnt := cnt + 1;
    END IF;
  END LOOP;

  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_appointment_reminders() TO service_role;

-- ==============================================================
-- IMPORTANTE (Alisson): confira se NÃO há dois agendadores rodando.
-- Rode isto pra ver os jobs do pg_cron:
--     SELECT jobid, schedule, jobname, command FROM cron.job;
-- Deve haver só UM chamando process_appointment_reminders (o
-- 'appointment-reminders'). Se você também criou um Schedule no n8n
-- batendo no /rpc/process_appointment_reminders, DESATIVE um dos dois.
-- Mesmo assim, a trava acima já impede o envio em dobro.
-- ==============================================================
