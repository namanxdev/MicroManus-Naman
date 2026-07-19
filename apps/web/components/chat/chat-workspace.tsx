"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, getJson, runResearchStream } from "../../lib/client/api";
import {
  MOCK_CHATS,
  MOCK_THREAD,
  MODEL_OPTIONS,
  RESEARCH_STARTERS,
} from "../../lib/client/mock-data";
import { useModelCatalog } from "../../lib/client/use-models";
import type {
  AgentStep,
  ChatListItem,
  ChatMessage,
  ChatThread,
  Citation,
  ModelOption,
  StreamEvent,
} from "../../lib/client/types";
import { AppShell } from "../app-shell";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  FileIcon,
  LinkIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  StopIcon,
} from "../ui/icons";
import { AgentTrace, ArtifactList, CitationList, UsageFootnote } from "./agent-trace";

interface ChatWorkspaceProps {
  initialThreadId?: string;
}

const demoEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}`;
}

function compactTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 46 ? `${normalized.slice(0, 46).trim()}…` : normalized;
}

function messageTime(value: string) {
  if (!value.includes("T")) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function mergeStep(steps: AgentStep[], incoming: AgentStep) {
  const match = steps.findIndex((step) => step.id === incoming.id);
  if (match === -1) return [...steps, incoming];
  return steps.map((step, index) => (index === match ? { ...step, ...incoming } : step));
}

function PlainResearchText({ content, streaming }: { content: string; streaming?: boolean }) {
  const blocks = content.split(/\n\n+/).filter(Boolean);
  return (
    <div className={`research-text ${streaming ? "research-text--streaming" : ""}`}>
      {blocks.map((block, index) => {
        if (block.startsWith("## ")) return <h3 key={`${block}-${index}`}>{block.slice(3)}</h3>;
        if (block.startsWith("### ")) return <h4 key={`${block}-${index}`}>{block.slice(4)}</h4>;
        return <p key={`${block.slice(0, 16)}-${index}`}>{block}</p>;
      })}
      {streaming && <span aria-label="Writing" className="writing-caret" />}
    </div>
  );
}

function ResearchEmptyState({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <section className="research-empty">
      <div className="research-empty__mark" aria-hidden="true">
        <span /><span /><span />
      </div>
      <span className="section-code">NEW INVESTIGATION</span>
      <h1>What should we find out?</h1>
      <p>
        Ask a broad question. MicroManus will plan the work, search the live web, examine sources,
        and keep looping until it can support the answer.
      </p>
      <div className="starter-list">
        {RESEARCH_STARTERS.map((prompt, index) => (
          <button key={prompt} onClick={() => onSelect(prompt)} type="button">
            <span>{String(index + 1).padStart(2, "0")}</span>
            {prompt}
            <ArrowUpIcon size={15} />
          </button>
        ))}
      </div>
    </section>
  );
}

function ThreadList({ threads, loading }: { threads: ChatListItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="thread-skeleton" aria-label="Loading conversations">
        <span /><span /><span />
      </div>
    );
  }
  return (
    <div className="thread-list">
      <div className="thread-list__heading"><span>Recent threads</span><small>{threads.length}</small></div>
      {threads.length ? (
        threads.map((thread) => (
          <Link className="thread-link" href={`/chat/${thread.id}`} key={thread.id}>
            <strong>{thread.title}</strong>
            <span>{thread.preview || thread.updatedAt}</span>
          </Link>
        ))
      ) : (
        <p className="thread-list__empty">Your investigations will appear here.</p>
      )}
    </div>
  );
}

function ModelSelector({
  model,
  models,
  onChange,
}: {
  model: string;
  models: ModelOption[];
  onChange: (model: string) => void;
}) {
  const providerGroups = useMemo(
    () => Array.from(new Set(models.map((item) => item.provider))),
    [models],
  );
  return (
    <label className="model-select">
      <span className="sr-only">Research model</span>
      <span className="model-select__signal" />
      <select onChange={(event) => onChange(event.target.value)} value={model}>
        {providerGroups.map((provider) => (
          <optgroup key={provider} label={provider}>
            {models.filter((item) => item.provider === provider).map((item) => (
              <option key={item.id} value={item.id}>{item.name} — {item.note}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDownIcon size={15} />
    </label>
  );
}

function Composer({
  value,
  model,
  models,
  running,
  webSearchEnabled,
  onChange,
  onModelChange,
  onWebSearchChange,
  onSend,
  onStop,
}: {
  value: string;
  model: string;
  models: ModelOption[];
  running: boolean;
  webSearchEnabled: boolean;
  onChange: (value: string) => void;
  onModelChange: (model: string) => void;
  onWebSearchChange: (enabled: boolean) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 176)}px`;
  }, [value]);

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          aria-label="Research question"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!running && value.trim()) onSend();
            }
          }}
          placeholder="Ask a question worth investigating…"
          ref={textareaRef}
          rows={1}
          value={value}
        />
        <div className="composer__bar">
          <div className="composer__tools">
            <ModelSelector model={model} models={models} onChange={onModelChange} />
            <button
              aria-checked={webSearchEnabled}
              aria-label={`Web search ${webSearchEnabled ? "on" : "off"}`}
              className={`tool-toggle ${webSearchEnabled ? "tool-toggle--active" : ""}`}
              disabled={running}
              onClick={() => onWebSearchChange(!webSearchEnabled)}
              role="switch"
              title={`Turn web search ${webSearchEnabled ? "off" : "on"}`}
              type="button"
            >
              <SearchIcon size={13} />
              <span>Web search</span>
              <span aria-hidden="true" className="tool-toggle__track"><i /></span>
            </button>
            <span className="tool-badge tool-badge--desktop"><FileIcon size={14} /> Reports</span>
          </div>
          {running ? (
            <button aria-label="Stop research" className="send-button send-button--stop" onClick={onStop} type="button">
              <StopIcon size={17} />
            </button>
          ) : (
            <button
              aria-label="Send research question"
              className="send-button"
              disabled={!value.trim()}
              onClick={onSend}
              type="button"
            >
              <ArrowUpIcon size={18} />
            </button>
          )}
        </div>
      </div>
      <p className="composer-note">MicroManus can make mistakes. Verify consequential claims in the cited sources.</p>
    </div>
  );
}

interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function ActionMenu({
  items,
  label,
  triggerClassName = "action-menu__trigger",
  align = "right",
}: {
  items: MenuItem[];
  label: string;
  triggerClassName?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className={`action-menu ${open ? "action-menu--open" : ""}`} ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className={triggerClassName}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <MoreIcon size={16} />
      </button>
      {open && (
        <div className="action-menu__pop" data-align={align} role="menu">
          {items.map((item) => (
            <button
              className="action-menu__item"
              disabled={item.disabled}
              key={item.key}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function sourcesToText(citations: Citation[]) {
  return citations
    .map((item, index) => `${String(index + 1).padStart(2, "0")}. ${item.title} — ${item.url}`)
    .join("\n");
}

function MessageActions({ content, citations }: { content: string; citations: Citation[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard?.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  const menuItems: MenuItem[] = [
    {
      key: "copy-sources",
      label: `Copy ${citations.length} source${citations.length === 1 ? "" : "s"}`,
      icon: <LinkIcon size={13} />,
      onClick: () => navigator.clipboard?.writeText(sourcesToText(citations)),
      disabled: !citations.length,
    },
    {
      key: "copy-all",
      label: "Copy answer with sources",
      icon: <FileIcon size={13} />,
      onClick: () => navigator.clipboard?.writeText(
        citations.length ? `${content}\n\nSources\n${sourcesToText(citations)}` : content,
      ),
    },
  ];

  return (
    <div className="message-actions">
      <button onClick={copy} type="button"><CopyIcon size={14} /> {copied ? "Copied" : "Copy"}</button>
      <ActionMenu items={menuItems} label="More answer actions" />
    </div>
  );
}

function Conversation({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const streamingText = messages.find((message) => message.status === "streaming")?.content;

  useEffect(() => {
    if (streamingText !== undefined) {
      endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [streamingText]);

  return (
    <div className="conversation">
      {messages.map((message) =>
        message.role === "user" ? (
          <article className="user-message" key={message.id}>
            <div className="message-label"><span>You</span><small>{messageTime(message.createdAt)}</small></div>
            <p>{message.content}</p>
          </article>
        ) : (
          <article className="assistant-message" key={message.id}>
            <header className="assistant-message__head">
              <span className="assistant-mark"><span /><span /><span /></span>
              <div><strong>MicroManus</strong><small>{message.status === "streaming" ? "Working" : "Research complete"}</small></div>
              <span className={`assistant-state assistant-state--${message.status || "complete"}`}>
                {message.status === "streaming" ? <i /> : <CheckIcon size={12} />}
              </span>
            </header>
            <AgentTrace steps={message.steps || []} />
            {message.content ? (
              <PlainResearchText content={message.content} streaming={message.status === "streaming"} />
            ) : (
              <div className="answer-skeleton" aria-label="Drafting answer"><span /><span /><span /></div>
            )}
            <CitationList citations={message.citations || []} />
            <ArtifactList artifacts={message.artifacts || []} />
            {message.status !== "streaming" && message.content && (
              <MessageActions content={message.content} citations={message.citations || []} />
            )}
            <UsageFootnote usage={message.usage} />
            {message.status === "error" && (
              <div className="message-error" role="alert">The research run stopped before completion. Check your provider key and try again.</div>
            )}
          </article>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}

function ThreadStatus({ messages, running }: { messages: ChatMessage[]; running: boolean }) {
  const turns = messages.reduce((count, message) => count + (message.role === "user" ? 1 : 0), 0);

  if (running) {
    return (
      <span className="context-badge context-badge--live" title="Researching — working through this turn">
        <i aria-hidden="true" /> Researching
      </span>
    );
  }
  if (!turns) {
    return (
      <span className="context-badge" title="Ask a question to open this thread">
        <ClockIcon size={14} /> New thread
      </span>
    );
  }
  return (
    <span className="context-badge" title="Conversation context is kept across every turn in this thread">
      <ClockIcon size={14} /> Context · {turns} turn{turns === 1 ? "" : "s"}
    </span>
  );
}

export function ChatWorkspace({ initialThreadId }: ChatWorkspaceProps) {
  const { models: modelOptions } = useModelCatalog();
  const [threadId, setThreadId] = useState(initialThreadId);
  const [title, setTitle] = useState(initialThreadId ? "Loading investigation…" : "New investigation");
  const [model, setModel] = useState(MODEL_OPTIONS[0].id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ChatListItem[]>([]);
  const [input, setInput] = useState("");
  const [threadLoading, setThreadLoading] = useState(Boolean(initialThreadId));
  const [listLoading, setListLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [running, setRunning] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let mounted = true;
    getJson<{ chats?: ChatListItem[] } | ChatListItem[]>("/api/chats")
      .then((response) => {
        if (!mounted) return;
        setThreads(Array.isArray(response) ? response : response.chats || []);
      })
      .catch(() => {
        if (!mounted) return;
        setThreads(demoEnabled ? MOCK_CHATS : []);
        if (!demoEnabled) setPageError("Conversation history could not be loaded.");
      })
      .finally(() => mounted && setListLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!initialThreadId) return;
    let mounted = true;
    getJson<{ chat?: ChatThread } | ChatThread>(`/api/chats/${encodeURIComponent(initialThreadId)}`)
      .then((response) => {
        if (!mounted) return;
        const chat = "chat" in response && response.chat ? response.chat : (response as ChatThread);
        setTitle(chat.title);
        setModel(chat.model || MODEL_OPTIONS[0].id);
        setMessages(chat.messages || []);
      })
      .catch((error) => {
        if (!mounted) return;
        const previewThread = demoEnabled
          && MOCK_CHATS.some((chat) => chat.id === initialThreadId);
        if (previewThread) {
          const fallback = { ...MOCK_THREAD, id: initialThreadId };
          setTitle(fallback.title);
          setModel(fallback.model);
          setMessages(fallback.messages);
        } else {
          setTitle("Research thread unavailable");
          setMessages([]);
        }
        if (!previewThread || !(error instanceof ApiError && error.status === 404)) {
          setPageError("Live history is unavailable. Showing a local preview thread.");
        }
      })
      .finally(() => mounted && setThreadLoading(false));
    return () => {
      mounted = false;
    };
  }, [initialThreadId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function updateAssistant(id: string, update: (message: ChatMessage) => ChatMessage) {
    setMessages((current) => current.map((message) => (message.id === id ? update(message) : message)));
  }

  async function sendResearch(override?: string) {
    const prompt = (override || input).trim();
    if (!prompt || running) return;
    setInput("");
    setPageError("");
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMessage: ChatMessage = {
      id: makeId("user"),
      role: "user",
      content: prompt,
      createdAt: now,
      status: "complete",
    };
    const assistantId = makeId("assistant");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: now,
      status: "streaming",
      steps: [
        {
          id: "intake",
          label: "Understanding the request",
          detail: "Defining scope, evidence standard, and output shape.",
          status: "complete",
          tool: "Reasoning",
        },
      ],
      citations: [],
      artifacts: [],
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setRunning(true);

    const activeThreadId = threadId || makeId("research");
    const nextTitle = messages.length ? title : compactTitle(prompt);
    if (!threadId) {
      setThreadId(activeThreadId);
      setTitle(nextTitle);
      window.history.replaceState(window.history.state, "", `/chat/${activeThreadId}`);
      setThreads((current) => [
        { id: activeThreadId, title: nextTitle, model, updatedAt: "Now", preview: prompt },
        ...current,
      ]);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    let streamFailed = false;

    function handleEvent(event: StreamEvent) {
      if (event.type === "thread" && event.threadId !== activeThreadId) {
        setThreadId(event.threadId);
        window.history.replaceState(window.history.state, "", `/chat/${event.threadId}`);
        setThreads((current) => current.map((thread) => (
          thread.id === activeThreadId ? { ...thread, id: event.threadId } : thread
        )));
      }
      if (event.type === "step") {
        updateAssistant(assistantId, (message) => ({
          ...message,
          steps: mergeStep(message.steps || [], event.step),
        }));
      }
      if (event.type === "delta") {
        updateAssistant(assistantId, (message) => ({ ...message, content: message.content + event.delta }));
      }
      if (event.type === "citation") {
        updateAssistant(assistantId, (message) => ({
          ...message,
          citations: [...(message.citations || []).filter((item) => item.id !== event.citation.id), event.citation],
        }));
      }
      if (event.type === "artifact") {
        updateAssistant(assistantId, (message) => ({
          ...message,
          artifacts: [...(message.artifacts || []), event.artifact],
        }));
      }
      if (event.type === "usage") {
        updateAssistant(assistantId, (message) => ({ ...message, usage: event.usage }));
      }
      if (event.type === "error") {
        streamFailed = true;
        setPageError(event.error);
      }
      if (event.type === "done") {
        updateAssistant(assistantId, (message) => ({ ...message, status: streamFailed ? "error" : "complete" }));
      }
    }

    try {
      await runResearchStream({
        threadId: activeThreadId,
        message: prompt,
        model,
        webSearchEnabled,
        signal: controller.signal,
        onEvent: handleEvent,
      });
      updateAssistant(assistantId, (message) => ({ ...message, status: streamFailed ? "error" : "complete" }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        updateAssistant(assistantId, (message) => ({
          ...message,
          status: "complete",
          content: message.content || "Research stopped before an answer was produced.",
        }));
      } else {
        updateAssistant(assistantId, (message) => ({ ...message, status: "error" }));
        setPageError(error instanceof Error ? error.message : "The research run could not start.");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  function stopResearch() {
    abortRef.current?.abort();
  }

  function changeWebSearch(enabled: boolean) {
    setWebSearchEnabled(enabled);
  }

  const sidebar = <ThreadList loading={listLoading} threads={threads} />;

  return (
    <AppShell contentClassName="app-content--chat" sidebarExtra={sidebar}>
      <div className="chat-workspace">
        <header className="chat-header">
          <div className="chat-header__title">
            <span className="section-code">THREAD / {threadId ? threadId.slice(0, 8).toUpperCase() : "NEW"}</span>
            <h1>{title}</h1>
          </div>
          <div className="chat-header__meta">
            <ThreadStatus messages={messages} running={running} />
            <ModelSelector model={model} models={modelOptions} onChange={setModel} />
            <ActionMenu
              align="right"
              label="Conversation actions"
              triggerClassName="icon-button"
              items={[
                {
                  key: "copy-link",
                  label: "Copy link to thread",
                  icon: <LinkIcon size={13} />,
                  onClick: () => navigator.clipboard?.writeText(window.location.href),
                  disabled: !threadId,
                },
                {
                  key: "new-research",
                  label: "New research",
                  icon: <PlusIcon size={13} />,
                  onClick: () => window.location.assign("/chat"),
                },
              ]}
            />
          </div>
        </header>

        {pageError && (
          <div className="chat-alert" role="alert">
            <span />
            <p>{pageError}</p>
            <Link href="/settings">Check settings</Link>
          </div>
        )}

        <div className="chat-scroll">
          {threadLoading ? (
            <div className="conversation-loading" aria-label="Loading conversation">
              <span /><span /><span /><span />
            </div>
          ) : messages.length ? (
            <Conversation messages={messages} />
          ) : (
            <ResearchEmptyState onSelect={(prompt) => sendResearch(prompt)} />
          )}
        </div>

        <Composer
          model={model}
          models={modelOptions}
          onChange={setInput}
          onModelChange={setModel}
          onWebSearchChange={changeWebSearch}
          onSend={() => sendResearch()}
          onStop={stopResearch}
          running={running}
          value={input}
          webSearchEnabled={webSearchEnabled}
        />
      </div>
    </AppShell>
  );
}
