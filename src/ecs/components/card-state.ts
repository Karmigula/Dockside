import type { CardState, VerbSlotId } from '../types';

type CardStateComponentInit = {
  state?: CardState;
  decayTimer?: number;
  verbSlot?: VerbSlotId;
};

export class CardStateComponent {
  state: CardState;
  decayTimer?: number;
  verbSlot?: VerbSlotId;

  constructor(init: CardStateComponentInit = {}) {
    this.state = init.state ?? { kind: 'idle' };
    this.decayTimer = init.decayTimer;
    this.verbSlot = init.verbSlot;
  }
}
