import { buildWorld, type IPreptimeWorld, type IRuntimeWorld } from 'sim-ecs';

import { BARTHOLOMEU_START } from '../data/bartholomeu';
import { AssetComponent, ResourceComponent } from './components/assets';
import { CardStateComponent } from './components/card-state';
import { HeatComponent } from './components/heat';
import { EntityIdComponent, IdentityComponent } from './components/identity';
import { LocationComponent, TurfComponent } from './components/location';
import { PsychologyComponent } from './components/psychology';
import { NetworkComponent, ReputationComponent } from './components/social';
import { TimeComponent } from './components/time';
import { VisualComponent } from './components/visual';
import { createHeatSystem } from './systems/heat.system';
import { createIdentitySystem } from './systems/identity.system';
import { createResourceSystem } from './systems/resource.system';
import { createTimeSystem } from './systems/time.system';
import type { ResourceType } from './types';

export const FOUNDATION_TICK_RATE_HZ = 60;

type SeedResource = {
  type: ResourceType;
  amount: number;
  decayRate: number;
  name: string;
  description: string;
};

export type FoundationSnapshot = {
  tick: number;
  time: {
    totalTicks: number;
    shift: number;
    day: number;
    week: number;
    year: number;
  };
  jeffries: {
    cash: number;
    localHeat: number;
    federalHeat: number;
    fear: number;
    respect: number;
  };
  resources: Record<ResourceType, number>;
};

export type DocksideSimulationOptions = {
  autoStart: boolean;
  tickRateHz: number;
  onTick: (snapshot: FoundationSnapshot) => void;
};

export type DocksideSimulationHandle = {
  runtimeWorld: IRuntimeWorld;
  stop: () => void;
};

const REGISTERED_COMPONENTS = [
  EntityIdComponent,
  IdentityComponent,
  AssetComponent,
  ResourceComponent,
  NetworkComponent,
  ReputationComponent,
  PsychologyComponent,
  TurfComponent,
  LocationComponent,
  HeatComponent,
  CardStateComponent,
  VisualComponent,
  TimeComponent,
] as const;

const createEntityIdAllocator = (): (() => number) => {
  let currentId = 0;

  return (): number => {
    currentId += 1;
    return currentId;
  };
};

const titleCaseFromSnake = (value: string): string => {
  return value
    .split('_')
    .map((part) => {
      if (part.length === 0) {
        return part;
      }

      return `${part[0].toUpperCase()}${part.slice(1)}`;
    })
    .join(' ');
};

const resourceSeeds = (): readonly SeedResource[] => {
  return [
    {
      type: 'muscle',
      amount: BARTHOLOMEU_START.resources.muscle,
      decayRate: 1,
      name: 'Muscle',
      description: 'Men on the hook. They do not wait forever.',
    },
    {
      type: 'intel',
      amount: BARTHOLOMEU_START.resources.intel,
      decayRate: 1,
      name: 'Intel',
      description: 'Rumors age faster than produce.',
    },
    {
      type: 'favors',
      amount: BARTHOLOMEU_START.resources.favors,
      decayRate: 1,
      name: 'Favors',
      description: 'A debt cools when left on the table.',
    },
    {
      type: 'evidence',
      amount: 0,
      decayRate: 0,
      name: 'Evidence',
      description: 'Paper that can ruin a quiet life.',
    },
    {
      type: 'cleanCash',
      amount: 0,
      decayRate: 0,
      name: 'Clean Cash',
      description: 'Money that can stand sunlight.',
    },
    {
      type: 'gingaPoints',
      amount: BARTHOLOMEU_START.resources.gingaPoints,
      decayRate: 0.5,
      name: 'Ginga Points',
      description: 'Balance held between threat and grace.',
    },
  ];
};

const initialResourceMap = (): Record<ResourceType, number> => {
  return {
    cash: 0,
    muscle: 0,
    intel: 0,
    favors: 0,
    evidence: 0,
    cleanCash: 0,
    gingaPoints: 0,
  };
};

