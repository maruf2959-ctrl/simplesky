// Stargazing conditions: turns one forecast hour into a 0–100 rating with
// per-factor scores and a plain-English verdict.
//
// Factors: cloud (low cloud weighted most), transparency (humidity, haze,
// visibility, thin high cloud), steadiness/seeing (jet-stream wind at 250 hPa),
// ground wind and gusts (telescope shake), the Moon, and darkness (twilight
// plus Bortle class).
(function (global) {
  'use strict';
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // The thickest layer dominates: low cloud blocks everything, thin high cloud mostly dims.
  function cloudScore(h) {
    const effective = Math.max(h.low ?? 0, (h.mid ?? 0) * 0.85, (h.high ?? 0) * 0.45, (h.cloud ?? 0) * 0.7);
    return clamp(Math.round(100 - effective), 0, 100);
  }

  function transparencyScore(h) {
    let s = 100 - Math.max(0, (h.rh ?? 70) - 60) * 1.6 - (h.high ?? 0) * 0.3;
    if (h.vis != null && h.vis < 10000) s -= 25 * (1 - h.vis / 10000);
    return clamp(Math.round(s), 0, 100);
  }

  // Strong jet-stream winds overhead mean turbulent air: twinkly stars, blurry planets.
  function steadinessScore(h) {
    const j = h.jet;
    if (j == null) return null;
    return j < 45 ? 92 : j < 70 ? 72 : j < 100 ? 50 : j < 130 ? 32 : 18;
  }

  function windScore(h) {
    const g = Math.max(h.gust ?? 0, (h.wind ?? 0) * 1.3);
    return g < 10 ? 95 : g < 18 ? 75 : g < 25 ? 50 : g < 35 ? 28 : 12;
  }

  // Weather-only rating (used for the cloud timeline and the forecast map).
  function weatherScore(h) {
    if (!h) return null;
    const c = cloudScore(h);
    const t = transparencyScore(h);
    const s = steadinessScore(h) ?? 70;
    const w = windScore(h);
    let score = c * 0.62 + t * 0.16 + s * 0.1 + w * 0.12;
    if (c < 40) score = Math.min(score, c + 12);
    if ((h.rain ?? 0) > 50) score = Math.min(score, 20);
    return clamp(Math.round(score), 0, 100);
  }

  // Full rating for a place and hour: weather plus Moon and darkness.
  // ctx: { sunAlt, moonAlt, moonIllum, bortle }
  function rate(h, ctx) {
    if (!h) return null;
    const cloud = cloudScore(h);
    const transp = transparencyScore(h);
    const steady = steadinessScore(h);
    const wind = windScore(h);
    const moon = ctx.moonAlt > 0 ? clamp(Math.round(100 - ctx.moonIllum * 65), 0, 100) : 95;
    const dark = ctx.sunAlt > -6 ? 15 : ctx.sunAlt > -12 ? 40 : ctx.sunAlt > -18 ? 70 : clamp(Math.round(100 - ((ctx.bortle || 6) - 1) * 9), 20, 100);
    let score = cloud * 0.48 + transp * 0.14 + (steady ?? 70) * 0.1 + wind * 0.1 + moon * 0.09 + dark * 0.09;
    if (cloud < 40) score = Math.min(score, cloud + 12);
    if ((h.rain ?? 0) > 50) score = Math.min(score, 20);
    score = clamp(Math.round(score), 0, 100);

    const g = Math.round(Math.max(h.gust ?? 0, h.wind ?? 0));
    const parts = [
      { key: 'cloud', name: 'Cloud', score: cloud, text: `${h.cloud}% total · low ${h.low}%, mid ${h.mid}%, high ${h.high}%` },
      { key: 'transp', name: 'Transparency', score: transp, text: `${h.rh}% humidity${h.vis != null ? ` · ${h.vis >= 20000 ? '20+' : Math.round(h.vis / 1000)} km visibility` : ''}${transp < 50 ? ' · hazy, faint objects suffer' : ''}` },
      steady == null ? null : { key: 'steady', name: 'Steadiness', score: steady, text: `Jet stream ${Math.round(h.jet)} mph · ${steady >= 70 ? 'steady air, sharp planets' : steady >= 45 ? 'some twinkle' : 'turbulent, blurry planets'}` },
      { key: 'wind', name: 'Wind', score: wind, text: `${Math.round(h.wind ?? 0)} mph, gusts ${g} mph${wind < 50 ? ' · telescope shake likely' : ''}` },
      { key: 'moon', name: 'Moon', score: moon, text: ctx.moonAlt > 0 ? `${Math.round(ctx.moonIllum * 100)}% lit and up` : 'Below the horizon' },
      { key: 'dark', name: 'Darkness', score: dark, text: ctx.sunAlt > -12 ? 'Twilight' : ctx.sunAlt > -18 ? 'Nearly dark' : `Dark · Bortle ${ctx.bortle}` }
    ].filter(Boolean);
    return { score, parts, verdict: verdict(score, { cloud, transp, steady, wind, moon, dark }) };
  }

  function verdict(score, f) {
    if (f.cloud < 20) return 'Overcast. A night off.';
    if (f.cloud < 50) return 'Mostly cloudy. Watch for gaps.';
    if (f.cloud < 75) return 'Patchy cloud. Work the clear gaps.';
    if (f.wind < 45) return 'Clear but windy. Shelter your telescope.';
    if (f.moon < 50 && f.dark >= 70) return 'Clear but moonlit. Best for the Moon, planets and double stars.';
    if (f.steady != null && f.steady < 45) return 'Clear but turbulent. Great for wide views; planets will look soft.';
    if (f.transp < 45) return 'Clear but hazy. Bright objects only.';
    if (score >= 80 && (f.steady ?? 70) >= 70) return 'Clear and still. Ideal for planets and deep sky.';
    if (score >= 65) return 'Good night. Get out there.';
    return 'Clear-ish. Worth a look.';
  }

  const colorFor = (s) => (s >= 80 ? '#3ddc84' : s >= 65 ? '#a6e05b' : s >= 45 ? '#ffd166' : s >= 25 ? '#ff9f43' : '#ef476f');

  global.Sky = { rate, weatherScore, cloudScore, transparencyScore, steadinessScore, windScore, colorFor };
})(window);
