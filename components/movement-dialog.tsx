'use client';
import { useActionState, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { saveTransaction, deleteTransaction } from '@/app/actions';
import { categories } from '@/lib/finance';
export type Movement = {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountCents: number;
  category: string;
  description: string | null;
  date: string;
};
function Form({
  movement,
  close,
  today,
}: {
  movement?: Movement;
  close: () => void;
  today: string;
}) {
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(
    movement?.type ?? 'INCOME',
  );
  const [state, action, pending] = useActionState(
    async (s: { error?: string }, f: FormData) => {
      const result = await saveTransaction(s, f);
      if (!result.error) close();
      return result;
    },
    {},
  );
  return (
    <form action={action} className="form-grid">
      {movement && <input type="hidden" name="id" value={movement.id} />}
      <label>
        Tipo
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="INCOME">Ingreso cobrado</option>
          <option value="EXPENSE">Gasto</option>
        </select>
      </label>
      <label>
        Importe · ARS
        <input
          name="amount"
          inputMode="decimal"
          required
          placeholder="0,00"
          defaultValue={movement ? (movement.amountCents / 100).toFixed(2) : ''}
        />
      </label>
      <label>
        Fecha
        <input
          type="date"
          name="date"
          required
          defaultValue={movement?.date ?? today}
        />
      </label>
      <label>
        Categoría
        <select
          name="category"
          key={type}
          defaultValue={
            movement?.type === type ? movement.category : categories[type][0]
          }
        >
          {categories[type].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="col-span-full">
        Descripción <span className="muted">· opcional</span>
        <textarea
          name="description"
          maxLength={300}
          rows={3}
          defaultValue={movement?.description ?? ''}
          placeholder="Un detalle para recordar este movimiento"
        />
      </label>
      {state.error && (
        <p role="alert" className="error col-span-full">
          {state.error}
        </p>
      )}
      <Button className="primary col-span-full" disabled={pending}>
        {pending
          ? 'Guardando…'
          : movement
            ? 'Guardar cambios'
            : 'Registrar movimiento'}
      </Button>
    </form>
  );
}
export function MovementDialog({
  movement,
  today,
}: {
  movement?: Movement;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className={movement ? 'icon-button' : 'primary'}
          aria-label={movement ? 'Editar movimiento' : undefined}
        >
          {movement ? (
            <Pencil size={16} />
          ) : (
            <>
              <Plus size={18} /> Nuevo movimiento
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={movement ? 'Editar movimiento' : 'Un nuevo movimiento'}
        description="Cada registro cuenta. Mantené tus números al día."
      >
        <Form movement={movement} close={() => setOpen(false)} today={today} />
      </DialogContent>
    </Dialog>
  );
}
export function DeleteDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (s: { error?: string }, f: FormData) => {
      const result = await deleteTransaction(s, f);
      if (!result.error) setOpen(false);
      return result;
    },
    {},
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="icon-button" aria-label="Eliminar movimiento">
          <Trash2 size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent
        title="¿Eliminar este movimiento?"
        description="Se quitará de tus resultados. Esta acción no se puede deshacer."
      >
        <form action={action}>
          <input name="id" type="hidden" value={id} />
          {state.error && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
          <div className="flex gap-3">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button className="danger" disabled={pending}>
              {pending ? 'Eliminando…' : 'Sí, eliminar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
