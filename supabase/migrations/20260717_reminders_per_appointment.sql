-- ==============================================================
-- Lembretes por agendamento (múltiplos avisos) + padrões salvos
--
-- Antes o lembrete era 1 config global da empresa (Administração). Agora
-- cada agendamento carrega SUA lista de avisos, escolhida na hora de marcar
-- na Agenda. Ex: [{"offset_minutes":10080},{"offset_minutes":1440}] = avisa
-- 7 dias antes E 1 dia antes.
--
-- Cada aviso é disparado no seu horário (starts_at - offset) e marcado com
-- sent_at para não repetir. A confirmação "agendamento marcado" continua
-- saindo na hora (isso é no front, não aqui).
--
-- Padrões: a clínica salva combos de aviso (reminder_presets) pra reusar; um
-- pode ser o padrão (is_default) que já vem marcado no modal.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase (projeto NOVO, sbzwtnxx).
-- ==============================================================

SET search_path TO public;

-- Lista de avisos do agendamento: [{"offset_minutes":1440,"sent_at":null}, ...]
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminders jsonb DEFAULT '[]'::jsonb;

-- Padrões de aviso por empresa
CREATE TABLE IF NOT EXISTS public.reminder_presets (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  instancia  text        NOT NULL,
  name       text        NOT NULL,
  offsets    jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- [1440, 120]
  is_default boolean     DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.reminder_presets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "reminder_presets_all" ON public.reminder_presets
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS reminder_presets_instancia_idx ON public.reminder_presets (instancia);

-- Motor: dispara cada aviso pendente no seu horário.
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
