import { create } from 'zustand';

import type { EventLogEntry, EventLogTone } from '../components/EventLog';
import { PHASE_TWO_EVENT_LOG_SEED } from '../data/cards/phase2.board';
import {
  FOUNDATION_TICK_RATE_HZ,
  bootDocksideSimulation,
  type DocksideSimulationHandle,
  type FoundationSnapshot,
} from '../ecs/world';
import type { VerbResolution } from '../ecs/systems/verb.system';
import { dequeueCompletedVerbActions } from './verbStore';

const MAX_STREET_WIRE_ENTRIES = 16;

type SimulationStatus = 'idle' | 'booting' | 'running' | 'error';

type GameStoreState = {
  status: SimulationStatus;
  tick: number;
  time: FoundationSnapshot['time'];
  jeffries: FoundationSnapshot['jeffries'];
  resources: FoundationSnapshot['resources'];
  streetWireEntries: EventLogEntry[];
  simulationError: string | null;
  startSimulation: () => Promise<void>;
  stopSimulation: () => void;
  addStreetWireLine: (line: string, tone: EventLogTone) => void;
  recordVerbResolution: (resolution: VerbResolution) => void;
};

let simulationHandle: DocksideSimulationHandle | null = null;
let bootInFlight: Promise<void> | null = null;
let queuedSnapshot: FoundationSnapshot | null = null;
let snapshotFrameToken: number | null = null;

const buildSeedStreetWire = (): EventLogEntry[] => {
  return PHASE_TWO_EVENT_LOG_SEED.map((seed, index): EventLogEntry => {
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
    snapshotFrameToken = null;

    if (queuedSnapshot === null) {
      return;
    }

    const snapshot = queuedSnapshot;
    queuedSnapshot = null;

    set({
      tick: snapshot.tick,
      time: snapshot.time,
      jeffries: snapshot.jeffries,
      resources: snapshot.resources,
    });
  };

  return {
    status: 'idle',
    tick: 0,
    time: defaultTime,
    jeffries: defaultJeffries,
    resources: defaultResources,
    streetWireEntries: buildSeedStreetWire(),
    simulationError: null,

    startSimulation: async (): Promise<void> => {
      if (simulationHandle !== null) {
        set({ status: 'running', simulationError: null });
        return;
      }

      if (bootInFlight !== null) {
        await bootInFlight;
        return;
      }

      set({ status: 'booting', simulationError: null });

      bootInFlight = (async (): Promise<void> => {
        try {
          simulationHandle = await bootDocksideSimulation({
            autoStart: true,
            tickRateHz: FOUNDATION_TICK_RATE_HZ,
            dequeueVerbActions: dequeueCompletedVerbActions,
            onVerbResolved: (resolution): void => {
              get().recordVerbResolution(resolution);
            },
            onTick: (snapshot): void => {
              queuedSnapshot = snapshot;

              if (snapshotFrameToken !== null) {
                return;
              }

              snapshotFrameToken = scheduleSnapshotFlush(flushQueuedSnapshot);
            },
          });

          set({ status: 'running', simulationError: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Simulation failed to start.';
          set({ status: 'error', simulationError: message });
          throw error;
        } finally {
          bootInFlight = null;
        }
      })();

      await bootInFlight;
    },

    stopSimulation: (): void => {
      if (snapshotFrameToken !== null) {
        cancelSnapshotFlush(snapshotFrameToken);
        snapshotFrameToken = null;
      }

      queuedSnapshot = null;

      if (simulationHandle !== null) {
        simulationHandle.stop();
        simulationHandle = null;
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
