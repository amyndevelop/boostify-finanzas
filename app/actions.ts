'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { fromZonedTime } from 'date-fns-tz';
import { db } from '@/lib/db';
import { createSession, clearSession, requireAdmin } from '@/lib/auth';
import { transactionSchema, TZ } from '@/lib/finance';
export type ActionState = { error?: string };
export async function login(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      email: z.email(),
      password: z
        .string()
        .min(1)
        .max(72)
        .refine((v) => Buffer.byteLength(v, 'utf8') <= 72),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Revisá el correo y la contraseña.' };
  if (
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD_HASH ||
    !process.env.SESSION_SECRET
  )
    return { error: 'Falta configurar el administrador en el servidor.' };
  try {
    const attempt = await db.loginAttempt.upsert({
      where: { id: 'admin' },
      create: {
        id: 'admin',
        count: 1,
        blockedUntil: new Date(Date.now() + 900000),
      },
      update: { count: { increment: 1 } },
    });
    if (attempt.blockedUntil < new Date()) {
      await db.loginAttempt.update({
        where: { id: 'admin' },
        data: { count: 1, blockedUntil: new Date(Date.now() + 900000) },
      });
    } else if (attempt.count > 10)
      return {
        error: 'Demasiados intentos. Intentá nuevamente en 15 minutos.',
      };
    const valid = await compare(
      parsed.data.password,
      process.env.ADMIN_PASSWORD_HASH,
    );
    if (
      !valid ||
      parsed.data.email.toLowerCase() !== process.env.ADMIN_EMAIL.toLowerCase()
    )
      return { error: 'Credenciales incorrectas.' };
    await db.loginAttempt.deleteMany({ where: { id: 'admin' } });
    await createSession();
  } catch {
    return {
      error:
        'No pudimos iniciar sesión. Revisá la configuración del servidor y la base de datos.',
    };
  }
  redirect('/');
}
export async function logout() {
  await clearSession();
  redirect('/login');
}
export async function saveTransaction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = transactionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = form.get('id');
  if (id && !z.cuid().safeParse(id).success)
    return { error: 'Movimiento inválido' };
  const v = parsed.data;
  const data = {
    type: v.type,
    amountCents: v.amount,
    category: v.category,
    description: v.description || null,
    occurredAt: fromZonedTime(v.date + 'T12:00:00', TZ),
  };
  try {
    if (id) await db.transaction.update({ where: { id: String(id) }, data });
    else await db.transaction.create({ data });
  } catch {
    return { error: 'No se pudo guardar. Intentá nuevamente.' };
  }
  revalidatePath('/');
  return {};
}
export async function deleteTransaction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const id = z.cuid().safeParse(form.get('id'));
  if (!id.success) return { error: 'Movimiento inválido' };
  try {
    await db.transaction.delete({ where: { id: id.data } });
  } catch {
    return { error: 'No se pudo eliminar el movimiento.' };
  }
  revalidatePath('/');
  return {};
}

export async function saveMonthlyGoal(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const { goalSchema } = await import('@/lib/statistics');
  const parsed = goalSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error: 'Ingresá una meta positiva en ARS, con hasta dos decimales.',
    };
  try {
    await db.monthlyGoal.upsert({
      where: { month: parsed.data.month },
      create: { month: parsed.data.month, amountCents: parsed.data.amount },
      update: { amountCents: parsed.data.amount },
    });
  } catch {
    return {
      error: 'No se pudo guardar la meta. Intentá nuevamente más tarde.',
    };
  }
  revalidatePath('/');
  return {};
}
