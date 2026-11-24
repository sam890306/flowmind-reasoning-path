// Postgres schema. Applied idempotently on cold start (see db.js) and by `npm run db:migrate`.
// Bump SCHEMA_VERSION whenever a statement is added so running instances re-apply.
export const SCHEMA_VERSION = 1

export const SCHEMA = `
create table if not exists lab (
  id            int primary key default 1 check (id = 1),
  name          text not null default 'AutoResearch Lab',
  slots         int  not null default 9,
  cores_per_slot int not null default 8,
  cpu_base      int  not null default 8,
  version       bigint not null default 0,
  refusals      int  not null default 0,
  agent_seen_at timestamptz,
  schema_version int not null default 0
);
insert into lab (id) values (1) on conflict do nothing;

create table if not exists users (
  id          text primary key,
  google_sub  text unique,
  email       text not null unique,
  name        text not null,
  picture     text,
  handle      text not null unique,
  role        text not null default 'pending' check (role in ('pending','viewer','member','operator')),
  status      text not null default 'active' check (status in ('active','denied','disabled')),
  asked       text not null default 'member',
  quota_usd   double precision not null default 0,
  max_active  int not null default 0,
  node        text not null default '',
  created_at  timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists tokens (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  name        text not null,
  scope       text not null check (scope in ('user','agent')),
  hash        text not null unique,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

create table if not exists campaigns (
  id          text primary key,
  owner_id    text not null references users(id),
  name        text not null,
  repo        text not null default '',
  sha         text not null default '',
  goal        text not null default '',
  metric      jsonb not null default '{"label":"score","unit":"×","baseline":1,"dir":"up","digits":2}',
  node        text not null default '',
  job         text not null default '',
  gpus        int  not null default 0,
  cap_usd     double precision not null default 0,
  clock_h     double precision not null default 0,
  slot        int,
  par         int not null default 3,
  phase       text not null default 'create' check (phase in ('create','provision','setup','research','finalize','verify','delivered')),
  phase_progress double precision not null default 0,
  status      text not null default 'running' check (status in ('running','failed','cancelled')),
  paused      boolean not null default false,
  activity    text not null default '',
  stop_why    text,
  eval_sha    text,
  elapsed_s   double precision not null default 0,
  best        double precision not null default 0,
  best_reported boolean not null default false,
  screen_total double precision not null default 0,
  verified    double precision,
  spend       jsonb not null default '{"agent2":0,"planner":0,"implementer":0,"reviewer":0}',
  series      jsonb not null default '[]',
  patch       text,
  report      text,
  event_seq   int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists campaigns_owner on campaigns(owner_id);

create table if not exists hypotheses (
  campaign_id text not null references campaigns(id) on delete cascade,
  hid         text not null,
  n           int  not null,
  stage       text not null default 'idea' check (stage in ('idea','plan','implement','screen','promote','kept','discarded')),
  doc         jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (campaign_id, hid)
);

create table if not exists events (
  campaign_id text not null references campaigns(id) on delete cascade,
  seq         int  not null,
  key         text,
  t           double precision not null default 0,
  src         text not null,
  kind        text,
  text        text not null,
  hyp         text,
  at          timestamptz not null default now(),
  primary key (campaign_id, seq)
);
create unique index if not exists events_key on events(campaign_id, key) where key is not null;

create table if not exists hyp_logs (
  campaign_id text not null references campaigns(id) on delete cascade,
  hid         text not null,
  seq         int  not null,
  stage       text,
  text        text not null,
  level       text,
  at          timestamptz not null default now(),
  primary key (campaign_id, hid, seq)
);

create table if not exists questions (
  campaign_id text not null references campaigns(id) on delete cascade,
  qid         text not null,
  t           double precision not null default 0,
  text        text not null,
  options     jsonb not null default '[]',
  answer      text,
  answered_by text references users(id),
  answered_at timestamptz,
  at          timestamptz not null default now(),
  primary key (campaign_id, qid)
);

create table if not exists usage (
  campaign_id text not null references campaigns(id) on delete cascade,
  call_id     text not null,
  owner_id    text not null references users(id),
  role        text not null,
  hyp         text,
  tokens      int  not null default 0,
  usd         double precision not null default 0,
  status      int  not null default 200,
  at          timestamptz not null default now(),
  primary key (campaign_id, call_id)
);
create index if not exists usage_at on usage(at desc);
create index if not exists usage_owner_at on usage(owner_id, at);

create table if not exists commands (
  id          bigserial primary key,
  campaign_id text not null references campaigns(id) on delete cascade,
  type        text not null check (type in ('create','pause','resume','finalize','steer','answer','raise_cap')),
  payload     jsonb not null default '{}',
  issued_by   text references users(id),
  status      text not null default 'pending' check (status in ('pending','done','rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  acked_at    timestamptz
);
create index if not exists commands_pending on commands(id) where status = 'pending';

create table if not exists audit (
  id          bigserial primary key,
  who         text not null,
  text        text not null,
  campaign_id text,
  at          timestamptz not null default now()
);
`
