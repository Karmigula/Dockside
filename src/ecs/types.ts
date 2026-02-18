export type EntityId = number;

export type CardType = 'person' | 'resource' | 'situation' | 'location' | 'asset';

export type ResourceType =
  | 'cash'
  | 'muscle'
  | 'intel'
  | 'favors'
  | 'evidence'
  | 'cleanCash'
  | 'gingaPoints';

export type EdgeType = 'family' | 'business' | 'debt' | 'secret' | 'vendetta' | 'informant';

export type VerbSlotId =
  | 'work'
  | 'scheme'
  | 'train'
  | 'recruit'
  | 'bribe'
  | 'violence'
  | 'layLow';

export type CardState =
  | { kind: 'idle' }
  | { kind: 'decaying'; decayTimer: number }
  | { kind: 'inVerbSlot'; verbSlot: VerbSlotId; decayTimer?: number }
  | { kind: 'burned' };

export type GameLoopState =
  | { kind: 'boot' }
  | { kind: 'running'; week: number }
  | { kind: 'paused'; reason: string }
  | { kind: 'gameOver'; cause: string };

export type HeatTier = 'clear' | 'noticed' | 'investigated' | 'pressured' | 'crisis';
