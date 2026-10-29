import { useRef, useState, type DragEvent } from 'react';

export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');
  return {
    active,
    handlers: {
      onDragEnter(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        if (!disabled) { depth.current++; setActive(true); }
      },
      onDragOver(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      },
      onDragLeave(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setActive(false);
      },
      onDrop(event: DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        depth.current = 0;
        setActive(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}
