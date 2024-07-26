const vertexShader = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position;
  gl_Position = vec4(1.0 - position * 2.0, 0.0, 1.0);
}`;
const uniformsNames = [
  'enhance', 'brightness', 'contrast', 'saturation',
  'warmth', 'fade', 'highlights', 'shadows',
  'vignette', 'grain', 'sharpen',
];
const fragmentShader = `
precision highp float;
varying vec2 uv;
uniform sampler2D image;
uniform sampler2D histogram;
${uniformsNames.map(name => `uniform float ${name};`).join('\n')}
uniform vec2 resolution;

const mediump vec3 hsLuminanceWeighting = vec3(0.3, 0.3, 0.3);
const mediump vec3 satLuminanceWeighting = vec3(0.2126, 0.7152, 0.0722);
const lowp float permTexUnit = 1.0 / 256.0;
const lowp float permTexUnitHalf = 0.5 / 256.0;
const lowp float grainsize = 2.3;

const float PI = 3.14159265358979323846;

// Various conversions

vec3 srgb_to_linear(vec3 srgb) {
  return mix(pow((srgb + 0.055) / 1.055, vec3(2.4)), srgb / 12.92, step(srgb, vec3(0.04045)));
}

vec3 linear_to_srgb(vec3 rgb) {
  return mix(1.055 * pow(rgb, vec3(1.0 / 2.4)) - 0.055, rgb * 12.92, step(rgb, vec3(0.0031308)));
}

vec3 linear_srgb_to_oklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

  float l_ = pow(l, 1.0 / 3.0);
  float m_ = pow(m, 1.0 / 3.0);
  float s_ = pow(s, 1.0 / 3.0);

  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

