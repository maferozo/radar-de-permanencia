import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { burndown, estadoBurndown, Registro, dora, EventoDora, estadisticos, ampliar, filtrar, kpis, porCohorte, porMesAntiguedad, porGrupo, factores, evaluar, TODOS, Candidato } from "../calc";
import { SPRINTS, BACKLOG_CONDICIONADO, PROYECTO, REGISTROS_INICIALES, DISCREPANCIAS, CAMBIOS_JIRA, ACEPTADOS_JIRA, JIRA, FECHA_CONSULTA_JIRA, PRUEBAS, CALIDAD, FILAS, COEFS, MODELO, OPCIONES, COHORTES_VENTANA } from "../data";
import { Card, Tip, fmt, leer, guardar, copiar, aCsv, useToast, Ayuda } from "../ui";
import { TRAZABILIDAD } from "../trazabilidad";

type Tab = "burndown" | "dora" | "rendimiento" | "pruebas" | "calidad" | "trazabilidad";
const TABS: [Tab, string][] = [["burndown", "Burndown"], ["dora", "Métricas DORA"], ["rendimiento", "Rendimiento"], ["pruebas", "Pruebas"], ["calidad", "Calidad de datos"], ["trazabilidad", "Trazabilidad"]];
const INTRO: Record<Tab, string> = {
  burndown: "¿Cuánto trabajo comprometido queda y va el equipo al ritmo planeado? Puntos de historia pendientes frente a una línea ideal.",
  dora: "¿Con qué frecuencia y estabilidad se entrega software al cliente? Cuatro métricas DORA; requieren despliegues reales registrados.",
  rendimiento: "¿Responde el sistema dentro de los tiempos objetivo? Mediciones reproducibles de filtros, semáforo y volumen de 50.000 registros.",
  pruebas: "¿Funciona lo construido según los casos de uso? Resultado de cada prueba automatizada, con su evidencia, y estado de las pruebas de aceptación del cliente.",
  calidad: "¿Los datos son confiables? Reglas de calidad del proceso ETL, registros afectados y qué se hizo con ellos.",
  trazabilidad: "¿Cada requisito tiene una funcionalidad y una prueba? Relación requisito → historia → caso de uso → funcionalidad → prueba → estado.",
};

export default function Seguimiento() {
  const [tab, setTab] = useState<Tab>("burndown");
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Secciones del seguimiento">{TABS.map(([id, n]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={"tab-" + id}>{n}</button>)}</div>
      <p className="intro" data-testid="intro-tab">{INTRO[tab]}</p>
      {tab === "burndown" && <Burndown />}
      {tab === "dora" && <Dora />}
      {tab === "rendimiento" && <Rendimiento />}
      {tab === "pruebas" && <Pruebas />}
      {tab === "calidad" && <Calidad />}
      {tab === "trazabilidad" && <Trazabilidad />}
    </>
  );
}

