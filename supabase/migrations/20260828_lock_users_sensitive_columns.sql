-- ==============================================================
-- SEGURANÇA — fechar colunas sensíveis de public.users pra anon
--
-- Problema (CRÍTICO): a policy de SELECT era aberta (USING true) e o role
-- anon tinha SELECT na tabela inteira → qualquer um com a anon key (que é
-- pública, vai no bundle JS) lia `password_hash` e `session_token` de TODOS
-- os usuários de TODAS as clínicas via /rest/v1/users?select=password_hash.
-- Também dava pra sobrescrever `password_hash` via UPDATE direto.
--
-- Correção: RLS continua por linha, mas o acesso a COLUNA passa a ser por
-- GRANT. Libera só as colunas não-sensíveis pra leitura, e o UPDATE de tudo
-- MENOS password_hash. As funções login_user / create_user /
-- update_user_password são SECURITY DEFINER (rodam como owner) → seguem
-- funcionando normalmente, inclusive validando/gravando a senha.
--
-- ⚠️ ORDEM: rode isto DEPOIS que o deploy do frontend (que parou de usar
-- users(*) / select('*') em users) estiver no ar. Seguro rodar mais de uma
-- vez. Cole no SQL Editor do Supabase (produção sbzwtnxx).
-- ==============================================================

-- Leitura: só colunas não-sensíveis (fora password_hash, session_token,
-- session_seen_at).
REVOKE SELECT ON public.users FROM anon, authenticated;
GRANT  SELECT (id, name, email, role, active, company_id, created_at)
  ON public.users TO anon, authenticated;

-- Escrita: tudo que o app edita direto (nome/e-mail/perfil/ativo e o token de
-- sessão do login em 1 dispositivo) — MENOS password_hash (a troca de senha é
-- feita só pela RPC update_user_password, que é SECURITY DEFINER).
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT  UPDATE (name, email, role, active, session_token, session_seen_at)
  ON public.users TO anon, authenticated;

-- Criação/remoção de usuário é só via RPC create_user (SECURITY DEFINER); o
-- cliente nunca faz INSERT/DELETE direto. Fecha os dois pra evitar que a anon
-- key crie um admin novo (ou apague usuários) em qualquer empresa.
REVOKE INSERT, DELETE ON public.users FROM anon, authenticated;
