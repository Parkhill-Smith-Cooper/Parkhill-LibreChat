import { atom } from 'jotai';
import { Constants } from 'librechat-data-provider';
import type { useStore } from 'jotai';

/** Parkhill fork: the official project chosen for the new-chat draft. */
export type ParkhillProject = { number: string; name: string };
export type ProjectChoice = ParkhillProject | 'none' | null;

/** Wire value for an explicit "No project" (matches the server's `NO_PROJECT`). */
export const NO_PROJECT = 'none';

export const projectChoiceAtom = atom<ProjectChoice>(null);
/** True while the new-chat composer requires a choice (feature on, list loading or listed). */
export const projectRequiredAtom = atom(false);
/** Set when a send was refused for lack of a choice, so the gate can say why. */
export const projectPromptAtom = atom(false);

type JotaiStore = ReturnType<typeof useStore>;

/**
 * Request field for the first message of a new conversation. Returns `false`
 * to refuse the send while a choice is still required; `{}` when it does not apply.
 */
export function getParkhillProjectField(
  store: JotaiStore,
  conversationId: string | null,
): false | { parkhillProject?: string } {
  if (conversationId != null && conversationId !== Constants.NEW_CONVO) {
    return {};
  }
  const choice = store.get(projectChoiceAtom);
  if (choice === 'none') {
    return { parkhillProject: NO_PROJECT };
  }
  if (choice != null) {
    return { parkhillProject: choice.number };
  }
  if (store.get(projectRequiredAtom)) {
    store.set(projectPromptAtom, true);
    return false;
  }
  return {};
}
