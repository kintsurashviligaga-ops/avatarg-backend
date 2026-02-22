create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  chat_id text not null,
  message_id text not null,
  from text not null,
  text text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_chat_id_created_at_idx
  on public.chat_messages (chat_id, created_at desc);

create index if not exists chat_messages_platform_created_at_idx
  on public.chat_messages (platform, created_at desc);
