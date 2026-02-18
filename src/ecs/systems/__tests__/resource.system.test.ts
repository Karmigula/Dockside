import { buildWorld, type IRuntimeWorld } from 'sim-ecs';
import { afterEach, describe, expect, it } from 'vitest';

import { AssetComponent, ResourceComponent } from '../../components/assets';
import { TimeComponent } from '../../components/time';
import {
  createResourceSystem,
  isShiftBoundary,
  isWeekBoundary,
} from '../resource.system';

const runtimeWorlds: IRuntimeWorld[] = [];

afterEach((): void => {
  for (const runtimeWorld of runtimeWorlds) {
    runtimeWorld.stop();
  }

  runtimeWorlds.length = 0;
});

const createRuntimeWorld = async (
  time: ConstructorParameters<typeof TimeComponent>[0],
  cash: number,
  resource?: ConstructorParameters<typeof ResourceComponent>[0],
): Promise<IRuntimeWorld> => {
  const resourceSystem = createResourceSystem();

  const preptimeWorld = buildWorld()
    .withComponents(TimeComponent, AssetComponent, ResourceComponent)
    .withDefaultScheduling((root): void => {
      root.addNewStage((stage): void => {
        stage.addSystem(resourceSystem);
      });
    })
    .build();

  preptimeWorld.buildEntity().with(TimeComponent, time).build();
  preptimeWorld.buildEntity().with(AssetComponent, { cash }).build();

  if (resource !== undefined) {
    preptimeWorld.buildEntity().with(ResourceComponent, resource).build();
  }

  const runtimeWorld = await preptimeWorld.prepareRun();
  runtimeWorlds.push(runtimeWorld);

  return runtimeWorld;
};

const getAssetComponent = (runtimeWorld: IRuntimeWorld): AssetComponent => {
  for (const entity of runtimeWorld.getEntities()) {
    const assetComponent = entity.getComponent(AssetComponent);
    if (assetComponent !== undefined) {
      return assetComponent;
    }
  }

  throw new Error('AssetComponent missing in test world.');
};

const getResourceComponent = (runtimeWorld: IRuntimeWorld): ResourceComponent => {
  for (const entity of runtimeWorld.getEntities()) {
    const resourceComponent = entity.getComponent(ResourceComponent);
    if (resourceComponent !== undefined) {
      return resourceComponent;
    }
  }

  throw new Error('ResourceComponent missing in test world.');
};

describe('resource.system', (): void => {
  it('isShiftBoundary is true only when tick is on a completed shift edge', (): void => {
    expect(isShiftBoundary(new TimeComponent({ totalTicks: 0, ticksIntoShift: 0 }))).toBe(false);
    expect(isShiftBoundary(new TimeComponent({ totalTicks: 12, ticksIntoShift: 1 }))).toBe(false);
    expect(isShiftBoundary(new TimeComponent({ totalTicks: 12, ticksIntoShift: 0 }))).toBe(true);
  });

  it('isWeekBoundary requires shift boundary, day 1, and shift 1', (): void => {
    expect(
      isWeekBoundary(new TimeComponent({ totalTicks: 5, ticksIntoShift: 0, day: 1, shift: 1 })),
    ).toBe(true);
    expect(
      isWeekBoundary(new TimeComponent({ totalTicks: 5, ticksIntoShift: 1, day: 1, shift: 1 })),
    ).toBe(false);
    expect(
      isWeekBoundary(new TimeComponent({ totalTicks: 5, ticksIntoShift: 0, day: 2, shift: 1 })),
    ).toBe(false);
  });

  it('ResourceSystem adds one cash at each shift boundary', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld(
      { totalTicks: 3, ticksIntoShift: 0, day: 2, shift: 2 },
      2,
    );

    await runtimeWorld.step();

    expect(getAssetComponent(runtimeWorld).cash).toBe(3);
  });

  it('ResourceSystem decays weekly resources and clamps at zero', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld(
      { totalTicks: 7, ticksIntoShift: 0, day: 1, shift: 1 },
      4,
      { type: 'intel', amount: 1, decayRate: 3 },
    );

    await runtimeWorld.step();

    expect(getAssetComponent(runtimeWorld).cash).toBe(5);
    expect(getResourceComponent(runtimeWorld).amount).toBe(0);
  });

  it('ResourceSystem does not decay resources outside week boundary', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld(
      { totalTicks: 9, ticksIntoShift: 0, day: 3, shift: 1 },
      4,
      { type: 'favors', amount: 6, decayRate: 2 },
    );

    await runtimeWorld.step();

    expect(getResourceComponent(runtimeWorld).amount).toBe(6);
  });
});
