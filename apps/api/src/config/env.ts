import { z } from 'zod';

const positiveInt = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'debe ser una URL postgresql://'),

    /**
     * Clave secreta para derivar hashes con clave (IP, correo en los intentos
     * fallidos). Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
     */
    SECURITY_HASH_KEY: z
      .string()
      .min(32, 'debe tener al menos 32 caracteres')
      .refine(
        (value) => !value.toLowerCase().includes('cambiar'),
        'reemplace el valor de ejemplo por un secreto propio',
      ),

    /** Saltos de proxy inverso de confianza (0 = sin proxy). Ver docs/authentication.md. */
    TRUST_PROXY: positiveInt(0, 10, 0),

    /** Inactividad máxima de una sesión. */
    SESSION_IDLE_MINUTES: positiveInt(1, 24 * 60, 60),
    /** Duración máxima de una sesión, aunque haya actividad. */
    SESSION_ABSOLUTE_HOURS: positiveInt(1, 24 * 14, 12),

    /** Ventana de conteo de intentos fallidos de inicio de sesión. */
    LOGIN_WINDOW_MINUTES: positiveInt(1, 24 * 60, 15),
    LOGIN_MAX_FAILURES_PER_IP: positiveInt(1, 10_000, 30),
    LOGIN_MAX_FAILURES_PER_ACCOUNT_IP: positiveInt(1, 1_000, 5),
    LOGIN_MAX_FAILURES_PER_ACCOUNT: positiveInt(1, 10_000, 50),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      for (const origin of env.WEB_ORIGIN) {
        if (!origin.startsWith('https://')) {
          ctx.addIssue({
            code: 'custom',
            path: ['WEB_ORIGIN'],
            message: 'en producción todos los orígenes deben usar https',
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Valida las variables de entorno y falla al arrancar si son inválidas. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Solo se incluyen la ruta y el motivo, nunca los valores recibidos.
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración de entorno inválida: ${details}`);
  }
  return result.data;
}
