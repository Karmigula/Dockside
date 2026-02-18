import { buildWorld, type IRuntimeWorld } from 'sim-ecs';
import { afterEach, describe, expect, it } from 'vitest';

import { TimeComponent } from '../../components/time';
import { advanceTime, createTimeSystem } from '../time.system';

const runtimeWorlds: IRuntimeWorld[] = [];

afterEach((): void => {
  for (const runtimeWorld of runtimeWorlds) {
    runtimeWorld.stop();
  }

  runtimeWorlds.length = 0;
});

const createRuntimeWorld = async (
  init: ConstructorParameters<typeof TimeComponent>[0],
): Promise<IRuntimeWorld> => {
  const timeSystem = createTimeSystem();

  const preptimeWorld = buildWorld()
    .withComponents(TimeComponent)
    .withDefaultScheduling((root): void => {
      root.addNewStage((stage): void => {
        stage.addSystem(timeSystem);
      });
    })
    .build();

  preptimeWorld.buildEntity().with(TimeComponent, init).build();

  const runtimeWorld = await preptimeWorld.prepareRun();
  runtimeWorlds.push(runtimeWorld);

  return runtimeWorld;
};

const getTimeComponent = (runtimeWorld: IRuntimeWorld): TimeComponent => {
  const entity = [...runtimeWorld.getEntities()][0];
  const timeComponent = entity.getComponent(TimeComponent);

  if (timeComponent === undefined) {
    throw new Error('TimeComponent missing from test entity.');
  }

  return timeComponent;
};

describe('time.system', (): void => {
  it('advanceTime increments tick counters inside a shift', (): void => {
    const timeComponent = new TimeComponent({ ticksPerShift: 3, ticksIntoShift: 1, totalTicks: 9 });

    const result = advanceTime(timeComponent);

    expect(result).toEqual({ shiftChanged: false, dayChanged: false, weekChanged: false });
    expect(timeComponent.totalTicks).toBe(10);
    expect(timeComponent.ticksIntoShift).toBe(2);
    expect(timeComponent.shift).toBe(1);
  });

  it('advanceTime rolls over from shift to next shift when boundary is hit', (): void => {
    const timeComponent = new TimeComponent({ ticksPerShift: 2, ticksIntoShift: 1, shift: 1 });

    const result = advanceTime(timeComponent);

    expect(result.shiftChanged).toBe(true);
    expect(result.dayChanged).toBe(false);
    expect(result.weekChanged).toBe(false);
    expect(timeComponent.ticksIntoShift).toBe(0);
    expect(timeComponent.shift).toBe(2);
  });

  it('advanceTime rolls over from day 7 shift 3 into week 2 day 1 shift 1', (): void => {
    const timeComponent = new TimeComponent({
      ticksPerShift: 1,
      ticksIntoShift: 0,
      shift: 3,
      day: 7,
      week: 1,
    });

    const result = advanceTime(timeComponent);

    expect(result).toEqual({ shiftChanged: true, dayChanged: true, weekChanged: true });
    expect(timeComponent.shift).toBe(1);
    expect(timeComponent.day).toBe(1);
    expect(timeComponent.week).toBe(2);
  });

  it('TimeSystem applies one simulation step to the time entity', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld({ ticksPerShift: 1, ticksIntoShift: 0, shift: 1, day: 1 });

    await runtimeWorld.step();

    const timeComponent = getTimeComponent(runtimeWorld);
    expect(timeComponent.totalTicks).toBe(1);
    expect(timeComponent.shift).toBe(2);
    expect(timeComponent.day).toBe(1);
    expect(timeComponent.week).toBe(1);
  });
});
