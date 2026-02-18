export type DossierValue = string | number | boolean | null;

export type DossierFields = Record<string, DossierValue>;

type VisualComponentInit = {
  cardFace?: string;
  revealed?: boolean;
  dossierData?: DossierFields;
};

export class VisualComponent {
  cardFace: string;
  revealed: boolean;
  dossierData: DossierFields;

  constructor(init: VisualComponentInit = {}) {
    this.cardFace = init.cardFace ?? 'blank';
    this.revealed = init.revealed ?? false;
    this.dossierData = init.dossierData ?? {};
  }
}
