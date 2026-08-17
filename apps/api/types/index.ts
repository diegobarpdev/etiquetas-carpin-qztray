/** Decimal mínimo compatible con el código portado (sin Prisma). */
export class Decimal {
  private readonly value: string;

  constructor(value: string | number | Decimal) {
    if (value instanceof Decimal) {
      this.value = value.value;
    } else if (typeof value === 'number') {
      this.value = Number.isFinite(value) ? String(value) : '0';
    } else {
      const s = String(value ?? '').trim();
      this.value = s === '' || Number.isNaN(Number(s)) ? '0' : s;
    }
  }

  toString(): string {
    return this.value;
  }

  toNumber(): number {
    return Number(this.value) || 0;
  }
}

export type BomType = 'kit' | 'manufacture';

export interface LabelTemplate {
  id: number;
  code: string;
  name: string;
  htmlTemplate: string;
  css: string;
  isActive: boolean;
}

export interface Product {
  id: number;
  ean: string;
  internalRef: string;
  name: string;
  shortName: string | null;
  weightKg: Decimal;
  height: Decimal;
  width: Decimal;
  length: Decimal;
  volumeM3: Decimal;
  numBultos: number;
  labelTemplateId: number;
}

export interface LabelData {
  productName: string;
  shortName: string;
  ean: string;
  internalRef: string;
  lotNumber: string;
  orderName: string;
  bultoCurrent: number;
  bultoTotal: number;
  quantity: number;
  serialCurrent: number;
  serialTotal: number;
  orderUnitIndex?: number;
  orderUnitTotal?: number;
  unitsPacked?: number;
  pieceKey?: string;
  weightKg: string;
  productionDate: string;
  height: string;
  width: string;
  length: string;
  volumeM3: string;
  templateCode: string;
  showInternalRefQr: boolean;
  qrSku: string;
  qrInternalRef: string;
  qrLotNumber: string;
  finishInstructions: string;
  factoryFooter?: string;
  conformeTitle?: string;
  conformeSubtitle?: string;
  madeIn?: string;
  inspectorName?: string;
  showKitSubproduct?: boolean;
  subproductName?: string;
  selectionGroupIds: string[];
  globalIndex: number;
}

export interface ProductWithBom extends Product {
  labelTemplate: LabelTemplate;
  boms: Array<{
    type: BomType;
    lines: Array<{
      quantity: Decimal;
      componentProduct: ProductWithBom;
    }>;
  }>;
}

export interface OrderWithLines {
  id: number;
  name: string;
  lotNumber: string;
  productionDate: Date;
  state: string;
  inspectorName?: string | null;
  lines: Array<{
    quantity: Decimal;
    product: ProductWithBom;
  }>;
}

export interface LabelSummaryChild {
  internalRef: string;
  productName: string;
  componentQuantity: number | null;
  bultoDisplay: string;
  totalLabels: number;
  templateCode: string;
  templateName: string;
}

export interface LabelSummaryItem {
  internalRef: string;
  productName: string;
  orderQuantity: number;
  isKit: boolean;
  bultoDisplay: string;
  totalLabels: number;
  templateCode: string;
  templateName: string;
  children?: LabelSummaryChild[];
}

export interface LabelSelectionGroup {
  id: string;
  label: string;
  parentId?: string;
  internalRef: string;
  labelCount: number;
  isKitParent: boolean;
}

export interface LabelPreview {
  totalLabels: number;
  summary: LabelSummaryItem[];
  labels: LabelData[];
  groups: LabelSelectionGroup[];
}
