"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, getJson, postJson } from "../../lib/client/api";
import { MODEL_OPTIONS } from "../../lib/client/mock-data";
import { useModelCatalog } from "../../lib/client/use-models";
import type { ProviderConfiguration, ProviderId } from "../../lib/client/types";
import { AppShell } from "../app-shell";
import {
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyIcon,
  ShieldIcon,
  SparkIcon,
} from "../ui/icons";

interface ProviderMeta {
  id: ProviderId;
  name: string;
  short: string;
  description: string;
  keyPlaceholder: string;
  defaultBaseUrl: string;
  models: string[];
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "openai",
    name: "OpenAI / compatible",
    short: "OA",
    description: "Use OpenAI directly or point the endpoint at a compatible gateway.",
    keyPlaceholder: "sk-••••••••••••••••••••••••",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: MODEL_OPTIONS.filter((model) => model.provider === "OpenAI").map((model) => model.id),
  },
  {
    id: "anthropic",
    name: "Anthropic",
    short: "AN",
    description: "Connect Claude for careful long-context analysis and synthesis.",
    keyPlaceholder: "sk-ant-••••••••••••••••••••",
    defaultBaseUrl: "https://api.anthropic.com",
    models: MODEL_OPTIONS.filter((model) => model.provider === "Anthropic").map((model) => model.id),
  },
  {
    id: "kimi",
    name: "Kimi / Moonshot",
    short: "KM",
    description: "Use Kimi for large-context and technical research workflows.",
    keyPlaceholder: "sk-••••••••••••••••••••••••",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    models: MODEL_OPTIONS.filter((model) => model.provider === "Moonshot").map((model) => model.id),
  },
];

