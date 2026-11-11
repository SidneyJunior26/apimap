import type { Attributes } from 'graphology-types';
import { NodeCircleProgram, type NodeProgramType } from 'sigma/rendering';

/** Halo radius as a multiple of the node radius. */
export const HALO = 2.6;

// language=GLSL
const VERTEX_SHADER = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_halo;

const float bias = 255.0 / 254.0;

void main() {
  float radius = a_size * u_correctionRatio / u_sizeRatio * 2.0;
  float halo = radius * ${HALO.toFixed(2)};
  // Equilateral triangle whose inscribed circle covers the halo.
  vec2 diffVector = 2.0 * halo * vec2(cos(a_angle), sin(a_angle));
  gl_Position = vec4((u_matrix * vec3(a_position + diffVector, 1)).xy, 0, 1);

  v_diffVector = diffVector;
  v_radius = radius;
  v_halo = halo;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif
  v_color.a *= bias;
}
`;

// language=GLSL
const fragmentShader = (intensity: number) => /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_halo;

uniform float u_correctionRatio;

void main(void) {
  float d = length(v_diffVector);

  #ifdef PICKING_MODE
  gl_FragColor = d > v_radius ? vec4(0.0) : v_color;
  #else
  float border = u_correctionRatio * 2.0;
  float core = 1.0 - smoothstep(v_radius - border, v_radius, d);
  float h = clamp((d - v_radius) / (v_halo - v_radius), 0.0, 1.0);
  float glow = pow(1.0 - h, 2.6) * ${intensity.toFixed(2)};
  // Brighter center gives the node a lit, glassy look.
  vec3 lit = mix(v_color.rgb, vec3(1.0), 0.45 * (1.0 - smoothstep(0.0, v_radius * 0.9, d)));
  vec3 rgb = mix(v_color.rgb, lit, core);
  float a = max(core, glow) * v_color.a;
  gl_FragColor = vec4(rgb * a, a);
  #endif
}
`;

/** Circle node with a soft colored halo of the given strength (0..1). Picking only hits the core disc. */
export function createGlowProgram<N extends Attributes = Attributes, E extends Attributes = Attributes, G extends Attributes = Attributes>(
  intensity: number,
): NodeProgramType<N, E, G> {
  const FRAGMENT_SHADER = fragmentShader(intensity);
  return class GlowNodeProgram extends NodeCircleProgram<N, E, G> {
    override getDefinition() {
      return { ...super.getDefinition(), VERTEX_SHADER_SOURCE: VERTEX_SHADER, FRAGMENT_SHADER_SOURCE: FRAGMENT_SHADER };
    }
  };
}
