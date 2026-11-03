import { LeftTab, useApp } from '../state/store';
import { CalibrationPanel } from './CalibrationPanel';
import { JointControls } from './JointControls';
import { PosesPanel } from './PosesPanel';
import { ProfilePanel } from './ProfilePanel';
import { IChevron } from './icons';

const TABS: [LeftTab, string][] = [
  ['articulaciones', 'Articulaciones'],
  ['calibracion', 'Calibración'],
  ['poses', 'Poses'],
  ['perfil', 'Perfil'],
];

export function LeftPanel({ onCollapse }: { onCollapse?: () => void }) {
  const tab = useApp((s) => s.ui.leftTab);
  const setUi = useApp((s) => s.setUi);
  return (
    <section className="panel left" aria-label="Controles">
      <div className="panel-head">
        <span className="panel-title">Patas y servos</span>
        <span className="panel-sub">4 patas · 12 articulaciones</span>
        <span className="spacer" />
        {onCollapse && (
          <button className="btn sm icon ghost" onClick={onCollapse} title="Plegar panel" aria-label="Plegar panel izquierdo">
            <IChevron dir="left" size={14} />
          </button>
        )}
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setUi({ leftTab: k })}>
            {l}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'articulaciones' && <JointControls />}
        {tab === 'calibracion' && <CalibrationPanel />}
        {tab === 'poses' && <PosesPanel />}
        {tab === 'perfil' && <ProfilePanel />}
      </div>
    </section>
  );
}
