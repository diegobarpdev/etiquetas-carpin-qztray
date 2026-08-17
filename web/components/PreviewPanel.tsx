import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useLabelsApp } from '../context/LabelsAppContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PREVIEW_ZOOM_MIN = 0.5;
const PREVIEW_ZOOM_MAX = 3;
const PREVIEW_ZOOM_STEP = 0.1;

function stripParens(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, '').trim();
}

export function PreviewPanel() {
  const {
    templates,
    selectedTemplate,
    handleTemplateChange,
    previewSrc,
    previewEmpty,
    previewPlaceholderMessage,
    previewLoading,
    previewCountText,
    handlePreviewLoaded,
    handlePreviewError,
  } = useLabelsApp();

  const [zoom, setZoom] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function measureContentSize(): { width: number; height: number } | null {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return null;
      const doc = iframe.contentDocument;
      if (!doc) return null;
      const root = doc.documentElement;
      const body = doc.body;
      const width = Math.max(root?.scrollWidth || 0, body?.scrollWidth || 0, iframe.clientWidth || 0);
      const height = Math.max(root?.scrollHeight || 0, body?.scrollHeight || 0);
      if (!height) return null;
      return { width: width || iframe.clientWidth, height };
    } catch {
      return null;
    }
  }

  function applyPreviewZoom(z: number) {
    const iframe = iframeRef.current;
    const stage = stageRef.current;
    if (!iframe || previewEmpty) {
      if (stage) stage.style.height = '';
      return;
    }
    iframe.style.transform = 'none';
    iframe.style.transformOrigin = 'top center';
    iframe.style.width = `${100 / z}%`;
    iframe.style.height = 'auto';

    const size = measureContentSize();
    const baseHeight = size?.height || iframe.clientHeight || 0;
    if (baseHeight > 0) iframe.style.height = `${baseHeight}px`;
    iframe.style.transform = `scale(${z})`;

    if (stage) {
      stage.style.width = '100%';
      stage.style.height = baseHeight ? `${Math.ceil(baseHeight * z)}px` : '';
    }
  }

  function setPreviewZoom(z: number) {
    const next = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, Math.round(z * 100) / 100));
    setZoom(next);
  }

  function bumpPreviewZoom(delta: number) {
    setPreviewZoom(zoom + delta);
  }

  function onIframeLoad() {
    handlePreviewLoaded();
    applyPreviewZoom(zoom);
  }

  useEffect(() => {
    applyPreviewZoom(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, previewSrc, previewEmpty]);

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    bumpPreviewZoom(direction * PREVIEW_ZOOM_STEP);
  }

  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden bg-slate-200/70"
      id="preview-panel"
    >
      <div className="relative z-[6] shrink-0 space-y-1.5 overflow-visible border-b border-slate-200 bg-white px-4 py-3">
        <Label htmlFor="template-select" className="text-ui-xs text-muted-foreground">
          Plantilla
        </Label>
        <Select
          value={selectedTemplate || undefined}
          onValueChange={(value) => handleTemplateChange(value === '__none__' ? '' : value)}
        >
          <SelectTrigger id="template-select" className="max-w-md bg-background" aria-label="Plantilla">
            <SelectValue placeholder="Elegir plantilla…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Elegir plantilla…</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.code} value={t.code}>
                {stripParens(t.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative z-[1] flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-ui-sm font-semibold tracking-[-0.01em] text-slate-800">Vista previa</h2>
          <p className="text-ui-xs text-muted-foreground">{previewCountText}</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom de vista previa">
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Alejar"
            aria-label="Alejar"
            disabled={zoom <= PREVIEW_ZOOM_MIN}
            onClick={() => bumpPreviewZoom(-PREVIEW_ZOOM_STEP)}
          >
            <ZoomOut aria-hidden="true" />
          </Button>
          <span className="min-w-[3rem] text-center text-ui-sm">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Acercar"
            aria-label="Acercar"
            disabled={zoom >= PREVIEW_ZOOM_MAX}
            onClick={() => bumpPreviewZoom(PREVIEW_ZOOM_STEP)}
          >
            <ZoomIn aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="sm" title="Restablecer zoom" onClick={() => setPreviewZoom(1)}>
            100%
          </Button>
        </div>
      </div>

      {previewLoading ? (
        <div className="absolute left-1/2 top-[7.5rem] z-10 -translate-x-1/2 rounded-md border border-slate-200 bg-white/95 px-3 py-1.5 text-ui-xs font-medium text-slate-600 shadow-sm">
          Actualizando…
        </div>
      ) : null}

      <div
        className="relative min-h-0 flex-1 overflow-auto bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0] p-4"
        ref={wrapRef}
        onWheel={handleWheel}
      >
        <div className="mx-auto w-full origin-top" ref={stageRef}>
          <iframe
            ref={iframeRef}
            className={cn(
              'mx-auto block max-w-full border-0 bg-transparent',
              previewEmpty && 'pointer-events-none opacity-0',
            )}
            title="Vista previa de etiqueta"
            scrolling="no"
            src={previewSrc || undefined}
            onLoad={onIframeLoad}
            onError={handlePreviewError}
          />
        </div>
        {previewEmpty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-ui-sm text-slate-500">
            {previewPlaceholderMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
