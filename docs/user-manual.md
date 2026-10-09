# Manual de Usuario del Sistema

**Organización:** Liga Deportiva Cantonal de Quero, Tungurahua, Ecuador  
**Plataforma:** Sistema Integral de Gestión Deportiva  
**Versión:** 1.0  
**Fecha:** Octubre de 2026

---

## 1. Introducción y Acceso a la Plataforma

El Sistema Integral de la Liga Cantonal de Quero es una solución web moderna diseñada para administrar integralmente las competencias cantonales en cuatro deportes oficiales: **Fútbol, Básquetbol, Taekwondo y Ajedrez**.

La plataforma opera en dos áreas principales:

1. **Portal Público (`#/portal`):** Accesible a la ciudadanía, aficionados, medios de comunicación y familias sin requerir inicio de sesión. Muestra clasificaciones oficiales, calendario de juego, resultados aprobados y documentos imprimibles.
2. **Sistema Privado de Gestión (`#/login` o `#/`):** Accesible exclusivamente para dirigentes, jueces, miembros de comisión técnica, secretaría y administradores mediante credenciales autenticadas y permisos específicos.

---

## 2. Roles y Matriz de Responsabilidades

| Rol                        | Funciones Principales                                                            | Alcance              |
| -------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| **Superadministrador**     | Configuración general de la plataforma, roles, permisos y respaldos.             | Todo el sistema      |
| **Administrador de Liga**  | Gestión de catálogos (temporadas, deportes, categorías), campeonatos y clubes.   | Institucional        |
| **Secretaría**             | Validación de inscripciones, documentos de deportistas y generación de nóminas.  | Administrativo       |
| **Comisión Técnica**       | Programación de fechas, designación de escenarios y aprobación oficial de actas. | Deportivo            |
| **Árbitro / Juez de Mesa** | Registro de actas en borrador, incidencias de juego, goles, cuartos o asaltos.   | Encuentros asignados |
| **Dirigente de Club**      | Inscripción de equipos, registro de deportistas de su club y consulta de actas.  | Su propio club       |

---

## 3. Catálogos Deportivos

### 3.1 Deportes

Permite administrar los deportes oficiales (código único, nombre y estado activo/inactivo). Los deportes preconfigurados son Fútbol (`futbol`), Básquetbol (`basquet`), Taekwondo (`taekwondo`) y Ajedrez (`ajedrez`).

### 3.2 Categorías por Edades

Permite definir las divisiones cantonales (ej. _Senior_, _Juvenil Sub-18_, _Infantil Sub-12_, _Liga A_, _Liga B_). El sistema valida automáticamente la edad máxima y mínima al momento de registrar integrantes.

### 3.3 Temporadas Deportivas

Las temporadas agrupan las competencias de un año o ciclo (ej. _Temporada Oficial 2026_). Poseen un ciclo de vida controlado: `borrador` → `activa` → `finalizada` → `archivada`.

---

## 4. Clubes y Organizaciones Deportivas

- **Alta de Clubes:** Nombre oficial, nombre corto, identificador URL (`slug`) y sector cantonal (ej. _San Pedro_, _La Calera_, _Pueblo Viejo_).
- **Ficha Institucional:** Muestra los equipos registrados, directiva y deportistas asociados.
- **Historial:** La desactivación de un club conserva todo su historial deportivo previo.

---

## 5. Personas y Deportistas (Protección Reforzada)

### 5.1 Registro de Deportistas

1. Ingrese a la sección **Deportistas** y presione **Nuevo deportista**.
2. Registre nombres y apellidos completos.
3. Ingrese la fecha de nacimiento (utilizada para validar categorías).
4. El sistema asignará un código único institucional (ej. `DEP-000101`).

### 5.2 Protección de Datos y Privacidad de Menores

- Los números de cédula, direcciones y teléfonos se almacenan en tablas privadas protegidas con permisos estrictos (`people:full_access`).
- Las fotografías de deportistas menores de edad únicamente se publican si existe un consentimiento informado registrado por su tutor legal.

---

## 6. Equipos y Plantillas por Temporada

### Regla Fundamental de Elegibilidad:

> **Un deportista solo puede pertenecer a un único equipo por deporte en una misma temporada.**

- Al registrar una plantilla (`TeamSeason`), se asignan los dorsales y se verifica que no existan duplicidades ni incompatibilidades reglamentarias.
- Si un deportista es transferido entre clubes, la operación exige permiso administrativo y queda registrada con motivo en la auditoría del sistema.

---

## 7. Campeonatos y Reglamentos Versionados

Al crear un campeonato:

1. Se selecciona la **Temporada**, el **Deporte** y la **Categoría**.
2. Se elige la modalidad:
   - _Todos contra todos (Liga)_
   - _Eliminatoria simple (Playoffs)_
   - _Fase de grupos y eliminación_
   - _Sistema Suizo_ (Ajedrez)
   - _Cuadro de combates_ (Taekwondo)
3. Se configuran las reglas de puntuación (puntos por victoria, empate, derrota, criterios de desempate).
4. Las reglas quedan selladas mediante versiones inmutables (`RuleVersion`) aprobadas.

---

## 8. Inscripciones y Revisión de Buena Fe

