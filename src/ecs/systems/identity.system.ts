import { createSystem, queryComponents, Write } from 'sim-ecs';

import { IdentityComponent } from '../components/identity';

const UNKNOWN_NAME = 'Unknown';
const UNKNOWN_DESCRIPTION = 'No description available.';

const identitySystemBuilder = createSystem({
  query: queryComponents({
    identityComponent: Write(IdentityComponent),
  }),
})
  .withName('IdentitySystem')
  .withRunFunction(async ({ query }): Promise<void> => {
    await query.execute(({ identityComponent }): void => {
      const trimmedName = identityComponent.name.trim();
      const trimmedDescription = identityComponent.description.trim();

      identityComponent.name = trimmedName.length > 0 ? trimmedName : UNKNOWN_NAME;
      identityComponent.description =
        trimmedDescription.length > 0 ? trimmedDescription : UNKNOWN_DESCRIPTION;
    });
  });

export type IdentitySystemInstance = ReturnType<typeof identitySystemBuilder.build>;

export const createIdentitySystem = (): IdentitySystemInstance => {
  return identitySystemBuilder.build();
};

export const IdentitySystem = createIdentitySystem();
