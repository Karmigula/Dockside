import { assign, setup } from 'xstate';

import type { ActiveVerbSlotId, BoardCardType } from '../data/cards/phase2.board';

type VerbSlotMachineInput = {
  slotId: ActiveVerbSlotId;
  durationMs: number;
  requiredTypes: readonly BoardCardType[];
  cooldownMs?: number;
};

export type VerbSlotQueuedCard = {
  cardId: string;
  cardTitle: string;
  cardType: BoardCardType;
};

type VerbSlotMachineContext = {
  slotId: ActiveVerbSlotId;
  durationMs: number;
  remainingMs: number;
  cooldownMs: number;
  remainingCooldownMs: number;
  requiredTypes: readonly BoardCardType[];
  queuedToken: number | null;
  queuedCards: VerbSlotQueuedCard[];
};

type VerbSlotMachineEvent =
  | { type: 'DROP_CARD'; token: number; cardId: string; cardTitle: string; cardType: BoardCardType }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'RESET' };

export const VERB_SLOT_TICK_MS = 120;

const resetContext = (context: VerbSlotMachineContext): VerbSlotMachineContext => {
  return {
    ...context,
    remainingMs: context.durationMs,
    remainingCooldownMs: 0,
    queuedToken: null,
    queuedCards: [],
  };
};

type BoardCardTypeCountMap = Record<BoardCardType, number>;

type DropCardResult = {
  queuedCards: VerbSlotQueuedCard[];
  didMutate: boolean;
};

const createEmptyTypeCountMap = (): BoardCardTypeCountMap => {
  return {
    person: 0,
    resource: 0,
    location: 0,
    situation: 0,
  };
};

const countRequiredTypes = (requiredTypes: readonly BoardCardType[]): BoardCardTypeCountMap => {
  return requiredTypes.reduce((counts, requiredType): BoardCardTypeCountMap => {
    return {
      ...counts,
      [requiredType]: counts[requiredType] + 1,
    };
  }, createEmptyTypeCountMap());
};

const countQueuedCardTypes = (queuedCards: readonly VerbSlotQueuedCard[]): BoardCardTypeCountMap => {
  return queuedCards.reduce((counts, queuedCard): BoardCardTypeCountMap => {
    return {
      ...counts,
      [queuedCard.cardType]: counts[queuedCard.cardType] + 1,
    };
  }, createEmptyTypeCountMap());
};

const hasAllRequiredCards = (
  requiredTypes: readonly BoardCardType[],
  queuedCards: readonly VerbSlotQueuedCard[],
): boolean => {
  const requiredTypeCounts = countRequiredTypes(requiredTypes);
  const queuedTypeCounts = countQueuedCardTypes(queuedCards);

  return (Object.keys(requiredTypeCounts) as BoardCardType[]).every((cardType): boolean => {
    return queuedTypeCounts[cardType] >= requiredTypeCounts[cardType];
  });
};

const buildDropCardResult = (
  context: VerbSlotMachineContext,
  event: VerbSlotMachineEvent,
): DropCardResult => {
  if (event.type !== 'DROP_CARD') {
    return {
      queuedCards: context.queuedCards,
      didMutate: false,
    };
  }

  const requiredTypeCounts = countRequiredTypes(context.requiredTypes);
  const requiredCountForType = requiredTypeCounts[event.cardType];

  if (requiredCountForType <= 0) {
    return {
      queuedCards: context.queuedCards,
      didMutate: false,
    };
  }

  const hasCardAlready = context.queuedCards.some((queuedCard): boolean => {
    return queuedCard.cardId === event.cardId;
  });

  if (hasCardAlready) {
    return {
      queuedCards: context.queuedCards,
      didMutate: false,
    };
  }

  const queuedTypeCounts = countQueuedCardTypes(context.queuedCards);
  const queuedCountForType = queuedTypeCounts[event.cardType];
  const nextQueuedCard: VerbSlotQueuedCard = {
    cardId: event.cardId,
    cardTitle: event.cardTitle,
    cardType: event.cardType,
  };

  if (queuedCountForType < requiredCountForType) {
    return {
      queuedCards: [...context.queuedCards, nextQueuedCard],
      didMutate: true,
    };
  }

  const replaceIndex = context.queuedCards.findIndex((queuedCard): boolean => {
    return queuedCard.cardType === event.cardType;
  });

  if (replaceIndex < 0) {
    return {
      queuedCards: context.queuedCards,
      didMutate: false,
    };
  }

  const nextQueuedCards = [...context.queuedCards];
  nextQueuedCards[replaceIndex] = nextQueuedCard;

  return {
    queuedCards: nextQueuedCards,
    didMutate: true,
  };
};

