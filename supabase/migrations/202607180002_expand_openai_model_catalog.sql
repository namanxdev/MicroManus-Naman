-- Add lower-cost, tool-capable OpenAI models without rewriting previously
-- applied pricing history. Before GPT-5.6, cache population is billed at the
-- normal input rate because OpenAI publishes no separate write surcharge.
insert into public.model_pricing
  (provider, model, display_name, input_per_million_usd, output_per_million_usd,
   cache_read_per_million_usd, cache_write_per_million_usd, pricing_version,
   effective_from, effective_to, active)
values
  ('openai', 'gpt-5.4-mini', 'GPT-5.4 mini', 0.75, 4.50, 0.075, 0.75, '2026-07-18.1', '2026-03-17', null, true),
  ('openai', 'gpt-5.4-nano', 'GPT-5.4 nano', 0.20, 1.25, 0.02, 0.20, '2026-07-18.1', '2026-03-17', null, true),
  ('openai', 'gpt-5-mini', 'GPT-5 mini', 0.25, 2.00, 0.025, 0.25, '2026-07-18.1', '2025-08-07', null, true),
  ('openai', 'gpt-5-nano', 'GPT-5 nano', 0.05, 0.40, 0.005, 0.05, '2026-07-18.1', '2025-08-07', null, true)
on conflict (provider, model, effective_from) do update set
  display_name = excluded.display_name,
  input_per_million_usd = excluded.input_per_million_usd,
  output_per_million_usd = excluded.output_per_million_usd,
  cache_read_per_million_usd = excluded.cache_read_per_million_usd,
  cache_write_per_million_usd = excluded.cache_write_per_million_usd,
  pricing_version = excluded.pricing_version,
  effective_to = excluded.effective_to,
  active = excluded.active,
  updated_at = now();
