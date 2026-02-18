import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';

import type { ActiveVerbSlotId } from '../data/cards/phase2.board';
import type { FoundationBoardCard } from '../ecs/world';

type CardProps = {
  card: FoundationBoardCard;
  selected: boolean;
  assignedSlot: ActiveVerbSlotId | null;
  heatLens: 'clear' | 'local' | 'federal' | 'crisis';
  position: {
    x: number;
    y: number;
  };
  boardZoom: number;
  zIndex: number;
  onSelect: (cardId: string) => void;
  interactive?: boolean;
  dragOverlay?: boolean;
  suppressDragTransform?: boolean;
  mutedWhileDragging?: boolean;
};

const dotMeter = (trustDots: number): string => {
  const clamped = Math.max(0, Math.min(5, trustDots));
  const filled = 'o'.repeat(clamped);
  const empty = '.'.repeat(5 - clamped);
  return `${filled}${empty}`;
};

export const Card = ({
  card,
  selected,
  assignedSlot,
  heatLens,
  position,
  boardZoom,
  zIndex,
  onSelect,
  interactive = true,
  dragOverlay = false,
  suppressDragTransform = false,
  mutedWhileDragging = false,
}: CardProps): ReactElement => {
  const draggableId = interactive ? card.id : `overlay-${card.id}`;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    disabled: !interactive,
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

  const dragX = suppressDragTransform ? 0 : transform?.x ?? 0;
  const dragY = suppressDragTransform ? 0 : transform?.y ?? 0;
  const adjustedDragX = dragX / boardZoom;
  const adjustedDragY = dragY / boardZoom;
  const notesInputId = `${card.id}-notes`;
  const isActiveDragCard = interactive && isDragging;
  const shouldAnimateDrag = isActiveDragCard && !suppressDragTransform;

  const cardGlow = useMemo((): string => {
    if (assignedSlot !== null) {
      return '0 0 18px rgba(184, 150, 62, 0.58), 0 8px 18px rgba(0, 0, 0, 0.35)';
    }

    if (selected) {
      return '0 0 15px rgba(196, 133, 42, 0.42), 0 10px 22px rgba(0, 0, 0, 0.38)';
    }

    return '0 10px 22px rgba(0, 0, 0, 0.38)';
  }, [assignedSlot, selected]);

  const hasDragOffset = adjustedDragX !== 0 || adjustedDragY !== 0;
  const rootTransform = hasDragOffset
    ? `translate(${adjustedDragX}px, ${adjustedDragY}px)${shouldAnimateDrag ? ' scale(1.04) rotate(1.15deg)' : ''}`
    : shouldAnimateDrag
      ? 'scale(1.04) rotate(1.15deg)'
      : undefined;

  const rootStyle: CSSProperties = {
    left: dragOverlay ? 0 : position.x,
    top: dragOverlay ? 0 : position.y,
    zIndex,
    transformOrigin: 'top left',
    transform: rootTransform,
    boxShadow: cardGlow,
    opacity: mutedWhileDragging ? 0.22 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      {...(interactive ? attributes : {})}
      {...(interactive ? listeners : {})}
      data-card-root="true"
      className={`board-card board-card--${card.cardType} board-card--heat-${heatLens} ${isFlipped ? 'board-card--flipped' : ''} ${
        isActiveDragCard ? 'board-card--is-dragging' : ''
      } ${dragOverlay ? 'board-card--drag-overlay' : ''} ${mutedWhileDragging ? 'board-card--muted' : ''}`}
      style={rootStyle}
      onClick={(): void => {
        if (!interactive) {
          return;
        }

        onSelect(card.id);
      }}
    >
      <div className="board-card__flip-shell">
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
      </div>
    </article>
  );
};
