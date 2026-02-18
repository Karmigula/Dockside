type PsychologyComponentInit = {
  fear?: number;
  ambition?: number;
  loyalty?: number;
  addiction?: string;
};

export class PsychologyComponent {
  fear: number;
  ambition: number;
  loyalty: number;
  addiction?: string;

  constructor(init: PsychologyComponentInit = {}) {
    this.fear = init.fear ?? 0;
    this.ambition = init.ambition ?? 0;
    this.loyalty = init.loyalty ?? 0;
    this.addiction = init.addiction;
  }
}
