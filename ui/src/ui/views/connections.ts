import { html, nothing } from "lit";
import type { GatewayHelloOk } from "../gateway.ts";
import type { UiSettings } from "../storage.ts";

const REDACTED_SENTINEL = "__OPENCLAW_REDACTED__";
const DEFAULT_OPENAI_MODEL = "openai/gpt-5.2";
const OPENAI_ENV_KEY_PATH: Array<string | number> = ["env", "OPENAI_API_KEY"];
const OPENAI_PROVIDER_KEY_PATH: Array<string | number> = [
  "models",
  "providers",
  "openai",
  "apiKey",
];
const DEFAULT_MODEL_PATH: Array<string | number> = ["agents", "defaults", "model"];
const DEFAULT_MODEL_PRIMARY_PATH: Array<string | number> = [
  "agents",
  "defaults",
  "model",
  "primary",
];

type AuthMode = "none" | "token" | "password" | "trusted-proxy";

type SnapshotShape = {
  authMode?: AuthMode;
};

export type ConnectionsProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onConnect: () => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigSave: () => Promise<void>;
  onConfigReload: () => Promise<void>;
};

export type OpenAiConnectionDetails = {
  keyConfigured: boolean;
  keyStoredHidden: boolean;
  keyValue: string;
  keySource: "env" | "provider" | "none";
  modelValue: string;
  modelPath: Array<string | number>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function getValueAtPath(
  source: Record<string, unknown> | null,
  path: Array<string | number>,
): unknown {
  let cursor: unknown = source;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(cursor)) {
        return undefined;
      }
      cursor = cursor[segment];
      continue;
    }
    const record = asRecord(cursor);
    if (!record) {
      return undefined;
    }
    cursor = record[segment];
  }
  return cursor;
}

function isConfiguredSecret(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return value.trim().length > 0;
}

function isStoredHidden(value: unknown): boolean {
  return typeof value === "string" && value.trim() === REDACTED_SENTINEL;
}

export function resolveOpenAiConnectionDetails(
  configForm: Record<string, unknown> | null,
): OpenAiConnectionDetails {
  const envKey = getValueAtPath(configForm, OPENAI_ENV_KEY_PATH);
  const providerKey = getValueAtPath(configForm, OPENAI_PROVIDER_KEY_PATH);

  const envConfigured = isConfiguredSecret(envKey);
  const providerConfigured = isConfiguredSecret(providerKey);
  const keySource: OpenAiConnectionDetails["keySource"] = envConfigured
    ? "env"
    : providerConfigured
      ? "provider"
      : "none";

  const modelNode = getValueAtPath(configForm, DEFAULT_MODEL_PATH);
  const modelRecord = asRecord(modelNode);
  const modelPath = modelRecord ? DEFAULT_MODEL_PRIMARY_PATH : DEFAULT_MODEL_PATH;
  const modelPrimary = modelRecord
    ? typeof modelRecord.primary === "string"
      ? modelRecord.primary
      : ""
    : typeof modelNode === "string"
      ? modelNode
      : "";

  return {
    keyConfigured: envConfigured || providerConfigured,
    keyStoredHidden: isStoredHidden(envKey) || isStoredHidden(providerKey),
    keyValue: typeof envKey === "string" ? envKey : "",
    keySource,
    modelValue: modelPrimary.trim(),
    modelPath,
  };
}

