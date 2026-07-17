"use client";

import { useEffect, useState } from "react";
import type { AgentStep, Artifact, Citation, TokenUsage } from "../../lib/client/types";
import {
  CheckIcon,
  ChevronDownIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  GlobeIcon,
  SearchIcon,
  SparkIcon,
} from "../ui/icons";

function StepGlyph({ step }: { step: AgentStep }) {
  if (step.tool?.toLowerCase().includes("search")) return <SearchIcon size={15} />;
  if (step.tool?.toLowerCase().includes("browser")) return <GlobeIcon size={15} />;
  if (step.tool?.toLowerCase().includes("report")) return <FileIcon size={15} />;
  return <SparkIcon size={15} />;
}

export function AgentTrace({ steps }: { steps: AgentStep[] }) {
  const running = steps.some((step) => step.status === "running" || step.status === "queued");
  const [open, setOpen] = useState(running);

  useEffect(() => {
    if (running) setOpen(true);
  }, [running]);

  if (!steps.length) return null;

  return (
    <section className={`agent-trace ${running ? "agent-trace--running" : ""}`}>
      <button
        aria-expanded={open}
        className="agent-trace__toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="agent-trace__signal">
          {running ? <i /> : <CheckIcon size={14} />}
        </span>
        <span>
          <strong>{running ? "Researching across sources" : `Research trace · ${steps.length} steps`}</strong>
          <small>{running ? "The agent may revisit earlier steps" : "Search, review, and synthesis completed"}</small>
        </span>
        <ChevronDownIcon className={open ? "is-rotated" : ""} size={17} />
      </button>

      {open && (
        <ol className="agent-trace__list">
          {steps.map((step, index) => (
            <li className={`trace-step trace-step--${step.status}`} key={step.id}>
              <span className="trace-step__line" />
              <span className="trace-step__glyph">
                {step.status === "complete" ? <CheckIcon size={14} /> : <StepGlyph step={step} />}
              </span>
              <div>
                <div className="trace-step__title">
                  <strong>{step.label}</strong>
                  {step.duration && <small>{step.duration}</small>}
                </div>
                <p>{step.detail}</p>
                {step.tool && <span className="trace-tool">{step.tool}</span>}
              </div>
              <span className="trace-step__index">{String(index + 1).padStart(2, "0")}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <section className="citation-section">
      <div className="message-section-title">
        <span>Sources</span>
        <small>{citations.length} consulted</small>
      </div>
      <div className="citation-list">
        {citations.map((citation, index) => {
          const internal = citation.url.startsWith("/");
          return (
            <a
              className="citation-item"
              href={citation.url}
              key={citation.id}
              rel={internal ? undefined : "noreferrer"}
              target={internal ? undefined : "_blank"}
            >
              <span className="citation-item__number">{String(index + 1).padStart(2, "0")}</span>
              <span className="citation-item__body">
                <small>{citation.domain || "Source"}{citation.publishedAt ? ` · ${citation.publishedAt}` : ""}</small>
                <strong>{citation.title}</strong>
                {citation.excerpt && <p>{citation.excerpt}</p>}
              </span>
              <ExternalLinkIcon size={15} />
            </a>
          );
        })}
      </div>
    </section>
  );
}

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  if (!artifacts.length) return null;
  const uniqueArtifacts = Array.from(
    new Map(artifacts.map((artifact) => [artifact.id, artifact])).values(),
  );

  function downloadUrl(artifact: Artifact) {
    const agentArtifact = artifact.url.match(/^\/v1\/artifacts\/([0-9a-f]{32})$/i);
    return agentArtifact ? `/api/agent/artifacts/${agentArtifact[1]}` : artifact.url;
  }

  return (
    <section className="artifact-list">
      {uniqueArtifacts.map((artifact) => (
        <a className="artifact-card" href={downloadUrl(artifact)} key={artifact.id}>
          <span className="artifact-card__preview">
            <FileIcon size={24} />
            <i /><i /><i />
            <b>PDF</b>
          </span>
          <span className="artifact-card__body">
            <small>Generated artifact</small>
            <strong>{artifact.name}</strong>
            <span>{typeof artifact.size === "number"
              ? `${(artifact.size / 1024).toFixed(1)} KB`
              : artifact.size || artifact.type.toUpperCase()} · Citations included</span>
          </span>
          <span className="artifact-card__download"><DownloadIcon size={17} /></span>
        </a>
      ))}
    </section>
  );
}

export function UsageFootnote({ usage }: { usage?: TokenUsage }) {
  if (!usage) return null;
  return (
    <div className="message-usage">
      <span>{usage.inputTokens.toLocaleString()} in</span>
      <span>{usage.outputTokens.toLocaleString()} out</span>
      <span>{usage.cacheTokens.toLocaleString()} cached</span>
      <strong>${usage.cost.toFixed(4)}</strong>
    </div>
  );
}
