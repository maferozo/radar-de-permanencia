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
      <article className="factor plan" key={x.variable} data-testid="factor">
        <header className="plan-head">
          <div style={{ minWidth: 0 }}>
            <span className="rank">Prioridad {i + 1} de {f.length}</span>
            <h3>{NOMBRE_VARIABLE[x.variable]}: {x.grupo}</h3>
          </div>
          <div className="stats">
            <div><span className="lbl">% que renunció</span><b>{pct(x.tasa)}</b></div>
            <div><span className="lbl">Promedio</span><b>{pct(x.general)}</b></div>
            <div><span className="lbl">Diferencia</span><b style={{ color: "var(--crit)" }}>{pp(x.diferencia)}</b></div>
            <div><span className="lbl">Personas</span><b>{fmt(x.n)}</b></div>
          </div>
        </header>
        <ol className="pasos">
          <li><span className="paso">1. Qué encontramos</span><p>{pct(x.tasa)} de este grupo renunció antes de seis meses, frente a {pct(x.general)} en promedio. Son {fmt(renunciaron)} de {fmt(x.n)} personas.</p><Seccion tipo="descriptivo" /></li>
          <li><span className="paso">2. Por qué importa</span><p>Equivale a unas {fmt(exceso)} renuncias más de las que habría si este grupo renunciara como el promedio. Es una relación observada, no una causa demostrada.</p></li>
          <li><span className="paso">3. Qué recomendamos</span><p>{x.recomendacion}</p><Seccion tipo="recomendacion" /></li>
          <li><span className="paso">4. Cómo verificarlo</span><p>{PLAN[x.variable].indicador}. Hoy: {pct(x.tasa)}. Medir en quienes ingresen después de aplicar la acción, cuando cumplan seis meses.</p></li>
        </ol>
        <div className="plan-pie">
          <span className="sub">Responsable sugerido: <b>{PLAN[x.variable].responsable}</b></span>
          <span className="pill neutral" data-testid="estado-accion">Pendiente: sin seguimiento registrado</span>
          <button className="btn sm" onClick={() => ir("causas", x.variable)} data-testid="ver-grafico">Ver el detalle en Causas →</button>
        </div>
      </article>
    );
  };

  return (
    <>
      <div className="note demo" data-testid="aviso-simulado"><b>Calculado con datos ficticios de demostración.</b> Las acciones son hipótesis para evaluar: todavía no se ha comprobado que reduzcan la rotación. Cada una indica cómo verificar si funciona.</div>
      <section className="card hallazgo">
        <h2>En resumen</h2>
        <p style={{ maxWidth: "75ch" }} data-testid="mensaje-principal">
          {pct(k.tasa)} de las personas contratadas renunció antes de seis meses ({fmt(k.renuncias)} de {fmt(k.contratados)}); el mes {k.mesCritico ?? "—"} después del ingreso es el de más renuncias.
          {f.length ? <> Estos son los {f.length} grupos que más se alejan del promedio, del más al menos importante.</> : <> Ningún grupo con al menos {nMin} personas supera el promedio en más de 2 p.p.</>}
        </p>
        <div className="row"><button className="btn" onClick={exportar} disabled={!f.length}>Copiar acciones (CSV)</button><button className="btn" onClick={() => ir("simulador")} data-testid="resumen-ir-simulador">¿Y si la rotación bajara? Simular una meta →</button><span className="sub">Diferencias en p.p. <Ayuda t="p.p." /></span></div>
        {csv && <textarea readOnly value={csv} rows={6} style={{ width: "100%" }} aria-label="Acciones en CSV" onFocus={e => e.currentTarget.select()} />}
      </section>

      {f.length < 3 && f.length > 0 && <div className="note warn">Solo {f.length} grupo(s) tienen evidencia suficiente en esta selección; lo esperado son entre 3 y 5. Amplíe el periodo o reduzca el mínimo de personas por grupo en «Opciones avanzadas».</div>}
      {!f.length ? <Empty>No hay grupos con evidencia suficiente para esta selección. Amplíe el periodo o use «Restablecer filtros».</Empty> : (
        <div className="grid" data-testid="lista-factores">
          {f.slice(0, 3).map(tarjeta)}
          {f.length > 3 && (
            <details className="card mas-factores">
              <summary>Ver {f.length - 3} {f.length - 3 === 1 ? "acción" : "acciones"} de menor prioridad</summary>
              <div className="grid" style={{ marginTop: 12 }}>{f.slice(3).map((x, j) => tarjeta(x, j + 3))}</div>
            </details>
          )}
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
