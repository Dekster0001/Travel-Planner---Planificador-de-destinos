/* ===========================================================================
   api.js — CASCADA DE FUENTES PÚBLICAS PARA BUSCAR CUALQUIER PAÍS
   RESPONSABILIDAD ÚNICA: hablar con la red y devolver SIEMPRE el mismo formato.
   No toca el DOM ni guarda estado de la interfaz.

   ¿POR QUÉ UNA CASCADA? REST Countries v3.1 fue RETIRADA: la URL sigue
   respondiendo HTTP 200 pero devuelve un sobre {success, data, errors} en vez de
   países, así que un .then(r => r.json()) ingenuo revienta. Vamos primero a la
   fuente del enunciado y, si falla por CUALQUIER motivo, caemos a un catálogo CDN
   con los 250 países. Todo público, sin API key.
   =========================================================================== */

(function () {
  'use strict';

  // === BLOQUE 1 · CONSTANTES Y CONFIGURACIÓN DE URLS ===

  // Campos exactos que le pedimos a la fuente primaria.
  const CAMPOS = 'name,capital,region,subregion,population,currencies,flags,borders,cca3,translations';
  const BASE = 'https://restcountries.com/v3.1/';                       // 1) fuente primaria
  const ESPEJO = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json'; // 2) 250 países con translations.spa
  const BANCO = 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1'; // 3) población real
  const FLAGCDN = 'https://flagcdn.com/';                              // 4) bandera SVG por cca2

  // El espejo NO trae población ni banderas: por eso existen las fuentes 3 y 4.
  // Comparación minúsculas y sin tildes, para que "peru" coincida con "Perú".
  const SIN = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // === BLOQUE 2 · NORMALIZADOR DE DATOS ===

  // Una sola función convierte CUALQUIER fuente al contrato de la app, por eso
  // app.js nunca necesita saber de dónde vino la ficha.
  // Recibe el país crudo y la población de respaldo; devuelve los 9 campos.
  function normalizarPais(item, poblacion) {
    const es = (item.translations && item.translations.spa) || {}; // traducción al español
    const nom = item.name || {};
    const claves = Object.keys(item.currencies || {});
    const cca2 = SIN(item.cca2);
    return {
      nombre: es.common || nom.common || 'Desconocido',
      oficial: es.official || nom.official || '',
      codigo: item.cca3 || '',
      capital: Array.isArray(item.capital) ? item.capital[0] : (item.capital || 'No registrada'),
      region: item.region || 'N/A', subregion: item.subregion || 'N/A',
      poblacion: item.population || poblacion || 0,          // primaria, o Banco Mundial, o 0
      moneda: claves.length ? claves[0] + ' (' + item.currencies[claves[0]].name + ')' : 'N/A',
      bandera: (item.flags && (item.flags.svg || item.flags.png)) || (cca2 ? FLAGCDN + cca2 + '.svg' : ''),
      fronteras: item.borders || []
    };
  }

  // === BLOQUE 3 · ESTRATEGIA EN CASCADA / FALLBACK ===

  // El espejo pesa 1.4 MB: lo descargamos UNA vez. Guardamos la PROMESA resuelta
  // (no los datos) para que dos búsquedas simultáneas no disparen dos descargas.
  let cache = null;

  function cargar() {
    if (!cache) cache = Promise.all([
      fetch(ESPEJO).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(BANCO).then((r) => (r.ok ? r.json() : [null, []])).catch(() => [null, []])
    ]).then(([paises, wb]) => ({
      paises: Array.isArray(paises) ? paises : [],
      // reduce convierte las filas del Banco Mundial en un diccionario { PER: 34576665 }.
      pob: (wb[1] || []).reduce((m, f) => { m[f.countryiso3code] = f.value; return m; }, {})
    }));
    return cache;
  }

  // Compara contra 4 nombres + 2 códigos, sin tildes ni mayúsculas. Exige igualdad;
  // si no, que alguna palabra EMPPIECE por lo buscado: "per" encuentra "Perú".
  const coincide = (x, q) => {
    const es = (x.translations && x.translations.spa) || {};
    return [x.name && x.name.common, x.name && x.name.official, es.common, es.official, x.cca3, x.cca2]
      .some((c) => { const s = SIN(c); return s === q || s.split(/[\s-]/).some((w) => w.indexOf(q) === 0); });
  };

  // === SUSTENTACIÓN: FALLBACK EN CASCADA ===
  // CONSULTA SECUNDARIA: la invoca el .catch() del BLOQUE 4. Busca en el catálogo
  // CDN completo y, si tampoco hay coincidencia, lanza el mensaje exacto del enunciado.
  function buscarEnEspejo(texto) {
    const q = SIN(texto.trim());
    return cargar().then((f) => {
      const item = f.paises.find((x) => coincide(x, q));
      if (!item) throw new Error('País no encontrado. Verifica el nombre ingresado.');
      return normalizarPais(item, f.pob[item.cca3]); // f.pob['PER'] -> población real
    });
  }

  // Países limítrofes: salen del MISMO dataset cacheado, cero peticiones extra.
  // El slice acota countries con fronteras muy largas.
  function buscarVecinos(codigos) {
    const lista = (codigos || []).slice(0, 12);
    if (!lista.length) return Promise.resolve([]);
    return cargar().then((f) => lista
      .map((c) => f.paises.find((x) => x.cca3 === c)).filter(Boolean)
      .map((x) => normalizarPais(x, f.pob[x.cca3])));
  }

  // === BLOQUE 4 · CONSULTA PRINCIPAL Y PROMESA ===

  // === SUSTENTACIÓN: FETCH Y PROMESA PENDIENTE ===
  // fetch() devuelve una PROMESA. No hay try/catch: el resultado viaja por .then()
  // y los errores por .catch(). Toda la función es esa cadena.
  function buscarPaisPorNombre(nombre) {
    const q = (nombre || '').trim();
    if (!q) return Promise.reject(new Error('Escribe el nombre de un país.'));

    return fetch(BASE + 'name/' + encodeURIComponent(q) + '?fields=' + CAMPOS)

      // === SUSTENTACIÓN: VALIDACIÓN HTTP Y ERROR 404 ===
      // !ok cubre 404, 500 y demás. r.json() nunca se ejecuta sobre un error,
      // porque el throw salta directo al .catch() del final.
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })

      .then((datos) => {
        // Aceptamos las dos formas de la v3.1: arreglo plano o sobre {data}.
        const lista = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.data) ? datos.data : []);
        if (!lista.length || !lista[0].name) throw new Error('respuesta no compatible');
        return normalizarPais(lista[0]); // la primaria trae población y bandera propias
      })

      // Un único .catch() atrapa los TRES fallos de golpe: HTTP 404/500, error de
      // red o CORS, y el sobre de deprecación. Si el espejo tampoco encuentra el
      // país, es él quien lanza el error exacto.
      .catch(() => buscarEnEspejo(q));
  }

  // === SUSTENTACIÓN: DOM SEGURO (CERO INNERHTML / XSS) ===
  // api.js no inserta nada en el DOM, así que no puede introducir XSS: devuelve
  // solo DATOS. Quien los pinte en pantalla los escribirá con textContent.
  window.ApiPaises = {
    buscarPaisPorNombre,
    buscarPais: buscarPaisPorNombre, // alias: la app y lectores de la versión previa
    buscarVecinos
  };
})();
