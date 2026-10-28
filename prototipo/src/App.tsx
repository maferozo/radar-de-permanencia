import { useEffect, useMemo, useState } from "react";
import { Filtros, TODOS, filtrar, SupuestosCosto, Variable } from "./calc";
import { FILAS, COHORTES_VENTANA, CAMPANAS, SUPERVISORES, SUP_CAMPANA, HECHOS, COSTOS_SIM } from "./data";
import { DemoBadge, Ayuda, GLOSARIO } from "./ui";
import Panorama from "./pages/Panorama";
import Causas from "./pages/Causas";
import Resumen from "./pages/Resumen";
import Semaforo from "./pages/Semaforo";
import Simulador from "./pages/Simulador";
import Seguimiento from "./pages/Seguimiento";

export type Ruta = "panorama" | "causas" | "resumen" | "simulador" | "semaforo" | "seguimiento" | "glosario";
const RUTAS: { id: Ruta; nombre: string; q: string }[] = [
  { id: "panorama", nombre: "Panorama", q: "¿Qué está pasando?" },
  { id: "causas", nombre: "Causas", q: "¿Por qué se van?" },
  { id: "resumen", nombre: "Resumen y acciones", q: "¿Qué hacemos?" },
  { id: "simulador", nombre: "Simulador de escenarios", q: "¿Y si alcanzamos una meta?" },
  { id: "semaforo", nombre: "Semáforo", q: "¿Se quedará?" },
];
export const FILTROS_INICIALES: Filtros = { desde: COHORTES_VENTANA[0], hasta: COHORTES_VENTANA[COHORTES_VENTANA.length - 1], campana: TODOS, supervisor: TODOS };

function rutaActual(): Ruta {
  const h = location.hash.replace("#", "") as Ruta;
  return [...RUTAS.map(r => r.id), "seguimiento", "glosario"].includes(h) ? h : "panorama";
}

export interface Contexto {
  filtros: Filtros; filas: typeof FILAS; nMin: number; setNMin: (n: number) => void;
  costos: SupuestosCosto | null; setCostos: (c: SupuestosCosto | null) => void;
  ir: (r: Ruta, foco?: Variable) => void; foco: Variable | null;
}

