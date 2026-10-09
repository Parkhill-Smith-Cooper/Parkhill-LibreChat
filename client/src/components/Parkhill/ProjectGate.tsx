import { useEffect, useMemo } from 'react';
import { Ban, Briefcase } from 'lucide-react';
import { ControlCombobox } from '@librechat/client';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { OptionWithIcon } from '~/common';
import type { ParkhillProject } from './store';
import { NO_PROJECT, projectChoiceAtom, projectPromptAtom, projectRequiredAtom } from './store';
import { isProjectsUnavailable, useParkhillProjectsQuery } from './queries';
import { useLocalize } from '~/hooks';

const HELP_ID = 'parkhill-project-help';
const EMPTY: ParkhillProject[] = [];

export type ProjectGateState = {
  /** Render the picker: feature on (or its state still loading) on a new chat. */
  visible: boolean;
  /** The draft can't be sent until a project or "No project" is chosen. */
  blocked: boolean;
  loading: boolean;
  unavailable: boolean;
  projects: ParkhillProject[];
  retry: () => void;
};

/**
 * Parkhill fork: decides whether the new-chat composer must ask for a project.
 * Only the primary composer (`owner`) writes the shared atoms, so an added
 * multi-convo pane can't clear its choice. Fails open: an unreachable endpoint
 * (or the feature turned off) never blocks sending; a 503 from an enabled
 * server keeps the gate, with "No project" available.
 */
export function useProjectGate(owner: boolean, isNewConversation: boolean): ProjectGateState {
  const query = useParkhillProjectsQuery();
  const choice = useAtomValue(projectChoiceAtom);
  const setChoice = useSetAtom(projectChoiceAtom);
  const setPrompt = useSetAtom(projectPromptAtom);
  const setRequired = useSetAtom(projectRequiredAtom);

  const unavailable = isProjectsUnavailable(query.error);
  const loading = query.isLoading;
  const visible =
    owner && isNewConversation && (loading || unavailable || query.data?.enabled === true);

  useEffect(() => {
    if (owner) {
      setRequired(visible);
    }
  }, [owner, visible, setRequired]);

  /** Each new chat asks again: clear the draft's choice once it stops being a new chat. */
  useEffect(() => {
    if (!owner || isNewConversation) {
      return;
    }
    setChoice(null);
    setPrompt(false);
  }, [owner, isNewConversation, setChoice, setPrompt]);

  useEffect(() => {
    if (!owner) {
      return;
    }
    return () => {
      setRequired(false);
      setChoice(null);
      setPrompt(false);
    };
  }, [owner, setRequired, setChoice, setPrompt]);

  return {
    visible,
    blocked: visible && choice == null,
    loading,
    unavailable,
    projects: query.data?.projects ?? EMPTY,
    retry: () => {
      query.refetch();
    },
  };
}

const projectLabel = (project: ParkhillProject) => `${project.number} · ${project.name}`;

export default function ProjectGate({ gate }: { gate: ProjectGateState }) {
  const localize = useLocalize();
  const [choice, setChoice] = useAtom(projectChoiceAtom);
  const [prompt, setPrompt] = useAtom(projectPromptAtom);

  const byNumber = useMemo(
    () => new Map(gate.projects.map((project) => [project.number, project])),
    [gate.projects],
  );
  const items = useMemo<OptionWithIcon[]>(
    () => [
      {
        value: NO_PROJECT,
        label: localize('com_parkhill_no_project'),
        icon: <Ban className="h-4 w-4 text-text-secondary" aria-hidden="true" />,
      },
      ...gate.projects.map((project) => ({
        value: project.number,
        label: projectLabel(project),
        icon: <Briefcase className="h-4 w-4 text-text-secondary" aria-hidden="true" />,
      })),
    ],
    [gate.projects, localize],
  );

  let displayValue = localize('com_parkhill_choose_project');
  if (choice === 'none') {
    displayValue = localize('com_parkhill_no_project');
  } else if (choice != null) {
    displayValue = projectLabel(choice);
  }

  let help: { text: string; warn: boolean } | null = null;
  if (gate.unavailable) {
    help = { text: localize('com_parkhill_projects_unavailable'), warn: true };
  } else if (gate.loading) {
    help = { text: localize('com_parkhill_projects_loading'), warn: false };
  } else if (prompt && choice == null) {
    help = { text: localize('com_parkhill_project_required'), warn: true };
  }

  useEffect(() => {
    if (choice != null) {
      setPrompt(false);
    }
  }, [choice, setPrompt]);

  return (
    <div className="mt-2 flex w-full min-w-0 flex-col gap-1" data-testid="parkhill-project-gate">
      <ControlCombobox
        selectId="parkhill-project-select"
        selectedValue={choice === 'none' ? NO_PROJECT : (choice?.number ?? '')}
        displayValue={displayValue}
        items={items}
        setValue={(value) => {
          if (value === NO_PROJECT) {
            setChoice('none');
            return;
          }
          const project = byNumber.get(value);
          if (project) {
            setChoice(project);
          }
        }}
        SelectIcon={<Briefcase className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />}
        ariaLabel={localize('com_parkhill_choose_project')}
        ariaInvalid={prompt && choice == null}
        ariaDescribedBy={help ? HELP_ID : undefined}
        searchPlaceholder={localize('com_parkhill_search_projects')}
        isCollapsed={false}
        showCarat={true}
        placement="bottom-start"
        gutter={6}
        matchTriggerWidth={true}
        unsearchedLimit={50}
        containerClassName="w-full min-w-0 px-0"
        className="h-11 w-full gap-2 rounded-2xl border border-border-light bg-surface-secondary px-4 text-sm font-medium text-text-primary hover:bg-surface-hover"
        popoverClassName="rounded-2xl shadow-xl"
      />
      {help || gate.unavailable ? (
        <div className="flex flex-wrap items-center gap-2 px-2">
          {help ? (
            <span
              id={HELP_ID}
              role="status"
              aria-live="polite"
              className={help.warn ? 'text-xs text-text-warning' : 'text-xs text-text-secondary'}
            >
              {help.text}
            </span>
          ) : null}
          {gate.unavailable ? (
            <button
              type="button"
              onClick={gate.retry}
              className="rounded-full px-2 py-1 text-xs text-text-secondary outline-none hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-text-primary"
            >
              {localize('com_ui_retry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
