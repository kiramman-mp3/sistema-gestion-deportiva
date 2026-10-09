/**
 * Catálogo de permisos. Cada permiso existe porque el backend lo comprueba;
 * `db:seed` lo sincroniza con la tabla `permissions`. Formato `recurso:acción`.
 *
 * Los roles institucionales (secretaría, comisión técnica…) NO se definen aquí:
 * la distribución real de permisos la debe aprobar la Liga (ver docs/decisions.md).
 */
export const PERMISSIONS = {
  'users:read': 'Consultar usuarios',
  'users:create': 'Crear usuarios',
  'users:update': 'Modificar usuarios y desactivarlos',
  'roles:read': 'Consultar roles y permisos',
  'roles:manage': 'Crear roles y asignar permisos y roles a usuarios',
  'audit:read': 'Consultar la auditoría',
  'sports:read': 'Consultar deportes',
  'sports:manage': 'Crear, modificar y activar o desactivar deportes',
  'sports:delete': 'Eliminar deportes que no estén en uso',
  'categories:read': 'Consultar categorías',
  'categories:manage': 'Crear, modificar y activar o desactivar categorías',
  'categories:delete': 'Eliminar categorías que no estén en uso',
  'seasons:read': 'Consultar temporadas',
  'seasons:manage': 'Crear, modificar y cambiar el estado de temporadas',
  'seasons:delete': 'Eliminar temporadas en borrador que no estén en uso',
  'clubs:read':
    'Consultar clubes (los vinculados al usuario, o todos con «acceso a todos los clubes»)',
  'clubs:manage':
    'Crear y modificar clubes, sus representantes y los usuarios vinculados a cada club',
  'clubs:delete': 'Eliminar clubes que no estén en uso',
  'clubs:access_all':
    'Acceder a todos los clubes; sin este permiso solo se accede a los clubes vinculados',
  'athletes:read':
    'Consultar deportistas (datos resumidos, sin datos personales)',
  'athletes:read_full':
    'Consultar y editar los datos personales completos de los deportistas (fecha de nacimiento, documento, contacto, tutor)',
  'athletes:manage':
    'Registrar y modificar deportistas y registrar sus consentimientos',
  'athletes:publish':
    'Publicar o retirar el perfil público resumido de un deportista',
  'athletes:validate':
    'Validar la elegibilidad (habilitación) de los deportistas',
  'athletes:transfer':
    'Transferir deportistas a otro club al terminar la temporada',
  'teams:read': 'Consultar equipos y plantillas',
  'teams:manage':
    'Crear y modificar equipos, inscribirlos en temporadas y gestionar sus plantillas',
  'teams:delete':
    'Eliminar equipos sin temporadas y anular altas de plantilla (excepciones a la regla de un equipo por temporada)',
  'documents:read': 'Consultar y descargar documentos de deportistas',
  'documents:manage':
    'Subir, verificar y eliminar documentos y fotos de deportistas',
  'venues:read': 'Consultar escenarios deportivos',
  'venues:manage': 'Crear y modificar escenarios deportivos',
  'venues:delete': 'Eliminar escenarios deportivos que no estén en uso',
  'championships:read': 'Consultar campeonatos y reglamentos',
  'championships:manage':
    'Crear y modificar campeonatos, reglamentos y cambiar su estado',
  'championships:delete': 'Eliminar campeonatos en borrador',
  'registrations:read': 'Consultar inscripciones de participantes',
  'registrations:manage':
    'Inscribir participantes y revisar o cambiar el estado de inscripción',
  'fixtures:read': 'Consultar etapas, jornadas y partidos programados',
  'fixtures:manage':
    'Programar, reprogramar y asignar escenarios y horarios a partidos',
  'results:read': 'Consultar resultados y actas',
  'results:manage': 'Registrar y corregir resultados y actas en borrador',
  'results:approve': 'Aprobar, rechazar o anular resultados oficiales',
  'notifications:manage':
    'Consultar la cola de correos, reintentar envíos y enviar recordatorios de documentación',
  'institution:read': 'Consultar la configuración institucional',
  'institution:manage':
    'Modificar los datos institucionales, el logotipo y los parámetros de publicación',
} as const satisfies Record<string, string>;

export type PermissionCode = keyof typeof PERMISSIONS;

export const SUPERADMIN_ROLE = {
  code: 'superadmin',
  name: 'Superadministrador',
  description:
    'Configura la plataforma, usuarios, roles y catálogos. Rol de sistema.',
} as const;

/** Módulos del catálogo, en el orden en que se presentan. */
export const PERMISSION_MODULES = {
  users: 'Usuarios',
  roles: 'Roles y permisos',
  audit: 'Auditoría',
  sports: 'Deportes',
  categories: 'Categorías',
  seasons: 'Temporadas',
  clubs: 'Clubes',
  athletes: 'Deportistas',
  teams: 'Equipos',
  documents: 'Documentos',
  venues: 'Escenarios',
  championships: 'Campeonatos',
  registrations: 'Inscripciones',
  fixtures: 'Calendario',
  results: 'Resultados',
  institution: 'Institución',
  notifications: 'Notificaciones',
} as const satisfies Record<string, string>;

/**
 * Capacidades distintas y no intercambiables: «consultar» no permite cambiar nada,
 * «gestionar» no permite eliminar, y «eliminar» es un permiso aparte.
 */
export const PERMISSION_ACTIONS = {
  read: 'Consultar',
  read_full: 'Consultar datos completos',
  create: 'Crear',
  update: 'Modificar',
  manage: 'Gestionar',
  publish: 'Publicar',
  validate: 'Validar',
  transfer: 'Transferir',
  delete: 'Eliminar',
  access_all: 'Acceso a todos los clubes',
  approve: 'Aprobar',
} as const satisfies Record<string, string>;

export interface PermissionInfo {
  code: PermissionCode;
  description: string;
  module: string;
  moduleLabel: string;
  action: string;
  actionLabel: string;
}

/** Catálogo completo con su módulo y acción, listo para agrupar en una interfaz. */
export function listPermissions(): PermissionInfo[] {
  const moduleOrder = Object.keys(PERMISSION_MODULES);
  return (Object.keys(PERMISSIONS) as PermissionCode[])
    .map((code) => {
      const [module = '', action = ''] = code.split(':');
      return {
        code,
        description: PERMISSIONS[code],
        module,
        moduleLabel:
          PERMISSION_MODULES[module as keyof typeof PERMISSION_MODULES] ??
          module,
        action,
        actionLabel:
          PERMISSION_ACTIONS[action as keyof typeof PERMISSION_ACTIONS] ??
          action,
      };
    })
    .sort(
      (a, b) =>
        moduleOrder.indexOf(a.module) - moduleOrder.indexOf(b.module) ||
        Object.keys(PERMISSION_ACTIONS).indexOf(a.action) -
          Object.keys(PERMISSION_ACTIONS).indexOf(b.action),
    );
}

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.hasOwn(PERMISSIONS, value);
}
