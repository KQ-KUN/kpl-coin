// 浏览器/Node共用纯逻辑。BigInt金额与整数倍率乘法，避免二进制浮点收益。
export function minor(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) {
    throw new Error('Invalid coin decimal string');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function money(value) {
  const sign = value < 0n ? '-' : '';
  const n = value < 0n ? -value : value;
  return `${sign}${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
}

function oddsFraction(value) {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,12})?$/.test(value)) throw new Error('Invalid odds');
  const [whole, fraction = ''] = value.split('.');
  const divisor = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole) * divisor + BigInt(fraction || '0');
  if (numerator <= divisor) throw new Error('Odds must exceed one');
  return { numerator, divisor };
}

export function initialState(coins = '10000.00') {
  return { cashMinor: minor(coins), reservedMinor: 0n, positions: {}, settledIds: [] };
}

function validateState(state) {
  if (typeof state.cashMinor !== 'bigint' || typeof state.reservedMinor !== 'bigint'
      || state.cashMinor < 0n || state.reservedMinor < 0n) throw new Error('Invalid balance');
  const reserved = Object.values(state.positions).reduce((sum, p) => sum + p.stakeMinor, 0n);
  if (reserved !== state.reservedMinor || new Set(state.settledIds).size !== state.settledIds.length
      || state.settledIds.some(id => Object.hasOwn(state.positions, id))) throw new Error('Invalid ledger state');
  for (const p of Object.values(state.positions)) {
    if (typeof p.stakeMinor !== 'bigint' || p.stakeMinor <= 0n || p.teamAId === p.teamBId
        || ![p.teamAId, p.teamBId].includes(p.selectedTeamId)) throw new Error('Invalid position');
    oddsFraction(p.odds);
  }
}

export function place(state, quote, choice, stake = '0.00') {
  validateState(state);
  if (!['a', 'b', 'skip'].includes(choice)) throw new Error('Invalid choice');
  const amount = minor(stake);
  if (choice === 'skip') {
    if (amount !== 0n) throw new Error('Skip requires zero stake');
    return { state, receipt: { status: 'skipped', stakeMinor: 0n } };
  }
  if (![quote.id, quote.team_a_id, quote.team_b_id].every(x => typeof x === 'string' && x.length > 0)) {
    throw new Error('Invalid quote identity');
  }
  if (quote.team_a_id === quote.team_b_id || Object.hasOwn(state.positions, quote.id)
      || state.settledIds.includes(quote.id)) throw new Error('Invalid or duplicate position');
  if (amount === 0n) throw new Error('Stake must be positive');
  oddsFraction(quote[`odds_${choice}`]);
  if (amount > state.cashMinor) return { state, receipt: { status: 'insufficient_balance', stakeMinor: 0n } };
  const position = { stakeMinor: amount, odds: quote[`odds_${choice}`],
    selectedTeamId: quote[`team_${choice}_id`], teamAId: quote.team_a_id, teamBId: quote.team_b_id };
  return { state: { cashMinor: state.cashMinor - amount, reservedMinor: state.reservedMinor + amount,
    positions: { ...state.positions, [quote.id]: position }, settledIds: [...state.settledIds] },
    receipt: { status: 'placed', stakeMinor: amount } };
}

export function settle(state, matchId, winnerId) {
  validateState(state);
  if (!Object.hasOwn(state.positions, matchId)) throw new Error('No unsettled position');
  const p = state.positions[matchId];
  if (![p.teamAId, p.teamBId].includes(winnerId)) throw new Error('Invalid winner');
  const won = winnerId === p.selectedTeamId;
  const { numerator, divisor } = oddsFraction(p.odds);
  // 非负值ROUND_HALF_UP；先乘完整12位倍率，只在总返还处舍入一次。
  const gross = won ? (p.stakeMinor * numerator * 2n + divisor) / (2n * divisor) : 0n;
  const positions = { ...state.positions };
  delete positions[matchId];
  return { state: { cashMinor: state.cashMinor + gross, reservedMinor: state.reservedMinor - p.stakeMinor,
    positions, settledIds: [...state.settledIds, matchId] },
    receipt: { won, stakeMinor: p.stakeMinor, grossReturnMinor: gross, netMinor: gross - p.stakeMinor } };
}

// JSON转换时由调用者使用此replacer；整数分作为字符串，超过安全整数也不损失精度。
export function bigintReplacer(key, value) {
  return typeof value === 'bigint' ? String(value) : value;
}
