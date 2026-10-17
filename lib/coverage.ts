const groups: Record<string, string> = {
  Africa: 'RE YT SH EH DZ AO BJ BW BF BI CV CM CF TD KM CG CD DJ EG GQ ER SZ ET GA GM GH GN GW CI KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW',
  Antarctica: 'AQ BV HM TF',
  Asia: 'IO AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE',
  Europe: 'AX AL AD AT BY BE BA BG HR CY CZ DK EE FO FI FR DE GI GR GG VA HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB',
  'North America': 'AW BQ CW SX BL MF AI VG MS AG BS BB BZ BM CA KY CR CU DM DO SV GL GD GP GT HT HN JM MQ MX NI PA PR KN LC VC TT TC US VI',
  'South America': 'GS AR BO BR CL CO EC FK GF GY PY PE SR UY VE',
  Oceania: 'CC CX NF UM AS AU CK FJ PF GU KI MH FM NR NC NZ NU MP PW PG PN WS SB TK TO TV VU WF',
};
const regions = new Map(Object.entries(groups).flatMap(([continent, codes]) => codes.split(' ').map(code => [code, continent] as const)));
const display = new Intl.DisplayNames(['en'], { type: 'region' });
const names = new Map([...regions.keys()].map(code => [display.of(code)?.toLowerCase(), code]));
const aliases: Record<string, string> = { uk: 'GB', usa: 'US', 'united states of america': 'US', 'ivory coast': 'CI', 'czech republic': 'CZ', 'cape verde': 'CV', 'south korea': 'KR', 'north korea': 'KP', 'russian federation': 'RU' };
export function countryCode(value?: string): string | undefined {
  if (!value) return;
  const code = value.trim().toUpperCase();
  return regions.has(code) ? code : aliases[value.trim().toLowerCase()] ?? names.get(value.trim().toLowerCase());
}
export function continentFor(value?: string): string | undefined {
  const code = countryCode(value);
  return code ? regions.get(code) : undefined;
}
