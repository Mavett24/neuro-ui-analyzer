"use client";

import { useEffect, useRef } from "react";

// Hero background. A slow domain-warped noise field in the darkest greens of the palette, with a
// faint dot grid that catches the light where the field is brighter. Rendered at half resolution
// and about 30fps, only while visible. A single still frame with reduced motion.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uScale;
uniform vec2 uFocus;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy / uRes.y) * 1.6;
  float t = uTime * 0.035;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 2.2 * q + vec2(t * 0.6, -t * 0.4));
  // Light pools toward the right, behind the brain.
  float pool = smoothstep(1.05, 0.0, distance(uv, uFocus) * 1.35);
  float field = smoothstep(0.35, 0.95, f) * (0.35 + 0.65 * pool);

  vec3 col = mix(vec3(0.0), vec3(0.055, 0.105, 0.06), field);

  // Dot grid, 24 css px, brighter where the field is.
  vec2 g = mod(gl_FragCoord.xy, 24.0 * uScale) - 12.0 * uScale;
  float grid = 1.0 - smoothstep(0.6 * uScale, 1.3 * uScale, length(g));
  col += grid * vec3(0.243, 0.29, 0.235) * (0.18 + 0.9 * field);

  // Fine grain against banding.
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.012;

  // Fade to the void at the bottom so the next section starts clean.
  col *= smoothstep(0.0, 0.32, uv.y);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function ShaderBg({ className = "", focus = [0.74, 0.55] }) {
  const [fx, fy] = focus;
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("ShaderBg:", gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("ShaderBg:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uScale = gl.getUniformLocation(prog, "uScale");
    gl.uniform2f(gl.getUniformLocation(prog, "uFocus"), fx, fy);

    const RES = 0.5;
    let frame = 0,
      last = 0,
      visible = true;
    const t0 = performance.now() - 40000; // start mid-flow, not from a blank field
    const draw = (now) => {
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * RES;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uScale, dpr);
      draw(performance.now());
    };
    const loop = (now) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (now - last > 33) {
        last = now;
        draw(now);
      }
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!frame && !reduce) frame = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    const onVis = () => !document.hidden && start();
    document.addEventListener("visibilitychange", onVis);
    resize();
    start();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      // No loseContext() here: React can re-run this effect on the same canvas, which would then
      // hand back the lost context.
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [fx, fy]);

  return <canvas ref={ref} className={`shader-bg ${className}`} aria-hidden="true" />;
}
