# Travel Planner — Planificador Académico de Destinos

Ejercicio Integrador 3 · Programación Web · JavaScript puro, sin dependencias.

Aplicación web que busca **cualquier país del mundo** con una **cascada de fuentes
públicas sin API key**, muestra la ficha del destino y arma un **plan de viaje con
presupuesto editable en vivo**.

---

## 1. Cómo ejecutar

Doble clic en `index.html`. Nada más: no hay build, ni `npm install`, ni servidor.

También funciona con Live Server o cualquier servidor estático, y se puede subir
a GitHub Pages tal cual.

Requisitos del enunciado cubiertos:

- Estructura exacta de archivos y rutas relativas `./`.
- Scripts clásicos con `defer`, **no** módulos ES: así funciona también con `file://`.
- Cero dependencias externas (sin CDN, sin frameworks).
- Tema claro, mobile-first, con CSS Grid y Flexbox.

---

## 2. Estructura y guía de lectura

```
travel-planner/
├── index.html          Estructura y los 4 estados de la interfaz   (104 líneas)
├── README.md           Este documento
├── css/
│   └── estilos.css     Tema claro, Grid + Flexbox                  (135 líneas)
└── js/
    ├── api.js          Cascada de fuentes públicas                 (137 líneas)
    ├── presupuesto.js  Modelo del plan y cálculos                  (86 líneas)
    └── app.js          Controlador de la interfaz                 (194 líneas)
```

**Total: 417 líneas de JavaScript**, de las cuales **256 son código** y 161 son
comentarios y líneas en blanco.

Sobre el presupuesto de líneas del enunciado: se priorizó la legibilidad para la
sustentación. Los 12 bloques numerados y las 8 etiquetas `SUSTENTACIÓN` suman 161
líneas de documentación. **El código en sí son 256 líneas, dentro del presupuesto
de 280**; si el docente exige el corte, el camino es borrar comentarios, nunca
código: ninguna línea de documentación participa en la funcionalidad.

### Cómo se leen los archivos

Cada archivo está partido en bloques numerados y cada bloque dice en una línea qué
hace y por qué. Para una sustentación, el recorrido oral es:

| Archivo | Bloques | Qué demostrar |
|---|---|---|
| `api.js` | 1. URLs · 2. Normalizador · 3. Cascada/fallback · 4. Consulta principal | Que la cascada entra en acción y por qué |
| `presupuesto.js` | 1. Estado · 2. Mutaciones · 3. Cálculos con reduce | Que el modelo es inmutable y verificable |
| `app.js` | 1. Utilidades DOM · 2. Estados · 3. Render · 4. Plan y edición en vivo · 5. Eventos | Que no hay XSS y que no se pierde el foco |
| `index.html` | 1. Buscador · 2. Ficha (4 estados) · 3. Alta · 4. Resumen | Que la UI no tiene lógica incrustada |

---

## 3. La cascada de fuentes (lo central de esta versión)

**REST Countries v3.1 fue retirada por el proveedor.** Verificado hoy: la URL sigue
respondiendo `HTTP 200`, pero devuelve un sobre `{success, data, errors}` en lugar
de países, así que ya no entrega datos reales. Un `fetch(...).then(r => r.json())`
naive se queda con ese sobre y revienta.

`api.js` resuelve eso con una cascada de tres fuentes públicas, todas sin clave:

