import React from 'react';
import { createStore, Provider } from 'jotai';
import { renderHook } from '@testing-library/react';
import { Constants } from 'librechat-data-provider';
import type { ChatTurnsParams, TurnServices } from '@librechat/chat/react';
import type { TConversation, TSubmission } from 'librechat-data-provider';
import { projectChoiceAtom, projectPromptAtom, projectRequiredAtom } from '../store';
import useChatFunctions from '~/hooks/Chat/useChatFunctions';

/**
 * Guards the fork's hook in upstream `useChatFunctions.ts` (CUSTOMIZATIONS.md §6): since
 * v0.8.9 `ask()` lives in `@librechat/chat`, so the project gate rides on the wrapper's
 * `canSubmit` and `setSubmission`. If a merge drops either, these tests fail.
 */
const mockCaptured: { params?: ChatTurnsParams; services?: TurnServices } = {};
const mockBaseCanSubmit = jest.fn(() => true);

jest.mock('@librechat/chat', () => ({}));
jest.mock('@librechat/chat/react', () => ({
  useTurns: (params: ChatTurnsParams, services: TurnServices) => {
    mockCaptured.params = params;
    mockCaptured.services = services;
    return {};
  },
}));
jest.mock('~/hooks/Chat/services', () => ({
  __esModule: true,
  default: () => ({ canSubmit: mockBaseCanSubmit }),
}));

type JotaiStore = ReturnType<typeof createStore>;

const newConvo = { conversationId: Constants.NEW_CONVO } as TConversation;
const existingConvo = { conversationId: 'c1' } as TConversation;

function setup(store: JotaiStore) {
  const setSubmission = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  renderHook(() => useChatFunctions({ setSubmission } as unknown as ChatTurnsParams), {
    wrapper,
  });
  return setSubmission;
}

const submission = (conversationId: string | null) =>
  ({
    conversation: { conversationId },
    endpointOption: { endpoint: 'agents' },
  }) as unknown as TSubmission;

describe('useChatFunctions project gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBaseCanSubmit.mockReturnValue(true);
  });

  it('refuses a new chat while a project choice is required', () => {
    const store = createStore();
    store.set(projectRequiredAtom, true);
    setup(store);
    expect(mockCaptured.services?.canSubmit?.(newConvo)).toBe(false);
    expect(store.get(projectPromptAtom)).toBe(true);
  });

  it('allows existing chats and keeps upstream readiness checks', () => {
    const store = createStore();
    store.set(projectRequiredAtom, true);
    setup(store);
    expect(mockCaptured.services?.canSubmit?.(existingConvo)).toBe(true);
    mockBaseCanSubmit.mockReturnValue(false);
    expect(mockCaptured.services?.canSubmit?.(existingConvo)).toBe(false);
  });

  it('adds the chosen project number to a new chat submission', () => {
    const store = createStore();
    store.set(projectChoiceAtom, { number: '2401.00', name: 'Main St Bridge' });
    const setSubmission = setup(store);
    expect(mockCaptured.services?.canSubmit?.(newConvo)).toBe(true);
    mockCaptured.params?.setSubmission(submission(null));
    expect(setSubmission.mock.calls[0][0].endpointOption).toEqual({
      endpoint: 'agents',
      parkhillProject: '2401.00',
    });
  });

  it("sends 'none' for an explicit No project", () => {
    const store = createStore();
    store.set(projectChoiceAtom, 'none');
    const setSubmission = setup(store);
    mockCaptured.params?.setSubmission(submission(null));
    expect(setSubmission.mock.calls[0][0].endpointOption.parkhillProject).toBe('none');
  });

  it('leaves existing-chat submissions and clears untouched', () => {
    const store = createStore();
    store.set(projectChoiceAtom, 'none');
    const setSubmission = setup(store);
    const existing = submission('c1');
    mockCaptured.params?.setSubmission(existing);
    mockCaptured.params?.setSubmission(null);
    expect(setSubmission.mock.calls[0][0]).toBe(existing);
    expect(setSubmission.mock.calls[1][0]).toBeNull();
  });
});
