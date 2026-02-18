import { buildWorld, type IRuntimeWorld } from 'sim-ecs';
import { afterEach, describe, expect, it } from 'vitest';

import { BARTHOLOMEU_START } from '../../../data/bartholomeu';
import { AssetComponent } from '../../components/assets';
import { HeatComponent } from '../../components/heat';
import { IdentityComponent } from '../../components/identity';
import { LocationComponent } from '../../components/location';
import { createVerbSystem, type VerbAction, type VerbActionCard, type VerbResolution } from '../verb.system';

const runtimeWorlds: IRuntimeWorld[] = [];

afterEach((): void => {
  for (const runtimeWorld of runtimeWorlds) {
    runtimeWorld.stop();
  }

  runtimeWorlds.length = 0;
});

type VerbHarness = {
  runtimeWorld: IRuntimeWorld;
  queuedActions: VerbAction[];
  resolutions: VerbResolution[];
};

type HarnessLocation = {
  districtId: string;
  unlocked: boolean;
};

const createHarness = async (locations: readonly HarnessLocation[]): Promise<VerbHarness> => {
  const queuedActions: VerbAction[] = [];
  const resolutions: VerbResolution[] = [];

  const verbSystem = createVerbSystem({
    dequeueVerbActions: (): VerbAction[] => {
      const drained = [...queuedActions];
      queuedActions.length = 0;
      return drained;
    },
    onResolved: (resolution): void => {
      resolutions.push(resolution);
    },
  });

  const preptimeWorld = buildWorld()
    .withComponents(IdentityComponent, AssetComponent, HeatComponent, LocationComponent)
    .withDefaultScheduling((root): void => {
      root.addNewStage((stage): void => {
        stage.addSystem(verbSystem);
      });
    })
    .build();

  preptimeWorld
    .buildEntity()
    .with(IdentityComponent, {
      name: BARTHOLOMEU_START.name,
      description: 'Jeffries runtime for VerbSystem tests.',
      cardType: 'person',
    })
    .with(AssetComponent, {
      cash: BARTHOLOMEU_START.resources.cash,
      launderedStatus: false,
    })
    .with(HeatComponent, {
      localHeat: BARTHOLOMEU_START.resources.heat.local,
      federalHeat: BARTHOLOMEU_START.resources.heat.federal,
    })
    .build();

  for (const location of locations) {
    preptimeWorld
      .buildEntity()
      .with(LocationComponent, {
        districtId: location.districtId,
        unlocked: location.unlocked,
      })
      .build();
  }

  const runtimeWorld = await preptimeWorld.prepareRun();
  runtimeWorlds.push(runtimeWorld);

  return {
    runtimeWorld,
    queuedActions,
    resolutions,
  };
};

const readJeffriesCash = (runtimeWorld: IRuntimeWorld): number => {
  for (const entity of runtimeWorld.getEntities()) {
    const identityComponent = entity.getComponent(IdentityComponent);

    if (identityComponent?.name !== BARTHOLOMEU_START.name) {
      continue;
    }

    const assetComponent = entity.getComponent(AssetComponent);

    if (assetComponent === undefined) {
      break;
    }

    return assetComponent.cash;
  }

  throw new Error('Jeffries AssetComponent not found in runtime world.');
};

const readJeffriesHeat = (runtimeWorld: IRuntimeWorld): HeatComponent => {
  for (const entity of runtimeWorld.getEntities()) {
    const identityComponent = entity.getComponent(IdentityComponent);

    if (identityComponent?.name !== BARTHOLOMEU_START.name) {
      continue;
    }

    const heatComponent = entity.getComponent(HeatComponent);

    if (heatComponent === undefined) {
      break;
    }

    return heatComponent;
  }

  throw new Error('Jeffries HeatComponent not found in runtime world.');
};

const createVerbAction = (overrides: Partial<VerbAction> = {}): VerbAction => {
  return {
    id: 'verb-work-1',
    slotId: 'work',
    cards: [
      {
        cardId: 'the-docks',
        cardTitle: 'The Docks',
        cardType: 'location',
      },
    ],
    completedAtMs: 1000,
    ...overrides,
  };
};

const card = (cardId: string, cardTitle: string, cardType: VerbActionCard['cardType']): VerbActionCard => {
  return {
    cardId,
    cardTitle,
    cardType,
  };
};

