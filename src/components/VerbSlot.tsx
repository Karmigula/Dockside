import { useDroppable } from '@dnd-kit/core';
import { useMachine } from '@xstate/react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';

import type { ActiveVerbSlotId, VerbSlotModel } from '../data/cards/phase2.board';
import { createVerbSlotMachine } from '../machines/verbSlot.machine';

export type VerbSlotDropSignal = {
  token: number;
  slotId: ActiveVerbSlotId;
  cardId: string;
  cardTitle: string;
};

export type VerbSlotCompletionSignal = {
  token: number;
  slotId: ActiveVerbSlotId;
  cardId: string;
  cardTitle: string;
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

  const machine = useMemo(() => {
    return createVerbSlotMachine({
      slotId: slot.id,
      durationMs: slot.durationMs,
      onComplete: ({ token, cardId, cardTitle, slotId }): void => {
        onComplete({
          token,
          slotId,
          cardId,
          cardTitle,
        });
      },
    });
  }, [onComplete, slot.durationMs, slot.id]);

  const [state, send] = useMachine(machine, {});

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

    if (lastQueuedDropTokenRef.current === queuedDrop.token) {
      return;
    }

    lastQueuedDropTokenRef.current = queuedDrop.token;

    send({
      type: 'DROP_CARD',
      token: queuedDrop.token,
      cardId: queuedDrop.cardId,
      cardTitle: queuedDrop.cardTitle,
    });
  }, [queuedDrop, send, slot.id]);

  const progress = 1 - state.context.remainingMs / state.context.durationMs;
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const dashOffset = TIMER_CIRCUMFERENCE - TIMER_CIRCUMFERENCE * normalizedProgress;

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
        <svg className="verb-slot__timer" width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          <circle className="verb-slot__ring verb-slot__ring--base" cx="22" cy="22" r={TIMER_RADIUS} />
          <circle
            className="verb-slot__ring verb-slot__ring--progress"
            cx="22"
            cy="22"
            r={TIMER_RADIUS}
            strokeDasharray={TIMER_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <span className="verb-slot__queue-label">
          {state.context.queuedCardTitle === null ? 'Drop card' : `Card: ${state.context.queuedCardTitle}`}
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
