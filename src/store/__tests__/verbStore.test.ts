import { afterEach, describe, expect, it } from 'vitest';

import {
  acknowledgeCompletedVerbActions,
  peekCompletedVerbActions,
  queueCompletedVerbAction,
  useVerbStore,
  type CompletedVerbAction,
} from '../verbStore';

const buildAction = (id: string): CompletedVerbAction => {
  return {
    id,
    slotId: 'work',
    cardId: `card-${id}`,
    cardTitle: `Card ${id}`,
    cardType: 'location',
    completedAtMs: 1000,
  };
};

afterEach((): void => {
  useVerbStore.getState().clear();
});

describe('verbStore', (): void => {
  it('peek returns queued actions without clearing them', (): void => {
    queueCompletedVerbAction(buildAction('verb-1'));
    queueCompletedVerbAction(buildAction('verb-2'));

    const firstPeek = peekCompletedVerbActions();
    const secondPeek = peekCompletedVerbActions();

    expect(firstPeek.map((action): string => action.id)).toEqual(['verb-1', 'verb-2']);
    expect(secondPeek.map((action): string => action.id)).toEqual(['verb-1', 'verb-2']);
    expect(useVerbStore.getState().pendingActions).toHaveLength(2);
  });

  it('acknowledge removes only the specified action IDs', (): void => {
    queueCompletedVerbAction(buildAction('verb-1'));
    queueCompletedVerbAction(buildAction('verb-2'));

    const snapshotBeforeAcknowledge = peekCompletedVerbActions();

    queueCompletedVerbAction(buildAction('verb-3'));

    acknowledgeCompletedVerbActions([snapshotBeforeAcknowledge[0]?.id ?? '']);

    const remaining = peekCompletedVerbActions();

    expect(remaining.map((action): string => action.id)).toEqual(['verb-2', 'verb-3']);
  });

  it('acknowledge ignores unknown action IDs', (): void => {
    queueCompletedVerbAction(buildAction('verb-1'));

    acknowledgeCompletedVerbActions(['missing-id']);

    const remaining = peekCompletedVerbActions();

    expect(remaining.map((action): string => action.id)).toEqual(['verb-1']);
  });
});
