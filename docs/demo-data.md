# Datos de demostración

`npm run db:seed:demo` carga una liga completa y ficticia para probar la aplicación con datos: clubes, deportistas, campeonatos con partidos jugados y por jugar, árbitros con designaciones, expedientes disciplinarios, noticias y cuentas de prueba.

> **No es un respaldo ni se puede deshacer.** La auditoría es inmutable y los datos quedan enlazados entre sí, de modo que no hay un «borrar demostración». Para volver atrás se restaura un respaldo (`npm run db:restore`). Lo recomendable es cargarlo en un ambiente de pruebas y, si se carga en producción para ensayar, hacerlo **antes** de que la Liga registre datos reales y con un respaldo previo.

## Cómo usarlo

`npm run seed` (en la raíz) es un atajo de `npm run db:seed:demo -w @liga/api --` y acepta las mismas opciones
(`npm run seed -- --confirm`). Son los mismos datos que carga `e2e/prepare.mjs` para las pruebas end-to-end.

```bash
npm run db:backup                                           # respaldo previo (siempre)
npm run db:seed:demo -w @liga/api                           # muestra la ayuda y no cambia nada
npm run db:seed:demo -w @liga/api -- --confirm              # carga los datos
npm run db:seed:demo -w @liga/api -- --confirm --allow-production   # exigido si NODE_ENV=production
npm run db:seed:demo -w @liga/api -- --deactivate-users     # al terminar: desactiva las cuentas y cierra sesiones
```

- `--confirm` es obligatorio; en producción además `--allow-production`. El comando indica a qué base apunta antes de cargar.
- Si ya hay datos de demostración no hace nada (no duplica).
- La **contraseña** de las cuentas de prueba sale de `DEMO_USER_PASSWORD` (mínimo 12 caracteres) o se genera al azar; se muestra **una sola vez** al terminar y no se guarda en ningún lado.
- Reutiliza los deportes, categorías, temporada, escenarios y configuración institucional que ya existan: solo crea lo que falta y solo completa los campos vacíos de la configuración.

## Qué crea

| Elemento      | Detalle                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Clubes        | 12 de Quero y sus parroquias (códigos `DEMO-01`…), cada uno con su presidente y 4 con cuenta de dirigente                                       |
| Deportistas   | ~250, adultos y menores (con tutor), consentimientos de tratamiento y algunos perfiles públicos                                                 |
| Temporada     | «Temporada <año>», activa                                                                                                                       |
| Campeonatos   | Fútbol Liga A (8 equipos), Fútbol Juvenil (6), Básquet Liga B (6), Taekwondo juvenil (8) y Ajedrez abierto (8)                                  |
| Partidos      | ~80 de todos contra todos / cuadro / suizo; ~50 ya jugados con acta aprobada (goles, tarjetas, cuartos, asaltos, partidas) y el resto por jugar |
| Árbitros      | 8, con designaciones confirmadas y pendientes en los próximos partidos de Liga A                                                                |
| Disciplina    | Incidencias, un expediente resuelto y **publicado** (suspensión y multa) y otro en revisión con descuento de puntos                             |
| Contenido     | 3 noticias o comunicados publicados con imágenes de ejemplo y 1 borrador                                                                        |
| Configuración | Textos de ejemplo claramente marcados para sustituir (la política de privacidad debe redactarla la Liga)                                        |

## Cuentas

Todas con el dominio reservado `@demo.liga.invalid` (no recibe correo) y la misma contraseña:

| Cuenta                          | Rol de demostración    | Qué permite probar                                                |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `secretaria@…`                  | Secretaría             | Clubes, deportistas, documentos, carnés y certificados            |
| `comision.tecnica@…`            | Comisión técnica       | Campeonatos, calendario, árbitros, designaciones, aprobar actas   |
| `disciplinaria@…`               | Comisión disciplinaria | Expedientes, sanciones y publicación de resoluciones              |
| `editor@…`                      | Editor de contenido    | Noticias e imágenes (sin tocar resultados)                        |
| `arbitro1@…`, `arbitro2@…`      | Árbitro o juez         | «Mis designaciones», registrar actas de sus partidos, incidencias |
| `dirigente1@…` a `dirigente4@…` | Dirigente de club      | Solo su club: plantillas, inscripciones, reclamos, sanciones      |

Los roles `demo_*` solo existen para la demostración: **la matriz real de roles la define la Liga** (D-14, D-63). La cuenta de superadministrador no se toca.

## Qué es ficticio

- Los nombres de personas se combinan al azar de listas comunes: cualquier parecido con alguien real es casual.
- Los documentos de identidad son `DEMO-00001`… (tipo «otro») y los teléfonos tienen un patrón claramente falso. No se generan cédulas, para no coincidir con las de personas reales.
- Los clubes son inventados; puede haber nombres parecidos a clubes reales.
- Los textos de la institución, noticias y resoluciones son de ejemplo y dicen «demostración».
- La generación es determinista: la misma ejecución produce los mismos datos (los partidos se fechan respecto de «hoy»).

## Qué probar con estos datos

Recorrido sugerido tras cargar: entrar como `comision.tecnica@…` y reprogramar un partido (avisa a los dirigentes y árbitros); entrar como `arbitro1@…`, confirmar una designación y registrar un acta; aprobarla con otra cuenta y ver el resultado y la tabla en el portal; emitir un carné con `secretaria@…` y verificarlo en `#/portal/verificar`; activar «publicar resoluciones» en la configuración y ver la resolución publicada sin nombres; comprobar en el portal que los menores aparecen como «Deportista DEP-…» salvo con consentimiento.
