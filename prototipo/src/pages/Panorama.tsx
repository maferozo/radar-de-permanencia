import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, LabelList, ReferenceLine } from "recharts";
import { kpis, porCohorte, porMesAntiguedad, costo, rankingFactores, NOMBRE_VARIABLE } from "../calc";
import type { Contexto } from "../App";
import { Card, Empty, Tip, pct, fmt, cop, copMillones, Ayuda, useToast, mesLargo, mesCorto } from "../ui";
import { COSTOS_SIM, FILAS, CALIDAD } from "../data";

const TOTAL = kpis(FILAS); // referencia: todas las personas con seis meses de seguimiento, sin filtros
const dec1 = (x: number) => x.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function Panorama({ filas, costos, setCostos, nMin, ir }: Contexto) {
  const k = useMemo(() => kpis(filas), [filas]);
  const coh = useMemo(() => porCohorte(filas), [filas]);
  const meses = useMemo(() => porMesAntiguedad(filas), [filas]);
  const rank = useMemo(() => rankingFactores(filas, nMin), [filas, nMin]);
  const [editCosto, setEditCosto] = useState(false);
  const [borr, setBorr] = useState({ reclutamiento: String(costos?.reclutamiento ?? ""), formacion: String(costos?.formacion ?? ""), improductivo: String(costos?.improductivo ?? "") });
  const [errC, setErrC] = useState<string | null>(null);
  const [toast, setToast] = useToast();
  const c = costo(k.renuncias, costos);

  if (!k.contratados) return <Empty><b>Sin datos para esta selección.</b><br />Ninguna persona con seis meses de seguimiento cumple los filtros elegidos. Use «Restablecer filtros» para volver a ver a todas las personas.</Empty>;

  const guardarCosto = () => {
    const v = Object.fromEntries(Object.entries(borr).map(([a, b]) => [a, Number(b)])) as Record<string, number>;
    if (Object.values(borr).some(x => x === "") || Object.values(v).some(x => !Number.isFinite(x) || x < 0)) { setErrC("Ingrese los tres valores en pesos colombianos (números mayores o iguales a 0)."); return; }
    setErrC(null); setCostos(v as never); setEditCosto(false); setToast("Costo recalculado con los valores ingresados");
  };
  const simulados = !!costos && costos.reclutamiento === COSTOS_SIM.reclutamiento && costos.formacion === COSTOS_SIM.formacion && costos.improductivo === COSTOS_SIM.improductivo;
  const filtrado = k.contratados !== TOTAL.contratados;
  const de100 = k.tasa === null ? null : Math.round(k.tasa * 100);
  const mesSel = meses.find(m => m.mes === k.mesCritico);
  const primeros3 = meses.slice(0, 3).reduce((a, m) => a + m.pct, 0);
  const conDatos = coh.filter(x => x.contratados >= nMin);
  const alta = [...conDatos].sort((a, b) => b.tasa - a.tasa)[0], baja = [...conDatos].sort((a, b) => a.tasa - b.tasa)[0];
  const difTotal = k.tasa !== null && TOTAL.tasa !== null ? (k.tasa - TOTAL.tasa) * 100 : 0;
  const excluidasEtl = (CALIDAD.reglas as { regla: string; registros_afectados: number }[]).find(r => r.regla === "Coherencia de fechas")?.registros_afectados ?? 0;
  const top = rank.find(r => r.estado === "prioritario" || r.estado === "leve");

  return (
    <>
      <div className="grid kpis4">
        <div className="card kpi" data-testid="kpi-contratados">
          <p className="lbl">Personas contratadas</p>
          <div className="val">{fmt(k.contratados)}</div>
          <p className="sub">Con al menos seis meses desde su ingreso{filtrado ? ` · ${pct(k.contratados / TOTAL.contratados, 0)} del total` : ""}.</p>
        </div>
        <div className="card kpi" data-testid="kpi-renuncias">
          <p className="lbl">Renunciaron antes de seis meses</p>
          <div className="val">{fmt(k.renuncias)}</div>
          <p className="sub">Renuncias voluntarias. Los despidos ({fmt(k.despidos)}) no se cuentan.</p>
        </div>
        <div className="card kpi destacado" data-testid="kpi-tasa">
          <p className="lbl">Rotación temprana <Ayuda t="Rotación temprana" /></p>
          <div className="val">{pct(k.tasa)}</div>
          <p className="sub">de las personas contratadas renunció antes de seis meses.</p>
          {filtrado && <p className="ctx">{difTotal >= 0 ? "+" : "−"}{dec1(Math.abs(difTotal))} p.p. frente al total ({pct(TOTAL.tasa)})</p>}
        </div>
        <div className="card kpi" data-testid="kpi-mes">
          <p className="lbl">Mes con más renuncias <Ayuda t="Mes con más renuncias" /></p>
          <div className="val">{k.mesCritico ? `Mes ${k.mesCritico}` : "—"}</div>
          <p className="sub">{mesSel ? `${fmt(mesSel.renuncias)} renuncias, ${pct(mesSel.pct, 0)} del total.` : "—"}</p>
        </div>
      </div>

      <section className="card hallazgo" data-testid="interpretacion">
        <h2>Hallazgo principal</h2>
        <ul className="hallazgos">
          <li><b>{de100} de cada 100</b> personas contratadas renunciaron antes de cumplir seis meses.</li>
          {mesSel && <li>El <b>mes {k.mesCritico}</b> después del ingreso concentra más renuncias ({pct(mesSel.pct, 0)}); los tres primeros meses suman {pct(primeros3, 0)}.</li>}
          {top && <li>La diferencia más grande aparece en <b>{NOMBRE_VARIABLE[top.variable].toLowerCase()}: {top.grupo}</b> ({pct(top.tasa)} frente a {pct(top.general)}). Es una relación observada, no una causa demostrada.</li>}
        </ul>
        {primeros3 >= 0.5 && <p className="sugerencia"><span className="pill warn">Sugerencia por validar</span> Conviene revisar la inducción y el acompañamiento de los primeros meses.</p>}
        <p className="sub">Es una medición histórica de personas que ya cumplieron seis meses, no una predicción del futuro. No hay una meta de rotación definida por la empresa con la cual comparar.</p>
        <div className="row">
          <button className="btn link" onClick={() => ir("causas")}>Ver qué se relaciona con las renuncias →</button>
          <button className="btn link" onClick={() => ir("resumen")}>Ver qué puede hacer Recursos Humanos →</button>
          <button className="btn link" onClick={() => ir("simulador")} data-testid="ir-simulador">¿Y si la rotación bajara? →</button>
        </div>
      </section>

      <div className="grid two">
        <Card title="¿Cambia la rotación según el mes de ingreso?" sub="Cada punto es el grupo de personas que ingresó ese mes. La línea punteada es el promedio.">
          <div className="chart" data-testid="graf-cohortes" role="img" aria-label={`Rotación temprana por mes de ingreso: más alta ${alta ? mesLargo(alta.cohorte) : ""} con ${pct(alta?.tasa)}, más baja ${baja ? mesLargo(baja.cohorte) : ""} con ${pct(baja?.tasa)}`}>
            <ResponsiveContainer>
              <LineChart data={coh} margin={{ top: 16, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="cohorte" tickFormatter={mesCorto} tickMargin={6} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tickFormatter={v => `${Math.round(v * 100)} %`} domain={[0, (max: number) => Math.min(1, Math.ceil(max * 10) / 10 + 0.05)]} width={52} />
                <Tooltip content={<Tip render={p => <><div>Ingresaron en <b>{mesLargo(String(p.cohorte))}</b></div><div>Rotación temprana: <b>{pct(p.tasa as number)}</b></div><div>{String(p.renuncias)} renuncias de {String(p.contratados)} personas</div></>} />} />
                {k.tasa !== null && <ReferenceLine y={k.tasa} stroke="var(--fg-3)" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="tasa" stroke="var(--s1)" strokeWidth={2} dot={{ r: 3, fill: "var(--s1)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend"><span><i className="sw" style={{ background: "var(--s1)" }} />Rotación temprana del mes de ingreso</span><span><i className="sw" style={{ background: "var(--fg-3)" }} />Promedio: {pct(k.tasa)}</span></div>
          {coh.length > 1 && alta && baja && <p className="sub" data-testid="lectura-cohortes">Más alta: <b>{mesLargo(alta.cohorte)}</b> ({pct(alta.tasa)}). Más baja: <b>{mesLargo(baja.cohorte)}</b> ({pct(baja.tasa)}). Solo se comparan meses con al menos {nMin} personas.</p>}
          {coh.length === 1 && <p className="sub">Solo hay un mes de ingreso en la selección; amplíe el periodo para ver la tendencia.</p>}
        </Card>

        <Card title="¿En qué mes después del ingreso renuncian más?" sub="Renuncias según los meses que la persona llevaba trabajando (mes 1 = primeros 30 días).">
          <div className="chart" data-testid="graf-meses" role="img" aria-label={`Renuncias por mes de antigüedad; el mes con más renuncias es el ${k.mesCritico}`}>
            <ResponsiveContainer>
              <BarChart data={meses} margin={{ top: 22, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="mes" tickFormatter={m => `Mes ${m}`} />
                <YAxis allowDecimals={false} width={44} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip render={p => <><div>Mes <b>{String(p.mes)}</b> después del ingreso</div><div><b>{String(p.renuncias)}</b> renuncias ({pct(p.pct as number)} del total)</div></>} />} />
                <Bar dataKey="renuncias" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={56}>
                  {meses.map(m => <Cell key={m.mes} fill={m.mes === k.mesCritico ? "var(--s2)" : "var(--muted-mark)"} />)}
                  <LabelList dataKey="renuncias" position="top" fill="var(--fg-2)" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend"><span><i className="sw box" style={{ background: "var(--s2)" }} />Mes con más renuncias</span><span><i className="sw box" style={{ background: "var(--muted-mark)" }} />Otros meses</span></div>
        </Card>
      </div>

      <section className="card economico" data-testid="kpi-costo">
        <div className="economico-fila">
          <div style={{ minWidth: 0 }}>
            <h2>Impacto económico estimado</h2>
            <p className="sub">{c === null ? "Sin datos de costo: el cliente no ha entregado el costo de reemplazar a una persona (HU-05)." : `Renuncias × ${cop(costos!.reclutamiento + costos!.formacion + costos!.improductivo)} por reemplazo (reclutamiento, formación y tiempo improductivo).`}</p>
          </div>
          <div className="economico-val">
            {c === null ? <div className="val na">Sin datos de costo</div> : <div className="val" title={cop(c)}>{copMillones(c)}</div>}
            {c !== null && (simulados ? <span className="pill demo">Supuesto simulado, sin validar</span> : <span className="pill warn">Supuesto del usuario, sin validar</span>)}
            <button className="btn link" onClick={() => setEditCosto(v => !v)} data-testid="abrir-costos" aria-expanded={editCosto}>{c === null ? "Ingresar supuestos de costo" : "Cambiar supuestos"}</button>
          </div>
        </div>
        {editCosto && (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="form">
              {([["reclutamiento", "Reclutamiento"], ["formacion", "Formación"], ["improductivo", "Tiempo improductivo"]] as const).map(([id, n]) => (
                <div className="field" key={id}><label htmlFor={"c-" + id}>{n} (COP por persona)</label>
                  <input id={"c-" + id} type="number" min={0} value={borr[id]} onChange={e => setBorr({ ...borr, [id]: e.target.value })} /></div>
              ))}
            </div>
            {errC && <p className="err" role="alert">{errC}</p>}
            <div className="row"><button className="btn primary" onClick={guardarCosto}>Calcular costo</button><button className="btn" onClick={() => { setCostos(null); setEditCosto(false); setToast("Se quitaron los supuestos de costo"); }}>Quitar supuestos</button><span className="sub">No se guardan: al recargar vuelven los supuestos simulados.</span></div>
          </div>
        )}
      </section>

      <details className="card" data-testid="incluidos-excluidos">
        <summary>Datos que no se incluyeron en el análisis</summary>
        <div className="tbl-wrap" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Grupo</th><th className="r">Personas</th><th>Por qué</th></tr></thead>
          <tbody>
            <tr><td>Incluidas en el análisis</td><td className="r">{fmt(k.contratados)}</td><td>Ingresaron hace al menos seis meses, así que se sabe si renunciaron en ese plazo.</td></tr>
            <tr><td>Aún sin seis meses de seguimiento <Ayuda t="Seis meses de seguimiento" /></td><td className="r">{fmt(k.excluidosSinVentana)}</td><td>Ingresaron hace menos de 180 días: todavía no se sabe si renunciarán antes de los seis meses.</td></tr>
            <tr><td>Despidos antes de seis meses</td><td className="r">{fmt(k.despidos)}</td><td>Cuentan como personas contratadas, pero no como renuncia, porque la definición solo incluye retiros voluntarios.</td></tr>
            <tr><td>Registros con errores</td><td className="r">{fmt(excluidasEtl)}</td><td>Fecha de retiro anterior al ingreso o posterior al corte. Se excluyen de todo el análisis, sin importar los filtros. Además se eliminaron 15 registros duplicados.</td></tr>
          </tbody>
        </table></div>
      </details>

      <details className="card" data-testid="definiciones">
        <summary>Cómo se calcula cada indicador</summary>
        <dl className="glosario" style={{ marginTop: 10 }}>
          <div><dt>Personas contratadas</dt><dd>Personas cuyo mes de ingreso tiene al menos 180 días de seguimiento a la fecha de corte de los datos.</dd></div>
          <div><dt>Renunciaron antes de seis meses</dt><dd>Personas contratadas que renunciaron voluntariamente en sus primeros 180 días.</dd></div>
          <div><dt>Rotación temprana</dt><dd>Renunciaron antes de seis meses ÷ personas contratadas.</dd></div>
          <div><dt>Mes con más renuncias</dt><dd>Mes de antigüedad (1 a 6) en el que ocurrió el mayor número de esas renuncias.</dd></div>
          <div><dt>Impacto económico estimado</dt><dd>Renuncias × costo supuesto de reemplazar a una persona. Es una estimación, no un costo contable.</dd></div>
        </dl>
      </details>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
