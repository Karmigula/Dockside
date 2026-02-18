import { buildWorld, type IRuntimeWorld } from 'sim-ecs';
import { afterEach, describe, expect, it } from 'vitest';

import { IdentityComponent } from '../../components/identity';
import { createIdentitySystem } from '../identity.system';

const runtimeWorlds: IRuntimeWorld[] = [];

afterEach((): void => {
  for (const runtimeWorld of runtimeWorlds) {
    runtimeWorld.stop();
  }

  runtimeWorlds.length = 0;
});

const createRuntimeWorld = async (
  init: ConstructorParameters<typeof IdentityComponent>[0],
): Promise<IRuntimeWorld> => {
  const identitySystem = createIdentitySystem();

  const preptimeWorld = buildWorld()
    .withComponents(IdentityComponent)
    .withDefaultScheduling((root): void => {
      root.addNewStage((stage): void => {
        stage.addSystem(identitySystem);
      });
    })
    .build();

  preptimeWorld.buildEntity().with(IdentityComponent, init).build();

  const runtimeWorld = await preptimeWorld.prepareRun();
  runtimeWorlds.push(runtimeWorld);

  return runtimeWorld;
};

const getIdentityComponent = (runtimeWorld: IRuntimeWorld): IdentityComponent => {
  const entity = [...runtimeWorld.getEntities()][0];
  const identityComponent = entity.getComponent(IdentityComponent);

  if (identityComponent === undefined) {
    throw new Error('IdentityComponent missing from test entity.');
  }

  return identityComponent;
};

describe('identity.system', (): void => {
  it('trims text fields and applies defaults for blank values', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld({ name: '   ', description: '   ', cardType: 'person' });

    await runtimeWorld.step();

    const identityComponent = getIdentityComponent(runtimeWorld);
    expect(identityComponent.name).toBe('Unknown');
    expect(identityComponent.description).toBe('No description available.');
  });

  it('preserves non-empty identity values after trim', async (): Promise<void> => {
    const runtimeWorld = await createRuntimeWorld({
      name: '  Ray Kowalski  ',
      description: '  Dock foreman  ',
      cardType: 'person',
    });

    await runtimeWorld.step();

    const identityComponent = getIdentityComponent(runtimeWorld);
    expect(identityComponent.name).toBe('Ray Kowalski');
    expect(identityComponent.description).toBe('Dock foreman');
  });
});
