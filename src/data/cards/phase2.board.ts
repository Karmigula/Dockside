import type { VerbSlotId } from '../../ecs/types';

export type BoardCardType = 'person' | 'resource' | 'location' | 'situation';

export type BoardCardCluster = 'people' | 'locations' | 'situations' | 'resources';

export type BoardCardModel = {
  id: string;
  title: string;
  subtitle: string;
  cardType: BoardCardType;
  flavor: string;
  trustDots: number;
  stateLabel: string;
  decaying: boolean;
  cluster: BoardCardCluster;
};

export type ActiveVerbSlotId = Exclude<VerbSlotId, 'layLow'>;

export type VerbSlotModel = {
  id: ActiveVerbSlotId;
  title: string;
  requirementLabel: string;
  accentToken: 'gold' | 'blue' | 'amber' | 'green' | 'orange' | 'red';
  durationMs: number;
};

export type EventLogSeed = {
  id: string;
  tone: 'info' | 'warning' | 'success';
  line: string;
};

export const PHASE_TWO_BOARD_CARDS = [
  {
    id: 'jeffries',
    title: 'Bartholomeu H. Jeffries',
    subtitle: 'Dock Hand / Quiet Ambition',
    cardType: 'person',
    flavor: "He keeps his voice low and his eyes open. That's how men live long at Bay 7.",
    trustDots: 3,
    stateLabel: 'Known Quantity',
    decaying: false,
    cluster: 'people',
  },
  {
    id: 'ray-kowalski',
    title: 'Ray Kowalski',
    subtitle: 'Dock Foreman / Local 299',
    cardType: 'person',
    flavor: 'Ray owes money and time. Both clocks are louder every night.',
    trustDots: 2,
    stateLabel: 'Contacted',
    decaying: false,
    cluster: 'people',
  },
  {
    id: 'sal-marchetti',
    title: 'Sal Marchetti',
    subtitle: 'Bookmaker / River Row',
    cardType: 'person',
    flavor: 'He smiles with his hands in his pockets. Nobody asks what those hands hold.',
    trustDots: 1,
    stateLabel: 'Watching',
    decaying: false,
    cluster: 'people',
  },
  {
    id: 'the-docks',
    title: 'The Docks',
    subtitle: 'Location Card',
    cardType: 'location',
    flavor: 'Steel, salt, diesel, and silence when the right foreman walks by.',
    trustDots: 0,
    stateLabel: 'Unlocked',
    decaying: false,
    cluster: 'locations',
  },
  {
    id: 'abandoned-warehouse',
    title: 'Abandoned Warehouse',
    subtitle: 'Location Card',
    cardType: 'location',
    flavor: 'Broken windows, open floor, enough room for practice and mistakes.',
    trustDots: 0,
    stateLabel: 'Unlocked',
    decaying: false,
    cluster: 'locations',
  },
  {
    id: 'shipment-window',
    title: 'Shipment Looking the Other Way',
    subtitle: 'Situation Card',
    cardType: 'situation',
    flavor: 'A container shows up Thursday. The manifest is clean. The locks are not.',
    trustDots: 0,
    stateLabel: 'Burns in 2 Shifts',
    decaying: true,
    cluster: 'situations',
  },
  {
    id: 'unmarked-van',
    title: 'Unmarked Van, Lot C',
    subtitle: 'Situation Card',
    cardType: 'situation',
    flavor: 'Someone is moving weight after midnight. You can watch, lift, or sell the story.',
    trustDots: 0,
    stateLabel: 'Burns in 1 Shift',
    decaying: true,
    cluster: 'situations',
  },
  {
    id: 'cash',
    title: 'Cash',
    subtitle: 'Resource Card',
    cardType: 'resource',
    flavor: 'Folded bills still warm from honest work and crooked pockets.',
    trustDots: 0,
    stateLabel: 'Stack x2',
    decaying: false,
    cluster: 'resources',
  },
  {
    id: 'intel',
    title: 'Intel',
    subtitle: 'Resource Card',
    cardType: 'resource',
    flavor: 'Names, routes, and one lie wrapped in two truths.',
    trustDots: 0,
    stateLabel: 'Stale by Week End',
    decaying: true,
    cluster: 'resources',
  },
  {
    id: 'favors',
    title: 'Favors',
    subtitle: 'Resource Card',
    cardType: 'resource',
    flavor: 'A nod tonight can cost you blood next month.',
    trustDots: 0,
    stateLabel: 'Cooling',
    decaying: true,
    cluster: 'resources',
  },
] as const satisfies readonly BoardCardModel[];

export const PHASE_TWO_VERB_SLOTS = [
  {
    id: 'work',
    title: 'Work',
    requirementLabel: 'Needs: Location',
    accentToken: 'gold',
    durationMs: 3800,
  },
  {
    id: 'scheme',
    title: 'Scheme',
    requirementLabel: 'Needs: Situation + Resource',
    accentToken: 'blue',
    durationMs: 5200,
  },
  {
    id: 'train',
    title: 'Train',
    requirementLabel: 'Needs: Time / Focus',
    accentToken: 'amber',
    durationMs: 4200,
  },
  {
    id: 'recruit',
    title: 'Recruit',
    requirementLabel: 'Needs: Person + Favors + Intel',
    accentToken: 'green',
    durationMs: 5600,
  },
  {
    id: 'bribe',
    title: 'Bribe',
    requirementLabel: 'Needs: Person + Cash',
    accentToken: 'orange',
    durationMs: 4700,
  },
  {
    id: 'violence',
    title: 'Violence',
    requirementLabel: 'Needs: Person + Muscle',
    accentToken: 'red',
    durationMs: 6100,
  },
] as const satisfies readonly VerbSlotModel[];

export const PHASE_TWO_EVENT_LOG_SEED = [
  {
    id: 'seed-1',
    tone: 'info',
    line: 'Detroit wakes slow. The docks do not.',
  },
  {
    id: 'seed-2',
    tone: 'warning',
    line: "Word is somebody's skimming manifests after second horn.",
  },
  {
    id: 'seed-3',
    tone: 'success',
    line: 'Jeffries keeps his head down and his options open.',
  },
] as const satisfies readonly EventLogSeed[];
