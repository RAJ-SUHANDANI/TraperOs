-- TraperOS: apply once in Supabase SQL Editor. PAPER TRADING ONLY.
create extension if not exists pgcrypto;

create table if not exists portfolios(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('ai','rules','challenge')),
 initial_cash numeric(24,8) not null default 10000 check(initial_cash>0),
 cash numeric(24,8) not null default 10000 check(cash>=0),
 is_paused boolean not null default false,
 pause_reason text,
 day_key text,
 day_start_equity numeric(24,8) not null default 10000,
 challenge_ends_at timestamptz,
 created_at timestamptz not null default now()
);
create unique index if not exists one_base_portfolio_per_user on portfolios(user_id,kind) where kind in ('ai','rules');
create table if not exists positions(
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid not null references portfolios(id) on delete cascade,
 symbol text not null,
 quantity numeric(28,10) not null check(quantity>0),
 entry_price numeric(24,10) not null check(entry_price>0),
 stop_price numeric(24,10) not null check(stop_price>0),
 target_price numeric(24,10) not null check(target_price>entry_price),
 entry_fee numeric(24,10) not null check(entry_fee>=0),
 opened_at timestamptz not null default now(),
 last_observed_at timestamptz,
 signal_key text not null,
 unique(portfolio_id,symbol),
 unique(portfolio_id,signal_key)
);
create table if not exists fills(
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid not null references portfolios(id) on delete cascade,
 position_id uuid,
 symbol text not null,
 side text not null check(side in ('BUY','SELL')),
 quantity numeric(28,10) not null,
 price numeric(24,10) not null,
 fee numeric(24,10) not null,
 pnl numeric(24,10),
 reason text not null,
 source text not null,
 event_key text not null unique,
 executed_at timestamptz not null default now()
);
create table if not exists signals(
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid not null references portfolios(id) on delete cascade,
 candidate_id text not null,
 symbol text not null,
 candle_closed_at timestamptz not null,
 features jsonb not null,
 action text,
 result text not null default 'pending',
 reason text,
 created_at timestamptz not null default now(),
 unique(portfolio_id,candidate_id)
);
create table if not exists ai_decisions(
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid not null references portfolios(id) on delete cascade,
 candidate_id text not null,
 symbol text not null,
 model text not null,
 request_payload jsonb not null,
 response_payload jsonb,
 status text not null default 'attempted',
 error text,
 created_at timestamptz not null default now()
);
create index if not exists ai_decisions_daily on ai_decisions(created_at);
create table if not exists risk_evaluations(
 id bigserial primary key, portfolio_id uuid not null references portfolios(id) on delete cascade,
 candidate_id text not null, accepted boolean not null, reason text not null,
 sizing jsonb, created_at timestamptz not null default now()
);
create table if not exists equity_snapshots(
 id bigserial primary key, portfolio_id uuid not null references portfolios(id) on delete cascade,
 observed_minute timestamptz not null,
 equity numeric(24,8) not null, cash numeric(24,8) not null,
 exposure numeric(24,8) not null,
 unique(portfolio_id,observed_minute)
);
create table if not exists benchmark_anchors(
 portfolio_id uuid not null references portfolios(id) on delete cascade,
 symbol text not null, quantity numeric(28,10) not null,
 primary key(portfolio_id,symbol)
);
create table if not exists system_events(
 id bigserial primary key, portfolio_id uuid references portfolios(id) on delete cascade,
 severity text not null, code text not null, message text not null,
 details jsonb, created_at timestamptz not null default now()
);
create table if not exists scheduler_runs(
 id uuid primary key default gen_random_uuid(),
 started_at timestamptz not null default now(), finished_at timestamptz,
 status text not null default 'running', message text, duration_ms integer
);
create table if not exists app_leases(key text primary key, owner text not null, expires_at timestamptz not null);

-- Browser clients have NO direct row access; verified owner reads use server routes.
alter table portfolios enable row level security;
alter table positions enable row level security;
alter table fills enable row level security;
alter table signals enable row level security;
alter table ai_decisions enable row level security;
alter table risk_evaluations enable row level security;
alter table equity_snapshots enable row level security;
alter table benchmark_anchors enable row level security;
alter table system_events enable row level security;
alter table scheduler_runs enable row level security;
alter table app_leases enable row level security;

