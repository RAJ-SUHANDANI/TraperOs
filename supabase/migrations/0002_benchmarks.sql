-- Enables simultaneous BTC and equal-weight basket buy/hold anchors.
alter table benchmark_anchors drop constraint if exists benchmark_anchors_pkey;
alter table benchmark_anchors add column if not exists benchmark text not null default 'basket';
alter table benchmark_anchors add primary key(portfolio_id,benchmark,symbol);
create table if not exists benchmark_snapshots(
 id bigserial primary key,
 portfolio_id uuid not null references portfolios(id) on delete cascade,
 observed_minute timestamptz not null,
 btc_equity numeric(24,8) not null,
 basket_equity numeric(24,8) not null,
 unique(portfolio_id,observed_minute)
);
alter table benchmark_snapshots enable row level security;