export function SettingsClient() {
  const { models: modelOptions } = useModelCatalog();
  const [activeProvider, setActiveProvider] = useState<ProviderId>("openai");
  const [configurations, setConfigurations] = useState<ProviderConfiguration[]>(
    PROVIDERS.map((provider) => ({ id: provider.id, configured: false })),
  );
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].defaultBaseUrl);
  const [model, setModel] = useState(PROVIDERS[0].models[0]);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const provider = useMemo(
    () => PROVIDERS.find((item) => item.id === activeProvider) || PROVIDERS[0],
    [activeProvider],
  );
  const providerModels = useMemo(
    () => modelOptions.filter((item) => {
      if (activeProvider === "kimi") return item.provider === "Moonshot";
      if (activeProvider === "openai") return item.provider === "OpenAI";
      return item.provider === "Anthropic";
    }),
    [activeProvider, modelOptions],
  );

  useEffect(() => {
    let mounted = true;
    getJson<{ providers?: ProviderConfiguration[] }>("/api/settings/keys")
      .then((response) => {
        if (!mounted || !response.providers) return;
        setConfigurations(response.providers);
        const initial = response.providers.find((item) => item.id === "openai");
        if (initial?.baseUrl) setBaseUrl(initial.baseUrl);
        if (initial?.model) setModel(initial.model);
      })
      .catch(() => undefined)
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  function selectProvider(id: ProviderId) {
    const selected = PROVIDERS.find((item) => item.id === id) || PROVIDERS[0];
    const current = configurations.find((item) => item.id === id);
    setActiveProvider(id);
    setApiKey("");
    setShowKey(false);
    setError("");
    setNotice("");
    setBaseUrl(current?.baseUrl || selected.defaultBaseUrl);
    setModel(current?.model || selected.models[0]);
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!apiKey.trim() && !configurations.find((item) => item.id === activeProvider)?.configured) {
      setError("Enter an API key before saving this provider.");
      return;
    }
    try {
      new URL(baseUrl);
    } catch {
      setError("Enter a valid HTTP or HTTPS endpoint.");
      return;
    }

    setSaving(true);
    try {
      const response = await postJson<{ ok: boolean; configured?: boolean; error?: string }>(
        "/api/settings/keys",
        { provider: activeProvider, apiKey: apiKey.trim() || undefined, baseUrl, model },
      );
      if (!response.ok) throw new Error(response.error || "The provider rejected this connection.");
      setConfigurations((current) => [
        ...current.filter((item) => item.id !== activeProvider),
        { id: activeProvider, configured: true, baseUrl, model },
      ]);
      setApiKey("");
      setNotice(`${provider.name} is saved and ready for the next research run.`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setError("The secure key vault endpoint is not configured on this deployment.");
      } else {
        setError(caught instanceof Error ? caught.message : "Could not verify this provider.");
      }
    } finally {
      setSaving(false);
    }
  }

  const activeConfig = configurations.find((item) => item.id === activeProvider);

  return (
    <AppShell>
      <div className="settings-page app-page">
        <header className="page-heading">
          <div>
            <span className="section-code">WORKSPACE / SETTINGS</span>
            <h1>Provider keys</h1>
            <p>Connect the models MicroManus can use. No LLM key ships with the app.</p>
          </div>
          <div className="vault-status"><ShieldIcon size={16} /><span><strong>Encrypted vault</strong><small>Secrets stay server-side</small></span></div>
        </header>

        <div className="settings-layout">
          <aside className="provider-rail" aria-label="Model providers">
            <div className="provider-rail__head"><span>MODEL PROVIDERS</span><small>{configurations.filter((item) => item.configured).length} / {PROVIDERS.length}</small></div>
            {PROVIDERS.map((item) => {
              const connected = configurations.some((config) => config.id === item.id && config.configured);
              return (
                <button
                  className={activeProvider === item.id ? "is-active" : ""}
                  key={item.id}
                  onClick={() => selectProvider(item.id)}
                  type="button"
                >
                  <span className="provider-monogram">{item.short}</span>
                  <span><strong>{item.name}</strong><small>{connected ? "Connected" : "Not connected"}</small></span>
                  {connected ? <span className="connected-check"><CheckIcon size={12} /></span> : <ChevronRightIcon size={15} />}
                </button>
              );
            })}
            <div className="search-provider-row">
              <span className="provider-monogram"><GlobeIcon size={17} /></span>
              <span><strong>Brave Search</strong><small>Managed by deployment</small></span>
              <span className="server-label">SERVER</span>
            </div>
          </aside>

          <section className="provider-editor">
            <div className="provider-editor__head">
              <span className="provider-logo-large">{provider.short}</span>
              <div>
                <span className="section-code">PROVIDER / {provider.id.toUpperCase()}</span>
                <h2>{provider.name}</h2>
                <p>{provider.description}</p>
              </div>
              <span className={`connection-state ${activeConfig?.configured ? "is-connected" : ""}`}>
                <i /> {activeConfig?.configured ? "Connected" : "Not connected"}
              </span>
            </div>

            {loading ? (
              <div className="settings-skeleton" aria-label="Loading provider settings"><span /><span /><span /></div>
            ) : (
              <form className="provider-form" onSubmit={saveProvider}>
                {error && <div className="form-error" role="alert">{error}</div>}
                {notice && <div className="form-success" role="status"><CheckIcon size={16} />{notice}</div>}

                <div className="form-field">
                  <label htmlFor="provider-key">API key</label>
                  <div className="secret-input">
                    <KeyIcon size={17} />
                    <input
                      autoComplete="off"
                      id="provider-key"
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={activeConfig?.configured ? "Leave blank to keep the saved key" : provider.keyPlaceholder}
                      spellCheck={false}
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                    />
                    <button aria-label={showKey ? "Hide API key" : "Show API key"} onClick={() => setShowKey((value) => !value)} type="button">
                      {showKey ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                    </button>
                  </div>
                  <small>The key is sent only to the secure server route and is never returned to this browser.</small>
                </div>

                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="provider-endpoint">API endpoint</label>
                    <input
                      id="provider-endpoint"
                      onChange={(event) => setBaseUrl(event.target.value)}
                      spellCheck={false}
                      type="url"
                      value={baseUrl}
                    />
                    <small>OpenAI-compatible endpoints are supported.</small>
                  </div>
                  <div className="form-field">
                    <label htmlFor="default-model">Default model</label>
                    <select id="default-model" onChange={(event) => setModel(event.target.value)} value={model}>
                      {(providerModels.length
                        ? providerModels
                        : provider.models.map((modelId) => MODEL_OPTIONS.find((item) => item.id === modelId)).filter(Boolean)
                      ).map((option) => option && (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                    <small>You can switch models inside each chat.</small>
                  </div>
                </div>

                <div className="provider-form__footer">
                  <div><SparkIcon size={16} /><span><strong>Secure provider setup</strong><small>The next research run will use this model and endpoint.</small></span></div>
                  <button className="primary-button" disabled={saving} type="submit">
                    {saving ? "Saving provider…" : "Save provider"}
                  </button>
                </div>
              </form>
            )}

            <div className="security-note">
              <ShieldIcon size={18} />
              <div><strong>Secret handling</strong><p>Keys are encrypted at rest, redacted from logs, and injected only when the agent executes a model call. Deleting a key immediately disables that provider.</p></div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
