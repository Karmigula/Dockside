import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type WheelEvent,
} from 'react';

import {
  FOUNDATION_VERB_SLOTS,
  type ActiveVerbSlotId,
  type BoardCardType,
} from '../data/cards/phase2.board';
import { getHeatTier } from '../ecs/systems/heat.system';
import type { FoundationBoardCard } from '../ecs/world';
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

type BoardCardCluster = FoundationBoardCard['cluster'];

type BoardCardTypeCountMap = Record<BoardCardType, number>;

type SlotAssignmentResolution = {
  accepted: boolean;
  nextAssignments: Record<string, ActiveVerbSlotId>;
  replacedCardId: string | null;
};

const OVERLAY_CARD_POSITION = { x: 0, y: 0 };

const MIN_INTERACTIVE_ZOOM = 0.1;
const ABSOLUTE_MIN_ZOOM = 0.68;
const DEFAULT_ZOOM = 0.72;
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

const buildInitialCardPositions = (cards: readonly FoundationBoardCard[]): Record<string, BoardCardPosition> => {
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

const buildInitialCardZIndices = (cards: readonly FoundationBoardCard[]): Record<string, number> => {
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

const createEmptyBoardCardTypeCountMap = (): BoardCardTypeCountMap => {
  return {
    person: 0,
    resource: 0,
    location: 0,
    situation: 0,
  };
};

const countRequiredCardTypes = (requiredTypes: readonly BoardCardType[]): BoardCardTypeCountMap => {
  return requiredTypes.reduce((counts, requiredType): BoardCardTypeCountMap => {
    return {
      ...counts,
      [requiredType]: counts[requiredType] + 1,
    };
  }, createEmptyBoardCardTypeCountMap());
};

const resolveSlotAssignmentForDrop = (
  currentAssignments: Record<string, ActiveVerbSlotId>,
  movedCard: FoundationBoardCard,
  slotId: ActiveVerbSlotId,
  requiredTypes: readonly BoardCardType[],
  cardsById: ReadonlyMap<string, FoundationBoardCard>,
): SlotAssignmentResolution => {
  const requiredTypeCounts = countRequiredCardTypes(requiredTypes);
  const requiredCountForType = requiredTypeCounts[movedCard.cardType];

  if (requiredCountForType <= 0) {
    return {
      accepted: false,
      nextAssignments: currentAssignments,
      replacedCardId: null,
    };
  }

  const nextWithoutMoved = Object.entries(currentAssignments).reduce((next, [assignedCardId, assignedSlotId]) => {
    if (assignedCardId === movedCard.id) {
      return next;
    }

    return {
      ...next,
      [assignedCardId]: assignedSlotId,
    };
  }, {} as Record<string, ActiveVerbSlotId>);

  const cardsAlreadyInSlot = Object.entries(nextWithoutMoved)
    .filter(([, assignedSlotId]): boolean => {
      return assignedSlotId === slotId;
    })
    .map(([assignedCardId]): FoundationBoardCard | undefined => {
      return cardsById.get(assignedCardId);
    })
    .filter((card): card is FoundationBoardCard => {
      return card !== undefined;
    });

  const cardsWithSameType = cardsAlreadyInSlot.filter((card): boolean => {
    return card.cardType === movedCard.cardType;
  });

  if (cardsWithSameType.length < requiredCountForType) {
    return {
      accepted: true,
      nextAssignments: {
        ...nextWithoutMoved,
        [movedCard.id]: slotId,
      },
      replacedCardId: null,
    };
  }

  const replacedCard = cardsWithSameType[0];

  if (replacedCard === undefined) {
    return {
      accepted: false,
      nextAssignments: currentAssignments,
      replacedCardId: null,
    };
  }

  const nextWithoutReplaced = Object.entries(nextWithoutMoved).reduce((next, [assignedCardId, assignedSlotId]) => {
    if (assignedCardId === replacedCard.id) {
      return next;
    }

    return {
      ...next,
      [assignedCardId]: assignedSlotId,
    };
  }, {} as Record<string, ActiveVerbSlotId>);

  return {
    accepted: true,
    nextAssignments: {
      ...nextWithoutReplaced,
      [movedCard.id]: slotId,
    },
    replacedCardId: replacedCard.id,
  };
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

const resolveCardHeatLens = (localHeat: number, federalHeat: number): 'clear' | 'local' | 'federal' | 'crisis' => {
  const localTier = getHeatTier(localHeat);
  const federalTier = getHeatTier(federalHeat);

  if (localTier === 'crisis' || federalTier === 'crisis') {
    return 'crisis';
  }

  if (federalTier !== 'clear') {
    return 'federal';
  }

  if (localTier !== 'clear') {
    return 'local';
  }

  return 'clear';
};

export const MurderBoard = (): ReactElement => {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [assignedSlots, setAssignedSlots] = useState<Record<string, ActiveVerbSlotId>>({});
  const [queuedDrop, setQueuedDrop] = useState<VerbSlotDropSignal | null>(null);
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [minZoom, setMinZoom] = useState<number>(DEFAULT_ZOOM);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, BoardCardPosition>>(() => {
    return {};
  });
  const [cardZIndices, setCardZIndices] = useState<Record<string, number>>(() => {
    return {};
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
  const boardCards = useGameStore((state): FoundationBoardCard[] => {
    return state.boardCards;
  });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const panAnchorRef = useRef<PanAnchor | null>(null);
  const boardCardsRef = useRef<FoundationBoardCard[]>(boardCards);
  const nextCardLayerRef = useRef<number>(2);
  const nextDropTokenRef = useRef<number>(1);

  useEffect((): void => {
    boardCardsRef.current = boardCards;
  }, [boardCards]);

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

  const seededCardPositions = useMemo((): Record<string, BoardCardPosition> => {
    return buildInitialCardPositions(boardCards);
  }, [boardCards]);

  const resolvedCardPositions = useMemo((): Record<string, BoardCardPosition> => {
    return boardCards.reduce((positions, card): Record<string, BoardCardPosition> => {
      return {
        ...positions,
        [card.id]: cardPositions[card.id] ?? seededCardPositions[card.id] ?? { x: 120, y: 140 },
      };
    }, {} as Record<string, BoardCardPosition>);
  }, [boardCards, cardPositions, seededCardPositions]);

  const seededCardZIndices = useMemo((): Record<string, number> => {
    return buildInitialCardZIndices(boardCards);
  }, [boardCards]);

  const resolvedCardZIndices = useMemo((): Record<string, number> => {
    return boardCards.reduce((layers, card): Record<string, number> => {
      return {
        ...layers,
        [card.id]: cardZIndices[card.id] ?? seededCardZIndices[card.id] ?? 1,
      };
    }, {} as Record<string, number>);
  }, [boardCards, cardZIndices, seededCardZIndices]);

  const resolvedSelectedCardId = useMemo((): string | null => {
    if (boardCards.length === 0) {
      return null;
    }

    if (selectedCardId !== null && boardCards.some((card) => card.id === selectedCardId)) {
      return selectedCardId;
    }

    return boardCards[0].id;
  }, [boardCards, selectedCardId]);

  const getNextCardLayer = (): number => {
    const highestLayer = Object.values(resolvedCardZIndices).reduce((highest, layer): number => {
      return layer > highest ? layer : highest;
    }, 1);

    const nextLayer = Math.max(nextCardLayerRef.current, highestLayer + 1);
    nextCardLayerRef.current = nextLayer + 1;

    return nextLayer;
  };

  const activeDragCard = useMemo((): FoundationBoardCard | null => {
    if (activeCardId === null) {
      return null;
    }

    return boardCards.find((card) => card.id === activeCardId) ?? null;
  }, [activeCardId, boardCards]);

  const activeCardTitle = activeDragCard?.title ?? null;

  const selectedCardTitle = useMemo((): string => {
    const selectedCard = boardCards.find((card) => card.id === resolvedSelectedCardId);
    return selectedCard?.title ?? 'No card selected';
  }, [boardCards, resolvedSelectedCardId]);

  const issueDropToken = (): number => {
    const token = nextDropTokenRef.current;
    nextDropTokenRef.current += 1;
    return token;
  };

  const handleVerbSlotComplete = useCallback((signal: VerbSlotCompletionSignal): void => {
    const completedSlot = FOUNDATION_VERB_SLOTS.find((slot) => slot.id === signal.slotId);

    if (completedSlot === undefined || signal.cards.length === 0) {
      return;
    }

    const completedAtMs = Date.now();

    queueCompletedVerbAction({
      id: `verb-${signal.token}-${completedAtMs}`,
      slotId: signal.slotId,
      cards: signal.cards,
      completedAtMs,
    });

    const leadCardTitle = signal.cards[0]?.cardTitle ?? 'The crew';
    const queuedCardSummary =
      signal.cards.length > 1
        ? `${leadCardTitle} plus ${signal.cards.length - 1} more cards`
        : leadCardTitle;

    addStreetWireLine(`${queuedCardSummary} finished ${completedSlot.title}. The books are about to move.`, 'info');
  }, [addStreetWireLine]);

  const handleDragStart = (event: DragStartEvent): void => {
    const cardId = String(event.active.id);
    const nextLayer = getNextCardLayer();
    const card = boardCards.find((candidate) => candidate.id === cardId);

    if (import.meta.env.DEV && card !== undefined) {
      console.debug(`[Dockside][drag] start ${card.title} (${cardId})`);
    }

    setActiveCardId(cardId);
    setSelectedCardId(cardId);
    setCardZIndices((current): Record<string, number> => {
      return {
        ...current,
        [cardId]: nextLayer,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveCardId(null);

    const cardId = String(event.active.id);
    const movedCard = boardCards.find((candidate) => candidate.id === cardId);

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
        const previous = current[cardId] ?? resolvedCardPositions[cardId];

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

    const slot = FOUNDATION_VERB_SLOTS.find((candidate) => candidate.id === String(overId));

    if (slot === undefined) {
      return;
    }

    const cardsById = boardCardsRef.current.reduce((indexedCards, card): Map<string, FoundationBoardCard> => {
      indexedCards.set(card.id, card);
      return indexedCards;
    }, new Map<string, FoundationBoardCard>());

    const assignmentResolution = resolveSlotAssignmentForDrop(
      assignedSlots,
      movedCard,
      slot.id,
      slot.requiredTypes,
      cardsById,
    );

    if (!assignmentResolution.accepted) {
      addStreetWireLine(
        `${movedCard.title} does not fit ${slot.title}. ${slot.requirementLabel}.`,
        'warning',
      );
      return;
    }

    const token = issueDropToken();
    const replacedCard =
      assignmentResolution.replacedCardId === null
        ? null
        : cardsById.get(assignmentResolution.replacedCardId) ?? null;

    console.info(`[Dockside] ${movedCard.title} dropped into ${slot.title}.`);

    setAssignedSlots(assignmentResolution.nextAssignments);

    setQueuedDrop({
      token,
      slotId: slot.id,
      cardId: movedCard.id,
      cardTitle: movedCard.title,
      cardType: movedCard.cardType,
    });

    if (replacedCard !== null) {
      addStreetWireLine(
        `${movedCard.title} slid into ${slot.title}. ${replacedCard.title} gets bumped off the stack.`,
        toneForSlot(slot.id),
      );
      return;
    }

    addStreetWireLine(`${movedCard.title} slid into ${slot.title}. The timer ring starts to burn.`, toneForSlot(slot.id));
  };

  const handleDragCancel = (): void => {
    if (import.meta.env.DEV) {
      console.debug('[Dockside][drag] cancel');
    }

    setActiveCardId(null);
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
          <p className="murder-board__kicker">Dockside / Phase 3</p>
          <h1>The Murder Board</h1>
          <p>Live ECS cards, verb timers, and a street wire fed by runtime outcomes.</p>
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
        onDragCancel={handleDragCancel}
      >
        <div className="murder-board__layout">
          <aside className="verb-rack" aria-label="Verb slots">
            <h2>Verb Slots</h2>

            <div className="verb-rack__slots">
              {FOUNDATION_VERB_SLOTS.map((slot) => {
                return <VerbSlot key={slot.id} slot={slot} queuedDrop={queuedDrop} onComplete={handleVerbSlotComplete} />;
              })}
            </div>
          </aside>

          <section
            ref={canvasRef}
            className="board-canvas"
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
              {boardCards.map((card) => {
                const cardPosition = resolvedCardPositions[card.id];

                if (cardPosition === undefined) {
                  return null;
                }

                return (
                  <Card
                    key={card.id}
                    card={card}
                    selected={resolvedSelectedCardId === card.id}
                    assignedSlot={assignedSlots[card.id] ?? null}
                    heatLens={resolveCardHeatLens(jeffriesSnapshot.localHeat, jeffriesSnapshot.federalHeat)}
                    position={cardPosition}
                    boardZoom={zoom}
                    zIndex={resolvedCardZIndices[card.id] ?? 1}
                    suppressDragTransform={activeCardId === card.id}
                    mutedWhileDragging={activeCardId === card.id}
                    onSelect={setSelectedCardId}
                  />
                );
              })}
            </motion.div>
          </section>

          <EventLog entries={streetWireEntries} />
        </div>

        <DragOverlay zIndex={1000} dropAnimation={null}>
          {activeDragCard === null ? null : (
            <Card
              card={activeDragCard}
              selected={resolvedSelectedCardId === activeDragCard.id}
              assignedSlot={assignedSlots[activeDragCard.id] ?? null}
              heatLens={resolveCardHeatLens(jeffriesSnapshot.localHeat, jeffriesSnapshot.federalHeat)}
              position={OVERLAY_CARD_POSITION}
              boardZoom={1}
              zIndex={1}
              onSelect={setSelectedCardId}
              interactive={false}
              dragOverlay={true}
              suppressDragTransform={true}
            />
          )}
        </DragOverlay>
      </DndContext>
    </main>
  );
};
