import type { EntityId } from '../types';

type TurfComponentInit = {
  districtId: string;
  controlLevel?: number;
};

export class TurfComponent {
  districtId: string;
  controlLevel: number;

  constructor(init: TurfComponentInit) {
    this.districtId = init.districtId;
    this.controlLevel = init.controlLevel ?? 0;
  }
}

type LocationComponentInit = {
  districtId: string;
  unlocked?: boolean;
  activeSchemes?: EntityId[];
};

export class LocationComponent {
  districtId: string;
  unlocked: boolean;
  activeSchemes: EntityId[];

  constructor(init: LocationComponentInit) {
    this.districtId = init.districtId;
    this.unlocked = init.unlocked ?? false;
    this.activeSchemes = init.activeSchemes ?? [];
  }
}
