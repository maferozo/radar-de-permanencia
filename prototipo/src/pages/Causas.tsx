import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ReferenceLine } from "recharts";
import { porGrupo, conclusionPrueba, topPerfiles, Variable, NOMBRE_VARIABLE, Grupo, motivos, sinRespuesta, contraste, factores, rankingFactores, RECOMENDACION, FilaRanking } from "../calc";
import type { Contexto } from "../App";
import { Fragment } from "react";
import { Card, Empty, Tip, pct, pp, fmt, Ayuda, Seccion } from "../ui";

const PERFIL: Variable[] = ["rangoDistancia", "turno", "rangoExperiencia", "educacion", "canal", "campana"];

function GraficoGrupos({ grupos, general, alto = 280, horizontal = false, resaltar = [] as string[], testid, leyenda = true }: { grupos: Grupo[]; general: number | null; alto?: number; horizontal?: boolean; resaltar?: string[]; testid?: string; leyenda?: boolean }) {
  const color = (g: Grupo) => !g.suficiente ? "var(--muted-mark)" : resaltar.includes(g.grupo) ? "var(--s2)" : "var(--s1)";
  const data = grupos.filter(g => g.grupo !== "Sin dato").map(g => ({ ...g, etiqueta: g.suficiente ? `${pct(g.tasa, 0)} · n=${g.n}` : `n=${g.n} (no se compara)` }));
  const tip = <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip render={p => <><div><b>{String(p.grupo)}</b></div><div>Tasa: <b>{pct(p.tasa as number)}</b> ({pp(p.diferencia as number)} vs. promedio)</div><div>{String(p.renuncias)} renuncias de {String(p.n)} personas</div>{!p.suficiente && <div className="err">Grupo menor al mínimo: no se compara.</div>}</>} />} />;
  return (
    <>
    <div className="chart" style={{ height: alto }} data-testid={testid}>
      <ResponsiveContainer>
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 110, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickFormatter={v => `${Math.round(v * 100)} %`} domain={[0, (m: number) => Math.min(1, Math.ceil(m * 10) / 10)]} />
            <YAxis type="category" dataKey="grupo" width={64} />
            {tip}
            {general !== null && <ReferenceLine x={general} stroke="var(--fg-3)" strokeDasharray="4 4" />}
            <Bar dataKey="tasa" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={18}>
              {data.map(g => <Cell key={g.grupo} fill={color(g)} />)}
              <LabelList dataKey="etiqueta" position="right" fill="var(--fg-2)" fontSize={11} />
            </Bar>
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: -12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="grupo" interval={0} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `${Math.round(v * 100)} %`} width={48} domain={[0, (m: number) => Math.min(1, Math.ceil(m * 10) / 10 + 0.05)]} />
            {tip}
            {general !== null && <ReferenceLine y={general} stroke="var(--fg-3)" strokeDasharray="4 4" />}
            <Bar dataKey="tasa" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={64}>
              {data.map(g => <Cell key={g.grupo} fill={color(g)} />)}
              <LabelList dataKey="tasa" position="top" formatter={(v: number) => pct(v, 0)} fill="var(--fg-2)" fontSize={11} />
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
    {leyenda && general !== null && <div className="legend"><span><i className="sw" style={{ background: "var(--fg-3)" }} />Promedio {pct(general)}</span>{grupos.some(g => !g.suficiente && g.grupo !== "Sin dato") && <span><i className="sw box" style={{ background: "var(--muted-mark)" }} />Grupo pequeño (no se compara)</span>}</div>}
    </>
  );
}

function TablaGrupos({ grupos, nMin }: { grupos: Grupo[]; nMin: number }) {
  return (
    <details><summary>Ver los datos en tabla</summary>
      <div className="tbl-wrap" style={{ marginTop: 8 }}><table>
        <thead><tr><th>Grupo</th><th className="r">Personas</th><th className="r">Renunciaron</th><th className="r">% que renunció</th><th className="r">Diferencia con el promedio</th><th>Se puede comparar</th></tr></thead>
        <tbody>{grupos.map(g => <tr key={g.grupo} className={g.suficiente ? "" : "dim"}><td>{g.grupo}</td><td className="r">{fmt(g.n)}</td><td className="r">{fmt(g.renuncias)}</td><td className="r">{pct(g.tasa)}</td><td className="r">{pp(g.diferencia)}</td><td>{g.suficiente ? "Sí" : `No (n < ${nMin})`}</td></tr>)}</tbody>
      </table></div>
    </details>
  );
}

