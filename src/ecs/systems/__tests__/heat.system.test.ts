import { buildWorld, type IRuntimeWorld } from 'sim-ecs';
import { afterEach, describe, expect, it } from 'vitest';

import { HeatComponent } from '../../components/heat';
import {
  FEDERAL_HEAT_DECAY_PER_TICK,
  LOCAL_HEAT_DECAY_PER_TICK,
  clampHeat,
  createHeatSystem,
  getHeatTier,
} from '../heat.system';

const runtimeWorlds: IRuntimeWorld[] = [];

afterEach((): void => {
  for (const runtimeWorld of runtimeWorlds) {
    runtimeWorld.stop();
  }

  runtimeWorlds.length = 0;
});

const createRuntimeWorld = async (
  init: ConstructorParameters<typeof HeatComponent>[0],
): Promise<IRuntimeWorld> => {
  const heatSystem = createHeatSystem();

  const preptimeWorld = buildWorld()
    .withComponents(HeatComponent)
    .withDefaultScheduling((root): void => {
      root.addNewStage((stage): void => {
        stage.addSystem(heatSystem);
      });
    })
    .build();

  preptimeWorld.buildEntity().with(HeatComponent, init).build();

  const runtimeWorld = await preptimeWorld.prepareRun();
  runtimeWorlds.push(runtimeWorld);

  return runtimeWorld;
};

const getHeatComponent = (runtimeWorld: IRuntimeWorld): HeatComponent => {
  const entity = [...runtimeWorld.getEntities()][0];
  const heatComponent = entity.getComponent(HeatComponent);

  if (heatComponent === undefined) {
    throw new Error('HeatComponent missing from test entity.');
  }

  return heatComponent;
};

describe('heat.system', (): void => {
  it('clampHeat keeps values in [0, 100]', (): void => {
    expect(clampHeat(-5)).toBe(0);
    expect(clampHeat(12)).toBe(12);
    expect(clampHeat(145)).toBe(100);
  });

  it('getHeatTier maps local heat to the correct threshold tier', (): void => {
    expect(getHeatTier(0)).toBe('clear');
    expect(getHeatTier(35)).toBe('noticed');
    expect(getHeatTier(55)).toBe('investigated');
    expect(getHeatTier(77)).toBe('pressured');
    expect(getHeatTier(95)).toBe('crisis');
  });

  it('HeatSystem decays local and federal heat by configured per-tick amounts', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld({ localHeat: 50, federalHeat: 50 });

    await runtimeWorld.step();

    const heatComponent = getHeatComponent(runtimeWorld);
    expect(heatComponent.localHeat).toBeCloseTo(50 - LOCAL_HEAT_DECAY_PER_TICK, 4);
    expect(heatComponent.federalHeat).toBeCloseTo(50 - FEDERAL_HEAT_DECAY_PER_TICK, 4);
  });

  it('HeatSystem clamps heat values after decay', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld({ localHeat: 0.01, federalHeat: 101 });

    await runtimeWorld.step();

    const heatComponent = getHeatComponent(runtimeWorld);
    expect(heatComponent.localHeat).toBe(0);
    expect(heatComponent.federalHeat).toBe(100);
  });
});
