"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { Brand } from "../ui/brand";
import {
  ArrowUpRightIcon,
  CheckIcon,
  FileIcon,
  GithubIcon,
  GlobeIcon,
  GoogleIcon,
  SearchIcon,
  SparkIcon,
} from "../ui/icons";

type SocialProvider = "google" | "github";

export function LandingPage() {
  const [loading, setLoading] = useState<SocialProvider | null>(null);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("auth_error");
    if (!code) return;
    const timer = window.setTimeout(() => {
      setAuthError(code === "configuration"
        ? "Authentication is not configured on this deployment yet."
        : "Social sign-in could not be completed. Please try again.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function signIn(provider: SocialProvider) {
    setLoading(provider);
    const query = new URLSearchParams({ provider, next: "/subscribe" });
    window.location.assign(`/api/auth/signin?${query.toString()}`);
  }

  return (
    <main className="landing-page">
      <div aria-hidden="true" className="paper-noise" />
      <nav className="landing-nav">
        <Brand />
        <div className="landing-nav__center">
          <a href="#method">Method</a>
          <a href="#artifact">Artifacts</a>
          <a href="#pricing">Pricing</a>
        </div>
        <Link className="text-button" href="/sign-in">
          Sign in
          <ArrowUpRightIcon size={16} />
        </Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <div className="eyebrow reveal" style={{ "--delay": "0ms" } as CSSProperties}>
            <span className="signal-dot" />
            Deep research, on your own keys
          </div>
          <h1 className="reveal" style={{ "--delay": "70ms" } as CSSProperties}>
            Give a question.
            <br />
            Get the <em>work</em> behind the answer.
          </h1>
          <p className="hero-lede reveal" style={{ "--delay": "140ms" } as CSSProperties}>
            MicroManus plans, searches, reads, checks, and writes in a visible loop—then hands you
            a sourced report you can actually use.
          </p>

          <div className="social-entry reveal" style={{ "--delay": "210ms" } as CSSProperties}>
            <p>Start with 5 research credits</p>
            {authError && <div className="form-error" role="alert">{authError}</div>}
            <div className="social-entry__buttons">
              <button
                className="social-button social-button--dark"
                disabled={loading !== null}
                onClick={() => signIn("google")}
                type="button"
              >
                <GoogleIcon size={18} />
                {loading === "google" ? "Connecting…" : "Continue with Google"}
              </button>
              <button
                aria-label="Continue with GitHub"
                className="social-button social-button--icon"
                disabled={loading !== null}
                onClick={() => signIn("github")}
                type="button"
              >
                <GithubIcon size={20} />
              </button>
            </div>
            <small>Social sign-in by default. Bring an OpenAI-compatible, Anthropic, or Kimi key after signup.</small>
          </div>

          <div className="hero-proof reveal" style={{ "--delay": "280ms" } as CSSProperties}>
            <span>
              <CheckIcon size={14} /> Source-linked
            </span>
            <span>
              <CheckIcon size={14} /> Cost-visible
            </span>
            <span>
              <CheckIcon size={14} /> PDF-ready
            </span>
          </div>
        </div>

        <div className="research-instrument reveal" style={{ "--delay": "120ms" } as CSSProperties}>
          <div className="instrument-tape">LIVE RESEARCH TRACE · 04</div>
          <div className="instrument-head">
            <span>Investigation / active</span>
            <span className="instrument-time">01:42</span>
          </div>
          <h2>Why are insurers retreating from high-risk regions?</h2>
          <div className="instrument-flow">
            <div className="flow-step flow-step--done">
              <span className="flow-index">01</span>
              <span className="flow-icon"><SparkIcon size={17} /></span>
              <span><strong>Plan evidence map</strong><small>6 questions branched</small></span>
              <CheckIcon size={16} />
            </div>
            <div className="flow-step flow-step--done">
              <span className="flow-index">02</span>
              <span className="flow-icon"><SearchIcon size={17} /></span>
              <span><strong>Search primary sources</strong><small>24 documents inspected</small></span>
              <CheckIcon size={16} />
            </div>
            <div className="flow-step flow-step--active">
              <span className="flow-index">03</span>
              <span className="flow-icon"><GlobeIcon size={17} /></span>
              <span><strong>Cross-check claims</strong><small>Reading regulator filings…</small></span>
              <span className="thinking-bars"><i /><i /><i /></span>
            </div>
            <div className="flow-step">
              <span className="flow-index">04</span>
              <span className="flow-icon"><FileIcon size={17} /></span>
              <span><strong>Build report</strong><small>Citations + PDF artifact</small></span>
              <span className="flow-waiting">WAIT</span>
            </div>
          </div>
          <div className="instrument-sources">
            <div><span>CA</span><strong>Insurance Dept.</strong><small>Primary</small></div>
            <div><span>FR</span><strong>Federal Register</strong><small>Primary</small></div>
            <div><span>RM</span><strong>Risk model study</strong><small>Peer reviewed</small></div>
          </div>
          <div className="instrument-footer">
            <span><i /> Agent is reading</span>
            <span>17.8k tokens · $0.084</span>
          </div>
        </div>
      </section>

      <section className="landing-marquee" aria-label="Research capabilities">
        <div>
          <span>SEARCH</span><i />
          <span>READ</span><i />
          <span>VERIFY</span><i />
          <span>SYNTHESIZE</span><i />
          <span>CITE</span><i />
          <span>EXPORT</span><i />
          <span>SEARCH</span><i />
          <span>READ</span><i />
        </div>
      </section>

      <section className="method-section" id="method">
        <div className="section-rail">
          <span>01 / METHOD</span>
          <span>A research loop you can inspect</span>
        </div>
        <div className="method-grid">
          <div className="method-intro">
            <p className="kicker">Not a one-shot chatbot</p>
            <h2>It keeps going until the evidence holds.</h2>
            <p>
              Every useful report starts as a set of smaller questions. MicroManus turns those
              questions into a traceable sequence of searches, tool calls, observations, and
              revisions.
            </p>
          </div>
          <div className="method-list">
            {[
              ["01", "Plan", "Break a broad request into claims, unknowns, and source priorities."],
              ["02", "Operate", "Search the live web and read relevant pages, papers, and filings."],
              ["03", "Challenge", "Compare sources, identify gaps, and run another loop where needed."],
              ["04", "Deliver", "Write a cited answer and package long-form work as a PDF artifact."],
            ].map(([number, title, body]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="artifact-section" id="artifact">
        <div className="artifact-preview">
          <div className="report-page report-page--back" />
          <div className="report-page">
            <div className="report-page__brand"><span /> MICRO / REPORT 07</div>
            <p>BRIEFING NOTE</p>
            <h3>Climate exposure and the insurance protection gap</h3>
            <div className="report-rule" />
            <h4>Executive finding</h4>
            <p className="report-copy">Price signals are arriving faster than public risk adaptation. The gap is most visible where hazard, replacement cost, and reinsurance pressure overlap.</p>
            <div className="report-chart"><i /><i /><i /><i /><i /><i /></div>
            <small>Source index · 18 citations · generated 17 Jul</small>
          </div>
        </div>
        <div className="artifact-copy">
          <span className="section-code">02 / ARTIFACTS</span>
          <h2>A finished object, not a transcript.</h2>
          <p>
            Long investigations become clean, downloadable reports with an executive summary,
            evidence trail, source links, and model-level cost record.
          </p>
          <ul>
            <li><CheckIcon size={16} /> Clickable citations</li>
            <li><CheckIcon size={16} /> PDF export</li>
            <li><CheckIcon size={16} /> Per-chat token ledger</li>
          </ul>
        </div>
      </section>

      <section className="price-section" id="pricing">
        <div>
          <span className="section-code">03 / ENTRY</span>
          <h2>Five credits. Your model keys. Every cost visible.</h2>
        </div>
        <div className="price-section__action">
          <p>Usage is metered by input, output, and cached tokens—never bundled behind a mystery rate.</p>
          <button className="primary-button" onClick={() => signIn("google")} type="button">
            Begin research <ArrowUpRightIcon size={17} />
          </button>
        </div>
      </section>

      <footer className="landing-footer">
        <Brand inverse />
        <p>Research with a visible chain of work.</p>
        <div>
          <Link href="/pricing">Pricing</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refund-policy">Refunds</Link>
          <Link href="/shipping-policy">Shipping</Link>
          <Link href="/contact">Contact</Link>
          <span>© 2026</span>
        </div>
      </footer>
    </main>
  );
}