const LECTURA: Record<FilaRanking["estado"], [string, string, string]> = {
  prioritario: ["Prioritario", "crit", "Más de 5 p.p. sobre el promedio en un grupo comparable."],
  leve: ["Diferencia leve", "warn", "Entre 2 y 5 p.p. sobre el promedio."],
  "sin diferencia": ["Sin diferencia relevante", "neutral", "Ningún grupo comparable supera el promedio en más de 2 p.p."],
  "no comparable": ["No comparable", "neutral", "Los grupos no alcanzan el mínimo de personas; no se sacan conclusiones."],
};

function Ranking({ filas, nMin, ir }: { filas: FilaRanking[]; nMin: number; ir: (v: Variable) => void }) {
  const [abierta, setAbierta] = useState<Variable | null>(null);
  return (
    <div className="tbl-wrap"><table data-testid="ranking-factores">
      <thead><tr><th>#</th><th>Factor y grupo con más renuncias</th><th className="r">% que renunció</th><th className="r">Diferencia</th><th>Lectura <Ayuda t="Prioritario" /></th><th className="r">Personas</th><th><span className="sr">Detalle</span></th></tr></thead>
      <tbody>{filas.map((f, i) => {
        const [et, cls, expl] = LECTURA[f.estado]; const ab = abierta === f.variable;
        return (
          <Fragment key={f.variable}>
            <tr className={f.estado === "no comparable" ? "dim" : f.estado === "prioritario" ? "hl" : ""}>
              <td className="num">{i + 1}</td>
              <td><b>{NOMBRE_VARIABLE[f.variable]}</b>: {f.grupo}</td>
              <td className="r">{pct(f.tasa)}</td>
              <td className="r">{f.estado === "no comparable" ? "—" : pp(f.diferencia)}</td>
              <td><span className={"pill " + cls} title={expl}>{et}</span></td>
              <td className="r">{fmt(f.n)}</td>
              <td><button className="btn sm" aria-expanded={ab} onClick={() => setAbierta(ab ? null : f.variable)} data-testid="ranking-detalle">{ab ? "Ocultar" : "Ver detalle"}</button></td>
            </tr>
            {ab && <tr className="detalle-fila"><td></td><td colSpan={6}>
              <div className="detalle-grid">
                <div><Seccion tipo="descriptivo" /><p>{f.estado === "no comparable" ? `El grupo «${f.grupo}» tiene ${f.n} personas, menos que el mínimo de ${nMin}: su tasa no se interpreta.` : `${fmt(f.renuncias)} de ${fmt(f.n)} personas del grupo «${f.grupo}» renunciaron antes de seis meses (${pct(f.tasa)}), frente a ${pct(f.general)} en promedio. ${expl}`}</p></div>
                <div><Seccion tipo="recomendacion" /><p>{f.estado === "prioritario" || f.estado === "leve" ? RECOMENDACION[f.variable] : "No se recomienda una acción específica con esta evidencia."}</p></div>
                <div><span className="pill neutral">Limitaciones</span><p>{f.advertencia} Datos ficticios de demostración.</p></div>
              </div>
              <button className="btn link" onClick={() => ir(f.variable)}>Ver el gráfico de esta variable</button>
            </td></tr>}
          </Fragment>
        );
      })}</tbody>
    </table></div>
  );
}