const canEnterRunningFromDrop = (
  context: VerbSlotMachineContext,
  event: VerbSlotMachineEvent,
): boolean => {
  const dropResult = buildDropCardResult(context, event);

  if (!dropResult.didMutate) {
    return false;
  }

  return hasAllRequiredCards(context.requiredTypes, dropResult.queuedCards);
};

const applyDropCard = (
  context: VerbSlotMachineContext,
  event: VerbSlotMachineEvent,
): VerbSlotMachineContext => {
  const dropResult = buildDropCardResult(context, event);

  if (!dropResult.didMutate || event.type !== 'DROP_CARD') {
    return context;
  }

  const nextQueuedCards = dropResult.queuedCards;
  const nextHasAllRequiredCards = hasAllRequiredCards(context.requiredTypes, nextQueuedCards);

  return {
    ...context,
    queuedToken: event.token,
    queuedCards: nextQueuedCards,
    remainingMs: nextHasAllRequiredCards ? context.durationMs : context.remainingMs,
    remainingCooldownMs: 0,
  };
};

export const createVerbSlotMachine = (input: VerbSlotMachineInput) => {
  const cooldownMs = input.cooldownMs ?? 700;

  return setup({
    types: {
      context: {} as VerbSlotMachineContext,
      events: {} as VerbSlotMachineEvent,
    },
  }).createMachine({
    id: `verb-slot-${input.slotId}`,
    context: {
      slotId: input.slotId,
      durationMs: input.durationMs,
      remainingMs: input.durationMs,
      cooldownMs,
      remainingCooldownMs: 0,
      requiredTypes: input.requiredTypes,
      queuedToken: null,
      queuedCards: [],
    },
    initial: 'idle',
    states: {
      idle: {
        on: {
          DROP_CARD: [
            {
              guard: ({ context, event }): boolean => {
                return canEnterRunningFromDrop(context, event);
              },
              target: 'running',
              actions: assign(({ context, event }): VerbSlotMachineContext => {
                return applyDropCard(context, event);
              }),
            },
            {
              actions: assign(({ context, event }): VerbSlotMachineContext => {
                return applyDropCard(context, event);
              }),
            },
          ],
          RESET: {
            actions: assign(({ context }): VerbSlotMachineContext => {
              return resetContext(context);
            }),
          },
        },
      },
      running: {
        on: {
          TICK: [
            {
              guard: ({ context, event }): boolean => {
                return event.type === 'TICK' && context.remainingMs <= event.deltaMs;
              },
              target: 'cooldown',
              actions: assign(({ context }): VerbSlotMachineContext => {
                return {
                  ...context,
                  remainingMs: 0,
                  remainingCooldownMs: context.cooldownMs,
                };
              }),
            },
            {
              guard: ({ event }): boolean => {
                return event.type === 'TICK';
              },
              target: 'running',
              actions: assign(({ context, event }): VerbSlotMachineContext => {
                if (event.type !== 'TICK') {
                  return context;
                }

                return {
                  ...context,
                  remainingMs: Math.max(0, context.remainingMs - event.deltaMs),
                };
              }),
            },
          ],
          DROP_CARD: {
            actions: assign(({ context, event }): VerbSlotMachineContext => {
              return applyDropCard(context, event);
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
        on: {
          DROP_CARD: [
            {
              guard: ({ context, event }): boolean => {
                return canEnterRunningFromDrop(context, event);
              },
              target: 'running',
              actions: assign(({ context, event }): VerbSlotMachineContext => {
                return applyDropCard(context, event);
              }),
            },
            {
              actions: assign(({ context, event }): VerbSlotMachineContext => {
                return applyDropCard(context, event);
              }),
            },
          ],
          TICK: [
            {
              guard: ({ context, event }): boolean => {
                return event.type === 'TICK' && context.remainingCooldownMs <= event.deltaMs;
              },
              target: 'idle',
              actions: assign(({ context }): VerbSlotMachineContext => {
                return resetContext(context);
              }),
            },
            {
              guard: ({ event }): boolean => {
                return event.type === 'TICK';
              },
              target: 'cooldown',
              actions: assign(({ context, event }): VerbSlotMachineContext => {
                if (event.type !== 'TICK') {
                  return context;
                }

                return {
                  ...context,
                  remainingCooldownMs: Math.max(0, context.remainingCooldownMs - event.deltaMs),
                };
              }),
            },
          ],
          RESET: {
            target: 'idle',
            actions: assign(({ context }): VerbSlotMachineContext => {
              return resetContext(context);
            }),
          },
        },
      },
    },
  });
};
