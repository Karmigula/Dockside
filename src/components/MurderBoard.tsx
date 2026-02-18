import {
  type CollisionDetection,
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { motion } from 'framer-motion';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type WheelEvent,
} from 'react';

import {
  PHASE_TWO_BOARD_CARDS,
  PHASE_TWO_EVENT_LOG_SEED,
  PHASE_TWO_VERB_SLOTS,
  type ActiveVerbSlotId,
  type BoardCardCluster,
  type BoardCardModel,
} from '../data/cards/phase2.board';
import { Card } from './Card';
import { EventLog, type EventLogEntry } from './EventLog';
import { VerbSlot, type VerbSlotDropSignal } from './VerbSlot';

type PanAnchor = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

const toClockStamp = (): string => {
  const now = new Date();

  return now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const buildSeedEvents = (): EventLogEntry[] => {
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

type BoardCardPosition = {
  x: number;
  y: number;
};

const MAX_ZOOM = 1.2;
const ABSOLUTE_MIN_ZOOM = 0.68;
const FIT_PADDING = 24;
const BOARD_SURFACE_WIDTH = 2160;
const BOARD_SURFACE_HEIGHT = 1280;
const CARD_COLUMN_STEP = 186;
const CARD_ROW_STEP = 272;

const initialClusterOrigin: Record<BoardCardCluster, BoardCardPosition> = {
  people: { x: 120, y: 140 },
  locations: { x: 640, y: 170 },
  situations: { x: 1160, y: 140 },
  resources: { x: 1680, y: 170 },
};

const buildInitialCardPositions = (cards: readonly BoardCardModel[]): Record<string, BoardCardPosition> => {
  const byClusterIndex: Record<BoardCardCluster, number> = {
    people: 0,
    locations: 0,
    situations: 0,
    resources: 0,
  };

  return cards.reduce(
    (positions, card): Record<string, BoardCardPosition> => {
      const cardIndex = byClusterIndex[card.cluster];
      byClusterIndex[card.cluster] += 1;

      const origin = initialClusterOrigin[card.cluster];
      const row = Math.floor(cardIndex / 2);
      const column = cardIndex % 2;

      return {
        ...positions,
        [card.id]: {
          x: origin.x + column * CARD_COLUMN_STEP,
          y: origin.y + row * CARD_ROW_STEP,
        },
      };
    },
    {},
  );
};

const buildInitialCardZIndices = (cards: readonly BoardCardModel[]): Record<string, number> => {
  return cards.reduce(
    (layers, card, index): Record<string, number> => {
      return {
        ...layers,
        [card.id]: index + 1,
      };
    },
    {},
  );
};

const quantizeZoom = (value: number): number => {
  return Math.round(value * 10) / 10;
};

const strictSlotCollision: CollisionDetection = (args) => {
  return pointerWithin(args);
};

const toneForSlot = (slotId: ActiveVerbSlotId): EventLogEntry['tone'] => {
  if (slotId === 'violence' || slotId === 'bribe') {
    return 'warning';
  }

  if (slotId === 'scheme') {
    return 'info';
  }

  return 'success';
};

export const MurderBoard = (): ReactElement => {
  const [selectedCardId, setSelectedCardId] = useState<string>(PHASE_TWO_BOARD_CARDS[0].id);
  const [assignedSlots, setAssignedSlots] = useState<Record<string, ActiveVerbSlotId>>({});
  const [queuedDrop, setQueuedDrop] = useState<VerbSlotDropSignal | null>(null);
  const [entries, setEntries] = useState<EventLogEntry[]>(() => {
    return buildSeedEvents();
  });
  const [zoom, setZoom] = useState<number>(1);
  const [minZoom, setMinZoom] = useState<number>(0.72);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, BoardCardPosition>>(() => {
    return buildInitialCardPositions(PHASE_TWO_BOARD_CARDS);
  });
  const [cardZIndices, setCardZIndices] = useState<Record<string, number>>(() => {
    return buildInitialCardZIndices(PHASE_TWO_BOARD_CARDS);
  });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panAnchorRef = useRef<PanAnchor | null>(null);
  const nextCardLayerRef = useRef<number>(PHASE_TWO_BOARD_CARDS.length + 2);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 8,
      },
    }),
  );

  useEffect((): (() => void) => {
    const syncViewportZoomFloor = (): void => {
      const canvasNode = canvasRef.current;

      if (canvasNode === null) {
        return;
      }

      const canvasRect = canvasNode.getBoundingClientRect();
      const availableWidth = canvasRect.width - FIT_PADDING;
      const availableHeight = canvasRect.height - FIT_PADDING;

      if (availableWidth <= 0 || availableHeight <= 0) {
        return;
      }

      const fitZoom = Math.min(availableWidth / BOARD_SURFACE_WIDTH, availableHeight / BOARD_SURFACE_HEIGHT);
      const nextMinZoom = quantizeZoom(clamp(fitZoom, ABSOLUTE_MIN_ZOOM, 1));

      setMinZoom(nextMinZoom);
      setZoom(nextMinZoom);
      setPanX(0);
      setPanY(0);
    };

    syncViewportZoomFloor();
    window.addEventListener('resize', syncViewportZoomFloor);

    return (): void => {
      window.removeEventListener('resize', syncViewportZoomFloor);
    };
  }, []);

  const clampZoom = (value: number): number => {
    return clamp(quantizeZoom(value), minZoom, MAX_ZOOM);
  };

  const activeDragCard = useMemo((): BoardCardModel | null => {
    if (activeCardId === null) {
      return null;
    }

    return PHASE_TWO_BOARD_CARDS.find((card) => card.id === activeCardId) ?? null;
  }, [activeCardId]);

  const activeCardTitle = activeDragCard?.title ?? null;

  const selectedCardTitle = useMemo((): string => {
    const selectedCard = PHASE_TWO_BOARD_CARDS.find((card) => card.id === selectedCardId);
    return selectedCard?.title ?? 'No card selected';
  }, [selectedCardId]);

  const handleDragStart = (event: DragStartEvent): void => {
    const cardId = String(event.active.id);

    setActiveCardId(cardId);
    setSelectedCardId(cardId);
    setCardZIndices((current): Record<string, number> => {
      return {
        ...current,
        [cardId]: nextCardLayerRef.current,
      };
    });
    nextCardLayerRef.current += 1;
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveCardId(null);

    const cardId = String(event.active.id);
    const movedCard = PHASE_TWO_BOARD_CARDS.find((candidate) => candidate.id === cardId);

    if (movedCard === undefined) {
      return;
    }

    const translatedRect = event.active.rect.current.translated;
    const canvasRect = canvasRef.current?.getBoundingClientRect() ?? null;
    const shouldPersistPosition =
      translatedRect === null || canvasRect === null
        ? true
        : translatedRect.left + translatedRect.width / 2 >= canvasRect.left &&
            translatedRect.left + translatedRect.width / 2 <= canvasRect.right &&
            translatedRect.top + translatedRect.height / 2 >= canvasRect.top &&
            translatedRect.top + translatedRect.height / 2 <= canvasRect.bottom;

    if (shouldPersistPosition) {
      setCardPositions((current): Record<string, BoardCardPosition> => {
        const previous = current[cardId];

        if (previous === undefined) {
          return current;
        }

        return {
          ...current,
          [cardId]: {
            x: previous.x + event.delta.x / zoom,
            y: previous.y + event.delta.y / zoom,
          },
        };
      });
    }

    const overId = event.over?.id;

    if (overId === undefined) {
      return;
    }

    const slot = PHASE_TWO_VERB_SLOTS.find((candidate) => candidate.id === String(overId));

    if (slot === undefined) {
      return;
    }

    const token = Date.now();

    console.info(`[Dockside] ${movedCard.title} dropped into ${slot.title}.`);

    setAssignedSlots((current): Record<string, ActiveVerbSlotId> => {
      const nextAssignments = Object.entries(current).reduce((next, [assignedCardId, assignedSlotId]) => {
        if (assignedSlotId === slot.id || assignedCardId === movedCard.id) {
          return next;
        }

        return {
          ...next,
          [assignedCardId]: assignedSlotId,
        };
      }, {} as Record<string, ActiveVerbSlotId>);

      return {
        ...nextAssignments,
        [movedCard.id]: slot.id,
      };
    });

    setQueuedDrop({
      token,
      slotId: slot.id,
      cardId: movedCard.id,
      cardTitle: movedCard.title,
    });

    setEntries((current): EventLogEntry[] => {
      const nextEntry: EventLogEntry = {
        id: `drop-${token}`,
        tone: toneForSlot(slot.id),
        line: `${movedCard.title} slid into ${slot.title}. The timer ring starts to burn.`,
        stampedAt: toClockStamp(),
      };

      return [nextEntry, ...current].slice(0, 10);
    });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>): void => {
    event.preventDefault();

    const nextZoom = clampZoom(zoom - event.deltaY * 0.0012);
    setZoom(nextZoom);
  };

  const handleBoardPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    const withinInteractiveNode =
      target.closest('[data-card-root="true"]') !== null || target.closest('[data-verb-slot="true"]') !== null;

    if (withinInteractiveNode) {
      return;
    }

    event.preventDefault();

    panAnchorRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panX,
      originY: panY,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBoardPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const anchor = panAnchorRef.current;

    if (anchor === null || anchor.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const deltaX = event.clientX - anchor.startX;
    const deltaY = event.clientY - anchor.startY;

    setPanX(anchor.originX + deltaX);
    setPanY(anchor.originY + deltaY);
  };

  const handleBoardPointerRelease = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const anchor = panAnchorRef.current;

    if (anchor === null || anchor.pointerId !== event.pointerId) {
      return;
    }

    panAnchorRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <main className="murder-board">
      <header className="murder-board__header">
        <div>
          <p className="murder-board__kicker">Dockside / Phase 2</p>
          <h1>The Murder Board</h1>
          <p>Static cards, live drag targets, timer rings, and a noisy street wire.</p>
        </div>

        <div className="murder-board__status-panel">
          <p>
            Selected: <strong>{selectedCardTitle}</strong>
          </p>
          <p>{activeCardTitle === null ? 'Drag a card into a verb slot.' : `Dragging: ${activeCardTitle}`}</p>

          <div className="murder-board__zoom-controls">
            <button
              onClick={(): void => {
                setZoom((current): number => {
                  return clampZoom(current - 0.1);
                });
              }}
            >
              -
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              onClick={(): void => {
                setZoom((current): number => {
                  return clampZoom(current + 0.1);
                });
              }}
            >
              +
            </button>
            <button
              onClick={(): void => {
                setZoom(minZoom);
                setPanX(0);
                setPanY(0);
              }}
            >
              Reset View
            </button>
          </div>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={strictSlotCollision}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="murder-board__layout">
          <aside className="verb-rack" aria-label="Verb slots">
            <h2>Verb Slots</h2>

            <div className="verb-rack__slots">
              {PHASE_TWO_VERB_SLOTS.map((slot) => {
                return <VerbSlot key={slot.id} slot={slot} queuedDrop={queuedDrop} />;
              })}
            </div>
          </aside>

          <section
            ref={canvasRef}
            className={activeCardId === null ? 'board-canvas' : 'board-canvas board-canvas--dragging'}
            aria-label="Murder board canvas"
            onWheel={handleWheel}
            onPointerDown={handleBoardPointerDown}
            onPointerMove={handleBoardPointerMove}
            onPointerUp={handleBoardPointerRelease}
            onPointerCancel={handleBoardPointerRelease}
          >
            <motion.div
              className="board-canvas__stage"
              style={{ x: panX, y: panY, zoom }}
            >
              {PHASE_TWO_BOARD_CARDS.map((card) => {
                const cardPosition = cardPositions[card.id];

                if (cardPosition === undefined) {
                  return null;
                }

                return (
                  <Card
                    key={card.id}
                    card={card}
                    selected={selectedCardId === card.id}
                    assignedSlot={assignedSlots[card.id] ?? null}
                    position={cardPosition}
                    boardZoom={zoom}
                    zIndex={cardZIndices[card.id] ?? 1}
                    onSelect={setSelectedCardId}
                  />
                );
              })}
            </motion.div>
          </section>

          <EventLog entries={entries} />
        </div>
      </DndContext>
    </main>
  );
};
