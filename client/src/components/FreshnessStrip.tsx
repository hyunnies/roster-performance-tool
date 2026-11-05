import { SOURCES } from "../lib/importer";
import type { Imports } from "../lib/types";

interface Props { imports: Imports; onImport: (source: string) => void }

export default function FreshnessStrip({ imports, onImport }: Props) {
  return (
    <div className="fresh">
      {Object.keys(SOURCES).map((k) => {
        const im = imports[k];
        let cls = "none";
        let meta = k === "favro" ? "not imported yet" : "never imported";
        if (im && im.at) {
          const days = (Date.now() - new Date(im.at).getTime()) / (1000 * 60 * 60 * 24);
          cls = days <= 35 ? "ok" : "old";
          meta = `${new Date(im.at).toISOString().slice(0, 10)}${im.month ? " · " + im.month : ""} · ${im.rows} rows`;
        }
        return (
          <div className="fcell" key={k}>
            <div className="fn"><span className={`fdot ${cls}`} />{SOURCES[k].label}</div>
            <div className="fm">{meta}</div>
            <button onClick={() => onImport(k)}>Import</button>
          </div>
        );
      })}
    </div>
  );
}
