import { create } from 'zustand';

import type { VerbAction } from '../ecs/systems/verb.system';

export type CompletedVerbAction = VerbAction;

type VerbStoreState = {
  pendingActions: CompletedVerbAction[];
  enqueueAction: (action: CompletedVerbAction) => void;
  peekActions: () => CompletedVerbAction[];
  acknowledgeActions: (actionIds: readonly string[]) => void;
  clear: () => void;
};

export const useVerbStore = create<VerbStoreState>((set, get) => {
  return {
    pendingActions: [],
    enqueueAction: (action): void => {
      set((state): Pick<VerbStoreState, 'pendingActions'> => {
        return {
          pendingActions: [...state.pendingActions, action],
        };
      });
    },
    peekActions: (): CompletedVerbAction[] => {
      return [...get().pendingActions];
    },
    acknowledgeActions: (actionIds): void => {
      if (actionIds.length === 0) {
        return;
      }

      const acknowledged = new Set(actionIds);

      set((state): Pick<VerbStoreState, 'pendingActions'> => {
        // Assumption: enqueue/acknowledge run on the same JS thread (no worker concurrency).
        // Under this model, actions enqueued after a peek are preserved unless explicitly acknowledged.
        return {
          pendingActions: state.pendingActions.filter((action): boolean => {
            return !acknowledged.has(action.id);
          }),
        };
      });
    },
    clear: (): void => {
      set({ pendingActions: [] });
    },
  };
});

export const queueCompletedVerbAction = (action: CompletedVerbAction): void => {
  useVerbStore.getState().enqueueAction(action);
};

export const peekCompletedVerbActions = (): CompletedVerbAction[] => {
  return useVerbStore.getState().peekActions();
};

export const acknowledgeCompletedVerbActions = (actionIds: readonly string[]): void => {
  useVerbStore.getState().acknowledgeActions(actionIds);
};
