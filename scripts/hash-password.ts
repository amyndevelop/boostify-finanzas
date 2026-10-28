import { hash } from 'bcryptjs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
if (!stdin.isTTY)
  throw new Error('Ejecutá este comando en una terminal interactiva.');
const rl = createInterface({ input: stdin, output: stdout });
// Disable terminal echo while entering the password.
const { execFileSync } = await import('node:child_process');
try {
  execFileSync('stty', ['-echo'], { stdio: 'inherit' });
  const password = await rl.question(
    'Contraseña (mínimo 12 caracteres, entrada oculta): ',
  );
  if (Buffer.byteLength(password, 'utf8') > 72)
    throw new Error('La contraseña debe ocupar como máximo 72 bytes UTF-8');
  if (password.length < 12) throw new Error('Usá al menos 12 caracteres');
  console.log('\nADMIN_PASSWORD_HASH=' + (await hash(password, 12)));
} finally {
  execFileSync('stty', ['echo'], { stdio: 'inherit' });
  rl.close();
}
