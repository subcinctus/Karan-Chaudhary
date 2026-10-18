// WebGL2 helpers: context creation, shader compile/link with readable errors, a fullscreen
// triangle, reflected uniform setters and context-loss hooks. No rendering policy lives here.

/** Fullscreen triangle from gl_VertexID; no buffers needed. Exposes vUv (0..1). */
export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

let support;
export function hasWebGL2() {
  if (support !== undefined) return support;
  try { support = !!document.createElement('canvas').getContext('webgl2'); } catch { support = false; }
  return support;
}

/** WebGL2 context or null. Recording passes preserveDrawingBuffer so toDataURL reads the frame. */
export function getGL2(canvas, { preserveDrawingBuffer = false, antialias = false, alpha = false, powerPreference = 'high-performance' } = {}) {
  try {
    return canvas.getContext('webgl2', { preserveDrawingBuffer, antialias, alpha, depth: false, stencil: false, premultipliedAlpha: false, powerPreference });
  } catch { return null; }
}

/** Compile one shader; throws with the info log and numbered source on failure. */
export function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
    throw new Error(`Shader compile failed:\n${log}\n${numbered}`);
  }
  return sh;
}

/** Compile + link a program from vertex/fragment sources. */
export function program(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc), fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`Program link failed:\n${log}`);
  }
  return p;
}

/** Empty VAO for the gl_VertexID fullscreen triangle; draw with drawFullscreen(). */
export function fullscreenTriangle(gl) { return gl.createVertexArray(); }
export function drawFullscreen(gl, vao) {
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}

/**
 * Reflect active uniforms into setters. Usage: const u = uniforms(gl, prog); u.set({ uTime: 1, uKey: [1, 2, 3] }).
 * Unknown names are ignored so shaders can drop uniforms freely.
 */
export function uniforms(gl, prog) {
  const map = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    const name = info.name.replace(/\[0\]$/, '');
    map[name] = { loc: gl.getUniformLocation(prog, info.name), type: info.type, size: info.size };
  }
  const setOne = (u, v) => {
    const arr = typeof v === 'number' || typeof v === 'boolean' ? [Number(v)] : v;
    switch (u.type) {
      case gl.FLOAT: return gl.uniform1fv(u.loc, arr);
      case gl.FLOAT_VEC2: return gl.uniform2fv(u.loc, arr);
      case gl.FLOAT_VEC3: return gl.uniform3fv(u.loc, arr);
      case gl.FLOAT_VEC4: return gl.uniform4fv(u.loc, arr);
      case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: return gl.uniform1iv(u.loc, arr);
      case gl.INT_VEC2: return gl.uniform2iv(u.loc, arr);
      case gl.INT_VEC3: return gl.uniform3iv(u.loc, arr);
      case gl.FLOAT_MAT3: return gl.uniformMatrix3fv(u.loc, false, arr);
      case gl.FLOAT_MAT4: return gl.uniformMatrix4fv(u.loc, false, arr);
      default: return undefined;
    }
  };
  return {
    map,
    set(values) {
      gl.useProgram(prog);
      for (const [k, v] of Object.entries(values)) if (map[k] && v != null) setOne(map[k], v);
    },
  };
}

/** Texture from a canvas/image or raw data. */
export function texture(gl, source, { filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, w, h, internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (source && !(ArrayBuffer.isView(source))) gl.texImage2D(gl.TEXTURE_2D, 0, internal, format, type, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, source ?? null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

/** Render target: { fbo, tex, w, h }. */
export function renderTarget(gl, w, h, opts) {
  const tex = texture(gl, null, { w, h, ...opts });
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

/**
 * Context-loss hooks. `lost` runs after preventDefault (so the context can be restored);
 * `restored` should rebuild every GL resource. Returns an unsubscribe function.
 * The Player already listens on its canvas; pieces use this only for their own cleanup.
 */
export function onContextLoss(canvas, { lost, restored } = {}) {
  const onLost = e => { e.preventDefault(); lost?.(e); };
  const onRestored = e => restored?.(e);
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost, false);
    canvas.removeEventListener('webglcontextrestored', onRestored, false);
  };
}
