import type { Radio, RadioIface } from '../types';

function orderedIface(i: RadioIface): RadioIface {
  return { band: i.band, channel: i.channel, txPowerDbm: i.txPowerDbm };
}

export function orderedRadio(r: Radio): Radio {
  return {
    id: r.id,
    levelId: r.levelId,
    name: r.name,
    role: r.role,
    position: [r.position[0], r.position[1], r.position[2]],
    ifaces: r.ifaces.map(orderedIface),
    antennaGainDbi: r.antennaGainDbi,
  };
}
