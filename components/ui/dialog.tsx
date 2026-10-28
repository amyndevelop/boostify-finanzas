'use client';
import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export function DialogContent({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="dialog-overlay" />
      <Primitive.Content className="dialog-content">
        <Primitive.Title className="text-xl font-semibold">
          {title}
        </Primitive.Title>
        <Primitive.Description className="muted mt-2 mb-6">
          {description}
        </Primitive.Description>
        {children}
        <Primitive.Close className="close" aria-label="Cerrar">
          <X size={20} />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
