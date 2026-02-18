import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { useMemo, useState, type ReactElement } from 'react';

import type { ActiveVerbSlotId, BoardCardModel } from '../data/cards/phase2.board';

type CardProps = {
  card: BoardCardModel;
  selected: boolean;
  assignedSlot: ActiveVerbSlotId | null;
  position: {
    x: number;
    y: number;
  };
  boardZoom: number;
  zIndex: number;
  onSelect: (cardId: string) => void;
};

const dotMeter = (trustDots: number): string => {
  const clamped = Math.max(0, Math.min(5, trustDots));
  const filled = 'o'.repeat(clamped);
  const empty = '.'.repeat(5 - clamped);
  return `${filled}${empty}`;
};

export const Card = ({ card, selected, assignedSlot, position, boardZoom, zIndex, onSelect }: CardProps): ReactElement => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: {
      cardId: card.id,
      title: card.title,
      cardType: card.cardType,
    },
  });

  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [backNotes, setBackNotes] = useState<string>('');

  const toggleFlip = (): void => {
    setIsFlipped((current): boolean => {
      return !current;
    });
  };

  const dragX = transform?.x ?? 0;
  const dragY = transform?.y ?? 0;
  const adjustedDragX = dragX / boardZoom;
  const adjustedDragY = dragY / boardZoom;
  const notesInputId = `${card.id}-notes`;

  const cardGlow = useMemo((): string[] | string => {
    if (assignedSlot !== null) {
      return [
        '0 8px 18px rgba(0, 0, 0, 0.35)',
        '0 0 18px rgba(184, 150, 62, 0.58)',
        '0 8px 18px rgba(0, 0, 0, 0.35)',
      ];
    }

    if (selected) {
      return [
        '0 10px 22px rgba(0, 0, 0, 0.38)',
        '0 0 15px rgba(196, 133, 42, 0.42)',
        '0 10px 22px rgba(0, 0, 0, 0.38)',
      ];
    }

    return '0 10px 22px rgba(0, 0, 0, 0.38)';
  }, [assignedSlot, selected]);

  return (
    <motion.article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-card-root="true"
      className={`board-card board-card--${card.cardType}`}
      style={{ transformOrigin: 'top left' }}
      onClick={(): void => {
        onSelect(card.id);
      }}
      animate={{
        x: position.x + adjustedDragX,
        y: position.y + adjustedDragY,
        zIndex,
        scale: isDragging ? 1.04 : 1,
        rotate: isDragging ? 1.15 : 0,
        boxShadow: cardGlow,
      }}
      whileHover={{ scale: isDragging ? 1.04 : 1.01 }}
      transition={{
        type: 'spring',
        stiffness: 430,
        damping: 30,
      }}
    >
      <motion.div
        className="board-card__flip-shell"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.38, ease: 'easeInOut' }}
      >
        <section className="board-card__face board-card__face--front">
          <header className="board-card__topline">
            <span className="board-card__type-pill">{card.cardType}</span>
            <span className={`board-card__state ${card.decaying ? 'board-card__state--decaying' : ''}`}>
              {card.stateLabel}
            </span>
          </header>

          <div className="board-card__content">
            <h3>{card.title}</h3>
            <p className="board-card__subtitle">{card.subtitle}</p>

            <p className="board-card__flavor">{card.flavor}</p>

            <dl className="board-card__stats">
              <div>
                <dt>Trust</dt>
                <dd>{dotMeter(card.trustDots)}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{card.stateLabel}</dd>
              </div>
            </dl>
          </div>

          {selected ? <button className="board-card__dossier-button">Open Dossier</button> : null}

          <button
            className="board-card__flip-button"
            type="button"
            onClick={(event): void => {
              event.preventDefault();
              event.stopPropagation();
              toggleFlip();
            }}
          >
            Flip
          </button>

          {card.decaying ? (
            <motion.div
              className="board-card__decay-vignette"
              animate={{ opacity: [0.15, 0.32, 0.22] }}
              transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : null}

          {assignedSlot !== null ? (
            <motion.div
              className="board-card__slot-pulse"
              animate={{ opacity: [0.18, 0.45, 0.18] }}
              transition={{ duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : null}
        </section>

        <section className="board-card__face board-card__face--back">
          <div className="board-card__back-scroll">
            <h4>Back Channel</h4>
            <p>Loose notes, half-truths, and names worth remembering.</p>
            <ul>
              <li>Keep this card moving. Static cards turn into liabilities.</li>
              <li>When the slot ring burns down, consequences follow.</li>
              <li>No witnesses means fewer questions later.</li>
            </ul>

            <label htmlFor={notesInputId} className="board-card__notes-label">
              Notes
            </label>

            <textarea
              id={notesInputId}
              className="board-card__notes"
              value={backNotes}
              placeholder="Write a note for this card..."
              onChange={(event): void => {
                setBackNotes(event.currentTarget.value);
              }}
              onPointerDown={(event): void => {
                event.stopPropagation();
              }}
              onClick={(event): void => {
                event.stopPropagation();
              }}
            />
          </div>

          <button
            className="board-card__flip-button"
            type="button"
            onClick={(event): void => {
              event.preventDefault();
              event.stopPropagation();
              toggleFlip();
            }}
          >
            Flip Back
          </button>
        </section>
      </motion.div>
    </motion.article>
  );
};
