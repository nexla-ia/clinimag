-- Tabela dedicada para configuração do agente IA por instância
-- Mais fácil de consultar no n8n: SELECT * FROM agent_configs WHERE instancia = 'xxx'

create table if not exists agent_configs (
  id          uuid        default gen_random_uuid() primary key,
  instancia   text        not null unique,
  company_id  uuid        references companies(id) on delete cascade,
  config      jsonb       not null default '{}',
  updated_at  timestamptz default now()
);

-- Atualiza updated_at automaticamente
create or replace function update_agent_configs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agent_configs_updated_at on agent_configs;
create trigger trg_agent_configs_updated_at
  before update on agent_configs
  for each row execute function update_agent_configs_updated_at();

-- RLS
alter table agent_configs enable row level security;

-- Empresa só lê/escreve a própria config
create policy "company lê própria config"
  on agent_configs for select
  using (
    instancia = (
      select instance from companies
      where id = (select company_id from users where id = auth.uid() limit 1)
    )
  );

create policy "company escreve própria config"
  on agent_configs for all
  using (
    instancia = (
      select instance from companies
      where id = (select company_id from users where id = auth.uid() limit 1)
    )
  );
