import type { AIProtocol, AIProviderConfig, ProviderClient } from "../types";
import { AnthropicProvider } from "./anthropic";
import { DEFAULT_API_URLS } from "./base";
import { GeminiProvider } from "./gemini";
import { OpenAIChatProvider } from "./openai-chat";
import { OpenAIResponseProvider } from "./openai-response";

export function createProviderClient(
  provider: AIProviderConfig,
): ProviderClient {
  switch (provider.protocol) {
    case "openai-chat":
      return new OpenAIChatProvider(provider);
    case "openai-response":
      return new OpenAIResponseProvider(provider);
    case "anthropic":
      return new AnthropicProvider(provider);
    case "gemini":
      return new GeminiProvider(provider);
    default: {
      const _exhaustive: never = provider.protocol;
      throw new Error(`Unsupported AI protocol: ${_exhaustive}`);
    }
  }
}

export function defaultApiUrl(protocol: AIProtocol): string {
  return DEFAULT_API_URLS[protocol];
}

export {
  AnthropicProvider,
  GeminiProvider,
  OpenAIChatProvider,
  OpenAIResponseProvider,
};