export default function Causas({ filas, nMin, foco }: Contexto) {
  const [perfil, setPerfil] = useState<Variable>(foco && PERFIL.includes(foco) ? foco : "rangoDistancia");
  useEffect(() => {
    if (!foco) return;
    if (PERFIL.includes(foco)) setPerfil(foco);
    const id = foco === "supervisor" ? "sec-supervisor" : foco === "rangoPuntaje" ? "sec-puntaje" : "sec-perfil";
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [foco]);

  const sup = useMemo(() => porGrupo(filas, "supervisor", nMin), [filas, nMin]);
  const pun = useMemo(() => porGrupo(filas, "rangoPuntaje", nMin), [filas, nMin]);
  const per = useMemo(() => porGrupo(filas, perfil, nMin), [filas, perfil, nMin]);
  const top = useMemo(() => topPerfiles(filas, nMin), [filas, nMin]);
  const rank = useMemo(() => rankingFactores(filas, nMin), [filas, nMin]);
  const irVariable = (v: Variable) => {
    if (PERFIL.includes(v)) setPerfil(v);
    const id = v === "supervisor" ? "sec-supervisor" : v === "rangoPuntaje" ? "sec-puntaje" : "sec-perfil";
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const mot = useMemo(() => motivos(filas), [filas]);
  const sinR = useMemo(() => sinRespuesta(filas), [filas]);
  const cont = useMemo(() => contraste(mot, factores(filas, nMin)), [mot, filas, nMin]);
  const concl = conclusionPrueba(pun.grupos, nMin);
  const pequenos = sup.grupos.filter(g => !g.suficiente).length;
  if (sup.general === null) return <Empty><b>Sin datos para esta selección.</b><br />Use «Restablecer filtros» para volver a ver a todas las personas.</Empty>;

  const comparablesSup = sup.grupos.filter(g => g.suficiente);
  const peorSup = [...comparablesSup].sort((a, b) => b.tasa - a.tasa)[0];
  const supAltos = comparablesSup.filter(g => g.diferencia > 0.05).length;
  const peorPerfil = per.grupos.filter(g => g.suficiente && g.grupo !== "Sin dato").sort((a, b) => b.tasa - a.tasa)[0];
  return (
    <>
      <p className="intro">Grupos que renuncian más que el promedio ({pct(sup.general)}). Es una relación, no una causa <Ayuda t="Relación, no causa" />. Diferencias en p.p. <Ayuda t="p.p." /></p>

      <Card title="¿Qué factores se relacionan más con las renuncias?" sub="Para cada factor, el grupo que más renuncia. Ordenado de mayor a menor diferencia.">
        <Ranking filas={rank} nMin={nMin} ir={irVariable} />
      </Card>

      <Card id="sec-supervisor" title={peorSup ? `Supervisores: el equipo de ${peorSup.grupo} renuncia más (${pct(peorSup.tasa)})` : "Renuncias por supervisor"} sub={`% del equipo que renunció antes de seis meses. ${supAltos} supervisor${supAltos === 1 ? "" : "es"} superan el promedio en más de 5 p.p.`} >
        <GraficoGrupos leyenda={false} grupos={sup.grupos} general={sup.general} horizontal alto={Math.max(180, sup.grupos.length * 26 + 40)} resaltar={sup.grupos.filter(g => g.suficiente && g.diferencia > 0.05).map(g => g.grupo)} testid="graf-supervisor" />
        <div className="legend"><span><i className="sw box" style={{ background: "var(--s2)" }} />Más de 5 p.p. sobre el promedio</span><span><i className="sw box" style={{ background: "var(--s1)" }} />Resto</span><span><i className="sw box" style={{ background: "var(--muted-mark)" }} />Menos de {nMin} personas (no se compara)</span><span><i className="sw" style={{ background: "var(--fg-3)" }} />Promedio {pct(sup.general)}</span></div>
        {pequenos > 0 && <p className="sub aviso-chico" data-testid="aviso-grupo-pequeno">{pequenos} supervisor{pequenos === 1 ? "" : "es"} con menos de {nMin} personas: no se compara{pequenos === 1 ? "" : "n"}.</p>}
        <TablaGrupos grupos={sup.grupos} nMin={nMin} />
      </Card>

      <div className="grid two">
        <Card id="sec-puntaje" title={concl.conclusion === "útil" ? "Prueba técnica: los puntajes bajos renuncian más" : concl.conclusion === "no útil" ? "Prueba técnica: sin diferencias claras entre puntajes" : "Prueba técnica: la evidencia no es suficiente"} sub="% que renunció según el puntaje de la prueba de selección (0 a 100).">
          <GraficoGrupos grupos={pun.grupos} general={pun.general} testid="graf-puntaje" />
          <div className={"note " + (concl.conclusion === "útil" ? "good" : concl.conclusion === "no útil" ? "crit" : "warn")} data-testid="conclusion-prueba">
            <b>Conclusión: {concl.conclusion === "útil" ? "la prueba parece útil" : concl.conclusion === "no útil" ? "la prueba no parece útil" : "la evidencia es insuficiente"}.</b> {concl.detalle} <Ayuda t="Prueba estadística" />
          </div>
          <TablaGrupos grupos={pun.grupos} nMin={nMin} />
        </Card>

        <Card id="sec-perfil" title="¿Qué perfil renuncia más?" sub={peorPerfil ? `${NOMBRE_VARIABLE[perfil]}: ${peorPerfil.grupo} renuncia más (${pct(peorPerfil.tasa)}, ${pp(peorPerfil.diferencia)}) · ${fmt(peorPerfil.n)} personas` : "Elija el factor que quiere comparar."} right={
          <div className="field"><label htmlFor="sel-perfil">Comparar por</label>
            <select id="sel-perfil" value={perfil} onChange={e => setPerfil(e.target.value as Variable)} data-testid="sel-perfil">
              {PERFIL.map(v => <option key={v} value={v}>{NOMBRE_VARIABLE[v]}</option>)}
            </select></div>}>
          <GraficoGrupos grupos={per.grupos} general={per.general} resaltar={peorPerfil ? [peorPerfil.grupo] : []} testid="graf-perfil" />
          
          <TablaGrupos grupos={per.grupos} nMin={nMin} />
          <details data-testid="top3"><summary>Los tres perfiles que más renuncian (todos los factores)</summary>
            {top.length ? <div className="tbl-wrap" style={{ marginTop: 8 }}><table data-testid="tabla-top-perfiles">
              <thead><tr><th>#</th><th>Perfil</th><th className="r">Personas</th><th className="r">% que renunció</th><th className="r">Diferencia</th></tr></thead>
              <tbody>{top.map((g, i) => <tr key={g.variable + g.grupo} className="hl"><td className="num">{i + 1}</td><td>{NOMBRE_VARIABLE[g.variable]}: <b>{g.grupo}</b></td><td className="r">{fmt(g.n)}</td><td className="r">{pct(g.tasa)}</td><td className="r">{pp(g.diferencia)}</td></tr>)}</tbody>
            </table></div> : <p className="sub">No hay perfiles con al menos {nMin} personas en la selección.</p>}
          </details>
        </Card>
      </div>

      <Card title={mot.length ? `Lo que dicen quienes renunciaron: «${mot[0].motivo}» es el motivo más mencionado` : "Motivos de renuncia"} sub={`Encuesta de salida: cinco motivos más frecuentes. ${sinR} renuncias sin respuesta no se incluyen.`} right={<Seccion tipo="simulado" />}>
        {mot.length ? (
          <div className="motivos">
            <div className="chart sm" data-testid="graf-motivos">
              <ResponsiveContainer>
                <BarChart data={mot} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${Math.round(v * 100)} %`} />
                  <YAxis type="category" dataKey="motivo" width={92} />
                  <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip render={p => <><div><b>{String(p.motivo)}</b></div><div>{String(p.n)} respuestas ({pct(p.pct as number)})</div></>} />} />
                  <Bar dataKey="pct" fill="var(--s1)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                    <LabelList dataKey="pct" position="right" formatter={(v: number) => pct(v, 0)} fill="var(--fg-2)" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <span className="lbl">¿Coincide con lo que muestran los datos?</span>
              <ul className="contraste" data-testid="contraste-motivos">
                {cont.map(c => <li key={c.motivo}><span className={"pill " + (c.tipo === "coincide" ? "good" : c.tipo === "contradice" ? "warn" : "neutral")}>{c.tipo}</span> <span><b>{c.motivo}:</b> {c.texto}</span></li>)}
              </ul>
            </div>
          </div>
        ) : <div className="note" data-testid="motivos-sin-datos">No hay respuestas de la encuesta de salida para esta selección.</div>}
      </Card>
    </>
  );
}
