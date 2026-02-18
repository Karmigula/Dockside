import type { CardType, EntityId } from '../types';

type IdentityComponentInit = {
  name: string;
  description: string;
  cardType: CardType;
};

export class IdentityComponent {
  name: string;
  description: string;
  cardType: CardType;

  constructor(init: IdentityComponentInit) {
    this.name = init.name;
    this.description = init.description;
    this.cardType = init.cardType;
  }
}

type EntityIdComponentInit = {
  value?: EntityId;
};

export class EntityIdComponent {
  value: EntityId;

  constructor(init: EntityIdComponentInit = {}) {
    this.value = init.value ?? 0;
  }
}
