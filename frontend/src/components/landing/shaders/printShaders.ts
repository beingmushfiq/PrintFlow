export const cleanFloorVertexShader = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const cleanFloorFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uScrollProgress;
  uniform vec2 uMouseWorld;

  varying vec3 vWorldPos;

  void main() {
    float dist = length(vWorldPos.xz);
    // Subtle radial spotlight ring under the hardware without washing out the Obsidian background
    float radialFade = smoothstep(7.2, 0.9, dist);

    // Smooth analytic hairline grid free of aliasing shimmer
    vec2 gx = abs(fract(vWorldPos.xz * 0.75 - 0.5) - 0.5);
    float lineX = smoothstep(0.022, 0.0, gx.x);
    float lineY = smoothstep(0.022, 0.0, gx.y);
    float grid = max(lineX, lineY) * 0.38;

    // Focused under-chassis glow halo
    float stageHalo = smoothstep(3.1, 0.15, dist) * 0.24;

    // Gentle expanding telemetry sonar pulse synced cleanly with time
    float pulseR = mod(uTime * 1.15 + uScrollProgress * 2.5, 6.2);
    float pulseRing = smoothstep(0.2, 0.0, abs(dist - pulseR)) * smoothstep(6.2, 1.2, dist) * 0.36;

    // Cursor tracking spotlight on the floor plane
    float cursorDist = length(vWorldPos.xz - uMouseWorld);
    float cursorHalo = smoothstep(2.2, 0.0, cursorDist) * 0.34;

    vec3 cobalt = vec3(0.141, 0.357, 0.859);
    vec3 cyan = vec3(0.0, 0.824, 1.0);

    vec3 col = cobalt * (grid * 0.55 + stageHalo);
    col += cyan * (pulseRing + cursorHalo * (0.4 + grid));

    float alpha = radialFade * (stageHalo + grid * 0.48 + pulseRing + cursorHalo);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.75));
  }
`;

export const shredParticleVertexShader = /* glsl */ `
  attribute vec3 aRandomDir;
  attribute float aSeed;

  uniform float uTime;
  uniform float uShredProgress;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vec3 pos = position;

    float active = clamp(uShredProgress, 0.0, 1.0);
    float easeActive = active * active * (3.0 - 2.0 * active);
    float orbitTime = uTime * (0.4 + aSeed * 0.35);

    // Gentle floating dust at rest -> organized upward dissolution swirl in Chapter III
    pos += aRandomDir * easeActive * (0.8 + aSeed * 1.45);
    pos.y += sin(orbitTime + aSeed * 12.0) * 0.06 + easeActive * (0.65 + aSeed * 0.85);
    pos.x += cos(orbitTime * 0.8 + aSeed * 9.0) * (0.04 + 0.08 * easeActive);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float sizePx = mix(3.0, 6.2, aSeed) * uPixelRatio;
    gl_PointSize = sizePx * (1.0 - easeActive * 0.3) * (5.2 / max(-mvPosition.z, 1.0));

    float idleAlpha = 0.25 + 0.1 * sin(uTime * 1.8 + aSeed * 6.28);
    float burstAlpha = (1.0 - smoothstep(0.55, 1.0, active)) * 0.88;
    vAlpha = mix(idleAlpha, burstAlpha, smoothstep(0.08, 0.35, active));
  }
`;

export const shredParticleFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float boxMask = max(abs(centered.x), abs(centered.y));
    float softEdge = 1.0 - smoothstep(0.32, 0.48, boxMask);
    if (softEdge <= 0.01) discard;

    vec3 paper = vec3(0.94, 0.97, 1.0);
    vec3 cyan = vec3(0.0, 0.824, 1.0);
    vec3 emerald = vec3(0.063, 0.725, 0.506);

    vec3 tint = mix(paper, mix(cyan, emerald, step(0.6, vSeed)), step(0.32, vSeed));
    gl_FragColor = vec4(tint, vAlpha * softEdge);
  }
`;
