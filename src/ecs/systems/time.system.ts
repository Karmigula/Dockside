import { createSystem, queryComponents, Write } from 'sim-ecs';

import { DAYS_PER_WEEK, SHIFTS_PER_DAY, TimeComponent } from '../components/time';

export type TimeAdvanceResult = {
  shiftChanged: boolean;
  dayChanged: boolean;
  weekChanged: boolean;
};

export const advanceTime = (timeComponent: TimeComponent): TimeAdvanceResult => {
  timeComponent.totalTicks += 1;
  timeComponent.ticksIntoShift += 1;

  const result: TimeAdvanceResult = {
    shiftChanged: false,
    dayChanged: false,
    weekChanged: false,
  };

  if (timeComponent.ticksIntoShift < timeComponent.ticksPerShift) {
    return result;
  }

  timeComponent.ticksIntoShift = 0;
  timeComponent.shift += 1;
  result.shiftChanged = true;

  if (timeComponent.shift <= SHIFTS_PER_DAY) {
    return result;
  }

  timeComponent.shift = 1;
  timeComponent.day += 1;
  result.dayChanged = true;

  if (timeComponent.day <= DAYS_PER_WEEK) {
    return result;
  }

  timeComponent.day = 1;
  timeComponent.week += 1;
  result.weekChanged = true;

  return result;
};

const timeSystemBuilder = createSystem({
  query: queryComponents({
    timeComponent: Write(TimeComponent),
  }),
})
  .withName('TimeSystem')
  .withRunFunction(async ({ query }): Promise<void> => {
    await query.execute(({ timeComponent }): void => {
      const result = advanceTime(timeComponent);

      if (result.shiftChanged) {
        console.info(
          `[Dockside] Shift ${timeComponent.shift} | Day ${timeComponent.day} | Week ${timeComponent.week}`,
        );
      }

      if (result.dayChanged) {
        console.info(`[Dockside] Day ${timeComponent.day} begins.`);
      }

      if (result.weekChanged) {
        console.info(`[Dockside] Week ${timeComponent.week} begins.`);
      }
    });
  });

export type TimeSystemInstance = ReturnType<typeof timeSystemBuilder.build>;

export const createTimeSystem = (): TimeSystemInstance => {
  return timeSystemBuilder.build();
};

export const TimeSystem = createTimeSystem();
