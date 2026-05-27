 
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Text, Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEditorStore } from '../../stores/editor-store';

// Transform applied by outer <Selectable>. Inner group renders at local
// origin so the troika Text + raycast proxy align with the gizmo.

export function TextElement({
  id,
  isSelected,
  isHovered,
}: {
  id: string;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const element = useEditorStore((s) => s.scene.elements[id]);
  const mode = useEditorStore((s) => s.mode);
  const [isEditing, setIsEditing] = useState(false);

  // troika Text bbox for invisible raycast proxy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textRef = useRef<any>(null);
  const [bbox, setBbox] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'edit') return;
    e.stopPropagation();
    setIsEditing(true);
  }, [mode]);

  const handleSave = useCallback((newContent: string) => {
    useEditorStore.getState().updateElement(id, { content: newContent } as never);
    setIsEditing(false);
  }, [id]);

  const content = element?.type === 'text' ? element.content : '';
  const fontSize = element?.type === 'text' ? element.fontSize : 1;
  useEffect(() => {
    setBbox({
      w: Math.max(0.5, fontSize * Math.max(1, content.length) * 0.5),
      h: Math.max(0.5, fontSize * 1.2),
    });
    const t = textRef.current;
    if (t?.sync) {
      t.sync(() => {
        const b = t?.geometry?.boundingBox;
        if (b) {
          setBbox({
            w: Math.max(0.5, b.max.x - b.min.x),
            h: Math.max(0.5, b.max.y - b.min.y),
          });
        }
      });
    }
  }, [content, fontSize]);

  if (!element || element.type !== 'text') return null;
  if (!element.visible) return null;

  const { color, font } = element;
  const ringColor = isSelected ? '#4f9eff' : 'rgba(255, 255, 255, 0.6)';
  const showRing = isSelected || isHovered;

  return (
    <group onDoubleClick={handleDoubleClick}>
      <Text
        ref={textRef}
        fontSize={fontSize}
        color={color}
        font={font}
        anchorX="center"
        anchorY="middle"
      >
        {content}
        {showRing && <meshBasicMaterial color={ringColor} wireframe />}
      </Text>

      {/* invisible raycast proxy sized to troika bbox + 0.25 wu pad. */}
      <mesh visible={false}>
        <boxGeometry args={[bbox.w + 0.25, bbox.h + 0.25, 0.1]} />
      </mesh>

      {isEditing && (
        <Html center>
          <input
            autoFocus
            defaultValue={content}
            onBlur={(e) => handleSave(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === 'Escape') {
                setIsEditing(false);
              }
              e.stopPropagation();
            }}
            className="bg-[#2a2b35] text-white border border-[#4f9eff] rounded px-2 py-1 text-sm outline-none min-w-[120px]"
            style={{ fontSize: '14px' }}
          />
        </Html>
      )}
    </group>
  );
}
