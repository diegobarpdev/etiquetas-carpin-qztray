export interface OrderListItem {
  id: number;
  name: string;
  lotNumber: string;
  productionDate: string;
  state: string;
}

export interface OrderLine {
  productName: string;
  internalRef: string;
  quantity: number;
  bomType: string;
}

export interface OrderDetail {
  id: number;
  name: string;
  lotNumber: string;
  productionDate: string;
  state: string;
  inspectorName?: string | null;
  supportsDualPacking: boolean;
  supportsCustomPacking: boolean;
  lines: OrderLine[];
}

export interface SelectionGroup {
  id: string;
  label: string;
  parentId?: string;
  internalRef: string;
  labelCount: number;
  isKitParent: boolean;
}

export interface SummaryChild {
  internalRef: string;
  productName: string;
  bultoDisplay: string;
}

export interface SummaryItem {
  internalRef: string;
  productName: string;
  bultoDisplay: string;
  isKit?: boolean;
  children?: SummaryChild[];
}

export interface OrderPreview {
  totalLabels: number;
  totalLabelsAll: number;
  summary: SummaryItem[];
  groups: SelectionGroup[];
  templateCode?: string;
}

export interface OrderResponse {
  order: OrderDetail;
  preview: OrderPreview;
}

export interface TemplateItem {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface PrintBatchJob {
  orderId: number;
  orderName: string;
  groups?: string;
  units?: string;
  from?: string;
  to?: string;
  dualPacking?: number;
  customPacking?: string;
  bultoQuantities?: Record<string, number>;
  /** Inspector elegido para esta orden (plantillas que lo requieren). */
  inspectorName?: string;
  labelCount: number;
  hint: string;
}

export interface CustomPackingRow {
  qty: string;
  count: string;
}

export interface AppliedPackingRow {
  qty: number;
  count: number;
}

export interface AvailablePrinter {
  agentId: string;
  agentName: string;
  windowsName: string;
  label: string;
  stocks?: string[];
  matchesStock?: boolean;
  stationCode?: string;
}

export interface PrinterSelection {
  agentId: string;
  windowsName: string;
}

export interface PrinterSettings {
  mode: 'direct';
  copies: number;
  stockSize: string;
  printMode: 'tear' | 'cutter';
  thermalMethod: 'transfer' | 'direct';
  mediaType: 'gap' | 'continuous';
  selectedPrinterByStock: Record<string, PrinterSelection>;
  thermalMethodByStock?: Record<string, 'transfer' | 'direct'>;
}

export interface HardwareProfile {
  printMode: 'tear' | 'cutter';
  thermalMethod: 'transfer' | 'direct';
  mediaType: 'gap' | 'continuous';
}

export interface PrintAgentSyncedPrinter {
  windowsName: string;
  label: string;
  visible: boolean;
  stocks: string[];
}

export interface AdminAgent {
  id: string;
  name: string;
  printers: PrintAgentSyncedPrinter[];
}

export interface AdminStationPrinter {
  agentId: string;
  windowsName: string;
}

export interface AdminStation {
  id: string;
  code: string;
  name: string;
  agentId: string;
  clientIps: string[];
  printers: AdminStationPrinter[];
}
