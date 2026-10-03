import { memo, useEffect, useRef } from 'react';
import markup from '../engine/tool-markup.html?raw';
import '../engine/tool.css';
import { setLeaveGuard } from '../router';

// The tool's DOM belongs to the engine script, so React renders it once and never touches it again.
const ToolShell = memo(function ToolShell() {
  return <div className="lx-tool" dangerouslySetInnerHTML={{ __html: markup }} />;
});

export type ToolMode = 'gemini' | 'sora' | 'logo';
const HEAD: Record<ToolMode, { h1: string; p: string }> = {
  gemini: { h1: 'Watermark remover', p: 'Remove the Gemini sparkle and the Veo text mark from videos and photos. It works frame by frame, right here in your browser.' },
  sora: { h1: 'Sora watermark remover', p: 'Remove the moving Sora watermark from your videos. It is found automatically, wherever it sits, and the picture under it is rebuilt frame by frame, right here in your browser.' },
  logo: { h1: 'Remove a logo from any video or photo', p: 'Drag a box around the logo and it is gone. Works on videos and photos, and everything runs right here in your browser.' },
};

export function Tool({ mode = 'gemini' }: { mode?: ToolMode }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let tool: { destroy(): void; isBusy(): boolean; leaveWarning(): string } | null = null;
    let gone = false;
    const root = host.current!.firstElementChild as HTMLElement;
    import('../engine/tool.js').then(({ mountTool }) => {
      if (gone) return;
      tool = mountTool(root, { mode });
      setLeaveGuard(() => { const w = tool?.leaveWarning(); return !w || confirm(w); });
    });
    return () => {
      gone = true;
      setLeaveGuard(null);
      tool?.destroy();
    };
  }, []);
  return (
    <div className="wrap tool-page">
      <header className="tool-head">
        <h1>{HEAD[mode].h1}</h1>
        <p>{HEAD[mode].p}</p>
      </header>
      <div ref={host}>
        <ToolShell />
      </div>
    </div>
  );
}
