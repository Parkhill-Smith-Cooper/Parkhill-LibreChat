import { getRoutedModelAliases, resolveRoutedModel } from './routedModel';

const usage = { input_tokens: 10, output_tokens: 5, model: 'auto', provider: 'LiteLLM' };
const out = (model_name?: unknown) => ({ response_metadata: { model_name } });
const env = {} as NodeJS.ProcessEnv;

describe('resolveRoutedModel (Parkhill: bill Auto under the picked model)', () => {
  it('re-tags an Auto call with the model LiteLLM reports', () => {
    expect(resolveRoutedModel(usage, out('claude-sonnet-5'), env)).toEqual({
      ...usage,
      model: 'claude-sonnet-5',
    });
  });

  it('keeps dated ids and strips a provider prefix', () => {
    expect(resolveRoutedModel(usage, out('anthropic/claude-opus-5-20261001'), env).model).toBe(
      'claude-opus-5-20261001',
    );
  });

  it('matches the alias case-insensitively', () => {
    expect(resolveRoutedModel({ ...usage, model: 'Auto' }, out('gpt-5.4-mini'), env).model).toBe(
      'gpt-5.4-mini',
    );
  });

  it('leaves non-router models alone, even if the response names another model', () => {
    const direct = { ...usage, model: 'gpt-5.5' };
    expect(resolveRoutedModel(direct, out('gpt-5.5-2026-04-23'), env)).toBe(direct);
  });

  it('leaves usage unchanged when LiteLLM echoes the alias or reports nothing', () => {
    expect(resolveRoutedModel(usage, out('auto'), env)).toBe(usage);
    expect(resolveRoutedModel(usage, out(''), env)).toBe(usage);
    expect(resolveRoutedModel(usage, out(undefined), env)).toBe(usage);
    expect(resolveRoutedModel(usage, out(42), env)).toBe(usage);
    expect(resolveRoutedModel(usage, { response_metadata: null }, env)).toBe(usage);
    expect(resolveRoutedModel(usage, undefined, env)).toBe(usage);
  });

  it('never throws on odd input', () => {
    const noModel = { input_tokens: 1 } as { input_tokens: number; model?: unknown };
    expect(resolveRoutedModel(noModel, out('claude-sonnet-5'), env)).toBe(noModel);
    expect(resolveRoutedModel(null as never, out('claude-sonnet-5'), env)).toBeNull();
  });

  it('reads extra router aliases from PARKHILL_ROUTED_MODELS', () => {
    const custom = { PARKHILL_ROUTED_MODELS: 'auto, smart-router' } as NodeJS.ProcessEnv;
    expect([...getRoutedModelAliases(custom)]).toEqual(['auto', 'smart-router']);
    expect(
      resolveRoutedModel({ ...usage, model: 'smart-router' }, out('gpt-5.4-mini'), custom).model,
    ).toBe('gpt-5.4-mini');
    expect([
      ...getRoutedModelAliases({ PARKHILL_ROUTED_MODELS: ' , ' } as NodeJS.ProcessEnv),
    ]).toEqual(['auto']);
  });
});
