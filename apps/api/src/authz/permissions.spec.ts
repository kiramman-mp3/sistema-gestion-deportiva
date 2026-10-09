import { PERMISSIONS, SUPERADMIN_ROLE } from './permissions.js';

describe('catálogo de permisos', () => {
  it('usa el formato recurso:acción en todos los códigos', () => {
    for (const code of Object.keys(PERMISSIONS)) {
      expect(code).toMatch(/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/);
    }
  });

  it('describe cada permiso', () => {
    for (const description of Object.values(PERMISSIONS)) {
      expect(description.trim()).not.toBe('');
    }
  });

  it('define un código de rol de sistema válido', () => {
    expect(SUPERADMIN_ROLE.code).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
