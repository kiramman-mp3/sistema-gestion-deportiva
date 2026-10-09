# Sistema Integral de la Liga Cantonal de Quero
## Especificación funcional, técnica y plan de implementación

**Versión:** 1.0  
**Fecha:** octubre de 2026  
**Estado:** documento base para análisis, planificación y desarrollo  
**Organización destinataria:** Liga Cantonal de Quero, Tungurahua, Ecuador

---

## 1. Propósito del documento

Este documento define el alcance, módulos, requisitos, reglas de negocio, modelo de datos conceptual, arquitectura, seguridad, pruebas, despliegue y plan de trabajo para desarrollar un sistema integral de gestión deportiva para la Liga Cantonal de Quero.

La plataforma tendrá dos áreas principales:

1. **Sistema privado de gestión:** utilizado por personal administrativo, secretaría, comisiones técnicas, árbitros, dirigentes y entrenadores según sus permisos.
2. **Portal público:** permitirá consultar campeonatos, calendarios, resultados oficiales, tablas de posiciones, clubes, noticias y otra información aprobada para publicación.

El sistema deberá soportar competencias por equipos e individuales, inicialmente para:

- Fútbol.
- Básquet.
- Taekwondo.
- Ajedrez.

Se contemplarán inicialmente las categorías o divisiones Liga A, Liga B, Liga C, Liga D, Juvenil y Niños. Su uso exacto en cada deporte debe confirmarse con la Liga. Las categorías deberán poder configurarse desde el sistema, sin cambios de código.

> **Regla fundamental:** este documento es una especificación inicial. Los reglamentos deportivos, requisitos documentales, ascensos, descensos, sanciones y procedimientos institucionales deberán validarse con la Liga antes de convertirse en reglas definitivas del sistema.

---

## 2. Objetivos

### 2.1 Objetivo general

Digitalizar y centralizar la administración de las competencias deportivas de la Liga Cantonal de Quero, manteniendo datos consistentes, procesos trazables y publicación oportuna de información oficial.

### 2.2 Objetivos específicos

- Centralizar clubes, equipos, deportistas, entrenadores, árbitros y dirigentes.
- Gestionar temporadas, deportes, categorías y campeonatos.
- Administrar inscripciones y validar la elegibilidad de participantes.
- Programar partidos, rondas, combates y eventos.
- Registrar, revisar, aprobar y publicar resultados.
- Calcular clasificaciones según el reglamento de cada campeonato.
- Administrar actas, sanciones, reclamos y resoluciones.
- Publicar información deportiva aprobada.
- Generar informes, listados y documentos.
- Mantener auditoría de operaciones críticas.
- Proteger datos personales, especialmente los de niños y adolescentes.
- Facilitar futuras ampliaciones sin reconstruir el sistema.

### 2.3 Fuera del alcance inicial

Salvo aprobación expresa, no se considerarán obligatorios en la primera versión:

- Aplicaciones móviles nativas para Android o iOS.
- Transmisiones de video en vivo.
- Venta de entradas.
- Cobros en línea.
- Integración automática con federaciones externas.
- Inteligencia artificial para predicciones.
- Seguimiento GPS o wearables.
- Marcadores electrónicos conectados al sistema.
- Mensajería instantánea propia.

La arquitectura no debe impedir incorporar estos módulos posteriormente.

---

## 3. Principios de diseño

1. Una sola plataforma y una sola fuente de datos oficial.
2. Aplicación web adaptable a escritorio, tablet y móvil.
3. Backend modular; evitar microservicios prematuros.
4. Las reglas deportivas deben ser configurables y versionadas.
5. Los resultados solo serán públicos después de su aprobación.
6. Toda operación sensible deberá quedar registrada.
7. No se eliminará el historial deportivo por borrar o desactivar una cuenta.
8. La información privada nunca deberá exponerse desde el portal público.
9. Los datos de menores recibirán protección reforzada.
10. La base de datos debe garantizar integridad mediante claves foráneas, restricciones e índices.
11. El software no debe reemplazar la autoridad del reglamento oficial de la Liga.
12. Los procesos deben poder probarse automáticamente.

---

## 4. Actores y roles

### 4.1 Superadministrador

Puede configurar la plataforma, usuarios, roles, permisos, catálogos y parámetros técnicos. El acceso a datos personales debe limitarse a lo necesario para su función y quedar auditado.

### 4.2 Administrador de la Liga

Administra temporadas, deportes, categorías, campeonatos, clubes, inscripciones, calendarios y publicación de información.

### 4.3 Secretaría

Gestiona registros, documentos, actas, inscripciones, certificados y trámites administrativos según permisos.

### 4.4 Comisión técnica

Configura competencias, valida participantes, programa eventos, revisa resultados y administra aspectos técnicos.

### 4.5 Árbitro o juez

Consulta sus asignaciones, registra actas, incidencias y resultados cuando esté autorizado. No puede aprobar su propio resultado salvo que la política institucional lo permita expresamente.

### 4.6 Comisión disciplinaria

Revisa reclamos, registra resoluciones y administra sanciones. Sus decisiones deben quedar documentadas.

### 4.7 Dirigente de club

Consulta y administra únicamente la información autorizada de su club, presenta inscripciones, revisa el estado de los trámites y consulta calendarios y resultados.

### 4.8 Entrenador

Consulta las plantillas y programación de los equipos que tiene asignados. Puede realizar solicitudes autorizadas, pero no aprobar resultados oficiales.

### 4.9 Editor de contenido

Publica noticias, comunicados, imágenes y contenido institucional. No debe poder alterar resultados deportivos por tener permisos editoriales.

### 4.10 Público

Consulta la información publicada sin iniciar sesión.

### 4.11 Matriz de permisos

La implementación debe usar permisos específicos, no solo comprobar el nombre del rol.

| Acción | Administrador | Secretaría | Comisión técnica | Árbitro | Dirigente | Público |
|---|---|---|---|---|---|---|
| Administrar usuarios | Según permiso | No | No | No | No | No |
| Crear temporadas | Sí | No | Según permiso | No | No | No |
| Registrar clubes | Sí | Sí | Consulta | No | Solicitud | No |
| Inscribir equipos | Sí | Sí | Revisar | No | Su club | No |
| Programar eventos | Sí | No | Sí | Consulta | Consulta | Consulta publicada |
| Registrar resultado | Según permiso | No | Sí | Asignado | No | No |
| Aprobar resultado | Según permiso | No | Sí | No por defecto | No | No |
| Registrar sanción | Según permiso | Según permiso | Según reglamento | Reportar incidencia | Reclamar | No |
| Publicar noticias | Según permiso | Según permiso | No por defecto | No | No | No |
| Consultar resultados públicos | Sí | Sí | Sí | Sí | Sí | Sí |

