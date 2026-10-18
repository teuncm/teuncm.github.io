// Shared by the GPU wave and the 2D overlay/fallback so theme colors stay in sync.
const dark = {
  background: '#0d1112',
  wave: '#67d4c0',
  axis: '#3a4647',
  stems: '#67d4c033',
  sample: '#b4dbd1',
  marker: '#f0c778',
  strokeWidth: 1.5,
  sampleRadius: 2,
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number]
}

function palette(colors: typeof dark) {
  return { ...colors, waveRgb: rgb(colors.wave), markerRgb: rgb(colors.marker) }
}

const plotPalette = palette(dark)
export const wavePalettes = { light: plotPalette, dark: plotPalette }

export interface GpuWaveFrame {
  width: number
  height: number
  frequency: number
  phase: number
  amplitude: number
  ySteps: number
  quantizeY: number
  chorusOffset: number
  highlight: boolean
  guideOpacity: number
}

export interface WaveGpu {
  resize(width: number, height: number): void
  draw(frame: GpuWaveFrame): void
  dispose(): void
}

export function waveSegments(width: number, height: number, frequency: number, amplitude: number, quantization: number) {
  const fullResolution = Math.max(1, Math.ceil(width - 16))
  // Bound smooth sine interpolation error to 0.1 CSS px. Steps keep pixel resolution.
  if (quantization > 0) return fullResolution
  const curvature = Math.PI * 2 * frequency * Math.sqrt(Math.max(0, (height - 24) * amplitude) / 0.8)
  return Math.max(32, Math.ceil(curvature))
}

// Each instance is one antialiased line segment. Wave evaluation and quantization
// happen in the vertex shader; only a few uniforms cross from JS each frame.
const vertexSource = `#version 300 es
precision highp float;
uniform vec2 size;
uniform vec4 signal;
uniform float strength;
uniform float chorusOffset;
uniform vec2 smoothChorus;
uniform float segments;
uniform float strokeWidth;
uniform vec2 range;
out vec2 local;
flat out float lengthPx;
const float TAU = 6.28318530718;
float sampleValue(float t, float offset) {
  float raw = sin(TAU * signal.x * (t - 0.5) - TAU * 0.25 + signal.y + offset) * signal.z;
  float stepSize = 0.5 / signal.w;
  float crushed = floor(raw / stepSize + 0.5) * stepSize;
  return mix(raw, crushed, strength);
}
float wave(float t) {
  if (strength == 0.0) {
    float raw = sin(TAU * signal.x * (t - 0.5) - TAU * 0.25 + signal.y + smoothChorus.x) * signal.z * smoothChorus.y;
    return size.y * 0.5 - raw * (size.y - 24.0);
  }
  float value = sampleValue(t, 0.0);
  if (chorusOffset != 0.0) value = (value + sampleValue(t, chorusOffset)) * 0.5;
  return size.y * 0.5 - value * (size.y - 24.0);
}
void main() {
  int instance = gl_InstanceID;
  bool stepped = strength >= 1.0;
  float index = float(stepped ? instance / 2 : instance);
  float t0 = mix(range.x, range.y, index / segments);
  float t1 = mix(range.x, range.y, (index + 1.0) / segments);
  vec2 a = vec2(8.0 + t0 * (size.x - 16.0), wave(t0));
  vec2 b = vec2(8.0 + t1 * (size.x - 16.0), wave(t1));
  if (stepped) {
    if (instance % 2 == 0) b.y = a.y;
    else a.x = b.x;
  }
  vec2 delta = b - a;
  lengthPx = length(delta);
  if (lengthPx < 0.0001) {
    local = vec2(0.0);
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    return;
  }
  vec2 direction = lengthPx > 0.0001 ? delta / lengthPx : vec2(1.0, 0.0);
  vec2 normal = vec2(-direction.y, direction.x);
  float edge = strokeWidth * 0.5 + 1.0;
  int id = gl_VertexID;
  bool end = id == 1 || id == 3;
  float side = id < 2 ? -1.0 : 1.0;
  local = vec2(end ? lengthPx + edge : -edge, side * edge);
  vec2 point = a + direction * local.x + normal * local.y;
  gl_Position = vec4(point.x / size.x * 2.0 - 1.0, 1.0 - point.y / size.y * 2.0, 0.0, 1.0);
}`

const fragmentSource = `#version 300 es
precision highp float;
uniform vec4 color;
uniform float strokeWidth;
in vec2 local;
flat in float lengthPx;
out vec4 pixel;
void main() {
  float d = length(vec2(local.x - clamp(local.x, 0.0, lengthPx), local.y));
  float alpha = 1.0 - smoothstep(strokeWidth * 0.5 - 0.5, strokeWidth * 0.5 + 0.5, d);
  pixel = vec4(color.rgb, color.a * alpha);
}`

