type HeatComponentInit = {
  localHeat?: number;
  federalHeat?: number;
};

export class HeatComponent {
  localHeat: number;
  federalHeat: number;

  constructor(init: HeatComponentInit = {}) {
    this.localHeat = init.localHeat ?? 0;
    this.federalHeat = init.federalHeat ?? 0;
  }
}
