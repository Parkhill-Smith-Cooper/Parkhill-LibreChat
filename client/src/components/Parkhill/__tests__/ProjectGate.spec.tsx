import React from 'react';
import { createStore, Provider } from 'jotai';
import { Constants, request } from 'librechat-data-provider';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import {
  projectChoiceAtom,
  projectPromptAtom,
  projectRequiredAtom,
  getParkhillProjectField,
} from '../store';
import ProjectGate, { useProjectGate } from '../ProjectGate';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const PROJECTS = [
  { number: '2401.00', name: 'Main St Bridge' },
  { number: '2402.00', name: 'Harbor Park' },
];

type JotaiStore = ReturnType<typeof createStore>;

function Harness({ owner = true, isNew = true }: { owner?: boolean; isNew?: boolean }) {
  const gate = useProjectGate(owner, isNew);
  return (
    <>
      <span data-testid="blocked">{String(gate.blocked)}</span>
      {gate.visible ? <ProjectGate gate={gate} /> : null}
    </>
  );
}

function renderGate(store: JotaiStore, props: { owner?: boolean; isNew?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (p: typeof props) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <Harness {...p} />
      </Provider>
    </QueryClientProvider>
  );
  const result = render(ui(props));
  return { ...result, rerenderWith: (p: typeof props) => result.rerender(ui(p)) };
}

const httpError = (status?: number) =>
  Object.assign(new Error('request failed'), status ? { response: { status } } : {});

describe('getParkhillProjectField', () => {
  it('does not apply to existing conversations', () => {
    const store = createStore();
    store.set(projectRequiredAtom, true);
    expect(getParkhillProjectField(store, 'abc')).toEqual({});
  });

  it('refuses a new chat without a choice while required and flags the prompt', () => {
    const store = createStore();
    store.set(projectRequiredAtom, true);
    expect(getParkhillProjectField(store, Constants.NEW_CONVO)).toBe(false);
    expect(store.get(projectPromptAtom)).toBe(true);
  });

  it('sends the project number or "none"', () => {
    const store = createStore();
    store.set(projectRequiredAtom, true);
    store.set(projectChoiceAtom, PROJECTS[0]);
    expect(getParkhillProjectField(store, null)).toEqual({ parkhillProject: '2401.00' });
    store.set(projectChoiceAtom, 'none');
    expect(getParkhillProjectField(store, Constants.NEW_CONVO)).toEqual({
      parkhillProject: 'none',
    });
  });

  it('allows sending when the feature is not required', () => {
    expect(getParkhillProjectField(createStore(), Constants.NEW_CONVO)).toEqual({});
  });
});

describe('ProjectGate', () => {
  let getSpy: jest.SpyInstance;

  beforeEach(() => {
    getSpy = jest.spyOn(request, 'get');
  });

  afterEach(() => {
    getSpy.mockRestore();
  });

  it('blocks a new chat while loading, then until a choice is made', async () => {
    getSpy.mockResolvedValue({ enabled: true, projects: PROJECTS });
    const store = createStore();
    renderGate(store);

    expect(screen.getByText('com_parkhill_projects_loading')).toBeInTheDocument();
    expect(store.get(projectRequiredAtom)).toBe(true);
    await waitFor(() =>
      expect(screen.queryByText('com_parkhill_projects_loading')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('blocked')).toHaveTextContent('true');

    act(() => store.set(projectChoiceAtom, 'none'));
    expect(screen.getByTestId('blocked')).toHaveTextContent('false');
    expect(screen.getByText('com_parkhill_no_project')).toBeInTheDocument();
  });

  it('shows why a send was refused', async () => {
    getSpy.mockResolvedValue({ enabled: true, projects: PROJECTS });
    const store = createStore();
    renderGate(store);
    await waitFor(() => expect(screen.getByTestId('blocked')).toHaveTextContent('true'));

    act(() => {
      getParkhillProjectField(store, Constants.NEW_CONVO);
    });
    expect(screen.getByRole('status')).toHaveTextContent('com_parkhill_project_required');
  });

  it('renders nothing and never blocks when the feature is off', async () => {
    getSpy.mockResolvedValue({ enabled: false, projects: [] });
    const store = createStore();
    renderGate(store);
    await waitFor(() => expect(store.get(projectRequiredAtom)).toBe(false));
    expect(screen.queryByTestId('parkhill-project-gate')).not.toBeInTheDocument();
    expect(screen.getByTestId('blocked')).toHaveTextContent('false');
  });

  it('fails open when the endpoint is unreachable', async () => {
    getSpy.mockRejectedValue(httpError());
    const store = createStore();
    renderGate(store);
    await waitFor(() => expect(store.get(projectRequiredAtom)).toBe(false));
    expect(screen.queryByTestId('parkhill-project-gate')).not.toBeInTheDocument();
  });

  it('keeps the gate with "No project" and a retry when the list is unavailable', async () => {
    getSpy.mockRejectedValue(httpError(503));
    const store = createStore();
    renderGate(store);
    expect(await screen.findByText('com_parkhill_projects_unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_retry' })).toBeInTheDocument();
    expect(store.get(projectRequiredAtom)).toBe(true);
  });

  it('does not show on an existing conversation and clears the draft choice', async () => {
    getSpy.mockResolvedValue({ enabled: true, projects: PROJECTS });
    const store = createStore();
    const { rerenderWith } = renderGate(store);
    await waitFor(() => expect(screen.getByTestId('blocked')).toHaveTextContent('true'));
    act(() => store.set(projectChoiceAtom, PROJECTS[1]));

    rerenderWith({ isNew: false });
    expect(screen.queryByTestId('parkhill-project-gate')).not.toBeInTheDocument();
    expect(store.get(projectChoiceAtom)).toBeNull();
    expect(store.get(projectRequiredAtom)).toBe(false);
  });

  it('lets a secondary composer leave the shared choice alone', async () => {
    getSpy.mockResolvedValue({ enabled: true, projects: PROJECTS });
    const store = createStore();
    store.set(projectChoiceAtom, PROJECTS[0]);
    renderGate(store, { owner: false, isNew: false });
    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    expect(store.get(projectChoiceAtom)).toEqual(PROJECTS[0]);
  });
});
