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
  PHASE_TWO_VERB_SLOTS,
  type ActiveVerbSlotId,
  type BoardCardCluster,
  type BoardCardModel,
} from '../data/cards/phase2.board';
import { Card } from './Card';
import { EventLog, type EventLogEntry } from './EventLog';
import { VerbSlot, type VerbSlotCompletionSignal, type VerbSlotDropSignal } from './VerbSlot';
import { useGameStore } from '../store/gameStore';
import { queueCompletedVerbAction } from '../store/verbStore';

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

type BoardCardPosition = {
  x: number;
  y: number;
};

const MIN_INTERACTIVE_ZOOM = 0.1;
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

const toneForSlot = (slotId: ActiveVerbSlotId): 'warning' | 'info' | 'success' => {
  if (slotId === 'violence' || slotId === 'bribe') {
    return 'warning';
  }

  if (slotId === 'scheme') {
    return 'info';
  }

  return 'success';
};

const cardHeatWeightByType: Record<BoardCardModel['cardType'], { local: number; federal: number }> = {
  person: { local: 1, federal: 0.45 },
  location: { local: 0.7, federal: 0.3 },
  resource: { local: 0.45, federal: 0.55 },
  situation: { local: 0.85, federal: 0.8 },
};

const resolveCardHeatLens = (
  card: BoardCardModel,
  localHeat: number,
  federalHeat: number,
): 'clear' | 'local' | 'federal' | 'crisis' => {
  const weight = cardHeatWeightByType[card.cardType];
  const localSignal = localHeat * weight.local;
  const federalSignal = federalHeat * weight.federal;

  if (localSignal >= 72 || federalSignal >= 72) {
    return 'crisis';
  }

  if (federalSignal >= 38) {
    return 'federal';
  }

  if (localSignal >= 24) {
    return 'local';
  }

  return 'clear';
};

export const MurderBoard = (): ReactElement => {
  const [selectedCardId, setSelectedCardId] = useState<string>(PHASE_TWO_BOARD_CARDS[0].id);
  const [assignedSlots, setAssignedSlots] = useState<Record<string, ActiveVerbSlotId>>({});
  const [queuedDrop, setQueuedDrop] = useState<VerbSlotDropSignal | null>(null);
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

  const streetWireEntries = useGameStore((state): readonly EventLogEntry[] => {
    return state.streetWireEntries;
  });
  const addStreetWireLine = useGameStore((state): ((line: string, tone: 'info' | 'warning' | 'success') => void) => {
    return state.addStreetWireLine;
  });
  const simulationClock = useGameStore((state): typeof state.time => {
    return state.time;
  });
  const jeffriesSnapshot = useGameStore((state): typeof state.jeffries => {
    return state.jeffries;
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
    return Math.max(MIN_INTERACTIVE_ZOOM, quantizeZoom(value));
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

  const handleVerbSlotComplete = (signal: VerbSlotCompletionSignal): void => {
    const completedCard = PHASE_TWO_BOARD_CARDS.find((card) => card.id === signal.cardId);
    const completedSlot = PHASE_TWO_VERB_SLOTS.find((slot) => slot.id === signal.slotId);

    if (completedCard === undefined || completedSlot === undefined) {
      return;
    }

    const completedAtMs = Date.now();

    queueCompletedVerbAction({
      id: `verb-${signal.token}-${completedAtMs}`,
      slotId: signal.slotId,
      cardId: signal.cardId,
      cardTitle: signal.cardTitle,
      cardType: completedCard.cardType,
      completedAtMs,
    });

    addStreetWireLine(`${signal.cardTitle} finished ${completedSlot.title}. The books are about to move.`, 'info');
  };

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

    addStreetWireLine(`${movedCard.title} slid into ${slot.title}. The timer ring starts to burn.`, toneForSlot(slot.id));
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
          <p>
            Time: Shift {simulationClock.shift} / Day {simulationClock.day} / Week {simulationClock.week}
          </p>
          <p>
            Cash ${jeffriesSnapshot.cash} · Heat L {jeffriesSnapshot.localHeat.toFixed(1)} · F{' '}
            {jeffriesSnapshot.federalHeat.toFixed(1)}
          </p>

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
                return <VerbSlot key={slot.id} slot={slot} queuedDrop={queuedDrop} onComplete={handleVerbSlotComplete} />;
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
              style={{ transformOrigin: 'top left' }}
              animate={{ x: panX, y: panY, scale: zoom }}
              transition={{ type: 'tween', duration: 0 }}
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
                    heatLens={resolveCardHeatLens(card, jeffriesSnapshot.localHeat, jeffriesSnapshot.federalHeat)}
                    position={cardPosition}
                    boardZoom={zoom}
                    zIndex={cardZIndices[card.id] ?? 1}
                    onSelect={setSelectedCardId}
                  />
                );
              })}
            </motion.div>
          </section>

          <EventLog entries={streetWireEntries} />
        </div>
      </DndContext>
    </main>
  );
};