export default function App() {
  const [ruta, setRuta] = useState<Ruta>(rutaActual);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [nMin, setNMin] = useState(30);
  const [costos, setCostos] = useState<SupuestosCosto | null>({ reclutamiento: COSTOS_SIM.reclutamiento, formacion: COSTOS_SIM.formacion, improductivo: COSTOS_SIM.improductivo });
  const [foco, setFoco] = useState<Variable | null>(null);

  useEffect(() => { const f = () => setRuta(rutaActual()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  const ir = (r: Ruta, v?: Variable) => { setFoco(v ?? null); location.hash = r; setRuta(r); window.scrollTo({ top: 0 }); };

  const { filas, msFiltro } = useMemo(() => { const t0 = performance.now(); const r = filtrar(FILAS, filtros); return { filas: r, msFiltro: performance.now() - t0 }; }, [filtros]);
  const supervisores = filtros.campana === TODOS ? SUPERVISORES : SUPERVISORES.filter(s => SUP_CAMPANA[s] === filtros.campana);
  const ctx: Contexto = { filtros, filas, nMin, setNMin, costos, setCostos, ir, foco };
  const conFiltros = ruta === "panorama" || ruta === "causas" || ruta === "resumen" || ruta === "simulador";
  const info = ruta === "simulador" ? { nombre: "Simulador de escenarios", q: "Explora cómo cambiarían los resultados si alcanzas diferentes metas de permanencia" } : RUTAS.find(r => r.id === ruta) ?? (ruta === "glosario" ? { nombre: "Glosario", q: "Términos y siglas que aparecen en el dashboard" } : { nombre: "Seguimiento del proyecto", q: "Avance del equipo: burndown, métricas DORA, rendimiento, pruebas, calidad de datos y trazabilidad" });
  const nInc = filas.filter(f => f.ventana).length, nSin = filas.length - nInc;
  const chips = [`Cohortes ${filtros.desde} a ${filtros.hasta}`, filtros.campana === TODOS ? "Todas las campañas" : filtros.campana, filtros.supervisor === TODOS ? "Todos los supervisores" : `Supervisor ${filtros.supervisor}`];
  const sucio = JSON.stringify(filtros) !== JSON.stringify(FILTROS_INICIALES);

  return (
    <div className="app">
      <a className="skip" href="#contenido" onClick={e => { e.preventDefault(); document.getElementById("contenido")?.focus(); }}>Saltar al contenido</a>
      <aside className="side">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 34 34" aria-hidden="true">
            <circle cx="17" cy="17" r="15" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
            <circle cx="17" cy="17" r="9.5" fill="none" stroke="var(--accent)" strokeWidth="1" opacity=".6" />
            <circle cx="17" cy="17" r="4" fill="none" stroke="var(--accent)" strokeWidth="1" opacity=".4" />
            <path d="M17 17 L28 9" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="24" cy="21" r="2.2" fill="var(--s2)" />
          </svg>
          <div><b>Radar de permanencia</b><small>People Analytics · BPO</small></div>
        </div>
        <nav className="nav" aria-label="Pantallas">
          <p className="nav-label">Dashboard</p>
          {RUTAS.map(r => (
            <a key={r.id} href={"#" + r.id} aria-current={ruta === r.id ? "page" : undefined} onClick={e => { e.preventDefault(); ir(r.id); }} data-testid={"nav-" + r.id}>
              <span>{r.nombre}<span className="q">{r.q}</span></span>
            </a>
          ))}
          <p className="nav-label">Proyecto</p>
          <a href="#seguimiento" aria-current={ruta === "seguimiento" ? "page" : undefined} onClick={e => { e.preventDefault(); ir("seguimiento"); }} data-testid="nav-seguimiento">
            <span>Seguimiento<span className="q">Sprints, DORA, pruebas</span></span>
          </a>
          <a href="#glosario" aria-current={ruta === "glosario" ? "page" : undefined} onClick={e => { e.preventDefault(); ir("glosario"); }} data-testid="nav-glosario">
            <span>Glosario<span className="q">Siglas y términos</span></span>
          </a>
        </nav>
        <div className="side-foot">
          Fecha de corte de los datos: <span className="num">{HECHOS.fecha_corte}</span><br />
          Definición: renuncia voluntaria en los primeros 180 días.<br />
          Solo datos agregados; sin nombres ni documentos.
        </div>
      </aside>

      <main className="main" id="contenido" tabIndex={-1}>
        <header className="top">
          <div>
            <h1 data-testid="titulo-pantalla">{info.nombre}</h1>
            <p className="q">{info.q}</p>
          </div>
          <div className="row">
            <DemoBadge />
            {ruta !== "panorama" && <button className="btn" onClick={() => ir("panorama")} data-testid="volver-panorama">← Volver al panorama</button>}
          </div>
        </header>

        {conFiltros && (
          <div className="filters" role="group" aria-label="Filtros globales">
            <div className="field"><label htmlFor="f-desde">Ingreso desde (mes)</label>
              <select id="f-desde" value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} data-testid="f-desde">
                {COHORTES_VENTANA.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div className="field"><label htmlFor="f-hasta">Ingreso hasta (mes)</label>
              <select id="f-hasta" value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} data-testid="f-hasta">
                {COHORTES_VENTANA.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div className="field"><label htmlFor="f-campana">Campaña</label>
              <select id="f-campana" value={filtros.campana} onChange={e => setFiltros({ ...filtros, campana: e.target.value, supervisor: TODOS })} data-testid="f-campana">
                <option value={TODOS}>Todas</option>{CAMPANAS.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div className="field"><label htmlFor="f-supervisor">Supervisor</label>
              <select id="f-supervisor" value={filtros.supervisor} onChange={e => setFiltros({ ...filtros, supervisor: e.target.value })} data-testid="f-supervisor">
                <option>{TODOS}</option>{supervisores.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div className="field"><label htmlFor="f-nmin">Mín. personas por grupo <Ayuda t="Mínimo por grupo" /></label>
              <input id="f-nmin" type="number" min={5} max={500} value={nMin} onChange={e => setNMin(Math.max(5, Math.min(500, Number(e.target.value) || 5)))} style={{ width: 90 }} data-testid="f-nmin" />
            </div>
            <button className="btn" onClick={() => setFiltros(FILTROS_INICIALES)} disabled={!sucio} data-testid="limpiar-filtros">Limpiar filtros</button>
            <div className="filtros-activos" aria-live="polite">
              <span className="lbl">Filtros activos</span>
              {chips.map(c => <span key={c} className="chip" data-testid="chip-filtro">{c}</span>)}
              <span className="sub" style={{ marginLeft: "auto" }} data-testid="tiempo-filtro">
                <b className="num">{nInc.toLocaleString("es-CO")}</b> personas analizadas{nSin > 0 && <> · {nSin.toLocaleString("es-CO")} excluidas por no tener 180 días de observación</>}
                {msFiltro !== null && <> · filtrado en <span className="num">{msFiltro.toFixed(1)} ms</span></>}
              </span>
            </div>
          </div>
        )}
        {conFiltros && filtros.desde > filtros.hasta && <div className="note crit" role="alert">La cohorte «desde» es posterior a la cohorte «hasta». Ajuste el período para ver datos.</div>}

        {ruta === "panorama" && <Panorama {...ctx} />}
        {ruta === "causas" && <Causas {...ctx} />}
        {ruta === "resumen" && <Resumen {...ctx} />}
        {ruta === "simulador" && <Simulador {...ctx} />}
        {ruta === "semaforo" && <Semaforo />}
        {ruta === "seguimiento" && <Seguimiento />}
        {ruta === "glosario" && (
          <section className="card" data-testid="glosario">
            <p className="sub">Las mismas definiciones aparecen al seleccionar el botón <b>?</b> junto a cada término.</p>
            <dl className="glosario">{Object.entries(GLOSARIO).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </section>
        )}
      </main>
    </div>
  );
}
