import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  loginSchema,
  newPasswordSchema,
  parseOrThrow,
  userStatusSchema,
} from './schemas.js';

describe('esquemas de validación', () => {
  it('normaliza el correo del login', () => {
    expect(
      loginSchema.parse({ email: '  Ana@Example.COM ', password: 'x' }).email,
    ).toBe('ana@example.com');
  });

  it('el login solo acota la contraseña, sin revelar la política', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: '' }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(129) })
        .success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: ['x'] }).success,
    ).toBe(false);
  });

  it('política de contraseñas nuevas: 12 a 128 caracteres, sin reglas de composición', () => {
    expect(newPasswordSchema.safeParse('a'.repeat(11)).success).toBe(false);
    expect(newPasswordSchema.safeParse('a'.repeat(12)).success).toBe(true);
    expect(newPasswordSchema.safeParse('a'.repeat(128)).success).toBe(true);
    expect(newPasswordSchema.safeParse('a'.repeat(129)).success).toBe(false);
    expect(
      newPasswordSchema.safeParse('frase larga con espacios y ñ').success,
    ).toBe(true);
  });

  it('el cambio de estado exige estado válido y motivo', () => {
    expect(
      userStatusSchema.safeParse({ status: 'inactivo', reason: 'baja' })
        .success,
    ).toBe(true);
    expect(
      userStatusSchema.safeParse({ status: 'inactivo', reason: ' ' }).success,
    ).toBe(false);
    expect(
      userStatusSchema.safeParse({ status: 'borrado', reason: 'baja' }).success,
    ).toBe(false);
  });

  it('parseOrThrow responde 400 con errores por campo y sin eco de los valores', () => {
    const schema = z.object({ email: z.email('Correo inválido') });
    try {
      parseOrThrow(schema, { email: 'valor-secreto' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        message: string;
        errors: { field: string; message: string }[];
      };
      expect(body.message).toBe('Solicitud inválida');
      expect(body.errors).toEqual([
        { field: 'email', message: 'Correo inválido' },
      ]);
      expect(JSON.stringify(body)).not.toContain('valor-secreto');
    }
  });

  it('los mensajes de validación por defecto están en español', () => {
    try {
      parseOrThrow(z.object({ reason: z.string() }), {});
      expect.unreachable();
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        errors: { field: string; message: string }[];
      };
      expect(body.errors[0]!.field).toBe('reason');
      expect(body.errors[0]!.message).not.toMatch(
        /expected|received|Invalid input/,
      );
      expect(body.errors[0]!.message).toMatch(/Entrada inválida/);
    }
  });
});
