import { create } from 'zustand';

import type { VerbAction } from '../ecs/systems/verb.system';

export type CompletedVerbAction = VerbAction;

type VerbStoreState = {
  pendingActions: CompletedVerbAction[];
  enqueueAction: (action: CompletedVerbAction) => void;
  dequeueActions: () => CompletedVerbAction[];
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
    dequeueActions: (): CompletedVerbAction[] => {
      const actions = [...get().pendingActions];
      set({ pendingActions: [] });
      return actions;
    },
    clear: (): void => {
      set({ pendingActions: [] });
    },
  };
});

export const queueCompletedVerbAction = (action: CompletedVerbAction): void => {
  useVerbStore.getState().enqueueAction(action);
};

export const dequeueCompletedVerbActions = (): CompletedVerbAction[] => {
  return useVerbStore.getState().dequeueActions();
};
