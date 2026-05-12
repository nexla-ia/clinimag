alter table conversations
  add constraint if not exists conversations_session_instancia_unique
  unique (session_id, instancia);
