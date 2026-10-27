import hechosJson from "./data/hechos.json";
import modeloJson from "./data/modelo.json";
import calidadJson from "./data/calidad.json";
import jiraJson from "./data/jira.json";
import pruebasJson from "./data/resultados_pruebas.json";
import costosJson from "./data/costos.json";
import { decodificar, Hechos, Coef, Registro } from "./calc";

export const HECHOS = hechosJson as unknown as Hechos;
export const FILAS = decodificar(HECHOS);
export const DIC = HECHOS.diccionarios;
export const COHORTES_VENTANA = [...new Set(FILAS.filter(f => f.ventana).map(f => f.cohorte))].sort();
export const CAMPANAS = DIC.campana;
export const SUPERVISORES = DIC.id_supervisor;
export const SUP_CAMPANA: Record<string, string> = {};
for (const f of FILAS) SUP_CAMPANA[f.supervisor] = f.campana;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODELO = modeloJson as any;
export const COEFS = MODELO.coeficientes as Coef[];
export const COSTOS_SIM = costosJson as { reclutamiento: number; formacion: number; improductivo: number; fuente: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CALIDAD = calidadJson as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PRUEBAS = pruebasJson as any;
export interface IssueJira { key: string; type: string; status: string; summary: string; sprint: string[]; catchg: string | null; created: string }
export const JIRA = jiraJson as IssueJira[];

export const OPCIONES = {
  campana: CAMPANAS, turno: ["Mañana", "Tarde", "Noche", "Rotativo"],
  educacion: ["Bachiller", "Técnico", "Tecnólogo", "Profesional"], canal: ["Referido", "Portal de empleo", "Redes sociales", "Feria"],
};

// ---------- Cronograma oficial (documento técnico, sección 15.2) ----------
export interface ItemSprint { id: string; nombre: string; puntos: number; jira?: string; nota?: string }
export interface Sprint { id: string; nombre: string; inicio: string; fin: string; objetivo: string; puntos: number | null; items: ItemSprint[] }
export const SPRINTS: Sprint[] = [
  { id: "S0", nombre: "Sprint 0", inicio: "2026-09-21", fin: "2026-10-05", objetivo: "Estrategia validada por el cliente", puntos: null,
    items: [] },
  { id: "S1", nombre: "Sprint 1", inicio: "2026-10-06", fin: "2026-10-19", objetivo: "Datos confiables y panorama", puntos: 22,
    items: [{ id: "HU-01", nombre: "Información unificada y confiable", puntos: 8, jira: "SCRUM-6" }, { id: "HU-02", nombre: "Definición única de renuncia temprana", puntos: 3, jira: "SCRUM-7" },
      { id: "HU-03", nombre: "Evolución de la rotación temprana", puntos: 5, jira: "SCRUM-8" }, { id: "HU-04", nombre: "Mes crítico de renuncia", puntos: 3, jira: "SCRUM-53" },
      { id: "HU-06", nombre: "Filtrar el dashboard", puntos: 3, jira: "SCRUM-22" }] },
  { id: "S2", nombre: "Sprint 2", inicio: "2026-10-20", fin: "2026-11-02", objetivo: "Causas y recomendaciones", puntos: 21,
    items: [{ id: "HU-07", nombre: "Retención por supervisor", puntos: 3, jira: "SCRUM-10" }, { id: "HU-08", nombre: "Pruebas técnicas y permanencia", puntos: 3, jira: "SCRUM-9" },
      { id: "HU-09", nombre: "Perfiles con mayor rotación", puntos: 5, jira: "SCRUM-47" }, { id: "HU-11", nombre: "Resumen de causas y recomendaciones", puntos: 5, jira: "SCRUM-23" },
      { id: "DS", nombre: "Dataset del modelo", puntos: 5, jira: "SCRUM-54", nota: "Puntos derivados: 21 del sprint − 16 de las historias. Ítem creado en Jira el 27-oct." }] },
  { id: "S3", nombre: "Sprint 3", inicio: "2026-11-03", fin: "2026-11-16", objetivo: "Semáforo justo y explicable, demo final", puntos: 26,
    items: [{ id: "HU-12", nombre: "Semáforo de riesgo del candidato", puntos: 8, jira: "SCRUM-21" }, { id: "HU-13", nombre: "Explicación del riesgo", puntos: 5, jira: "SCRUM-52" },
      { id: "HU-14", nombre: "Confiabilidad de la herramienta", puntos: 5, jira: "SCRUM-49" }, { id: "HU-15", nombre: "Herramienta no discriminatoria", puntos: 5, jira: "SCRUM-50" },
      { id: "HU-16", nombre: "Protección de datos personales", puntos: 3, jira: "SCRUM-51" }] },
];
export const BACKLOG_CONDICIONADO: ItemSprint[] = [
  { id: "HU-05", nombre: "Costo de la rotación temprana", puntos: 3, jira: "SCRUM-46", nota: "Implementada con costos simulados; supuestos por validar (S-14)." },
  { id: "HU-10", nombre: "Motivos declarados de renuncia", puntos: 3, jira: "SCRUM-48", nota: "Implementada con encuesta de salida simulada (S-15)." },
];
export const PROYECTO = { inicio: "2026-10-06", fin: "2026-11-16", puntos: 69 };

// Registros reales iniciales, tomados del tablero Jira (proyecto SCRUM) el 27-oct-2026.
// Hasta el 27-oct ninguna historia había cambiado de estado; ese día se actualizó el tablero:
// Sprint 1 (22 pts) y Sprint 2 (21 pts) quedaron en Finalizado. El Sprint 1 se cerró en Jira el 27-oct,
// 8 días después de su fecha de fin, por eso su burndown termina el 19-oct con 22 puntos pendientes.
const F0 = "Jira: ninguna historia en Finalizado (sin cambios de estado)";
const F1 = "Jira 27-oct-2026: historias en Finalizado tras actualizar el tablero";
export const REGISTROS_INICIALES: Record<string, Registro[]> = {
  S1: [{ fecha: "2026-10-06", aceptados: 0, fuente: F0 }, { fecha: "2026-10-19", aceptados: 0, fuente: F0 + " al cierre programado" }],
  S2: [{ fecha: "2026-10-20", aceptados: 0, fuente: F0 }, { fecha: "2026-10-26", aceptados: 0, fuente: F0 }, { fecha: "2026-10-27", aceptados: 21, fuente: F1 }],
  S3: [],
  P: [{ fecha: "2026-10-06", aceptados: 0, fuente: F0 }, { fecha: "2026-10-19", aceptados: 0, fuente: F0 }, { fecha: "2026-10-26", aceptados: 0, fuente: F0 }, { fecha: "2026-10-27", aceptados: 43, fuente: F1 + " (S1: 22 + S2: 21)" }],
};
export const FECHA_CONSULTA_JIRA = "2026-10-27";
// Puntos en Finalizado a la fecha de consulta, aunque se hayan aceptado después del cierre del sprint
export const ACEPTADOS_JIRA: Record<string, number> = { S1: 22, S2: 21, S3: 0 };

// Cambios aplicados en Jira el 27-oct-2026 para alinear el tablero con el documento técnico
export const CAMBIOS_JIRA = [
  "Se cargaron los puntos de historia de las 16 historias (69 comprometidos + 6 condicionados).",
  "Sprint 0 cerrado; sus 7 tareas abiertas se movieron a Finalizado (entregables consolidados en el documento técnico v1.0).",
  "Sprint 1 iniciado con fechas 6 a 19-oct y cerrado el 27-oct con 22 de 22 puntos en Finalizado.",
  "Sprint 2 iniciado con fechas 20-oct a 2-nov; sus 21 puntos están en Finalizado y el sprint sigue activo hasta la Sprint Review.",
  "HU-06 pasó al Sprint 1; HU-15 y HU-16 pasaron del «Sprint 4» al Sprint 3; HU-05 y HU-10 pasaron al backlog condicionado.",
  "Se creó SCRUM-54 «Dataset del modelo» (5 pts) en el Sprint 2.",
  "Sprint 3: HU-12 a HU-16 en revisión. El semáforo oficial es el plan B, que cumple la revisión de equidad; falta la validación del cliente.",
  "HU-05 y HU-10 en revisión con costos y encuesta de salida simulados (sección 4.2); siguen en el backlog condicionado.",
];
export const DISCREPANCIAS = [
  "El Sprint 1 se cerró en Jira 8 días después de su fecha de fin: sus 22 puntos se aceptaron el 27-oct, no dentro del sprint.",
  "El «SCRUM Sprint 4» quedó vacío; no existe en el cronograma oficial y puede eliminarse desde el tablero.",
  "SCRUM-11 sigue en Finalizado como duplicado de SCRUM-21; no suma puntos.",
  "HU-12 (SCRUM-21) menciona «supervisor asignado» como entrada; el documento técnico lo excluye por fuga de información.",
];