Esta matriz es una base inicial. La Liga deberá aprobar la distribución real de responsabilidades.

---

## 5. Alcance funcional por módulos

## 5.1 Configuración institucional

Funciones:

- Registrar nombre institucional, logotipo, contactos y datos públicos.
- Configurar escenarios deportivos y sus características.
- Crear temporadas deportivas.
- Configurar deportes y categorías.
- Definir estados de los registros.
- Gestionar reglamentos y versiones.
- Configurar parámetros de publicación.
- Administrar roles y permisos.
- Configurar formatos de documentos y certificados.

Criterios de aceptación:

- Los catálogos pueden modificarse por usuarios autorizados.
- Desactivar un catálogo no elimina registros históricos.
- Los cambios críticos quedan registrados en auditoría.

## 5.2 Clubes y organizaciones deportivas

Datos sugeridos:

- Nombre oficial.
- Nombre corto.
- Código institucional, si existe.
- Escudo o logotipo.
- Dirección o sector, cuando corresponda.
- Contacto institucional.
- Representante y delegado.
- Estado: activo, inactivo, suspendido o archivado.
- Fecha de creación del registro.

Funciones:

- Crear y actualizar clubes.
- Evitar duplicados evidentes.
- Registrar representantes y períodos de representación.
- Asociar clubes con equipos y participaciones deportivas.
- Consultar historial de participación.
- Adjuntar documentos privados.
- Publicar una ficha pública con campos autorizados.

## 5.3 Personas y deportistas

El sistema debe distinguir la persona de sus diferentes roles deportivos cuando sea conveniente. Una persona podría ser deportista, entrenador o representante, pero no debe duplicarse innecesariamente su información.

Datos sugeridos para deportistas:

- Identificador interno.
- Nombres y apellidos.
- Fecha de nacimiento.
- Fotografía, si está autorizada.
- Estado de habilitación.
- Información de contacto únicamente cuando sea necesaria.
- Documentos requeridos, almacenados de forma privada.
- Registro de autorizaciones aplicables.

Los números de identidad, teléfonos, direcciones y documentos no se mostrarán públicamente por defecto.

Funciones:

- Crear y actualizar ficha.
- Buscar posibles duplicados.
- Verificar edad para categorías.
- Revisar documentos.
- Mantener historial de inscripciones.
- Registrar cambios de club conforme al reglamento.
- Consultar sanciones aplicables.
- Desactivar registros sin borrar el historial.
- Limitar acceso a datos de menores.

## 5.4 Equipos y plantillas

Funciones:

- Crear equipos vinculados a clubes, deportes y categorías.
- Asociar entrenadores y delegados.
- Inscribir deportistas en una plantilla.
- Registrar número de camiseta cuando aplique.
- Definir vigencia de la relación.
- Evitar duplicados incompatibles.
- Controlar cupos mínimos y máximos por reglamento.
- Cerrar plantillas cuando corresponda.
- Consultar el historial por temporada.

Debe definirse con la Liga si un equipo puede participar con nombres diferentes, si un deportista puede pertenecer a más de un equipo y qué excepciones existen para categorías o disciplinas distintas.

## 5.5 Temporadas, categorías y campeonatos

Un campeonato debe pertenecer a una temporada, un deporte y una categoría.

Datos del campeonato:

- Nombre.
- Temporada.
- Deporte.
- Categoría.
- Modalidad.
- Reglamento y versión.
- Fecha de inicio y final estimadas.
- Estado.
- Cupos y fechas de inscripción.
- Configuración de clasificación.
- Configuración de publicación.

Modalidades iniciales que se deben evaluar:

- Liga todos contra todos.
- Grupos y fase final.
- Eliminación directa.
- Doble eliminación, si la Liga la utiliza.
- Torneo individual por rondas.
- Cuadro de combates.
- Formato específico de disciplina.

Estados sugeridos:

`borrador`, `inscripciones_abiertas`, `inscripciones_cerradas`, `programado`, `en_curso`, `finalizado`, `suspendido`, `archivado`.

## 5.6 Inscripciones y elegibilidad

Funciones:

- Registrar la participación de un equipo o deportista.
- Validar cupos y fechas.
- Revisar documentos.
- Aprobar, observar o rechazar una inscripción.
- Registrar observaciones y motivo de rechazo.
- Verificar la edad y requisitos de categoría.
- Verificar sanciones vigentes.
- Mantener un historial de decisiones.
- Permitir correcciones y reenvíos.
- Exportar listados de participantes habilitados.

Estados sugeridos:

`borrador`, `pendiente`, `observada`, `aprobada`, `rechazada`, `retirada`.

Una inscripción aprobada debe quedar vinculada a la edición concreta del campeonato. No se debe reutilizar una inscripción antigua como si fuera válida automáticamente para otra temporada.

## 5.7 Calendario y programación

Funciones:

- Crear jornadas, etapas y rondas.
- Programar fecha, hora y escenario.
- Asignar participantes.
- Asignar árbitros o jueces.
- Detectar conflictos de escenario, horario y disponibilidad.
- Reprogramar eventos conservando el historial.
- Registrar suspensión, aplazamiento o cancelación.
- Publicar cambios aprobados.
- Filtrar por fecha, deporte, categoría, escenario y club.
- Exportar calendario.

Los conflictos deben producir advertencias o bloqueos según la regla configurada. No se debe inventar una solución automática si el sistema no conoce restricciones como descansos mínimos, disponibilidad real de escenarios o duración de cada evento.

## 5.8 Resultados y aprobación

Flujo sugerido:

1. El usuario autorizado registra un resultado en borrador.
2. Se validan los participantes y el formato de puntuación.
3. Se adjunta el acta o evidencia requerida.
4. Un usuario con permiso revisa el resultado.
5. Se aprueba, rechaza o devuelve para corrección.
6. Al aprobarse, se recalculan clasificaciones y estadísticas.
7. Se publica el resultado si el campeonato permite publicación.
8. Si se modifica después, se exige motivo y queda un historial de revisión.

Estados sugeridos:

`borrador`, `pendiente_revision`, `aprobado`, `rechazado`, `anulado`.

Un resultado anulado no debe borrarse físicamente. Debe conservarse su historia y la justificación de la anulación.

## 5.9 Reglas y estadísticas por deporte

### Fútbol

