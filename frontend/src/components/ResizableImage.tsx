import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useState, useCallback, useRef, useEffect } from 'react';

function ResizableImageView(props: any) {
  const { node, updateAttributes, selected } = props;
  const { src, alt, width } = node.attrs;
  const [resizing, setResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    startX.current = e.clientX;
    startWidth.current = imgRef.current?.offsetWidth || 200;
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(40, startWidth.current + diff);
      updateAttributes({ width: newWidth });
    };

    const onMouseUp = () => setResizing(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizing, updateAttributes]);

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline-block', position: 'relative' }}>
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        style={{
          width: width ? `${width}px` : 'auto',
          maxWidth: '100%',
          display: 'block',
          borderRadius: '4px',
          outline: selected ? '2px solid #007AFF' : 'none',
          cursor: 'default',
        }}
        draggable={false}
      />
      {selected && (
        <div
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 12,
            height: 12,
            background: '#007AFF',
            borderRadius: 2,
            cursor: 'nwse-resize',
            border: '2px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const ResizableImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const styleWidth = element.style?.width;
          if (styleWidth && styleWidth.endsWith('px')) {
            const value = parseInt(styleWidth, 10);
            if (!Number.isNaN(value)) return value;
          }
          const attrWidth = element.getAttribute('width');
          if (attrWidth) {
            const value = parseInt(attrWidth, 10);
            if (!Number.isNaN(value)) return value;
          }
          return null;
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes };
    if (attrs.width) {
      attrs.style = `width: ${attrs.width}px; max-width: 100%;`;
      delete attrs.width;
    }
    return ['img', mergeAttributes(attrs)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },

  addCommands() {
    return {
      setImage: (options: { src: string; alt?: string; title?: string; width?: number }) => ({ commands }: any) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
    };
  },
});
