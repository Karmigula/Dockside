import { createSystem, queryComponents, Read, Write } from 'sim-ecs';

import { AssetComponent, ResourceComponent } from '../components/assets';
import { TimeComponent } from '../components/time';

export const isShiftBoundary = (timeComponent: TimeComponent): boolean => {
  return timeComponent.totalTicks > 0 && timeComponent.ticksIntoShift === 0;
};

export const isWeekBoundary = (timeComponent: TimeComponent): boolean => {
  return isShiftBoundary(timeComponent) && timeComponent.shift === 1 && timeComponent.day === 1;
};

const resourceSystemBuilder = createSystem({
  timeQuery: queryComponents({
    timeComponent: Read(TimeComponent),
  }),
  assetsQuery: queryComponents({
    assetComponent: Write(AssetComponent),
  }),
  resourcesQuery: queryComponents({
    resourceComponent: Write(ResourceComponent),
  }),
})
  .withName('ResourceSystem')
  .withRunFunction(async ({ timeQuery, assetsQuery, resourcesQuery }): Promise<void> => {
    let currentTime: TimeComponent | null = null;

    await timeQuery.execute(({ timeComponent }): void => {
      if (currentTime !== null) {
        return;
      }

      currentTime = timeComponent;
    });

    if (currentTime === null) {
      return;
    }

    if (isShiftBoundary(currentTime)) {
      await assetsQuery.execute(({ assetComponent }): void => {
        assetComponent.cash += 1;
      });
    }

    if (!isWeekBoundary(currentTime)) {
      return;
    }

    await resourcesQuery.execute(({ resourceComponent }): void => {
      const decayedAmount = resourceComponent.amount - resourceComponent.decayRate;
      resourceComponent.amount = decayedAmount > 0 ? decayedAmount : 0;
    });
  });

export type ResourceSystemInstance = ReturnType<typeof resourceSystemBuilder.build>;

export const createResourceSystem = (): ResourceSystemInstance => {
  return resourceSystemBuilder.build();
};

export const ResourceSystem = createResourceSystem();
