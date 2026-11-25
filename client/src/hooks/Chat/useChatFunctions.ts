import { useMemo, useCallback } from 'react';
import { useStore } from 'jotai';
import { useTurns } from '@librechat/chat/react';
import type { ChatTurnsParams, TurnServices } from '@librechat/chat/react';
import type { TSubmission } from 'librechat-data-provider';
import type { SetStateAction } from 'react';
import { getParkhillProjectField } from '~/components/Parkhill/store';
import useTurnServices from './services';

export {
  getRegenerateTargetResponseMessage,
  getRegenerateSubmissionMessages,
  getPreliminaryRegenerateResponseMessageId,
} from '@librechat/chat';

/** The package's `useTurns` over the app's services: what `useChatHelpers` runs for a pane. */
export default function useChatFunctions({
  index = 0,
  ...params
}: Omit<ChatTurnsParams, 'index'> & { index?: number }) {
  const jotaiStore = useStore();
  const { setSubmission } = params;
  const services = useTurnServices({ index, ...params });

  /** Parkhill fork (CUSTOMIZATIONS.md §6): refuse a new chat's send until a project is chosen. */
  const gatedServices = useMemo<TurnServices>(
    () => ({
      ...services,
      canSubmit: (conversation) =>
        services.canSubmit?.(conversation) !== false &&
        getParkhillProjectField(jotaiStore, conversation?.conversationId ?? null) !== false,
    }),
    [services, jotaiStore],
  );

  /** Parkhill fork (CUSTOMIZATIONS.md §6): carry the choice to the server as `parkhillProject`. */
  const setProjectSubmission = useCallback(
    (value: SetStateAction<TSubmission | null>) => {
      if (value == null || typeof value === 'function' || value.endpointOption == null) {
        setSubmission(value);
        return;
      }
      const field = getParkhillProjectField(jotaiStore, value.conversation?.conversationId ?? null);
      setSubmission(
        field === false || field.parkhillProject == null
          ? value
          : { ...value, endpointOption: { ...value.endpointOption, ...field } },
      );
    },
    [setSubmission, jotaiStore],
  );

  return useTurns({ index, ...params, setSubmission: setProjectSubmission }, gatedServices);
}