export function renderConnections(props: ConnectionsProps) {
  const snapshot = props.hello?.snapshot as SnapshotShape | undefined;
  const authMode = snapshot?.authMode ?? "none";
  const details = resolveOpenAiConnectionDetails(props.configForm);
  const openAiModelConfigured = details.modelValue.toLowerCase().startsWith("openai/");
  const readyForOpenAi = details.keyConfigured && openAiModelConfigured;
  const openAiStatusClass = readyForOpenAi ? "success" : details.keyConfigured ? "info" : "danger";
  const openAiStatusText = readyForOpenAi
    ? "OpenAI is configured and selected."
    : details.keyConfigured
      ? "OpenAI key is set. Select an openai/* model to activate it."
      : "OpenAI key is missing.";
  const openAiSourceText =
    details.keySource === "env"
      ? "Source: env.OPENAI_API_KEY"
      : details.keySource === "provider"
        ? "Source: models.providers.openai.apiKey"
        : "Source: not configured";

  const connectLabel = props.connected ? "Reconnect" : "Connect";
  const saveDisabled =
    !props.connected || props.configLoading || props.configSaving || !props.configForm;

  return html`
    <section class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Gateway Connection</div>
        <div class="card-sub">Manage dashboard endpoint and auth token used by this browser.</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>WebSocket URL</span>
            <input
              .value=${props.settings.gatewayUrl}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, gatewayUrl: v });
              }}
              placeholder="ws://127.0.0.1:18789"
            />
          </label>
          <label class="field">
            <span>Gateway Token</span>
            <input
              type="password"
              .value=${props.settings.token}
              @input=${(e: Event) => {
                const v = (e.target as HTMLInputElement).value;
                props.onSettingsChange({ ...props.settings, token: v });
              }}
              placeholder="OPENCLAW_GATEWAY_TOKEN"
            />
          </label>
          <label class="field">
            <span>Password (not stored)</span>
            <input
              type="password"
              .value=${props.password}
              @input=${(e: Event) => props.onPasswordChange((e.target as HTMLInputElement).value)}
              placeholder="Shared password"
            />
          </label>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          <button class="btn primary" @click=${() => props.onConnect()}>
            ${connectLabel}
          </button>
          <span class="pill">
            <span class="statusDot ${props.connected ? "ok" : ""}"></span>
            <span>${props.connected ? "Connected" : "Disconnected"}</span>
          </span>
          <span class="pill"><span>Auth:</span> <span class="mono">${authMode}</span></span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">OpenAI API</div>
        <div class="card-sub">Set API key and model defaults for quick OpenAI activation.</div>
        <div class="form-grid" style="margin-top: 16px;">
          <label class="field">
            <span>OPENAI_API_KEY</span>
            <input
              type="password"
              .value=${details.keyValue}
              @input=${(e: Event) => {
                const raw = (e.target as HTMLInputElement).value.trim();
                props.onConfigPatch(OPENAI_ENV_KEY_PATH, raw.length > 0 ? raw : undefined);
              }}
              placeholder="sk-..."
            />
          </label>
          <label class="field">
            <span>Default Model</span>
            <input
              .value=${details.modelValue}
              list="openai-model-suggestions"
              @input=${(e: Event) => {
                const raw = (e.target as HTMLInputElement).value.trim();
                props.onConfigPatch(details.modelPath, raw.length > 0 ? raw : undefined);
              }}
              placeholder="openai/gpt-5.2"
            />
            <datalist id="openai-model-suggestions">
              <option value="openai/gpt-5.2"></option>
              <option value="openai/gpt-5.2-mini"></option>
              <option value="openai/gpt-5-mini"></option>
              <option value="openai/gpt-5.2-codex"></option>
            </datalist>
          </label>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap;">
          <button
            class="btn primary"
            ?disabled=${saveDisabled}
            @click=${() => props.onConfigSave()}
          >
            ${props.configSaving ? "Saving..." : "Save Config"}
          </button>
          <button
            class="btn"
            ?disabled=${props.configLoading}
            @click=${() => props.onConfigReload()}
          >
            Reload Config
          </button>
          <button
            class="btn"
            ?disabled=${props.configLoading}
            @click=${() => props.onConfigPatch(details.modelPath, DEFAULT_OPENAI_MODEL)}
          >
            Use ${DEFAULT_OPENAI_MODEL}
          </button>
          <button
            class="btn danger"
            ?disabled=${props.configLoading}
            @click=${() => {
              props.onConfigPatch(OPENAI_ENV_KEY_PATH, undefined);
              props.onConfigPatch(OPENAI_PROVIDER_KEY_PATH, undefined);
            }}
          >
            Clear Key
          </button>
        </div>

        <div class="callout ${openAiStatusClass}" style="margin-top: 12px;">
          <div>${openAiStatusText}</div>
          <div class="mono" style="margin-top: 6px;">${openAiSourceText}</div>
          ${
            details.keyStoredHidden
              ? html`
                  <div style="margin-top: 6px">Stored value is hidden in UI responses.</div>
                `
              : nothing
          }
          ${
            props.configDirty
              ? html`
                  <div style="margin-top: 6px">Unsaved config changes pending.</div>
                `
              : nothing
          }
        </div>
      </div>
    </section>
  `;
}
