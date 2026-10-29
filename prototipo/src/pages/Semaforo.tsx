import { useState } from "react";
import { evaluar, validarCandidato, reglasAlerta, ACCION, Candidato, Evaluacion, ResultadoReglas, LIMITES } from "../calc";
import { COEFS, MODELO, OPCIONES } from "../data";
import { Card, pct, Ayuda } from "../ui";

type Form = Record<keyof Candidato, string>;
const VACIO: Form = { campana: "", turno: "", distancia: "", experiencia: "", educacion: "", canal: "", puntaje: "" };
const EJEMPLO: Form = { campana: OPCIONES.campana[0], turno: "Noche", distancia: "18", experiencia: "0", educacion: "Bachiller", canal: "Portal de empleo", puntaje: "58" };
const UMB = MODELO.umbrales as { amarillo: number; rojo: number };
const MET = MODELO.metricas as { modelo: string; recall: number; precision: number; f1: number; auc: number | null; tasa_falsos_positivos: number; vp: number; fp: number; fn: number; vn: number }[];
const CRIT = MODELO.criterios;
type Br = { atributo: string; brecha_recall_pp: number; brecha_fp_pp: number; cumple: boolean };
const EA = MODELO.evaluacion_ampliada as { n: number; plan_b: (typeof MET)[number]; plan_b_brechas: Br[]; modelo_oof: (typeof MET)[number]; modelo_oof_brechas: Br[] };

function Lampara({ color }: { color: string }) {
  return <div className="lamp" aria-hidden="true">{["rojo", "amarillo", "verde"].map(c => <i key={c} className={c + (c === color ? " on" : "")} />)}</div>;
}