vec3 oklab_to_linear_srgb(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;

  return vec3(
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 oklab_to_oklch(vec3 lab) {
  float c = sqrt(lab.y * lab.y + lab.z * lab.z);
  float h = atan(lab.z, lab.y);
  return vec3(lab.x, c, h);
}

vec3 oklch_to_oklab(vec3 lch) {
  return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
}

vec3 rgb_to_hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
  vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

lowp vec3 hsv_to_rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

highp float get_luma(highp vec3 rgbP) {
  return (0.299 * rgbP.r) + (0.587 * rgbP.g) + (0.114 * rgbP.b);
}

highp vec3 rgb_to_yuv(highp vec3 inP) {
  highp float luma = get_luma(inP);
  return vec3(luma, (1.0 / 1.772) * (inP.b - luma), (1.0 / 1.402) * (inP.r - luma));
}

lowp vec3 yuv_to_rgb(highp vec3 inP) {
  return vec3(1.402 * inP.b + inP.r, (inP.r - (0.299 * 1.402 / 0.587) * inP.b - (0.114 * 1.772 / 0.587) * inP.g), 1.772 * inP.g + inP.r);
}

// Utilities

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

highp vec4 rnm(in highp vec2 tc) {
  highp float noise = sin(dot(tc, vec2(12.9898, 78.233))) * 43758.5453;
  return vec4(fract(noise), fract(noise * 1.2154), fract(noise * 1.3453), fract(noise * 1.3647)) * 2.0 - 1.0;
}

highp float fd(in highp float t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

highp float pnoise3D(in highp vec3 p) {
  highp vec3 pi = permTexUnit * floor(p) + permTexUnitHalf;
  highp vec3 pf = fract(p);
  highp float perm = rnm(pi.xy).a;
  highp float n000 = dot(rnm(vec2(perm, pi.z)).rgb * 4.0 - 1.0, pf);
  highp float n001 = dot(rnm(vec2(perm, pi.z + permTexUnit)).rgb * 4.0 - 1.0, pf - vec3(0.0, 0.0, 1.0));
  perm = rnm(pi.xy + vec2(0.0, permTexUnit)).a;
  highp float n010 = dot(rnm(vec2(perm, pi.z)).rgb * 4.0 - 1.0, pf - vec3(0.0, 1.0, 0.0));
  highp float n011 = dot(rnm(vec2(perm, pi.z + permTexUnit)).rgb * 4.0 - 1.0, pf - vec3(0.0, 1.0, 1.0));
  perm = rnm(pi.xy + vec2(permTexUnit, 0.0)).a;
  highp float n100 = dot(rnm(vec2(perm, pi.z)).rgb * 4.0 - 1.0, pf - vec3(1.0, 0.0, 0.0));
  highp float n101 = dot(rnm(vec2(perm, pi.z + permTexUnit)).rgb * 4.0 - 1.0, pf - vec3(1.0, 0.0, 1.0));
  perm = rnm(pi.xy + vec2(permTexUnit, permTexUnit)).a;
  highp float n110 = dot(rnm(vec2(perm, pi.z)).rgb * 4.0 - 1.0, pf - vec3(1.0, 1.0, 0.0));
  highp float n111 = dot(rnm(vec2(perm, pi.z + permTexUnit)).rgb * 4.0 - 1.0, pf - vec3(1.0, 1.0, 1.0));
  highp vec4 n_x = mix(vec4(n000, n001, n010, n011), vec4(n100, n101, n110, n111), fd(pf.x));
  highp vec2 n_xy = mix(n_x.xy, n_x.zw, fd(pf.y));
  return mix(n_xy.x, n_xy.y, fd(pf.z));
}

lowp vec2 coord_rot(in lowp vec2 tc, in lowp float angle) {
  return vec2(((tc.x * 2.0 - 1.0) * cos(angle) - (tc.y * 2.0 - 1.0) * sin(angle)) * 0.5 + 0.5, ((tc.y * 2.0 - 1.0) * cos(angle) + (tc.x * 2.0 - 1.0) * sin(angle)) * 0.5 + 0.5);
}

lowp float easeInOutSigmoid(lowp float value, lowp float strength) {
  if (value > 0.5) {
    return 1.0 - pow(2.0 - 2.0 * value, 1.0 / (1.0 - strength)) * 0.5;
  } else {
    return pow(2.0 * value, 1.0 / (1.0 - strength)) * 0.5;
  }
}

float equalize(float value) {
  const vec2 offset = vec2(0.001953125, 0.03125);
  value = value + offset.x;
  vec2 coord = (clamp(uv, 0.125, 1.0 - 0.125001) - 0.125) * 4.0;
  vec2 frac = fract(coord);
  coord = floor(coord);
  float p00 = float(coord.y * 4.0 + coord.x) * 0.0625 + offset.y;
  float p01 = float(coord.y * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;
  float p10 = float((coord.y + 1.0) * 4.0 + coord.x) * 0.0625 + offset.y;
  float p11 = float((coord.y + 1.0) * 4.0 + coord.x + 1.0) * 0.0625 + offset.y;
  vec3 c00 = texture2D(histogram, vec2(value, p00)).rgb;
  vec3 c01 = texture2D(histogram, vec2(value, p01)).rgb;
  vec3 c10 = texture2D(histogram, vec2(value, p10)).rgb;
  vec3 c11 = texture2D(histogram, vec2(value, p11)).rgb;
  float c1 = ((c00.r - c00.g) / (c00.b - c00.g));
  float c2 = ((c01.r - c01.g) / (c01.b - c01.g));
  float c3 = ((c10.r - c10.g) / (c10.b - c10.g));
  float c4 = ((c11.r - c11.g) / (c11.b - c11.g));
  float c1_2 = mix(c1, c2, frac.x);
  float c3_4 = mix(c3, c4, frac.x);
  return mix(c1_2, c3_4, frac.y);
}

// Actual adjustments

vec3 apply_enhance(vec3 rgb, float enhance) {
  vec3 hsv = rgb_to_hsv(rgb);
  vec3 enhanced = hsv;
  enhanced.y = min(1.0, enhanced.y * 1.2);
  enhanced.z = min(1.0, equalize(enhanced.z) * 1.1);
  return hsv_to_rgb(mix(hsv, enhanced, enhance));
}

vec3 apply_shadows_highlights(vec3 rgb, float shadows, float highlights) {
  mediump float hsLuminance = dot(rgb, hsLuminanceWeighting);
  mediump float shadow = clamp((pow(hsLuminance, 1.0 / shadows) + (-0.76) * pow(hsLuminance, 2.0 / shadows)) - hsLuminance, 0.0, 1.0);
  mediump float highlight = clamp((1.0 - (pow(1.0 - hsLuminance, 1.0 / (2.0 - highlights)) + (-0.8) * pow(1.0 - hsLuminance, 2.0 / (2.0 - highlights)))) - hsLuminance, -1.0, 0.0);
  lowp vec3 hsresult = vec3(0.0, 0.0, 0.0) + ((hsLuminance + shadow + highlight) - 0.0) * ((rgb - vec3(0.0, 0.0, 0.0)) / (hsLuminance - 0.0));
  mediump float contrastedLuminance = ((hsLuminance - 0.5) * 1.5) + 0.5;
  mediump float whiteInterp = contrastedLuminance * contrastedLuminance * contrastedLuminance;
  mediump float whiteTarget = clamp(highlights, 1.0, 2.0) - 1.0;
  hsresult = mix(hsresult, vec3(1.0), whiteInterp * whiteTarget);
  mediump float invContrastedLuminance = 1.0 - contrastedLuminance;
  mediump float blackInterp = invContrastedLuminance * invContrastedLuminance * invContrastedLuminance;
  mediump float blackTarget = 1.0 - clamp(shadows, 0.0, 1.0);
  return mix(hsresult, vec3(0.0), blackInterp * blackTarget);
}

vec3 apply_contrast(vec3 rgb, float contrast) {
  return clamp(((rgb - vec3(0.5)) * contrast + vec3(0.5)), 0.0, 1.0);
}

vec3 apply_fade(vec3 rgb, float fade) {
  return (rgb * (1.0 - fade)) + ((rgb + (vec3(-0.9772) * pow(rgb, vec3(3.0)) + vec3(1.708) * pow(rgb, vec3(2.0)) + vec3(-0.1603) * rgb + vec3(0.2878) - rgb * vec3(0.9))) * fade);
}

vec3 apply_saturation(vec3 rgb, float saturation) {
  lowp float satLuminance = dot(rgb, satLuminanceWeighting);
  lowp vec3 greyScaleColor = vec3(satLuminance);
  return clamp(mix(greyScaleColor, rgb, saturation), 0.0, 1.0);
}

vec3 apply_exposure(vec3 rgb, float exposure) {
  mediump float mag = exposure * 1.045;
  mediump float exppower = 1.0 + abs(mag);
  if (mag < 0.0) {
    exppower = 1.0 / exppower;
  }
  return 1.0 - vec3(pow((1.0 - rgb.r), exppower), pow((1.0 - rgb.g), exppower), pow((1.0 - rgb.b), exppower));
}

vec3 apply_warmth(vec3 rgb, float warmth) {
  highp vec3 yuvVec;
  if (warmth > 0.0) {
    yuvVec = vec3(0.1765, -0.1255, 0.0902);
  } else {
    yuvVec = -vec3(0.0588, 0.1569, -0.1255);
  }
  highp vec3 yuv = rgb_to_yuv(rgb);
  highp float luma = yuv.r;
  highp float curveScale = sin(luma * 3.14159);
  yuv += 0.375 * warmth * curveScale * yuvVec;
  return yuv_to_rgb(yuv);
}

vec3 apply_grain(vec3 rgb, float grain) {
  highp vec3 rotOffset = vec3(1.425, 3.892, 5.835);
  highp vec2 rotCoordsR = coord_rot(uv, rotOffset.x);
  highp vec3 noise = vec3(pnoise3D(vec3(rotCoordsR * vec2(resolution.x / grainsize, resolution.y / grainsize), 0.0)));
  lowp vec3 lumcoeff = vec3(0.299, 0.587, 0.114);
  lowp float luminance = dot(rgb, lumcoeff);
  lowp float lum = smoothstep(0.2, 0.0, luminance);
  lum += luminance;
  noise = mix(noise, vec3(0.0), pow(lum, 4.0));
  return rgb + noise * grain;
}

vec3 apply_vignette(vec3 rgb, float vignette) {
  const lowp float midpoint = 0.7;
  const lowp float fuzziness = 0.62;
  lowp float radDist = length(uv - 0.5) / sqrt(0.5);
  lowp float mag = easeInOutSigmoid(radDist * midpoint, fuzziness) * vignette * 0.645;
  return mix(pow(rgb, vec3(1.0 / (1.0 - mag))), vec3(0.0), mag * mag);
}

vec3 apply_sharpen(vec3 rgb, float sharpen) {
  vec2 off = 1.0 / resolution;
  vec3 neighborColors = 
    texture2D(image, uv + vec2(-off.x, 0)).rgb +
    texture2D(image, uv + vec2(off.x, 0)).rgb +
    texture2D(image, uv + vec2(0, -off.y)).rgb +
    texture2D(image, uv + vec2(0, off.y)).rgb;
  return rgb * (1.0 + 4.0 * sharpen) - neighborColors * sharpen;
}

void main() {
  vec4 color = texture2D(image, uv);
  vec3 rgb = color.rgb;

  rgb = clamp(apply_sharpen(rgb, 0.11 + sharpen * 0.6), 0.0, 1.0);
  
  rgb = apply_enhance(rgb, enhance);
  rgb = apply_shadows_highlights(rgb, shadows * 0.55 + 1.0, highlights * 0.75 + 1.0);
  rgb = apply_contrast(rgb, contrast * 0.3 + 1.0);
  rgb = apply_fade(rgb, fade);
  rgb = apply_saturation(rgb, saturation * (saturation > 0.0 ? 1.05 : 1.0) + 1.0);
  rgb = apply_exposure(rgb, brightness);
  rgb = apply_warmth(rgb, warmth);
  rgb = apply_grain(rgb, grain * 0.04);
  rgb = apply_vignette(rgb, vignette);

  gl_FragColor = clamp(vec4(rgb, color.a), 0.0, 1.0);
}
`;

export default class ImageAdjuster {
  constructor({ image }) {
    this.image = image;
    this.canvas = document.createElement('canvas');
    this.canvas.width = image.width;
    this.canvas.height = image.height;
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
      antialias: false,
    });
    this.gl = gl;
    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, image.width, image.height);
    this.shaders = this.createShaders();
    this.position = this.createArrayBuffer([0, 0, 0, 1, 1, 0, 1, 1]);
    this.texture = this.createTexture(image);
    gl.enableVertexAttribArray(this.shaders.attribs.position);
    gl.vertexAttribPointer(this.shaders.attribs.position, 2, gl.FLOAT, false, 0, 0);

    this.histogram = this.createTexture(this.computeCDF().result, 256, 16);
  }

  createArrayBuffer(data) {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return buffer;
  }

  createTexture(image, w, h) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (w && h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);  
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
    return texture;
  }

  createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  createShaders() {
    const gl = this.gl;
    const vertex = this.createShader(gl.VERTEX_SHADER, vertexShader);
    const fragment = this.createShader(gl.FRAGMENT_SHADER, fragmentShader);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    const uniforms = {};
    for (const name of uniformsNames) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    const image = gl.getUniformLocation(program, 'image');
    const histogram = gl.getUniformLocation(program, 'histogram');
    const resolution = gl.getUniformLocation(program, 'resolution');
    const attribs = {};
    for (const name of ['position']) {
      attribs[name] = gl.getAttribLocation(program, name);
    }

    return {
      vertex, fragment, program, uniforms, attribs, resolution, image, histogram,
    }
  }

  apply(values) {
    const gl = this.gl;
    // gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.useProgram(this.shaders.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.shaders.image, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.histogram);
    gl.uniform1i(this.shaders.histogram, 1);
    for (const name in this.shaders.uniforms) {
      gl.uniform1f(this.shaders.uniforms[name], name in values ? values[name] : 0);
    }
    gl.uniform2f(this.shaders.resolution, gl.canvas.width, gl.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  computeCDF() {
    const width = this.image.width;
    const height = this.image.height;
    
    const canvas2d = document.createElement('canvas');
    canvas2d.width = width;
    canvas2d.height = height;
    const ctx = canvas2d.getContext('2d');
    ctx.drawImage(this.image, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;

    const PGPhotoEnhanceHistogramBins = 256;
    const PGPhotoEnhanceSegments = 4;
    const totalSegments = PGPhotoEnhanceSegments * PGPhotoEnhanceSegments;
    const tileArea = Math.floor(width / PGPhotoEnhanceSegments) * Math.floor(height / PGPhotoEnhanceSegments);
    const clipLimit = Math.max(1, Math.floor(1.25 * tileArea / PGPhotoEnhanceHistogramBins));
    const scale = 255 / tileArea;

    const cdfsMin = new Uint32Array(totalSegments);
    const cdfsMax = new Uint32Array(totalSegments);
    const cdfs = new Uint32Array(totalSegments * PGPhotoEnhanceHistogramBins);
    const hist = new Uint32Array(totalSegments * PGPhotoEnhanceHistogramBins);

    const xStep = width / PGPhotoEnhanceSegments;
    const yStep = height / PGPhotoEnhanceSegments;
    const rMul = 0.299 * (PGPhotoEnhanceHistogramBins - 1) / 255;
    const gMul = 0.587 * (PGPhotoEnhanceHistogramBins - 1) / 255;
    const bMul = 0.114 * (PGPhotoEnhanceHistogramBins - 1) / 255;
    let idx = 0;
    for (let ty = 0; ty < PGPhotoEnhanceSegments; ty++) {
      for (let i = Math.round(ty * yStep); i < Math.min(height, Math.round((ty + 1) * yStep)); i++) {
        for (let tx = 0; tx < PGPhotoEnhanceSegments; tx++) {
          const tidx = (ty * PGPhotoEnhanceSegments + tx) * PGPhotoEnhanceHistogramBins;
          for (let j = Math.round(tx * xStep); j < Math.min(width, Math.round((tx + 1) * xStep)); j++) {
            const luma = Math.round(rMul * data[idx] + gMul * data[idx + 1] + bMul * data[idx + 2]);
            hist[tidx + luma] += 1;
            idx += 4;
          }
        }
      }
    }
    for (let i = 0; i < totalSegments; i++) {
      if (clipLimit > 0) {
        let clipped = 0;
        for (let j = 0; j < PGPhotoEnhanceHistogramBins; j++) {
          if (hist[i * PGPhotoEnhanceHistogramBins + j] > clipLimit) {
            clipped += hist[i * PGPhotoEnhanceHistogramBins + j] - clipLimit;
            hist[i * PGPhotoEnhanceHistogramBins + j] = clipLimit;
          }
        }
        const redistBatch = Math.floor(clipped / PGPhotoEnhanceHistogramBins);
        const residual = clipped - redistBatch * PGPhotoEnhanceHistogramBins;
        for (let j = 0; j < PGPhotoEnhanceHistogramBins; j++) {
          hist[i * PGPhotoEnhanceHistogramBins + j] += redistBatch;
          if (j < residual) {
            hist[i * PGPhotoEnhanceHistogramBins + j] += 1;
          }
        }
      }

      let part = [];
      for (let j = 0; j < PGPhotoEnhanceHistogramBins; j++) {
        cdfs[i * PGPhotoEnhanceHistogramBins + j] = hist[i * PGPhotoEnhanceHistogramBins + j];
        part.push(cdfs[i * PGPhotoEnhanceHistogramBins + j]);
      }
      let hMin = PGPhotoEnhanceHistogramBins - 1;
      for (let j = 0; j < hMin; j++) {
        if (cdfs[i * PGPhotoEnhanceHistogramBins + j] != 0) {
          hMin = j;
        }
      }
      let cdf = 0;
      for (let j = hMin; j < PGPhotoEnhanceHistogramBins; j++) {
        cdf += cdfs[i * PGPhotoEnhanceHistogramBins + j];
        cdfs[i * PGPhotoEnhanceHistogramBins + j] = Math.min(255, Math.floor(cdf * scale));
      }
      cdfsMin[i] = cdfs[i * PGPhotoEnhanceHistogramBins + hMin];
      cdfsMax[i] = cdfs[i * PGPhotoEnhanceHistogramBins + PGPhotoEnhanceHistogramBins - 1];
    }
    const result = new Uint8Array(totalSegments * PGPhotoEnhanceHistogramBins * 4);
    for (let j = 0; j < totalSegments; j++) {
      const yOffs = j * PGPhotoEnhanceHistogramBins * 4;
      for (let i = 0; i < PGPhotoEnhanceHistogramBins; i++) {
        const idx = i * 4 + yOffs;
        result[idx] = cdfs[j * PGPhotoEnhanceHistogramBins + i];
        result[idx + 1] = cdfsMin[j];
        result[idx + 2] = cdfsMax[j];
        result[idx + 3] = 255;
      }
    }
    return { hist, cdfs, cdfsMin, cdfsMax, result };
  }
}