export function createWaveGpu(canvas: HTMLCanvasElement): WaveGpu | null {
  let gl: WebGL2RenderingContext | null = null
  const shaders: WebGLShader[] = []
  let program: WebGLProgram | null = null
  let vao: WebGLVertexArrayObject | null = null
  const dispose = () => {
    if (!gl) return
    shaders.forEach(shader => gl!.deleteShader(shader))
    if (vao) gl.deleteVertexArray(vao)
    if (program) gl.deleteProgram(program)
  }
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'low-power', failIfMajorPerformanceCaveat: true,
    })
    if (!gl) return null
    const context = gl
    function compile(type: number, source: string) {
      const shader = context.createShader(type)
      if (!shader) throw new Error('Shader allocation failed')
      shaders.push(shader)
      context.shaderSource(shader, source)
      context.compileShader(shader)
      if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error('Shader compilation failed')
      return shader
    }
    program = gl.createProgram()
    if (!program) throw new Error('Program allocation failed')
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed')
    vao = gl.createVertexArray()
    if (!vao) throw new Error('Vertex array allocation failed')
    const locations = Object.fromEntries(
      ['size', 'signal', 'strength', 'chorusOffset', 'smoothChorus', 'segments', 'strokeWidth', 'range', 'color']
        .map(name => [name, context.getUniformLocation(program!, name)]),
    )
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    let previous: GpuWaveFrame | null = null
    let stroke = NaN
    let rangeStart = NaN
    let rangeEnd = NaN
    let segments = NaN
    let rgb: readonly number[] | null = null
    let alpha = NaN
    function setStroke(value: number) {
      if (stroke === value) return
      stroke = value
      context.uniform1f(locations.strokeWidth!, value)
    }
    function setRange(start: number, end: number) {
      if (rangeStart === start && rangeEnd === end) return
      rangeStart = start
      rangeEnd = end
      context.uniform2f(locations.range!, start, end)
    }
    function setSegments(value: number) {
      if (segments === value) return
      segments = value
      context.uniform1f(locations.segments!, value)
    }
    function setColor(value: [number, number, number], opacity: number) {
      if (rgb === value && alpha === opacity) return
      rgb = value
      alpha = opacity
      context.uniform4f(locations.color!, ...value, opacity)
    }
    return {
      resize(width, height) {
        canvas.width = width
        canvas.height = height
        context.viewport(0, 0, width, height)
        previous = null
      },
      draw(frame) {
        const colors = wavePalettes.dark
        const sameSize = previous?.width === frame.width && previous.height === frame.height
        const sameSignal = previous?.frequency === frame.frequency && previous.phase === frame.phase &&
          previous.amplitude === frame.amplitude && previous.ySteps === frame.ySteps
        // The 2D guides can move/fade while the GPU wave itself stays unchanged.
        if (sameSize && sameSignal && previous!.quantizeY === frame.quantizeY &&
          previous!.chorusOffset === frame.chorusOffset &&
          previous!.highlight === frame.highlight && (!frame.highlight || previous!.guideOpacity === frame.guideOpacity)) return
        context.clear(context.COLOR_BUFFER_BIT)
        if (!sameSize) context.uniform2f(locations.size!, frame.width, frame.height)
        if (!sameSignal) context.uniform4f(locations.signal!, frame.frequency, frame.phase, frame.amplitude, frame.ySteps)
        if (previous?.quantizeY !== frame.quantizeY) context.uniform1f(locations.strength!, frame.quantizeY)
        if (previous?.chorusOffset !== frame.chorusOffset) {
          context.uniform1f(locations.chorusOffset!, frame.chorusOffset)
          const halfPhase = frame.chorusOffset * 0.5
          context.uniform2f(locations.smoothChorus!, halfPhase, Math.cos(halfPhase))
        }
        const count = waveSegments(frame.width, frame.height, frame.frequency, frame.amplitude, frame.quantizeY)
        setSegments(count)
        setStroke(colors.strokeWidth)
        setRange(0, 1)
        const multiplier = frame.quantizeY === 1 ? 2 : 1
        setColor(colors.waveRgb, 1)
        context.drawArraysInstanced(context.TRIANGLE_STRIP, 0, 4, count * multiplier)
        if (frame.highlight && frame.guideOpacity > 0) {
          const highlightedSegments = Math.ceil(count / frame.frequency)
          setSegments(highlightedSegments)
          setStroke(2.5)
          setRange(0.5 - 0.5 / frame.frequency, 0.5 + 0.5 / frame.frequency)
          setColor(colors.markerRgb, frame.guideOpacity)
          context.drawArraysInstanced(context.TRIANGLE_STRIP, 0, 4, highlightedSegments * multiplier)
        }
        previous = frame
      },
      dispose,
    }
  } catch {
    dispose()
    return null
  }
}
