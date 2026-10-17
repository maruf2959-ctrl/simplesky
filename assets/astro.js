// Low-precision astronomy helpers (good to a fraction of a degree), enough
// for "is it up, how high, how fast does the field rotate".
// Planet positions follow Paul Schlyter's "How to compute planetary positions".
(function (global) {
  const RAD = Math.PI / 180;
  const DEG = 180 / Math.PI;
  const EARTH_RATE = 7.2921159e-5; // rad/s, sidereal
  const norm = (x) => ((x % 360) + 360) % 360;

  const julian = (date) => date.getTime() / 86400000 + 2440587.5;

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
    const alt = Math.asin(sinAlt);
    const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
    return { alt: alt * DEG, az: norm(az * DEG) };
  }

  // Field rotation rate on an alt-az mount (rad/s).
  function fieldRotationRate(altDeg, azDeg, latDeg) {
    const c = Math.cos(altDeg * RAD);
    if (c < 1e-3) return Infinity;
    return Math.abs((EARTH_RATE * Math.cos(latDeg * RAD) * Math.cos(azDeg * RAD)) / c);
  }

  function kepler(M, e) {
    let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (let i = 0; i < 6; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
  }

  const ELEMENTS = {
    jupiter: (d) => ({ N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d, diam: 196.94 }),
    saturn: (d) => ({ N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d, diam: 165.6 })
  };

  function sunEcliptic(d) {
    const w = 282.9404 + 4.70935e-5 * d;
    const e = 0.016709 - 1.151e-9 * d;
    const M = norm(356.047 + 0.9856002585 * d) * RAD;
    const E = kepler(M, e);
    const xv = Math.cos(E) - e;
    const yv = Math.sqrt(1 - e * e) * Math.sin(E);
    const v = Math.atan2(yv, xv);
    const r = Math.hypot(xv, yv);
    const lon = v + w * RAD;
    return { x: r * Math.cos(lon), y: r * Math.sin(lon), z: 0 };
  }

  function eclToEq(x, y, z, d) {
    const ecl = (23.4393 - 3.563e-7 * d) * RAD;
    const ye = y * Math.cos(ecl) - z * Math.sin(ecl);
    const ze = y * Math.sin(ecl) + z * Math.cos(ecl);
    return { ra: norm(Math.atan2(ye, x) * DEG), dec: Math.atan2(ze, Math.hypot(x, ye)) * DEG };
  }

  function sunRaDec(date) {
    const d = julian(date) - 2451543.5;
    const s = sunEcliptic(d);
    return eclToEq(s.x, s.y, s.z, d);
  }

  function planetRaDec(name, date) {
    const d = julian(date) - 2451543.5;
    const el = ELEMENTS[name](d);
    const M = norm(el.M) * RAD;
    const E = kepler(M, el.e);
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
    const dist = Math.hypot(xg, yg, zg);
    return { ...eclToEq(xg, yg, zg, d), diameterArcsec: el.diam / dist };
  }

  // Moon age/illumination from a mean synodic month. Good to ~half a day.
  function moonPhase(date) {
    const synodic = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const age = (((date.getTime() / 86400000 - ref) % synodic) + synodic) % synodic;
    const illum = (1 - Math.cos((2 * Math.PI * age) / synodic)) / 2;
    return { age, illum };
  }

  global.Astro = { altAz, fieldRotationRate, planetRaDec, sunRaDec, moonPhase, RAD, DEG };
})(window);
