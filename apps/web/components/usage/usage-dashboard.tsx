"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getJson } from "../../lib/client/api";
import { MOCK_USAGE } from "../../lib/client/mock-data";
import type { UsageChat, UsageResponse } from "../../lib/client/types";
import { AppShell } from "../app-shell";
import {
  ArrowUpRightIcon,
  ChartIcon,
  ClockIcon,
  CreditIcon,
  DatabaseIcon,
  DownloadIcon,
  SparkIcon,
} from "../ui/icons";

type Range = "7d" | "30d" | "all";

const demoEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";
const EMPTY_USAGE: UsageResponse = {
  summary: { creditsRemaining: 0, totalCost: 0, totalTokens: 0, researchRuns: 0 },
  chats: [],
  daily: [],
};

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return value.toLocaleString();
}

function niceCeil(value: number) {
  if (value <= 0) return 0.01;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatAxis(value: number) {
  if (value <= 0) return "$0";
  const decimals = value >= 1 ? 2 : value >= 0.1 ? 2 : value >= 0.01 ? 3 : 4;
  return `$${value.toFixed(decimals)}`;
}

function CostChart({ data }: { data: NonNullable<UsageResponse["daily"]> }) {
  const { points, top } = useMemo(() => {
    const rawMax = Math.max(...data.map((item) => item.cost), 0);
    const ceiling = niceCeil(rawMax);
    const coordinates = data
      .map((item, index) => {
        const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
        const y = 48 - (item.cost / ceiling) * 39;
        return `${x},${y}`;
      })
      .join(" ");
    return { points: coordinates, top: ceiling };
  }, [data]);

  if (!data.length) {
    return <p className="cost-chart cost-chart--empty">No spend recorded in this period yet.</p>;
  }

  return (
    <div className="cost-chart">
      <div className="cost-chart__axis">
        <span>{formatAxis(top)}</span>
        <span>{formatAxis(top / 2)}</span>
        <span>$0</span>
      </div>
      <svg aria-label="Daily spend chart" preserveAspectRatio="none" role="img" viewBox="0 0 100 52">
        <defs>
          <linearGradient id="costArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity=".36" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 48H100M0 28H100M0 9H100" className="chart-grid" />
        <polygon fill="url(#costArea)" points={`0,48 ${points} 100,48`} />
        <polyline className="chart-line" points={points} />
        {data.map((item, index) => {
          const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
          const y = 48 - (item.cost / top) * 39;
          return <circle className="chart-point" cx={x} cy={y} key={item.label} r="1.1" />;
        })}
      </svg>
      <div className="cost-chart__labels">{data.map((item) => <span key={item.label}>{item.label}</span>)}</div>
    </div>
  );
}

function CostStack({ chat }: { chat: UsageChat }) {
  const total = Math.max(chat.totalCost, 0.000001);
  const input = (chat.inputCost / total) * 100;
  const output = (chat.outputCost / total) * 100;
  const cache = (chat.cacheCost / total) * 100;
  return (
    <span className="cost-stack" aria-label="Cost distribution">
      <i className="cost-stack__input" style={{ width: `${input}%` }} />
      <i className="cost-stack__output" style={{ width: `${output}%` }} />
      <i className="cost-stack__cache" style={{ width: `${cache}%` }} />
    </span>
  );
}

export function UsageDashboard() {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadError("");
    getJson<UsageResponse>(`/api/usage?range=${range}`)
      .then((response) => {
        if (!mounted) return;
        setData(response);
        setDemo(false);
      })
      .catch(() => {
        if (!mounted) return;
        setData(demoEnabled ? MOCK_USAGE : EMPTY_USAGE);
        setDemo(demoEnabled);
        if (!demoEnabled) setLoadError("Usage data could not be loaded. Please try again.");
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [range]);

  const summary = data?.summary || EMPTY_USAGE.summary;
  const chats = data?.chats || [];
  const tokenTotals = useMemo(
    () => chats.reduce(
      (total, chat) => ({
        input: total.input + chat.inputTokens,
        output: total.output + chat.outputTokens,
        cache: total.cache + chat.cacheTokens,
      }),
      { input: 0, output: 0, cache: 0 },
    ),
    [chats],
  );
  const trackedTotal = Math.max(tokenTotals.input + tokenTotals.output + tokenTotals.cache, 1);

  function exportCsv() {
    if (!chats.length) return;
    window.location.assign(`/api/usage/export?range=${encodeURIComponent(range)}`);
  }

  return (
    <AppShell credits={summary.creditsRemaining}>
      <div className="usage-page app-page">
        <header className="page-heading usage-heading">
          <div>
            <span className="section-code">WORKSPACE / LEDGER</span>
            <h1>Usage & cost</h1>
            <p>Every research run, separated into input, output, and cache economics.</p>
          </div>
          <div className="usage-actions">
            {demo && <span className="demo-label">PREVIEW DATA</span>}
            <div className="range-switch" role="group" aria-label="Usage range">
              {(["7d", "30d", "all"] as Range[]).map((item) => (
                <button className={range === item ? "is-active" : ""} key={item} onClick={() => setRange(item)} type="button">
                  {item === "all" ? "All" : item.toUpperCase()}
                </button>
              ))}
            </div>
            <button className="secondary-button" disabled={!chats.length} onClick={exportCsv} type="button">
              <DownloadIcon size={16} /> Export
            </button>
          </div>
        </header>

        {loadError && <div className="chat-alert" role="alert"><span /><p>{loadError}</p></div>}

        {loading ? (
          <div className="usage-loading" aria-label="Loading usage data"><span /><span /><span /><span /></div>
        ) : (
          <>
            <section className="metric-strip">
              <article>
                <span className="metric-icon"><CreditIcon size={18} /></span>
                <small>Credit remaining</small>
                <strong><sup>$</sup>{summary.creditsRemaining.toFixed(2)}</strong>
                <div className="metric-progress"><span style={{ width: `${Math.min(100, (summary.creditsRemaining / 5) * 100)}%` }} /></div>
              </article>
              <article>
                <span className="metric-icon"><ChartIcon size={18} /></span>
                <small>Model spend</small>
                <strong><sup>$</sup>{summary.totalCost.toFixed(4)}</strong>
                <p>Across selected period</p>
              </article>
              <article>
                <span className="metric-icon"><DatabaseIcon size={18} /></span>
                <small>Tokens processed</small>
                <strong>{formatTokens(summary.totalTokens)}</strong>
                <p>{formatTokens(tokenTotals.cache)} from cache</p>
              </article>
              <article>
                <span className="metric-icon"><SparkIcon size={18} /></span>
                <small>Research runs</small>
                <strong>{summary.researchRuns}</strong>
                <p>${(summary.totalCost / Math.max(summary.researchRuns, 1)).toFixed(3)} average</p>
              </article>
            </section>

            <section className="usage-overview-grid">
              <article className="spend-panel">
                <div className="panel-heading">
                  <div><span className="section-code">DAILY MODEL SPEND</span><h2>${summary.totalCost.toFixed(4)}</h2></div>
                  <span className="trend-label">Usage based</span>
                </div>
                <CostChart data={data?.daily || []} />
              </article>

              <article className="composition-panel">
                <div className="panel-heading"><div><span className="section-code">TOKEN COMPOSITION</span><h2>{formatTokens(trackedTotal)}</h2></div></div>
                <div className="composition-bar" aria-label="Token composition">
                  <span className="composition-bar__input" style={{ width: `${(tokenTotals.input / trackedTotal) * 100}%` }} />
                  <span className="composition-bar__output" style={{ width: `${(tokenTotals.output / trackedTotal) * 100}%` }} />
                  <span className="composition-bar__cache" style={{ width: `${(tokenTotals.cache / trackedTotal) * 100}%` }} />
                </div>
                <div className="composition-list">
                  <div><i className="legend-input" /><span><strong>Input</strong><small>Prompts + sources</small></span><b>{formatTokens(tokenTotals.input)}</b></div>
                  <div><i className="legend-output" /><span><strong>Output</strong><small>Reasoning + answers</small></span><b>{formatTokens(tokenTotals.output)}</b></div>
                  <div><i className="legend-cache" /><span><strong>Cache</strong><small>Reused context</small></span><b>{formatTokens(tokenTotals.cache)}</b></div>
                </div>
                {(summary.cachedSavings || 0) > 0 && (
                  <div className="cache-saving"><DatabaseIcon size={15} /><span><strong>${(summary.cachedSavings || 0).toFixed(3)} estimated savings</strong><small>from cached input pricing</small></span></div>
                )}
              </article>
            </section>

            <section className="run-ledger">
              <div className="run-ledger__heading">
                <div><span className="section-code">CHAT-BY-CHAT</span><h2>Research ledger</h2></div>
                <div className="cost-legend"><span><i className="legend-input" />Input</span><span><i className="legend-output" />Output</span><span><i className="legend-cache" />Cache</span></div>
              </div>
              {chats.length ? (
                <div className="usage-table-wrap">
                  <table className="usage-table">
                    <thead><tr><th>Research thread</th><th>Model / time</th><th>Tokens</th><th>Cost distribution</th><th>Total</th><th><span className="sr-only">Open</span></th></tr></thead>
                    <tbody>
                      {chats.map((chat) => (
                        <tr key={chat.id}>
                          <td data-label="Thread"><Link href={`/chat/${chat.id}`}><strong>{chat.title}</strong><small>{chat.date}</small></Link></td>
                          <td data-label="Model"><span className="model-cell"><b>{chat.model}</b><small><ClockIcon size={12} />{chat.duration}</small></span></td>
                          <td data-label="Tokens"><span className="token-cell"><b>{formatTokens(chat.inputTokens + chat.outputTokens + chat.cacheTokens)}</b><small>{formatTokens(chat.cacheTokens)} cache</small></span></td>
                          <td data-label="Cost">
                            <div className="cost-cell"><CostStack chat={chat} /><small><span>${chat.inputCost.toFixed(3)}</span><span>${chat.outputCost.toFixed(3)}</span><span>${chat.cacheCost.toFixed(3)}</span></small></div>
                          </td>
                          <td data-label="Total"><strong className="total-cost">${chat.totalCost.toFixed(4)}</strong></td>
                          <td><Link aria-label={`Open ${chat.title}`} className="table-open" href={`/chat/${chat.id}`}><ArrowUpRightIcon size={16} /></Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="usage-empty">
                  <ChartIcon size={24} />
                  <h3>No model usage yet</h3>
                  <p>Start an investigation and its token ledger will appear here.</p>
                  <Link className="primary-button" href="/chat">Start research <ArrowUpRightIcon size={16} /></Link>
                </div>
              )}
            </section>

            <footer className="usage-footnote">
              <p>Costs use the price table attached to the selected model at call time. Provider invoices remain the source of truth.</p>
              <Link href="/settings">Review model configuration <ArrowUpRightIcon size={14} /></Link>
            </footer>
          </>
        )}
      </div>
    </AppShell>
  );
}
