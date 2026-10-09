/**
 * Reglas adicionales sobre una contraseña NUEVA (la longitud 12–128 la valida
 * `newPasswordSchema`; la política de la fase anterior no cambia). Devuelve el
 * motivo del rechazo o `null` si es aceptable.
 */
export function passwordPolicyViolation(
  email: string,
  password: string,
): string | null {
  const localPart = email.split('@')[0]?.toLowerCase() ?? '';
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    return 'La contraseña no debe contener el nombre de usuario del correo.';
  }
  return null;
}
