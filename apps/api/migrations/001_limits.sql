-- Shared limits (SPEC §8.2). Every Vercel instance reads and writes the same rows,
-- so rate limits, budget and concurrency hold across instances.
-- Money is integer micro-dollars (µUSD), matching the LimitStore interface.

-- Sliding-window rate limits: one row per hit. Old rows are deleted on each hit for that key.
CREATE TABLE IF NOT EXISTS rate_hits (
  key text   NOT NULL,
  at  bigint NOT NULL -- epoch ms
);
CREATE INDEX IF NOT EXISTS rate_hits_key_at_idx ON rate_hits (key, at);

CREATE TABLE IF NOT EXISTS usage_day (
  day       text   PRIMARY KEY, -- Pacific date, YYYY-MM-DD
  calls     int    NOT NULL DEFAULT 0,
  micro_usd bigint NOT NULL DEFAULT 0 -- settled cost + in-flight reservations
);

CREATE TABLE IF NOT EXISTS usage_month (
  month     text   PRIMARY KEY, -- YYYY-MM
  micro_usd bigint NOT NULL DEFAULT 0
);

-- In-flight worst-case holds, replaced by the real cost on settle.
CREATE TABLE IF NOT EXISTS reservations (
  id         text        PRIMARY KEY,
  micro_usd  bigint      NOT NULL,
  day        text        NOT NULL,
  month      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Concurrency slots. Expired leases are ignored and cleaned up on the next acquire.
CREATE TABLE IF NOT EXISTS leases (
  id         text   PRIMARY KEY,
  expires_at bigint NOT NULL -- epoch ms
);
