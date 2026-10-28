import { ComponentProps } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function Button({ className, ...props }: ComponentProps<'button'>) {
  return <button className={twMerge(clsx('button', className))} {...props} />;
}
