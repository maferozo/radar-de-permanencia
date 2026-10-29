import { useMemo, useState } from "react";
import { factores, NOMBRE_VARIABLE, kpis, PLAN } from "../calc";
import type { Contexto } from "../App";
import { Empty, pct, pp, fmt, copiar, aCsv, useToast, Ayuda, Seccion } from "../ui";

export default function Resumen({ filas, nMin, ir }: Contexto) {
  const f = useMemo(() => factores(filas, nMin), [filas, nMin]);
  const k = useMemo(() => kpis(filas), [filas]);
  const [toast, setToast] = useToast();
  const [csv, setCsv] = useState<string | null>(null);
  if (!k.contratados) return <Empty><b>Sin datos para esta selección.</b><br />Use «Restablecer filtros» para volver a ver a todas las personas.</Empty>;

  const exportar = async () => {
    const texto = aCsv(f.map((x, i) => ({ orden: i + 1, factor: NOMBRE_VARIABLE[x.variable], grupo: x.grupo, personas: x.n, tasa_grupo: x.tasa.toFixed(4), tasa_general: x.general.toFixed(4), diferencia_pp: (x.diferencia * 100).toFixed(1), recomendacion: x.recomendacion, responsable_sugerido: PLAN[x.variable].responsable, indicador: PLAN[x.variable].indicador, estado: "Pendiente" })));
    if (await copiar(texto)) setToast("Resumen copiado como CSV"); else setCsv(texto);
  };

  const tarjeta = (x: (typeof f)[number], i: number) => {
    const renunciaron = Math.round(x.tasa * x.n);
    const exceso = Math.round(x.n * x.diferencia);
    return (
      <article className="accion" key={x.variable} data-testid="factor">
        <span className="accion-n" aria-label={`Prioridad ${i + 1}`}>{i + 1}</span>
        <div className="accion-cuerpo">
          <div className="accion-cabeza">
            <h3>{NOMBRE_VARIABLE[x.variable]}: {x.grupo}</h3>
            <span className="accion-dato"><b>{pct(x.tasa)}</b> renunció frente a {pct(x.general)} de promedio · <b style={{ color: "var(--crit)" }}>{pp(x.diferencia)}</b> · {fmt(x.n)} personas</span>
          </div>
          <p className="accion-reco"><span className="paso">Qué recomendamos</span> {x.recomendacion}</p>
          <details className="accion-mas">
            <summary>Por qué importa y cómo verificarlo</summary>
            <ol className="pasos">
              <li><span className="paso">1. Qué encontramos</span><p>{fmt(renunciaron)} de {fmt(x.n)} personas de este grupo renunciaron antes de seis meses ({pct(x.tasa)}).</p></li>
              <li><span className="paso">2. Por qué importa</span><p>Son unas {fmt(exceso)} renuncias más que si el grupo renunciara como el promedio. Es una relación, no una causa demostrada.</p></li>
              <li><span className="paso">3. Qué recomendamos</span><p>{x.recomendacion}</p><Seccion tipo="recomendacion" /></li>
              <li><span className="paso">4. Cómo verificarlo</span><p>{PLAN[x.variable].indicador}. Hoy: {pct(x.tasa)}. Medir en quienes ingresen después de aplicar la acción, al cumplir seis meses.</p></li>
            </ol>
            <p className="sub">Responsable sugerido: <b>{PLAN[x.variable].responsable}</b></p>
          </details>
        </div>
        <div className="accion-lado">
          <span className="pill neutral" data-testid="estado-accion">Pendiente</span>
          <button className="btn sm" onClick={() => ir("causas", x.variable)} data-testid="ver-grafico">Ver en Causas →</button>
        </div>
      </article>
    );
  };

  return (
    <>
      <div className="note demo" data-testid="aviso-simulado"><b>Datos ficticios <Ayuda t="Datos ficticios" />.</b> Las acciones son hipótesis por validar: aún no se ha comprobado que reduzcan la rotación.</div>
      <div className="barra-resumen">
        <p data-testid="mensaje-principal">{f.length ? <><b>{f.length} acciones</b> ordenadas según cuánto se aleja cada grupo del promedio ({pct(k.tasa)}).</> : <>Ningún grupo con al menos {nMin} personas supera el promedio en más de 2 p.p.</>}</p>
        <div className="row"><button className="btn sm" onClick={exportar} disabled={!f.length}>Copiar acciones (CSV)</button><button className="btn sm" onClick={() => ir("simulador")} data-testid="resumen-ir-simulador">Simular una meta →</button></div>
      </div>
      {csv && <textarea readOnly value={csv} rows={6} style={{ width: "100%" }} aria-label="Acciones en CSV" onFocus={e => e.currentTarget.select()} />}

      {f.length < 3 && f.length > 0 && <div className="note warn">Solo {f.length} grupo(s) tienen evidencia suficiente; lo esperado son entre 3 y 5. Amplíe el periodo o reduzca el mínimo en «Más opciones».</div>}
      {!f.length ? <Empty>No hay grupos con evidencia suficiente para esta selección. Amplíe el periodo o use «Restablecer filtros».</Empty> : (
        <div className="acciones" data-testid="lista-factores">{f.map(tarjeta)}</div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
