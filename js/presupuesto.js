/* ===========================================================================
   presupuesto.js — MODELO DEL PLAN DE VIAJE
   RESPONSABILIDAD ÚNICA: guardar los destinos y hacer las cuentas.
   No toca el DOM ni hace peticiones: es lógica pura y comprobable.
   Dos principios explican todo: 1) ESTADO PRIVADO, 2) INMUTABILIDAD.
   =========================================================================== */

(function () {
  'use strict';

  // === BLOQUE 1 · ESTADO CENTRALIZADO ===

  // Única fuente de verdad. Al vivir en el closure no se puede leer ni escribir
  // desde la consola: la única forma de tocarla es llamar a las funciones públicas.
  let destinos = [];

  // Copia defensiva: el spread copia el arreglo y el Object.assign cada objeto,
  // así quien llama puede leer sin poder corromper el estado real.
  const obtenerDestinos = () => [...destinos].map((x) => Object.assign({}, x));
  const limpiarPlan = () => { destinos = []; };

  // === BLOQUE 2 · MUTACIONES DEL PLAN ===

  // Un <input type="number"> entrega TEXTO: convertimos y validamos. Rechaza 0,
  // negativos, 'abc' y NaN con un mensaje que la UI puede mostrar tal cual.
  const numero = (v, etiqueta) => {
    const n = Number(String(v).trim());
    if (!Number.isFinite(n) || n <= 0) throw new Error(etiqueta + ' debe ser un número mayor que 0.');
    return n;
  };

  function agregarDestino(pais, dias, presupuestoDiario) {
    const d = numero(dias, 'Los días');
    const c = numero(presupuestoDiario, 'El costo diario');
    // La clave es `codigo` (el cca3), NO el índice: así el orden es irrelevante
    // y no puede haber duplicados.
    if (destinos.some((x) => x.codigo === pais.codigo)) throw new Error(pais.nombre + ' ya está en tu plan.');
    const nuevo = { codigo: pais.codigo, nombre: pais.nombre, bandera: pais.bandera, dias: d, costo: c, subtotal: d * c };
    // .concat() NO muta: devuelve un arreglo nuevo. Con push, el modelo dependería
    // del orden en que se llamen las funciones.
    destinos = destinos.concat(nuevo);
    return nuevo;
  }

  // === SUSTENTACIÓN: ELIMINACIÓN INMUTABLE CON FILTER ===
  // .filter() tampoco muta: arma un arreglo solo con los que NO coinciden y deja
  // el estado anterior intacto. El retorno booleano avisa si se borró algo de verdad.
  function eliminarDestino(codigoPais) {
    const antes = destinos.length;
    destinos = destinos.filter((x) => x.codigo !== codigoPais);
    return destinos.length !== antes;
  }

  // Edita días y costo, y recalcula el subtotal. .map() reconstruye SOLO el
  // elemento afectado y reutiliza los demás tal cual.
  function actualizarDestino(codigoPais, nuevosDias, nuevoCosto) {
    const dias = numero(nuevosDias, 'Los días');
    const costo = numero(nuevoCosto, 'El costo diario');
    let salida = null;
    destinos = destinos.map((x) => {
      if (x.codigo !== codigoPais) return x;
      return salida = Object.assign({}, x, { dias, costo, subtotal: dias * costo });
    });
    return salida; // null si ese código no estaba en el plan
  }

  // === BLOQUE 3 · CÁLCULOS MATEMÁTICOS CON REDUCE ===

  // === SUSTENTACIÓN: CÁLCULO FUNCIONAL CON REDUCE ===
  // reduce recibe (acumulador, elemento) y devuelve el acumulador del paso
  // siguiente. El 2.º argumento es el VALOR INICIAL: sin él, un arreglo vacío
  // lanzaría TypeError. El promedio va fuera del reduce, porque solo se conoce
  // cuando ya terminó el recorrido.
  function calcularTotales() {
    const t = destinos.reduce((acc, x) => ({ cantidad: acc.cantidad + 1, totalDias: acc.totalDias + x.dias,
      totalCosto: acc.totalCosto + x.subtotal }), { cantidad: 0, totalDias: 0, totalCosto: 0 });
    t.promedioDiario = t.totalDias > 0 ? t.totalCosto / t.totalDias : 0;
    return t;
  }

  // ---- API pública del módulo: un solo objeto global ----
  window.PlanPresupuesto = {
    agregarDestino, eliminarDestino, actualizarDestino,
    calcularTotales, obtenerDestinos, limpiarPlan
  };
})();
