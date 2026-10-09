import { z } from 'zod';

// Mensajes de validación por defecto en español (los mensajes explícitos de cada
// esquema tienen prioridad). Se aplica al cargar cualquier módulo que valide entradas.
z.config(z.locales.es());
