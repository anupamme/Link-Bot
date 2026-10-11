import {
  WebGLRenderer,
  BufferGeometry,
  Float32BufferAttribute,
  ShaderMaterial,
  Points,
  Scene,
  PerspectiveCamera,
  NormalBlending,
  LinearSRGBColorSpace,
} from "./wave-background.bundle.js";

// The same point mesh, camera and shaders as the cabinet, sized to its host.
export function createPresetWave(canvas) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(43, 1, 0.1, 60);
  camera.position.set(0, 0, 12.8);
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0, 1);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  const positions = new Float32Array(154 * 112 * 3);
  let offset = 0;
  for (let row = 0; row < 112; row++)
    for (let column = 0; column < 154; column++) {
      positions[offset++] = (column / 153 - 0.5) * 28;
      positions[offset++] = (row / 111 - 0.5) * 20;
      positions[offset++] = 0;
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new ShaderMaterial({
    uniforms: {
      uPhase: { value: 0 },
      uVariant: { value: 1.7 },
      uPointSize: { value: 2.3 },
      uOpacity: { value: 0.5 },
    },
    vertexShader: `uniform float uPhase; uniform float uVariant; uniform float uPointSize; varying float vAlpha;
      void main(){vec3 p=position;
        float broadWave=sin(p.x*.72+uPhase+uVariant*1.37)*.58;
        float crossWave=cos(p.y*1.08-uPhase*2.0+uVariant*.81)*.30;
        float fineWave=sin((p.x+p.y)*.48+uPhase*3.0+uVariant)*.17;
        p.z+=broadWave+crossWave+fineWave; p.y+=sin(p.x*.36-uPhase+uVariant)*.12;
        vec4 viewPosition=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=uPointSize*clamp(18.0/-viewPosition.z,.72,1.65);
        gl_Position=projectionMatrix*viewPosition;
        vAlpha=.58+.42*smoothstep(-.75,.85,broadWave+crossWave);}`,
    fragmentShader: `uniform float uOpacity; varying float vAlpha;
      void main(){float radius=length(gl_PointCoord-vec2(.5));
        float edge=1.0-smoothstep(.25,.5,radius); if(edge<=0.0)discard;
        gl_FragColor=vec4(vec3(.92),edge*vAlpha*uOpacity);}`,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
  const points = new Points(geometry, material);
  points.position.set(0, 0, -4.4);
  points.rotation.set(-0.12, 0, 0.015);
  points.scale.setScalar(1.14);
  scene.add(points);
  let paused = true,
    speed = 45,
    progress = 0,
    previousTime = 0,
    frameId = 0;
  const render = () => {
    material.uniforms.uPhase.value = progress * Math.PI * 2;
    renderer.render(scene, camera);
  };
  function resize() {
    const parent = canvas.parentElement,
      width = Math.max(1, parent.clientWidth),
      height = Math.max(1, parent.clientHeight);
    renderer.setPixelRatio(
      Math.min(
        devicePixelRatio || 1,
        Math.min(width, height) < 720 ? 1.25 : 1.5,
      ),
    );
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 720 && height > width ? 49 : 43;
    camera.updateProjectionMatrix();
    render();
  }
  function frame(now) {
    frameId = 0;
    if (paused) return;
    const elapsed = previousTime ? Math.min(80, now - previousTime) : 0;
    previousTime = now;
    progress = (progress + elapsed / (17000 - ((speed - 10) / 90) * 12000)) % 1;
    render();
    frameId = requestAnimationFrame(frame);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();
  return {
    setConfig(config) {
      speed = config.speed;
      render();
    },
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      previousTime = 0;
      cancelAnimationFrame(frameId);
      if (!paused) frameId = requestAnimationFrame(frame);
    },
    destroy() {
      paused = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