create or replace function acquire_worker_lease(p_key text,p_owner text,p_seconds int)
returns boolean language plpgsql security definer set search_path=public as $$
declare acquired text;
begin
 if p_seconds < 15 or p_seconds > 300 then raise exception 'Invalid lease'; end if;
 insert into app_leases(key,owner,expires_at) values(p_key,p_owner,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set owner=excluded.owner,expires_at=excluded.expires_at
 where app_leases.expires_at<now()
 returning owner into acquired;
 return acquired=p_owner;
end $$;
create or replace function release_worker_lease(p_key text,p_owner text)
returns void language sql security definer set search_path=public as $$
 delete from app_leases where key=p_key and owner=p_owner
$$;

create or replace function paper_buy(
 p_portfolio uuid,p_symbol text,p_price numeric,p_quantity numeric,p_fee_rate numeric,
 p_stop numeric,p_target numeric,p_signal text,p_event text,p_source text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cash numeric;v_paused boolean;v_cost numeric;v_fee numeric;v_pos uuid;v_count int;
begin
 select cash,is_paused into v_cash,v_paused from portfolios where id=p_portfolio for update;
 if not found then raise exception 'Missing portfolio';end if;
 if exists(select 1 from fills where event_key=p_event) then return jsonb_build_object('status','duplicate');end if;
 if v_paused then raise exception 'Portfolio paused';end if;
 if p_price<=0 or p_quantity<=0 or p_fee_rate<0 or p_fee_rate>0.01 or p_stop<=0 or p_stop>=p_price or p_target<=p_price then raise exception 'Invalid order';end if;
 select count(*) into v_count from positions where portfolio_id=p_portfolio;
 if v_count>=3 then raise exception 'Position limit';end if;
 v_fee=p_price*p_quantity*p_fee_rate;v_cost=p_price*p_quantity+v_fee;
 if v_cost>v_cash then raise exception 'Insufficient cash';end if;
 if exists(select 1 from positions where portfolio_id=p_portfolio and symbol=p_symbol) then raise exception 'Duplicate position';end if;
 insert into positions(portfolio_id,symbol,quantity,entry_price,stop_price,target_price,entry_fee,signal_key,last_observed_at)
 values(p_portfolio,p_symbol,p_quantity,p_price,p_stop,p_target,v_fee,p_signal,now()) returning id into v_pos;
 update portfolios set cash=cash-v_cost where id=p_portfolio;
 insert into fills(portfolio_id,position_id,symbol,side,quantity,price,fee,reason,source,event_key)
 values(p_portfolio,v_pos,p_symbol,'BUY',p_quantity,p_price,v_fee,'signal_entry',p_source,p_event);
 return jsonb_build_object('status','filled','position_id',v_pos,'cash_delta',-v_cost);
end $$;

create or replace function paper_sell(
 p_position uuid,p_price numeric,p_fee_rate numeric,p_reason text,p_event text,p_source text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pos positions%rowtype;v_fee numeric;v_pnl numeric;
begin
 if exists(select 1 from fills where event_key=p_event) then return jsonb_build_object('status','duplicate');end if;
 select * into v_pos from positions where id=p_position for update;
 if not found then return jsonb_build_object('status','already_closed');end if;
 perform 1 from portfolios where id=v_pos.portfolio_id for update;
 if p_price<=0 or p_fee_rate<0 or p_fee_rate>0.01 then raise exception 'Invalid exit';end if;
 v_fee=v_pos.quantity*p_price*p_fee_rate;
 v_pnl=(p_price-v_pos.entry_price)*v_pos.quantity-v_fee-v_pos.entry_fee;
 update portfolios set cash=cash+v_pos.quantity*p_price-v_fee where id=v_pos.portfolio_id;
 insert into fills(portfolio_id,position_id,symbol,side,quantity,price,fee,pnl,reason,source,event_key)
 values(v_pos.portfolio_id,v_pos.id,v_pos.symbol,'SELL',v_pos.quantity,p_price,v_fee,v_pnl,p_reason,p_source,p_event);
 delete from positions where id=p_position;
 return jsonb_build_object('status','filled','pnl',v_pnl);
end $$;
revoke all on function acquire_worker_lease(text,text,int) from public,anon,authenticated;
revoke all on function release_worker_lease(text,text) from public,anon,authenticated;
revoke all on function paper_buy(uuid,text,numeric,numeric,numeric,numeric,numeric,text,text,text) from public,anon,authenticated;
revoke all on function paper_sell(uuid,numeric,numeric,text,text,text) from public,anon,authenticated;
grant execute on function acquire_worker_lease(text,text,int) to service_role;
grant execute on function release_worker_lease(text,text) to service_role;
grant execute on function paper_buy(uuid,text,numeric,numeric,numeric,numeric,numeric,text,text,text) to service_role;
grant execute on function paper_sell(uuid,numeric,numeric,text,text,text) to service_role;
