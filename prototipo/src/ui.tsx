import { ReactNode, useEffect, useState } from "react";

export const dec = (x: number, d = 1) => x.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "—" : `${dec(x * 100, d)} %`);
export const pp = (x: number) => `${x >= 0 ? "+" : "−"}${dec(Math.abs(x * 100))} p.p.`;
export const fmt = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? "—" : x.toLocaleString("es-CO", { maximumFractionDigits: d, minimumFractionDigits: d }));
export const cop = (x: number) => x.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
export const copMillones = (x: number) => x >= 1e6 ? `$ ${(x / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 0 })} millones` : cop(x);

export function Card({ title, sub, right, children, id }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      {(title || right) && (
        <div className="card-head">
          <div>{title && <h2>{title}</h2>}{sub && <p className="sub">{sub}</p>}</div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, na, testid }: { label: string; value: ReactNode; hint?: ReactNode; na?: boolean; testid?: string }) {
  return (
    <div className="card kpi" data-testid={testid}>
      <p className="lbl">{label}</p>
      <div className={"val" + (na ? " na" : "")}>{value}</div>
      {hint && <p className="sub">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty" role="status" data-testid="estado-vacio">{children}</div>;
}

export function DemoBadge({ children = "Datos ficticios de demostración" }: { children?: ReactNode }) {
  return <span className="demo-badge" role="note"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6 3.2v3.4M6 8.2v.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>{children}</span>;
}

export function Tip({ active, payload, label, render }: { active?: boolean; payload?: { payload: Record<string, unknown> }[]; label?: string; render: (p: Record<string, unknown>, label?: string) => ReactNode }) {
  if (!active || !payload?.length) return null;
  return <div className="tooltip">{render(payload[0].payload, label)}</div>;
}

export function useToast(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  return [msg, setMsg];
}

export async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

export function aCsv(filas: Record<string, unknown>[]): string {
  if (!filas.length) return "";
  const cols = Object.keys(filas[0]);
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...filas.map(f => cols.map(c => esc(f[c])).join(","))].join("\n");
}

export function leer<T>(k: string, def: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : def; } catch { return def; }
}
export function guardar(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* almacenamiento no disponible: se mantiene en memoria */ }
}

// ---------- Ayuda contextual y glosario ----------
export const GLOSARIO: Record<string, string> = {
  "p.p.": "Puntos porcentuales: diferencia directa entre dos porcentajes. Si un grupo tiene 43,7 % y el promedio es 30,9 %, la diferencia es +12,8 p.p.",
  "Rotación temprana": "Renuncia voluntaria dentro de los primeros 180 días desde el ingreso. Los despidos no cuentan como renuncia.",
  "Cohorte": "Grupo de personas que ingresaron en el mismo mes.",
  "Ventana completa": "La cohorte ya cumplió 180 días a la fecha de corte, así que se sabe con certeza quién renunció en ese plazo. Las cohortes más recientes no entran en las tasas.",
  "Mes crítico": "Mes de antigüedad (1 a 6) en el que se concentran más renuncias tempranas.",
  "Mínimo por grupo": "Cantidad mínima de personas que debe tener un grupo para compararlo. Con menos personas, una tasa alta o baja puede deberse al azar.",
  "Recall": "Porcentaje de las personas que sí renunciaron pronto sobre las que la herramienta habría alertado.",
  "Precisión": "De las alertas emitidas, porcentaje que correspondió a renuncias reales.",
  "Equidad": "Revisión que comprueba que la herramienta no se equivoca más con un grupo (por ejemplo, por sexo o edad) que con otro. Criterio propuesto: diferencia de 10 p.p. o menos.",
  "Plan B": "Reglas de alerta simples basadas en el diagnóstico. Se usan cuando el modelo no cumple los criterios de desempeño o de equidad (CU-09, flujo A1).",
  "DoD": "Definition of Done (definición de terminado): condiciones que una historia debe cumplir para contar como aceptada, incluida la revisión por otro integrante.",
  "Burndown": "Gráfico del trabajo pendiente (puntos de historia) a lo largo del sprint, comparado con una línea ideal.",
  "DORA": "Cuatro métricas de entrega de software (DevOps Research and Assessment): frecuencia de despliegue, tiempo de entrega, tasa de fallos y tiempo de recuperación.",
  "UAT": "User Acceptance Testing: prueba de aceptación en la que el cliente verifica los criterios de cada historia.",
  "HU / CU / RF / RNF": "Historia de usuario, caso de uso, requisito funcional y requisito no funcional del documento técnico.",
  "ETL": "Extracción, transformación y carga: proceso que limpia y une los datos antes de analizarlos.",
  "Costo supuesto": "Valor estimado de reemplazar a una persona (reclutamiento, formación y tiempo improductivo). Es un supuesto del equipo hasta que el cliente lo valide; no es un costo contable real.",
  "Escenario hipotético": "Resultado de aplicar una meta elegida por el usuario a la población actual. Sirve para dimensionar, no predice lo que ocurrirá ni garantiza ahorros.",
};

let ayudaId = 0;
export function Ayuda({ t, children }: { t: string; children?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [id] = useState(() => "ayuda-" + ++ayudaId);
  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    const c = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.("#" + id + "-w")) setAbierto(false); };
    window.addEventListener("keydown", k); window.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("mousedown", c); };
  }, [abierto, id]);
  return (
    <span className="ayuda" id={id + "-w"}>
      {children}
      <button type="button" className="ayuda-btn" aria-expanded={abierto} aria-controls={id} aria-label={`Qué significa «${t}»`} onClick={() => setAbierto(v => !v)} data-testid={"ayuda-" + t.replace(/[^a-zA-Z]/g, "").toLowerCase()}>?</button>
      {abierto && <span className="ayuda-pop" role="tooltip" id={id}><b>{t}.</b> {GLOSARIO[t] ?? ""}</span>}
    </span>
  );
}

export function Seccion({ tipo }: { tipo: "descriptivo" | "estadistico" | "recomendacion" | "simulado" }) {
  const m = { descriptivo: ["Dato descriptivo", "neutral"], estadistico: ["Conclusión estadística", "info"], recomendacion: ["Recomendación (hipótesis)", "warn"], simulado: ["Datos simulados", "demo"] }[tipo];
  return <span className={"pill " + m[1]}>{m[0]}</span>;
}