1. Los clubes envían su solicitud de inscripción para el campeonato.
2. La Secretaría revisa la nómina, verifica que los deportistas estén habilitados y no tengan sanciones vigentes.
3. Se emite la resolución: `aprobada`, `observada` o `rechazada`.

---

## 9. Calendario, Escenarios y Detección de Conflictos

1. La Comisión Técnica divide el campeonato en **Etapas** (ej. _Fase Regular_, _Liguilla_) y **Jornadas** (ej. _Fecha 1_, _Fecha 2_).
2. Se programan los encuentros asignando fecha, hora y escenario deportivo.
3. **Detección Automática de Conflictos:**
   - Si se intenta programar dos encuentros en el mismo escenario con menos de 90 minutos de diferencia, el sistema bloquea la asignación por colisión de escenario.
   - Si un mismo participante tiene dos encuentros el mismo día calendario, el sistema emite una advertencia de conflicto de descanso.
4. **Reprogramaciones:** Cualquier cambio de fecha u hora exige un motivo obligatorio y queda registrado en la bitácora del evento.

---

## 10. Registro de Actas de Juego por Deporte

### 10.1 Fútbol

- Puntuación global del partido.
- Registro minucioso de incidencias por minuto: goles, tarjetas amarillas, tarjetas rojas y sustituciones con asociación al deportista.

### 10.2 Básquetbol

- Puntuación acumulada y desglose obligatorio por períodos de juego: Cuarto 1 (Q1), Cuarto 2 (Q2), Cuarto 3 (Q3), Cuarto 4 (Q4) y tiempos extra (OT).

### 10.3 Taekwondo

- Registro de combate por asaltos (Round 1, Round 2, Round 3).
- Puntos válidos obtenidos y penalizaciones (_Gam-jeom_).
- Decisión final del combate (por puntos, superioridad técnica o descalificación).

### 10.4 Ajedrez

- Registro de emparejamiento individual por tablero: jugador con piezas blancas, jugador con piezas negras.
- Puntuación reglamentaria FIDE: `1.0` (victoria), `0.5` (tablas) o `0.0` (derrota).
- Registro del coeficiente de desempate Buchholz.

---

## 11. Flujo de Aprobación de Resultados

Para evitar fraudes o errores:

1. **Borrador (`borrador`):** El árbitro o vocal ingresa las cifras iniciales. Este borrador **NO** altera las tablas ni se publica en internet.
2. **Envío a Revisión (`pendiente_revision`):** El acta se congela para revisión de la Comisión Técnica.
3. **Aprobación Oficial (`aprobado`):** La autoridad técnica revisa el acta física firmada y aprueba el resultado en el sistema.
   - En ese instante, el encuentro pasa a estado `finalizado`.
   - Se recalcula automáticamente la tabla de posiciones.
   - El resultado se publica de inmediato en el portal público.
4. **Correcciones:** Si se debe corregir un acta aprobada, el sistema exige un motivo formal y genera una **revisión histórica inmutable** (`ResultRevision`), preservando la instantánea anterior.

---

## 12. Tablas de Posiciones Oficiales

El motor de clasificaciones calcula en tiempo real:

- Partidos Jugados (PJ), Ganados (PG), Empatados (PE), Perdidos (PP).
- Goles/Puntos a Favor (GF), En Contra (GC) y Diferencia (DG).
- Puntos oficiales según reglamento (ej. Fútbol: 3/1/0, Básquet: 2/1/0).
- Desempates por Confrontación Directa, Mayor Diferencia, Mayor Cantidad de Goles y Juego Limpio (tarjetas amarillas y rojas).
- En Ajedrez: Ordenamiento por Puntos y Sistema Buchholz.

---

## 13. Portal Público y Documentos Imprimibles

### 13.1 Acta Oficial de Encuentro

Disponible tanto en el panel administrativo como en el portal público:

- Presenta el membrete institucional de la **Liga Deportiva Cantonal de Quero** y personería jurídica.
- Muestra el marcador oficial, alineaciones de ambos clubes, incidencias de juego y observaciones.
- Incluye los 6 casilleros reglamentarios para firmas y números de cédula:
  - Árbitro Central / Juez Principal
  - Juez de Línea 1 / Cronometrista
  - Juez de Línea 2 / Juez de Mesa
  - Vocal de Turno (Comisión Técnica)
  - Delegado / Capitán Club Local
  - Delegado / Capitán Club Visitante
- Botón **🖨️ Imprimir / Guardar PDF**: Emite el documento en formato estándar A4 listo para archivo físico.

### 13.2 Nómina Oficial de Buena Fe

- Documento de respaldo por equipo inscrito en el campeonato.
- Detalla los deportistas habilitados con su número de dorsal, código de registro y club.
- Cláusula de responsabilidad legal y espacios de firma para el Presidente del Club, Presidente de la Liga y Secretario/a de la Liga.

---

## 14. Seguridad y Auditoría

- Todas las operaciones sensibles (inicio de sesión, cambio de roles, altas, bajas, reprogramaciones, aprobación de actas y sanciones) se registran de forma transaccional e indeleble en la tabla de **Auditoría**.
- El módulo de auditoría (`#/auditoria`) permite filtrar por usuario, fecha, tipo de entidad y acción, con saneado automático de secretos.
