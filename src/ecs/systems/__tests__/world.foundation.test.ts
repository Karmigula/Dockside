import type { IRuntimeWorld } from 'sim-ecs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BARTHOLOMEU_START } from '../../../data/bartholomeu';
import { AssetComponent, ResourceComponent } from '../../components/assets';
import { HeatComponent } from '../../components/heat';
import { IdentityComponent } from '../../components/identity';
import { TimeComponent } from '../../components/time';
import {
  createDocksideRuntimeWorld,
  readFoundationSnapshot,
  runRuntimeSteps,
} from '../../world';

const runtimeWorlds: IRuntimeWorld[] = [];

afterEach((): void => {
  for (const runtimeWorld of runtimeWorlds) {
    runtimeWorld.stop();
  }

  runtimeWorlds.length = 0;
  vi.restoreAllMocks();
});

const trackRuntime = async (): Promise<IRuntimeWorld> => {
  const runtimeWorld = await createDocksideRuntimeWorld();
  runtimeWorlds.push(runtimeWorld);
  return runtimeWorld;
};

describe('world.foundation', (): void => {
  it('loads Bartholomeu starting state from bartholomeu.ts into ECS', async (): Promise<void> => {
    const runtimeWorld = await trackRuntime();

    const jeffriesEntity = [...runtimeWorld.getEntities()].find((entity) => {
      const identityComponent = entity.getComponent(IdentityComponent);
      return identityComponent?.name === BARTHOLOMEU_START.name;
    });

    expect(jeffriesEntity).toBeDefined();

    const assetComponent = jeffriesEntity?.getComponent(AssetComponent);
    const heatComponent = jeffriesEntity?.getComponent(HeatComponent);

    expect(assetComponent?.cash).toBe(BARTHOLOMEU_START.resources.cash);
    expect(heatComponent?.localHeat).toBe(BARTHOLOMEU_START.resources.heat.local);
    expect(heatComponent?.federalHeat).toBe(BARTHOLOMEU_START.resources.heat.federal);
  });

  it('advances time and accrues one cash after 60 ticks (one shift)', async (): Promise<void> => {
    const runtimeWorld = await trackRuntime();
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    await runRuntimeSteps(runtimeWorld, 60);

    const snapshot = readFoundationSnapshot(runtimeWorld);
    expect(snapshot).not.toBeNull();

    expect(snapshot?.time.totalTicks).toBe(60);
    expect(snapshot?.time.shift).toBe(2);
    expect(snapshot?.time.day).toBe(1);
    expect(snapshot?.jeffries.cash).toBe(BARTHOLOMEU_START.resources.cash + 1);
  });

  it('creates a readable snapshot with all tracked resources', async (): Promise<void> => {
    const runtimeWorld = await trackRuntime();

    const snapshot = readFoundationSnapshot(runtimeWorld);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.resources.cash).toBe(BARTHOLOMEU_START.resources.cash);
    expect(snapshot?.resources.favors).toBe(BARTHOLOMEU_START.resources.favors);
    expect(snapshot?.resources.intel).toBe(BARTHOLOMEU_START.resources.intel);
    expect(snapshot?.resources.muscle).toBe(BARTHOLOMEU_START.resources.muscle);
  });

  it('registers decaying resource entities for weekly decay processing', async (): Promise<void> => {
    const runtimeWorld = await trackRuntime();

    const resourceTypes = [...runtimeWorld.getEntities()]
      .map((entity) => entity.getComponent(ResourceComponent)?.type)
      .filter((resourceType): resourceType is NonNullable<typeof resourceType> => {
        return resourceType !== undefined;
      })
      .sort();

    expect(resourceTypes).toEqual([
      'cleanCash',
      'evidence',
      'favors',
      'gingaPoints',
      'intel',
      'muscle',
    ]);
  });

  it('initializes a clock entity with TimeComponent', async (): Promise<void> => {
    const runtimeWorld = await trackRuntime();

    const clockEntity = [...runtimeWorld.getEntities()].find((entity) => {
      return entity.getComponent(TimeComponent) !== undefined;
    });

    expect(clockEntity).toBeDefined();

    const timeComponent = clockEntity?.getComponent(TimeComponent);
    expect(timeComponent?.year).toBe(BARTHOLOMEU_START.year);
    expect(timeComponent?.week).toBe(1);
    expect(timeComponent?.day).toBe(1);
    expect(timeComponent?.shift).toBe(1);
  });
});
