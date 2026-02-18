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

const normalizeDistrictId = (value: string): string => {
  return value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
};

const clampHeatValue = (value: number): number => {
  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
};

const resolveWorkVerb = (
  action: VerbAction,
  unlockedDistricts: ReadonlySet<string>,
): VerbResolution => {
  const districtId = normalizeDistrictId(action.cardId);

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

const resolveSchemeVerb = (action: VerbAction): VerbResolution => {
  if (action.cardType !== 'situation') {
    return {
      id: `verb-resolution-${action.id}`,
      actionId: action.id,
      slotId: action.slotId,
      cardId: action.cardId,
      cardTitle: action.cardTitle,
      tone: 'warning',
      line: `${action.cardTitle} is the wrong kind of leverage. Scheme needs a situation card.`,
      cashDelta: 0,
      localHeatDelta: 0,
      federalHeatDelta: 0,
      resolvedAtMs: Date.now(),
    };
  }

  if (action.cardId === 'shipment-window') {
    return {
      id: `verb-resolution-${action.id}`,
      actionId: action.id,
      slotId: action.slotId,
      cardId: action.cardId,
      cardTitle: action.cardTitle,
      tone: 'success',
      line: `${action.cardTitle} moved clean on paper. Jeffries clears +2 cash, but the harbor cops smell smoke.`,
      cashDelta: 2,
      localHeatDelta: 6,
      federalHeatDelta: 2,
      resolvedAtMs: Date.now(),
    };
  }

  return {
    id: `verb-resolution-${action.id}`,
    actionId: action.id,
    slotId: action.slotId,
    cardId: action.cardId,
    cardTitle: action.cardTitle,
    tone: 'info',
    line: `${action.cardTitle} pays a short edge: +1 cash, +2 local heat.`,
    cashDelta: 1,
    localHeatDelta: 2,
    federalHeatDelta: 0,
    resolvedAtMs: Date.now(),
  };
};

const applyResolution = (resolution: VerbResolution, jeffries: JeffriesRuntimeState): void => {
  if (resolution.cashDelta !== 0) {
    jeffries.assetComponent.cash += resolution.cashDelta;
  }

  if (resolution.localHeatDelta !== 0) {
    jeffries.heatComponent.localHeat = clampHeatValue(
      jeffries.heatComponent.localHeat + resolution.localHeatDelta,
    );
  }

  if (resolution.federalHeatDelta !== 0) {
    jeffries.heatComponent.federalHeat = clampHeatValue(
      jeffries.heatComponent.federalHeat + resolution.federalHeatDelta,
    );
  }
};

const resolveAction = (
  action: VerbAction,
  unlockedDistricts: ReadonlySet<string>,
): VerbResolution => {
  if (action.slotId === 'work') {
    return resolveWorkVerb(action, unlockedDistricts);
  }

  if (action.slotId === 'scheme') {
    return resolveSchemeVerb(action);
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

        unlockedDistricts.add(normalizeDistrictId(locationComponent.districtId));
      });

      for (const action of pendingActions) {
        const resolution = resolveAction(action, unlockedDistricts);

        applyResolution(resolution, jeffriesState);

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
