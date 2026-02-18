import { assign, setup } from 'xstate';

import type { ActiveVerbSlotId } from '../data/cards/phase2.board';

type VerbSlotMachineInput = {
  slotId: ActiveVerbSlotId;
  durationMs: number;
  cooldownMs?: number;
  onComplete?: (signal: {
    token: number;
    slotId: ActiveVerbSlotId;
    cardId: string;
    cardTitle: string;
  }) => void;
};

type VerbSlotMachineContext = {
  slotId: ActiveVerbSlotId;
  durationMs: number;
  remainingMs: number;
  cooldownMs: number;
  queuedToken: number | null;
  queuedCardId: string | null;
  queuedCardTitle: string | null;
};

type VerbSlotMachineEvent =
  | { type: 'DROP_CARD'; token: number; cardId: string; cardTitle: string }
  | { type: 'RESET' };

const SLOT_TICK_MS = 120;

const resetContext = (context: VerbSlotMachineContext): VerbSlotMachineContext => {
  return {
    ...context,
    remainingMs: context.durationMs,
    queuedToken: null,
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
    actions: {
      emitCompletion: ({ context }): void => {
        if (
          context.queuedToken === null ||
          context.queuedCardId === null ||
          context.queuedCardTitle === null ||
          input.onComplete === undefined
        ) {
          return;
        }

        input.onComplete({
          token: context.queuedToken,
          slotId: context.slotId,
          cardId: context.queuedCardId,
          cardTitle: context.queuedCardTitle,
        });
      },
    },
  }).createMachine({
    id: `verb-slot-${input.slotId}`,
    context: {
      slotId: input.slotId,
      durationMs: input.durationMs,
      remainingMs: input.durationMs,
      cooldownMs,
      queuedToken: null,
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
                queuedToken: event.token,
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
                queuedToken: event.token,
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
        entry: {
          type: 'emitCompletion',
        },
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
                queuedToken: event.token,
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
