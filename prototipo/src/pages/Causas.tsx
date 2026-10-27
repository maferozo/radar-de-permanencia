import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ReferenceLine } from "recharts";
import { porGrupo, conclusionPrueba, topPerfiles, Variable, NOMBRE_VARIABLE, Grupo, motivos, sinRespuesta, contraste, factores, rankingFactores, RECOMENDACION, FilaRanking } from "../calc";
import type { Contexto } from "../App";
import { Fragment } from "react";
import { Card, Empty, Tip, pct, pp, fmt, Ayuda, Seccion } from "../ui";

const PERFIL: Variable[] = ["rangoDistancia", "turno", "rangoExperiencia", "educacion", "canal", "campana"];

function GraficoGrupos({ grupos, general, alto = 260, horizontal = false, resaltar = [] as string[], testid }: { grupos: Grupo[]; general: number | null; alto?: number; horizontal?: boolean; resaltar?: string[]; testid?: string }) {
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
    {general !== null && <div className="legend"><span><i className="sw" style={{ background: "var(--fg-3)" }} />Línea punteada: promedio general {pct(general)}</span>{grupos.some(g => g.grupo === "Sin dato") && <span>Registros sin dato: solo en la tabla</span>}</div>}
    </>
  );
}

function TablaGrupos({ grupos, nMin }: { grupos: Grupo[]; nMin: number }) {
  return (
    <details><summary>Ver tabla</summary>
      <div className="tbl-wrap" style={{ marginTop: 8 }}><table>
        <thead><tr><th>Grupo</th><th className="r">Personas</th><th className="r">Renuncias</th><th className="r">Tasa</th><th className="r">Dif. vs. promedio</th><th>Comparable</th></tr></thead>
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
      <thead><tr><th>#</th><th>Factor y grupo con mayor tasa</th><th className="r">Personas</th><th className="r">Renuncias</th><th className="r">Tasa del grupo</th><th className="r">Promedio</th><th className="r">Diferencia</th><th>Lectura</th><th><span className="sr">Detalle</span></th></tr></thead>
      <tbody>{filas.map((f, i) => {
        const [et, cls, expl] = LECTURA[f.estado]; const ab = abierta === f.variable;
        return (
          <Fragment key={f.variable}>
            <tr className={f.estado === "no comparable" ? "dim" : f.estado === "prioritario" ? "hl" : ""}>
              <td className="num">{i + 1}</td>
              <td><b>{NOMBRE_VARIABLE[f.variable]}</b>: {f.grupo}</td>
              <td className="r">{fmt(f.n)}</td><td className="r">{fmt(f.renuncias)}</td><td className="r">{pct(f.tasa)}</td><td className="r">{pct(f.general)}</td>
              <td className="r">{f.estado === "no comparable" ? "—" : pp(f.diferencia)}</td>
              <td><span className={"pill " + cls} title={expl}>{et}</span></td>
              <td><button className="btn sm" aria-expanded={ab} onClick={() => setAbierta(ab ? null : f.variable)} data-testid="ranking-detalle">{ab ? "Ocultar" : "Ver detalle"}</button></td>
            </tr>
            {ab && <tr className="detalle-fila"><td></td><td colSpan={8}>
              <div className="detalle-grid">
                <div><Seccion tipo="descriptivo" /><p>{f.estado === "no comparable" ? `El grupo «${f.grupo}» tiene ${f.n} personas, menos que el mínimo de ${nMin}: su tasa no se interpreta.` : `De cada 100 personas del grupo «${f.grupo}», ${Math.round(f.tasa * 100)} renunciaron en sus primeros 180 días, frente a ${Math.round(f.general * 100)} en promedio. ${expl}`}</p></div>
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
  if (sup.general === null) return <Empty><b>Sin datos para esta selección.</b><br />Use «Limpiar filtros» para volver a la vista completa.</Empty>;

  const peorPerfil = per.grupos.filter(g => g.suficiente && g.grupo !== "Sin dato").sort((a, b) => b.tasa - a.tasa)[0];
  return (
    <>
      <div className="note">Las diferencias muestran <b>asociación</b> entre un factor y la renuncia temprana; no prueban que el factor la cause. Los grupos con menos de {nMin} personas aparecen en gris y no se comparan. Las diferencias se expresan en p.p. <Ayuda t="p.p." /></div>

      <Card title="¿Qué factores se asocian más con la renuncia temprana?" sub={`Para cada variable, el grupo con mayor diferencia frente al promedio (${pct(sup.general)}). Ordenado de mayor a menor prioridad.`} right={<Seccion tipo="descriptivo" />}>
        <Ranking filas={rank} nMin={nMin} ir={irVariable} />
        <p className="sub">Prioritario: más de 5 p.p. sobre el promedio en un grupo con al menos {nMin} personas. Diferencia leve: entre 2 y 5 p.p. Seleccione «Ver detalle» para la interpretación, la recomendación y las limitaciones.</p>
      </Card>

      <Card id="sec-supervisor" title="Rotación temprana por supervisor" sub="Tasa del grupo a cargo, número de personas y comparación con el promedio general" right={<Seccion tipo="descriptivo" />}>
        <GraficoGrupos grupos={sup.grupos} general={sup.general} horizontal alto={Math.max(180, sup.grupos.length * 26 + 40)} resaltar={sup.grupos.filter(g => g.suficiente && g.diferencia > 0.05).map(g => g.grupo)} testid="graf-supervisor" />
        <div className="legend"><span><i className="sw box" style={{ background: "var(--s2)" }} />Más de 5 p.p. sobre el promedio</span><span><i className="sw box" style={{ background: "var(--s1)" }} />Resto comparable</span><span><i className="sw box" style={{ background: "var(--muted-mark)" }} />Grupo pequeño (no se compara)</span></div>
        {pequenos > 0 && <div className="note warn" data-testid="aviso-grupo-pequeno">{pequenos} supervisor(es) con menos de {nMin} personas en la selección. No se sacan conclusiones sobre ellos.</div>}
        <TablaGrupos grupos={sup.grupos} nMin={nMin} />
      </Card>

      <div className="grid two">
        <Card id="sec-puntaje" title="Rotación temprana por puntaje de la prueba técnica" sub="Rangos de puntaje de 0–59 a 90–100">
          <GraficoGrupos grupos={pun.grupos} general={pun.general} testid="graf-puntaje" />
          <Seccion tipo="estadistico" />
          <div className={"note " + (concl.conclusion === "útil" ? "good" : concl.conclusion === "no útil" ? "crit" : "warn")} data-testid="conclusion-prueba">
            <b>Conclusión: {concl.conclusion === "útil" ? "la prueba parece útil" : concl.conclusion === "no útil" ? "la prueba no parece útil" : "la evidencia es insuficiente"}.</b> {concl.detalle} <span className="sub">Prueba z de dos proporciones entre el rango más bajo y el más alto; significativa si p &lt; 0,05.</span>
          </div>
          <TablaGrupos grupos={pun.grupos} nMin={nMin} />
        </Card>

        <Card id="sec-perfil" title="Rotación temprana por perfil" right={
          <div className="field"><label htmlFor="sel-perfil">Variable</label>
            <select id="sel-perfil" value={perfil} onChange={e => setPerfil(e.target.value as Variable)} data-testid="sel-perfil">
              {PERFIL.map(v => <option key={v} value={v}>{NOMBRE_VARIABLE[v]}</option>)}
            </select></div>}>
          <GraficoGrupos grupos={per.grupos} general={per.general} resaltar={peorPerfil ? [peorPerfil.grupo] : []} testid="graf-perfil" />
          {peorPerfil && <p className="sub">Mayor tasa en esta variable: <b>{peorPerfil.grupo}</b> ({pct(peorPerfil.tasa)}, n = {peorPerfil.n}).</p>}
          <TablaGrupos grupos={per.grupos} nMin={nMin} />
        </Card>
      </div>

      <div className="grid two">
        <Card title="Los 3 perfiles con mayor rotación temprana" sub="Entre distancia, turno, experiencia, educación y canal; solo grupos comparables">
          {top.length ? <div className="tbl-wrap"><table data-testid="tabla-top-perfiles">
            <thead><tr><th>#</th><th>Perfil</th><th className="r">Personas</th><th className="r">Tasa</th><th className="r">Dif. vs. promedio</th></tr></thead>
            <tbody>{top.map((g, i) => <tr key={g.variable + g.grupo} className="hl"><td className="num">{i + 1}</td><td>{NOMBRE_VARIABLE[g.variable]}: <b>{g.grupo}</b></td><td className="r">{fmt(g.n)}</td><td className="r">{pct(g.tasa)}</td><td className="r">{pp(g.diferencia)}</td></tr>)}</tbody>
          </table></div> : <Empty>No hay perfiles con al menos {nMin} personas en la selección.</Empty>}
        </Card>
        <Card title="Motivos declarados de renuncia" sub="Top 5 entre renuncias tempranas que respondieron la encuesta de salida" right={<Seccion tipo="simulado" />}>
          {mot.length ? <>
            <div className="chart sm" data-testid="graf-motivos">
              <ResponsiveContainer>
                <BarChart data={mot} layout="vertical" margin={{ top: 4, right: 70, bottom: 4, left: 8 }}>
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
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }} data-testid="contraste-motivos">
              {cont.map(c => <li key={c.motivo}><span className={"pill " + (c.tipo === "coincide" ? "good" : c.tipo === "contradice" ? "warn" : "neutral")}>{c.tipo}</span> <b>{c.motivo}:</b> {c.texto}</li>)}
            </ul>
            <p className="sub">{sinR} renuncias tempranas sin respuesta a la encuesta no se incluyen.</p>
          </> : <div className="note" data-testid="motivos-sin-datos">No hay respuestas de la encuesta de salida para esta selección.</div>}
        </Card>
      </div>
    </>
  );
}