Registrar, según el reglamento:

- Goles y goleadores.
- Marcador final.
- Tarjetas amarillas y rojas.
- Sustituciones, si se requiere.
- Expulsiones.
- Incidencias y observaciones.
- Árbitros.
- Acta del partido.
- Estadísticas de equipo.

La clasificación debe permitir configurar puntos por victoria, empate y derrota, criterios de desempate, sanciones de puntos y otros criterios definidos oficialmente.

### Básquet

Registrar, según el alcance aprobado:

- Marcador por período.
- Puntos totales por equipo.
- Estadísticas individuales opcionales.
- Faltas personales y de equipo.
- Tiempos solicitados.
- Incidencias y acta.
- Árbitros.

El sistema debe distinguir la puntuación por período del resultado final. No se deben forzar las reglas de fútbol sobre básquet.

### Taekwondo

Definir previamente con la Liga las modalidades que realmente se disputan.

Posibles funciones:

- Categoría de edad.
- División de peso.
- Grado o nivel, si aplica.
- Participantes.
- Cuadros de eliminación.
- Combates y rondas.
- Puntuaciones y decisiones de jueces.
- Descalificaciones y retiradas.
- Resultados finales.
- Medallero por evento, categoría y club.

La implementación debe ajustarse al reglamento adoptado por la organización y no asumir una modalidad única.

### Ajedrez

Funciones:

- Inscribir jugadores.
- Configurar número de rondas.
- Generar o registrar emparejamientos.
- Registrar blancas y negras.
- Resultado: victoria, derrota, tablas, incomparecencia u otro estado permitido.
- Calcular puntos.
- Aplicar desempates configurados.
- Publicar clasificación por ronda y final.
- Registrar retiradas y emparejamientos modificados.
- Exportar resultados.

Debe decidirse si el sistema generará emparejamientos automáticamente o permitirá importarlos/registrarlos desde un árbitro. Cualquier algoritmo de emparejamiento debe validarse con el reglamento aplicable.

## 5.10 Árbitros, jueces y asignaciones

Funciones:

- Registrar datos profesionales estrictamente necesarios.
- Gestionar estado y disponibilidad.
- Asignar responsables a eventos.
- Evitar conflictos de horario.
- Consultar asignaciones.
- Registrar actas e incidencias.
- Mantener historial de participación.

## 5.11 Disciplina, reclamos y resoluciones

Funciones:

- Registrar incidentes.
- Recibir reclamos con fecha, autor y documentación.
- Asignar un expediente.
- Registrar responsables de revisión.
- Documentar decisiones.
- Asociar sanciones a deportistas, equipos o clubes.
- Definir vigencia y competencias en las que aplica la sanción.
- Notificar a las partes autorizadas.
- Publicar resoluciones solo cuando corresponda.
- Conservar historial de cambios y recursos.

La aplicación debe ayudar a administrar el proceso, pero no decidir automáticamente asuntos disciplinarios que requieren criterio de una autoridad.

## 5.12 Documentos y reportes

Documentos potenciales:

- Listado de equipos inscritos.
- Nóminas de deportistas.
- Carnés.
- Actas de partido o competencia.
- Calendarios.
- Tablas de posiciones.
- Informes de sanciones.
- Certificados.
- Reportes estadísticos.
- Resoluciones y comunicados.

Funciones:

- Generar PDF.
- Exportar CSV o XLSX cuando resulte útil.
- Restringir documentos privados.
- Identificar fecha de generación y, cuando proceda, versión del documento.
- Registrar quién generó o descargó documentos sensibles.

## 5.13 Portal público

Páginas sugeridas:

- Inicio.
- Deportes.
- Campeonatos.
- Categorías.
- Calendario.
- Resultados.
- Tablas de posiciones.
- Clubes.
- Perfiles deportivos públicos.
- Noticias y comunicados.
- Detalle de partido o evento.
- Información institucional.
- Contacto y políticas de privacidad.

Funciones:

- Filtrar por temporada, deporte, categoría y campeonato.
- Consultar resultados aprobados.
- Consultar estadísticas autorizadas.
- Compartir enlaces directos.
- Mostrar fecha y estado de actualización.
- Adaptarse a móvil.
- Gestionar contenido desde el panel privado.

No se publicarán borradores, documentos de identidad, teléfonos privados, domicilios ni información innecesaria de menores.

## 5.14 Notificaciones

La primera versión puede incluir notificaciones por correo electrónico y avisos dentro del sistema.

Eventos posibles:

- Inscripción observada o aprobada.
- Cambio de fecha u horario.
- Asignación de árbitro.
- Resultado pendiente de revisión.
- Publicación de resolución.
- Recordatorio de documentación.

Las notificaciones deben evitar incluir datos personales sensibles en el asunto o en mensajes que puedan reenviarse. WhatsApp u otros canales externos deberán evaluarse por separado y no serán requisito de la primera versión.

---

## 6. Requisitos funcionales identificados

| Código | Requisito | Prioridad |
|---|---|---|
| RF-001 | Autenticar usuarios y cerrar sesiones de forma segura. | Crítica |
| RF-002 | Administrar roles y permisos por acción y recurso. | Crítica |
| RF-003 | Administrar deportes, categorías y temporadas. | Crítica |
| RF-004 | Registrar clubes y sus representantes. | Crítica |
| RF-005 | Registrar deportistas y controlar acceso a sus datos. | Crítica |
| RF-006 | Crear equipos y plantillas. | Crítica |
| RF-007 | Crear campeonatos con modalidad y reglamento versionado. | Crítica |
| RF-008 | Gestionar inscripciones y estados de aprobación. | Crítica |
| RF-009 | Validar elegibilidad por edad, documentación y sanciones. | Alta |
| RF-010 | Programar jornadas, rondas, escenarios y responsables. | Crítica |
| RF-011 | Detectar conflictos de programación. | Alta |
| RF-012 | Registrar resultados con validación de formato. | Crítica |
| RF-013 | Aprobar, rechazar y corregir resultados con trazabilidad. | Crítica |
| RF-014 | Calcular tablas y clasificaciones. | Crítica |
| RF-015 | Gestionar reglas específicas de cada deporte. | Crítica |
| RF-016 | Registrar árbitros, jueces y asignaciones. | Alta |
| RF-017 | Gestionar incidentes, reclamos, sanciones y resoluciones. | Alta |
| RF-018 | Generar actas, carnés e informes PDF. | Alta |
| RF-019 | Publicar resultados y calendarios oficiales. | Crítica |
| RF-020 | Administrar noticias y comunicados. | Media |
| RF-021 | Exportar listados y reportes. | Media |
| RF-022 | Mantener auditoría de operaciones sensibles. | Crítica |
| RF-023 | Realizar copias de seguridad y permitir restauración. | Crítica |
| RF-024 | Notificar cambios relevantes. | Media |
| RF-025 | Mantener el historial de temporadas y campeonatos. | Crítica |