| Orden | Fuente | Qué aporta |
|---|---|---|
| 1 | `https://restcountries.com/v3.1/name/{nombre}?fields=name,capital,region,subregion,population,currencies,flags,borders,cca3,translations` | Fuente primaria tal cual la pide el enunciado |
| 2 | `https://raw.githubusercontent.com/mledoze/countries/master/countries.json` | 250 países con `translations.spa` completo (1.4 MB, CORS `\*)` |
| 3 | `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1` | Población real, año más reciente |
| 4 | `https://flagcdn.com/{cca2}.svg` | Bandera SVG cuando la fuente no trae `flags` |

El eslabón que une todo es el `.catch()` de la promesa primaria:

```js
return fetch(BASE + 'name/' + encodeURIComponent(q) + '?fields=' + CAMPOS)
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then((datos) => {
    const lista = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.data) ? datos.data : []);
    if (!lista.length || !lista[0].name) throw new Error('respuesta no compatible');
    return normalizarPais(lista[0]);
  })
  .catch(() => buscarEnEspejo(q)); // cualquier fallo cae al espejo global
```

Ese `.catch()` captura **los tres fallos a la vez**: HTTP 404, error de red o CORS, y
el sobre de deprecación de la v3.1. Si tampoco hay coincidencia en el espejo, se
lanza el mensaje exacto que pide el enunciado: `País no encontrado. Verifica el
nombre ingresado.`

### Complementos del espejo

El dataset global cubre los nombres, pero **no trae `population` ni `flags.svg`**.
Por eso `normalizarPais(item, poblacion)` recibe la población del Banco Mundial y
deriva la bandera de FlagCDN con el `cca2`:

```js
poblacion: item.population || poblacion || 0,
bandera: (item.flags && (item.flags.svg || item.flags.png)) || (cca2 ? 'https://flagcdn.com/' + cca2 + '.svg' : ''),
```

Si la fuente primaria sí trae esos datos, se usan tal cual y no se consulta nada
extra. Perú, por ejemplo: **34.576.665** habitantes (Banco Mundial), no un estimado.

### Caché del dataset

El espejo pesa 1.4 MB, así que se descarga **una sola vez** y se reutiliza:

```js
let cache = null;
function cargar() {
  if (!cache) cache = Promise.all([fetch(ESPEJO)…, fetch(BANCO)…]).then(([paises, wb]) => ({ paises, pob }));
  return cache;
}
```

Cada búsqueda posterior cuesta **una sola petición ligera** a la v3.1. Los vecinos
también salen de esa caché, sin peticiones extra.

---

## 4. Modelo de datos

`buscarPaisPorNombre()` siempre devuelve un objeto con **la misma forma**, venga de
la fuente que venga. Por eso `app.js` no necesita saber de dónde salió la ficha:

```js
{
  nombre: 'Perú',                        // translations.spa.common
  oficial: 'República del Perú',          // translations.spa.official
  codigo: 'PER',                         // cca3
  capital: 'Lima',                       // de capital[0]
  region: 'Americas',
  subregion: 'South America',
  poblacion: 34576665,                   // NÚMERO crudo; formatea la vista
  moneda: 'PEN (Peruvian sol)',          // "CÓDIGO (nombre)"
  bandera: 'https://flagcdn.com/pe.svg',
  fronteras: ['BOL', 'BRA', 'CHL', 'COL', 'ECU']
}
```

`poblacion` es un **número**, no un texto: formatearla con `Intl.NumberFormat` es
responsabilidad de la vista, no del modelo. El resto de la UI se encarga en
`pintarPais()`.

### Búsqueda tolerante

La búsqueda ignora tildes y mayúsculas y compara contra **cuatro** nombres más los
códigos, en el dataset y en la fuente primaria:

`name.common` · `name.official` · `translations.spa.common` · `translations.spa.official` · `cca3` · `cca2`

```js
const coincide = (x, q) => [...].some((c) => {
  const s = SIN(c);  // minúsculas + sin tildes (NFD)
  return s === q || s.split(/[\s-]/).some((w) => w.indexOf(q) === 0);
});
```

Así `peru`, `Peru`, `PER`, `per` y `España` encuentran Perú. El prefijo por palabra
evita que `guinea` devuelva Guinea Ecuatorial en lugar de Guinea.

---

## 5. Las 4 responsabilidades

| Archivo | Responsabilidad | No hace |
|---|---|---|
| `api.js` | Red, cascada, caché, normalización | No toca el DOM |
| `presupuesto.js` | Estado y cálculos | No toca el DOM ni la red |
| `app.js` | DOM, eventos, render | No hace `fetch` ni cálculos |

Cada archivo expone **un solo objeto global** y nada más:

```js
window.ApiPaises = { buscarPaisPorNombre, buscarPais, buscarVecinos };
window.PlanPresupuesto = { agregarDestino, eliminarDestino, actualizarDestino,
                           calcularTotales, obtenerDestinos, limpiarPlan };
```

`buscarPaisPorNombre(nombre)` es la firma que pide el enunciado. `buscarPais` queda
como alias del mismo objeto función para no romper a quien la llamara por el nombre
anterior.

---

## 6. Etiquetas de sustentación

Cada concepto de la rúbrica tiene un comentario **en la línea exacta donde
ocurre**, con el formato `// === SUSTENTACIÓN: ... ===`. Para buscar una durante
la exposición, `Ctrl+F` por `SUSTENTACIÓN`.

| # | Etiqueta | Dónde ocurre |
|---|----------|--------------|
| 1 | `EVENTO SUBMIT Y PREVENTDEFAULT` | `app.js` BLOQUE 5 → `DOMContentLoaded`, los dos `submit` y el `click` |
| 2 | `FETCH Y PROMESA PENDIENTE` | `api.js` BLOQUE 4 → `buscarPaisPorNombre()`, cadena `.then()` |
| 3 | `VALIDACIÓN HTTP Y ERROR 404` | `api.js` BLOQUE 4 → `if (!r.ok) throw new Error('HTTP ' + r.status)` |
| 4 | `FALLBACK EN CASCADA` | `api.js` BLOQUE 3 → `buscarEnEspejo()`, invocada por el `.catch()` |
| 5 | `DOM SEGURO (CERO INNERHTML / XSS)` | `app.js` BLOQUE 1 → `el()` con `textContent`; también en `api.js`, que no inserta nada |
| 6 | `EDICIÓN EN VIVO SIN PERDER FOCO` | `app.js` BLOQUE 4 → `editar()` en el evento `input` |
| 7 | `CÁLCULO FUNCIONAL CON REDUCE` | `presupuesto.js` BLOQUE 3 → `calcularTotales()` |
| 8 | `ELIMINACIÓN INMUTABLE CON FILTER` | `presupuesto.js` BLOQUE 2 → `eliminarDestino()` |

Además, el archivo `presupuesto.js` documenta en sus comentarios los dos principios
de diseño que sostienen el módulo: **estado privado** (el array vive en el closure
de la IIFE) e **inmutabilidad** (`.concat()`, `.filter()`, `.map()` no mutan).

---

## 7. Los 4 estados de la interfaz

`mostrar(estado)` deja visible **solo uno** de los cuatro bloques:

| Estado | Qué ve el usuario | Cuándo |
|---|---|---|
| `vacio` | «Escribe el nombre de un país» | Al abrir la página |
| `cargando` | Spinner + «Consultando la API…» | Durante el `fetch` |
| `exito` | Ficha, bandera, datos y vecinos | Búsqueda correcta |
| `error` | Caja roja con `role="alert"` | Sin coincidencia en ninguna fuente |

---

## 8. Seguridad: por qué no hay XSS

Todo nodo se crea con una única fábrica, `el(tag, clase, texto)`, que escribe el
contenido **solo con `textContent`**. Ese método inserta texto plano: nunca
interpreta HTML. Los cinco campos de la ficha y los botones de vecinos salen de ahí.

Además, antes de asignar el `src` de una bandera se valida el protocolo:

```js
ui.bandera.src = /^https?:\/\//i.test(p.bandera) ? p.bandera : '';
```

Un país llamado `<img src=x onerror=alert(1)>` se muestra literalmente como texto.
**Cero asignaciones a `innerHTML`** en los tres archivos (verificado por aserción).

---

## 9. Edición en vivo sin perder el foco

Este es el detalle técnico más importante de `app.js`.

El error clásico: al teclear, si se vuelve a dibujar la lista entera, el `<input>`
se destruye y se recrea, el foco se pierde y el usuario escribe a medias.

La solución aquí es **no redibujar nada** en el evento `input`:

```js
subtotal.textContent = dinero(n.subtotal);  // solo el texto del subtotal
pintarResumen();                            // solo los números del resumen
```

El modelo se actualiza, pero el nodo del input nunca se toca, así que el foco y el
cursor quedan intactos. La lista completa solo se redibuja al agregar o eliminar.

Además, antes de editar se releen los valores vigentes del modelo, de modo que
cambiar los días **no** borra el costo, y viceversa. Y la clave del destino es
`codigo`, no el índice, así que el orden de la lista es irrelevante.

---

## 10. Preguntas que seguro te van a hacer

**¿Qué pasa exactamente con la v3.1?**
Responde `HTTP 200` con `{success, data, errors}`. El código acepta las dos formas
(`Array.isArray(datos)` o `datos.data`) y, si no encuentra un objeto con `name`,
lanza `respuesta no compatible`, que el `.catch()` convierte en la caída al espejo.

**¿Por qué un `.catch()` y no un `if/else`?**
Porque los tres fallos posibles —404, error de red o CORS, y sobre de deprecación—
son los tres rechazos de la misma promesa. Un solo `.catch()` los cubre sin
duplicar la llamada de contingencia.

**¿Por qué mirrors de GitHub y no otra API?**
Porque son públicas, sin registro y sin límite de cuota. Se verificó que
`raw.githubusercontent.com`, `api.worldbank.org` y `flagcdn.com` envían
`Access-Control-Allow-Origin: *`, así que funcionan desde `file://` sin proxy.

**¿Por qué no usar `world-countries`?**
Se probó y también sirve datos sin `population`. El dataset de mledoze es el que
incluye `translations.spa` para los 250 países, que es justo el campo que el
enunciado pide usar.

**¿Qué pasa si el `fetch` falla?**
La Promesa se rechaza, `.catch()` la recibe, busca en el espejo global y, si hay
coincidencia, devuelve el país. Si no la hay, relanza el error exacto y la UI
muestra la caja roja.

**¿Por qué `obtenerDestinos()` devuelve `[...destinos].map(...)`?**
Para que quien llama no pueda modificar el estado privado por accidente. El spread
copia el arreglo y el `map` copia cada objeto.

**¿Por qué `.concat()`, `.filter()` y `.map()` en vez de `push`, `splice`?**
Porque esos métodos **no mutan**: devuelven un arreglo nuevo y el estado anterior
queda intacto. Con `push` el modelo dependería del orden en que se llamen las
funciones.

**¿Cómo funciona el `.reduce()`?**
El acumulador se devuelve en cada paso, así el siguiente elemento lo recibe ya
enriquecido. El segundo argumento es el **valor inicial**: sin él, un arreglo
vacío lanzaría `TypeError`. El promedio se calcula al final, cuando ya se conoce
el total de días.

**¿Qué es la delegación de eventos?**
Un solo `addEventListener` en `#vecinos`, en vez de uno por botón. Los botones se
crean y se borran dinámicamente, así que el listener debe estar en el contenedor
padre. El clic se localiza con `e.target.closest('button[data-texto]')`.

**¿Cómo evitas el XSS?**
Con `textContent`, que escribe texto plano y nunca interpreta marcado. Además
valido el protocolo del `src` de las banderas.

**¿Por qué `<script defer>` y no módulos ES?**
`type="module"` exige un servidor por la política CORS: al abrir el archivo con
doble clic fallaría. Como el enunciado pide funcionar con doble clic, uso scripts
clásicos con `defer`.

---

## 11. Verificación

Dos suites con Node 26 y jsdom, **155 aserciones, 0 fallos**.

**78 con `fetch` simulado** (`test-cascada.js`), que cubren cada rama de la cascada
sin red: v3.1 respondiendo bien, v3.1 con el sobre `{success,data,errors}` con y
sin datos, HTTP 404, error de red, entrada vacía, coincidencia por código y por
prefijo, mensaje exacto de error, caché de una sola descarga, límite de 12 vecinos,
presupuesto con `codigo`, los cuatro estados de la UI, clic en vecino, edición en
vivo sin recrear el nodo, y las aserciones de higiene: cero `innerHTML`, las 8
etiquetas `SUSTENTACIÓN`, los 12 bloques numerados, sin API keys, `defer`, orden de
scripts y código bajo 280 líneas.

**77 contra la API real** (`live-cascada.js`), que confirman que la v3.1 sigue
retirada y que la cascada entra en su lugar. Verificado contra red para `peru`,
`Peru`, `ECUADOR`, `japon`, `colombia` y `España`: los seis traen capital real,
población real del Banco Mundial, moneda con código y bandera SVG; los cinco
vecinos de Perú (Bolivia, Brasil, Chile, Colombia, Ecuador) salen de la caché; y
hacer clic en el vecino Ecuador actualiza la ficha a Quito.

Detalle del presupuesto de red: **11 URLs únicas en 18 llamadas** — los 2
descargones pesados (espejo + Banco Mundial) ocurren exactamente una vez, y las 16
búsquedas cuestan una petición ligera cada una.
