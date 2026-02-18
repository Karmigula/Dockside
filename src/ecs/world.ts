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
import { createVerbSystem, type VerbResolution, type VerbSystemOptions } from './systems/verb.system';
import type { CardType, ResourceType } from './types';

export const FOUNDATION_TICK_RATE_HZ = 60;

type SeedResource = {
  type: ResourceType;
  amount: number;
  decayRate: number;
  name: string;
  description: string;
};

type SeedBoardCard = {
  cardFace: string;
  name: string;
  subtitle: string;
  description: string;
  cardType: Exclude<CardType, 'asset' | 'resource' | 'location'>;
  trustDots: number;
  stateLabel: string;
  decaying: boolean;
};

type FoundationBoardCardType = Exclude<CardType, 'asset'>;

type FoundationBoardCardCluster = 'people' | 'locations' | 'situations' | 'resources';

export type FoundationBoardCard = {
  id: string;
  title: string;
  subtitle: string;
  cardType: FoundationBoardCardType;
  flavor: string;
  trustDots: number;
  stateLabel: string;
  decaying: boolean;
  cluster: FoundationBoardCardCluster;
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
  boardCards: FoundationBoardCard[];
};

export type DocksideSimulationOptions = {
  autoStart: boolean;
  tickRateHz: number;
  onTick: (snapshot: FoundationSnapshot) => void;
  dequeueVerbActions: VerbSystemOptions['dequeueVerbActions'];
  onVerbResolved: (resolution: VerbResolution) => void;
};

export type DocksideSimulationHandle = {
  runtimeWorld: IRuntimeWorld;
  stop: () => void;
};

type DocksideWorldSystemOptions = Partial<
  Pick<DocksideSimulationOptions, 'dequeueVerbActions' | 'onVerbResolved'>
>;

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

const foundationPersonSeeds = (): readonly SeedBoardCard[] => {
  return [
    {
      cardFace: 'ray-kowalski',
      name: 'Ray Kowalski',
      subtitle: 'Dock Foreman / Local 299',
      description: 'Ray owes money and time. Both clocks are louder every night.',
      cardType: 'person',
      trustDots: 2,
      stateLabel: 'Contacted',
      decaying: false,
    },
    {
      cardFace: 'sal-marchetti',
      name: 'Sal Marchetti',
      subtitle: 'Bookmaker / River Row',
      description: 'He smiles with his hands in his pockets. Nobody asks what those hands hold.',
      cardType: 'person',
      trustDots: 1,
      stateLabel: 'Watching',
      decaying: false,
    },
  ];
};

const foundationSituationSeeds = (): readonly SeedBoardCard[] => {
  return [
    {
      cardFace: 'shipment-window',
      name: 'Shipment Looking the Other Way',
      subtitle: 'Situation Card',
      description: 'A container shows up Thursday. The manifest is clean. The locks are not.',
      cardType: 'situation',
      trustDots: 0,
      stateLabel: 'Burns in 2 Shifts',
      decaying: true,
    },
    {
      cardFace: 'unmarked-van',
      name: 'Unmarked Van, Lot C',
      subtitle: 'Situation Card',
      description: 'Someone is moving weight after midnight. You can watch, lift, or sell the story.',
      cardType: 'situation',
      trustDots: 0,
      stateLabel: 'Burns in 1 Shift',
      decaying: true,
    },
  ];
};

const toKebabFromSnake = (value: string): string => {
  return value.toLowerCase().replaceAll('_', '-');
};

