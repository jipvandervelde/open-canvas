import { Canvas } from "@/components/Canvas";
import { LeftPanel } from "@/components/ChatPanel";
import { Inspector } from "@/components/Inspector";
import { ArtboardOverlay } from "@/components/ArtboardOverlay";
import { AgentationBar } from "@/components/AgentationBar";
import { ElementSelectionBridge } from "@/components/ElementSelectionBridge";
import { PreviewPanel } from "@/components/PreviewPanel";
import { LocalUserCursor } from "@/components/LocalUserCursor";
import { EditorProvider } from "@/lib/editor-context";

export default function Home() {
  return (
    <EditorProvider>
      <LeftPanel />
      <Canvas />
      <ArtboardOverlay />
      <AgentationBar />
      <Inspector />
      <PreviewPanel />
      <ElementSelectionBridge />
      <LocalUserCursor />
    </EditorProvider>
  );
}
