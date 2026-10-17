// Low-precision astronomy helpers (good to a fraction of a degree), enough
// for "is it up, how high, how big, how bright, how fast does the field rotate".
// Sun, Moon and planet positions follow Paul Schlyter's "How to compute
// planetary positions" (https://stjarnhimlen.se/comp/ppcomp.html).
(function (global) {
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const EARTH_RATE = 7.2921159e-5; // rad/s, sidereal
  const norm = (x) => ((x % 360) + 360) % 360;
  const sind = (x) => Math.sin(x * RAD);
  const cosd = (x) => Math.cos(x * RAD);

  const julian = (date) => date.getTime() / 86400000 + 2440587.5;
  const dayNumber = (date) => julian(date) - 2451543.5;

  function lstDeg(date, lonDeg) {
    const d = julian(date) - 2451545.0;
    return norm(280.46061837 + 360.98564736629 * d + lonDeg);
  }

  // RA/Dec (deg) -> altitude/azimuth (deg). Azimuth measured from north, eastwards.
  function altAz(raDeg, decDeg, date, latDeg, lonDeg) {
    const H = (lstDeg(date, lonDeg) - raDeg) * RAD;
    const phi = latDeg * RAD;
    const dec = decDeg * RAD;
    const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
    return { alt: alt * DEG, az: norm(az * DEG) };
  }

  // Field rotation rate on an alt-az mount (rad/s).
  function fieldRotationRate(altDeg, azDeg, latDeg) {
    const c = Math.cos(altDeg * RAD);
    if (c < 1e-3) return Infinity;
    return Math.abs((EARTH_RATE * Math.cos(latDeg * RAD) * Math.cos(azDeg * RAD)) / c);
  }

  function separation(ra1, dec1, ra2, dec2) {
    const c = sind(dec1) * sind(dec2) + cosd(dec1) * cosd(dec2) * cosd(ra1 - ra2);
    return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
  }

  function kepler(M, e) {
    let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (let i = 0; i < 8; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
  }

  // Orbital elements; diam = apparent diameter (arcsec) at 1 AU; mag(r, R, FV) = visual magnitude.
  const ELEMENTS = {
    mercury: (d) => ({ N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d, diam: 6.74, mag: (r, R, FV) => -0.36 + 5 * Math.log10(r * R) + 0.027 * FV + 2.2e-13 * FV ** 6 }),
    venus: (d) => ({ N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d, diam: 16.92, mag: (r, R, FV) => -4.34 + 5 * Math.log10(r * R) + 0.013 * FV + 4.2e-7 * FV ** 3 }),
    mars: (d) => ({ N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d, diam: 9.36, mag: (r, R, FV) => -1.51 + 5 * Math.log10(r * R) + 0.016 * FV }),
    jupiter: (d) => ({ N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d, diam: 196.94, mag: (r, R, FV) => -9.25 + 5 * Math.log10(r * R) + 0.014 * FV }),
    saturn: (d) => ({ N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d, diam: 165.6, mag: (r, R, FV) => -9.0 + 5 * Math.log10(r * R) + 0.044 * FV }),
    uranus: (d) => ({ N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d, diam: 65.8, mag: (r, R, FV) => -7.15 + 5 * Math.log10(r * R) + 0.001 * FV }),
    neptune: (d) => ({ N: 131.7806 + 3.0173e-5 * d, i: 1.77 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d, diam: 62.2, mag: (r, R, FV) => -6.9 + 5 * Math.log10(r * R) + 0.001 * FV })
  };
  const PLANETS = Object.keys(ELEMENTS);

  function sunEcliptic(d) {
    const w = 282.9404 + 4.70935e-5 * d;
    const e = 0.016709 - 1.151e-9 * d;
    const M = norm(356.047 + 0.9856002585 * d);
    const E = kepler(M * RAD, e);
    const xv = Math.cos(E) - e;
    const yv = Math.sqrt(1 - e * e) * Math.sin(E);
    const v = Math.atan2(yv, xv);
    const r = Math.hypot(xv, yv);
    const lon = v + w * RAD;
    return { x: r * Math.cos(lon), y: r * Math.sin(lon), z: 0, r, lon: norm(lon * DEG), M, L: norm(M + w) };
  }

  function eclToEq(x, y, z, d) {
    const ecl = (23.4393 - 3.563e-7 * d) * RAD;
    const ye = y * Math.cos(ecl) - z * Math.sin(ecl);
    const ze = y * Math.sin(ecl) + z * Math.cos(ecl);
    return { ra: norm(Math.atan2(ye, x) * DEG), dec: Math.atan2(ze, Math.hypot(x, ye)) * DEG };
  }

  function sunRaDec(date) {
    const d = dayNumber(date);
    const s = sunEcliptic(d);
    return eclToEq(s.x, s.y, s.z, d);
  }

  function planetRaDec(name, date) {
    const d = dayNumber(date);
    const el = ELEMENTS[name](d);
    const E = kepler(norm(el.M) * RAD, el.e);
    const xv = el.a * (Math.cos(E) - el.e);
    const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const v = Math.atan2(yv, xv);
    const r = Math.hypot(xv, yv);
    const N = el.N * RAD, i = el.i * RAD, vw = v + el.w * RAD;
    const xh = r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i));
    const yh = r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i));
    const zh = r * Math.sin(vw) * Math.sin(i);
    const s = sunEcliptic(d);
    const xg = xh + s.x, yg = yh + s.y, zg = zh;
    const R = Math.hypot(xg, yg, zg);
    const FV = Math.acos(Math.max(-1, Math.min(1, (r * r + R * R - s.r * s.r) / (2 * r * R)))) * DEG;
    const eq = eclToEq(xg, yg, zg, d);
    const sun = eclToEq(s.x, s.y, s.z, d);
    return { ...eq, distance: R, diameterArcsec: el.diam / R, mag: el.mag(r, R, FV), elongation: separation(eq.ra, eq.dec, sun.ra, sun.dec), phaseAngle: FV };
  }

  // Moon, with the main perturbation terms (≈0.1° accuracy).
  function moonRaDec(date) {
    const d = dayNumber(date);
    const N = norm(125.1228 - 0.0529538083 * d);
    const i = 5.1454;
    const w = norm(318.0634 + 0.1643573223 * d);
    const a = 60.2666;
    const e = 0.0549;
    const M = norm(115.3654 + 13.0649929509 * d);
    const E = kepler(M * RAD, e);
    const xv = a * (Math.cos(E) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const v = Math.atan2(yv, xv) * DEG;
    let r = Math.hypot(xv, yv);
    const xh = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
    const yh = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
    const zh = r * sind(v + w) * sind(i);
    let lon = norm(Math.atan2(yh, xh) * DEG);
    let lat = Math.atan2(zh, Math.hypot(xh, yh)) * DEG;
    const sun = sunEcliptic(d);
    const Ms = sun.M, Ls = sun.L, Mm = M, Lm = norm(N + w + M);
    const D = Lm - Ls, F = Lm - N;
    lon += -1.274 * sind(Mm - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms) - 0.059 * sind(2 * Mm - 2 * D) - 0.057 * sind(Mm - 2 * D + Ms) +
      0.053 * sind(Mm + 2 * D) + 0.046 * sind(2 * D - Ms) + 0.041 * sind(Mm - Ms) - 0.035 * sind(D) - 0.031 * sind(Mm + Ms) - 0.015 * sind(2 * F - 2 * D) + 0.011 * sind(Mm - 4 * D);
    lat += -0.173 * sind(F - 2 * D) - 0.055 * sind(Mm - F - 2 * D) - 0.046 * sind(Mm + F - 2 * D) + 0.033 * sind(F + 2 * D) + 0.017 * sind(2 * Mm + F);
    r += -0.58 * cosd(Mm - 2 * D) - 0.46 * cosd(2 * D);
    const x = cosd(lon) * cosd(lat), y = sind(lon) * cosd(lat), z = sind(lat);
    const eq = eclToEq(x, y, z, d);
    const sunEq = eclToEq(sun.x, sun.y, sun.z, d);
    const elong = separation(eq.ra, eq.dec, sunEq.ra, sunEq.dec);
    const waxing = norm(lon - sun.lon) < 180;
    return { ...eq, distanceEarthRadii: r, diameterArcsec: 1873.7 * (60.2666 / r), illum: (1 - cosd(elong)) / 2, elongation: elong, waxing, age: (norm(lon - sun.lon) / 360) * 29.530588853 };
  }

  // Altitude for the Moon with an approximate parallax correction (up to ~1°).
  function moonAltAz(date, lat, lon) {
    const m = moonRaDec(date);
    const p = altAz(m.ra, m.dec, date, lat, lon);
    return { ...p, alt: p.alt - 0.95 * cosd(p.alt) * (60.2666 / m.distanceEarthRadii) };
  }

  function moonPhase(date) {
    const m = moonRaDec(date);
    return { age: m.age, illum: m.illum, waxing: m.waxing };
  }

  function phaseName(age) {
    return age < 1.5 ? 'New Moon' : age < 6.4 ? 'Waxing crescent' : age < 8.4 ? 'First quarter' : age < 13.8 ? 'Waxing gibbous' : age < 15.8 ? 'Full Moon' : age < 21.1 ? 'Waning gibbous' : age < 23.1 ? 'Last quarter' : age < 28 ? 'Waning crescent' : 'New Moon';
  }

  global.Astro = { altAz, fieldRotationRate, separation, planetRaDec, sunRaDec, moonRaDec, moonAltAz, moonPhase, phaseName, PLANETS, lstDeg, julian, RAD, DEG };
})(window);
