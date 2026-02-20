import { AppShell } from "@/components/layout/AppShell";
import { Reader } from "@/components/editor/Reader";
import { useDocument } from "@/hooks/useDocument";

export default function App() {
  const doc = useDocument();

  return (
    <AppShell
      currentDoc={doc.currentDoc}
      onOpenFile={doc.openFile}
      isDirty={doc.isDirty}
    >
      <Reader
        content={doc.content}
        onUpdate={doc.setContent}
        isLoading={doc.isLoading}
      />
    </AppShell>
  );
}
