import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('informa que el servicio está operativo', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('liga-api');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });
});
