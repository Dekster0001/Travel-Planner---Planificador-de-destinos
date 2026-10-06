# Entrega de Proyecto — QuickSurvey

## 1. Información General
* **Curso:** Ingeniería Web 
* **Actividad:** Ejercicio integrador 3 — Travel Planner: Planificador de destinos

---

## 2. Integrantes del Equipo
| N° | Apellidos y Nombres         | Código de Estudiante        |

| 1  | CRISOSTOMO PALOMINO, YOLVY  | 75448767@continental.edu.pe |

| 2  | ORTIZ GIL, BREITNER         | 71976400@continental.edu.pe |

| 3  | SARAVIA CHÁVEZ, ARNY        | 74355027@continental.edu.pe |

---

## 3. Enlaces del Proyecto

* **Repositorio de GitHub (Código Fuente):**  
  `https://github.com/Dekster0001/Travel-Planner---Planificador-de-destinos.git`

* **Despliegue en Vivo (GitHub Pages):**  
  `https://dekster0001.github.io/Travel-Planner---Planificador-de-destinos/`

---

## 4. Estructura de Archivos del Repositorio

travel-planner/
│
├── index.html          # Marcado semántico HTML5, accesibilidad (ARIA) y puntos de montaje
├── README.md           # Documentación técnica de arquitectura y casos de prueba
├── css/
│   └── estilos.css     # Tema claro, variables CSS (:root) y diseño responsive (Grid/Flexbox)
└── js/
    ├── api.js          # Capa de red con Fetch, Promesas y arquitectura resiliente en cascada
    ├── presupuesto.js  # Lógica de negocio, estado inmutable y cálculos con .reduce()
    └── app.js          # Controlador principal, delegación de eventos y DOM seguro (cero innerHTML)