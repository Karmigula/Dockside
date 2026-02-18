import { create } from 'zustand';

import type { EventLogEntry, EventLogTone } from '../components/EventLog';
import { FOUNDATION_EVENT_LOG_SEED } from '../data/cards/phase2.board';
import {
  FOUNDATION_TICK_RATE_HZ,
  bootDocksideSimulation,
  type DocksideSimulationHandle,
  type FoundationSnapshot,
} from '../ecs/world';
import type { VerbResolution } from '../ecs/systems/verb.system';
import { acknowledgeCompletedVerbActions, peekCompletedVerbActions } from './verbStore';

const MAX_STREET_WIRE_ENTRIES = 16;

type SimulationStatus = 'idle' | 'booting' | 'running' | 'error';

type GameStoreState = {
  status: SimulationStatus;
  tick: number;
  time: FoundationSnapshot['time'];
  jeffries: FoundationSnapshot['jeffries'];
  resources: FoundationSnapshot['resources'];
  boardCards: FoundationSnapshot['boardCards'];
  streetWireEntries: EventLogEntry[];
  simulationError: string | null;
  startSimulation: () => Promise<void>;
  stopSimulation: () => void;
  addStreetWireLine: (line: string, tone: EventLogTone) => void;
  recordVerbResolution: (resolution: VerbResolution) => void;
};

type GameStoreSingleton = {
  simulationHandle: DocksideSimulationHandle | null;
  bootInFlight: Promise<void> | null;
  queuedSnapshot: FoundationSnapshot | null;
  snapshotFrameToken: number | null;
  inflightVerbActionIds: string[];
  resolvedVerbActionIds: Set<string>;
};

const GAME_STORE_SINGLETON_KEY = '__dockside_game_store_singleton__';

type GlobalWithGameStoreSingleton = typeof globalThis & {
  [GAME_STORE_SINGLETON_KEY]?: GameStoreSingleton;
};

const getGameStoreSingleton = (): GameStoreSingleton => {
  const globalWithSingleton = globalThis as GlobalWithGameStoreSingleton;

  if (globalWithSingleton[GAME_STORE_SINGLETON_KEY] === undefined) {
    globalWithSingleton[GAME_STORE_SINGLETON_KEY] = {
      simulationHandle: null,
      bootInFlight: null,
      queuedSnapshot: null,
      snapshotFrameToken: null,
      inflightVerbActionIds: [],
      resolvedVerbActionIds: new Set<string>(),
    };
  }

  return globalWithSingleton[GAME_STORE_SINGLETON_KEY];
};

const singleton = getGameStoreSingleton();

const buildSeedStreetWire = (): EventLogEntry[] => {
  return FOUNDATION_EVENT_LOG_SEED.map((seed, index): EventLogEntry => {
    const minute = index + 1;

    return {
      id: seed.id,
      tone: seed.tone,
      line: seed.line,
      stampedAt: `08:0${minute}`,
    };
  });
};

const defaultTime: FoundationSnapshot['time'] = {
  totalTicks: 0,
  shift: 1,
  day: 1,
  week: 1,
  year: 1986,
};

const defaultJeffries: FoundationSnapshot['jeffries'] = {
  cash: 0,
  localHeat: 0,
  federalHeat: 0,
  fear: 0,
  respect: 0,
};

const defaultResources: FoundationSnapshot['resources'] = {
  cash: 0,
  muscle: 0,
  intel: 0,
  favors: 0,
  evidence: 0,
  cleanCash: 0,
  gingaPoints: 0,
};

const defaultBoardCards: FoundationSnapshot['boardCards'] = [];

const formatClockStamp = (): string => {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const prependStreetWire = (entries: readonly EventLogEntry[], entry: EventLogEntry): EventLogEntry[] => {
  return [entry, ...entries].slice(0, MAX_STREET_WIRE_ENTRIES);
};

const scheduleSnapshotFlush = (flush: () => void): number => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(flush);
  }

  return Number(globalThis.setTimeout(flush, 16));
};

const cancelSnapshotFlush = (token: number): void => {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(token);
    return;
  }

  globalThis.clearTimeout(token);
};