---

## 7. Reglas de negocio

1. Todo campeonato pertenece a una temporada, un deporte y una categoría.
2. Los catálogos de categorías y deportes deben ser configurables.
3. Las inscripciones se realizan para un campeonato concreto.
4. Solo participantes habilitados pueden competir.
5. Los requisitos de edad se calculan con la fecha de referencia que establezca el reglamento.
6. Las restricciones de participación entre equipos deben poder configurarse según reglamento.
7. Los resultados en borrador no alteran las clasificaciones oficiales.
8. Solo roles autorizados pueden aprobar resultados.
9. Una persona no debe aprobar su propio resultado por defecto, salvo política institucional expresa.
10. Las correcciones de resultados deben exigir motivo y registrar los valores previos.
11. Los puntos, desempates, ascensos y descensos deben definirse por reglamento, no asumirse como universales.
12. Las clasificaciones históricas deben conservar el reglamento aplicado.
13. Los campeonatos archivados siguen siendo consultables según permisos.
14. La desactivación de un usuario no borra sus acciones auditadas.
15. Los documentos privados requieren autorización de acceso.
16. Las noticias y resultados deben tener estado de publicación.
17. El sistema debe distinguir la hora local de los eventos y almacenar fechas de forma consistente.
18. Una reprogramación debe conservar la fecha original y su motivo en el historial.
19. Una sanción debe tener alcance, vigencia y autoridad que la emitió.
20. Los datos públicos de menores deben limitarse a lo estrictamente autorizado.

---

## 8. Modelo de datos conceptual

El esquema definitivo debe implementarse y revisarse en Prisma antes de iniciar funcionalidades dependientes. La siguiente lista es la base conceptual.

### 8.1 Institución y personas

#### `clubs`

- `id`
- `name`
- `slug`
- `short_name`
- `logo_key`
- `status`
- `created_at`
- `updated_at`

#### `persons`

Representa una persona para evitar duplicar sus datos entre roles.

- `id`
- `first_name`
- `last_name`
- `birth_date`, si es necesario
- `status`
- `created_at`
- `updated_at`

Los datos personales adicionales deben separarse o protegerse con permisos adecuados.

#### `athletes`

- `id`
- `person_id`
- `internal_code`
- `eligibility_status`
- `created_at`
- `updated_at`

#### `coaches`

- `id`
- `person_id`
- `license_number`, si aplica
- `status`

#### `officials`

- `id`
- `person_id`
- `official_type`
- `status`

#### `club_representatives`

- `id`
- `club_id`
- `person_id`
- `role_name`
- `valid_from`
- `valid_until`

#### `teams`

- `id`
- `club_id`
- `sport_id`
- `category_id`
- `name`
- `status`

Debe decidirse si el equipo es una entidad reutilizable entre temporadas o si cada temporada genera una instancia de equipo. Una opción recomendada es mantener el equipo como identidad organizativa y crear plantillas/inscripciones por temporada.

#### `team_memberships`

- `id`
- `team_id`
- `athlete_id`
- `season_id`
- `shirt_number`, cuando aplique
- `valid_from`
- `valid_until`
- `status`

Añadir restricciones para impedir relaciones duplicadas incompatibles.

### 8.2 Catálogos y competencias

#### `sports`

- `id`
- `name`
- `code`
- `status`

#### `categories`

- `id`
- `name`
- `code`
- `age_min`
- `age_max`
- `status`

No asumir que una categoría pertenece a un solo deporte si la Liga necesita reutilizarla. La configuración específica puede vivir en una tabla de categorías por deporte o en la relación de campeonato.

#### `seasons`

- `id`
- `name`
- `start_date`
- `end_date`
- `status`

#### `championships`

- `id`
- `season_id`
- `sport_id`
- `category_id`
- `name`
- `format`
- `status`
- `registration_start`
- `registration_end`
- `start_date`
- `end_date`
- `created_at`
- `updated_at`

#### `competition_rule_versions`

- `id`
- `championship_id`
- `version`
- `rules_json`
- `approved_by`
- `approved_at`
- `created_at`

El JSON puede almacenar configuración variable, pero no debe sustituir las tablas relacionales para datos centrales que necesitan claves foráneas y consultas consistentes.

#### `registrations`

Se recomienda evitar una relación polimórfica sin claves foráneas reales. Dos opciones válidas:

**Opción A: modelo común de participantes**
- `participants`: entidad común que representa equipo o persona.
- `team_participants`: relación de participante con equipo.
- `individual_participants`: relación de participante con deportista.
- `registrations`: referencia a `participants`.

**Opción B: tablas separadas**
- `team_registrations`.
- `individual_registrations`.

Elegir una opción antes de crear migraciones. Para un sistema con múltiples deportes, una entidad común de participantes puede simplificar etapas y encuentros, siempre que las restricciones sean claras.

Campos sugeridos de inscripción:

- `id`
- `championship_id`
- `participant_id` o referencia específica
- `status`
- `submitted_at`
- `reviewed_by`
- `reviewed_at`
- `review_notes`

### 8.3 Etapas, rondas y eventos

#### `stages`

- `id`
- `championship_id`
- `name`
- `stage_type`
- `sequence`
- `status`

#### `rounds`

- `id`
- `stage_id`
- `round_number`
- `name`
- `status`

#### `venues`

- `id`
- `name`
- `address`
- `capacity`
- `status`

#### `events`

- `id`
- `round_id`
- `venue_id`
- `scheduled_at`
- `actual_start_at`
- `actual_end_at`
- `status`
- `postponement_reason`
- `created_at`
- `updated_at`

#### `event_participants`

- `id`
- `event_id`
- `registration_id`
- `side` o posición del participante
- `seed`, cuando aplique

La estructura debe permitir eventos de dos participantes y formatos individuales o colectivos. Si una disciplina necesita múltiples participantes por evento, el modelo no debe asumir exclusivamente local/visitante.

#### `event_assignments`

- `id`
- `event_id`
- `official_id`
- `role`
- `status`

### 8.4 Resultados y estadísticas

#### `results`

- `id`
- `event_id`
- `status`
- `submitted_by`
- `submitted_at`
- `approved_by`
- `approved_at`
- `approval_notes`
- `created_at`
- `updated_at`

