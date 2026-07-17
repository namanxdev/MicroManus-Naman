-- MicroManus core schema: identity, BYOK credentials, chats, billing, and usage.
-- Apply with `supabase db push` (or paste into the Supabase SQL editor once).

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(12, 6) not null default 0 check (balance >= 0),
  lifetime_granted numeric(12, 6) not null default 0 check (lifetime_granted >= 0),
  lifetime_spent numeric(12, 6) not null default 0 check (lifetime_spent >= 0),
  updated_at timestamptz not null default now()
);

create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source in ('coupon', 'stripe', 'admin')),
  source_reference text not null,
  unlocked_at timestamptz not null default now()
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coupon_code text not null,
  credits_granted numeric(12, 6) not null check (credits_granted > 0),
  redeemed_at timestamptz not null default now(),
  unique (user_id, coupon_code)
);

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_checkout_session_id text not null unique,
  provider_payment_intent_id text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = lower(currency)),
  credits_granted numeric(12, 6) not null check (credits_granted > 0),
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta numeric(12, 6) not null,
  balance_after numeric(12, 6) not null check (balance_after >= 0),
  reason text not null check (reason in ('coupon', 'stripe_payment', 'usage', 'refund', 'admin')),
  reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, reason, reference)
);

create table public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'kimi')),
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1 check (key_version > 0),
  key_hint text not null,
  base_url text,
  preferred_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New research',
  provider text not null default 'openai' check (provider in ('openai', 'anthropic', 'kimi')),
  model text not null,
  last_message_preview text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null default '',
  status text not null default 'complete' check (status in ('pending', 'streaming', 'complete', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  sequence bigint generated always as identity,
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.chat_threads(id, user_id) on delete cascade
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  message_id uuid references public.chat_messages(id) on delete set null,
  name text not null,
  kind text not null default 'pdf' check (kind in ('pdf', 'markdown', 'file')),
  storage_path text not null,
  content_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.chat_threads(id, user_id) on delete cascade
);

create table public.model_pricing (
  provider text not null check (provider in ('openai', 'anthropic', 'kimi')),
  model text not null,
  display_name text not null,
  input_per_million_usd numeric(12, 6) not null check (input_per_million_usd >= 0),
  output_per_million_usd numeric(12, 6) not null check (output_per_million_usd >= 0),
  cache_read_per_million_usd numeric(12, 6) not null default 0 check (cache_read_per_million_usd >= 0),
  cache_write_per_million_usd numeric(12, 6) not null default 0 check (cache_write_per_million_usd >= 0),
  pricing_version text not null,
  effective_from date not null,
  effective_to date check (effective_to is null or effective_to >= effective_from),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, model, effective_from)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.chat_threads(id) on delete set null,
  message_id uuid references public.chat_messages(id) on delete set null,
  provider text not null check (provider in ('openai', 'anthropic', 'kimi')),
  model text not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  input_cost_usd numeric(12, 8) not null default 0 check (input_cost_usd >= 0),
  output_cost_usd numeric(12, 8) not null default 0 check (output_cost_usd >= 0),
  cache_cost_usd numeric(12, 8) not null default 0 check (cache_cost_usd >= 0),
  total_cost_usd numeric(12, 8) not null default 0 check (total_cost_usd >= 0),
  credits_debited numeric(12, 6) not null default 0 check (credits_debited >= 0),
  pricing_version text not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index chat_threads_user_updated_idx on public.chat_threads(user_id, updated_at desc);
create index chat_messages_thread_sequence_idx on public.chat_messages(thread_id, sequence);
create index usage_events_user_created_idx on public.usage_events(user_id, created_at desc);
create index usage_events_thread_created_idx on public.usage_events(thread_id, created_at desc);
create index credit_ledger_user_created_idx on public.credit_ledger(user_id, created_at desc);
create index artifacts_thread_created_idx on public.artifacts(thread_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger provider_credentials_set_updated_at before update on public.provider_credentials
for each row execute function public.set_updated_at();
create trigger model_pricing_set_updated_at before update on public.model_pricing
for each row execute function public.set_updated_at();

create or replace function public.touch_thread_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_threads
  set updated_at = now(),
      last_message_preview = case
        when new.role in ('user', 'assistant') and length(new.content) > 0 then left(new.content, 240)
        else last_message_preview
      end
  where id = new.thread_id;
  return new;
end;
$$;

create trigger chat_messages_touch_thread after insert or update on public.chat_messages
for each row execute function public.touch_thread_from_message();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name'
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);

  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

-- Backfill accounts that predate this migration.
insert into public.profiles (id, email, display_name, avatar_url)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', raw_user_meta_data ->> 'user_name'),
  coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture')
from auth.users
on conflict (id) do nothing;
insert into public.wallets (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Exact, single-use-per-user coupon grant. The insert, wallet lock, ledger write,
-- and entitlement unlock are one PostgreSQL transaction.
create or replace function public.redeem_micromanus_coupon(
  p_user_id uuid,
  p_coupon_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_id uuid;
  v_balance numeric(12, 6);
begin
  if p_coupon_code is distinct from 'SID_DRDROID' then
    raise exception using errcode = 'P0001', message = 'invalid_coupon';
  end if;

  insert into public.wallets (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.coupon_redemptions (user_id, coupon_code, credits_granted)
  values (p_user_id, p_coupon_code, 5)
  on conflict (user_id, coupon_code) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    select balance into v_balance from public.wallets where user_id = p_user_id;
    return jsonb_build_object('granted', false, 'already_redeemed', true, 'credits', v_balance);
  end if;

  select balance into v_balance from public.wallets where user_id = p_user_id for update;
  v_balance := v_balance + 5;

  update public.wallets
  set balance = v_balance,
      lifetime_granted = lifetime_granted + 5,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, balance_after, reason, reference)
  values (p_user_id, 5, v_balance, 'coupon', p_coupon_code);

  insert into public.entitlements (user_id, source, source_reference)
  values (p_user_id, 'coupon', p_coupon_code)
  on conflict (user_id) do nothing;

  return jsonb_build_object('granted', true, 'already_redeemed', false, 'credits', v_balance);
end;
$$;

-- Idempotent Stripe grant. A webhook event and Checkout Session can each be
-- processed at most once; both constraints are enforced before the wallet moves.
create or replace function public.grant_stripe_checkout_credits(
  p_user_id uuid,
  p_event_id text,
  p_event_type text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_customer_id text,
  p_amount_cents integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text;
  v_payment_id uuid;
  v_balance numeric(12, 6);
begin
  if p_amount_cents <> 500 or lower(p_currency) <> 'usd' then
    raise exception using errcode = 'P0001', message = 'invalid_checkout_amount';
  end if;

  insert into public.stripe_webhook_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing
  returning event_id into v_event_id;

  if v_event_id is null then
    select balance into v_balance from public.wallets where user_id = p_user_id;
    return jsonb_build_object('granted', false, 'duplicate', true, 'credits', coalesce(v_balance, 0));
  end if;

  insert into public.wallets (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.payments (
    user_id, provider_checkout_session_id, provider_payment_intent_id,
    amount_cents, currency, credits_granted
  ) values (
    p_user_id, p_checkout_session_id, p_payment_intent_id,
    p_amount_cents, lower(p_currency), 5
  )
  on conflict (provider_checkout_session_id) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select balance into v_balance from public.wallets where user_id = p_user_id;
    return jsonb_build_object('granted', false, 'duplicate', true, 'credits', coalesce(v_balance, 0));
  end if;

  select balance into v_balance from public.wallets where user_id = p_user_id for update;
  v_balance := v_balance + 5;

  update public.wallets
  set balance = v_balance,
      lifetime_granted = lifetime_granted + 5,
      updated_at = now()
  where user_id = p_user_id;

  update public.profiles
  set stripe_customer_id = coalesce(p_customer_id, stripe_customer_id), updated_at = now()
  where id = p_user_id;

  insert into public.credit_ledger (user_id, delta, balance_after, reason, reference, metadata)
  values (
    p_user_id, 5, v_balance, 'stripe_payment', p_checkout_session_id,
    jsonb_build_object('amount_cents', p_amount_cents, 'currency', lower(p_currency))
  );

  insert into public.entitlements (user_id, source, source_reference)
  values (p_user_id, 'stripe', p_checkout_session_id)
  on conflict (user_id) do nothing;

  return jsonb_build_object('granted', true, 'duplicate', false, 'credits', v_balance);
end;
$$;

-- Usage and its credit debit are inseparable. One credit represents one USD of
-- model usage; request_id makes upstream retries safe. If a completed run costs
-- more than the remaining balance, record its full provider cost, drain the
-- wallet to zero, and expose the uncovered amount in the return value. The next
-- run is blocked by the zero-balance preflight.
create or replace function public.record_usage_and_debit(
  p_user_id uuid,
  p_request_id text,
  p_thread_id uuid,
  p_message_id uuid,
  p_provider text,
  p_model text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cache_read_tokens bigint,
  p_cache_write_tokens bigint,
  p_input_cost_usd numeric,
  p_output_cost_usd numeric,
  p_cache_cost_usd numeric,
  p_total_cost_usd numeric,
  p_pricing_version text,
  p_latency_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
  v_existing_debit numeric(12, 6);
  v_balance numeric(12, 6);
  v_debit numeric(12, 6);
begin
  if p_provider not in ('openai', 'anthropic', 'kimi')
     or p_request_id is null or length(p_request_id) < 1
     or least(p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens) < 0
     or least(p_input_cost_usd, p_output_cost_usd, p_cache_cost_usd, p_total_cost_usd) < 0
     or abs(p_total_cost_usd - (p_input_cost_usd + p_output_cost_usd + p_cache_cost_usd)) > 0.000001 then
    raise exception using errcode = 'P0001', message = 'invalid_usage';
  end if;

  if not exists (select 1 from public.entitlements where user_id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'paywall_required';
  end if;
  if p_thread_id is not null and not exists (
    select 1 from public.chat_threads where id = p_thread_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_usage_thread';
  end if;
  if p_message_id is not null and not exists (
    select 1 from public.chat_messages where id = p_message_id and user_id = p_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_usage_message';
  end if;

  insert into public.wallets (user_id) values (p_user_id)
  on conflict (user_id) do nothing;
  select balance into v_balance from public.wallets where user_id = p_user_id for update;

  select id, credits_debited into v_usage_id, v_existing_debit
  from public.usage_events
  where user_id = p_user_id and request_id = p_request_id;

  if v_usage_id is not null then
    return jsonb_build_object(
      'recorded', false, 'duplicate', true, 'usage_id', v_usage_id,
      'credits_debited', v_existing_debit, 'credits', v_balance
    );
  end if;

  v_debit := least(v_balance, round(p_total_cost_usd, 6));

  insert into public.usage_events (
    request_id, user_id, thread_id, message_id, provider, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    input_cost_usd, output_cost_usd, cache_cost_usd, total_cost_usd,
    credits_debited, pricing_version, latency_ms
  ) values (
    p_request_id, p_user_id, p_thread_id, p_message_id, p_provider, p_model,
    p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_tokens,
    p_input_cost_usd, p_output_cost_usd, p_cache_cost_usd, p_total_cost_usd,
    v_debit, p_pricing_version, p_latency_ms
  ) returning id into v_usage_id;

  v_balance := v_balance - v_debit;
  update public.wallets
  set balance = v_balance,
      lifetime_spent = lifetime_spent + v_debit,
      updated_at = now()
  where user_id = p_user_id;

  if v_debit > 0 then
    insert into public.credit_ledger (user_id, delta, balance_after, reason, reference, metadata)
    values (
      p_user_id, -v_debit, v_balance, 'usage', p_request_id,
      jsonb_build_object('model', p_model, 'provider', p_provider, 'usage_id', v_usage_id)
    );
  end if;

  return jsonb_build_object(
    'recorded', true, 'duplicate', false, 'usage_id', v_usage_id,
    'credits_debited', v_debit,
    'credits', v_balance,
    'fully_covered', v_debit >= round(p_total_cost_usd, 6),
    'uncovered_cost_usd', greatest(round(p_total_cost_usd, 6) - v_debit, 0)
  );
end;
$$;

create or replace function public.get_usage_summary(
  p_user_id uuid,
  p_since timestamptz default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'input_tokens', coalesce(sum(u.input_tokens), 0),
      'output_tokens', coalesce(sum(u.output_tokens), 0),
      'cache_read_tokens', coalesce(sum(u.cache_read_tokens), 0),
      'cache_write_tokens', coalesce(sum(u.cache_write_tokens), 0),
      'input_cost_usd', coalesce(sum(u.input_cost_usd), 0),
      'output_cost_usd', coalesce(sum(u.output_cost_usd), 0),
      'cache_cost_usd', coalesce(sum(u.cache_cost_usd), 0),
      'total_cost_usd', coalesce(sum(u.total_cost_usd), 0),
      'research_runs', count(u.id)
    ),
    'by_model', (
      select coalesce(jsonb_agg(to_jsonb(m) order by m.total_cost_usd desc), '[]'::jsonb)
      from (
        select provider, model,
          sum(input_tokens) as input_tokens,
          sum(output_tokens) as output_tokens,
          sum(cache_read_tokens + cache_write_tokens) as cache_tokens,
          sum(total_cost_usd) as total_cost_usd,
          count(*) as runs
        from public.usage_events
        where user_id = p_user_id and (p_since is null or created_at >= p_since)
        group by provider, model
      ) m
    ),
    'by_chat', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.updated_at desc), '[]'::jsonb)
      from (
        select u.thread_id, coalesce(t.title, 'Deleted chat') as title, t.model,
          sum(u.input_tokens) as input_tokens,
          sum(u.output_tokens) as output_tokens,
          sum(u.cache_read_tokens + u.cache_write_tokens) as cache_tokens,
          sum(u.input_cost_usd) as input_cost_usd,
          sum(u.output_cost_usd) as output_cost_usd,
          sum(u.cache_cost_usd) as cache_cost_usd,
          sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens) as total_tokens,
          sum(u.total_cost_usd) as total_cost_usd,
          count(*) as runs,
          sum(coalesce(u.latency_ms, 0)) as duration_ms,
          max(u.created_at) as updated_at
        from public.usage_events u
        left join public.chat_threads t on t.id = u.thread_id
        where u.user_id = p_user_id and (p_since is null or u.created_at >= p_since)
        group by u.thread_id, t.title, t.model
        order by max(u.created_at) desc
        limit greatest(1, least(coalesce(p_limit, 100), 500))
      ) c
    ),
    'recent', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select id, request_id, thread_id, provider, model,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          input_cost_usd, output_cost_usd, cache_cost_usd, total_cost_usd,
          pricing_version, latency_ms, created_at
        from public.usage_events
        where user_id = p_user_id and (p_since is null or created_at >= p_since)
        order by created_at desc
        limit greatest(1, least(coalesce(p_limit, 100), 500))
      ) r
    ),
    'daily', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as day, sum(total_cost_usd) as cost
        from public.usage_events
        where user_id = p_user_id and (p_since is null or created_at >= p_since)
        group by date_trunc('day', created_at)::date
        order by date_trunc('day', created_at)::date
      ) d
    )
  ) into v_result
  from public.usage_events u
  where u.user_id = p_user_id and (p_since is null or u.created_at >= p_since);

  return v_result;
