import { createSystem, queryComponents, Write } from 'sim-ecs';

import { HeatComponent } from '../components/heat';
import type { HeatTier } from '../types';

export const LOCAL_HEAT_DECAY_PER_TICK = 0.02;
export const FEDERAL_HEAT_DECAY_PER_TICK = 0.01;

export const clampHeat = (value: number): number => {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
};

export const getHeatTier = (localHeat: number): HeatTier => {
  if (localHeat <= 20) {
    return 'clear';
  }

  if (localHeat <= 40) {
    return 'noticed';
  }

  if (localHeat <= 60) {
    return 'investigated';
  }

  if (localHeat <= 80) {
    return 'pressured';
  }

  return 'crisis';
};

const heatSystemBuilder = createSystem({
  query: queryComponents({
    heatComponent: Write(HeatComponent),
  }),
})
  .withName('HeatSystem')
  .withRunFunction(async ({ query }): Promise<void> => {
    await query.execute(({ heatComponent }): void => {
      heatComponent.localHeat = clampHeat(heatComponent.localHeat - LOCAL_HEAT_DECAY_PER_TICK);
      heatComponent.federalHeat = clampHeat(heatComponent.federalHeat - FEDERAL_HEAT_DECAY_PER_TICK);
    });
  });

export type HeatSystemInstance = ReturnType<typeof heatSystemBuilder.build>;

export const createHeatSystem = (): HeatSystemInstance => {
  return heatSystemBuilder.build();
};

export const HeatSystem = createHeatSystem();
