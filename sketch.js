import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.175.0/build/three.module.js';

/* ---------- DOM ---------- */
const ctn          = document.getElementById('art');
const sliders      = {
  hueA:   document.getElementById('hueA'),
  hueB:   document.getElementById('hueB'),
  hueC:   document.getElementById('hueC'),
  soft:   document.getElementById('soft'),
  corner: document.getElementById('corner'),
  inner:  document.getElementById('inner'),
  gblur:  document.getElementById('gblur'),
  sat:    document.getElementById('sat'),
  val:    document.getElementById('val')
};
sliders.inner.dataset.inverse = 100 - sliders.inner.value;
const resetBtn     = document.getElementById('reset');

const MAX_HUES = 10;
let hueValues = [0, 80, 200];
// dynamic hues

/* ---------- THREE ---------- */
const scene   = new THREE.Scene();
const camera  = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const renderer= new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(ctn.clientWidth, ctn.clientHeight);
ctn.appendChild(renderer.domElement);

/* ---------- Shader ---------- */
const frag = /* glsl */`
precision mediump float;
uniform vec2  u_res;
uniform float u_sat;
uniform float u_val;
uniform float u_soft;
uniform float u_corner;
uniform float u_inner;
uniform float u_hues[10];
uniform int u_hueCount;

vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.,2./3.,1./3.,3.);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6. - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0., 1.), c.y);
}

float rectSDF(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q,0.)) + min(max(q.x,q.y),0.) - r;
}

void main(){
  // flip vertically
  vec2 uv = vec2(gl_FragCoord.x / u_res.x, 1.0 - (gl_FragCoord.y / u_res.y));
  vec2 p  = (uv - 0.5) * 2.0;          // center at 0

  // distance from inner rect
  float d = rectSDF(p, vec2(u_inner), u_corner);

  // softness control (extra gamma so black fades more gradually)
  float core = pow(smoothstep(0.0, 0.001 + u_soft, d), 0.5);

  // outer gradient mix
  float r = length(p);
  float segment = 1.0 / float(u_hueCount - 1);
  int idx = int(clamp(floor(r / segment), 0.0, float(u_hueCount - 2)));
  float t = (r - float(idx) * segment) / segment;
  vec3 col1 = hsv2rgb(vec3(u_hues[idx], u_sat, u_val));
  vec3 col2 = hsv2rgb(vec3(u_hues[idx+1], u_sat, u_val));
  vec3 grad = mix(col1, col2, t);
  
  vec3 final = mix(vec3(0.0), grad, core);

  gl_FragColor = vec4(final, 1.0);
}
`;

const material = new THREE.ShaderMaterial({
  fragmentShader: frag,
  uniforms: {
    u_res:    {value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height)},
    u_sat:    {value: 0.8},
    u_val:    {value: 1.0},
    u_soft:   {value: 0.1},
    u_corner: {value: 0.05},
    u_inner:  {value: 0.6},
    u_hues:    { value: new Array(MAX_HUES).fill(0) },
    u_hueCount:{ value: hueValues.length }
  }
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), material);
scene.add(quad);

/* ---------- Helpers ---------- */
function ui2unit(id, mul=1){
  const val = id === 'inner' && sliders[id].dataset.inverse ? sliders[id].dataset.inverse : sliders[id].value;
  return parseFloat(val) * mul;
}

function renderHueSliders() {
  huesContainer.innerHTML = '';
  hueValues.forEach((h, i) => {
    const section = document.createElement('section');
    const label = document.createElement('label');
    label.className = 'heading';
    label.textContent = `Hue ${i + 1}`;
    const input = document.createElement('input');
    input.type = 'range'; input.min = 0; input.max = 360;
    input.value = h;
    input.addEventListener('input', () => {
      hueValues[i] = parseFloat(input.value);
      update();
    });
    section.append(label, input);
    huesContainer.appendChild(section);
  });
}

function update(){
  // push values into uniform array
  for (let i = 0; i < MAX_HUES; i++) {
    material.uniforms.u_hues.value[i] = (i < hueValues.length ? hueValues[i] : hueValues[hueValues.length - 1]) / 360;
  }
  material.uniforms.u_hueCount.value = hueValues.length;

  material.uniforms.u_sat.value   = ui2unit('sat',  1.0/100.0);
  material.uniforms.u_val.value   = ui2unit('val',  1.0/100.0);
  material.uniforms.u_soft.value  = ui2unit('soft', 0.0004);
  material.uniforms.u_corner.value = ui2unit('corner', 0.004);   // 0‑0.2 smoother range
  material.uniforms.u_inner.value  = ui2unit('inner', 0.009) + 0.1; // keep within 0.1‑1.0
  
  // apply CSS blur
  ctn.style.filter = `blur(${sliders.gblur.value}px)`;
  
  render();
}

/* ---------- Events ---------- */
const huesContainer = document.getElementById('huesContainer');
const addHueBtn = document.getElementById('addHueBtn');
const removeHueBtn = document.getElementById('removeHueBtn');

addHueBtn.addEventListener('click', () => {
  if (hueValues.length < MAX_HUES) {
    hueValues.push(180);
    update();
    renderHueSliders();
  }
});
removeHueBtn.addEventListener('click', () => {
  if (hueValues.length > 2) {
    hueValues.pop();
    update();
    renderHueSliders();
  }
});

Object.values(sliders).forEach(s => s.addEventListener('input', update));

resetBtn.addEventListener('click', () => {
  for (const [id, el] of Object.entries(sliders)){
    el.value = el.defaultValue;
  }
  update();
});

/* ---------- Save Image ---------- */
const saveBtn = document.getElementById('save');
saveBtn.addEventListener('click', () => {
  const targetWidth = 3840;
  const targetHeight = 2160;
  // store original size
  const origWidth = renderer.domElement.width;
  const origHeight = renderer.domElement.height;
  // set 4K resolution
  renderer.setSize(targetWidth, targetHeight);
  material.uniforms.u_res.value.set(targetWidth, targetHeight);
  // render at 4K
  renderer.render(scene, camera);
  // download the 4K image
  const link = document.createElement('a');
  link.download = `wallpaper-4k-${Date.now()}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
  // restore original size
  renderer.setSize(origWidth, origHeight);
  material.uniforms.u_res.value.set(origWidth, origHeight);
});

/* ---------- Render ---------- */
function render(){ renderer.render(scene, camera); }

/* ---------- Init ---------- */
// invert inner slider so higher = smaller core
sliders.inner.addEventListener('input', () => {
  sliders.inner.dataset.inverse = 100 - sliders.inner.value;
});

update();
renderHueSliders();

/* ---------- Resize ---------- */
window.addEventListener('resize', () => {
  const w = ctn.clientWidth, h = ctn.clientHeight;
  renderer.setSize(w, h);
  material.uniforms.u_res.value.set(renderer.domElement.width, renderer.domElement.height);
  render();
});