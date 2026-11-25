import { memo, useCallback, type Ref } from "react";
import { DocumentView, type DocumentViewHandle, type DocumentViewProps } from "./DocumentView";

type RetainedDocumentPaneProps = Omit<DocumentViewProps, "documentKey" | "onContentChange"> & {
  tabId: string;
  editorRef?: Ref<DocumentViewHandle>;
  onTabContentChange: (tabId: string, content: string) => void;
};

export const RetainedDocumentPane = memo(function RetainedDocumentPane({
  tabId,
  editorRef,
  onTabContentChange,
  ...props
}: RetainedDocumentPaneProps) {
  const onContentChange = useCallback(
    (content: string) => onTabContentChange(tabId, content),
    [onTabContentChange, tabId],
  );
  return <DocumentView {...props} ref={editorRef} documentKey={tabId} onContentChange={onContentChange} />;
});
