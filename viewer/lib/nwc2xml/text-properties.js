// Normalize NWCTXT staff settings for both parser adapters.
export function staffProperties(fields) {
  const result = {};
  const bars = ['SectionClose', 'MasterRepeatClose', 'Single', 'Double', 'Hidden'];
  for (const field of fields) {
    const colon = field.indexOf(':');
    const key = field.slice(0, colon), value = field.slice(colon + 1);
    if (['BoundaryTop', 'BoundaryBottom', 'Lines', 'Channel'].includes(key)) {
      const number = Number(value);
      if (Number.isFinite(number)) result[key[0].toLowerCase() + key.slice(1)] = number;
    } else if (key === 'WithNextStaff') {
      const flags = new Set(value.split(','));
      result.bracketWithNext = flags.has('Bracket');
      result.braceWithNext = flags.has('Brace');
      result.connectBarsWithNext = flags.has('ConnectBars');
      result.layerWithNext = flags.has('Layer');
    } else if (key === 'EndingBar') {
      result.endingBar = Math.max(0, bars.indexOf(value.replace(/\s/g, '')));
    } else if (key === 'Visible') result.visible = value !== 'N';
    else if (key === 'Color') result.color = Math.max(0, ['Default', 'Red', 'Green', 'Blue'].indexOf(value));
  }
  return result;
}
