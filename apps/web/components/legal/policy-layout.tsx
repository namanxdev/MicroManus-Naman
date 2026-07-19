import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "../ui/brand";

export interface PolicySection {
  title: string;
  content: ReactNode;
}

export function PolicyLayout({
  code,
  title,
  summary,
  sections,
}: {
  code: string;
  title: string;
  summary: string;
  sections: PolicySection[];
}) {
  return (
    <main className="policy-page">
      <div aria-hidden="true" className="paper-noise" />
      <nav className="policy-nav">
        <Brand />
        <Link href="/pricing">View pricing</Link>
      </nav>

      <div className="policy-layout">
        <header className="policy-header">
          <span className="section-code">{code}</span>
          <h1>{title}</h1>
          <p>{summary}</p>
        </header>

        <article className="policy-document">
          {sections.map((section, index) => (
            <section key={section.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{section.title}</h2>
                {section.content}
              </div>
            </section>
          ))}
        </article>
      </div>

      <footer className="policy-footer">
        <span>MicroManus / Public information</span>
        <div>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund-policy">Refunds</Link>
          <Link href="/shipping-policy">Shipping</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>
    </main>
  );
}