const registerCoreEntities = (preptimeWorld: IPreptimeWorld): void => {
  const nextEntityId = createEntityIdAllocator();

  preptimeWorld
    .buildEntity()
    .with(EntityIdComponent, { value: 0 })
    .with(IdentityComponent, {
      name: 'Detroit Clock',
      description: 'Shift horn and siren schedule.',
      cardType: 'asset',
    })
    .with(TimeComponent, {
      year: BARTHOLOMEU_START.year,
      week: 1,
      day: 1,
      shift: 1,
      ticksPerShift: 60,
      ticksIntoShift: 0,
    })
    .build();

  preptimeWorld
    .buildEntity()
    .with(EntityIdComponent, { value: nextEntityId() })
    .with(IdentityComponent, {
      name: BARTHOLOMEU_START.name,
      description: `${BARTHOLOMEU_START.neighborhood} dock hand with no underworld contacts.`,
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
    .with(ReputationComponent, {
      fear: BARTHOLOMEU_START.reputation.fear,
      respect: BARTHOLOMEU_START.reputation.respect,
    })
    .with(PsychologyComponent, {
      fear: 0,
      ambition: BARTHOLOMEU_START.stats.cunning,
      loyalty: BARTHOLOMEU_START.stats.loyalty,
    })
    .with(NetworkComponent, {
      connections: [],
      loyaltyScore: BARTHOLOMEU_START.stats.loyalty,
    })
    .with(CardStateComponent, {
      state: { kind: 'idle' },
    })
    .with(VisualComponent, {
      cardFace: 'bartholomeu',
      revealed: true,
      dossierData: {
        city: BARTHOLOMEU_START.city,
        capoeira: BARTHOLOMEU_START.stats.capoeira,
      },
    })
    .build();

  for (const resource of resourceSeeds()) {
    preptimeWorld
      .buildEntity()
      .with(EntityIdComponent, { value: nextEntityId() })
      .with(IdentityComponent, {
        name: resource.name,
        description: resource.description,
        cardType: 'resource',
      })
      .with(ResourceComponent, {
        type: resource.type,
        amount: resource.amount,
        decayRate: resource.decayRate,
      })
      .with(CardStateComponent, {
        state: { kind: 'idle' },
      })
      .build();
  }

  for (const locationId of BARTHOLOMEU_START.locationsUnlocked) {
    preptimeWorld
      .buildEntity()
      .with(EntityIdComponent, { value: nextEntityId() })
      .with(IdentityComponent, {
        name: titleCaseFromSnake(locationId),
        description: `${titleCaseFromSnake(locationId)} location card.`,
        cardType: 'location',
      })
      .with(LocationComponent, {
        districtId: locationId,
        unlocked: true,
        activeSchemes: [],
      })
      .with(CardStateComponent, {
        state: { kind: 'idle' },
      })
      .build();
  }
};

export const createDocksidePreptimeWorld = (): IPreptimeWorld => {
  const timeSystem = createTimeSystem();
  const resourceSystem = createResourceSystem();
  const heatSystem = createHeatSystem();
  const identitySystem = createIdentitySystem();

  const preptimeWorld = buildWorld()
    .withName('dockside-foundation')
    .withComponents(...REGISTERED_COMPONENTS)
    .withDefaultScheduling((root): void => {
      root.addNewStage((stage): void => {
        stage.addSystem(timeSystem);
      });

      root.addNewStage((stage): void => {
        stage.addSystem(resourceSystem);
      });

      root.addNewStage((stage): void => {
        stage.addSystem(heatSystem);
      });

      root.addNewStage((stage): void => {
        stage.addSystem(identitySystem);
      });
    })
    .build();

  registerCoreEntities(preptimeWorld);

  return preptimeWorld;
};

export const createDocksideRuntimeWorld = async (): Promise<IRuntimeWorld> => {
  const preptimeWorld = createDocksidePreptimeWorld();
  return preptimeWorld.prepareRun();
};

export const runRuntimeSteps = async (
  runtimeWorld: IRuntimeWorld,
  stepCount: number,
): Promise<void> => {
  for (let index = 0; index < stepCount; index += 1) {
    await runtimeWorld.step();
  }
};

export const readFoundationSnapshot = (runtimeWorld: IRuntimeWorld): FoundationSnapshot | null => {
  let timeComponent: TimeComponent | undefined;
  let jeffriesAsset: AssetComponent | undefined;
  let jeffriesHeat: HeatComponent | undefined;
  let jeffriesReputation: ReputationComponent | undefined;

  const resources = initialResourceMap();

  for (const entity of runtimeWorld.getEntities()) {
    const time = entity.getComponent(TimeComponent);
    if (time !== undefined) {
      timeComponent = time;
    }

    const identity = entity.getComponent(IdentityComponent);
    const asset = entity.getComponent(AssetComponent);
    const heat = entity.getComponent(HeatComponent);
    const reputation = entity.getComponent(ReputationComponent);

    if (identity?.name === BARTHOLOMEU_START.name) {
      jeffriesAsset = asset;
      jeffriesHeat = heat;
      jeffriesReputation = reputation;
    }

    const resource = entity.getComponent(ResourceComponent);
    if (resource !== undefined) {
      resources[resource.type] += resource.amount;
    }
  }

  if (
    timeComponent === undefined ||
    jeffriesAsset === undefined ||
    jeffriesHeat === undefined ||
    jeffriesReputation === undefined
  ) {
    return null;
  }

  resources.cash = jeffriesAsset.cash;

  return {
    tick: timeComponent.totalTicks,
    time: {
      totalTicks: timeComponent.totalTicks,
      shift: timeComponent.shift,
      day: timeComponent.day,
      week: timeComponent.week,
      year: timeComponent.year,
    },
    jeffries: {
      cash: jeffriesAsset.cash,
      localHeat: jeffriesHeat.localHeat,
      federalHeat: jeffriesHeat.federalHeat,
      fear: jeffriesReputation.fear,
      respect: jeffriesReputation.respect,
    },
    resources,
  };
};

export const bootDocksideSimulation = async (
  options: Partial<DocksideSimulationOptions> = {},
): Promise<DocksideSimulationHandle> => {
  const runtimeWorld = await createDocksideRuntimeWorld();
  const tickRateHz = options.tickRateHz ?? FOUNDATION_TICK_RATE_HZ;
  const autoStart = options.autoStart ?? true;

  let timer: ReturnType<typeof setInterval> | undefined;
  let isStepping = false;

  const stepOnce = async (): Promise<void> => {
    if (isStepping) {
      return;
    }

    isStepping = true;

    try {
      await runtimeWorld.step();
      const snapshot = readFoundationSnapshot(runtimeWorld);

      if (snapshot !== null && options.onTick !== undefined) {
        options.onTick(snapshot);
      }
    } finally {
      isStepping = false;
    }
  };

  if (autoStart) {
    timer = setInterval((): void => {
      void stepOnce();
    }, 1000 / tickRateHz);
  }

  return {
    runtimeWorld,
    stop: (): void => {
      if (timer !== undefined) {
        clearInterval(timer);
      }

      runtimeWorld.stop();
    },
  };
};
