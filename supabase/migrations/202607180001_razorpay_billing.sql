-- Replace the browser-facing Stripe flow with Razorpay Standard Checkout.
-- This migration is additive so deployments that already applied the core
-- schema retain their historical Stripe rows and rollback path.

alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check
  check (source in ('coupon', 'stripe', 'razorpay', 'admin'));

alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments
  add constraint payments_provider_check
  check (provider in ('stripe', 'razorpay'));
alter table public.payments alter column provider set default 'stripe';
comment on column public.payments.amount_cents is
  'Amount in the provider currency minor unit (cents for USD, paise for INR).';

alter table public.credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger
  add constraint credit_ledger_reason_check
  check (reason in ('coupon', 'stripe_payment', 'razorpay_payment', 'usage', 'refund', 'admin'));

create unique index if not exists payments_provider_payment_id_unique
  on public.payments (provider, provider_payment_intent_id)
  where provider_payment_intent_id is not null;

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'razorpay'),
  provider_order_id text,
  receipt text not null,
  idempotency_key text not null,
  amount_subunits integer not null check (amount_subunits > 0),
  currency text not null check (currency = lower(currency) and length(currency) = 3),
  credits_granted numeric(12, 6) not null default 5 check (credits_granted = 5),
  status text not null default 'creating'
    check (status in ('creating', 'created', 'superseded', 'paid', 'failed')),
  provider_payment_id text,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id),
  unique (provider, receipt),
  unique (provider, provider_payment_id),
  unique (user_id, provider, idempotency_key)
);

create index payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);
create unique index payment_orders_one_open_per_user
  on public.payment_orders (user_id, provider)
  where status in ('creating', 'created');

create table public.payment_webhook_events (
  provider text not null check (provider = 'razorpay'),
  event_id text not null,
  event_type text not null,
  payload_sha256 text,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- Checkout verification and order.paid webhooks both call this function.
-- The locked local order is the authority for user, price, currency and grant.
create or replace function public.grant_razorpay_order_credits(
  p_event_id text,
  p_event_type text,
  p_order_id text,
  p_payment_id text,
  p_amount_subunits integer,
  p_currency text,
  p_payload_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.payment_orders%rowtype;
  v_event_id text;
  v_payment_row_id uuid;
  v_balance numeric(12, 6);
begin
  if p_event_id is null or length(p_event_id) < 4 or length(p_event_id) > 200 then
    raise exception using errcode = 'P0001', message = 'invalid_payment_event';
  end if;
  if p_order_id is null or p_payment_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_payment_reference';
  end if;

  select * into v_order
  from public.payment_orders
  where provider = 'razorpay' and provider_order_id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'unknown_payment_order';
  end if;
  if v_order.amount_subunits <> p_amount_subunits
     or v_order.currency <> lower(p_currency) then
    raise exception using errcode = 'P0001', message = 'invalid_payment_amount';
  end if;
  if v_order.status = 'paid'
     and v_order.provider_payment_id is distinct from p_payment_id then
    raise exception using errcode = 'P0001', message = 'payment_order_already_paid';
  end if;
  if v_order.status not in ('created', 'superseded', 'paid') then
    raise exception using errcode = 'P0001', message = 'payment_order_not_ready';
  end if;

  insert into public.payment_webhook_events (
    provider, event_id, event_type, payload_sha256
  ) values (
    'razorpay', p_event_id, p_event_type, p_payload_sha256
  )
  on conflict (provider, event_id) do nothing
  returning event_id into v_event_id;

  if v_event_id is null then
    select balance into v_balance from public.wallets where user_id = v_order.user_id;
    return jsonb_build_object(
      'granted', false, 'duplicate', true, 'credits', coalesce(v_balance, 0)
    );
  end if;
  if v_order.status = 'paid' then
    select balance into v_balance from public.wallets where user_id = v_order.user_id;
    return jsonb_build_object(
      'granted', false, 'duplicate', true, 'credits', coalesce(v_balance, 0)
    );
  end if;

  insert into public.wallets (user_id) values (v_order.user_id)
  on conflict (user_id) do nothing;

  insert into public.payments (
    user_id, provider, provider_checkout_session_id, provider_payment_intent_id,
    amount_cents, currency, credits_granted
  ) values (
    v_order.user_id, 'razorpay', p_order_id, p_payment_id,
    p_amount_subunits, lower(p_currency), v_order.credits_granted
  )
  on conflict do nothing
  returning id into v_payment_row_id;

  if v_payment_row_id is null then
    select balance into v_balance from public.wallets where user_id = v_order.user_id;
    return jsonb_build_object(
      'granted', false, 'duplicate', true, 'credits', coalesce(v_balance, 0)
    );
  end if;

  select balance into v_balance
  from public.wallets
  where user_id = v_order.user_id
  for update;
  v_balance := v_balance + v_order.credits_granted;

  update public.wallets
  set balance = v_balance,
      lifetime_granted = lifetime_granted + v_order.credits_granted,
      updated_at = now()
  where user_id = v_order.user_id;

  update public.payment_orders
  set status = 'paid',
      provider_payment_id = p_payment_id,
      credited_at = now(),
      updated_at = now()
  where id = v_order.id;

  insert into public.credit_ledger (
    user_id, delta, balance_after, reason, reference, metadata
  ) values (
    v_order.user_id, v_order.credits_granted, v_balance,
    'razorpay_payment', p_order_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'amount_subunits', p_amount_subunits,
      'currency', lower(p_currency)
    )
  );

  insert into public.entitlements (user_id, source, source_reference)
  values (v_order.user_id, 'razorpay', p_order_id)
  on conflict (user_id) do nothing;

  return jsonb_build_object(
    'granted', true, 'duplicate', false, 'credits', v_balance
  );
end;
$$;

alter table public.payment_orders enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy payment_orders_select_own
  on public.payment_orders for select
  using (auth.uid() = user_id);

grant select on public.payment_orders to authenticated;
grant select, insert, update on public.payment_orders to service_role;
grant select, insert on public.payment_webhook_events to service_role;
revoke all on public.payment_webhook_events from anon, authenticated;
revoke insert, update, delete on public.payment_orders from anon, authenticated;
revoke all on function public.grant_razorpay_order_credits(
  text, text, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.grant_razorpay_order_credits(
  text, text, text, text, integer, text, text
) to service_role;
