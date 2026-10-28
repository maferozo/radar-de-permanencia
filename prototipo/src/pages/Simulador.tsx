import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from "recharts";
import { kpis, simularEscenario, validarMeta, validarCosto, Escenario, TODOS } from "../calc";
import type { Contexto } from "../App";
import { Card, Empty, Tip, pct, fmt, cop, copMillones, Ayuda, copiar, aCsv, useToast } from "../ui";
import { COSTOS_SIM, CALIDAD } from "../data";

const MAX_GUARDADOS = 3;
const LETRAS = ["A", "B", "C"];
interface Guardado { nombre: string; poblacion: string; e: Escenario }
const dec1 = (x: number) => x.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signo = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + fmt(Math.abs(x));
const signoCop = (x: number) => (x > 0 ? "+" : x < 0 ? "−" : "") + cop(Math.abs(x));

export default function Simulador({ filas, filtros, costos, ir }: Contexto) {
  const k = useMemo(() => kpis(filas), [filas]);
  const costoBase = costos ? costos.reclutamiento + costos.formacion + costos.improductivo : COSTOS_SIM.reclutamiento + COSTOS_SIM.formacion + COSTOS_SIM.improductivo;
  const costoEsSimulado = !costos || (costos.reclutamiento === COSTOS_SIM.reclutamiento && costos.formacion === COSTOS_SIM.formacion && costos.improductivo === COSTOS_SIM.improductivo);
  const tasaTxt = (t: number | null) => (t === null ? "" : dec1(t * 100));
  const [metaTxt, setMetaTxt] = useState<string | null>(null); // null = usar la tasa actual de la selección
  const [costoTxt, setCostoTxt] = useState<string | null>(null); // null = usar el supuesto configurado
  const [guardados, setGuardados] = useState<Guardado[]>([]);
  const [toast, setToast] = useToast();
  const [csv, setCsv] = useState<string | null>(null);

  const metaShown = metaTxt ?? tasaTxt(k.tasa);
  const costoShown = costoTxt ?? String(costoBase);
  const vm = validarMeta(metaShown), vc = validarCosto(costoShown);
  const meta = metaTxt === null ? k.tasa : "valor" in vm ? vm.valor : null;
  const costo = "valor" in vc ? vc.valor : null;
  const e = k.contratados && meta !== null && costo !== null ? simularEscenario(k.contratados, k.renuncias, meta, costo) : null;
  const poblacion = `Cohortes ${filtros.desde} a ${filtros.hasta} · ${filtros.campana === TODOS ? "todas las campañas" : filtros.campana} · ${filtros.supervisor === TODOS ? "todos los supervisores" : filtros.supervisor}`;
  const excluidasEtl = (CALIDAD.reglas as { regla: string; registros_afectados: number }[]).find(r => r.regla === "Coherencia de fechas")?.registros_afectados ?? 0;

  if (!k.contratados) return <Empty><b>No disponible: no hay personas en la selección.</b><br />El simulador necesita al menos una persona de cohortes con 180 días de observación. Use «Limpiar filtros» para volver a la vista completa.</Empty>;

  const restablecer = () => { setMetaTxt(null); setCostoTxt(null); setToast("Escenario restablecido a la situación actual"); };
  const guardar = () => {
    if (!e || guardados.length >= MAX_GUARDADOS) return;
    const usadas = guardados.map(g => g.nombre);
    const nombre = "Escenario " + (LETRAS.find(l => !usadas.includes("Escenario " + l)) ?? String(guardados.length + 1));
    setGuardados([...guardados, { nombre, poblacion, e }]); setToast(`${nombre} guardado para comparar`);
  };
  const exportar = async () => {
    const texto = aCsv(guardados.map(g => ({
      escenario: g.nombre, poblacion: g.poblacion, personas: g.e.n, renuncias_observadas: g.e.renuncias, tasa_actual_pct: (g.e.tasaActual * 100).toFixed(2), tasa_objetivo_pct: (g.e.meta * 100).toFixed(2),
      renuncias_estimadas: g.e.renunciasEstimadas, diferencia_renuncias: g.e.difRenuncias, costo_por_reemplazo_cop: g.e.costoUnitario, costo_referencia_cop: g.e.costoReferencia,
      costo_escenario_cop: g.e.costoEscenario, diferencia_costos_cop: g.e.difCosto, supuesto: "Datos ficticios de demostración; costo supuesto sin validar; escenario hipotético",
    })));
    if (await copiar(texto)) { setCsv(null); setToast("Comparación copiada como CSV"); } else setCsv(texto);
  };

  const mensaje = !e ? null : e.tipo === "menor rotación"
    ? "Este escenario representa una reducción hipotética de la rotación. El resultado dependerá de las acciones que implemente la empresa y de otros factores que influyen en la permanencia."
    : e.tipo === "mayor rotación"
      ? "Este escenario representa una rotación mayor que la actual: no es una mejora, sino un escenario desfavorable que sirve para dimensionar el riesgo."
      : "La meta coincide con la situación actual: no hay diferencia estimada.";
  const datosTasa = e ? [{ nombre: "Situación actual", valor: e.tasaActual, color: "var(--muted-mark)" }, { nombre: "Meta propuesta", valor: e.meta, color: "var(--s1)" }] : [];
  const datosCosto = e ? [{ nombre: "Situación actual", valor: e.costoReferencia, color: "var(--muted-mark)" }, { nombre: "Meta propuesta", valor: e.costoEscenario, color: "var(--s1)" }] : [];

  return (
    <>
      <div className="note demo" data-testid="aviso-simulador">
        <b>Escenarios hipotéticos <Ayuda t="Escenario hipotético" />.</b> Modifica los supuestos para explorar escenarios hipotéticos. Los resultados son estimaciones y no representan ahorros ni reducciones garantizadas. Datos ficticios de demostración.
      </div>

      <Card title="Situación actual" sub={`Población de referencia según los filtros activos: ${poblacion}.`}>
        <div className="grid kpis" data-testid="sim-actual">
          <div className="kpi-plain"><p className="lbl">Personas incluidas</p><div className="val" data-testid="sim-n">{fmt(k.contratados)}</div><p className="sub">Cohortes con 180 días de observación</p></div>
          <div className="kpi-plain"><p className="lbl">Renuncias tempranas</p><div className="val" data-testid="sim-r">{fmt(k.renuncias)}</div><p className="sub">Observadas en esa población</p></div>
          <div className="kpi-plain"><p className="lbl">Tasa actual</p><div className="val" data-testid="sim-tasa">{pct(k.tasa)}</div><p className="sub">Renuncias ÷ personas incluidas</p></div>
          <div className="kpi-plain"><p className="lbl">Costo supuesto por reemplazo <Ayuda t="Costo supuesto" /></p><div className="val" style={{ fontSize: "1.15rem" }}>{cop(costoBase)}</div><p className="sub">{costoEsSimulado ? "Supuesto simulado del equipo, sin validar" : "Supuesto ingresado en el Panorama, sin validar"}</p></div>
          <div className="kpi-plain"><p className="lbl">Costo asociado a las renuncias</p><div className="val" style={{ fontSize: "1.15rem" }} title={cop(k.renuncias * costoBase)}>{copMillones(k.renuncias * costoBase)}</div><p className="sub">Estimado con el supuesto; no es un costo real</p></div>
        </div>
        <p className="sub">{fmt(k.excluidosSinVentana)} personas de cohortes recientes quedan fuera porque aún no cumplen 180 días; además, el proceso de calidad excluyó {excluidasEtl} registros con fechas imposibles en todo el conjunto.</p>
      </Card>

      <div className="grid two">
        <Card title="Configuración del escenario" sub="Los cambios son temporales: no modifican los datos ni los demás módulos.">
          <div className="sim-form">
            <div className="field">
              <label htmlFor="sim-meta">Meta de rotación temprana (%)</label>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input id="sim-meta-rango" type="range" min={0} max={100} step={1} value={meta !== null ? Math.round(meta * 100) : 0}
                  onChange={x => setMetaTxt(x.target.value)} aria-label="Meta de rotación temprana, deslizador" aria-valuetext={`${metaShown} %`} data-testid="sim-meta-rango" style={{ flex: 1, minWidth: 0 }} />
                <input id="sim-meta" type="text" inputMode="decimal" value={metaShown} onChange={x => setMetaTxt(x.target.value)} aria-invalid={"error" in vm} aria-describedby="sim-meta-ayuda" data-testid="sim-meta" style={{ width: 90 }} />
                <span aria-hidden="true">%</span>
              </div>
              {"error" in vm ? <p className="err" role="alert" id="sim-meta-ayuda" data-testid="sim-meta-error">{vm.error}</p>
                : <p className="sub" id="sim-meta-ayuda">Actual: {pct(k.tasa)}. Use el deslizador (pasos de 1 punto) o escriba un valor con decimales.</p>}
            </div>
            <div className="field">
              <label htmlFor="sim-costo">Costo por reemplazo (COP) <Ayuda t="Costo supuesto" /></label>
              <input id="sim-costo" type="text" inputMode="numeric" value={costoShown} onChange={x => setCostoTxt(x.target.value)} aria-invalid={"error" in vc} aria-describedby="sim-costo-ayuda" data-testid="sim-costo" />
              {"error" in vc ? <p className="err" role="alert" id="sim-costo-ayuda" data-testid="sim-costo-error">{vc.error}</p>
                : <p className="sub" id="sim-costo-ayuda">{costo !== null ? cop(costo) : ""} por persona · supuesto que debe validarse con el cliente.{costo === 0 && " Con costo 0 los montos serán 0 por el supuesto ingresado, no porque reemplazar personal no cueste."}</p>}
            </div>
            <div className="field">
              <span className="lbl">Población analizada</span>
              <p data-testid="sim-poblacion"><b>{fmt(k.contratados)}</b> personas y <b>{fmt(k.renuncias)}</b> renuncias tempranas de la selección actual.</p>
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={restablecer} data-testid="sim-restablecer">Restablecer escenario</button>
            <button className="btn primary" onClick={guardar} disabled={!e || guardados.length >= MAX_GUARDADOS} data-testid="sim-guardar">Guardar escenario para comparar</button>
            <span className="sub">{guardados.length >= MAX_GUARDADOS ? "Límite de 3 escenarios: elimine uno para guardar otro." : `${guardados.length} de ${MAX_GUARDADOS} guardados`}</span>
          </div>
        </Card>

        <Card title="Resultados del escenario" sub="Se actualizan al cambiar la meta o el costo.">
          {!e ? <div className="empty" role="status" data-testid="sim-sin-resultado">Corrija los datos del escenario para ver los resultados.</div> : (
            <div style={{ display: "grid", gap: 12 }} data-testid="sim-resultados">
              <div className="sim-res">
                <div><span className="lbl">Situación actual</span><b data-testid="res-tasa-actual">{pct(e.tasaActual)}</b></div>
                <div><span className="lbl">Meta propuesta</span><b data-testid="res-meta">{pct(e.meta)}</b></div>
                <div><span className="lbl">Diferencia de tasas <Ayuda t="p.p." /></span><b data-testid="res-dif-pp">{e.difPp === 0 ? "0,0" : (e.difPp > 0 ? "−" : "+") + dec1(Math.abs(e.difPp))} p.p.</b></div>
                <div><span className="lbl">Renuncias estimadas en el escenario</span><b data-testid="res-renuncias">{fmt(e.renunciasEstimadas)}</b></div>
                <div><span className="lbl">Diferencia potencial de renuncias</span><b data-testid="res-dif-renuncias">{e.difRenuncias === 0 ? "0" : `${fmt(Math.abs(e.difRenuncias))} ${e.difRenuncias > 0 ? "menos" : "más"}`}</b></div>
                <div><span className="lbl">Costo asociado a la situación actual</span><b data-testid="res-costo-ref">{cop(e.costoReferencia)}</b></div>
                <div><span className="lbl">Costo asociado al escenario</span><b data-testid="res-costo-esc">{cop(e.costoEscenario)}</b></div>
                <div><span className="lbl">Diferencia estimada de costos</span><b data-testid="res-dif-costo">{e.difCosto === 0 ? cop(0) : `${cop(Math.abs(e.difCosto))} ${e.difCosto > 0 ? "menos" : "más"}`}</b></div>
              </div>
              <p className={"note " + (e.tipo === "mayor rotación" ? "warn" : "")} data-testid="sim-mensaje"><b>{e.tipo === "menor rotación" ? "Escenario de menor rotación (hipotético)." : e.tipo === "mayor rotación" ? "Escenario de mayor rotación." : "Sin diferencia."}</b> {mensaje}</p>
            </div>
          )}
        </Card>
      </div>

      {e && (
        <div className="grid two">
          <Card title="Tasa de rotación: actual frente a la meta" sub="Misma escala de 0 a 100 %">
            <div className="chart sm" data-testid="sim-graf-tasa" role="img" aria-label={`Tasa actual ${pct(e.tasaActual)} frente a la meta ${pct(e.meta)}`}>
              <ResponsiveContainer>
                <BarChart data={datosTasa} layout="vertical" margin={{ top: 8, right: 70, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)} %`} />
                  <YAxis type="category" dataKey="nombre" width={120} />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip render={p => <><b>{String(p.nombre)}</b>: {pct(p.valor as number)}</>} />} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={30} isAnimationActive={false}>
                    {datosTasa.map(d => <Cell key={d.nombre} fill={d.color} />)}
                    <LabelList dataKey="valor" position="right" formatter={(v: number) => pct(v)} fill="var(--fg-2)" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="legend"><span><i className="sw box" style={{ background: "var(--muted-mark)" }} />Situación actual</span><span><i className="sw box" style={{ background: "var(--s1)" }} />Meta propuesta</span></div>
          </Card>
          <Card title="Costo asociado: actual frente a la meta" sub="Estimado con el costo supuesto por reemplazo">
            <div className="chart sm" data-testid="sim-graf-costo" role="img" aria-label={`Costo actual ${cop(e.costoReferencia)} frente al del escenario ${cop(e.costoEscenario)}`}>
              <ResponsiveContainer>
                <BarChart data={datosCosto} layout="vertical" margin={{ top: 8, right: 120, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" domain={[0, (m: number) => (m > 0 ? m : 1)]} tickFormatter={v => `${Math.round(v / 1e6).toLocaleString("es-CO")} M`} />
                  <YAxis type="category" dataKey="nombre" width={120} />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip render={p => <><b>{String(p.nombre)}</b>: {cop(p.valor as number)}</>} />} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={30} isAnimationActive={false}>
                    {datosCosto.map(d => <Cell key={d.nombre} fill={d.color} />)}
                    <LabelList dataKey="valor" position="right" formatter={(v: number) => copMillones(v)} fill="var(--fg-2)" fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="legend"><span><i className="sw box" style={{ background: "var(--muted-mark)" }} />Situación actual</span><span><i className="sw box" style={{ background: "var(--s1)" }} />Meta propuesta</span><span>Eje en millones de pesos</span></div>
          </Card>
        </div>
      )}

      <Card title="Comparación de escenarios" sub="Hasta 3 escenarios en esta sesión. Cada uno conserva su meta, su costo y la población con la que se guardó."
        right={<button className="btn" onClick={exportar} disabled={!guardados.length} data-testid="sim-exportar">Copiar comparación (CSV)</button>}>
        {!guardados.length ? <div className="empty" role="status">Aún no hay escenarios guardados. Ajuste la meta y seleccione «Guardar escenario para comparar».</div> : (
          <div className="tbl-wrap"><table data-testid="sim-tabla">
            <thead><tr><th>Escenario</th><th className="r">Tasa objetivo</th><th className="r">Renuncias estimadas</th><th className="r">Diferencia de renuncias</th><th className="r">Costo por reemplazo</th><th className="r">Costo asociado</th><th className="r">Diferencia de costos</th><th>Población</th></tr></thead>
            <tbody>{guardados.map((g, i) => (
              <tr key={g.nombre}>
                <td style={{ whiteSpace: "nowrap" }}><b>{g.nombre}</b><div className="sub">{g.e.tipo}</div><button className="btn sm" style={{ marginTop: 6 }} onClick={() => { setGuardados(guardados.filter((_, j) => j !== i)); setToast(`${g.nombre} eliminado`); }} aria-label={`Eliminar ${g.nombre}`} data-testid="sim-eliminar">Eliminar</button></td>
                <td className="r">{pct(g.e.meta)}</td><td className="r">{fmt(g.e.renunciasEstimadas)}</td><td className="r">{signo(-g.e.difRenuncias)}</td>
                <td className="r">{cop(g.e.costoUnitario)}</td><td className="r">{cop(g.e.costoEscenario)}</td><td className="r">{signoCop(-g.e.difCosto)}</td>
                <td className="sub" style={{ minWidth: 180 }}>{g.poblacion}{g.poblacion !== poblacion && <div className="err">Distinta a la selección actual</div>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {guardados.length > 0 && <p className="sub">Diferencias frente a las renuncias y el costo observados: un signo «−» indica menos renuncias o menos costo en el escenario hipotético; «+», más.</p>}
        {csv && <textarea readOnly value={csv} rows={5} style={{ width: "100%" }} aria-label="Comparación en CSV; seleccione y copie" onFocus={x => x.currentTarget.select()} />}
      </Card>

      <details className="card" data-testid="sim-formulas">
        <summary>Cómo se calculan estos resultados</summary>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
          <li><b>N</b> = personas de la selección con 180 días de observación; <b>R</b> = renuncias tempranas observadas; tasa actual = R ÷ N (la misma definición del Panorama).</li>
          <li>Renuncias estimadas = redondeo de N × meta. Si la meta, con un decimal, es igual a la tasa actual, se usan las R observadas para que la diferencia sea 0.</li>
          <li>Diferencia de renuncias = R − renuncias estimadas (positiva = menos renuncias en el escenario).</li>
          <li>Costo de referencia = R × costo por reemplazo; costo del escenario = renuncias estimadas × costo; diferencia = referencia − escenario. Se redondea solo al mostrar.</li>
          <li>Límites: es una aproximación con un número fijo de personas; no es una predicción estadística, no demuestra que una acción reduzca la rotación y no incluye nuevas contrataciones, cambios salariales ni de demanda. No se proyecta a periodos futuros.</li>
          <li>Ejemplo con la vista completa: N = 2.528, R = 780, meta 25 % → 632 renuncias estimadas (148 menos); con $2.550.000 por reemplazo: $1.989.000.000 frente a $1.611.600.000, diferencia de $377.400.000. Es un ejemplo hipotético, no una promesa de ahorro.</li>
        </ul>
      </details>
      <div className="row"><button className="btn" onClick={() => ir("resumen")}>← Ver factores en Resumen y acciones</button></div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
