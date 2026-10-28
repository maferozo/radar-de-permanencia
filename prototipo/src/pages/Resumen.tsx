import { useMemo, useState } from "react";
import { factores, NOMBRE_VARIABLE, kpis, PLAN } from "../calc";
import type { Contexto } from "../App";
import { Empty, pct, pp, fmt, copiar, aCsv, useToast, Ayuda, Seccion } from "../ui";

export default function Resumen({ filas, nMin, ir }: Contexto) {
  const f = useMemo(() => factores(filas, nMin), [filas, nMin]);
  const k = useMemo(() => kpis(filas), [filas]);
  const [toast, setToast] = useToast();
  const [csv, setCsv] = useState<string | null>(null);
  if (!k.contratados) return <Empty><b>Sin datos para esta selección.</b><br />Use «Limpiar filtros» para volver a la vista completa.</Empty>;

  const exportar = async () => {
    const texto = aCsv(f.map((x, i) => ({ orden: i + 1, factor: NOMBRE_VARIABLE[x.variable], grupo: x.grupo, personas: x.n, tasa_grupo: x.tasa.toFixed(4), tasa_general: x.general.toFixed(4), diferencia_pp: (x.diferencia * 100).toFixed(1), recomendacion: x.recomendacion, responsable_sugerido: PLAN[x.variable].responsable, indicador: PLAN[x.variable].indicador, estado: "Pendiente" })));
    if (await copiar(texto)) setToast("Resumen copiado como CSV"); else setCsv(texto);
  };

  return (
    <>
      <div className="note demo" data-testid="aviso-simulado"><b>Ejemplos simulados, no hallazgos comprobados.</b> Los factores se calculan sobre datos ficticios de demostración. Las acciones son hipótesis de intervención: su eficacia no está demostrada y deben evaluarse con el indicador de seguimiento.</div>
      <section className="card">
        <h2>Mensaje principal</h2>
        <p style={{ maxWidth: "70ch" }} data-testid="mensaje-principal">
          En la selección actual, {pct(k.tasa)} de las personas contratadas renunció en sus primeros 180 días ({fmt(k.renuncias)} de {fmt(k.contratados)}), con el pico en el mes {k.mesCritico ?? "—"} de antigüedad.
          {f.length ? <> Los {f.length} factores siguientes concentran tasas por encima del promedio y están ordenados por su diferencia frente a él.</> : <> No hay factores con al menos {nMin} personas y 2 p.p. sobre el promedio.</>}
        </p>
        <div className="row"><button className="btn" onClick={exportar} disabled={!f.length}>Copiar resumen (CSV)</button><button className="btn" onClick={() => ir("simulador")} data-testid="resumen-ir-simulador">Explorar metas en el simulador →</button><span className="sub">Asociación no implica causalidad: valide cada factor antes de actuar. Diferencias en p.p. <Ayuda t="p.p." /></span></div>
        {csv && <textarea readOnly value={csv} rows={6} style={{ width: "100%" }} aria-label="Resumen en CSV" onFocus={e => e.currentTarget.select()} />}
      </section>

      {f.length < 3 && f.length > 0 && <div className="note warn">Solo se encontraron {f.length} factor(es) con evidencia suficiente en esta selección; el resumen requiere entre 3 y 5. Amplíe el período o reduzca el mínimo por grupo.</div>}
      {!f.length ? <Empty>No hay factores con evidencia suficiente para esta selección.</Empty> : (
        <div className="grid" data-testid="lista-factores">
          {f.map((x, i) => (
            <article className="factor plan" key={x.variable} data-testid="factor">
              <header className="plan-head">
                <div style={{ minWidth: 0 }}>
                  <span className="rank">Factor {i + 1} de {f.length}</span>
                  <h3>{NOMBRE_VARIABLE[x.variable]}: {x.grupo}</h3>
                </div>
                <div className="stats">
                  <div><span className="lbl">Tasa del grupo</span><b>{pct(x.tasa)}</b></div>
                  <div><span className="lbl">Tasa general</span><b>{pct(x.general)}</b></div>
                  <div><span className="lbl">Diferencia</span><b style={{ color: "var(--crit)" }}>{pp(x.diferencia)}</b></div>
                  <div><span className="lbl">Personas</span><b>{fmt(x.n)}</b></div>
                </div>
              </header>
              <dl className="plan-dl">
                <div><dt>Hallazgo</dt><dd>El grupo «{x.grupo}» tiene una tasa de rotación temprana de {pct(x.tasa)}, {pp(x.diferencia)} sobre el promedio.</dd></div>
                <div><dt>Evidencia</dt><dd>{fmt(x.n)} personas del grupo, de las cuales {Math.round(x.tasa * x.n)} renunciaron antes de 180 días. <Seccion tipo="descriptivo" /></dd></div>
                <div><dt>Interpretación</dt><dd>{x.interpretacion}</dd></div>
                <div><dt>Recomendación</dt><dd>{x.recomendacion} <Seccion tipo="recomendacion" /></dd></div>
                <div><dt>Responsable sugerido</dt><dd>{PLAN[x.variable].responsable}</dd></div>
                <div><dt>Plazo sugerido</dt><dd>Aplicar a las cohortes que ingresen después de aprobar la acción; evaluar cuando cumplan 180 días.</dd></div>
                <div><dt>Indicador de seguimiento</dt><dd>{PLAN[x.variable].indicador}. Valor actual: {pct(x.tasa)}.</dd></div>
                <div><dt>Estado</dt><dd><span className="pill neutral" data-testid="estado-accion">Pendiente: sin seguimiento registrado</span></dd></div>
              </dl>
              <button className="btn" onClick={() => ir("causas", x.variable)} data-testid="ver-grafico">Ver en Causas →</button>
            </article>
          ))}
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
