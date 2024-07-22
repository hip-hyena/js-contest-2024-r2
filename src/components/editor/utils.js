export function makeEl(tag, className, { parent, html, text } = {}) {
  const el = document.createElement(tag);
  el.className = Array.isArray(className) ? className.join(' ') : className;
  html && (el.innerHTML = html);
  text && (el.textContent = text);
  parent && parent.append(el);
  return el;
}

export function hexToRgb(color) {
  return [parseInt(color.substring(1, 3), 16), parseInt(color.substring(3, 5), 16), parseInt(color.substring(5, 7), 16)];
}

export function rgbToHex(rgb) {
  return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function getLuma(rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

export function getContrastColor(color) {
  //console.log(getLuma(hexToRgb(color)));
  const rgb = hexToRgb(color);
  return getLuma(rgb) < 128 ? '#FFFFFF' : (color == '#FFFFFF' ? '#000000' : rgbToHex(rgb.map(v => v * 0.2)));
}

export function hsvToRgb([h, s, v]) {
  var r, g, b, i, f, p, q, t;
  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function rgbToHsv([r, g, b]) {
  var max = Math.max(r, g, b), min = Math.min(r, g, b),
        d = max - min,
        h,
        s = (max === 0 ? 0 : d / max),
        v = max / 255;

  switch (max) {
    case min: h = 0; break;
    case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
    case g: h = (b - r) + d * 2; h /= 6 * d; break;
    case b: h = (r - g) + d * 4; h /= 6 * d; break;
  }

  return [h, s, v];
}

function pointLineDistance(p, st, en) {
  let dx = en[0] - st[0];
  let dy = en[1] - st[1];
  let x = st[0];
  let y = st[1];
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = en[0];
      y = en[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

export function simplify(points, epsilon) {
  // Implement Ramer-Douglas-Peucker algorithm
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const distance = pointLineDistance(points[i], points[0], points[end]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance > epsilon) {
    const results1 = simplify(points.slice(0, index + 1), epsilon);
    const results2 = simplify(points.slice(index), epsilon);
    return results1.slice(0, -1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
}

export function fitCubicBezier(points, maxError) {
  const result = [];
  let startIndex = 0;

  while (startIndex < points.length - 1) {
    let endIndex = points.length - 1;
    let bezier = null;

    while (endIndex > startIndex + 1) {
      const candidateBezier = estimateBezier(points, startIndex, endIndex);
      const error = calculateMaxError(points, startIndex, endIndex, candidateBezier);

      if (error <= maxError) {
        bezier = candidateBezier;
        break;
      }

      endIndex--;
    }

    if (bezier === null) {
      // If we couldn't fit a Bezier curve, use a linear segment
      bezier = [points[startIndex], points[startIndex + 1]];
      endIndex = startIndex + 1;
    }

    result.push(bezier);
    startIndex = endIndex;
  }

  return result;
}

function estimateBezier(points, startIndex, endIndex) {
  const p0 = points[startIndex];
  const p3 = points[endIndex];

  // Calculate the chord length
  const chordLength = distance(p0, p3);

  // Calculate tangents
  const tangentStart = calculateTangent(points, startIndex, Math.min(startIndex + 2, endIndex));
  const tangentEnd = calculateTangent(points, Math.max(endIndex - 2, startIndex), endIndex);

  // Normalize tangents
  const tangentStartLength = Math.sqrt(tangentStart[0] * tangentStart[0] + tangentStart[1] * tangentStart[1]);
  const tangentEndLength = Math.sqrt(tangentEnd[0] * tangentEnd[0] + tangentEnd[1] * tangentEnd[1]);

  if (tangentStartLength > 0 && tangentEndLength > 0) {
    tangentStart[0] /= tangentStartLength;
    tangentStart[1] /= tangentStartLength;
    tangentEnd[0] /= tangentEndLength;
    tangentEnd[1] /= tangentEndLength;

    // Calculate control points
    const thirdChordLength = chordLength / 3;
    const p1 = [
      p0[0] + tangentStart[0] * thirdChordLength,
      p0[1] + tangentStart[1] * thirdChordLength
    ];
    const p2 = [
      p3[0] - tangentEnd[0] * thirdChordLength,
      p3[1] - tangentEnd[1] * thirdChordLength
    ];

    return [p0, p3, p1, p2];
  } else {
    // Fallback to a simple curve if tangents can't be calculated
    return [p0, p3];
  }
}

function calculateTangent(points, start, end) {
  return [
    points[end][0] - points[start][0],
    points[end][1] - points[start][1]
  ];
}

export function interpolatePoint(p1, p2, t) {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t
  ];
}

function calculateMaxError(points, startIndex, endIndex, bezier) {
  let maxError = 0;
  for (let i = startIndex + 1; i < endIndex; i++) {
    const t = (i - startIndex) / (endIndex - startIndex);
    const point = evaluateBezier(bezier, t);
    const error = distance(point, points[i]);
    if (error > maxError) {
      maxError = error;
    }
  }
  return maxError;
}

export function evaluateBezier(bezier, t) {
  if (bezier.length === 2) {
    // Linear interpolation for straight segments
    return interpolatePoint(bezier[0], bezier[1], t);
  }

  const mt = 1 - t;
  return [
    mt * mt * mt * bezier[0][0] + 3 * mt * mt * t * bezier[2][0] + 3 * mt * t * t * bezier[3][0] + t * t * t * bezier[1][0],
    mt * mt * mt * bezier[0][1] + 3 * mt * mt * t * bezier[2][1] + 3 * mt * t * t * bezier[3][1] + t * t * t * bezier[1][1]
  ];
}

export function distance(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}