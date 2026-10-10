# Fuentes de la interfaz

Alojadas en el proyecto para no depender de servicios externos (D-95). Vite las
empaqueta con hash en `dist/assets/` y se sirven desde el mismo origen que la web.

| Archivo                                       | Familia                    | Pesos              | SHA-256                                                            |
| --------------------------------------------- | -------------------------- | ------------------ | ------------------------------------------------------------------ |
| `atkinson-hyperlegible-next-latin-wght.woff2` | Atkinson Hyperlegible Next | 400–700 (variable) | `18b2a1a39a2fa298b0ba5390aca68462669826c90925656f1c1f6796e0e1bbaf` |
| `barlow-condensed-latin-600.woff2`            | Barlow Condensed           | 600                | `215a93c696f442034a46fbb382958f753fda60e30490683aeea6b235fcbb2b66` |
| `barlow-condensed-latin-700.woff2`            | Barlow Condensed           | 700                | `3787a5a419171630e6890cfa47c4da067474d005cd0ff8dc11ec090fdc3ee2b8` |

- **Origen:** Google Fonts (`fonts.gstatic.com`, Atkinson Hyperlegible Next v7 y
  Barlow Condensed v13), subconjunto `latin` (U+0000–00FF y signos comunes: cubre
  á, é, í, ó, ú, ñ, ü, ¿, ¡ y la raya). Descargadas el 2026-10-09.
- **Licencia:** SIL Open Font License 1.1 (`OFL-AtkinsonHyperlegibleNext.txt`,
  `OFL-BarlowCondensed.txt`, copiados de `github.com/google/fonts`, cuyo
  `METADATA.pb` declara `license: "OFL"` para ambas). La OFL permite incluirlas y
  redistribuirlas con la aplicación.
- **Integridad comprobada:** firma `wOF2`, longitud declarada igual al tamaño del
  archivo y bloque Brotli que se descomprime al tamaño que indica su directorio de tablas.

Para cambiar la tipografía: reemplazar estos archivos y las reglas `@font-face`
de `src/styles/tokens.css`.
