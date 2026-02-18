import type { ResourceType } from '../types';

type AssetComponentInit = {
  cash?: number;
  launderedStatus?: boolean;
};

export class AssetComponent {
  cash: number;
  launderedStatus: boolean;

  constructor(init: AssetComponentInit = {}) {
    this.cash = init.cash ?? 0;
    this.launderedStatus = init.launderedStatus ?? false;
  }
}

type ResourceComponentInit = {
  type: ResourceType;
  amount?: number;
  decayRate?: number;
};

export class ResourceComponent {
  type: ResourceType;
  amount: number;
  decayRate: number;

  constructor(init: ResourceComponentInit) {
    this.type = init.type;
    this.amount = init.amount ?? 0;
    this.decayRate = init.decayRate ?? 0;
  }
}
