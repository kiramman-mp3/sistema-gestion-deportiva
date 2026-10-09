Git Workflow

Este proyecto debe utilizar un flujo de trabajo basado en Git con las siguientes ramas:

main
  └── develop
       ├── feature/*
       ├── fix/*
       ├── refactor/*
       └── chore/*
Inicialización del repositorio

Antes de comenzar cualquier trabajo:

Verifica si el proyecto ya es un repositorio Git.

Si NO existe .git, inicializa el repositorio:

git init
Configura el flujo de ramas:
main: rama estable y de producción.
develop: rama principal de desarrollo.
feature/*: nuevas funcionalidades.
fix/*: correcciones de errores.
refactor/*: refactorizaciones.
chore/*: mantenimiento, configuración y tareas auxiliares.

Si el repositorio acaba de ser inicializado:

git add .
git commit -m "chore: initial commit"
git branch -M main
git checkout -b develop
Regla principal

No trabajes directamente sobre main.

Todo desarrollo debe realizarse desde develop o desde una rama específica de trabajo.

Antes de comenzar una funcionalidad:

git checkout develop
git pull
git checkout -b feature/nombre-de-la-funcionalidad

Utiliza nombres descriptivos y en kebab-case.

Ejemplos:

feature/scroll-animations
feature/authentication
feature/product-catalog
fix/login-validation
refactor/api-services
chore/update-dependencies
Commits

Haz commits frecuentes y pequeños.

Cada logro funcional o etapa significativa debe tener su propio commit.

No esperes hasta terminar toda una funcionalidad para hacer un único commit.

Ejemplo:

feat: create landing page structure
feat: add hero section
feat: add scroll-driven animations
feat: add responsive navigation
feat: add mobile layout
fix: correct scroll animation timing
refactor: extract animation components

Los commits deben:

Representar un cambio coherente.
Ser suficientemente pequeños para poder revertirse fácilmente.
No mezclar funcionalidades diferentes.
Usar mensajes claros.
Seguir Conventional Commits.
Formato
type: description

Tipos permitidos:

feat
fix
refactor
style
docs
test
chore
perf
build
ci

Ejemplos:

git add .
git commit -m "feat: add hero section"
git add .
git commit -m "feat: implement scroll-driven animations"
git add .
git commit -m "fix: prevent animation overflow on mobile"
Flujo de trabajo

Para cada funcionalidad:

1. Actualizar develop
git checkout develop
git pull
2. Crear la rama
git checkout -b feature/nombre
3. Implementar

Trabaja en pequeñas etapas.

Después de cada logro significativo:

git status
git add .
git commit -m "tipo: descripción"
4. Verificar

Antes de considerar terminada una funcionalidad:

Ejecuta el linter.
Ejecuta las pruebas disponibles.
Verifica que el proyecto compile/build correctamente.
Corrige cualquier error encontrado.
Haz un commit separado para cada corrección importante.
5. Integrar a develop

Cuando la funcionalidad esté completamente terminada:

git checkout develop
git merge --no-ff feature/nombre

Después:

git branch -d feature/nombre
Main

main debe contener únicamente versiones estables.

No hagas commits directamente sobre main.

Cuando develop contenga una versión estable y probada:

git checkout main
git merge --no-ff develop

El resultado debe ser:

main
  ↓
versión estable

develop
  ↓
desarrollo actual

feature/*
  ↓
funcionalidades individuales
Antes de modificar código

Siempre revisa:

git status
git branch

Comprueba en qué rama estás trabajando.

Si estás en main, cambia a develop o crea una rama feature/* apropiada antes de modificar archivos.

No hacer

No hagas:

git add .
git commit -m "update"

como único commit después de realizar una gran cantidad de trabajo.

No hagas commits gigantes que mezclen:

Nuevas funcionalidades.
Correcciones.
Refactorizaciones.
Cambios de estilos.
Configuración.

Sepáralos cuando sea razonable.

No hagas git reset --hard, git clean -fd u otras operaciones destructivas sin una razón clara y sin verificar primero qué archivos se perderían.

No sobrescribas trabajo existente sin revisarlo.

No hagas push --force sobre main o develop.

Regla para Claude Code

Autoría de commits

* Todos los commits deben utilizar exclusivamente la identidad Git configurada por el usuario.
* No incluir a Claude Code, Anthropic ni a ninguna herramienta de IA como coautor.
* No añadir trailers `Co-Authored-By` ni variantes equivalentes que atribuyan coautoría a una IA.
* No añadir líneas de atribución de IA en los mensajes de commit.
* Antes de crear un commit, verificar que el mensaje cumpla estas reglas.
* No modificar `user.name`, `user.email` ni la configuración global de Git.
* No reescribir ni modificar commits existentes para eliminar coautorías sin autorización explícita del usuario.
* Estas reglas se aplican a todos los commits, independientemente de la rama o del tipo de tarea.

Claude debe mantener este workflow durante toda la sesión.

Cuando complete una etapa importante del trabajo:

Revisar los cambios.
Ejecutar las verificaciones apropiadas.
Crear un commit descriptivo.
Continuar con la siguiente etapa.

Si una tarea contiene varias funcionalidades, dividirla en varias etapas y realizar commits independientes.

Al finalizar el trabajo, mostrar un resumen:

Branch:
<rama actual>

Commits realizados:
- <commit 1>
- <commit 2>
- <commit 3>

Verificaciones:
- Tests: PASS/FAIL
- Linter: PASS/FAIL
- Build: PASS/FAIL

La prioridad es mantener un historial Git limpio, entendible y fácil de revertir.