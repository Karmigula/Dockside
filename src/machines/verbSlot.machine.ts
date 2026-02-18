import { assign, setup } from 'xstate';

import type { ActiveVerbSlotId } from '../data/cards/phase2.board';

type VerbSlotMachineInput = {
  slotId: ActiveVerbSlotId;
  durationMs: number;
  cooldownMs?: number;
};

type VerbSlotMachineContext = {
  slotId: ActiveVerbSlotId;
  durationMs: number;
  remainingMs: number;
  cooldownMs: number;
  queuedCardId: string | null;
  queuedCardTitle: string | null;
};

type VerbSlotMachineEvent =
  | { type: 'DROP_CARD'; cardId: string; cardTitle: string }
  | { type: 'RESET' };

const SLOT_TICK_MS = 120;

const resetContext = (context: VerbSlotMachineContext): VerbSlotMachineContext => {
  return {
    ...context,
    remainingMs: context.durationMs,
    queuedCardId: null,
    queuedCardTitle: null,
  };
};

export const createVerbSlotMachine = (input: VerbSlotMachineInput) => {
  const cooldownMs = input.cooldownMs ?? 700;

  return setup({
    types: {
      context: {} as VerbSlotMachineContext,
      events: {} as VerbSlotMachineEvent,
    },
    delays: {
      slotTick: SLOT_TICK_MS,
      cooldownDelay: ({ context }): number => {
        return context.cooldownMs;
      },
    },
  }).createMachine({
    id: `verb-slot-${input.slotId}`,
    context: {
      slotId: input.slotId,
      durationMs: input.durationMs,
      remainingMs: input.durationMs,
      cooldownMs,
      queuedCardId: null,
      queuedCardTitle: null,
    },
    initial: 'idle',
    states: {
      idle: {
        on: {
          DROP_CARD: {
            target: 'running',
            actions: assign(({ context, event }): VerbSlotMachineContext => {
              return {
                ...context,
                queuedCardId: event.cardId,
                queuedCardTitle: event.cardTitle,
                remainingMs: context.durationMs,
              };
            }),
          },
          RESET: {
            actions: assign(({ context }): VerbSlotMachineContext => {
              return resetContext(context);
            }),
          },
        },
      },
      running: {
        after: {
          slotTick: [
            {
              guard: ({ context }): boolean => {
                return context.remainingMs <= SLOT_TICK_MS;
              },
              target: 'cooldown',
              actions: assign(({ context }): VerbSlotMachineContext => {
                return {
                  ...context,
                  remainingMs: 0,
                };
              }),
            },
            {
              target: 'running',
              actions: assign(({ context }): VerbSlotMachineContext => {
                return {
                  ...context,
                  remainingMs: context.remainingMs - SLOT_TICK_MS,
                };
              }),
            },
          ],
        },
        on: {
          DROP_CARD: {
            target: 'running',
            actions: assign(({ context, event }): VerbSlotMachineContext => {
              return {
                ...context,
                queuedCardId: event.cardId,
                queuedCardTitle: event.cardTitle,
                remainingMs: context.durationMs,
              };
            }),
          },
          RESET: {
            target: 'idle',
            actions: assign(({ context }): VerbSlotMachineContext => {
              return resetContext(context);
            }),
          },
        },
      },
      cooldown: {
        after: {
          cooldownDelay: {
            target: 'idle',
            actions: assign(({ context }): VerbSlotMachineContext => {
              return resetContext(context);
            }),
          },
        },
        on: {
          RESET: {
            target: 'idle',
            actions: assign(({ context }): VerbSlotMachineContext => {
              return resetContext(context);
            }),
          },
          DROP_CARD: {
            target: 'running',
            actions: assign(({ context, event }): VerbSlotMachineContext => {
              return {
                ...context,
                queuedCardId: event.cardId,
                queuedCardTitle: event.cardTitle,
                remainingMs: context.durationMs,
              };
            }),
          },
        },
      },
    },
  });
};
