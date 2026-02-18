import type { EdgeType, EntityId } from '../types';

export type Edge = {
  targetId: EntityId;
  type: EdgeType;
  weight: number;
};

type NetworkComponentInit = {
  connections?: Edge[];
  loyaltyScore?: number;
};

export class NetworkComponent {
  connections: Edge[];
  loyaltyScore: number;

  constructor(init: NetworkComponentInit = {}) {
    this.connections = init.connections ?? [];
    this.loyaltyScore = init.loyaltyScore ?? 0;
  }
}

type ReputationComponentInit = {
  fear?: number;
  respect?: number;
};

export class ReputationComponent {
  fear: number;
  respect: number;

  constructor(init: ReputationComponentInit = {}) {
    this.fear = init.fear ?? 0;
    this.respect = init.respect ?? 0;
  }
}
