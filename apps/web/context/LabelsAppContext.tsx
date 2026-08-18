import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  apiAvailablePrinters,
  apiDownloadPdfWithFilename,
  apiGetManualOrder,
  apiGetManualProduct,
  apiGetOrder,
  apiListActiveInspectors,
  apiListTemplates,
  apiPostJson,
  apiSearchOrders,
} from '../lib/api';
import { templateUsesInspector } from '../lib/format';
import {
  buildDraftCustomPackingPlan,
  buildSummaryLookup,
  formatCustomPackingParam,
  getBatchLabelTotal,
  getCustomPackingUsed,
  getOrderPackingTotal,
  isAllGroupsSelected,
  isOrderInBatch,
  jobsPayloadFromBatch,
  packingPlansEqual,
  type SummaryMeta,
} from '../lib/order-selection';
import {
  decodePrinterValue,
  describeHardwareProfile,
  encodePrinterValue,
  getHardwareProfile,
  getPrinterForStock,
  isPapelTarget,
  loadLocalVisiblePrinters,
  loadSettings,
  resolveHardwareSettings,
  saveSettings,
  setPrinterLocallyVisible,
  suggestStockSizeForTemplate,
} from '../lib/printer-settings';
import { toast } from '../lib/toast';
import { connectQz, printRawZpl, QzNotAvailableError } from '../lib/qz-client';
import type {
  AvailablePrinter,
  CustomPackingRow,
  AppliedPackingRow,
  OrderListItem,
  OrderResponse,
  PrintBatchJob,
  PrinterSettings,
  SelectionGroup,
  TemplateItem,
} from '../types';

const ORDER_SEARCH_MIN_CHARS = 2;

interface LatestState {
  orderQuery: string;
  selectedOrderId: number | null;
  manualActive: boolean;
  manualEan: string;
  manualQty: string;
  manualLotPrefix: string;
  manualLotNumber: string;
  lastOrderData: OrderResponse | null;
  totalLabelCount: number;
  totalLabelCountAll: number;
  selectionGroups: SelectionGroup[];
  selectedGroupIds: Set<string>;
  rangeFrom: string;
  rangeTo: string;
  unitsFilter: string;
  dualPacking: boolean;
  customPackingRows: CustomPackingRow[];
  appliedCustomPacking: AppliedPackingRow[] | null;
  customPackingVisible: boolean;
  customPackingModeActive: boolean;
  bultoQuantities: Record<string, number>;
  selectedTemplate: string;
  printBatch: PrintBatchJob[];
  stockSize: string;
  selectedPrinterValue: string;
  printerCopies: number;
  printerThermalMethod: 'transfer' | 'direct';
  availablePrinters: AvailablePrinter[];
  selectedInspectorName: string;
  inspectorByOrderId: Record<number, string>;
}

export type PrintProgressState =
  | { open: false }
  | {
      open: true;
      phase: 'sending' | 'connecting-qz' | 'success' | 'not-installed';
      printerLabel: string;
      pages: number;
      detail?: string;
    };

interface LabelsAppState {
  // Búsqueda de órdenes
  orderQuery: string;
  setOrderQuery: (value: string) => void;
  orders: OrderListItem[];
  orderListHint: string;
  orderSearchExecuted: boolean;
  runOrderSearch: () => void;
  handleClearOrderSearch: () => void;

  // Orden seleccionada
  selectedOrderId: number | null;
  lastOrderData: OrderResponse | null;
  selectOrder: (id: number | null) => void;

  // Impresión manual por código EAN (sin OP en Odoo)
  manualActive: boolean;
  manualEan: string;
  setManualEan: (value: string) => void;
  manualQty: string;
  setManualQty: (value: string) => void;
  manualLotPrefix: string;
  setManualLotPrefix: (value: string) => void;
  manualLotNumber: string;
  setManualLotNumber: (value: string) => void;
  manualOrderNamePreview: string;
  manualProductName: string;
  lookupManualProduct: () => void;
  generateManualOrder: () => void;

  // Selección de grupos / filtros
  selectionGroups: SelectionGroup[];
  selectedGroupIds: Set<string>;
  summaryByRef: Map<string, SummaryMeta>;
  isAllSelected: boolean;
  handleGroupCheckboxChange: (groupId: string, checked: boolean) => void;
  handleSelectAllGroups: () => void;
  handleClearAllGroups: () => void;
  selectionSummaryHint: string;

  rangeFrom: string;
  rangeTo: string;
  unitsFilter: string;
  onRangeFromChange: (value: string) => void;
  onRangeToChange: (value: string) => void;
  onUnitsFilterChange: (value: string) => void;

  dualPacking: boolean;
  dualPackingVisible: boolean;
  onDualPackingChange: (checked: boolean) => void;

  customPackingRows: CustomPackingRow[];
  customPackingVisible: boolean;
  customPackingModeActive: boolean;
  setCustomPackingModeActive: (active: boolean) => void;
  toggleCustomPackingModeActive: () => void;
  customPackingStatus: { text: string; className: string };
  onCustomPackingRowChange: (idx: number, field: 'qty' | 'count', value: string) => void;
  addCustomPackingRow: () => void;
  removeCustomPackingRow: (idx: number) => void;
  applyCustomPackingPlan: () => void;

  bultoQuantities: Record<string, number>;
  onBultoQuantityChange: (key: string, value: string) => void;

  // Plantillas
  templates: TemplateItem[];
  selectedTemplate: string;
  handleTemplateChange: (code: string) => void;

  // Lote
  printBatch: PrintBatchJob[];
  handleAddOrderToBatch: (orderId: number, orderNameHint?: string) => void;
  handleRemoveFromBatch: (orderId: number) => void;
  handleClearBatch: () => void;
  isOrderInBatchFn: (orderId: number) => boolean;
  printFabVisible: boolean;

  // Vista previa
  totalLabelCount: number;
  totalLabelCountAll: number;
  previewCountText: string;
  previewSrc: string;
  previewEmpty: boolean;
  previewPlaceholderMessage: string;
  previewLoading: boolean;
  handlePreviewLoaded: () => void;
  handlePreviewError: () => void;

  // Impresión
  printSidebarOpen: boolean;
  openPrintSidebar: () => void;
  closePrintSidebar: () => void;
  handlePrintNext: () => void;
  handlePrintLabels: () => void;
  handleDownloadPdf: () => void;
  actionButtonsDisabled: boolean;

  printerCopies: number;
  onPrinterCopiesChange: (value: number) => void;
  onPrinterCopiesCommit: () => void;
  printerThermalMethod: 'transfer' | 'direct';
  onPrinterThermalMethodChange: (method: 'transfer' | 'direct') => void;
  availablePrinters: AvailablePrinter[];
  visiblePrinters: AvailablePrinter[];
  localVisibleKeys: Set<string>;
  toggleLocalPrinterVisible: (stationId: string, windowsName: string, visible: boolean) => void;
  selectedPrinterValue: string;
  stockSize: string;
  onPrinterSelectChange: (value: string) => void;
  printAgentStatusText: string;
  printerSaveStatus: string;
  printProgress: PrintProgressState;
  closePrintProgress: () => void;
  hardwareDescription: string;
  hardwareProfile: { printMode: string; thermalMethod: string; mediaType: string };
  refreshAvailablePrinters: () => void;

  inspectorOptions: Array<{ id: number; name: string }>;
  selectedInspectorName: string;
  onInspectorSelect: (name: string) => void;
}

const LabelsAppContext = createContext<LabelsAppState | null>(null);

