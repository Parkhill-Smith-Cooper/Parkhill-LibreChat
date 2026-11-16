/**
 * Parkhill fork guard (CUSTOMIZATIONS.md §11): Auto chats must be billed under the
 * model LiteLLM picked, not "auto". If an upstream merge drops the
 * `resolveRoutedModel` line from ModelEndHandler, this fails. Keep ours.
 */
jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));
jest.mock('@librechat/api', () => {
  const { getModelRefusalInfo, resolveRoutedModel } = jest.requireActual('@librechat/api');
  return {
    sendEvent: jest.fn(),
    emitEvent: jest.fn(),
    createToolExecuteHandler: jest.fn(),
    markSummarizationUsage: (usage) => usage,
    getModelRefusalInfo,
    resolveRoutedModel,
  };
});
jest.mock('~/server/services/Files/Citations', () => ({
  processFileCitations: jest.fn(),
}));
jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
  runPreviewFinalize: jest.fn(),
}));
jest.mock('~/server/services/Files/process', () => ({
  saveBase64Image: jest.fn(),
}));

const { ModelEndHandler } = require('../callbacks');

const graph = {
  getAgentContext: () => ({ provider: 'LiteLLM', clientOptions: { model: 'auto' } }),
};

const endEvent = (model_name) => ({
  output: {
    usage_metadata: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    response_metadata: { model_name },
  },
});

describe('Parkhill: ModelEndHandler bills Auto under the routed model', () => {
  it('records the model LiteLLM reports for an Auto call', async () => {
    const collectedUsage = [];
    const emitUsage = jest.fn();
    const handler = new ModelEndHandler(collectedUsage, null, emitUsage);

    await handler.handle(
      'on_chat_model_end',
      endEvent('claude-sonnet-5'),
      { ls_model_name: 'auto', user_id: 'u1' },
      graph,
    );

    expect(collectedUsage).toHaveLength(1);
    expect(collectedUsage[0].model).toBe('claude-sonnet-5');
    expect(emitUsage).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-5' }));
  });

  it('keeps the requested model for non-router endpoints', async () => {
    const collectedUsage = [];
    const handler = new ModelEndHandler(collectedUsage);

    await handler.handle(
      'on_chat_model_end',
      endEvent('gpt-5.5-2026-04-23'),
      { ls_model_name: 'gpt-5.5', user_id: 'u1' },
      graph,
    );

    expect(collectedUsage[0].model).toBe('gpt-5.5');
  });
});