// ---------------------------------------------------------------- Burndown
const HOY = FECHA_CONSULTA_JIRA;
const VARIACION: Record<string, string> = {
  S1: "El tablero no se actualizó durante el sprint: la línea real queda plana en 22 hasta el 19-oct. Las 5 historias pasaron a Finalizado el 27-oct, 8 días después del cierre, por eso el sprint figura atrasado dentro de sus fechas. No hay registros diarios.",
  S2: "Hasta el 26-oct no había historias en Finalizado; el 27-oct se aceptaron los 21 puntos de una vez. El sprint aparece adelantado frente a la ideal, pero el avance se concentró en un solo día y no hay registros diarios intermedios.",
  S3: "El sprint inicia el 3-nov: solo se muestra la línea ideal. Sus 26 puntos están en revisión en Jira y no se descuentan hasta cumplir la DoD y la validación del cliente.",
  P: "Al 27-oct se aceptaron 43 de 69 puntos (Sprints 1 y 2). El avance se registró en un solo día, por lo que la línea real tiene pocos puntos. Los 26 del Sprint 3 siguen pendientes.",
};
function Burndown() {
  const [sel, setSel] = useState("P");
  const [regs, setRegs] = useState<Record<string, Registro[]>>(() => leer("radar.burndown.v3", REGISTROS_INICIALES));
  const [toast, setToast] = useToast();
  const [csv, setCsv] = useState<string | null>(null);
  const actualizar = (r: Record<string, Registro[]>) => { setRegs(r); guardar("radar.burndown.v3", r); };
  const sp = sel === "P" ? { nombre: "Proyecto (Sprints 1 a 3)", inicio: PROYECTO.inicio, fin: PROYECTO.fin, puntos: PROYECTO.puntos, items: SPRINTS.slice(1).flatMap(s => s.items) } : SPRINTS.find(s => s.id === sel)!;
  const comprometidos = sp.puntos ?? 0;
  const serie = useMemo(() => burndown(sp.inicio, sp.fin, comprometidos, regs[sel] ?? []), [sp, comprometidos, regs, sel]);
  const est = estadoBurndown(serie);
  const ultimo = [...(regs[sel] ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
  const aceptados = ultimo?.aceptados ?? null;
  const errores = (regs[sel] ?? []).map(r => r.aceptados < 0 || r.aceptados > comprometidos ? `El registro del ${r.fecha} tiene ${r.aceptados} puntos; debe estar entre 0 y ${comprometidos}.` : r.fecha < sp.inicio || r.fecha > sp.fin ? `La fecha ${r.fecha || "(vacía)"} está fuera del período ${sp.inicio} a ${sp.fin}.` : null).filter(Boolean) as string[];
  const editar = (i: number, campo: keyof Registro, v: string) => { const l = [...(regs[sel] ?? [])]; l[i] = { ...l[i], [campo]: campo === "aceptados" ? Number(v) : v }; actualizar({ ...regs, [sel]: l }); };

  const resumen = SPRINTS.slice(1).map(s => {
    const r = [...(regs[s.id] ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    const ser = burndown(s.inicio, s.fin, s.puntos!, regs[s.id] ?? []);
    const pIdeal = r ? ser.find(x => x.fecha === r.fecha)?.ideal : undefined;
    return { id: s.id, sprint: s.nombre, fechas: `${s.inicio} a ${s.fin}`, planificados: s.puntos!, completados: r ? r.aceptados : null, pendientes: r ? s.puntos! - r.aceptados : null, variacion: r && pIdeal !== undefined ? r.aceptados - (s.puntos! - pIdeal) : null, corte: r?.fecha ?? null };
  });
  const copiarCsv = async () => { const t = aCsv(Object.entries(regs).flatMap(([s, l]) => l.map(r => ({ sprint: s, ...r })))); if (await copiar(t)) setToast("Registros copiados como CSV"); else setCsv(t); };
  const tieneReal = serie.some(p => p.real !== null);

  return (
    <>
      <div className="filters">
        <div className="field"><label htmlFor="b-sel">Gráfico</label>
          <select id="b-sel" value={sel} onChange={e => setSel(e.target.value)} data-testid="burndown-sel">
            <option value="P">Proyecto (Sprints 1–3, 69 pts)</option>
            {SPRINTS.slice(1).map(s => <option key={s.id} value={s.id}>{s.nombre} ({s.puntos} pts)</option>)}
          </select></div>
        <span className="sub">Sprint 0 (21-sep a 5-oct) no tiene puntos de historia: fue de descubrimiento y planeación. Backlog condicionado (HU-05, HU-10: 6 pts) excluido de los compromisos.</span>
      </div>

      <div className="grid kpis">
        <div className="card kpi"><p className="lbl">Comprometidos</p><div className="val">{comprometidos}</div><p className="sub">{sp.inicio} → {sp.fin}</p></div>
        <div className="card kpi"><p className="lbl">Aceptados (DoD) <Ayuda t="DoD" /></p><div className="val" data-testid="b-aceptados">{aceptados ?? "—"}</div><p className="sub">{ultimo ? `Último registro: ${ultimo.fecha}` : "Sin registros"}</p></div>
        <div className="card kpi"><p className="lbl">Restantes</p><div className="val" data-testid="b-restantes">{aceptados === null ? "—" : comprometidos - aceptados}</div><p className="sub">Comprometidos − aceptados</p></div>
        <div className="card kpi"><p className="lbl">Fecha de corte</p><div className="val" style={{ fontSize: "1.1rem" }}>{FECHA_CONSULTA_JIRA}</div><p className="sub">Consulta del tablero Jira (proyecto SCRUM)</p></div>
        <div className="card kpi"><p className="lbl">Estado</p><div className="val" style={{ fontSize: "1.1rem" }}><span className={"pill " + (est.estado === "atrasado" ? "crit" : est.estado === "sin datos" ? "neutral" : "good")} data-testid="b-estado">{est.estado}</span></div><p className="sub">{est.detalle}</p></div>
      </div>

      <Card title={`Burndown · ${sp.nombre}`} sub={`Eje horizontal: días hábiles del ${sp.inicio} al ${sp.fin}. Eje vertical: puntos de historia pendientes. La línea ideal baja de ${comprometidos} a 0 en partes iguales por día hábil.`}>
        <div className="chart" style={{ height: 320 }} data-testid="graf-burndown">
          <ResponsiveContainer>
            <LineChart data={serie} margin={{ top: 16, right: 18, bottom: 4, left: -12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="fecha" tickFormatter={d => d.slice(5)} minTickGap={16} />
              <YAxis domain={[0, comprometidos]} allowDecimals={false} width={44} />
              <Tooltip content={<Tip render={p => <><div><b>{String(p.fecha)}</b></div><div>Ideal: <b>{Number(p.ideal).toFixed(1)}</b> pts</div><div>Real: <b>{p.real === null ? "sin registro" : String(p.real)}</b>{p.real !== null && " pts"}</div></>} />} />
              {HOY >= sp.inicio && HOY <= sp.fin && <ReferenceLine x={serie.find(x => x.fecha >= HOY)?.fecha} stroke="var(--fg-3)" strokeDasharray="2 3" label={{ value: "Consulta Jira 27-oct", position: "insideTopLeft", fill: "var(--fg-2)", fontSize: 11 }} />}
              <Line dataKey="ideal" name="Ideal" stroke="var(--ideal)" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
              {tieneReal && <Line dataKey="real" name="Real" stroke="var(--s2)" strokeWidth={2} connectNulls dot={{ r: 4, fill: "var(--s2)", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="legend"><span><i className="sw" style={{ background: "var(--ideal)" }} />Línea ideal (de {comprometidos} a 0)</span>{tieneReal && <span><i className="sw" style={{ background: "var(--s2)" }} />Trabajo restante real (solo fechas con registro)</span>}</div>
        <div className="grid two" style={{ gap: 10 }}>
          <div className="note" data-testid="criterios-estado"><b>Criterios del estado.</b> Se compara el último registro real con la línea ideal de ese día. <b>Al día:</b> diferencia de 1 punto o menos. <b>Atrasado:</b> quedan más de 1 punto por encima de la ideal. <b>Adelantado:</b> quedan más de 1 punto por debajo. Restantes = comprometidos − aceptados; solo cuentan historias que cumplen la DoD y fueron revisadas por otro integrante («En curso» y «En revisión» no se descuentan).</div>
          <div className="note warn" data-testid="variaciones"><b>Variaciones e información faltante.</b> {VARIACION[sel]}</div>
        </div>
      </Card>

      <Card title="Registro de avance real" sub="Puntos aceptados acumulados por fecha. Los cambios se guardan solo en este navegador."
        right={<div className="row"><button className="btn" onClick={() => actualizar({ ...regs, [sel]: [...(regs[sel] ?? []), { fecha: (regs[sel] ?? []).length ? HOY > sp.fin ? sp.fin : HOY : sp.inicio, aceptados: aceptados ?? 0, fuente: "Registro manual" }] })} data-testid="b-agregar">Agregar registro</button>
          <button className="btn" onClick={() => { actualizar({ ...regs, [sel]: REGISTROS_INICIALES[sel] }); setToast("Se restauraron los registros tomados de Jira"); }}>Restaurar datos de Jira</button><button className="btn" onClick={copiarCsv}>Copiar CSV</button></div>}>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Fecha</th><th>Puntos aceptados (acumulado)</th><th>Fuente</th><th></th></tr></thead>
          <tbody>
            {(regs[sel] ?? []).length === 0 && <tr><td colSpan={4} className="sub">Sin registros. El sprint aún no inicia o no hay datos de avance; solo se muestra la línea ideal.</td></tr>}
            {(regs[sel] ?? []).map((r, i) => (
              <tr key={i}>
                <td><input type="date" value={r.fecha} min={sp.inicio} max={sp.fin} onChange={e => editar(i, "fecha", e.target.value)} aria-label="Fecha" /></td>
                <td><input type="number" min={0} max={comprometidos} value={r.aceptados} onChange={e => editar(i, "aceptados", e.target.value)} aria-label="Puntos aceptados" data-testid={"b-pts-" + i} style={{ width: 90 }} /></td>
                <td><input type="text" value={r.fuente} onChange={e => editar(i, "fuente", e.target.value)} aria-label="Fuente" style={{ width: "100%", minWidth: 220 }} /></td>
                <td><button className="btn" onClick={() => { actualizar({ ...regs, [sel]: (regs[sel] ?? []).filter((_, j) => j !== i) }); setToast("Registro quitado. Use «Restaurar datos de Jira» para recuperarlo."); }}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {errores.map(e => <p className="err" role="alert" key={e}>{e}</p>)}
        {csv && <textarea readOnly value={csv} rows={5} style={{ width: "100%" }} aria-label="CSV" />}
      </Card>

      <Card title="Planificado frente a completado" sub="Variación = puntos aceptados − puntos que la línea ideal esperaba a la fecha del último registro">
          <div className="tbl-wrap"><table data-testid="tabla-sprints">
            <thead><tr><th>Sprint</th><th>Fechas</th><th className="r">Planif.</th><th className="r">Complet. (último registro)</th><th className="r">Pend.</th><th className="r">Variación</th><th className="r">Finalizado en Jira hoy</th></tr></thead>
            <tbody>
              {resumen.map(r => <tr key={r.sprint}><td>{r.sprint}</td><td className="num">{r.fechas}</td><td className="r">{r.planificados}</td><td className="r">{r.completados ?? "—"}</td><td className="r">{r.pendientes ?? "—"}</td><td className="r">{r.variacion === null ? "—" : `${r.variacion > 0 ? "+" : ""}${r.variacion.toFixed(1).replace(".", ",")}`}</td><td className="r">{ACEPTADOS_JIRA[r.id]}</td></tr>)}
              <tr><td>Backlog condicionado</td><td>—</td><td className="r">6</td><td colSpan={4} className="sub">No comprometido (HU-05, HU-10)</td></tr>
            </tbody>
          </table></div>
      </Card>
      <div className="grid two">
        <Card title="Historias del período y estado en Jira" sub={`Consulta del tablero SCRUM: ${FECHA_CONSULTA_JIRA}`}>
          <div className="tbl-wrap"><table>
            <thead><tr><th>HU</th><th>Historia</th><th className="r">Pts</th><th>Jira</th><th>Estado</th></tr></thead>
            <tbody>{[...sp.items, ...(sel === "P" ? BACKLOG_CONDICIONADO : [])].map(it => { const j = JIRA.find(x => x.key === it.jira); return <tr key={it.id}><td className="num">{it.id}</td><td>{it.nombre}{it.nota && <div className="sub">{it.nota}</div>}</td><td className="r">{it.puntos}</td><td className="num">{it.jira ?? "—"}</td><td><span className={"pill " + (j?.status === "Finalizado" ? "good" : j?.status === "En curso" || j?.status === "En revisión" ? "warn" : "neutral")}>{j?.status ?? "Sin ítem"}</span></td></tr>; })}</tbody>
          </table></div>
        </Card>
      </div>
      <div className="grid two">
        <Card title="Cambios aplicados en Jira (27-oct-2026)">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>{CAMBIOS_JIRA.map(d => <li key={d}>{d}</li>)}</ul>
        </Card>
        <Card title="Desviaciones y riesgos">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>{DISCREPANCIAS.map(d => <li key={d}>{d}</li>)}</ul>
          <div className="note warn">Lectura honesta del avance: el Sprint 1 no quemó puntos dentro de sus fechas (se aceptaron después del cierre). Al 27-oct el proyecto lleva 43 de 69 puntos en Finalizado; los 26 del Sprint 3 están en revisión y dependen de la validación del cliente en la demo. El modelo no se publicó (R-02 materializado); el plan B lo reemplaza.</div>
        </Card>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

// ---------------------------------------------------------------- DORA
const PERIODO = { inicio: "2026-09-21T00:00", fin: "2026-11-16T23:59" };
const EJEMPLO_DORA: EventoDora[] = [
  { id: "E1", cambio: "Ejemplo: filtros del panorama", inicioCambio: "2026-10-06T09:00", despliegue: "2026-10-08T17:00", exitoso: true, fallo: false, inicioIncidente: "", recuperacion: "" },
  { id: "E2", cambio: "Ejemplo: gráfico por supervisor", inicioCambio: "2026-10-13T09:00", despliegue: "2026-10-15T12:00", exitoso: true, fallo: true, inicioIncidente: "2026-10-15T13:00", recuperacion: "2026-10-15T16:30" },
  { id: "E3", cambio: "Ejemplo: semáforo", inicioCambio: "2026-10-20T08:00", despliegue: "2026-10-23T10:00", exitoso: true, fallo: false, inicioIncidente: "", recuperacion: "" },
];
function Dora() {
  const [ev, setEv] = useState<EventoDora[]>(() => leer("radar.dora.v1", []));
  const [toast, setToast] = useToast();
  const act = (l: EventoDora[]) => { setEv(l); guardar("radar.dora.v1", l); };
  const r = dora(ev, PERIODO.inicio, PERIODO.fin);
  const ej = dora(EJEMPLO_DORA, "2026-10-06T00:00", "2026-10-26T00:00");
  const sin = r.despliegues === 0 && !ev.some(e => e.despliegue);
  const estado = (v: number | null) => sin ? <span className="pill neutral">Sin despliegues medidos</span> : v === null ? <span className="pill warn">Datos insuficientes</span> : <span className="pill good">Medido</span>;
  const filas = [
    { m: "Frecuencia de despliegue", def: "Despliegues exitosos por período", f: "N.º de despliegues exitosos ÷ semanas observadas", v: r.frecuenciaSemanal, u: "despliegues/semana", fuente: "Registro de despliegues (tags o releases de GitHub, publicación de la versión)", interp: "Más frecuente = entregas más pequeñas y menos riesgo por cambio.", accion: "Definir qué cuenta como despliegue (p. ej., publicación de una versión del dashboard para el cliente) y registrar cada una." },
    { m: "Tiempo de entrega de cambios", def: "Desde el primer commit del cambio hasta su despliegue", f: "Promedio (fecha de despliegue − fecha del primer commit)", v: r.leadTimeHoras, u: "horas", fuente: "Historial de Git + registro de despliegues", interp: "Menor tiempo = el valor llega antes al cliente.", accion: "Vincular cada ítem de Jira con su rama o pull request para medir inicio y fin." },
    { m: "Tasa de fallos de cambios", def: "% de despliegues que requieren corrección, reversión o intervención urgente", f: "Despliegues con fallo atribuible ÷ total de despliegues × 100", v: r.tasaFallos, u: "%", fuente: "Registro de incidentes vinculado a cada despliegue", interp: "Menor = cambios más confiables.", accion: "Registrar como incidente toda corrección urgente posterior a una publicación." },
    { m: "Tiempo de recuperación ante fallos de despliegue", def: "Desde el inicio del incidente hasta la recuperación verificada", f: "Promedio (recuperación verificada − inicio del incidente)", v: r.mttrHoras, u: "horas", fuente: "Registro de incidentes con hora de inicio y de verificación", interp: "Menor = el equipo restablece el servicio más rápido.", accion: "Anotar la hora de detección y la de verificación de cada incidente." },
  ];
  const nuevo = (): EventoDora => ({ id: "R" + (ev.length + 1), cambio: "", inicioCambio: "", despliegue: "", exitoso: true, fallo: false, inicioIncidente: "", recuperacion: "" });
  const ed = (i: number, k: keyof EventoDora, v: string | boolean) => { const l = [...ev]; l[i] = { ...l[i], [k]: v }; act(l); };
  return (
    <>
      <div className="note">Hasta hoy el proyecto tiene un prototipo y entregas académicas, pero <b>no tiene un entorno productivo ni despliegues registrados</b> <Ayuda t="DORA" />. Las mediciones de la pestaña Rendimiento son tiempos de respuesta del navegador y no son métricas DORA. Por eso las cuatro métricas se reportan como «Sin despliegues medidos». Una entrega académica, un commit o un cambio de código no cuentan como despliegue; solo cuenta la publicación de una versión utilizable por el cliente en su entorno de uso.</div>
      <Card title="Resultados DORA del proyecto" sub={`Período observado: ${PERIODO.inicio.slice(0, 10)} a ${PERIODO.fin.slice(0, 10)} · calculado desde el registro de abajo`}>
        <div className="tbl-wrap"><table data-testid="tabla-dora">
          <thead><tr><th>Métrica</th><th>Definición</th><th>Fórmula</th><th>Período</th><th>Valor observado</th><th>Fuente de los datos</th><th>Fecha de medición</th><th>Estado</th><th>Interpretación y limitaciones</th><th>Acción de mejora</th></tr></thead>
          <tbody>{filas.map(f => <tr key={f.m}><td><b>{f.m}</b></td><td>{f.def}</td><td>{f.f}</td><td className="num">{PERIODO.inicio.slice(5, 10)} a {PERIODO.fin.slice(5, 10)}</td><td>{f.v === null ? <span className="sub">Sin datos disponibles</span> : <span className="num">{f.v.toFixed(1)} {f.u}</span>}</td><td>{f.fuente}</td><td className="num">{sin ? FECHA_CONSULTA_JIRA : new Date().toISOString().slice(0, 10)}</td><td>{estado(f.v)}{sin && <div className="sub" style={{ marginTop: 4 }}>Pendiente de instrumentación</div>}</td><td>{f.interp} {sin && "Sin despliegues no hay base para calcularla."}</td><td>{f.accion}</td></tr>)}</tbody>
        </table></div>
      </Card>
      <Card title="Registro de cambios, despliegues e incidentes" sub="Plantilla editable. Los datos se guardan solo en este navegador; use «Copiar CSV» para llevarlos a la plantilla Excel."
        right={<div className="row"><button className="btn" onClick={() => act([...ev, nuevo()])} data-testid="dora-agregar">Agregar cambio</button><button className="btn" onClick={async () => setToast(await copiar(aCsv(ev as never)) ? "Registro copiado" : "No se pudo copiar")} disabled={!ev.length}>Copiar CSV</button></div>}>
        <div className="tbl-wrap"><table>
          <thead><tr><th>ID</th><th>Cambio</th><th>Inicio del cambio</th><th>Despliegue</th><th>Exitoso</th><th>Provocó fallo</th><th>Inicio incidente</th><th>Recuperación verificada</th><th></th></tr></thead>
          <tbody>
            {!ev.length && <tr><td colSpan={9} className="sub">Sin registros. Agregue un cambio cuando exista una publicación real.</td></tr>}
            {ev.map((e, i) => <tr key={i}>
              <td className="num">{e.id}</td>
              <td><input type="text" value={e.cambio} onChange={x => ed(i, "cambio", x.target.value)} aria-label="Cambio" /></td>
              {(["inicioCambio", "despliegue"] as const).map(k => <td key={k}><input type="datetime-local" value={e[k]} onChange={x => ed(i, k, x.target.value)} aria-label={k} /></td>)}
              <td><input type="checkbox" checked={e.exitoso} onChange={x => ed(i, "exitoso", x.target.checked)} aria-label="Exitoso" /></td>
              <td><input type="checkbox" checked={e.fallo} onChange={x => ed(i, "fallo", x.target.checked)} aria-label="Provocó fallo" /></td>
              {(["inicioIncidente", "recuperacion"] as const).map(k => <td key={k}><input type="datetime-local" value={e[k]} disabled={!e.fallo} onChange={x => ed(i, k, x.target.value)} aria-label={k} /></td>)}
              <td><button className="btn" onClick={() => act(ev.filter((_, j) => j !== i))}>Quitar</button></td>
            </tr>)}
          </tbody>
        </table></div>
      </Card>
      <Card title="Ejemplo demostrativo (no son resultados del proyecto)" right={<span className="pill demo">Ejemplo ficticio</span>}>
        <p className="sub">Con tres despliegues inventados en 20 días, uno con fallo recuperado en 3,5 horas, las fórmulas darían:</p>
        <div className="grid kpis">
          <div><span className="lbl">Frecuencia</span><div className="num" style={{ fontSize: "1.3rem" }}>{ej.frecuenciaSemanal?.toFixed(2)} /semana</div></div>
          <div><span className="lbl">Tiempo de entrega</span><div className="num" style={{ fontSize: "1.3rem" }}>{ej.leadTimeHoras?.toFixed(1)} h</div></div>
          <div><span className="lbl">Tasa de fallos</span><div className="num" style={{ fontSize: "1.3rem" }}>{ej.tasaFallos?.toFixed(1)} %</div></div>
          <div><span className="lbl">Recuperación</span><div className="num" style={{ fontSize: "1.3rem" }}>{ej.mttrHoras?.toFixed(1)} h</div></div>
        </div>
      </Card>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

// ---------------------------------------------------------------- Rendimiento
interface Medicion { prueba: string; umbral: number | null; n: number; min: number; promedio: number; mediana: number; max: number; registros: number; errores: number }
const tipoMedicion = (p: string, playwright: boolean) => p.includes("cálculo interno") || (!playwright && !p.includes("Carga")) ? "Cálculo interno" : "Experiencia completa en pantalla";
function medir(fn: () => void, reps: number) { const t: number[] = []; let errores = 0; for (let i = 0; i < reps; i++) { const a = performance.now(); try { fn(); } catch { errores++; } t.push(performance.now() - a); } return { ...estadisticos(t), errores }; }
function recalcularTodo(filas: typeof FILAS, campana: string) {
  const f = filtrar(filas, { desde: COHORTES_VENTANA[0], hasta: COHORTES_VENTANA[COHORTES_VENTANA.length - 1], campana, supervisor: TODOS });
  kpis(f); porCohorte(f); porMesAntiguedad(f); porGrupo(f, "supervisor", 30); porGrupo(f, "rangoPuntaje", 30); factores(f, 30);
}
function Rendimiento() {
  const [res, setRes] = useState<{ fecha: string; entorno: string; filas: Medicion[] } | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const pw = PRUEBAS?.rendimiento as { fecha: string; entorno: string; filas: Medicion[] } | undefined;
  const correr = () => {
    setCorriendo(true);
    setTimeout(() => {
      const cand: Candidato = { campana: OPCIONES.campana[0], turno: "Noche", distancia: 18, experiencia: 0, educacion: "Bachiller", canal: "Portal de empleo", puntaje: 58 };
      const camps = [TODOS, ...OPCIONES.campana];
      let k = 0;
      const a = medir(() => recalcularTodo(FILAS, camps[k++ % camps.length]), 30);
      const s = medir(() => evaluar(cand, COEFS, MODELO.umbrales.amarillo, MODELO.umbrales.rojo), 200);
      const t0 = performance.now(); const grande = ampliar(FILAS, 50000); const tAmp = performance.now() - t0;
      const g = medir(() => recalcularTodo(grande, camps[k++ % camps.length]), 10);
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const carga = nav ? nav.loadEventEnd || nav.domContentLoadedEventEnd : NaN;
      setRes({
        fecha: new Date().toLocaleString("es-CO"), entorno: `${navigator.userAgent} · ${navigator.hardwareConcurrency ?? "?"} núcleos`,
        filas: [
          { prueba: "Recalcular visuales tras un filtro (dataset demo)", umbral: 3000, registros: FILAS.length, ...a },
          { prueba: "Cálculo del semáforo", umbral: 2000, registros: 1, ...s },
          { prueba: "Recalcular visuales tras un filtro (50.000 registros)", umbral: 3000, registros: 50000, ...g },
          { prueba: "Generar dataset de 50.000 registros", umbral: null, registros: 50000, n: 1, min: tAmp, promedio: tAmp, mediana: tAmp, max: tAmp, errores: 0 },
          { prueba: "Carga inicial de la página (esta sesión)", umbral: null, registros: FILAS.length, n: 1, min: carga, promedio: carga, mediana: carga, max: carga, errores: 0 },
        ],
      });
      setCorriendo(false);
    }, 30);
  };
  const Tabla = ({ filas, pw: esPw }: { filas: Medicion[]; pw: boolean }) => (
    <div className="tbl-wrap"><table>
      <thead><tr><th>Prueba</th><th>Tipo de medición</th><th className="r">Registros</th><th className="r">Repet.</th><th className="r">Mín. ms</th><th className="r">Prom. ms</th><th className="r">Mediana ms</th><th className="r">Máx. ms</th><th className="r">Errores</th><th>Umbral</th><th>Resultado</th></tr></thead>
      <tbody>{filas.map(f => <tr key={f.prueba}><td>{f.prueba}</td><td>{tipoMedicion(f.prueba, esPw)}</td><td className="r">{fmt(f.registros)}</td><td className="r">{f.n}</td><td className="r">{fmt(f.min, 2)}</td><td className="r">{fmt(f.promedio, 2)}</td><td className="r">{fmt(f.mediana, 2)}</td><td className="r">{fmt(f.max, 2)}</td><td className="r">{f.errores}</td><td>{f.umbral ? `< ${f.umbral / 1000} s` : "Sin umbral"}</td><td>{f.umbral === null ? <span className="pill neutral">Informativo</span> : f.max < f.umbral && !f.errores ? <span className="pill good">Cumple</span> : <span className="pill crit">No cumple</span>}</td></tr>)}</tbody>
    </table></div>
  );
  return (
    <>
      <div className="note">Objetivos de diseño del documento (RNF-07, propuesta): el dashboard responde a un filtro en menos de 3 segundos y el semáforo en menos de 2 segundos, con hasta 50.000 registros. Son metas, no resultados; los resultados son los que aparecen abajo con su fecha y entorno.<br /><b>Cálculo interno:</b> solo el tiempo de JavaScript que recalcula indicadores. <b>Experiencia completa en pantalla:</b> desde la acción del usuario (clic o filtro) hasta que la pantalla muestra el resultado, medido con Playwright en un navegador real.</div>
      <Card title="Medición en este navegador" sub="Repite los cálculos de filtros (30 veces), semáforo (200) y volumen de 50.000 registros (10). Mide cálculo en JavaScript; la respuesta visual completa se mide con Playwright."
        right={<button className="btn primary" onClick={correr} disabled={corriendo} data-testid="correr-rendimiento">{corriendo ? "Midiendo…" : "Ejecutar medición"}</button>}>
        {res ? <><p className="sub">Fecha: {res.fecha} · Entorno: {res.entorno}</p><Tabla filas={res.filas} pw={false} /></> : <div className="empty">Aún no se ha ejecutado la medición en este navegador.</div>}
      </Card>
      <Card title="Resultados de la prueba automatizada (Playwright)" sub="Incluye el tiempo desde la acción del usuario hasta que la pantalla se actualiza">
        {pw ? <><p className="sub">Fecha: {pw.fecha} · Entorno: {pw.entorno}</p><Tabla filas={pw.filas} pw /></> : <div className="empty">Pendiente de ejecución.</div>}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- Pruebas
interface PruebaR { id: string; cu: string; nombre: string; entrada?: string; esperado: string; observado: string; estado: string; suite: string; evidencia?: string }
const LISTA_PRUEBAS = (PRUEBAS?.funcionales ?? []) as PruebaR[];
const pillEstado = (e: string) => <span className={"pill " + (e === "Aprobada" ? "good" : e === "Fallida" ? "crit" : "neutral")}>{e}</span>;
function Pruebas() {
  const [fEstado, setFEstado] = useState("Todas");
  const [fSuite, setFSuite] = useState("Todas");
  const [q, setQ] = useState("");
  const suites = [...new Set(LISTA_PRUEBAS.map(p => p.suite))];
  const cuenta = (e: string) => LISTA_PRUEBAS.filter(p => p.estado === e).length;
  const vis = LISTA_PRUEBAS.filter(p => (fEstado === "Todas" || p.estado === fEstado) && (fSuite === "Todas" || p.suite === fSuite) && (!q || (p.id + " " + p.cu + " " + p.nombre).toLowerCase().includes(q.toLowerCase())));
  const historias = [...SPRINTS.slice(1).flatMap(s => s.items), ...BACKLOG_CONDICIONADO].filter(h => h.id.startsWith("HU"));
  return (
    <>
      <div className="grid kpis" data-testid="resumen-pruebas">
        <div className="card kpi"><p className="lbl">Ejecutadas</p><div className="val">{LISTA_PRUEBAS.length}</div><p className="sub">{PRUEBAS?.ejecutado ? `El ${PRUEBAS.fecha}` : "Pendiente de ejecución"}</p></div>
        <div className="card kpi"><p className="lbl">Aprobadas</p><div className="val" style={{ color: "var(--good)" }}>{cuenta("Aprobada")}</div><p className="sub">Resultado observado igual al esperado</p></div>
        <div className="card kpi"><p className="lbl">Fallidas</p><div className="val" style={{ color: cuenta("Fallida") ? "var(--crit)" : undefined }}>{cuenta("Fallida")}</div><p className="sub">Resultado distinto al esperado</p></div>
        <div className="card kpi"><p className="lbl">Pruebas del cliente (UAT) <Ayuda t="UAT" /></p><div className="val">0 de {historias.length}</div><p className="sub">Pendientes: se hacen en la demo con el acta</p></div>
      </div>
      <Card title="Pruebas automatizadas del prototipo" sub={PRUEBAS?.ejecutado ? `Ejecutadas automáticamente el ${PRUEBAS.fecha} (${PRUEBAS.entorno}). Una prueba solo figura como aprobada si se ejecutó y su resultado observado coincide con el esperado.` : "Pendiente de ejecución"}>
        <div className="row" role="group" aria-label="Filtrar pruebas">
          <div className="field"><label htmlFor="p-estado">Estado</label><select id="p-estado" value={fEstado} onChange={e => setFEstado(e.target.value)} data-testid="p-estado"><option>Todas</option><option>Aprobada</option><option>Fallida</option><option>Pendiente</option></select></div>
          <div className="field"><label htmlFor="p-suite">Tipo</label><select id="p-suite" value={fSuite} onChange={e => setFSuite(e.target.value)} data-testid="p-suite"><option>Todas</option>{suites.map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label htmlFor="p-q">Buscar</label><input id="p-q" type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="ID, caso de uso o nombre" data-testid="p-buscar" /></div>
          <span className="sub" style={{ marginLeft: "auto" }} aria-live="polite" data-testid="p-conteo">{vis.length} de {LISTA_PRUEBAS.length} pruebas</span>
        </div>
        {vis.length ? <div className="tbl-wrap"><table data-testid="tabla-pruebas">
          <thead><tr><th>ID</th><th>Estado</th><th>Caso de uso</th><th>Funcionalidad evaluada</th><th>Datos de entrada</th><th>Resultado esperado</th><th>Resultado observado</th></tr></thead>
          <tbody>{vis.map(p => <tr key={p.id}><td className="num">{p.id}</td><td>{pillEstado(p.estado)}</td><td className="num" style={{ whiteSpace: "normal" }}>{p.cu}</td><td>{p.nombre}<div className="sub">{p.suite}</div><div className="sub" style={{ wordBreak: "break-all" }}>Evidencia: {p.evidencia ?? "—"}</div></td><td>{p.entrada ?? "—"}</td><td>{p.esperado}</td><td>{p.observado}</td></tr>)}</tbody>
        </table></div> : <div className="empty" role="status">Ninguna prueba coincide con los filtros.</div>}
      </Card>
      <Card title="Pruebas de aceptación del cliente (UAT)" sub="Separadas de las automatizadas: las hace el cliente con los criterios de cada historia (sección 17 del documento técnico)">
        <div className="note warn">Ninguna prueba de aceptación se ha ejecutado. Se harán en la demo con el acta de validación (documentacion/acta_validacion_cliente.pdf). Hasta entonces ninguna historia se declara aceptada por el cliente.</div>
        <div className="tbl-wrap"><table data-testid="tabla-uat">
          <thead><tr><th>HU</th><th>Historia</th><th>Estado en Jira</th><th>UAT</th></tr></thead>
          <tbody>{historias.map(h => { const j = JIRA.find(x => x.key === h.jira); return <tr key={h.id}><td className="num">{h.id}</td><td>{h.nombre}</td><td>{j?.status ?? "—"}</td><td><span className="pill neutral">Pendiente</span></td></tr>; })}</tbody>
        </table></div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- Calidad
interface ReglaCal { regla: string; descripcion: string; registros_afectados: number; accion: string; cumple_tras_accion?: boolean }
function tratamiento(r: ReglaCal): string {
  if (!r.registros_afectados) return "Sin incidencias";
  const a = r.accion.toLowerCase();
  if (a.includes("excluid")) return "Excluidos y reportados";
  if (a.includes("eliminad")) return "Corregidos (eliminados)";
  if (a.includes("nulo")) return "Corregidos (marcados como nulo)";
  if (r.regla === "Completitud") return "Reportados (imputación en el modelo)";
  return "Reportados";
}
function accionLegible(r: ReglaCal): string {
  if (r.regla !== "Completitud") return r.accion;
  try { const o = JSON.parse(r.accion) as Record<string, number>; return "Nulos por columna: " + Object.entries(o).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${String(v).replace(".", ",")} %`).join("; ") + ". Todas bajo el 20 %: se imputan en el pipeline del modelo."; } catch { return r.accion; }
}
function Calidad() {
  const reglas = CALIDAD.reglas as ReglaCal[];
  const afectadas = reglas.filter(r => r.registros_afectados > 0).length;
  return (
    <Card title="Reporte de calidad del ETL (CU-08)" sub={`Fuente: ${CALIDAD.fuente} · fecha de corte ${CALIDAD.fecha_corte} · estado ${CALIDAD.estado}`}>
      <div className="note demo">Corresponde a la ejecución del pipeline sobre la capa bronce ficticia, que incluye errores sembrados a propósito (duplicados, fechas imposibles, huérfanos, puntajes fuera de rango y nulos) para comprobar las reglas. {afectadas} de {reglas.length} reglas encontraron registros con problemas; ninguno se ocultó.</div>
      <div className="tbl-wrap"><table data-testid="tabla-calidad">
        <thead><tr><th>Regla</th><th>Descripción</th><th className="r">Registros afectados</th><th>Acción aplicada</th><th>Tratamiento</th><th>Resultado de la validación</th></tr></thead>
        <tbody>{reglas.map((r, i) => <tr key={i}><td>{r.regla}</td><td>{r.descripcion}</td><td className="r">{r.registros_afectados}</td><td>{accionLegible(r)}</td><td>{tratamiento(r)}</td><td>{r.cumple_tras_accion === false ? <span className="pill crit">No cumple</span> : <span className="pill good">Cumple tras la acción</span>}</td></tr>)}</tbody>
      </table></div>
      <p className="sub">Filas en bronce: {CALIDAD.filas_bronce.empleados} empleados, {CALIDAD.filas_bronce.retiros} retiros. Tabla de hechos resultante: {CALIDAD.filas_salida.fact_contrataciones} personas, {CALIDAD.filas_salida.cohortes_con_ventana} con ventana completa. {CALIDAD.filas_bronce.empleados} − 15 duplicados − 6 personas con fechas imposibles = {CALIDAD.filas_salida.fact_contrataciones}.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- Trazabilidad
const HU_CU: Record<string, string[]> = { "HU-01": ["CU-08"], "HU-02": ["CU-08"], "HU-03": ["CU-01"], "HU-04": ["CU-01"], "HU-05": ["CU-01"], "HU-06": ["CU-02"], "HU-07": ["CU-03"], "HU-08": ["CU-03"], "HU-09": ["CU-03"], "HU-10": ["CU-03"], "HU-11": ["CU-04"], "HU-12": ["CU-05", "CU-09"], "HU-13": ["CU-06"], "HU-14": ["CU-07", "CU-09"], "HU-15": ["CU-05", "CU-09"], "HU-16": ["CU-08"] };
type Cobertura = "Completo" | "Parcial" | "Sin prueba";
function cobertura(t: { estado: string; pruebas?: string[] }): { c: Cobertura; ok: number; n: number } {
  const ps = (t.pruebas ?? []).map(id => LISTA_PRUEBAS.find(p => p.id === id)).filter(Boolean) as PruebaR[];
  const ok = ps.filter(p => p.estado === "Aprobada").length;
  if (!ps.length) return { c: "Sin prueba", ok, n: 0 };
  const parcial = /simulad|demostración|modelo no|no publicado/i.test(t.estado) || ok < ps.length;
  return { c: parcial ? "Parcial" : "Completo", ok, n: ps.length };
}
function Trazabilidad() {
  const [f, setF] = useState<"Todos" | Cobertura>("Todos");
  const filas = TRAZABILIDAD.map(t => ({ ...t, cu: [...new Set(t.hu.split(",").map(h => h.trim()).flatMap(h => HU_CU[h] ?? []))], cob: cobertura(t) }));
  const vis = filas.filter(t => f === "Todos" || t.cob.c === f);
  const cnt = (c: Cobertura) => filas.filter(t => t.cob.c === c).length;
  return (
    <Card title="Matriz de trazabilidad" sub="Requisito funcional → historia de usuario → caso de uso → funcionalidad → pruebas → estado. Relaciones tomadas del documento técnico (secciones 7 y 9).">
      <div className="row" role="group" aria-label="Filtrar requisitos">
        {(["Todos", "Completo", "Parcial", "Sin prueba"] as const).map(x => <button key={x} className={"btn sm" + (f === x ? " on" : "")} aria-pressed={f === x} onClick={() => setF(x)} data-testid={"traz-" + x.replace(" ", "-").toLowerCase()}>{x}{x !== "Todos" && ` (${cnt(x)})`}</button>)}
        <span className="sub">Completo: implementado y todas sus pruebas aprobadas. Parcial: depende de datos simulados o del modelo no publicado. La validación del cliente sigue pendiente en todos. <Ayuda t="HU / CU / RF / RNF" /></span>
      </div>
      <div className="tbl-wrap"><table data-testid="tabla-trazabilidad">
        <thead><tr><th>Requisito</th><th>HU</th><th>CU</th><th>Funcionalidad implementada</th><th>Pruebas asociadas</th><th>Estado</th><th>Cliente</th></tr></thead>
        <tbody>{vis.map(t => <tr key={t.id}><td><b className="num">{t.id}</b> {t.req}</td><td className="num">{t.hu}</td><td className="num">{t.cu.join(", ")}</td><td>{t.donde}<div className="sub">{t.estado}</div></td><td className="num" style={{ whiteSpace: "normal" }}>{(t.pruebas ?? []).join(", ") || "—"}<div className="sub">{t.cob.ok} de {t.cob.n} aprobadas</div></td><td><span className={"pill " + (t.cob.c === "Completo" ? "good" : t.cob.c === "Parcial" ? "warn" : "crit")}>{t.cob.c}</span></td><td><span className="pill neutral">Pendiente</span></td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}
