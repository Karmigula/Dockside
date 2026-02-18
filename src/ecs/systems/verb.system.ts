import { createSystem, queryComponents, Read, Write } from 'sim-ecs';

import { BARTHOLOMEU_START } from '../../data/bartholomeu';
import type { ActiveVerbSlotId, BoardCardType } from '../../data/cards/phase2.board';
import { AssetComponent } from '../components/assets';
import { HeatComponent } from '../components/heat';
import { IdentityComponent } from '../components/identity';
import { LocationComponent } from '../components/location';

type VerbResolutionTone = 'info' | 'warning' | 'success';

export type VerbAction = {
  id: string;
  slotId: ActiveVerbSlotId;
  cardId: string;
  cardTitle: string;
  cardType: BoardCardType;
  completedAtMs: number;
};

export type VerbResolution = {
  id: string;
  actionId: string;
  slotId: VerbAction['slotId'];
  cardId: string;
  cardTitle: string;
  tone: VerbResolutionTone;
  line: string;
  cashDelta: number;
  localHeatDelta: number;
  federalHeatDelta: number;
  resolvedAtMs: number;
};

export type VerbSystemOptions = {
  dequeueVerbActions?: () => readonly VerbAction[];
  onResolved?: (resolution: VerbResolution) => void;
};

type JeffriesRuntimeState = {
  assetComponent: AssetComponent;
  heatComponent: HeatComponent;
};

const EMPTY_ACTIONS: readonly VerbAction[] = [];

const toDistrictId = (cardId: string): string => {
  return cardId.replaceAll('-', '_');
};

const resolveWorkVerb = (
  action: VerbAction,
  jeffries: JeffriesRuntimeState,
  unlockedDistricts: ReadonlySet<string>,
): VerbResolution => {
  const districtId = toDistrictId(action.cardId);

  if (action.cardType !== 'location') {
    return {
      id: `verb-resolution-${action.id}`,
      actionId: action.id,
      slotId: action.slotId,
      cardId: action.cardId,
      cardTitle: action.cardTitle,
      tone: 'warning',
      line: `${action.cardTitle} cannot pull a shift. Work needs a location card.`,
      cashDelta: 0,
      localHeatDelta: 0,
      federalHeatDelta: 0,
      resolvedAtMs: Date.now(),
    };
  }

  if (!unlockedDistricts.has(districtId)) {
    return {
      id: `verb-resolution-${action.id}`,
      actionId: action.id,
      slotId: action.slotId,
      cardId: action.cardId,
      cardTitle: action.cardTitle,
      tone: 'warning',
      line: `${action.cardTitle} is still off-limits. No shift, no cash.`,
      cashDelta: 0,
      localHeatDelta: 0,
      federalHeatDelta: 0,
      resolvedAtMs: Date.now(),
    };
  }

  jeffries.assetComponent.cash += 1;

  return {
    id: `verb-resolution-${action.id}`,
    actionId: action.id,
    slotId: action.slotId,
    cardId: action.cardId,
    cardTitle: action.cardTitle,
    tone: 'success',
    line: `${action.cardTitle} paid one quiet shift. Jeffries pockets +1 cash.`,
    cashDelta: 1,
    localHeatDelta: 0,
    federalHeatDelta: 0,
    resolvedAtMs: Date.now(),
  };
};

const resolveAction = (
  action: VerbAction,
  jeffries: JeffriesRuntimeState,
  unlockedDistricts: ReadonlySet<string>,
): VerbResolution => {
  if (action.slotId === 'work') {
    return resolveWorkVerb(action, jeffries, unlockedDistricts);
  }

  return {
    id: `verb-resolution-${action.id}`,
    actionId: action.id,
    slotId: action.slotId,
    cardId: action.cardId,
    cardTitle: action.cardTitle,
    tone: 'info',
    line: `${action.slotId} is loaded but unresolved. No action taken yet.`,
    cashDelta: 0,
    localHeatDelta: 0,
    federalHeatDelta: 0,
    resolvedAtMs: Date.now(),
  };
};

const createVerbSystemBuilder = ({ dequeueVerbActions, onResolved }: VerbSystemOptions) => {
  return createSystem({
    jeffriesQuery: queryComponents({
      identityComponent: Read(IdentityComponent),
      assetComponent: Write(AssetComponent),
      heatComponent: Write(HeatComponent),
    }),
    locationQuery: queryComponents({
      locationComponent: Read(LocationComponent),
    }),
  })
    .withName('VerbSystem')
    .withRunFunction(async ({ jeffriesQuery, locationQuery }): Promise<void> => {
      const pendingActions = dequeueVerbActions?.() ?? EMPTY_ACTIONS;

      if (pendingActions.length === 0) {
        return;
      }

      let jeffriesState: JeffriesRuntimeState | null = null;

      await jeffriesQuery.execute(({ identityComponent, assetComponent, heatComponent }): void => {
        if (identityComponent.name !== BARTHOLOMEU_START.name) {
          return;
        }

        jeffriesState = {
          assetComponent,
          heatComponent,
        };
      });

      if (jeffriesState === null) {
        return;
      }

      const unlockedDistricts = new Set<string>();

      await locationQuery.execute(({ locationComponent }): void => {
        if (!locationComponent.unlocked) {
          return;
        }

        unlockedDistricts.add(locationComponent.districtId);
      });

      for (const action of pendingActions) {
        const resolution = resolveAction(action, jeffriesState, unlockedDistricts);

        if (onResolved !== undefined) {
          onResolved(resolution);
        }
      }
    });
};

export type VerbSystemInstance = ReturnType<ReturnType<typeof createVerbSystemBuilder>['build']>;

export const createVerbSystem = (options: VerbSystemOptions = {}): VerbSystemInstance => {
  return createVerbSystemBuilder(options).build();
};

export const VerbSystem = createVerbSystem();
