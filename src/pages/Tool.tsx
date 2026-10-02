import { memo, useEffect, useRef } from 'react';
import markup from '../engine/tool-markup.html?raw';
import '../engine/tool.css';
import { setLeaveGuard } from '../router';

// The tool's DOM belongs to the engine script, so React renders it once and never touches it again.
const ToolShell = memo(function ToolShell() {
  return <div className="lx-tool" dangerouslySetInnerHTML={{ __html: markup }} />;
});

export function Tool() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let tool: { destroy(): void; isBusy(): boolean } | null = null;
    let gone = false;
    const root = host.current!.firstElementChild as HTMLElement;
    import('../engine/tool.js').then(({ mountTool }) => {
      if (gone) return;
      tool = mountTool(root);
      setLeaveGuard(() => !tool?.isBusy() || confirm('Files are still being processed. Leave and stop?'));
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
        <h1>Watermark remover</h1>
        <p>Remove the Gemini sparkle and the Veo text mark from videos and photos. It works frame by frame, right here in your browser.</p>
      </header>
      <div ref={host}>
        <ToolShell />
      </div>
    </div>
  );
}
