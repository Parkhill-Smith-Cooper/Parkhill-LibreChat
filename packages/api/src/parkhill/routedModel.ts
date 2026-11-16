/**
 * Parkhill fork: bill "Auto" chats under the model LiteLLM actually picked.
 *
 * The `LiteLLM` custom endpoint exposes one model, `auto`, which LiteLLM's
 * complexity router sends to a real model per prompt. LibreChat tags usage with
 * the model it *requested*, so every Auto call was recorded as `auto` and priced
 * at the default rate. With `return_raw_model_name: true` in litellm.yaml, the
 * response's `model` (LangChain `response_metadata.model_name`) is the resolved
 * model; this swaps it in for router aliases only.
 *
 * Hooked in one place: `ModelEndHandler` in api/server/controllers/agents/callbacks.js.
 * Fail-open: anything unexpected returns the usage unchanged.
 */

const DEFAULT_ROUTED_MODELS = ['auto'];

/** Router aliases whose usage should be re-tagged (`PARKHILL_ROUTED_MODELS`, comma list). */
export function getRoutedModelAliases(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.PARKHILL_ROUTED_MODELS;
  const list = raw
    ? raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_ROUTED_MODELS;
  return new Set(list.length ? list : DEFAULT_ROUTED_MODELS);
}

/** "anthropic/claude-sonnet-5" -> "claude-sonnet-5" */
function stripProviderPrefix(model: string): string {
  const slash = model.lastIndexOf('/');
  return slash > -1 ? model.slice(slash + 1) : model;
}

type RoutedOutput = { response_metadata?: { model_name?: unknown } | null } | null | undefined;

export function resolveRoutedModel<T extends { model?: unknown }>(
  usage: T,
  output: RoutedOutput,
  env: NodeJS.ProcessEnv = process.env,
): T {
  try {
    if (!usage || typeof usage.model !== 'string') {
      return usage;
    }
    const aliases = getRoutedModelAliases(env);
    if (!aliases.has(usage.model.trim().toLowerCase())) {
      return usage;
    }
    const reported = output?.response_metadata?.model_name;
    if (typeof reported !== 'string') {
      return usage;
    }
    const resolved = stripProviderPrefix(reported.trim());
    if (!resolved || aliases.has(resolved.toLowerCase())) {
      return usage;
    }
    return { ...usage, model: resolved };
  } catch {
    return usage;
  }
}
