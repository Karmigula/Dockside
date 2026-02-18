export const SHIFTS_PER_DAY = 3;
export const DAYS_PER_WEEK = 7;

export type ShiftName = 'day' | 'swing' | 'graveyard';

type TimeComponentInit = {
  totalTicks?: number;
  shift?: number;
  day?: number;
  week?: number;
  year?: number;
  ticksPerShift?: number;
  ticksIntoShift?: number;
};

export class TimeComponent {
  totalTicks: number;
  shift: number;
  day: number;
  week: number;
  year: number;
  ticksPerShift: number;
  ticksIntoShift: number;

  constructor(init: TimeComponentInit = {}) {
    this.totalTicks = init.totalTicks ?? 0;
    this.shift = init.shift ?? 1;
    this.day = init.day ?? 1;
    this.week = init.week ?? 1;
    this.year = init.year ?? 1986;
    this.ticksPerShift = init.ticksPerShift ?? 60;
    this.ticksIntoShift = init.ticksIntoShift ?? 0;
  }
}