const toKebabFromCamel = (value: string): string => {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
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

  for (const person of foundationPersonSeeds()) {
    preptimeWorld
      .buildEntity()
      .with(EntityIdComponent, { value: nextEntityId() })
      .with(IdentityComponent, {
        name: person.name,
        description: person.description,
        cardType: person.cardType,
      })
      .with(CardStateComponent, {
        state: { kind: 'idle' },
      })
      .with(VisualComponent, {
        cardFace: person.cardFace,
        revealed: true,
        dossierData: {
          subtitle: person.subtitle,
          trustDots: person.trustDots,
          stateLabel: person.stateLabel,
          decaying: person.decaying,
        },
      })
      .build();
  }

  for (const situation of foundationSituationSeeds()) {
    preptimeWorld
      .buildEntity()
      .with(EntityIdComponent, { value: nextEntityId() })
      .with(IdentityComponent, {
        name: situation.name,
        description: situation.description,
        cardType: situation.cardType,
      })
      .with(CardStateComponent, {
        state: situation.decaying
          ? {
              kind: 'decaying',
              decayTimer: 2,
            }
          : { kind: 'idle' },
      })
      .with(VisualComponent, {
        cardFace: situation.cardFace,
        revealed: true,
        dossierData: {
          subtitle: situation.subtitle,
          trustDots: situation.trustDots,
          stateLabel: situation.stateLabel,
          decaying: situation.decaying,
        },
      })
      .build();
  }

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
      .with(VisualComponent, {
        cardFace: toKebabFromCamel(resource.type),
        revealed: true,
        dossierData: {
          subtitle: 'Resource Card',
        },
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
      .with(VisualComponent, {
        cardFace: toKebabFromSnake(locationId),
        revealed: true,
        dossierData: {
          subtitle: 'Location Card',
        },
      })
      .build();
  }
};

export const createDocksidePreptimeWorld = (options: DocksideWorldSystemOptions = {}): IPreptimeWorld => {
  const timeSystem = createTimeSystem();
  const verbSystem = createVerbSystem({
    dequeueVerbActions: options.dequeueVerbActions,
    onResolved: options.onVerbResolved,
  });
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
        stage.addSystem(verbSystem);
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

export const createDocksideRuntimeWorld = async (
  options: DocksideWorldSystemOptions = {},
): Promise<IRuntimeWorld> => {
  const preptimeWorld = createDocksidePreptimeWorld(options);
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

const clusterRank: Record<FoundationBoardCardCluster, number> = {
  people: 0,
  locations: 1,
  situations: 2,
  resources: 3,
};

const resolveBoardCluster = (cardType: FoundationBoardCardType): FoundationBoardCardCluster => {
  if (cardType === 'person') {
    return 'people';
  }

  if (cardType === 'location') {
    return 'locations';
  }

  if (cardType === 'situation') {
    return 'situations';
  }

  return 'resources';
};

const resolveBoardCardId = (
  cardType: FoundationBoardCardType,
  visualComponent: VisualComponent | undefined,
  locationComponent: LocationComponent | undefined,
  resourceComponent: ResourceComponent | undefined,
  identityComponent: IdentityComponent,
): string => {
  if (visualComponent !== undefined && visualComponent.cardFace !== 'blank') {
    return visualComponent.cardFace;
  }

  if (cardType === 'location' && locationComponent !== undefined) {
    return toKebabFromSnake(locationComponent.districtId);
  }

  if (cardType === 'resource' && resourceComponent !== undefined) {
    return toKebabFromCamel(resourceComponent.type);
  }

  return identityComponent.name
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_]+/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '');
};

const resolveBoardCardSubtitle = (
  cardType: FoundationBoardCardType,
  visualComponent: VisualComponent | undefined,
): string => {
  const subtitle = visualComponent?.dossierData.subtitle;

  if (typeof subtitle === 'string' && subtitle.trim().length > 0) {
    return subtitle;
  }

  if (cardType === 'location') {
    return 'Location Card';
  }

  if (cardType === 'situation') {
    return 'Situation Card';
  }

  if (cardType === 'resource') {
    return 'Resource Card';
  }

  return 'Person Card';
};

const resolveBoardStateLabel = (
  cardType: FoundationBoardCardType,
  cardStateComponent: CardStateComponent | undefined,
  locationComponent: LocationComponent | undefined,
  resourceComponent: ResourceComponent | undefined,
  visualComponent: VisualComponent | undefined,
): string => {
  const dossierStateLabel = visualComponent?.dossierData.stateLabel;

  if (typeof dossierStateLabel === 'string' && dossierStateLabel.trim().length > 0) {
    return dossierStateLabel;
  }

  if (cardStateComponent?.state.kind === 'decaying') {
    return `Burns in ${cardStateComponent.state.decayTimer} Shifts`;
  }

  if (cardType === 'location' && locationComponent !== undefined) {
    return locationComponent.unlocked ? 'Unlocked' : 'Locked';
  }

  if (cardType === 'resource' && resourceComponent !== undefined) {
    return `Stack x${Math.max(0, Math.floor(resourceComponent.amount))}`;
  }

  return cardStateComponent?.state.kind === 'inVerbSlot' ? 'In Slot' : 'Idle';
};

const resolveTrustDots = (visualComponent: VisualComponent | undefined): number => {
  const trustDots = visualComponent?.dossierData.trustDots;

  if (typeof trustDots !== 'number' || Number.isNaN(trustDots)) {
    return 0;
  }

  return Math.max(0, Math.min(5, Math.round(trustDots)));
};

const resolveDecaying = (
  cardType: FoundationBoardCardType,
  cardStateComponent: CardStateComponent | undefined,
  resourceComponent: ResourceComponent | undefined,
  visualComponent: VisualComponent | undefined,
): boolean => {
  const dossierDecaying = visualComponent?.dossierData.decaying;

  if (typeof dossierDecaying === 'boolean') {
    return dossierDecaying;
  }

  if (cardStateComponent?.state.kind === 'decaying') {
    return true;
  }

  if (cardType === 'resource' && resourceComponent !== undefined) {
    return resourceComponent.decayRate > 0;
  }

  return false;
};

export const readFoundationSnapshot = (runtimeWorld: IRuntimeWorld): FoundationSnapshot | null => {
  let timeComponent: TimeComponent | undefined;
  let jeffriesAsset: AssetComponent | undefined;
  let jeffriesHeat: HeatComponent | undefined;
  let jeffriesReputation: ReputationComponent | undefined;

  const resources = initialResourceMap();
  const boardCards: FoundationBoardCard[] = [];

  for (const entity of runtimeWorld.getEntities()) {
    const time = entity.getComponent(TimeComponent);
    if (time !== undefined) {
      timeComponent = time;
    }

    const identity = entity.getComponent(IdentityComponent);
    const asset = entity.getComponent(AssetComponent);
    const heat = entity.getComponent(HeatComponent);
    const reputation = entity.getComponent(ReputationComponent);
    const cardStateComponent = entity.getComponent(CardStateComponent);
    const visualComponent = entity.getComponent(VisualComponent);
    const locationComponent = entity.getComponent(LocationComponent);

    if (identity?.name === BARTHOLOMEU_START.name) {
      jeffriesAsset = asset;
      jeffriesHeat = heat;
      jeffriesReputation = reputation;
    }

    const resource = entity.getComponent(ResourceComponent);
    if (resource !== undefined) {
      resources[resource.type] += resource.amount;
    }

    if (identity === undefined || identity.cardType === 'asset') {
      continue;
    }

    const foundationCardType = identity.cardType as FoundationBoardCardType;

    boardCards.push({
      id: resolveBoardCardId(foundationCardType, visualComponent, locationComponent, resource, identity),
      title: identity.name,
      subtitle: resolveBoardCardSubtitle(foundationCardType, visualComponent),
      cardType: foundationCardType,
      flavor: identity.description,
      trustDots: resolveTrustDots(visualComponent),
      stateLabel: resolveBoardStateLabel(
        foundationCardType,
        cardStateComponent,
        locationComponent,
        resource,
        visualComponent,
      ),
      decaying: resolveDecaying(foundationCardType, cardStateComponent, resource, visualComponent),
      cluster: resolveBoardCluster(foundationCardType),
    });
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

  boardCards.push({
    id: 'cash',
    title: 'Cash',
    subtitle: 'Resource Card',
    cardType: 'resource',
    flavor: 'Folded bills still warm from honest work and crooked pockets.',
    trustDots: 0,
    stateLabel: `Stack x${Math.max(0, Math.floor(jeffriesAsset.cash))}`,
    decaying: false,
    cluster: 'resources',
  });

  boardCards.sort((left, right): number => {
    const clusterDelta = clusterRank[left.cluster] - clusterRank[right.cluster];

    if (clusterDelta !== 0) {
      return clusterDelta;
    }

    return left.title.localeCompare(right.title);
  });

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
    boardCards,
  };
};

export const bootDocksideSimulation = async (
  options: Partial<DocksideSimulationOptions> = {},
): Promise<DocksideSimulationHandle> => {
  const runtimeWorld = await createDocksideRuntimeWorld({
    dequeueVerbActions: options.dequeueVerbActions,
    onVerbResolved: options.onVerbResolved,
  });
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
