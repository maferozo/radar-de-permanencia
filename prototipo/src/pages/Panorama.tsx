import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, LabelList, ReferenceLine } from "recharts";
import { kpis, porCohorte, porMesAntiguedad, costo } from "../calc";
import type { Contexto } from "../App";
import { Card, Empty, Tip, pct, fmt, cop, copMillones, Ayuda, useToast } from "../ui";
import { COSTOS_SIM, FILAS, CALIDAD } from "../data";

const TOTAL = kpis(FILAS); // referencia: todas las cohortes con ventana completa, sin filtros

export default function Panorama({ filas, costos, setCostos, nMin }: Contexto) {
  const k = useMemo(() => kpis(filas), [filas]);
  const coh = useMemo(() => porCohorte(filas), [filas]);
  const meses = useMemo(() => porMesAntiguedad(filas), [filas]);
  const [editCosto, setEditCosto] = useState(false);
  const [borr, setBorr] = useState({ reclutamiento: String(costos?.reclutamiento ?? ""), formacion: String(costos?.formacion ?? ""), improductivo: String(costos?.improductivo ?? "") });
  const [errC, setErrC] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  const c = costo(k.renuncias, costos);

  if (!k.contratados) return <Empty><b>Sin datos para esta selección.</b><br />Ninguna persona de las cohortes con 180 días de observación cumple los filtros. Use «Limpiar filtros» para volver a la vista completa.</Empty>;

  const guardarCosto = () => {
    const v = Object.fromEntries(Object.entries(borr).map(([a, b]) => [a, Number(b)])) as Record<string, number>;
    if (Object.values(borr).some(x => x === "") || Object.values(v).some(x => !Number.isFinite(x) || x < 0)) { setErrC("Ingrese los tres valores en pesos colombianos (números mayores o iguales a 0)."); return; }
    setErrC(null); setCostos(v as never); setEditCosto(false); setToast("Costo recalculado con los supuestos ingresados");
  };
  const simulados = !!costos && costos.reclutamiento === COSTOS_SIM.reclutamiento && costos.formacion === COSTOS_SIM.formacion && costos.improductivo === COSTOS_SIM.improductivo;
  const filtrado = k.contratados !== TOTAL.contratados;
  const de100 = k.tasa === null ? null : Math.round(k.tasa * 100);
  const mesSel = meses.find(m => m.mes === k.mesCritico);
  const conDatos = coh.filter(x => x.contratados >= nMin);
  const alta = [...conDatos].sort((a, b) => b.tasa - a.tasa)[0], baja = [...conDatos].sort((a, b) => a.tasa - b.tasa)[0];
  const difTotal = k.tasa !== null && TOTAL.tasa !== null ? (k.tasa - TOTAL.tasa) * 100 : 0;
  const excluidasEtl = (CALIDAD.reglas as { regla: string; registros_afectados: number }[]).find(r => r.regla === "Coherencia de fechas")?.registros_afectados ?? 0;

  return (
    <>
      <section className="card resumen-ejec" data-testid="interpretacion">
        <span className="lbl">Lectura rápida</span>
        <p className="lead">
          En la selección actual, aproximadamente <b>{de100} de cada 100</b> personas contratadas renunciaron voluntariamente durante sus primeros 180 días.
          Las renuncias se concentran en el <b>mes {k.mesCritico} de antigüedad</b>{mesSel ? <> ({pct(mesSel.pct, 0)} del total)</> : null}.
        </p>
        <p className="sub">Es una medición histórica de cohortes que ya cumplieron 180 días de observación, no una predicción del futuro. No hay una meta institucional de rotación documentada, así que no se compara contra una meta.</p>
      </section>

      <div className="grid kpis">
        <div className="card kpi" data-testid="kpi-contratados">
          <p className="lbl">Personas contratadas</p>
          <div className="val">{fmt(k.contratados)}</div>
          <p className="sub">Personas que ingresaron en cohortes con 180 días de observación.</p>
          <p className="ctx">{filtrado ? `${pct(k.contratados / TOTAL.contratados, 0)} del total analizado (${fmt(TOTAL.contratados)})` : `${fmt(k.excluidosSinVentana)} de cohortes recientes aún no entran`}</p>
        </div>
        <div className="card kpi" data-testid="kpi-renuncias">
          <p className="lbl">Renuncias tempranas</p>
          <div className="val">{fmt(k.renuncias)}</div>
          <p className="sub">Renuncias voluntarias antes de cumplir 180 días.</p>
          <p className="ctx">Despidos tempranos, aparte: {fmt(k.despidos)} (no cuentan como renuncia)</p>
        </div>
        <div className="card kpi" data-testid="kpi-tasa">
          <p className="lbl">Tasa de rotación temprana <Ayuda t="Rotación temprana" /></p>
          <div className="val">{pct(k.tasa)}</div>
          <p className="sub">Renuncias tempranas ÷ personas contratadas.</p>
          <p className="ctx">{filtrado ? `${difTotal >= 0 ? "+" : "−"}${Math.abs(difTotal).toFixed(1).replace(".", ",")} p.p. frente al total (${pct(TOTAL.tasa)})` : "Sin meta institucional documentada"}</p>
        </div>
        <div className="card kpi" data-testid="kpi-mes">
          <p className="lbl">Mes crítico de renuncia <Ayuda t="Mes crítico" /></p>
          <div className="val">{k.mesCritico ? `Mes ${k.mesCritico}` : "—"}</div>
          <p className="sub">Mes de antigüedad con más renuncias.</p>
          <p className="ctx">{mesSel ? `${fmt(mesSel.renuncias)} renuncias, ${pct(mesSel.pct, 0)} de las tempranas` : "—"}</p>
        </div>
        <div className="card kpi" data-testid="kpi-costo">
          <p className="lbl">Costo estimado</p>
          {c === null
            ? <><div className="val na">Sin datos de costo</div><p className="sub">HU-05 condicionada: el cliente no ha entregado costos de reemplazo.</p>
                <button className="btn link" onClick={() => setEditCosto(v => !v)} data-testid="abrir-costos" aria-expanded={editCosto}>Ingresar supuestos de costo</button></>
            : <><div className="val" style={{ fontSize: "1.35rem" }} title={cop(c)}>{copMillones(c)}</div>
                <p className="sub">Renuncias × {cop(costos!.reclutamiento + costos!.formacion + costos!.improductivo)} por reemplazo.</p>
                <p className="ctx">{simulados ? <span className="pill demo">Supuestos simulados, sin validar</span> : <span className="pill warn">Supuestos del usuario, sin validar</span>}</p>
                <button className="btn link" onClick={() => setEditCosto(v => !v)} data-testid="abrir-costos" aria-expanded={editCosto}>Cambiar supuestos</button></>}
        </div>
      </div>

      {editCosto && (
        <Card title="Supuestos de costo por reemplazo" sub="Costo = renuncias tempranas × (reclutamiento + formación + tiempo improductivo). Valores por persona, en pesos colombianos.">
          <div className="form">
            {([["reclutamiento", "Reclutamiento"], ["formacion", "Formación"], ["improductivo", "Tiempo improductivo"]] as const).map(([id, n]) => (
              <div className="field" key={id}><label htmlFor={"c-" + id}>{n}</label>
                <input id={"c-" + id} type="number" min={0} value={borr[id]} onChange={e => setBorr({ ...borr, [id]: e.target.value })} /></div>
            ))}
          </div>
          {errC && <p className="err" role="alert">{errC}</p>}
          <div className="row"><button className="btn primary" onClick={guardarCosto}>Calcular costo</button><button className="btn" onClick={() => { setCostos(null); setEditCosto(false); setToast("Se quitaron los supuestos de costo"); }}>Quitar supuestos</button><span className="sub">Los valores no se guardan; al recargar vuelven los supuestos simulados.</span></div>
        </Card>
      )}

      <div className="grid two">
        <Card title="¿Cómo cambia la rotación entre cohortes?" sub="Tasa de rotación temprana por mes de ingreso. La línea punteada es el promedio de la selección.">
          <div className="chart" data-testid="graf-cohortes" role="img" aria-label={`Tasa por cohorte: más alta ${alta?.cohorte} con ${pct(alta?.tasa)}, más baja ${baja?.cohorte} con ${pct(baja?.tasa)}`}>
            <ResponsiveContainer>
              <LineChart data={coh} margin={{ top: 16, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="cohorte" tickMargin={6} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tickFormatter={v => `${Math.round(v * 100)} %`} domain={[0, (max: number) => Math.min(1, Math.ceil(max * 10) / 10 + 0.05)]} width={52} />
                <Tooltip content={<Tip render={p => <><div>Cohorte <b>{String(p.cohorte)}</b></div><div>Tasa: <b>{pct(p.tasa as number)}</b></div><div>{String(p.renuncias)} renuncias de {String(p.contratados)} contratados</div></>} />} />
                {k.tasa !== null && <ReferenceLine y={k.tasa} stroke="var(--fg-3)" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="tasa" stroke="var(--s1)" strokeWidth={2} dot={{ r: 3, fill: "var(--s1)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend"><span><i className="sw" style={{ background: "var(--s1)" }} />Tasa de la cohorte</span><span><i className="sw" style={{ background: "var(--fg-3)" }} />Promedio de la selección: {pct(k.tasa)}</span></div>
          {coh.length > 1 && alta && baja && <p className="sub" data-testid="lectura-cohortes">Cohorte más alta: <b>{alta.cohorte}</b> ({pct(alta.tasa)}, n = {alta.contratados}). Más baja: <b>{baja.cohorte}</b> ({pct(baja.tasa)}, n = {baja.contratados}). Solo se comparan cohortes con al menos {nMin} personas. Pase el cursor sobre un punto para ver el detalle.</p>}
          {coh.length === 1 && <p className="sub">Solo hay una cohorte en la selección; amplíe el período para ver la tendencia.</p>}
        </Card>

        <Card title="¿En qué mes de antigüedad se van?" sub="Renuncias tempranas por mes desde el ingreso (mes 1 = días 1 a 30). El mes crítico se resalta.">
          <div className="chart" data-testid="graf-meses" role="img" aria-label={`Renuncias por mes de antigüedad; mes crítico ${k.mesCritico}`}>
            <ResponsiveContainer>
              <BarChart data={meses} margin={{ top: 22, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tickFormatter={m => `Mes ${m}`} />
                <YAxis allowDecimals={false} width={44} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip render={p => <><div>Mes <b>{String(p.mes)}</b> de antigüedad</div><div><b>{String(p.renuncias)}</b> renuncias ({pct(p.pct as number)} del total)</div></>} />} />
                <Bar dataKey="renuncias" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={56}>
                  {meses.map(m => <Cell key={m.mes} fill={m.mes === k.mesCritico ? "var(--s2)" : "var(--muted-mark)"} />)}
                  <LabelList dataKey="renuncias" position="top" fill="var(--fg-2)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend"><span><i className="sw box" style={{ background: "var(--s2)" }} />Mes crítico</span><span><i className="sw box" style={{ background: "var(--muted-mark)" }} />Otros meses</span></div>
          <p className="sub">Los meses 1 a 3 suman {pct(meses.slice(0, 3).reduce((a, m) => a + m.pct, 0), 0)} de las renuncias tempranas.</p>
        </Card>
      </div>

      <details className="card" data-testid="incluidos-excluidos">
        <summary>¿Quiénes entran en el análisis y quiénes no?</summary>
        <div className="tbl-wrap" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Grupo</th><th className="r">Personas</th><th>Tratamiento y motivo</th></tr></thead>
          <tbody>
            <tr><td>Incluidas en las tasas</td><td className="r">{fmt(k.contratados)}</td><td>Cohortes de la selección con 180 días de observación a la fecha de corte.</td></tr>
            <tr><td>Excluidas: cohortes recientes <Ayuda t="Ventana completa" /></td><td className="r">{fmt(k.excluidosSinVentana)}</td><td>Ingresaron hace menos de 180 días; todavía no se sabe si renunciarán en ese plazo.</td></tr>
            <tr><td>Despidos tempranos</td><td className="r">{fmt(k.despidos)}</td><td>Se cuentan entre los contratados, pero no como renuncia (la definición solo incluye retiros voluntarios).</td></tr>
            <tr><td>Excluidas por el proceso de calidad</td><td className="r">{fmt(excluidasEtl)}</td><td>Fecha de retiro anterior al ingreso o posterior al corte. Aplica a todo el conjunto, sin importar los filtros; además se eliminaron 15 registros duplicados (ver Seguimiento › Calidad de datos).</td></tr>
          </tbody>
        </table></div>
      </details>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
