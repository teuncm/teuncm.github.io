export interface GpuWaveFrame {
  width: number
  height: number
  frequency: number
  phase: number
  amplitude: number
  ySteps: number
  quantizeY: number
  dark: boolean
  highlight: boolean
  guideOpacity: number
}

export interface WaveGpu {
  resize(width: number, height: number): void
  draw(frame: GpuWaveFrame): void
  dispose(): void
}

// Each instance is one antialiased line segment. Wave evaluation and quantization
// happen in the vertex shader; only a few uniforms cross from JS each frame.
const vertexSource = `#version 300 es
precision highp float;
uniform vec2 size;
uniform vec4 signal;
uniform float strength;
uniform float segments;
uniform float strokeWidth;
uniform vec2 range;
out vec2 local;
flat out float lengthPx;
const float TAU = 6.28318530718;
float wave(float t) {
  float raw = sin(TAU * signal.x * (t - 0.5) - TAU * 0.25 + signal.y) * signal.z;
  float stepSize = 0.5 / signal.w;
  float crushed = floor(raw / stepSize + 0.5) * stepSize;
  return size.y * 0.5 - mix(raw, crushed, strength) * (size.y - 24.0);
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
  vec2 direction = lengthPx > 0.0001 ? delta / lengthPx : vec2(1.0, 0.0);
  vec2 normal = vec2(-direction.y, direction.x);
  float edge = strokeWidth * 0.5 + 1.0;
  int id = gl_VertexID;
  bool end = id == 1 || id == 2 || id == 4;
  float side = (id == 0 || id == 1 || id == 3) ? -1.0 : 1.0;
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
      ['size', 'signal', 'strength', 'segments', 'strokeWidth', 'range', 'color']
        .map(name => [name, context.getUniformLocation(program!, name)]),
    )
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    return {
      resize(width, height) {
        canvas.width = width
        canvas.height = height
        context.viewport(0, 0, width, height)
      },
      draw(frame) {
        context.clear(context.COLOR_BUFFER_BIT)
        context.uniform2f(locations.size!, frame.width, frame.height)
        context.uniform4f(locations.signal!, frame.frequency, frame.phase, frame.amplitude, frame.ySteps)
        context.uniform1f(locations.strength!, frame.quantizeY)
        const count = Math.ceil(frame.width - 16)
        context.uniform1f(locations.segments!, count)
        context.uniform1f(locations.strokeWidth!, 1.5)
        context.uniform2f(locations.range!, 0, 1)
        if (frame.dark) context.uniform4f(locations.color!, 103 / 255, 212 / 255, 192 / 255, 1)
        else context.uniform4f(locations.color!, 23 / 255, 107 / 255, 96 / 255, 1)
        const multiplier = frame.quantizeY === 1 ? 2 : 1
        context.drawArraysInstanced(context.TRIANGLES, 0, 6, count * multiplier)
        if (frame.highlight) {
          const segments = Math.ceil(count / frame.frequency)
          context.uniform1f(locations.segments!, segments)
          context.uniform1f(locations.strokeWidth!, 2.5)
          context.uniform2f(locations.range!, 0.5 - 0.5 / frame.frequency, 0.5 + 0.5 / frame.frequency)
          if (frame.dark) context.uniform4f(locations.color!, 240 / 255, 199 / 255, 120 / 255, frame.guideOpacity)
          else context.uniform4f(locations.color!, 146 / 255, 96 / 255, 14 / 255, frame.guideOpacity)
          context.drawArraysInstanced(context.TRIANGLES, 0, 6, segments * multiplier)
        }
      },
      dispose,
    }
  } catch {
    dispose()
    return null
  }
}
