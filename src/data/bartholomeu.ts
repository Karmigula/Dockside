export const BARTHOLOMEU_START = {
  name: 'Bartholomeu Helio Jeffries',
  year: 1986,
  city: 'Detroit, MI',
  neighborhood: 'Southwest Detroit',
  stats: {
    capoeira: 3,
    strength: 4,
    cunning: 3,
    charm: 2,
    loyalty: 5,
  },
  reputation: {
    fear: 0,
    respect: 0,
  },
  resources: {
    cash: 2,
    muscle: 0,
    intel: 0,
    favors: 1,
    heat: {
      local: 0,
      federal: 0,
    },
    gingaPoints: 0,
  },
  locationsUnlocked: ['the_docks', 'southwest_detroit', 'abandoned_warehouse'],
  network: [],
  traits: ['LIMINAL', 'CAPOEIRISTA', 'BILINGUAL', 'DOCK_WORKER', 'MOTHERS_SON'],
  characterNotes: [
    'Atlanta-born, Rio-blooded. Your mother calls every Sunday.',
    'You practice in the warehouse when the night shift ends.',
    "You know how things disappear at the docks. You've looked away.",
    'You are not looking for this. But it may find you anyway.',
  ],
} as const;

export type BartholomeuStart = typeof BARTHOLOMEU_START;