export default function Semaforo() {
  const [modo, setModo] = useState<"modelo" | "reglas">("reglas");
  const [form, setForm] = useState<Form>(EJEMPLO);
  const [esEjemplo, setEsEjemplo] = useState(true);
  const [errores, setErrores] = useState<string[]>([]);
  const [res, setRes] = useState<{ ev?: Evaluacion; rg?: ResultadoReglas; ms: number; modo: string } | null>(null);
  const [ua, setUa] = useState((UMB.amarillo * 100).toFixed(1));
  const [ur, setUr] = useState((UMB.rojo * 100).toFixed(1));
  const [verDetalle, setVerDetalle] = useState(false);

  const umbralErr = (() => {
    const a = Number(ua), r = Number(ur);
    if (!Number.isFinite(a) || !Number.isFinite(r) || a <= 0 || r >= 100) return "Los umbrales deben estar entre 0 % y 100 %.";
    if (a >= r) return "El umbral amarillo debe ser menor que el rojo.";
    return null;
  })();
  const set = (k: keyof Candidato, v: string) => { setForm({ ...form, [k]: v }); setEsEjemplo(false); setRes(null); };
  const invalido = (k: string) => errores.some(e => e.includes(nombreCampo[k]));

  const evaluarCandidato = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validarCandidato(form, OPCIONES);
    if (umbralErr && modo === "modelo") errs.push(umbralErr);
    setErrores(errs);
    if (errs.length) { setRes(null); return; } // CU-05 A1/A2: no se calcula
    const c: Candidato = { ...form, distancia: Number(form.distancia), experiencia: Number(form.experiencia), puntaje: Number(form.puntaje) };
    const t0 = performance.now();
    const out = modo === "modelo" ? { ev: evaluar(c, COEFS, Number(ua) / 100, Number(ur) / 100) } : { rg: reglasAlerta(c) };
    setRes({ ...out, ms: performance.now() - t0, modo });
  };

  const lr = MET[0], ref = MET[1];
  const color = res?.ev?.color ?? res?.rg?.color;
  return (
    <>
      <div className="note good" data-testid="estado-modelo">
        <b>Semáforo oficial: reglas de alerta (plan B) <Ayuda t="Plan B" />.</b> Es un apoyo para la entrevista, no una decisión de contratación. El modelo de regresión logística no se usa para decidir porque no cumple los criterios del proyecto.
        <details style={{ marginTop: 4 }}><summary>¿Por qué no se usa el modelo?</summary><p style={{ marginTop: 4 }}>CU-09, flujo A1: el modelo supera a la referencia, pero
        {!CRIT.cumple_meta_recall && <> no alcanza la meta propuesta de recall ≥ 0,60 (obtuvo {lr.recall.toFixed(3).replace(".", ",")})</>}
        {!CRIT.cumple_equidad && <> y no pasa la revisión de equidad</>}. Las reglas del plan B superan a la referencia y pasan la revisión de equidad en las {EA.n.toLocaleString("es-CO")} personas evaluadas (brecha máxima {Math.max(...EA.plan_b_brechas.map(b => Math.max(b.brecha_recall_pp, b.brecha_fp_pp))).toFixed(1).replace(".", ",")} p.p.), aunque detectan pocas renuncias (recall {pct(EA.plan_b.recall, 0)}). Datos ficticios; reglas y umbrales pendientes de validar con el cliente.</p></details>
      </div>
      <div className="tabs" role="tablist" aria-label="Método de evaluación">
        <button role="tab" aria-selected={modo === "reglas"} onClick={() => { setModo("reglas"); setRes(null); }} data-testid="modo-reglas">Reglas de alerta (semáforo oficial)</button>
        <button role="tab" aria-selected={modo === "modelo"} onClick={() => { setModo("modelo"); setRes(null); }} data-testid="modo-modelo">Modelo estadístico (solo para comparar)</button>
      </div>

      <div className="grid two">
        <Card title="Datos del candidato" sub="Solo información disponible en la entrevista. No se guarda nada de lo que ingrese."
          right={esEjemplo ? <span className="pill demo">Candidato ficticio de ejemplo</span> : undefined}>
          <form onSubmit={evaluarCandidato} noValidate data-testid="form-candidato">
            <div className="form">
              {([["campana", "Campaña", OPCIONES.campana], ["turno", "Turno", OPCIONES.turno], ["educacion", "Nivel educativo", OPCIONES.educacion], ["canal", "Canal de reclutamiento", OPCIONES.canal]] as const).map(([k, n, ops]) => (
                <div className="field" key={k}><label htmlFor={"c-" + k}>{n} *</label>
                  <select id={"c-" + k} value={form[k]} onChange={e => set(k, e.target.value)} aria-invalid={invalido(k)} data-testid={"in-" + k}>
                    <option value="">Seleccione…</option>{ops.map(o => <option key={o}>{o}</option>)}
                  </select></div>
              ))}
              {([["distancia", "Distancia vivienda–trabajo (km)"], ["experiencia", "Experiencia previa (meses)"], ["puntaje", "Puntaje prueba técnica (0–100)"]] as const).map(([k, n]) => (
                <div className="field" key={k}><label htmlFor={"c-" + k}>{n} *</label>
                  <input id={"c-" + k} type="number" inputMode="decimal" min={LIMITES[k][0]} max={LIMITES[k][1]} value={form[k]} onChange={e => set(k, e.target.value)} aria-invalid={invalido(k)} data-testid={"in-" + k} /></div>
              ))}
            </div>
            {errores.length > 0 && <ul className="err" role="alert" data-testid="errores" style={{ margin: "10px 0 0", paddingLeft: 18 }}>{errores.map(e => <li key={e}>{e}</li>)}</ul>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" type="submit" data-testid="evaluar">Evaluar candidato</button>
              <button className="btn" type="button" onClick={() => { setForm(VACIO); setEsEjemplo(false); setRes(null); setErrores([]); }} data-testid="limpiar-form">Limpiar formulario</button>
              <button className="btn" type="button" onClick={() => { setForm(EJEMPLO); setEsEjemplo(true); setRes(null); setErrores([]); }}>Cargar ejemplo</button>
            </div>
          </form>
          <div className="leyenda-semaforo" data-testid="leyenda-colores">
            <span className="lbl">Qué significa cada color</span>
            <p><i className="dot rojo" aria-hidden="true" /><b>Rojo:</b> se cumplen dos señales a la vez (distancia mayor a 15 km con turno nocturno o rotativo, o sin experiencia con puntaje menor a 60).</p>
            <p><i className="dot amarillo" aria-hidden="true" /><b>Amarillo:</b> aparece una sola señal (distancia mayor a 15 km o sin experiencia).</p>
            <p><i className="dot verde" aria-hidden="true" /><b>Verde:</b> ninguna señal de alerta. No garantiza que la persona se quede.</p>
          </div>
          <details><summary>Variables que la herramienta no usa</summary>
            <p className="sub" style={{ marginTop: 6 }}>Por equidad (HU-15): edad, sexo, estado civil, estrato y sus aproximaciones, como barrio o dirección. Por fuga de información: supervisor, desempeño, ausencias y cualquier dato posterior al ingreso. Tampoco se piden nombres ni documentos.</p>
          </details>
          {modo === "modelo" && (
            <div style={{ display: "grid", gap: 8 }}>
              <span className="lbl">Umbrales del semáforo (probabilidad)</span>
              <div className="row">
                <div className="field"><label htmlFor="u-am">Amarillo desde (%)</label><input id="u-am" type="number" step="0.1" value={ua} onChange={e => setUa(e.target.value)} style={{ width: 110 }} aria-invalid={!!umbralErr} data-testid="u-amarillo" /></div>
                <div className="field"><label htmlFor="u-ro">Rojo desde (%)</label><input id="u-ro" type="number" step="0.1" value={ur} onChange={e => setUr(e.target.value)} style={{ width: 110 }} aria-invalid={!!umbralErr} data-testid="u-rojo" /></div>
                <button className="btn" type="button" onClick={() => { setUa((UMB.amarillo * 100).toFixed(1)); setUr((UMB.rojo * 100).toFixed(1)); }}>Restablecer propuesta</button>
              </div>
              {umbralErr ? <p className="err" role="alert">{umbralErr}</p> : <p className="sub">Verde &lt; {ua} % ≤ amarillo &lt; {ur} % ≤ rojo. Propuesta 13.6: rojo para el 20 % de mayor riesgo y amarillo para el 30 % siguiente; debe acordarse con RR. HH.</p>}
            </div>
          )}
        </Card>

        <Card title="Resultado" sub={res ? (res.modo === "modelo" ? "Según el modelo estadístico (no publicado)" : "Según las reglas de alerta") : "Complete el formulario y seleccione «Evaluar candidato»."}>
          {!res ? <div className="empty">El resultado aparecerá aquí: el color, las reglas que lo explican, la acción sugerida y las limitaciones.</div> : (
            <div style={{ display: "grid", gap: 14 }} data-testid="resultado">
              <div className="light">
                <Lampara color={color!} />
                <div>
                  {res.ev && <><span className="lbl">Probabilidad estimada de renuncia temprana</span><div className="prob" data-testid="probabilidad">{pct(res.ev.probabilidad)}</div></>}
                  <span className={"pill " + (color === "rojo" ? "crit" : color === "amarillo" ? "warn" : "good")} data-testid="color">
                    {color === "rojo" ? "Alerta alta · rojo" : color === "amarillo" ? "Alerta media · amarillo" : "Sin alertas · verde"}
                  </span>
                  <p className="sub" style={{ marginTop: 4 }}>{res.ev ? "Modelo no publicado: solo para comparar. No usar para decidir." : "Semáforo oficial: reglas de alerta del plan B (13.10), pendientes de validación con el cliente."}</p>
                </div>
              </div>
              {res.ev && (
                <div className="contrib" data-testid="factores">
                  <span className="lbl">Tres factores que más influyen</span>
                  {res.ev.contribuciones.map(c => {
                    const sube = c.c > 0;
                    return (
                      <div key={c.variable}>
                        <div className="row" style={{ justifyContent: "space-between" }}><b>{c.etiqueta}: {c.valor}</b><span className={sube ? "up" : "down"}>{sube ? "▲ Aumenta el riesgo" : "▼ Disminuye el riesgo"}</span></div>
                        <span className="sub">Contribución (β × x): <span className="num">{c.c >= 0 ? "+" : "−"}{Math.abs(c.c).toFixed(3)}</span> en escala log-odds</span>
                        <span><b>Acción sugerida:</b> {ACCION[c.variable][sube ? 0 : 1]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {res.rg && (
                <>
                <div className="contrib" data-testid="reglas">
                  <span className="lbl">Reglas que se activaron</span>
                  {res.rg.detalle.length ? res.rg.detalle.map(d => <div key={d.regla}><div className="row" style={{ justifyContent: "space-between" }}><b>{d.regla}</b><span className={"pill " + (d.tipo === "combinada" ? "crit" : "warn")}>{d.tipo === "combinada" ? "Regla combinada → rojo" : "Factor suelto → amarillo"}</span></div>
                    <span><b>Datos que la justifican:</b> {d.justificacion}</span><span><b>Acción sugerida:</b> {d.accion}</span></div>) : <div>Ninguna regla de alerta se activó. <span><b>Acción sugerida:</b> seguimiento normal durante la inducción.</span></div>}
                </div>
                <div data-testid="condiciones">
                  <span className="lbl">Condiciones evaluadas</span>
                  <div className="tbl-wrap" style={{ marginTop: 6 }}><table>
                    <thead><tr><th>Condición</th><th>Valor del candidato</th><th>¿Se cumple?</th></tr></thead>
                    <tbody>{res.rg.condiciones.map(c => <tr key={c.id}><td>{c.condicion}</td><td className="num">{c.valor}</td><td><span className={"pill " + (c.cumple ? "warn" : "neutral")}>{c.cumple ? "Sí" : "No"}</span></td></tr>)}</tbody>
                  </table></div>
                  <p className="sub" style={{ marginTop: 6 }}>Rojo: C1 y C2 a la vez, o C3 y C4 a la vez. Amarillo: solo C1 o solo C3. Verde: ninguna regla. Las reglas salen del diagnóstico (Causas) y del ejemplo de la sección 13.10 del documento técnico.</p>
                </div>
                </>
              )}
              <details data-testid="limitaciones"><summary>Limitaciones de esta evaluación</summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
                  {res.rg ? <><li>Las reglas detectan pocas renuncias: en los datos de prueba alertaron sobre {pct(EA.plan_b.recall, 0)} de quienes renunciaron pronto. Un resultado verde no garantiza permanencia.</li>
                    <li>Las reglas y sus umbrales (15 km, puntaje 60) están pendientes de validar con RR. HH. (acta de validación).</li></>
                    : <><li>El modelo no está publicado: no cumple la revisión de equidad ni la meta de recall propuesta. Solo sirve para comparar.</li>
                    <li>Los umbrales de color son una propuesta (sección 13.6) y deben acordarse con RR. HH.</li></>}
                  <li>Todo se calculó con datos ficticios de demostración.</li>
                  <li>No usa edad, sexo, estado civil, estrato, barrio ni dirección, ni el supervisor asignado.</li>
                </ul>
              </details>
              <div className="human" role="note" data-testid="aviso-humano">
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 17c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                La herramienta apoya la decisión; la decisión final corresponde al reclutador.
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title={modo === "reglas" ? "Confiabilidad del semáforo (plan B)" : "Confiabilidad del modelo (no publicado)"} sub={modo === "reglas" ? `Reglas fijas evaluadas en las ${EA.n.toLocaleString("es-CO")} personas con seis meses de seguimiento · datos ficticios` : "Evaluado con meses de ingreso que el modelo no usó para aprender (partición temporal) · datos ficticios"}
        right={<button className="btn" onClick={() => setVerDetalle(v => !v)} data-testid="ver-detalle">{verDetalle ? "Ocultar detalle" : "Ver detalle"}</button>}>
        {(() => { const m = modo === "reglas" ? EA.plan_b : lr; return (
        <div className="grid kpis" data-testid="confiabilidad">
          <div><span className="lbl">Renuncias detectadas (recall) <Ayuda t="Recall" /></span><div className="prob" style={{ fontSize: "1.6rem" }}>{pct(m.recall, 0)}</div><p className="sub">De cada 10 personas que renunciaron pronto, habría alertado sobre {Math.round(m.recall * 10)}. Meta propuesta para el modelo: 60 %.</p></div>
          <div><span className="lbl">Alertas acertadas (precisión) <Ayuda t="Precisión" /></span><div className="prob" style={{ fontSize: "1.6rem" }}>{pct(m.precision, 0)}</div><p className="sub">De cada 10 alertas, {Math.round(m.precision * 10)} fueron renuncias reales.</p></div>
          <div><span className="lbl">Falsas alarmas</span><div className="prob" style={{ fontSize: "1.6rem" }}>{m.fp}</div><p className="sub">Personas que se quedaron pero recibieron alerta ({pct(m.tasa_falsos_positivos, 0)} de quienes se quedaron).</p></div>
          <div><span className="lbl">Frente a la referencia</span><div className="prob" style={{ fontSize: "1.6rem" }}>{modo === "reglas" ? `${m.vp} vs. 0` : `AUC ${lr.auc?.toFixed(2).replace(".", ",")}`}</div><p className="sub">La referencia «todos se quedan» no detecta ninguna renuncia{modo === "reglas" ? "." : " (AUC 0,50)."}</p></div>
        </div>); })()}
        {verDetalle && (
          <div style={{ display: "grid", gap: 12 }} data-testid="detalle-confiabilidad">
            <div className="tbl-wrap"><table>
              <thead><tr><th>Modelo o criterio</th><th className="r">Recall</th><th className="r">Precisión</th><th className="r">F1</th><th className="r">AUC</th><th className="r">Tasa FP</th><th className="r">Detectadas</th><th className="r">Falsas alarmas</th></tr></thead>
              <tbody>{[...MET, MODELO.plan_b].map((m: typeof lr) => <tr key={m.modelo} className={m === ref ? "dim" : ""}><td>{m.modelo}</td><td className="r">{m.recall.toFixed(3)}</td><td className="r">{m.precision.toFixed(3)}</td><td className="r">{m.f1.toFixed(3)}</td><td className="r">{m.auc?.toFixed(3) ?? "—"}</td><td className="r">{m.tasa_falsos_positivos.toFixed(3)}</td><td className="r">{m.vp} de {m.vp + m.fn}</td><td className="r">{m.fp}</td></tr>)}</tbody>
            </table></div>
            <h3>Revisión de equidad del plan B ({EA.n.toLocaleString("es-CO")} personas) <Ayuda t="Equidad" /></h3>
            <div className="tbl-wrap"><table data-testid="equidad-plan-b">
              <thead><tr><th>Atributo</th><th className="r">Diferencia de recall</th><th className="r">Diferencia de tasa FP</th><th>Criterio ≤ {CRIT.equidad_max_pp} p.p.</th></tr></thead>
              <tbody>{EA.plan_b_brechas.map(b => <tr key={b.atributo}><td>{b.atributo.replace("_grupo", "").replace("_", " ")}</td><td className="r">{b.brecha_recall_pp.toFixed(1)} p.p.</td><td className="r">{b.brecha_fp_pp.toFixed(1)} p.p.</td><td><span className={"pill " + (b.cumple ? "good" : "crit")}>{b.cumple ? "Cumple" : "No cumple"}</span></td></tr>)}</tbody>
            </table></div>
            <h3>Revisión de equidad del modelo (partición temporal, variables sensibles simuladas)</h3>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Atributo</th><th className="r">Diferencia de recall</th><th className="r">Diferencia de tasa FP</th><th>Criterio ≤ {CRIT.equidad_max_pp} p.p.</th></tr></thead>
              <tbody>{(MODELO.brechas as { atributo: string; brecha_recall_pp: number; brecha_fp_pp: number; cumple: boolean }[]).map(b => <tr key={b.atributo}><td>{b.atributo.replace("_grupo", "").replace("_", " ")}</td><td className="r">{b.brecha_recall_pp.toFixed(1)} p.p.</td><td className="r">{b.brecha_fp_pp.toFixed(1)} p.p.</td><td><span className={"pill " + (b.cumple ? "good" : "crit")}>{b.cumple ? "Cumple" : "No cumple"}</span></td></tr>)}</tbody>
            </table></div>
            <p className="sub">Verificación de robustez del modelo con validación cruzada ({EA.n.toLocaleString("es-CO")} personas): recall {EA.modelo_oof.recall.toFixed(3).replace(".", ",")}, AUC {EA.modelo_oof.auc?.toFixed(3).replace(".", ",")}; brecha por estado civil {EA.modelo_oof_brechas.find(b => b.atributo === "estado_civil")?.brecha_recall_pp.toFixed(1).replace(".", ",")} p.p. (no cumple). Partición: entrenamiento {MODELO.particion.train} (n = {MODELO.particion.n_train}); prueba {MODELO.particion.test} (n = {MODELO.particion.n_test}). Umbral de clasificación 0,5 con class_weight="balanced"; C = {MODELO.C}. La máxima asociación entre una variable de entrada y una sensible es V de Cramér = {MODELO.proxy_max[0].v_cramer} (límite 0,5).</p>
          </div>
        )}
      </Card>
    </>
  );
}

const nombreCampo: Record<string, string> = { campana: "Campaña", turno: "Turno", distancia: "Distancia", experiencia: "Experiencia previa", educacion: "Nivel educativo", canal: "Canal de reclutamiento", puntaje: "Puntaje de la prueba técnica" };
