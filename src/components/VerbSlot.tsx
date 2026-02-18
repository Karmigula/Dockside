import { useDroppable } from '@dnd-kit/core';
import { useMachine } from '@xstate/react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';

import type { ActiveVerbSlotId, BoardCardType, VerbSlotModel } from '../data/cards/phase2.board';
import {
  VERB_SLOT_TICK_MS,
  createVerbSlotMachine,
  type VerbSlotQueuedCard,
} from '../machines/verbSlot.machine';

export type VerbSlotDropSignal = {
  token: number;
  slotId: ActiveVerbSlotId;
  cardId: string;
  cardTitle: string;
  cardType: BoardCardType;
};

export type VerbSlotCompletionSignal = {
  token: number;
  slotId: ActiveVerbSlotId;
  cards: readonly VerbSlotQueuedCard[];
};

type VerbSlotProps = {
  slot: VerbSlotModel;
  queuedDrop: VerbSlotDropSignal | null;
  onComplete: (signal: VerbSlotCompletionSignal) => void;
};

const slotColorClassByAccent: Record<VerbSlotModel['accentToken'], string> = {
  gold: 'verb-slot--gold',
  blue: 'verb-slot--blue',
  amber: 'verb-slot--amber',
  green: 'verb-slot--green',
  orange: 'verb-slot--orange',
  red: 'verb-slot--red',
};

const TIMER_RADIUS = 16;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

export const VerbSlot = ({ slot, queuedDrop, onComplete }: VerbSlotProps): ReactElement => {
  const lastQueuedDropTokenRef = useRef<number | null>(null);
  const emittedCompletionTokenRef = useRef<number | null>(null);
  const previousPhaseRef = useRef<'idle' | 'running' | 'cooldown'>('idle');

  const machine = useMemo(() => {
    return createVerbSlotMachine({
      slotId: slot.id,
      durationMs: slot.durationMs,
      requiredTypes: slot.requiredTypes,
    });
  }, [slot.durationMs, slot.id, slot.requiredTypes]);

  const [state, send] = useMachine(machine);

  const { setNodeRef, isOver } = useDroppable({
    id: slot.id,
    data: {
      slotId: slot.id,
      slotLabel: slot.title,
    },
  });

  useEffect((): void => {
    if (queuedDrop === null) {
      return;
    }

    if (queuedDrop.slotId !== slot.id) {
      return;
    }

    // Guard: only send if the token is genuinely new.
    // Two drops within the same ms tick would share a token — treat as one.
    if (lastQueuedDropTokenRef.current === queuedDrop.token) {
      return;
    }

    lastQueuedDropTokenRef.current = queuedDrop.token;
    emittedCompletionTokenRef.current = null;

    send({
      type: 'DROP_CARD',
      token: queuedDrop.token,
      cardId: queuedDrop.cardId,
      cardTitle: queuedDrop.cardTitle,
      cardType: queuedDrop.cardType,
    });
  }, [queuedDrop, send, slot.id]);

  const isCoolingDown = state.matches('cooldown');
  const isRunning = state.matches('running');
  const slotPhase: 'idle' | 'running' | 'cooldown' = isRunning ? 'running' : isCoolingDown ? 'cooldown' : 'idle';
  const queuedToken = state.context.queuedToken;
  const queuedCards = state.context.queuedCards;
  const queuedCardTitles = queuedCards.map((queuedCard): string => {
    return queuedCard.cardTitle;
  });
  const queuedCardsSummary = queuedCardTitles.length === 0 ? 'empty' : queuedCardTitles.join(' + ');

  useEffect((): void => {
    if (import.meta.env.DEV && previousPhaseRef.current !== slotPhase) {
      console.debug(
        `[Dockside][verb-slot:${slot.id}] ${previousPhaseRef.current} -> ${slotPhase} (${queuedCardsSummary})`,
      );
    }

    previousPhaseRef.current = slotPhase;
  }, [queuedCardsSummary, slot.id, slotPhase]);

  useEffect((): (() => void) | void => {
    if (!isRunning && !isCoolingDown) {
      return;
    }

    const timerId = globalThis.setInterval((): void => {
      send({
        type: 'TICK',
        deltaMs: VERB_SLOT_TICK_MS,
      });
    }, VERB_SLOT_TICK_MS);

    return (): void => {
      globalThis.clearInterval(timerId);
    };
  }, [isCoolingDown, isRunning, send]);

  useEffect((): void => {
    if (!isCoolingDown) {
      return;
    }

    if (queuedToken === null || queuedCards.length === 0) {
      return;
    }

    if (emittedCompletionTokenRef.current === queuedToken) {
      return;
    }

    emittedCompletionTokenRef.current = queuedToken;

    onComplete({
      token: queuedToken,
      slotId: slot.id,
      cards: queuedCards,
    });
  }, [isCoolingDown, onComplete, queuedCards, queuedToken, slot.id]);

  const queueLabel =
    queuedCards.length === 0
      ? 'Drop cards'
      : `${queuedCards.length}/${slot.requiredTypes.length}: ${queuedCardTitles.join(' + ')}`;

  // Progress runs 0 → 1 over durationMs. Guard against durationMs === 0.
  const rawProgress =
    state.context.durationMs > 0
      ? 1 - state.context.remainingMs / state.context.durationMs
      : 0;
  const normalizedProgress = Math.max(0, Math.min(1, rawProgress));
  // dashOffset at 0 = full ring visible (complete). At CIRCUMFERENCE = empty ring (idle).
  const dashOffset = TIMER_CIRCUMFERENCE * (1 - normalizedProgress);

  const slotStateLabel = state.matches('running')
    ? 'Running'
    : state.matches('cooldown')
      ? 'Cooling'
      : 'Idle';

  return (
    <motion.section
      ref={setNodeRef}
      data-verb-slot="true"
      className={`verb-slot ${slotColorClassByAccent[slot.accentToken]} ${
        isOver ? 'verb-slot--over' : ''
      }`}
      animate={{
        y: isOver ? -2 : 0,
        boxShadow: isOver
          ? '0 0 0 1px rgba(232, 212, 138, 0.5), 0 10px 18px rgba(0, 0, 0, 0.35)'
          : '0 8px 18px rgba(0, 0, 0, 0.26)',
      }}
      transition={{ type: 'spring', stiffness: 330, damping: 30 }}
      onPointerDownCapture={(event): void => {
        event.stopPropagation();
      }}
    >
      <header className="verb-slot__header">
        <div>
          <h3>{slot.title}</h3>
          <p>{slot.requirementLabel}</p>
        </div>

        <span className={`verb-slot__status verb-slot__status--${slotStateLabel.toLowerCase()}`}>
          {slotStateLabel}
        </span>
      </header>

      <div className="verb-slot__timer-wrap">
        <svg
          className="verb-slot__timer"
          width="44"
          height="44"
          viewBox="0 0 44 44"
          aria-hidden="true"
        >
          <circle
            className="verb-slot__ring verb-slot__ring--base"
            cx="22"
            cy="22"
            r={TIMER_RADIUS}
          />
          <circle
            className="verb-slot__ring verb-slot__ring--progress"
            cx="22"
            cy="22"
            r={TIMER_RADIUS}
            strokeDasharray={`${TIMER_CIRCUMFERENCE} ${TIMER_CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <span className="verb-slot__queue-label">
          {queueLabel}
        </span>
      </div>

      <button
        className="verb-slot__reset"
        onClick={(event): void => {
          event.preventDefault();
          send({ type: 'RESET' });
        }}
      >
        Reset
      </button>
    </motion.section>
  );
};