#### `result_values`

- `id`
- `result_id`
- `event_participant_id`
- `score`
- `outcome`
- `rank`, cuando aplique

#### `event_period_scores`

Opcional para deportes que requieren resultados por período:

- `id`
- `result_id`
- `event_participant_id`
- `period_number`
- `score`

#### `sport_statistics`

No conviene almacenar todas las estadísticas en una única tabla sin validación. Evaluar tablas específicas como:

- `football_events`: goles, tarjetas, sustituciones.
- `basketball_player_stats`: puntos, faltas y estadísticas aprobadas.
- `taekwondo_bouts`: rondas, decisiones y puntuaciones específicas.
- `chess_pairings`: colores, resultado y datos de ronda.

Cada tabla específica debe vincularse a un evento, participante y resultado válido.

#### `result_revisions`

- `id`
- `result_id`
- `previous_snapshot`
- `new_snapshot`
- `reason`
- `changed_by`
- `changed_at`

Los snapshots deben conservar suficiente información para reconstruir qué cambió. Las revisiones deben ser inmutables para usuarios ordinarios.

### 8.5 Disciplina y documentación

#### `event_incidents`

- `id`
- `event_id`
- `athlete_id`, opcional
- `club_id`, opcional
- `incident_type`
- `description`
- `reported_by`
- `created_at`

#### `complaints`

- `id`
- `championship_id`
- `submitted_by`
- `subject`
- `description`
- `status`
- `submitted_at`
- `resolved_at`

#### `sanctions`

- `id`
- `athlete_id`, opcional
- `team_id`, opcional
- `club_id`, opcional
- `championship_id`, opcional
- `sanction_type`
- `reason`
- `starts_at`
- `ends_at`
- `status`
- `resolution_document_id`

Debe validarse que una sanción tenga un sujeto y un alcance coherentes.

#### `documents`

- `id`
- `owner_type` o relación específica
- `owner_id` o relación específica
- `document_type`
- `storage_key`
- `mime_type`
- `file_size`
- `visibility`
- `uploaded_by`
- `created_at`

Para mayor integridad, preferir relaciones explícitas por tipo de propietario si se necesitan claves foráneas estrictas.

### 8.6 Usuarios y contenido

#### `users`

- `id`
- `person_id`, opcional
- `email`
- `password_hash` o referencia a proveedor de identidad
- `status`
- `last_login_at`
- `created_at`
- `updated_at`

#### `roles`, `permissions`, `user_roles`, `role_permissions`

Implementar autorización por permisos y alcance organizativo.

#### `audit_logs`

- `id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `before_snapshot`
- `after_snapshot`
- `reason`
- `ip_hash` o metadato equivalente justificado
- `created_at`

No almacenar contraseñas, tokens ni secretos en logs.

#### `announcements`

- `id`
- `title`
- `slug`
- `summary`
- `content`
- `status`
- `published_at`
- `author_id`

#### `media_assets`

- `id`
- `storage_key`
- `alt_text`
- `visibility`
- `uploaded_by`
- `created_at`

#### `notifications`

- `id`
- `user_id`
- `channel`
- `template_key`
- `status`
- `sent_at`
- `created_at`

#### `consent_records`

- `id`
- `person_id` o relación con representante legal
- `consent_type`
- `purpose`
- `status`
- `recorded_at`
- `expires_at`, cuando aplique
- `evidence_key`, si procede

Validar el diseño de autorizaciones con asesoría institucional y legal; un registro de consentimiento no reemplaza el análisis de la base jurídica del tratamiento.

---

## 9. Arquitectura técnica recomendada

### 9.1 Stack propuesto

- **Frontend:** React + TypeScript + Vite.
- **Backend:** Node.js + TypeScript + NestJS.
- **API:** REST con documentación OpenAPI.
- **Base de datos:** PostgreSQL.
- **ORM:** Prisma.
- **Validación:** esquemas de validación compartidos o DTOs explícitos.
- **Autenticación:** sesiones seguras o tokens con estrategia documentada; evitar guardar credenciales sensibles en almacenamiento inseguro del navegador.
- **Archivos:** almacenamiento de objetos compatible con acceso privado y URLs firmadas cuando sea necesario.
- **Pruebas:** unitarias, integración y end-to-end.
- **Contenedores:** Docker para ambientes reproducibles.
- **CI:** lint, comprobación de tipos, pruebas y build.
- **Observabilidad:** logs estructurados, métricas básicas y alertas de errores.
- **Documentación API:** OpenAPI/Swagger.

Las bibliotecas y versiones exactas se seleccionarán al iniciar el repositorio y se fijarán en los archivos de dependencias.

### 9.2 Arquitectura modular del backend

Módulos sugeridos:

- `auth`
- `users`
- `roles-permissions`
- `institution`
- `sports`
- `categories`
- `seasons`
- `clubs`
- `persons`
- `athletes`
- `teams`
- `registrations`
- `championships`
- `rules`
- `stages-rounds`
- `venues`
- `scheduling`
- `events`
- `results`
- `standings`
- `football`
- `basketball`
- `taekwondo`
- `chess`
- `officials`
- `discipline`
- `documents`
- `reports`
- `publications`
- `notifications`
- `audit`

Los módulos específicos por deporte deben usar interfaces comunes para crear eventos y resultados, pero no forzar que todos compartan los mismos campos deportivos.

### 9.3 Organización de repositorio

```text
liga-cantonal-quero/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── shared/
│   └── config/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── database.md
│   ├── api.md
│   ├── security.md
│   └── deployment.md
├── tests/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

Esta estructura puede ajustarse al gestor de paquetes y las herramientas que el equipo adopte.

### 9.4 API REST propuesta