describe('verb.system', (): void => {
  it('pays +1 cash when Work resolves on an unlocked location', async (): Promise<void> => {
    const { runtimeWorld, queuedActions, resolutions } = await createHarness([
      {
        districtId: 'the_docks',
        unlocked: true,
      },
    ]);

    queuedActions.push(createVerbAction());

    await runtimeWorld.step();

    expect(readJeffriesCash(runtimeWorld)).toBe(BARTHOLOMEU_START.resources.cash + 1);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]?.tone).toBe('success');
    expect(resolutions[0]?.cashDelta).toBe(1);
  });

  it('rejects Work if the location is not unlocked', async (): Promise<void> => {
    const { runtimeWorld, queuedActions, resolutions } = await createHarness([
      {
        districtId: 'the_docks',
        unlocked: false,
      },
    ]);

    queuedActions.push(createVerbAction());

    await runtimeWorld.step();

    expect(readJeffriesCash(runtimeWorld)).toBe(BARTHOLOMEU_START.resources.cash);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]?.tone).toBe('warning');
    expect(resolutions[0]?.cashDelta).toBe(0);
  });

  it('marks non-Work verbs as unresolved placeholders without mutating cash', async (): Promise<void> => {
    const { runtimeWorld, queuedActions, resolutions } = await createHarness([
      {
        districtId: 'the_docks',
        unlocked: true,
      },
    ]);

    queuedActions.push(
      createVerbAction({
        id: 'verb-scheme-1',
        slotId: 'scheme',
        cards: [
          card('shipment-window', 'Shipment Looking the Other Way', 'situation'),
          card('intel', 'Intel', 'resource'),
        ],
      }),
    );

    await runtimeWorld.step();

    expect(readJeffriesCash(runtimeWorld)).toBe(BARTHOLOMEU_START.resources.cash + 2);
    expect(readJeffriesHeat(runtimeWorld).localHeat).toBe(BARTHOLOMEU_START.resources.heat.local + 6);
    expect(readJeffriesHeat(runtimeWorld).federalHeat).toBe(BARTHOLOMEU_START.resources.heat.federal + 2);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]?.tone).toBe('success');
    expect(resolutions[0]?.cashDelta).toBe(2);
    expect(resolutions[0]?.localHeatDelta).toBe(6);
    expect(resolutions[0]?.federalHeatDelta).toBe(2);
  });

  it('warns and applies no effect when Scheme receives a non-situation card', async (): Promise<void> => {
    const { runtimeWorld, queuedActions, resolutions } = await createHarness([
      {
        districtId: 'the_docks',
        unlocked: true,
      },
    ]);

    queuedActions.push(
      createVerbAction({
        id: 'verb-scheme-2',
        slotId: 'scheme',
        cards: [
          card('the-docks', 'The Docks', 'location'),
          card('intel', 'Intel', 'resource'),
        ],
      }),
    );

    await runtimeWorld.step();

    expect(readJeffriesCash(runtimeWorld)).toBe(BARTHOLOMEU_START.resources.cash);
    expect(readJeffriesHeat(runtimeWorld).localHeat).toBe(BARTHOLOMEU_START.resources.heat.local);
    expect(readJeffriesHeat(runtimeWorld).federalHeat).toBe(BARTHOLOMEU_START.resources.heat.federal);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]?.tone).toBe('warning');
    expect(resolutions[0]?.cashDelta).toBe(0);
    expect(resolutions[0]?.localHeatDelta).toBe(0);
    expect(resolutions[0]?.federalHeatDelta).toBe(0);
  });

  it('warns and applies no effect when Scheme is missing a resource card', async (): Promise<void> => {
    const { runtimeWorld, queuedActions, resolutions } = await createHarness([
      {
        districtId: 'the_docks',
        unlocked: true,
      },
    ]);

    queuedActions.push(
      createVerbAction({
        id: 'verb-scheme-3',
        slotId: 'scheme',
        cards: [card('shipment-window', 'Shipment Looking the Other Way', 'situation')],
      }),
    );

    await runtimeWorld.step();

    expect(readJeffriesCash(runtimeWorld)).toBe(BARTHOLOMEU_START.resources.cash);
    expect(readJeffriesHeat(runtimeWorld).localHeat).toBe(BARTHOLOMEU_START.resources.heat.local);
    expect(readJeffriesHeat(runtimeWorld).federalHeat).toBe(BARTHOLOMEU_START.resources.heat.federal);
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]?.tone).toBe('warning');
    expect(resolutions[0]?.cashDelta).toBe(0);
    expect(resolutions[0]?.localHeatDelta).toBe(0);
    expect(resolutions[0]?.federalHeatDelta).toBe(0);
  });
});
