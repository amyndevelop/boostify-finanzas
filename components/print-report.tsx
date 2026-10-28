'use client';
import { Button } from './ui/button';
export function PrintReport() {
  return (
    <Button type="button" className="primary" onClick={() => window.print()}>
      Guardar como PDF / Imprimir
    </Button>
  );
}