end;
$$;

-- Pricing is deliberately data-driven. Update these rows whenever a provider
-- changes public rates; every usage row stores the pricing_version used.
insert into public.model_pricing
  (provider, model, display_name, input_per_million_usd, output_per_million_usd,
   cache_read_per_million_usd, cache_write_per_million_usd, pricing_version,
   effective_from, effective_to)
values
  ('openai', 'gpt-5.6-sol', 'GPT-5.6 Sol', 5, 30, 0.50, 6.25, '2026-07-17.1', '2026-07-01', null),
  ('openai', 'gpt-5.6-terra', 'GPT-5.6 Terra', 2.50, 15, 0.25, 3.125, '2026-07-17.1', '2026-07-01', null),
  ('openai', 'gpt-5.6-luna', 'GPT-5.6 Luna', 1, 6, 0.10, 1.25, '2026-07-17.1', '2026-07-01', null),
  ('anthropic', 'claude-fable-5', 'Claude Fable 5', 10, 50, 1, 12.50, '2026-07-17.1', '2026-06-09', null),
  ('anthropic', 'claude-opus-4-8', 'Claude Opus 4.8', 5, 25, 0.50, 6.25, '2026-07-17.1', '2026-07-01', null),
  ('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 2, 10, 0.20, 2.50, '2026-07-17.1-promo', '2026-06-30', '2026-08-31'),
  ('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 3, 15, 0.30, 3.75, '2026-09-01.1', '2026-09-01', null),
  ('anthropic', 'claude-haiku-4-5', 'Claude Haiku 4.5', 1, 5, 0.10, 1.25, '2026-07-17.1', '2025-10-01', null),
  ('kimi', 'kimi-k3', 'Kimi K3', 3, 15, 0.30, 3, '2026-07-17.1', '2026-07-01', null),
  ('kimi', 'kimi-k2.7-code', 'Kimi K2.7 Code', 0.95, 4, 0.19, 0.95, '2026-07-17.1', '2026-07-01', null),
  ('kimi', 'kimi-k2.6', 'Kimi K2.6', 0.95, 4, 0.16, 0.95, '2026-07-17.1', '2026-01-27', null)
on conflict (provider, model, effective_from) do nothing;

-- RLS is defense in depth: browser clients can only see/modify their own rows.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.entitlements enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.payments enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.artifacts enable row level security;
alter table public.model_pricing enable row level security;
alter table public.usage_events enable row level security;

create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy wallets_select_own on public.wallets for select using (auth.uid() = user_id);
create policy entitlements_select_own on public.entitlements for select using (auth.uid() = user_id);
create policy coupon_redemptions_select_own on public.coupon_redemptions for select using (auth.uid() = user_id);
create policy payments_select_own on public.payments for select using (auth.uid() = user_id);
create policy credit_ledger_select_own on public.credit_ledger for select using (auth.uid() = user_id);
create policy provider_credentials_select_own on public.provider_credentials for select using (auth.uid() = user_id);
create policy model_pricing_read on public.model_pricing for select to authenticated using (active = true);
create policy usage_events_select_own on public.usage_events for select using (auth.uid() = user_id);

create policy chat_threads_select_own on public.chat_threads for select using (auth.uid() = user_id);
create policy chat_threads_insert_own on public.chat_threads for insert with check (auth.uid() = user_id);
create policy chat_threads_update_own on public.chat_threads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy chat_threads_delete_own on public.chat_threads for delete using (auth.uid() = user_id);
create policy chat_messages_select_own on public.chat_messages for select using (auth.uid() = user_id);
create policy chat_messages_insert_own on public.chat_messages for insert with check (auth.uid() = user_id);
create policy artifacts_select_own on public.artifacts for select using (auth.uid() = user_id);

grant select on public.profiles, public.wallets, public.entitlements,
  public.coupon_redemptions, public.payments, public.credit_ledger,
  public.chat_threads, public.chat_messages, public.artifacts,
  public.model_pricing, public.usage_events to authenticated;
grant insert, update, delete on public.chat_threads to authenticated;
grant insert on public.chat_messages to authenticated;

-- Sensitive writes and all money-moving functions stay server-only.
revoke all on public.stripe_webhook_events, public.provider_credentials from anon, authenticated;
grant select (id, user_id, provider, key_hint, base_url, preferred_model, created_at, updated_at)
  on public.provider_credentials to authenticated;
revoke all on function public.redeem_micromanus_coupon(uuid, text) from public, anon, authenticated;
revoke all on function public.grant_stripe_checkout_credits(uuid, text, text, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.record_usage_and_debit(uuid, text, uuid, uuid, text, text, bigint, bigint, bigint, bigint, numeric, numeric, numeric, numeric, text, integer) from public, anon, authenticated;
revoke all on function public.get_usage_summary(uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.redeem_micromanus_coupon(uuid, text) to service_role;
grant execute on function public.grant_stripe_checkout_credits(uuid, text, text, text, text, text, integer, text) to service_role;
grant execute on function public.record_usage_and_debit(uuid, text, uuid, uuid, text, text, bigint, bigint, bigint, bigint, numeric, numeric, numeric, numeric, text, integer) to service_role;
grant execute on function public.get_usage_summary(uuid, timestamptz, integer) to service_role;

-- Private report bucket. Objects must live under `<user-id>/...`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 26214400, array['application/pdf', 'text/markdown'])
on conflict (id) do update set public = false;

create policy reports_select_own on storage.objects for select to authenticated
using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy reports_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy reports_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