export const useGameStore = create<GameStoreState>((set, get) => {
  const flushQueuedSnapshot = (): void => {
    singleton.snapshotFrameToken = null;

    if (singleton.queuedSnapshot === null) {
      return;
    }

    const snapshot = singleton.queuedSnapshot;
    singleton.queuedSnapshot = null;

    set({
      tick: snapshot.tick,
      time: snapshot.time,
      jeffries: snapshot.jeffries,
      resources: snapshot.resources,
      boardCards: snapshot.boardCards,
    });
  };

  return {
    status: 'idle',
    tick: 0,
    time: defaultTime,
    jeffries: defaultJeffries,
    resources: defaultResources,
    boardCards: defaultBoardCards,
    streetWireEntries: buildSeedStreetWire(),
    simulationError: null,

    startSimulation: async (): Promise<void> => {
      if (singleton.simulationHandle !== null) {
        set({ status: 'running', simulationError: null });
        return;
      }

      if (singleton.bootInFlight !== null) {
        await singleton.bootInFlight;
        return;
      }

      set({ status: 'booting', simulationError: null });

      singleton.bootInFlight = (async (): Promise<void> => {
        try {
          singleton.simulationHandle = await bootDocksideSimulation({
            autoStart: true,
            tickRateHz: FOUNDATION_TICK_RATE_HZ,
            dequeueVerbActions: (): ReturnType<typeof peekCompletedVerbActions> => {
              if (singleton.inflightVerbActionIds.length > 0) {
                return [];
              }

              const pendingActions = peekCompletedVerbActions();

              if (pendingActions.length === 0) {
                return [];
              }

              singleton.inflightVerbActionIds = pendingActions.map((action): string => {
                return action.id;
              });
              singleton.resolvedVerbActionIds.clear();

              return pendingActions;
            },
            onVerbResolved: (resolution): void => {
              if (singleton.inflightVerbActionIds.length > 0) {
                singleton.resolvedVerbActionIds.add(resolution.actionId);

                const allResolved = singleton.inflightVerbActionIds.every((actionId): boolean => {
                  return singleton.resolvedVerbActionIds.has(actionId);
                });

                if (allResolved) {
                  acknowledgeCompletedVerbActions(singleton.inflightVerbActionIds);
                  singleton.inflightVerbActionIds = [];
                  singleton.resolvedVerbActionIds.clear();
                }
              }

              get().recordVerbResolution(resolution);
            },
            onTick: (snapshot): void => {
              singleton.queuedSnapshot = snapshot;

              if (singleton.snapshotFrameToken !== null) {
                return;
              }

              singleton.snapshotFrameToken = scheduleSnapshotFlush(flushQueuedSnapshot);
            },
          });

          set({
            status: 'running',
            simulationError: null,
            streetWireEntries: [],
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Simulation failed to start.';
          set({ status: 'error', simulationError: message });
          throw error;
        } finally {
          singleton.bootInFlight = null;
        }
      })();

      await singleton.bootInFlight;
    },

    stopSimulation: (): void => {
      if (singleton.snapshotFrameToken !== null) {
        cancelSnapshotFlush(singleton.snapshotFrameToken);
        singleton.snapshotFrameToken = null;
      }

      singleton.queuedSnapshot = null;
      singleton.inflightVerbActionIds = [];
      singleton.resolvedVerbActionIds.clear();

      if (singleton.simulationHandle !== null) {
        singleton.simulationHandle.stop();
        singleton.simulationHandle = null;
      }

      set({ status: 'idle' });
    },

    addStreetWireLine: (line, tone): void => {
      set((state): Pick<GameStoreState, 'streetWireEntries'> => {
        const entry: EventLogEntry = {
          id: `wire-${Date.now()}`,
          tone,
          line,
          stampedAt: formatClockStamp(),
        };

        return {
          streetWireEntries: prependStreetWire(state.streetWireEntries, entry),
        };
      });
    },

    recordVerbResolution: (resolution): void => {
      set((state): Pick<GameStoreState, 'streetWireEntries'> => {
        const entry: EventLogEntry = {
          id: resolution.id,
          tone: resolution.tone,
          line: resolution.line,
          stampedAt: formatClockStamp(),
        };

        return {
          streetWireEntries: prependStreetWire(state.streetWireEntries, entry),
        };
      });
    },
  };
});
