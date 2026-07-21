import * as fs from "fs";
import * as path from "path";
import { getServiceConfigDir } from "mioku";
import type {
  AIModelCapability,
  AIModelDescriptor,
  AIModelRole,
  AIProviderConfig,
  ProvidersFile,
} from "./types";
import { modelFullId, parseModelFullId } from "./types";
import { createProviderClient, defaultApiUrl } from "./providers";
import { toModelDescriptor } from "./providers/base";

const ROLES: AIModelRole[] = ["main", "working", "vision"];

function configPath(): string {
  return path.join(getServiceConfigDir("ai"), "providers.json");
}

function emptyFile(): ProvidersFile {
  return {
    providers: [],
    models: [],
    roles: {},
  };
}

function ensureDir(file: string): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(input: string): string {
  return (
    String(input || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `provider-${Date.now()}`
  );
}

function uniqueProviderId(base: string, existing: Set<string>): string {
  let id = slugify(base);
  if (!existing.has(id)) return id;
  let i = 2;
  while (existing.has(`${id}-${i}`)) i += 1;
  return `${id}-${i}`;
}

export class ProvidersRegistry {
  private data: ProvidersFile = emptyFile();
  private clients = new Map<string, ReturnType<typeof createProviderClient>>();

  load(): void {
    const file = configPath();
    ensureDir(file);
    if (!fs.existsSync(file)) {
      this.data = emptyFile();
      this.save();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as ProvidersFile;
      this.data = {
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
        models: Array.isArray(parsed.models) ? parsed.models : [],
        roles: parsed.roles && typeof parsed.roles === "object" ? parsed.roles : {},
        defaultInstance:
          typeof parsed.defaultInstance === "string"
            ? parsed.defaultInstance
            : undefined,
      };
    } catch {
      this.data = emptyFile();
    }
    this.clients.clear();
  }

  save(): void {
    const file = configPath();
    ensureDir(file);
    fs.writeFileSync(file, JSON.stringify(this.data, null, 2), "utf-8");
  }

  getData(): ProvidersFile {
    return this.data;
  }

  listProviders(): AIProviderConfig[] {
    return this.data.providers.map((item) => ({ ...item }));
  }

  getProvider(id: string): AIProviderConfig | undefined {
    const found = this.data.providers.find((item) => item.id === id);
    return found ? { ...found } : undefined;
  }

  getClient(id: string) {
    const provider = this.getProvider(id);
    if (!provider || !provider.enabled) return undefined;
    let client = this.clients.get(id);
    if (!client) {
      client = createProviderClient(provider);
      this.clients.set(id, client);
    }
    return client;
  }

  async createProvider(
    input: Omit<AIProviderConfig, "id"> & { id?: string },
  ): Promise<AIProviderConfig> {
    const existing = new Set(this.data.providers.map((item) => item.id));
    const id =
      input.id && !existing.has(input.id)
        ? slugify(input.id)
        : uniqueProviderId(input.name || input.protocol, existing);
    const provider: AIProviderConfig = {
      id,
      name: String(input.name || id).trim() || id,
      protocol: input.protocol,
      apiUrl: String(input.apiUrl || defaultApiUrl(input.protocol)).trim(),
      apiKey: String(input.apiKey || "").trim(),
      enabled: input.enabled !== false,
      ...(input.headers ? { headers: { ...input.headers } } : {}),
    };
    this.data.providers.push(provider);
    this.save();
    this.clients.delete(id);
    return { ...provider };
  }

  async updateProvider(
    id: string,
    input: Partial<AIProviderConfig>,
  ): Promise<AIProviderConfig> {
    const index = this.data.providers.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Provider not found: ${id}`);
    const current = this.data.providers[index];
    const next: AIProviderConfig = {
      ...current,
      ...input,
      id: current.id,
      apiUrl:
        input.apiUrl !== undefined
          ? String(input.apiUrl).trim()
          : current.apiUrl,
      apiKey:
        input.apiKey !== undefined
          ? String(input.apiKey).trim()
          : current.apiKey,
      name:
        input.name !== undefined
          ? String(input.name).trim() || current.name
          : current.name,
      enabled:
        input.enabled !== undefined ? Boolean(input.enabled) : current.enabled,
    };
    this.data.providers[index] = next;
    this.save();
    this.clients.delete(id);
    return { ...next };
  }

  removeProvider(id: string): boolean {
    const before = this.data.providers.length;
    this.data.providers = this.data.providers.filter((item) => item.id !== id);
    this.data.models = this.data.models.filter((item) => item.providerId !== id);
    for (const role of ROLES) {
      const bound = this.data.roles[role];
      if (bound?.startsWith(`${id}/`)) delete this.data.roles[role];
    }
    this.clients.delete(id);
    if (this.data.providers.length === before) return false;
    this.save();
    return true;
  }

  listModels(providerId?: string): AIModelDescriptor[] {
    return this.data.models
      .filter((item) => !providerId || item.providerId === providerId)
      .map((item) => ({ ...item }));
  }

  getModel(fullId: string): AIModelDescriptor | undefined {
    const found = this.data.models.find((item) => item.id === fullId);
    return found ? { ...found } : undefined;
  }

  async refreshModels(providerId: string): Promise<AIModelDescriptor[]> {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    const client = this.getClient(providerId);
    if (!client) throw new Error(`Provider disabled: ${providerId}`);
    const fetched = await client.listModels();
    const custom = this.data.models.filter(
      (item) => item.providerId === providerId && item.isCustom,
    );
    const merged = new Map<string, AIModelDescriptor>();
    for (const model of fetched) {
      merged.set(model.id, { ...model, isCustom: false });
    }
    for (const model of custom) {
      if (!merged.has(model.id)) merged.set(model.id, model);
    }
    this.data.models = [
      ...this.data.models.filter((item) => item.providerId !== providerId),
      ...Array.from(merged.values()),
    ];
    this.save();
    return this.listModels(providerId);
  }

  registerCustomModel(input: {
    providerId: string;
    modelId: string;
    name?: string;
    capabilities?: AIModelCapability[];
  }): AIModelDescriptor {
    const provider = this.getProvider(input.providerId);
    if (!provider) throw new Error(`Provider not found: ${input.providerId}`);
    const modelId = String(input.modelId || "").trim();
    if (!modelId) throw new Error("modelId is required");
    const descriptor = toModelDescriptor(
      provider,
      modelId,
      input.name,
      true,
    );
    if (input.capabilities?.length) {
      descriptor.capabilities = input.capabilities;
    }
    this.data.models = this.data.models.filter(
      (item) => item.id !== descriptor.id,
    );
    this.data.models.push(descriptor);
    this.save();
    return { ...descriptor };
  }

  removeCustomModel(modelFullIdValue: string): boolean {
    const before = this.data.models.length;
    this.data.models = this.data.models.filter(
      (item) => !(item.id === modelFullIdValue && item.isCustom),
    );
    for (const role of ROLES) {
      if (this.data.roles[role] === modelFullIdValue) {
        delete this.data.roles[role];
      }
    }
    if (this.data.models.length === before) return false;
    this.save();
    return true;
  }

  getRoleBindings(): Record<AIModelRole, string | undefined> {
    return {
      main: this.data.roles.main,
      working: this.data.roles.working,
      vision: this.data.roles.vision,
    };
  }

  setRoleBinding(role: AIModelRole, modelFullIdValue: string | undefined): boolean {
    if (!ROLES.includes(role)) return false;
    if (!modelFullIdValue) {
      delete this.data.roles[role];
      this.save();
      return true;
    }
    const parsed = parseModelFullId(modelFullIdValue);
    if (!parsed) return false;
    if (!this.getModel(modelFullIdValue) && !this.getProvider(parsed.providerId)) {
      return false;
    }
    if (!this.getModel(modelFullIdValue)) {
      const provider = this.getProvider(parsed.providerId);
      if (!provider) return false;
      this.data.models.push(toModelDescriptor(provider, parsed.modelId));
    }
    this.data.roles[role] = modelFullIdValue;
    this.save();
    return true;
  }

  getDefaultInstanceName(): string | undefined {
    return this.data.defaultInstance;
  }

  setDefaultInstanceName(name: string | undefined): void {
    this.data.defaultInstance = name;
    this.save();
  }

  migrateFromChatBaseIfNeeded(): boolean {
    if (this.data.providers.length > 0) return false;
    const chatBasePath = path.join(process.cwd(), "config", "chat", "base.json");
    if (!fs.existsSync(chatBasePath)) return false;
    try {
      const parsed = JSON.parse(fs.readFileSync(chatBasePath, "utf-8"));
      const apiUrl = String(parsed?.apiUrl || "").trim();
      const apiKey = String(parsed?.apiKey || "").trim();
      if (!apiUrl || !apiKey) return false;

      const provider: AIProviderConfig = {
        id: "legacy",
        name: "Legacy Chat Config",
        protocol: "openai-chat",
        apiUrl,
        apiKey,
        enabled: true,
      };
      this.data.providers.push(provider);

      const models = [
        String(parsed?.model || "").trim(),
        String(parsed?.workingModel || "").trim(),
        String(parsed?.multimodalWorkingModel || "").trim(),
      ].filter(Boolean);
      const uniqueModels = Array.from(new Set(models));
      for (const modelId of uniqueModels) {
        this.data.models.push(toModelDescriptor(provider, modelId));
      }

      if (parsed?.model) {
        this.data.roles.main = modelFullId(provider.id, String(parsed.model).trim());
      }
      if (parsed?.workingModel) {
        this.data.roles.working = modelFullId(
          provider.id,
          String(parsed.workingModel).trim(),
        );
      }
      if (parsed?.multimodalWorkingModel) {
        this.data.roles.vision = modelFullId(
          provider.id,
          String(parsed.multimodalWorkingModel).trim(),
        );
      }
      this.data.defaultInstance = "main";
      this.save();
      return true;
    } catch {
      return false;
    }
  }
}