Ejemplos de recursos:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /sports`
- `GET /categories`
- `GET /seasons`
- `GET /clubs`
- `POST /clubs`
- `GET /athletes`
- `POST /athletes`
- `GET /championships`
- `POST /championships`
- `POST /championships/:id/registrations`
- `POST /events`
- `PATCH /events/:id/schedule`
- `POST /events/:id/results`
- `POST /results/:id/submit`
- `POST /results/:id/approve`
- `POST /results/:id/reject`
- `GET /championships/:id/standings`
- `GET /public/championships`
- `GET /public/events`
- `GET /public/results`
- `GET /public/standings`
- `GET /public/clubs`
- `GET /public/announcements`

Estos endpoints son ejemplos de diseño y no deben considerarse contratos definitivos hasta especificar DTOs, filtros, respuestas, permisos y códigos de error.

### 9.5 Reglas técnicas

- Usar migraciones de base de datos versionadas.
- No editar directamente la base de producción sin migración revisada.
- Validar entradas en el servidor.
- Usar transacciones para operaciones que cambien resultados y clasificaciones.
- Aplicar paginación a listados grandes.
- Establecer índices para claves foráneas y filtros frecuentes.
- Evitar consultas N+1.
- No confiar en que ocultar un botón equivale a proteger una acción.
- Aplicar permisos en el backend a cada operación sensible.
- Mantener `.env` fuera del repositorio.
- Proporcionar `.env.example` sin secretos.
- Guardar archivos privados fuera de directorios públicos.
- Utilizar claves únicas e idempotencia cuando se reintenten operaciones críticas.

---

## 10. Seguridad y protección de datos

### 10.1 Controles mínimos

- Contraseñas con algoritmo de hash moderno y parámetros adecuados.
- HTTPS obligatorio en producción.
- Cookies `HttpOnly`, `Secure` y `SameSite` si se usan sesiones basadas en cookies.
- Protección CSRF según el método de autenticación.
- Limitación de intentos y protección contra abuso de endpoints.
- Autorización por rol, permiso y alcance.
- Validación de entradas y límites de carga de archivos.
- Verificación de tipo MIME y tamaño de documentos.
- Protección contra acceso directo a recursos ajenos (IDOR).
- Política de expiración, renovación y revocación de sesiones.
- Copias de seguridad cifradas cuando corresponda.
- Secretos gestionados fuera del código.
- Actualización periódica de dependencias.
- Logs sin contraseñas, tokens ni datos innecesarios.
- Registro de acciones administrativas.
- Procedimiento para responder a incidentes de seguridad.

### 10.2 Protección de niños y adolescentes

- Recoger solo los datos necesarios.
- Restringir acceso a documentos y datos identificativos.
- No publicar fecha de nacimiento completa, contacto privado ni dirección.
- Evaluar autorizaciones y base jurídica para fotos y perfiles.
- Definir quién puede acceder a información de representantes legales.
- Establecer tiempos de conservación y procesos de rectificación.
- Evitar indexar páginas con datos que no deben ser públicos.
- Validar los procesos con la normativa ecuatoriana aplicable y asesoría institucional.

### 10.3 Auditoría

Deben auditarse como mínimo:

- Inicio de sesión y acciones administrativas relevantes.
- Alta y baja de usuarios.
- Cambios de roles.
- Cambios de elegibilidad.
- Aprobación y corrección de resultados.
- Cambios de calendario.
- Sanciones y resoluciones.
- Publicación y despublicación.
- Descarga o acceso a documentos sensibles, cuando corresponda.

Los registros de auditoría deben tener acceso restringido y no ser editables por usuarios ordinarios.

---

## 11. Requisitos no funcionales y calidad

### Seguridad

Toda operación crítica debe validar permisos en el servidor. Los controles deben probarse con usuarios de distintos roles.

### Integridad

- Claves foráneas en relaciones.
- Restricciones `UNIQUE` para códigos y combinaciones que no se puedan duplicar.
- Restricciones `CHECK` para rangos válidos cuando sean apropiadas.
- Transacciones para aprobar resultados y actualizar información derivada.
- Validaciones de dominio en backend.

### Rendimiento

- Paginación por defecto.
- Índices en filtros frecuentes.
- Caché solo para contenido que pueda tolerarla.
- Consultas de clasificación optimizadas.
- Pruebas con un volumen representativo de clubes, temporadas y resultados.

### Disponibilidad y recuperación

- Copias automáticas.
- Política de retención.
- Prueba periódica de restauración.
- Procedimiento de recuperación documentado.
- Monitoreo de errores y espacio de almacenamiento.

Los objetivos de disponibilidad, RPO (pérdida máxima de datos aceptable) y RTO (tiempo objetivo de recuperación) deberán acordarse con la Liga.

### Accesibilidad y experiencia

- Interfaz en español.
- Navegación con teclado.
- Contraste suficiente.
- Etiquetas y mensajes de error claros.
- Tablas legibles en móvil.
- Estados de carga, vacío y error.
- Confirmación para operaciones destructivas.
- Fechas y horas presentadas en la zona horaria local acordada.

---

## 12. Diseño de interfaz

### 12.1 Panel administrativo

Navegación sugerida:

- Inicio.
- Temporadas.
- Campeonatos.
- Deportes y categorías.
- Clubes.
- Deportistas.
- Equipos y plantillas.
- Inscripciones.
- Calendario.
- Resultados.
- Árbitros y jueces.
- Disciplina y reclamos.
- Documentos e informes.
- Noticias.
- Usuarios y permisos.
- Auditoría.
- Configuración.

### 12.2 Inicio administrativo

Mostrar tarjetas y listas como:

- Campeonatos activos.
- Inscripciones pendientes.
- Eventos próximos.
- Resultados pendientes de aprobación.
- Incidencias abiertas.
- Cambios recientes.
- Accesos rápidos según el rol.

No mostrar datos personales sensibles en tarjetas o notificaciones que no los requieran.

### 12.3 Portal público

Página de inicio:

- Identidad institucional.
- Campeonatos activos.
- Próximos encuentros.
- Últimos resultados oficiales.
- Acceso por deporte y categoría.
- Noticias y comunicados.
- Enlaces a tablas de posiciones.
- Información de contacto.

Cada página de campeonato debe mostrar reglamento público cuando esté disponible, participantes, calendario, resultados aprobados y clasificación.

### 12.4 Estados visuales

Diseñar estados claros para:

- Borrador.
- Pendiente.
- Aprobado.
- Rechazado.
- Suspendido.
- Finalizado.
- Publicado.

No depender únicamente del color para comunicar estados; acompañarlos de texto o iconos accesibles.

---

## 13. Plan de implementación

Estimación inicial: **10 a 14 semanas** para una primera versión, suponiendo una persona desarrolladora a tiempo completo, decisiones oportunas de la Liga y un alcance controlado. No es una garantía; la duración dependerá de los reglamentos, la migración de datos y el número de desarrolladores.

### Fase 1 — Descubrimiento y validación (semanas 1–2)

Tareas:

- Entrevistar a la administración y comisiones.
- Obtener reglamentos y formatos actuales.
- Identificar roles y flujos de aprobación.
- Inventariar datos históricos.
- Confirmar categorías por deporte.
- Definir privacidad y documentos.
- Aprobar requisitos.
- Diseñar wireframes de las pantallas principales.

Entregables:

- Requisitos aprobados.
- Matriz de permisos.
- Flujos de trabajo.
- Prototipo navegable.
- Lista de reglas por deporte.

### Fase 2 — Fundamentos técnicos (semanas 3–4)

Tareas:

- Crear repositorio y estrategia de ramas.
- Configurar frontend y backend.
- Configurar PostgreSQL y Prisma.
- Crear migraciones iniciales.
- Implementar autenticación y autorización.
- Implementar auditoría base.
- Crear deportes, categorías y temporadas.
- Crear gestión de usuarios.

Entregables:

- Ambientes reproducibles.
- Login funcional.
- Permisos básicos.
- Primer modelo de datos migrado.
- Pipeline de calidad básico.

### Fase 3 — Participantes y fútbol piloto (semanas 5–7)

Tareas:

- CRUD de clubes y personas.
- Gestión de deportistas y equipos.
- Plantillas e inscripciones.
- Validación de elegibilidad.
- Creación de campeonatos.
- Programación de jornadas.
- Registro y aprobación de resultados.
- Tabla de posiciones.
- Pruebas de reglas de fútbol.

Entregables:

- Un campeonato piloto administrable de principio a fin.
- Reportes de pruebas.
- Flujo de aprobación operativo.

### Fase 4 — Básquet, taekwondo y ajedrez (semanas 8–9)

Tareas:

- Validar reglamentos específicos.
- Implementar resultados por período en básquet.
- Implementar categorías, cuadros y combates de taekwondo.
- Implementar rondas, emparejamientos y desempates de ajedrez.
- Crear pruebas por deporte.
- Validar resultados con usuarios de la Liga.

Entregables:

- Módulos específicos probados.
- Reglas documentadas y configurables.
- Casos de aceptación aprobados.

### Fase 5 — Portal público y documentos (semanas 10–11)

Tareas:

- Construir páginas públicas.
- Publicar solo información aprobada.
- Implementar filtros.
- Implementar fichas de clubes y campeonatos.
- Crear tablas y calendarios.
- Generar documentos prioritarios.
- Adaptar interfaces a móvil.
- Revisar metadatos y privacidad.

Entregables:

- Portal público integrado.
- Documentos esenciales.
- Revisión de accesibilidad y privacidad.

### Fase 6 — Pruebas, capacitación y lanzamiento (semanas 12–14)

Tareas:

- Pruebas end-to-end.
- Pruebas de permisos.
- Pruebas de seguridad.
- Pruebas de restauración.
- Migración de datos aprobados.
- Capacitación de administradores.
- Preparación de manuales.
- Despliegue de producción.
- Monitoreo de primeros eventos.
- Registro y priorización de incidencias.

Entregables:

- Versión de producción.
- Manual de administración.
- Manual breve para dirigentes y árbitros.
- Plan de respaldo y recuperación.
- Acta de aceptación del sistema.

---

## 14. Estrategia de pruebas

### 14.1 Pruebas unitarias

Cubrir:

- Cálculo de puntos.
- Criterios de desempate.
- Elegibilidad por edad.
- Aplicación de sanciones.
- Validación de resultados.
- Transiciones de estados.
- Permisos de acceso.
- Validación de fechas y períodos.

### 14.2 Pruebas de integración

Cubrir:

- API y base de datos.
- Inscripciones y documentos.
- Aprobación de resultados.
- Recalcular clasificación.
- Publicación de información.
- Auditoría.
- Notificaciones.
- Generación de PDF.

### 14.3 Pruebas end-to-end

Escenarios mínimos:

1. El administrador crea una temporada y un campeonato.
2. El dirigente registra un equipo y envía una inscripción.
3. La secretaría observa o aprueba la inscripción.
4. La comisión programa un evento.
5. El árbitro registra el resultado.
6. La comisión aprueba el resultado.
7. La tabla de posiciones se actualiza.
8. El portal público muestra el resultado oficial.
9. Un usuario sin permisos intenta editar el resultado y recibe rechazo.
10. Una corrección queda registrada en auditoría.
11. Un usuario de un club no accede a documentos privados de otro club.
12. Se restaura una copia de respaldo en un ambiente de prueba.

### 14.4 Pruebas de regresión deportiva

Cada cambio en las reglas de clasificación debe ejecutar un conjunto de resultados conocidos y comparar la clasificación esperada con la calculada.

Los casos de prueba deben incluir empates, sanciones de puntos, eventos suspendidos, incomparecencias y resultados corregidos, cuando estos casos estén contemplados por el reglamento.

---

## 15. Despliegue y operación

### Ambientes

- **Desarrollo:** uso local.
- **Pruebas/staging:** validación con datos ficticios o anonimizados.
- **Producción:** información real y acceso controlado.

No usar una copia de producción sin anonimización para pruebas locales.

### Entrega continua

El pipeline debería ejecutar:

1. Instalación reproducible de dependencias.
2. Formato y lint.
3. Comprobación de tipos.
4. Pruebas unitarias.
5. Pruebas de integración disponibles.
6. Build del frontend y backend.
7. Verificación de migraciones.
8. Despliegue a staging.
9. Aprobación manual antes de producción.

### Copias de seguridad

Definir:

- Frecuencia de respaldo.
- Retención.
- Cifrado.
- Ubicación independiente del servidor principal.
- Responsables.
- Pruebas de restauración.
- Procedimiento ante pérdida o corrupción.

Una copia de seguridad no se considera suficiente hasta que se ha probado su restauración.

### Operación

- Supervisar errores del backend.
- Vigilar uso de base de datos y almacenamiento.
- Actualizar dependencias de forma controlada.
- Mantener un registro de incidencias.
- Documentar cambios de versión.
- Definir un canal de soporte para la Liga.

---

## 16. Estrategia Git y colaboración

Ramas recomendadas:

- `main`: versiones estables de producción.
- `develop`: integración de funcionalidades.
- `feature/nombre`: nuevas funcionalidades.
- `fix/nombre`: correcciones.
- `hotfix/nombre`: correcciones urgentes de producción.

Flujo:

1. Crear una tarea identificable.
2. Crear una rama desde `develop`.
3. Implementar un cambio acotado.
4. Ejecutar pruebas y lint.
5. Realizar commits descriptivos.
6. Abrir pull request hacia `develop`.
7. Revisar código y pruebas.
8. Fusionar después de aprobar.
9. Preparar versión estable desde `develop` hacia `main`.
10. Etiquetar releases.

Convención de commits sugerida:

- `feat: agregar gestión de temporadas`
- `fix: corregir cálculo de posiciones`
- `test: cubrir aprobación de resultados`
- `docs: documentar permisos`
- `refactor: separar reglas de fútbol`
- `chore: actualizar dependencias`

No incluir secretos, archivos `.env`, documentos personales ni datos reales en el repositorio.

---

## 17. Priorización del MVP

### Imprescindible para la primera entrega

- Login y permisos.
- Deportes, categorías y temporadas.
- Clubes, deportistas y equipos.
- Inscripciones y elegibilidad básica.
- Campeonatos y calendario.
- Registro y aprobación de resultados.
- Tabla de posiciones para fútbol.
- Módulos mínimos validados para los otros deportes.
- Portal público de resultados oficiales.
- Auditoría.
- Copias de seguridad.
- Protección de datos.

### Segunda etapa

- Informes avanzados.
- Generación completa de carnés.
- Notificaciones por correo.
- Estadísticas individuales ampliadas.
- Reclamos y resoluciones avanzadas.
- Importación de datos históricos.
- Exportaciones especializadas.
- PWA con mejoras de instalación y caché.

### Futuras ampliaciones

- Pagos en línea.
- Venta de entradas.
- Integraciones externas.
- Aplicación móvil nativa.
- Marcadores en vivo.
- Transmisiones.
- Analítica avanzada.

No sacrificar controles de seguridad, integridad o aprobación de resultados para acelerar funciones secundarias.

---

## 18. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Reglamentos incompletos o contradictorios | Validar reglas con la Liga antes de programar cálculos. |
| Categorías diferentes por deporte | Configuración flexible por campeonato. |
| Datos duplicados | Búsqueda de duplicados y restricciones de integridad. |
| Resultados alterados sin control | Aprobación, auditoría y revisiones inmutables. |
| Exposición de datos de menores | Privacidad por defecto, permisos y revisión legal. |
| Dependencia de una sola persona | Documentación, pruebas y procedimientos de despliegue. |
| Pérdida de información | Backups independientes y restauraciones probadas. |
| Crecimiento del alcance | MVP priorizado y gestión formal de cambios. |
| Problemas de conectividad en escenarios | Evaluar conectividad; diseñar un procedimiento de registro temporal y sincronización solo si es necesario. |
| Clasificaciones incorrectas | Casos de prueba deportivos aprobados por la comisión técnica. |

---

## 19. Información que debe proporcionar la Liga

Antes de cerrar el diseño técnico, solicitar:

- Reglamentos actuales de fútbol, básquet, taekwondo y ajedrez.
- Lista oficial de categorías por deporte.
- Reglas de edad y fechas de referencia.
- Clubes, equipos y deportistas existentes.
- Formatos de inscripción y documentos obligatorios.
- Procedimientos de aprobación.
- Reglas de ascenso y descenso.
- Criterios de desempate.
- Reglamento disciplinario.
- Formatos de actas y carnés.
- Escenarios deportivos disponibles.
- Roles reales del personal.
- Datos que pueden publicarse.
- Política de tratamiento y conservación de datos.
- Infraestructura, dominio y presupuesto disponibles.
- Formatos históricos de Excel o documentos que se deban importar.

---

## 20. Decisiones pendientes

Estas decisiones deben quedar documentadas antes de implementar los módulos correspondientes:

- [ ] Confirmar si Liga A, B, C y D aplican solo a fútbol o a otros deportes.
- [ ] Definir las edades exactas de Juvenil y Niños.
- [ ] Confirmar si las categorías son mixtas, por género u otra clasificación permitida.
- [ ] Confirmar modalidades de taekwondo.
- [ ] Definir el formato y desempates de ajedrez.
- [ ] Definir las estadísticas obligatorias de básquet.
- [ ] Definir quién puede ingresar y aprobar resultados.
- [ ] Definir si se requieren carnés impresos o digitales.
- [ ] Definir los documentos de inscripción.
- [ ] Definir la política de publicación de perfiles y fotografías.
- [ ] Definir proveedor de hosting, dominio y correo.
- [ ] Definir presupuesto y responsables de mantenimiento.
- [ ] Definir la política de copias de seguridad y recuperación.
- [ ] Definir el proceso de migración de datos históricos.

---

## 21. Definición de terminado

Una funcionalidad se considera terminada cuando:

- Cumple sus criterios de aceptación.
- Tiene validaciones en el backend.
- Respeta roles y permisos.
- Cuenta con pruebas automatizadas apropiadas.
- No expone información privada.
- Tiene migraciones revisadas si cambia la base de datos.
- Tiene manejo de errores y estados de carga.
- Registra auditoría cuando la operación es sensible.
- Está documentada.
- Ha pasado revisión de código.
- Está integrada mediante pull request.
- Ha sido validada en staging.

El proyecto completo se considera listo para producción cuando los flujos críticos se han probado, los reglamentos se han validado, los responsables han recibido capacitación, existe un respaldo restaurable y la Liga ha aceptado formalmente la entrega.

---

## 22. Orden recomendado de trabajo inmediato

1. Crear un repositorio y registrar este documento como `docs/requirements.md`.
2. Realizar una reunión de levantamiento con la Liga.
3. Completar la lista de decisiones pendientes.
4. Diseñar prototipos del panel administrativo y portal público.
5. Aprobar la matriz de permisos.
6. Diseñar el esquema relacional y los estados de cada proceso.
7. Crear el proyecto frontend y backend.
8. Configurar PostgreSQL, Prisma, migraciones, lint y pruebas.
9. Implementar autenticación, roles y auditoría.
10. Implementar clubes, personas, deportistas y equipos.
11. Implementar campeonatos e inscripciones.
12. Implementar calendario y resultados de fútbol como primer piloto.
13. Validar reglas y añadir básquet, taekwondo y ajedrez.
14. Construir el portal público.
15. Ejecutar pruebas, migración de datos y capacitación.
16. Desplegar y acompañar el primer campeonato real.

---

## 23. Cierre

La prioridad es construir una plataforma mantenible y confiable que refleje las reglas reales de la Liga Cantonal de Quero. La estructura común permitirá reutilizar administración, participantes, calendario, permisos y publicación, mientras cada deporte conserva sus propias reglas y estadísticas.

El siguiente entregable técnico debería ser el **diseño de base de datos definitivo en Prisma**, acompañado de diagramas de relaciones, migraciones iniciales, criterios de aceptación detallados y prototipos de las pantallas principales. Ese diseño debe cerrarse después de validar con la Liga las decisiones deportivas pendientes.
