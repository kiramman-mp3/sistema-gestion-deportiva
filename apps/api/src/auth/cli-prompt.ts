import { createInterface } from 'node:readline/promises';

export async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Lee una línea sin mostrarla en pantalla (requiere terminal interactiva). */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error('Se requiere una terminal interactiva.'));
      return;
    }
    stdout.write(question);
    let buffer = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          finish();
          resolve(buffer);
          return;
        }
        if (char === '\u0003') {
          finish();
          reject(new Error('Cancelado por el operador.'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          buffer = buffer.slice(0, -1);
        } else {
          buffer += char;
        }
      }
    };
    stdin.on('data', onData);
  });
}
