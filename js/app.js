/* ===========================================================================
   app.js — CONTROLADOR DE LA INTERFAZ
   RESPONSABILIDAD ÚNICA: traducir entre el DOM y los otros dos módulos.
   NO hace fetch directamente (delega en ApiPaises) y NO calcula (delega en
   PlanPresupuesto). Solo pinta, escucha eventos y coordina.
   =========================================================================== */

(function () {
  'use strict';

  // === BLOQUE 1 · SELECTORES Y UTILIDADES DOM ===

  // Caché de referencias al DOM: las llenamos una vez y evitamos repetir
  // document.getElementById() en cada render.
  const ui = {};
  let paisActual = null; // país en pantalla, necesario para "Agregar al plan"
  const dinero = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);

  // === SUSTENTACIÓN: DOM SEGURO (CERO INNERHTML / XSS) ===
  // ÚNICA fábrica de nodos del proyecto. El dato se escribe SIEMPRE con textContent,
  // que inserta texto plano y NUNCA interpreta marcado HTML. Con innerHTML, un país
  // llamado <img src=x onerror=alert(1)> se ejecutaría en el navegador del usuario; con
  // textContent se muestra literal. No hay una sola asignación a .innerHTML en el proyecto.
  const el = (tag, clase, texto) => {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined && texto !== null) nodo.textContent = texto;
    return nodo;
  };

  // Constructores de las piezas repetidas: ya devuelven el nodo con texto seguro.
  const dato = (t, v) => { const d = el('div', 'dato'); d.append(el('dt', null, t), el('dd', null, String(v))); return d; };
  const campo = (t, input) => { const c = el('div', 'campo'); c.append(el('label', null, t), input); return c; };

  // === BLOQUE 2 · GESTIÓN DE ESTADOS VISUALES ===

  // El HTML define 4 bloques (vacio, cargando, exito, error) y esta función deja
  // visible exactamente uno, ocultando los otros tres con el atributo hidden.
  function mostrar(estado) {
    ['vacio', 'cargando', 'exito', 'error'].forEach((e) => { ui[e].hidden = e !== estado; });
  }

  // === BLOQUE 3 · RENDERIZADO DEL PAÍS Y VECINOS ===

  function renderizarPais(p) {
    ui.titulo.textContent = p.nombre;
    ui.oficial.textContent = p.oficial;
    // Solo aceptamos banderas por http(s): bloqueamos rutas relativas o javascript:.
    ui.bandera.src = /^https?:\/\//i.test(p.bandera) ? p.bandera : '';
    ui.bandera.alt = 'Bandera de ' + p.nombre;
    // La API devuelve la población como NÚMERO crudo; formatear es tarea de la vista.
    const poblacion = p.poblacion ? dinero(p.poblacion) : 'Sin datos';
    ui.datos.replaceChildren(dato('Capital', p.capital), dato('Región', p.region), dato('Subregión', p.subregion),
      dato('Población', poblacion), dato('Moneda', p.moneda));
  }

  // Cada vecino es un <button type="button"> con data-texto = su nombre. NO lleva
  // listener propio: se resuelve por delegación en el BLOQUE 5, porque estos
  // botones se recrean en cada búsqueda.
  function renderizarVecinos(vecinos) {
    ui.vecinos.replaceChildren();
    if (!vecinos.length) return; // isla sin fronteras: no hay encabezado que mostrar
    ui.vecinos.append(el('h3', null, 'Países limítrofes'));
    vecinos.forEach((v) => {
      const boton = el('button', 'chip', v.nombre);
      boton.type = 'button';
      boton.dataset.texto = v.nombre;
      ui.vecinos.append(boton);
    });
  }

  // === BLOQUE 4 · GESTIÓN DEL PLAN Y EDICIÓN EN VIVO ===

  const numeroInput = (valor, etiqueta) => {
    const input = el('input', 'entrada');
    input.type = 'number'; input.min = '0.01'; input.value = valor;
    input.setAttribute('aria-label', etiqueta);
    return input;
  };

  function tarjeta(destino) {
    const li = el('li', 'item');
    const img = el('img', 'miniatura');
    img.src = destino.bandera;
    img.alt = ''; // decorativa: el nombre ya está en el texto contiguo
    const subtotal = el('strong', 'subtotal', dinero(destino.subtotal));

    // === SUSTENTACIÓN: EDICIÓN EN VIVO SIN PERDER FOCO ===
    // Error clásico: al teclear, si se redibuja la lista el input se destruye y se
    // recrea, el foco se pierde y el usuario escribe a medias. Solución: en 'input'
    // NO redibujamos nada; solo reescribimos el texto del subtotal y del resumen, así
    // el nodo del input nunca se toca y el foco y el cursor quedan intactos.
    const editar = (esDias) => (evento) => {
      const valor = Number(evento.target.value);
      // Dato inválido (vacío, 0, negativo, 'abc'): no tocamos el modelo.
      if (!Number.isFinite(valor) || valor <= 0 || (esDias && !Number.isInteger(valor))) return;
      const actual = window.PlanPresupuesto.obtenerDestinos().find((x) => x.codigo === destino.codigo);
      if (!actual) return; // releemos el modelo: cambiar días NO debe borrar el costo
      const act = esDias ? window.PlanPresupuesto.actualizarDestino(destino.codigo, valor, actual.costo)
        : window.PlanPresupuesto.actualizarDestino(destino.codigo, actual.dias, valor);
      subtotal.textContent = dinero(act.subtotal);
      renderizarResumen(); // <- CÁLCULO FUNCIONAL CON REDUCE, en acción
    };

    const inDias = numeroInput(destino.dias, 'Días');
    const inCosto = numeroInput(destino.costo, 'Costo diario');
    inDias.addEventListener('input', editar(true));
    inCosto.addEventListener('input', editar(false));

    const borrar = el('button', 'btn btn--peligro', 'Eliminar');
    borrar.type = 'button';
    borrar.addEventListener('click', () => {
      window.PlanPresupuesto.eliminarDestino(destino.codigo);
      renderizarPlan(); // aquí SÍ redibujamos: cambió la estructura de la lista
    });

    li.append(img, el('strong', 'nombre', destino.nombre), campo('Días', inDias), campo('Costo diario', inCosto), subtotal, borrar);
    return li;
  }

  // Reconstruye la lista COMPLETA. Solo se llama al agregar o al eliminar.
  function renderizarPlan() {
    const lista = window.PlanPresupuesto.obtenerDestinos();
    ui.plan.replaceChildren(...lista.map(tarjeta));
    ui.planVacio.hidden = lista.length > 0;   // mensaje de "plan vacío"
    ui.vaciar.disabled = lista.length === 0;  // el botón se deshabilita sin destinos
    renderizarResumen();
  }

  // Acepta un total opcional: si no se le pasa nada, lo recalcula desde el modelo.
  function renderizarResumen(totales) {
    const r = totales || window.PlanPresupuesto.calcularTotales();
    ui.resumen.replaceChildren(dato('Destinos', r.cantidad), dato('Días totales', r.totalDias),
      dato('Costo total', dinero(r.totalCosto)), dato('Promedio diario', dinero(Math.round(r.promedioDiario))));
  }

  // === BLOQUE 5 · DISPARADORES Y CONTROLADOR DE EVENTOS ===

  // Flujo de una búsqueda: cargando -> exito | error
  function buscar(texto) {
    mostrar('cargando');
    return window.ApiPaises.buscarPaisPorNombre(texto)
      .then((pais) => {
        paisActual = pais;
        renderizarPais(pais);
        // Las fronteras salen del dataset ya cacheado, sin peticiones nuevas.
        return window.ApiPaises.buscarVecinos(pais.fronteras).then((v) => renderizarVecinos(v));
      })
      .then(() => mostrar('exito'))
      .catch((error) => {
        mostrar('error');
        ui.errorTxt.textContent = error.message; // texto plano, nunca innerHTML
      });
  }

  // === SUSTENTACIÓN: EVENTO SUBMIT Y PREVENTDEFAULT ===
  // addEventListener conecta un evento del navegador con una función callback: el
  // DOM la dispara y nosotros solo reaccionamos.
  document.addEventListener('DOMContentLoaded', () => {
    // Los scripts van con defer, así que el DOM ya existe cuando llega aquí.
    ['busqueda', 'entrada', 'vacio', 'cargando', 'exito', 'error', 'titulo', 'oficial', 'datos', 'bandera',
      'vecinos', 'plan', 'planVacio', 'vaciar', 'resumen', 'alta', 'dias', 'costo', 'errorTxt', 'aviso']
      .forEach((id) => { ui[id] = document.getElementById(id); });

    // e.preventDefault() cancela el envío por defecto, que recargaría la página y
    // perderíamos todo el estado. Después sí llamamos a la API.
    ui.busqueda.addEventListener('submit', (e) => { e.preventDefault(); buscar(ui.entrada.value); });

    // Delegación de eventos: un solo listener en el contenedor, no uno por botón.
    // Los chips se recrean en cada búsqueda; el listener vive en el padre y el clic
    // se localiza con closest().
    ui.vecinos.addEventListener('click', (e) => {
      const boton = e.target.closest('button[data-texto]');
      if (boton) { ui.entrada.value = boton.dataset.texto; buscar(boton.dataset.texto); }
    });

    ui.alta.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        if (!paisActual) throw new Error('Primero busca un país.');
        window.PlanPresupuesto.agregarDestino(paisActual, ui.dias.value, ui.costo.value);
        ui.aviso.textContent = paisActual.nombre + ' agregado al plan.';
        renderizarPlan();
      } catch (error) {
        ui.aviso.textContent = error.message; // los errores del modelo se muestran
      }
    });

    ui.vaciar.addEventListener('click', () => { window.PlanPresupuesto.limpiarPlan(); renderizarPlan(); });

    mostrar('vacio');  // estado inicial
    renderizarPlan();   // primer render del plan vacío
  });
})();
