import { oomAttack } from '../shared/minigame-physics';

export function OomWorld({ elapsed, seed }: { elapsed: number; seed: number }) {
  const attack = oomAttack(elapsed, seed);
  const tip = 23 + attack.extension * 60;
  return <g className="oom-attack" data-oom-extension={attack.extension} data-oom-lane={attack.lane}>
    {[0, 1, 2].map(lane => {
      const active = lane === attack.lane, center = (lane + .5) * 100 / 3;
      const pose = active && attack.phase >= .54 ? attack.phase >= .8 && attack.phase < .86 ? 'oom-strike' : 'oom-windup' : 'oom';
      return <g key={lane}>
        <rect x={lane * 100 / 3 + 1} y="38" width={100 / 3 - 2} height="55" rx="3" fill={active ? '#ff7757' : '#d2e9cd'} opacity={active ? attack.extension > .85 ? .38 : .22 + .05 * Math.sin(attack.phase * 18) : .04} />
        <path d={`M${lane * 100/3} 38V94`} stroke="#fff4d055" strokeWidth=".3" strokeDasharray="1 1" />
        <image href={`/assets/minigames/escape/${pose}.webp`} x={center - 10} y={active ? 2 - Math.sin(attack.phase * Math.PI) : 2} width="20" height="30" opacity={active ? 1 : .48} preserveAspectRatio="xMidYMid meet" />
        {active && <>
          <ellipse cx={center} cy="33" rx="5" ry="1.2" fill="#ffcc68" opacity=".6" />
          {attack.extension === 0 && <path d={`M${center-3} 40l3 3 3-3m-6 5l3 3 3-3`} stroke="#ffcd65" strokeWidth="1.2" fill="none" strokeLinecap="round" />}
          {attack.extension > 0 && <g>
            <path d={`M${center} 16 C${center-3} 27 ${center+3} ${tip-12} ${center} ${tip}`} stroke="#8f3c77" strokeWidth="6.5" strokeLinecap="round" fill="none" />
            <path d={`M${center} 16 C${center-3} 27 ${center+3} ${tip-12} ${center} ${tip}`} stroke="#ed83ad" strokeWidth="5" strokeLinecap="round" fill="none" />
            <path d={`M${center-attack.extension*13} ${tip} Q${center} ${tip-3} ${center+attack.extension*13} ${tip}`} stroke="#ed83ad" strokeWidth="6" strokeLinecap="round" fill="none" />
          </g>}
        </>}
      </g>;
    })}
  </g>;
}

export function OomPrompt({ elapsed, seed }: { elapsed: number; seed: number }) {
  const attack = oomAttack(elapsed, seed);
  return <div className="party-prompt oom-prompt"><b>{attack.phase < .8 ? '¡Sal del carril marcado!' : attack.phase < .86 ? '¡Lengüetazo!' : 'Siguiente ataque'}</b><span>×{(3200/attack.span).toFixed(1)}</span></div>;
}
