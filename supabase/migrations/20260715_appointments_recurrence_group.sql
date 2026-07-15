-- ==============================================================
-- Agenda — vínculo entre agendamentos criados pela MESMA recorrência
--
-- Hoje "Pilates 3x/semana por 3 meses" cria ~39 agendamentos soltos, sem
-- nenhuma ligação entre eles. Com isso não dá pra excluir a série inteira:
-- a recepção teria que apagar um por um.
--
-- Esta coluna marca todos os agendamentos gerados por uma mesma ação de
-- recorrência com o mesmo id (inclusive o agendamento base). Assim a tela
-- pode oferecer "excluir só este" ou "excluir todos da série".
--
-- NULL = agendamento avulso (o comportamento continua o de sempre).
-- Agendamentos criados ANTES desta migration ficam NULL — para eles a tela
-- segue excluindo só o agendamento clicado.
--
-- Seguro rodar mais de uma vez.
-- Para usar: cole no SQL Editor do Supabase do projeto.
-- ==============================================================

SET search_path TO public;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

-- Excluir a série filtra por este campo — índice evita varredura da tabela.
CREATE INDEX IF NOT EXISTS appointments_recurrence_group_idx
  ON public.appointments (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.recurrence_group_id IS
  'Agrupa os agendamentos criados pela mesma ação de recorrência. NULL = avulso.';