export function useLabelsApp(): LabelsAppState {
  const ctx = useContext(LabelsAppContext);
  if (!ctx) throw new Error('useLabelsApp debe usarse dentro de LabelsAppProvider');
  return ctx;
}

export function LabelsAppProvider({ children }: { children: ReactNode }) {
  const [orderQuery, setOrderQuery] = useState('');
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [orderListHint, setOrderListHint] = useState('');
  const [orderSearchExecuted, setOrderSearchExecuted] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [manualActive, setManualActive] = useState(false);
  const [manualEan, setManualEanState] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [manualLotPrefix, setManualLotPrefix] = useState('');
  const [manualLotNumber, setManualLotNumber] = useState('');
  const [manualProductName, setManualProductName] = useState('');
  const [lastOrderData, setLastOrderData] = useState<OrderResponse | null>(null);
  const [totalLabelCount, setTotalLabelCount] = useState(0);
  const [totalLabelCountAll, setTotalLabelCountAll] = useState(0);

  const [selectionGroups, setSelectionGroups] = useState<SelectionGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [summaryByRef, setSummaryByRef] = useState<Map<string, SummaryMeta>>(new Map());

  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [unitsFilter, setUnitsFilter] = useState('');
  const [dualPacking, setDualPacking] = useState(false);
  const [customPackingRows, setCustomPackingRows] = useState<CustomPackingRow[]>([]);
  const [appliedCustomPacking, setAppliedCustomPacking] = useState<AppliedPackingRow[] | null>(
    null,
  );
  const [customPackingModeActive, setCustomPackingModeActive] = useState(false);
  const [bultoQuantities, setBultoQuantities] = useState<Record<string, number>>({});

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const [printBatch, setPrintBatch] = useState<PrintBatchJob[]>([]);

  const [previewSrc, setPreviewSrc] = useState('');
  const [previewEmpty, setPreviewEmpty] = useState(true);
  const [previewPlaceholderMessage, setPreviewPlaceholderMessage] = useState(
    'Elige una plantilla para ver la vista previa',
  );
  const [previewLoading, setPreviewLoading] = useState(false);

  const [printSidebarOpen, setPrintSidebarOpen] = useState(false);
  const [actionButtonsDisabled, setActionButtonsDisabled] = useState(false);

  const [printerCopies, setPrinterCopies] = useState(1);
  const [printerThermalMethod, setPrinterThermalMethod] = useState<'transfer' | 'direct'>('transfer');
  const [stockSize, setStockSize] = useState('producto-terminado');
  const [selectedPrinterValue, setSelectedPrinterValue] = useState('');
  const [availablePrinters, setAvailablePrinters] = useState<AvailablePrinter[]>([]);
  const [localVisibleKeys, setLocalVisibleKeys] = useState<Set<string>>(() =>
    loadLocalVisiblePrinters(),
  );
  const [printAgentStatusText, setPrintAgentStatusText] = useState('Comprobando agente…');
  const [printerSaveStatus, setPrinterSaveStatus] = useState('');
  const [printProgress, setPrintProgress] = useState<PrintProgressState>({ open: false });
  const [inspectorOptions, setInspectorOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedInspectorName, setSelectedInspectorName] = useState('');
  const [inspectorByOrderId, setInspectorByOrderId] = useState<Record<number, string>>({});

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const printerSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dualPackingVisible = Boolean(
    (lastOrderData?.order?.supportsDualPacking && selectedTemplate === 'bulto-estandar') ||
      selectedTemplate === 'producto-terminado-carpenter',
  );
  const customPackingVisible = Boolean(lastOrderData?.order);

  const latest = useRef<LatestState>({
    orderQuery,
    selectedOrderId,
    manualActive,
    manualEan,
    manualQty,
    manualLotPrefix,
    manualLotNumber,
    lastOrderData,
    totalLabelCount,
    totalLabelCountAll,
    selectionGroups,
    selectedGroupIds,
    rangeFrom,
    rangeTo,
    unitsFilter,
    dualPacking,
    customPackingRows,
    appliedCustomPacking,
    customPackingVisible,
    customPackingModeActive,
    bultoQuantities,
    selectedTemplate,
    printBatch,
    stockSize,
    selectedPrinterValue,
    printerCopies,
    printerThermalMethod,
    availablePrinters,
    selectedInspectorName,
    inspectorByOrderId,
  });
  latest.current = {
    orderQuery,
    selectedOrderId,
    manualActive,
    manualEan,
    manualQty,
    manualLotPrefix,
    manualLotNumber,
    lastOrderData,
    totalLabelCount,
    totalLabelCountAll,
    selectionGroups,
    selectedGroupIds,
    rangeFrom,
    rangeTo,
    unitsFilter,
    dualPacking,
    customPackingRows,
    appliedCustomPacking,
    customPackingVisible,
    customPackingModeActive,
    bultoQuantities,
    selectedTemplate,
    printBatch,
    stockSize,
    selectedPrinterValue,
    printerCopies,
    printerThermalMethod,
    availablePrinters,
    selectedInspectorName,
    inspectorByOrderId,
  };

  // Ocultar reparto/pares cuando ya no aplican a la plantilla actual.
  useEffect(() => {
    if (!dualPackingVisible && dualPacking) setDualPacking(false);
  }, [dualPackingVisible, dualPacking]);
  useEffect(() => {
    if (customPackingVisible && customPackingRows.length === 0) {
      const rows = [{ qty: '', count: '' }];
      setCustomPackingRows(rows);
      latest.current.customPackingRows = rows;
      return;
    }
    if (!customPackingVisible && (customPackingRows.length > 0 || appliedCustomPacking)) {
      setCustomPackingRows([]);
      setAppliedCustomPacking(null);
      latest.current.customPackingRows = [];
      latest.current.appliedCustomPacking = null;
    }
  }, [customPackingVisible, customPackingRows.length, appliedCustomPacking]);

  // ——— Búsqueda de órdenes ———

  function abortSearch() {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }

  async function searchOrdersRemote(query: string) {
    abortSearch();
    const seq = ++searchSeqRef.current;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    try {
      const list = await apiSearchOrders(query, controller.signal);
      if (seq !== searchSeqRef.current) return;
      setOrders(list);
      setOrderSearchExecuted(true);
      setOrderListHint(list.length ? `${list.length} resultado${list.length === 1 ? '' : 's'}` : '0 resultados');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      toast.error(err.message || 'Error al buscar órdenes');
    } finally {
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    }
  }

  function runOrderSearch() {
    const q = latest.current.orderQuery.trim();
    if (!q) {
      abortSearch();
      searchSeqRef.current += 1;
      setOrders([]);
      setOrderListHint('');
      setOrderSearchExecuted(false);
      return;
    }
    if (q.length < ORDER_SEARCH_MIN_CHARS) {
      toast.error(`Escribe al menos ${ORDER_SEARCH_MIN_CHARS} caracteres y pulsa Enter`);
      return;
    }
    void searchOrdersRemote(q);
  }

  function handleClearOrderSearch() {
    setOrderQuery('');
    latest.current.orderQuery = '';
    abortSearch();
    searchSeqRef.current += 1;
    setOrders([]);
    setOrderListHint('');
    setOrderSearchExecuted(false);
  }

  // ——— Plantillas ———

  async function loadTemplates() {
    try {
      const list = await apiListTemplates();
      const active = list.filter((t) => t.isActive);
      const sorted = [...active].sort((a, b) => a.name.localeCompare(b.name, 'es'));
      setTemplates(sorted);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar plantillas');
    }
  }

  // ——— Parámetros de API (plantilla + selección + filtros) ———

  function appendSelectionParams(params: URLSearchParams, ctx: LatestState) {
    if (!isAllGroupsSelected(ctx.selectionGroups, ctx.selectedGroupIds)) {
      params.set('groups', Array.from(ctx.selectedGroupIds).join(','));
    }
    const fromVal = ctx.rangeFrom.trim();
    const toVal = ctx.rangeTo.trim();
    const unitsVal = ctx.unitsFilter.trim();
    if (fromVal) params.set('from', fromVal);
    if (toVal) params.set('to', toVal);
    if (unitsVal) params.set('units', unitsVal);
    if (ctx.dualPacking) params.set('dualPacking', '1');
    if (ctx.customPackingModeActive) {
      const packPlan = ctx.customPackingVisible ? ctx.appliedCustomPacking : null;
      if (packPlan) params.set('customPacking', formatCustomPackingParam(packPlan));
      if (ctx.bultoQuantities && Object.keys(ctx.bultoQuantities).length > 0) {
        params.set('bultoQuantities', JSON.stringify(ctx.bultoQuantities));
      }
    }
    if (
      templateUsesInspector(resolveEffectiveTemplate(ctx)) &&
      ctx.selectedInspectorName
    ) {
      params.set('inspectorName', ctx.selectedInspectorName);
    }
  }

  function resolveEffectiveTemplate(ctx: LatestState): string {
    return ctx.selectedTemplate || ctx.lastOrderData?.preview?.templateCode || '';
  }

  function buildApiQueryParams(ctx: LatestState, includeStockSize = true): URLSearchParams {
    const params = new URLSearchParams();
    if (ctx.selectedTemplate) params.set('template', ctx.selectedTemplate);
    appendSelectionParams(params, ctx);
    if (includeStockSize && ctx.stockSize) params.set('stockSize', ctx.stockSize);
    return params;
  }

  // ——— Selección / filtros ———

  function scheduleSelectionRefresh() {
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = setTimeout(() => {
      void refreshOrderPreview();
    }, 300);
  }

  function applyManualParams(params: URLSearchParams, ctx: LatestState) {
    params.set('ean', ctx.manualEan.trim());
    params.set('qty', ctx.manualQty.trim());
    params.set('lotPrefix', ctx.manualLotPrefix.trim());
    params.set('lotNumber', ctx.manualLotNumber.trim());
  }

  async function refreshOrderPreview() {
    const ctx = latest.current;
    if (!ctx.selectedOrderId && !ctx.manualActive) return;
    try {
      const params = buildApiQueryParams(ctx);
      let data: OrderResponse;
      if (ctx.manualActive) {
        applyManualParams(params, ctx);
        data = await apiGetManualOrder(params);
      } else {
        data = await apiGetOrder(ctx.selectedOrderId!, params);
      }
      setLastOrderData(data);
      latest.current.lastOrderData = data;

      const nextGroups = data.preview?.groups || [];
      const nextIds = new Set(nextGroups.map((g) => g.id));
      const keepSelected = Array.from(ctx.selectedGroupIds).filter((id) => nextIds.has(id));
      const nextSelected = keepSelected.length > 0 ? new Set(keepSelected) : new Set(nextGroups.map((g) => g.id));
      setSelectionGroups(nextGroups);
      latest.current.selectionGroups = nextGroups;
      setSelectedGroupIds(nextSelected);
      latest.current.selectedGroupIds = nextSelected;
      setSummaryByRef(buildSummaryLookup(data.preview?.summary));

      const nextTotal = data.preview.totalLabels;
      const nextTotalAll = data.preview.totalLabelsAll ?? nextTotal;
      setTotalLabelCount(nextTotal);
      latest.current.totalLabelCount = nextTotal;
      setTotalLabelCountAll(nextTotalAll);
      latest.current.totalLabelCountAll = nextTotalAll;

      syncBatchEntryFromCurrentOrder();

      if (nextTotal > 0) {
        refreshHtmlPreview();
      } else {
        clearHtmlPreview(
          nextIds.size === 0
            ? 'No hay productos seleccionados. Elige al menos uno para imprimir.'
            : 'No hay etiquetas que coincidan con la selección',
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar la selección');
    }
  }

  function handleGroupCheckboxChange(groupId: string, checked: boolean) {
    const ctx = latest.current;
    const group = ctx.selectionGroups.find((g) => g.id === groupId);
    if (!group) return;
    const next = new Set(ctx.selectedGroupIds);
    if (checked) {
      next.add(groupId);
      if (group.isKitParent) {
        ctx.selectionGroups.filter((g) => g.parentId === groupId).forEach((child) => next.add(child.id));
      }
    } else {
      next.delete(groupId);
      if (group.isKitParent) {
        ctx.selectionGroups.filter((g) => g.parentId === groupId).forEach((child) => next.delete(child.id));
      } else if (group.parentId) {
        next.delete(group.parentId);
      }
    }
    setSelectedGroupIds(next);
    latest.current.selectedGroupIds = next;
    scheduleSelectionRefresh();
  }

  function handleSelectAllGroups() {
    const next = new Set(latest.current.selectionGroups.map((g) => g.id));
    setSelectedGroupIds(next);
    latest.current.selectedGroupIds = next;
    scheduleSelectionRefresh();
  }

  function handleClearAllGroups() {
    const next = new Set<string>();
    setSelectedGroupIds(next);
    latest.current.selectedGroupIds = next;
    scheduleSelectionRefresh();
  }

  function onRangeFromChange(value: string) {
    setRangeFrom(value);
    latest.current.rangeFrom = value;
    scheduleSelectionRefresh();
  }
  function onRangeToChange(value: string) {
    setRangeTo(value);
    latest.current.rangeTo = value;
    scheduleSelectionRefresh();
  }
  function onUnitsFilterChange(value: string) {
    setUnitsFilter(value);
    latest.current.unitsFilter = value;
    scheduleSelectionRefresh();
  }
  function onDualPackingChange(checked: boolean) {
    setDualPacking(checked);
    latest.current.dualPacking = checked;
    scheduleSelectionRefresh();
  }

  function onCustomPackingRowChange(idx: number, field: 'qty' | 'count', value: string) {
    const rows = latest.current.customPackingRows.slice();
    while (rows.length <= idx) {
      rows.push({ qty: '', count: '' });
    }
    rows[idx] = { ...rows[idx], [field]: value };
    setCustomPackingRows(rows);
    latest.current.customPackingRows = rows;
  }

  function addCustomPackingRow() {
    const rows = [...latest.current.customPackingRows, { qty: '', count: '' }];
    setCustomPackingRows(rows);
    latest.current.customPackingRows = rows;
  }

  function removeCustomPackingRow(idx: number) {
    let rows = latest.current.customPackingRows.filter((_, i) => i !== idx);
    if (rows.length === 0) rows = [{ qty: '', count: '' }];
    setCustomPackingRows(rows);
    latest.current.customPackingRows = rows;
  }

  function applyCustomPackingPlan() {
    const ctx = latest.current;
    const rows = ctx.customPackingRows;
    const draft = buildDraftCustomPackingPlan(rows, ctx.lastOrderData);
    const hasPartial = rows.some((row) => (Number(row.qty) || 0) > 0 || (Number(row.count) || 0) > 0);

    if (!hasPartial || !draft) {
      setAppliedCustomPacking(null);
      latest.current.appliedCustomPacking = null;
      scheduleSelectionRefresh();
      return;
    }
    setAppliedCustomPacking(draft);
    latest.current.appliedCustomPacking = draft;
    scheduleSelectionRefresh();
  }

  function toggleCustomPackingModeActive() {
    const next = !latest.current.customPackingModeActive;
    setCustomPackingModeActive(next);
    latest.current.customPackingModeActive = next;
    scheduleSelectionRefresh();
  }

  function onBultoQuantityChange(key: string, value: string) {
    const num = parseInt(value, 10);
    const next = { ...latest.current.bultoQuantities };
    if (!isNaN(num) && num > 0) {
      next[key] = num;
    } else {
      delete next[key];
    }
    setBultoQuantities(next);
    latest.current.bultoQuantities = next;
    scheduleSelectionRefresh();
  }

  const customPackingStatus = useMemo(() => {
    const used = getCustomPackingUsed(customPackingRows);
    const draft = buildDraftCustomPackingPlan(customPackingRows, lastOrderData);
    const hasPartial = customPackingRows.some(
      (row) => (Number(row.qty) || 0) > 0 || (Number(row.count) || 0) > 0,
    );
    const isApplied = packingPlansEqual(draft, appliedCustomPacking) && Boolean(appliedCustomPacking);

    if (!hasPartial && used === 0) {
      return { text: 'Sin reparto personalizado', className: 'is-empty' };
    }
    if (draft && isApplied) {
      return { text: `✓ Reparto activo (${used} uds)`, className: 'is-ok' };
    }
    if (draft && !isApplied) {
      return { text: `Listo (${used} uds) · Validar`, className: 'is-pending' };
    }
    return { text: 'Ingresá valores válidos', className: 'is-bad' };
  }, [customPackingRows, appliedCustomPacking, lastOrderData]);

  const selectionSummaryHint = useMemo(() => {
    if (!selectionGroups.length) return '';
    const parts = [`${selectedGroupIds.size}/${selectionGroups.length} grupos`];
    const fromVal = rangeFrom.trim();
    const toVal = rangeTo.trim();
    if (fromVal || toVal) parts.push(`rango ${fromVal || '1'}–${toVal || '…'}`);
    const unitsVal = unitsFilter.trim();
    if (unitsVal) parts.push(`unidades ${unitsVal}`);
    return parts.join(' · ');
  }, [selectionGroups, selectedGroupIds, rangeFrom, rangeTo, unitsFilter]);

  const isAllSelected = isAllGroupsSelected(selectionGroups, selectedGroupIds);

  // ——— Lote de impresión ———

  function upsertBatchJob(job: PrintBatchJob) {
    const current = latest.current.printBatch;
    const idx = current.findIndex((entry) => entry.orderId === job.orderId);
    const next = idx >= 0 ? current.map((entry, i) => (i === idx ? job : entry)) : [...current, job];
    setPrintBatch(next);
    latest.current.printBatch = next;
    refreshHtmlPreview();
  }

  function captureCurrentSelectionJob(): PrintBatchJob {
    const ctx = latest.current;
    if (!ctx.selectedOrderId || !ctx.lastOrderData?.order) {
      throw new Error('Selecciona una orden primero');
    }
    if (ctx.totalLabelCount <= 0) {
      throw new Error('No hay etiquetas seleccionadas');
    }

    const hintParts: string[] = [];
    const allSelected = isAllGroupsSelected(ctx.selectionGroups, ctx.selectedGroupIds);
    if (!allSelected) {
      const selected = ctx.selectionGroups.filter((g) => ctx.selectedGroupIds.has(g.id) && !g.isKitParent);
      hintParts.push(selected.length ? selected.map((g) => g.label).join(', ') : 'selección parcial');
    }
    const unitsVal = ctx.unitsFilter.trim();
    const fromVal = ctx.rangeFrom.trim();
    const toVal = ctx.rangeTo.trim();
    if (unitsVal) hintParts.push(`u ${unitsVal}`);
    if (fromVal || toVal) hintParts.push(`rango ${fromVal || '1'}–${toVal || '…'}`);
    if (ctx.dualPacking) hintParts.push('pares');
    const packPlan = ctx.customPackingVisible ? ctx.appliedCustomPacking : null;
    if (packPlan) hintParts.push(`reparto ${formatCustomPackingParam(packPlan)}`);

    return {
      orderId: ctx.selectedOrderId,
      orderName: ctx.lastOrderData.order.name,
      groups: allSelected ? undefined : Array.from(ctx.selectedGroupIds).join(','),
      units: unitsVal || undefined,
      from: fromVal || undefined,
      to: toVal || undefined,
      dualPacking: ctx.dualPacking ? 1 : undefined,
      customPacking: packPlan ? formatCustomPackingParam(packPlan) : undefined,
      bultoQuantities:
        ctx.bultoQuantities && Object.keys(ctx.bultoQuantities).length > 0
          ? ctx.bultoQuantities
          : undefined,
      inspectorName: ctx.selectedInspectorName.trim() || undefined,
      labelCount: ctx.totalLabelCount,
      hint: hintParts.join(' · ') || 'completa',
    };
  }

  function syncBatchEntryFromCurrentOrder() {
    const ctx = latest.current;
    if (!ctx.selectedOrderId || !isOrderInBatch(ctx.printBatch, ctx.selectedOrderId)) return;
    if (ctx.totalLabelCount <= 0) return;
    try {
      upsertBatchJob(captureCurrentSelectionJob());
    } catch {
      /* ignorar mientras carga */
    }
  }

  async function handleAddOrderToBatch(orderId: number, orderNameHint?: string) {
    const ctx = latest.current;
    if (isOrderInBatch(ctx.printBatch, orderId)) {
      toast.info('Esa orden ya está en el lote');
      return;
    }
    const sameOrder = Number(orderId) === Number(ctx.selectedOrderId);
    const params = sameOrder ? buildApiQueryParams(ctx) : new URLSearchParams();
    if (!sameOrder && ctx.selectedTemplate) params.set('template', ctx.selectedTemplate);

    try {
      const data = await apiGetOrder(orderId, params);
      const count = data.preview?.totalLabels ?? 0;
      if (count <= 0) throw new Error('La orden no tiene etiquetas para imprimir');

      if (sameOrder && ctx.lastOrderData?.order) {
        setTotalLabelCount(count);
        latest.current.totalLabelCount = count;
        const totalAll = data.preview?.totalLabelsAll ?? count;
        setTotalLabelCountAll(totalAll);
        latest.current.totalLabelCountAll = totalAll;
        upsertBatchJob(captureCurrentSelectionJob());
      } else {
        const savedInspector =
          latest.current.inspectorByOrderId[Number(orderId)] || undefined;
        upsertBatchJob({
          orderId: Number(orderId),
          orderName: data.order?.name || orderNameHint || `Orden ${orderId}`,
          labelCount: count,
          hint: 'completa',
          inspectorName: savedInspector,
        });
      }
      toast.success(`Agregada: ${data.order?.name || orderNameHint}`);
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  }

  function handleRemoveFromBatch(orderId: number) {
    const next = latest.current.printBatch.filter((job) => job.orderId !== orderId);
    setPrintBatch(next);
    latest.current.printBatch = next;
    refreshHtmlPreview();
  }

  function handleClearBatch() {
    setPrintBatch([]);
    latest.current.printBatch = [];
    refreshHtmlPreview();
  }

  function isOrderInBatchFn(orderId: number): boolean {
    return isOrderInBatch(latest.current.printBatch, orderId);
  }

  // ——— Vista previa HTML ———

  function clearHtmlPreview(message?: string) {
    setPreviewEmpty(true);
    setPreviewSrc('');
    setPreviewLoading(false);
    if (message) setPreviewPlaceholderMessage(message);
  }

  function buildHtmlPreviewUrl(): string {
    const ctx = latest.current;
    const params = buildApiQueryParams(ctx, false);
    params.set('t', String(Date.now()));
    if (ctx.printBatch.length > 0) {
      params.set('jobs', JSON.stringify(jobsPayloadFromBatch(ctx.printBatch)));
      return `/api/labels/batch/html?${params.toString()}`;
    }
    if (ctx.manualActive) {
      applyManualParams(params, ctx);
      return `/api/manual/labels/html?${params.toString()}`;
    }
    return `/api/orders/${ctx.selectedOrderId}/labels/html?${params.toString()}`;
  }

  function buildPdfUrl(download = false): string {
    const ctx = latest.current;
    const params = buildApiQueryParams(ctx, true);
    params.set('t', String(Date.now()));
    if (download) params.set('download', '1');
    if (ctx.printBatch.length > 0) {
      params.set('jobs', JSON.stringify(jobsPayloadFromBatch(ctx.printBatch)));
      return `/api/labels/batch/pdf?${params.toString()}`;
    }
    if (ctx.manualActive) {
      applyManualParams(params, ctx);
      return `/api/manual/labels/pdf?${params.toString()}`;
    }
    return `/api/orders/${ctx.selectedOrderId}/labels/pdf?${params.toString()}`;
  }

  function refreshHtmlPreview() {
    const ctx = latest.current;
    const hasBatch = ctx.printBatch.length > 0;
    const hasCurrent =
      (Boolean(ctx.selectedOrderId) || ctx.manualActive) && ctx.totalLabelCount > 0;
    const template = ctx.selectedTemplate;

    if (!template) {
      clearHtmlPreview('Elige una plantilla para ver la vista previa');
      return;
    }
    if (!hasBatch && !hasCurrent) {
      clearHtmlPreview(
        !ctx.selectedOrderId && !ctx.manualActive && !hasBatch
          ? 'Selecciona una orden para ver la etiqueta'
          : 'No hay etiquetas para previsualizar',
      );
      return;
    }

    setPreviewEmpty(false);
    setPreviewLoading(true);
    setPreviewSrc(buildHtmlPreviewUrl());
  }

  function scheduleHtmlPreviewRefresh() {
    if (htmlPreviewTimerRef.current) clearTimeout(htmlPreviewTimerRef.current);
    htmlPreviewTimerRef.current = setTimeout(() => refreshHtmlPreview(), 250);
  }

  function handlePreviewLoaded() {
    setPreviewLoading(false);
  }
  function handlePreviewError() {
    setPreviewLoading(false);
    toast.error('Error al cargar la vista previa');
  }

  // ——— Órdenes: carga y selección ———

  async function loadOrder(id: number): Promise<OrderResponse> {
    const params = buildApiQueryParams(latest.current);
    return apiGetOrder(id, params);
  }

  function applyBatchJobToSelectionUi(job: PrintBatchJob) {
    const groups = latest.current.selectionGroups;
    const ids = job.groups
      ? new Set(job.groups.split(',').map((g) => g.trim()).filter(Boolean))
      : new Set(groups.map((g) => g.id));
    setSelectedGroupIds(ids);
    latest.current.selectedGroupIds = ids;

    setUnitsFilter(job.units || '');
    latest.current.unitsFilter = job.units || '';
    setRangeFrom(job.from || '');
    latest.current.rangeFrom = job.from || '';
    setRangeTo(job.to || '');
    latest.current.rangeTo = job.to || '';
    setDualPacking(Boolean(job.dualPacking));
    latest.current.dualPacking = Boolean(job.dualPacking);

    const bQty = job.bultoQuantities || {};
    setBultoQuantities(bQty);
    latest.current.bultoQuantities = bQty;

    if (job.inspectorName) {
      const name = job.inspectorName.trim().toUpperCase();
      setSelectedInspectorName(name);
      latest.current.selectedInspectorName = name;
      setInspectorByOrderId((prev) => {
        const next = { ...prev, [job.orderId]: name };
        latest.current.inspectorByOrderId = next;
        return next;
      });
    }

    if (job.customPacking) {
      const rows = job.customPacking
        .split(',')
        .map((token) => {
          const match = token.trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
          if (!match) return null;
          return { qty: match[1], count: match[2] };
        })
        .filter((row): row is CustomPackingRow => Boolean(row));
      const applied = rows.map((row) => ({ qty: Number(row.qty), count: Number(row.count) }));
      setCustomPackingRows(rows);
      latest.current.customPackingRows = rows;
      setAppliedCustomPacking(applied);
      latest.current.appliedCustomPacking = applied;
    } else {
      setCustomPackingRows([]);
      latest.current.customPackingRows = [];
      setAppliedCustomPacking(null);
      latest.current.appliedCustomPacking = null;
    }
  }

  function renderOrder(data: OrderResponse) {
    setLastOrderData(data);
    latest.current.lastOrderData = data;

    const nextGroups = data.preview.groups || [];
    setSelectionGroups(nextGroups);
    latest.current.selectionGroups = nextGroups;
    const allIds = new Set(nextGroups.map((g) => g.id));
    setSelectedGroupIds(allIds);
    latest.current.selectedGroupIds = allIds;
    setSummaryByRef(buildSummaryLookup(data.preview.summary));
    setRangeFrom('');
    latest.current.rangeFrom = '';
    setRangeTo('');
    latest.current.rangeTo = '';
    setUnitsFilter('');
    latest.current.unitsFilter = '';
    setBultoQuantities({});
    latest.current.bultoQuantities = {};

    const batchJob = latest.current.printBatch.find((job) => job.orderId === data.order.id);
    if (batchJob) {
      applyBatchJobToSelectionUi(batchJob);
      setTotalLabelCount(batchJob.labelCount);
      latest.current.totalLabelCount = batchJob.labelCount;
      const totalAll = data.preview.totalLabelsAll ?? data.preview.totalLabels;
      setTotalLabelCountAll(totalAll);
      latest.current.totalLabelCountAll = totalAll;
      scheduleSelectionRefresh();
    } else {
      setTotalLabelCount(data.preview.totalLabels);
      latest.current.totalLabelCount = data.preview.totalLabels;
      const totalAll = data.preview.totalLabelsAll ?? data.preview.totalLabels;
      setTotalLabelCountAll(totalAll);
      latest.current.totalLabelCountAll = totalAll;
      // Inspector guardado para esta orden (no el de la impresión anterior).
      const saved =
        latest.current.inspectorByOrderId[data.order.id] || '';
      setSelectedInspectorName(saved);
      latest.current.selectedInspectorName = saved;
    }

    refreshHtmlPreview();
  }

  async function selectOrder(id: number | null) {
    setManualActive(false);
    latest.current.manualActive = false;
    if (!id) {
      setSelectedOrderId(null);
      latest.current.selectedOrderId = null;
      clearHtmlPreview('Elige una plantilla para ver la vista previa');
      return;
    }
    setSelectedOrderId(id);
    latest.current.selectedOrderId = id;
    try {
      const data = await loadOrder(id);
      renderOrder(data);
    } catch (err: any) {
      toast.error(err.message || 'Error al cargar la orden');
    }
  }

  // ——— Impresión manual por código EAN (sin OP en Odoo) ———

  async function lookupManualProduct() {
    const ean = latest.current.manualEan.trim();
    if (!ean) {
      setManualProductName('');
      return;
    }
    try {
      const product = await apiGetManualProduct(ean);
      setManualProductName(product.name);
    } catch {
      setManualProductName('');
    }
  }

  async function loadManualOrder(): Promise<OrderResponse> {
    const params = buildApiQueryParams(latest.current);
    applyManualParams(params, latest.current);
    return apiGetManualOrder(params);
  }

  async function generateManualOrder() {
    const ctx = latest.current;
    const ean = ctx.manualEan.trim();
    const qty = ctx.manualQty.trim();
    const prefix = ctx.manualLotPrefix.trim();
    const number = ctx.manualLotNumber.trim();

    if (!ean) {
      toast.error('Ingresa el código EAN');
      return;
    }
    if (!qty || Number(qty) <= 0) {
      toast.error('Ingresa la cantidad a producir');
      return;
    }
    if (!prefix || !number) {
      toast.error('Completa los dos campos del lote (ej. PLCOL y 00450)');
      return;
    }

    setManualActive(true);
    latest.current.manualActive = true;
    setSelectedOrderId(null);
    latest.current.selectedOrderId = null;

    try {
      const data = await loadManualOrder();
      renderOrder(data);
    } catch (err: any) {
      toast.error(err.message || 'Error al generar la orden manual');
    }
  }

  // ——— Plantilla seleccionada ———

  function syncStockSizeToTemplate(templateCode: string) {
    const suggested = suggestStockSizeForTemplate(templateCode);
    if (latest.current.stockSize !== suggested) {
      setStockSize(suggested);
      latest.current.stockSize = suggested;
      persistPrinterSettings();
    }
  }

  function handleTemplateChange(code: string) {
    setSelectedTemplate(code);
    latest.current.selectedTemplate = code;
    if (code) syncStockSizeToTemplate(code);

    const ctx = latest.current;
    if (ctx.printBatch.length > 0) {
      refreshHtmlPreview();
    } else if (ctx.selectedOrderId) {
      void refreshOrderPreview();
    } else {
      scheduleHtmlPreviewRefresh();
    }
  }

  // ——— Configuración de impresora ———

  function readPrinterSettingsFromUi(): PrinterSettings {
    const ctx = latest.current;
    const stock = ctx.stockSize || 'producto-terminado';
    const prev = loadSettings();
    const selectedPrinterByStock = { ...(prev.selectedPrinterByStock || {}) };
    const decoded = decodePrinterValue(ctx.selectedPrinterValue);
    if (decoded) selectedPrinterByStock[stock] = decoded;

    const hardware = getHardwareProfile({ stockSize: stock, windowsName: decoded?.windowsName });
    // El selector "Método de Impresión" solo existe para papel/tela — para
    // adhesivo el método es fijo (directa), no hay que dejar que el estado
    // de UI (que arranca en 'transfer') lo pise.
    const isPapel = isPapelTarget({ stockSize: stock, windowsName: decoded?.windowsName });
    const settings: PrinterSettings = {
      mode: 'direct',
      copies: Math.max(1, Number(ctx.printerCopies) || 1),
      stockSize: stock,
      printMode: hardware.printMode,
      thermalMethod: isPapel ? ctx.printerThermalMethod || hardware.thermalMethod : hardware.thermalMethod,
      mediaType: hardware.mediaType,
      selectedPrinterByStock,
    };
    return resolveHardwareSettings(settings);
  }

  function persistPrinterSettings() {
    const settings = readPrinterSettingsFromUi();
    saveSettings(settings);
    setPrinterSaveStatus('Configuración de impresora guardada.');
    if (printerSaveTimerRef.current) clearTimeout(printerSaveTimerRef.current);
    printerSaveTimerRef.current = setTimeout(() => setPrinterSaveStatus(''), 2000);
  }

  const visiblePrinters = useMemo(
    () =>
      availablePrinters.filter((p) =>
        localVisibleKeys.has(encodePrinterValue(p.stationId, p.windowsName)),
      ),
    [availablePrinters, localVisibleKeys],
  );

  function toggleLocalPrinterVisible(stationId: string, windowsName: string, visible: boolean) {
    const next = setPrinterLocallyVisible(stationId, windowsName, visible);
    setLocalVisibleKeys(new Set(next));
    fillDirectPrinterSelect(latest.current.availablePrinters, latest.current.stockSize, next);
  }

  function fillDirectPrinterSelect(
    printers: AvailablePrinter[],
    stock: string,
    visibleKeys: Set<string> = localVisibleKeys,
  ) {
    setAvailablePrinters(printers);
    latest.current.availablePrinters = printers;
    const visible = printers.filter((p) =>
      visibleKeys.has(encodePrinterValue(p.stationId, p.windowsName)),
    );
    const saved = getPrinterForStock(loadSettings(), stock);
    const preferredSaved =
      saved && visible.find((p) => p.stationId === saved.stationId && p.windowsName === saved.windowsName);
    const preferredMatch = visible.find((p) => p.matchesStock !== false);
    const pick = preferredSaved || preferredMatch || (visible.length === 1 ? visible[0] : null);
    const value = pick ? encodePrinterValue(pick.stationId, pick.windowsName) : '';
    setSelectedPrinterValue(value);
    latest.current.selectedPrinterValue = value;
  }

  async function refreshAvailablePrinters() {
    const stock = latest.current.stockSize || 'producto-terminado';
    setPrintAgentStatusText('Cargando impresoras…');
    try {
      const data = await apiAvailablePrinters(stock);
      const printers = data.printers || [];
      fillDirectPrinterSelect(printers, stock);

      if (printers.length === 0) {
        setPrintAgentStatusText('No hay impresoras en el catálogo. Pedile al admin que agregue una.');
        return;
      }
      const hasVisible = printers.some((p) =>
        localVisibleKeys.has(encodePrinterValue(p.stationId, p.windowsName)),
      );
      if (!hasVisible) {
        setPrintAgentStatusText('No elegiste ninguna impresora para esta PC.');
        return;
      }
      try {
        await connectQz();
        setPrintAgentStatusText('Listo para imprimir (QZ Tray conectado).');
      } catch {
        setPrintAgentStatusText('QZ Tray no está conectado en esta PC.');
      }
    } catch {
      setPrintAgentStatusText('No se pudieron cargar las impresoras.');
      fillDirectPrinterSelect([], stock);
    }
  }

  function applyPrinterSettingsToUi(settings: PrinterSettings) {
    const copies = settings.copies || 1;
    setPrinterCopies(copies);
    latest.current.printerCopies = copies;
    const method = settings.thermalMethod || 'transfer';
    setPrinterThermalMethod(method);
    latest.current.printerThermalMethod = method;
    const stock = settings.stockSize || 'producto-terminado';
    setStockSize(stock);
    latest.current.stockSize = stock;
    void refreshAvailablePrinters();
  }

  function initPrinterSettings() {
    const settings = loadSettings();
    applyPrinterSettingsToUi(settings);
  }

  const hardwareProfile = useMemo(() => {
    const decoded = decodePrinterValue(selectedPrinterValue);
    return getHardwareProfile({ stockSize, windowsName: decoded?.windowsName, thermalMethod: printerThermalMethod });
  }, [selectedPrinterValue, stockSize, printerThermalMethod]);
  const hardwareDescription = useMemo(() => describeHardwareProfile(hardwareProfile), [hardwareProfile]);

  function onPrinterCopiesChange(value: number) {
    setPrinterCopies(value);
    latest.current.printerCopies = value;
  }
  function onPrinterCopiesCommit() {
    persistPrinterSettings();
  }
  function onPrinterThermalMethodChange(method: 'transfer' | 'direct') {
    setPrinterThermalMethod(method);
    latest.current.printerThermalMethod = method;
    persistPrinterSettings();
  }
  function onPrinterSelectChange(value: string) {
    setSelectedPrinterValue(value);
    latest.current.selectedPrinterValue = value;
    persistPrinterSettings();
  }

  // ——— Sidebar de impresión ———

  function openPrintSidebar() {
    const ctx = latest.current;
    if (ctx.selectedTemplate) syncStockSizeToTemplate(ctx.selectedTemplate);
    void refreshAvailablePrinters();
    void loadInspectorOptions();
    setPrintSidebarOpen(true);
  }
  function closePrintSidebar() {
    setPrintSidebarOpen(false);
  }

  async function loadInspectorOptions() {
    try {
      const rows = await apiListActiveInspectors();
      setInspectorOptions(rows);
    } catch {
      setInspectorOptions([]);
    }
  }

  function requireTemplateSelection(): boolean {
    if (latest.current.selectedTemplate) return true;
    toast.error('Elige una plantilla arriba de la vista previa');
    return false;
  }

  function requireInspectorSelection(): boolean {
    const ctx = latest.current;
    if (!templateUsesInspector(resolveEffectiveTemplate(ctx))) return true;

    if (ctx.printBatch.length > 0) {
      // Asegura que la orden actual (si está en el lote) lleve su inspector.
      if (
        ctx.selectedOrderId &&
        isOrderInBatch(ctx.printBatch, ctx.selectedOrderId) &&
        ctx.selectedInspectorName.trim()
      ) {
        syncBatchEntryFromCurrentOrder();
      }
      const missing = latest.current.printBatch.filter(
        (job) => !String(job.inspectorName || '').trim(),
      );
      if (missing.length > 0) {
        const names = missing
          .slice(0, 3)
          .map((j) => j.orderName)
          .join(', ');
        toast.error(
          missing.length === 1
            ? `Elige inspector para ${names}`
            : `Falta inspector en ${missing.length} órdenes (${names}${missing.length > 3 ? '…' : ''})`,
        );
        return false;
      }
      return true;
    }

    if (ctx.selectedInspectorName.trim()) return true;
    toast.error('Elige un inspector de la lista');
    return false;
  }

  function handlePrintNext() {
    if (!requireTemplateSelection()) return;
    if (!requireInspectorSelection()) return;
    const ctx = latest.current;
    if (ctx.manualActive) {
      openPrintSidebar();
      return;
    }
    if (ctx.printBatch.length === 0) {
      toast.error('Agrega al menos una orden al lote con el botón +');
      return;
    }
    syncBatchEntryFromCurrentOrder();
    openPrintSidebar();
  }

  async function prepareBatchSelectionBeforePrint() {
    const ctx = latest.current;
    if (!ctx.selectedOrderId || !isOrderInBatch(ctx.printBatch, ctx.selectedOrderId)) {
      syncBatchEntryFromCurrentOrder();
      return;
    }
    await refreshOrderPreview();
  }

  function buildPrintDirectBody(): Record<string, unknown> {
    const ctx = latest.current;
    const settings = readPrinterSettingsFromUi();
    const body: Record<string, unknown> = { stockSize: settings.stockSize, copies: settings.copies };
    const selected = getPrinterForStock(settings, settings.stockSize);
    if (selected?.stationId) body.stationId = selected.stationId;
    if (selected?.windowsName) body.printerName = selected.windowsName;
    if (settings.printMode) body.printMode = settings.printMode;
    if (settings.thermalMethod) body.thermalMethod = settings.thermalMethod;
    if (settings.mediaType) body.mediaType = settings.mediaType;
    if (ctx.selectedTemplate) body.template = ctx.selectedTemplate;
    if (!isAllGroupsSelected(ctx.selectionGroups, ctx.selectedGroupIds)) {
      body.groups = Array.from(ctx.selectedGroupIds).join(',');
    }
    const fromVal = ctx.rangeFrom.trim();
    const toVal = ctx.rangeTo.trim();
    const unitsVal = ctx.unitsFilter.trim();
    if (fromVal) body.from = fromVal;
    if (toVal) body.to = toVal;
    if (unitsVal) body.units = unitsVal;
    if (ctx.dualPacking) body.dualPacking = 1;
    const packPlan = ctx.customPackingVisible ? ctx.appliedCustomPacking : null;
    if (packPlan) body.customPacking = formatCustomPackingParam(packPlan);
    if (
      templateUsesInspector(resolveEffectiveTemplate(ctx)) &&
      ctx.selectedInspectorName
    ) {
      body.inspectorName = ctx.selectedInspectorName;
    }
    if (ctx.manualActive) {
      body.ean = ctx.manualEan.trim();
      body.qty = ctx.manualQty.trim();
      body.lotPrefix = ctx.manualLotPrefix.trim();
      body.lotNumber = ctx.manualLotNumber.trim();
    }
    return body;
  }

  function buildPrintBatchBody(): Record<string, unknown> {
    const ctx = latest.current;
    const settings = readPrinterSettingsFromUi();
    const body: Record<string, unknown> = {
      stockSize: settings.stockSize,
      copies: settings.copies,
      jobs: jobsPayloadFromBatch(ctx.printBatch),
    };
    const selected = getPrinterForStock(settings, settings.stockSize);
    if (selected?.stationId) body.stationId = selected.stationId;
    if (selected?.windowsName) body.printerName = selected.windowsName;
    if (settings.printMode) body.printMode = settings.printMode;
    if (settings.thermalMethod) body.thermalMethod = settings.thermalMethod;
    if (settings.mediaType) body.mediaType = settings.mediaType;
    if (ctx.selectedTemplate) body.template = ctx.selectedTemplate;
    // Inspector va por job (cada orden); no un global de impresión.
    return body;
  }

  function resolvePrinterLabel(selected: { stationId: string; windowsName: string }): string {
    const match = availablePrinters.find(
      (p) => p.stationId === selected.stationId && p.windowsName === selected.windowsName,
    );
    return (match?.label || selected.windowsName).trim() || selected.windowsName;
  }

  const closePrintProgress = useCallback(() => {
    setPrintProgress({ open: false });
  }, []);

  async function printViaQz(settings: PrinterSettings) {
    const ctx = latest.current;
    const selected = getPrinterForStock(settings, settings.stockSize);
    if (!selected?.stationId || !selected?.windowsName) {
      throw new Error('Elige una impresora habilitada (Configuración → Impresoras) para este tipo de etiqueta.');
    }
    const useBatch = ctx.printBatch.length > 0;
    if (!useBatch && !ctx.selectedOrderId && !ctx.manualActive) {
      throw new Error('No hay orden ni lote para imprimir');
    }

    const printerLabel = resolvePrinterLabel(selected);
    const pagesEstimate = useBatch ? getBatchLabelTotal(ctx.printBatch) : ctx.totalLabelCount;
    setPrintProgress({
      open: true,
      phase: 'sending',
      printerLabel,
      pages: pagesEstimate,
    });

    const url = useBatch
      ? '/api/labels/print-batch'
      : ctx.manualActive
        ? '/api/manual/labels/print-direct'
        : `/api/orders/${ctx.selectedOrderId}/labels/print-direct`;
    const body = useBatch ? buildPrintBatchBody() : buildPrintDirectBody();
    // Flag de prueba fase 1 ZPL nativo (docs/evaluacion-zpl-nativo.md):
    // ?zplEngine=native en la URL, nada más — sin esto imprime como siempre.
    if (new URLSearchParams(window.location.search).get('zplEngine') === 'native') {
      body.debugZplEngine = 'native';
    }
    const payload = await apiPostJson<any>(url, body);
    const pages = payload.pages ?? pagesEstimate;
    const size =
      payload.form?.widthMm && payload.form?.heightMm
        ? `${payload.form.widthMm}×${payload.form.heightMm} mm`
        : '';
    const detail = [payload.paperName ? `papel «${payload.paperName}»` : '', size]
      .filter(Boolean)
      .join(' · ');

    setPrintProgress({ open: true, phase: 'connecting-qz', printerLabel, pages });
    try {
      await printRawZpl(selected.windowsName, payload.zpl);
    } catch (err) {
      if (err instanceof QzNotAvailableError) {
        setPrintProgress({ open: true, phase: 'not-installed', printerLabel, pages });
        setPrinterSaveStatus('QZ Tray no disponible en esta PC.');
        return payload;
      }
      throw err;
    }

    setPrintProgress({
      open: true,
      phase: 'success',
      printerLabel,
      pages,
      detail: detail || undefined,
    });
    const nativeCount = Number(payload.nativeLabelsCount) || 0;
    const engineNote = nativeCount > 0 ? ` · ZPL nativo (${nativeCount})` : '';
    setPrinterSaveStatus(`Impreso · ${pages} etiq. · ${printerLabel}${engineNote}`);
    return payload;
  }

  async function handlePrintLabels() {
    const ctx = latest.current;
    if (ctx.printBatch.length === 0 && !ctx.selectedOrderId && !ctx.manualActive) return;
    if (!requireTemplateSelection()) return;
    if (!requireInspectorSelection()) return;

    const settings = readPrinterSettingsFromUi();
    saveSettings(settings);
    setActionButtonsDisabled(true);
    try {
      await prepareBatchSelectionBeforePrint();
      await printViaQz(settings);
    } catch (err: any) {
      setPrintProgress({ open: false });
      toast.error(err.message || String(err));
    } finally {
      setActionButtonsDisabled(false);
    }
  }

  async function handleDownloadPdf() {
    const ctx = latest.current;
    if (ctx.printBatch.length === 0 && !ctx.selectedOrderId && !ctx.manualActive) return;
    if (!requireTemplateSelection()) return;
    if (!requireInspectorSelection()) return;

    setActionButtonsDisabled(true);
    try {
      const fallbackName = ctx.printBatch.length > 0
        ? `etiquetas-lote-${ctx.printBatch.length}.pdf`
        : ctx.manualActive
          ? `etiquetas-${ctx.manualLotPrefix}-OPR-${ctx.manualLotNumber}.pdf`
          : `etiquetas-orden-${ctx.selectedOrderId}.pdf`;
      const { blob, filename } = await apiDownloadPdfWithFilename(
        buildPdfUrl(true),
        fallbackName,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Error al descargar el PDF');
    } finally {
      setActionButtonsDisabled(false);
    }
  }

  // ——— Arranque ———

  useEffect(() => {
    void loadTemplates();
    void loadInspectorOptions();
    initPrinterSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewCountText = useMemo(() => {
    if (printBatch.length > 0) {
      const n = getBatchLabelTotal(printBatch);
      return n === 1
        ? `Lote: 1 etiqueta · ${printBatch.length} orden`
        : `Lote: ${n} etiquetas · ${printBatch.length} órdenes`;
    }
    if (totalLabelCount <= 0) return '';
    return totalLabelCount === 1 ? '1 etiqueta a imprimir' : `${totalLabelCount} etiquetas a imprimir`;
  }, [printBatch, totalLabelCount]);

  const printFabVisible =
    (printBatch.length > 0 || (manualActive && totalLabelCount > 0)) && Boolean(selectedTemplate);

  const manualOrderNamePreview = useMemo(() => {
    const prefix = manualLotPrefix.trim().toUpperCase();
    const number = manualLotNumber.trim();
    return prefix && number ? `${prefix}/OPR/${number}` : '';
  }, [manualLotPrefix, manualLotNumber]);

  const value: LabelsAppState = {
    orderQuery,
    setOrderQuery: (v) => {
      setOrderQuery(v);
      latest.current.orderQuery = v;
    },
    orders,
    orderListHint,
    orderSearchExecuted,
    runOrderSearch,
    handleClearOrderSearch,

    selectedOrderId,
    lastOrderData,
    selectOrder: (id) => void selectOrder(id),

    manualActive,
    manualEan,
    setManualEan: (v) => {
      setManualEanState(v);
      latest.current.manualEan = v;
      setManualProductName('');
    },
    manualQty,
    setManualQty: (v) => {
      setManualQty(v);
      latest.current.manualQty = v;
    },
    manualLotPrefix,
    setManualLotPrefix: (v) => {
      setManualLotPrefix(v);
      latest.current.manualLotPrefix = v;
    },
    manualLotNumber,
    setManualLotNumber: (v) => {
      setManualLotNumber(v);
      latest.current.manualLotNumber = v;
    },
    manualOrderNamePreview,
    manualProductName,
    lookupManualProduct: () => void lookupManualProduct(),
    generateManualOrder: () => void generateManualOrder(),

    selectionGroups,
    selectedGroupIds,
    summaryByRef,
    isAllSelected,
    handleGroupCheckboxChange,
    handleSelectAllGroups,
    handleClearAllGroups,
    selectionSummaryHint,

    rangeFrom,
    rangeTo,
    unitsFilter,
    onRangeFromChange,
    onRangeToChange,
    onUnitsFilterChange,

    dualPacking,
    dualPackingVisible,
    onDualPackingChange,

    customPackingRows,
    customPackingVisible,
    customPackingModeActive,
    setCustomPackingModeActive,
    toggleCustomPackingModeActive,
    customPackingStatus,
    onCustomPackingRowChange,
    addCustomPackingRow,
    removeCustomPackingRow,
    applyCustomPackingPlan,

    bultoQuantities,
    onBultoQuantityChange,

    templates,
    selectedTemplate,
    handleTemplateChange,

    printBatch,
    handleAddOrderToBatch: (orderId, hint) => void handleAddOrderToBatch(orderId, hint),
    handleRemoveFromBatch,
    handleClearBatch,
    isOrderInBatchFn,
    printFabVisible,

    totalLabelCount,
    totalLabelCountAll,
    previewCountText,
    previewSrc,
    previewEmpty,
    previewPlaceholderMessage,
    previewLoading,
    handlePreviewLoaded,
    handlePreviewError,

    printSidebarOpen,
    openPrintSidebar,
    closePrintSidebar,
    handlePrintNext,
    handlePrintLabels: () => void handlePrintLabels(),
    handleDownloadPdf: () => void handleDownloadPdf(),
    actionButtonsDisabled,

    printerCopies,
    onPrinterCopiesChange,
    onPrinterCopiesCommit,
    printerThermalMethod,
    onPrinterThermalMethodChange,
    availablePrinters,
    visiblePrinters,
    localVisibleKeys,
    toggleLocalPrinterVisible,
    selectedPrinterValue,
    stockSize,
    onPrinterSelectChange,
    printAgentStatusText,
    printerSaveStatus,
    printProgress,
    closePrintProgress,
    hardwareDescription,
    hardwareProfile,
    refreshAvailablePrinters: () => void refreshAvailablePrinters(),

    inspectorOptions,
    selectedInspectorName,
    onInspectorSelect: (name: string) => {
      const next = String(name || '').trim().toUpperCase();
      const orderId = latest.current.selectedOrderId;
      setSelectedInspectorName(next);
      latest.current.selectedInspectorName = next;
      if (orderId) {
        setInspectorByOrderId((prev) => {
          const map = { ...prev, [orderId]: next };
          latest.current.inspectorByOrderId = map;
          return map;
        });
        if (isOrderInBatch(latest.current.printBatch, orderId)) {
          syncBatchEntryFromCurrentOrder();
        }
      }
      scheduleHtmlPreviewRefresh();
    },
  };

  return <LabelsAppContext.Provider value={value}>{children}</LabelsAppContext.Provider>;
}
