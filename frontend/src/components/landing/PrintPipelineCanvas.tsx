import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  cleanFloorVertexShader,
  cleanFloorFragmentShader,
  shredParticleVertexShader,
  shredParticleFragmentShader,
} from './shaders/printShaders';

export type HardwareModuleKey = 'qr_intake' | 'poisha_duplex' | 'win32_spooler' | null;

export interface PrintPipelineCanvasProps {
  scrollProgressRef: React.MutableRefObject<number>;
  colorMode: boolean;
  duplexMode: boolean;
  onHoverModule?: (module: HardwareModuleKey) => void;
  onContextLost?: () => void;
  className?: string;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function createNormalizedRoundedPlane(width: number, height: number, radius: number): THREE.ShapeGeometry {
  const shape = createRoundedRectShape(width, height, radius);
  const geo = new THREE.ShapeGeometry(shape, 10);
  const posAttr = geo.attributes.position;
  const uvs = new Float32Array(posAttr.count * 2);
  for (let i = 0; i < posAttr.count; i++) {
    uvs[i * 2] = (posAttr.getX(i) + width / 2) / width;
    uvs[i * 2 + 1] = (posAttr.getY(i) + height / 2) / height;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function createQrPlacardTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d')!;

  // Clean off-white acrylic placard card
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 512, 640);

  // Header Cobalt Banner
  ctx.fillStyle = '#245BDB';
  ctx.fillRect(0, 0, 512, 112);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PRINTFLOW', 256, 58);
  ctx.fillStyle = '#93C5FD';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('SCAN COUNTER QR', 256, 90);

  // Crisp QR Matrix Backdrop
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 4;
  ctx.fillRect(66, 146, 380, 380);
  ctx.strokeRect(66, 146, 380, 380);

  const cell = 20;
  const originX = 96;
  const originY = 176;
  const drawFinder = (gx: number, gy: number) => {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(originX + gx * cell, originY + gy * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(originX + (gx + 1) * cell, originY + (gy + 1) * cell, 3 * cell, 3 * cell);
    ctx.fillStyle = '#245BDB';
    ctx.fillRect(originX + (gx + 2) * cell, originY + (gy + 2) * cell, cell, cell);
  };

  drawFinder(0, 0);
  drawFinder(11, 0);
  drawFinder(0, 11);

  // Deterministic high-contrast data modules
  ctx.fillStyle = '#0F172A';
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const inTL = row < 6 && col < 6;
      const inTR = row < 6 && col > 9;
      const inBL = row > 9 && col < 6;
      if (inTL || inTR || inBL) continue;
      if ((row * 7 + col * 13) % 3 === 0) {
        ctx.fillRect(originX + col * cell + 2, originY + row * cell + 2, cell - 4, cell - 4);
      }
    }
  }

  // Footer CTA pill
  ctx.fillStyle = '#059669';
  ctx.fillRect(106, 556, 300, 52);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('NO APP REQUIRED', 256, 590);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createDocumentTexture(isColor: boolean, sideTitle: string, maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 680;
  const ctx = canvas.getContext('2d')!;

  // Pure bright cotton paper surface
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 512, 680);

  // Subtle top margin edge
  ctx.fillStyle = isColor ? '#245BDB' : '#1E293B';
  ctx.fillRect(0, 0, 512, 18);

  // File tag badge
  ctx.fillStyle = isColor ? '#E0F2FE' : '#F1F5F9';
  ctx.fillRect(42, 46, 200, 42);
  ctx.fillStyle = isColor ? '#0284C7' : '#334155';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(sideTitle, 56, 74);

  // Verified Shield Stamp on Right
  ctx.fillStyle = '#ECFDF5';
  ctx.fillRect(310, 46, 160, 42);
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('VERIFIED ✓', 390, 74);

  // Expressive Vector Chart / Document Layout
  if (isColor) {
    const grad = ctx.createLinearGradient(42, 118, 470, 260);
    grad.addColorStop(0, '#245BDB');
    grad.addColorStop(0.55, '#00D2FF');
    grad.addColorStop(1, '#EC4899');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = '#334155';
  }
  ctx.fillRect(42, 116, 428, 128);

  // Overlay crisp geometric white chart inside header block
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  [44, 78, 62, 92, 54].forEach((barH, idx) => {
    ctx.fillRect(72 + idx * 42, 224 - barH, 24, barH);
  });

  // High-contrast crisp typography placeholder rows
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('A4 Print Specification', 42, 294);

  const lineWidths = [410, 380, 428, 320, 405, 360, 260];
  lineWidths.forEach((w, idx) => {
    ctx.fillStyle = idx === 2 && isColor ? '#00D2FF' : idx % 3 === 0 ? '#64748B' : '#CBD5E1';
    ctx.fillRect(42, 324 + idx * 32, w, 13);
  });

  // Poisha footer bar on document
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(42, 570, 428, 72);
  ctx.strokeStyle = isColor ? '#00D2FF' : '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 570, 428, 72);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(isColor ? 'MODE: COLOR 4C' : 'MODE: MONO B&W', 62, 613);
  ctx.fillStyle = '#245BDB';
  ctx.textAlign = 'right';
  ctx.fillText('SHA-256 OK', 448, 613);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createPhoneScreenTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, 256, 512);

  // Camera viewfinder corners
  ctx.strokeStyle = '#00D2FF';
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 96, 184, 184);
  ctx.fillStyle = 'rgba(0, 210, 255, 0.14)';
  ctx.fillRect(36, 96, 184, 184);

  // Active scan bar
  ctx.fillStyle = '#10B981';
  ctx.fillRect(42, 184, 172, 6);

  // App UI chip at bottom
  ctx.fillStyle = '#245BDB';
  ctx.fillRect(28, 340, 200, 68);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('UPLOAD PDF', 128, 382);

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('৳ 5.00 BDT', 128, 444);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createPrinterOledTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, 512, 160);

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 152);

  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(46, 52, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('COUNTER SPOOLER: READY', 76, 62);

  ctx.fillStyle = '#00D2FF';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('WIN32 RAW • AUTO-SHRED ACTIVE', 34, 118);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

export const PrintPipelineCanvas: React.FC<PrintPipelineCanvasProps> = ({
  scrollProgressRef,
  colorMode,
  duplexMode,
  onHoverModule,
  onContextLost,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const colorModeRef = useRef<boolean>(colorMode);
  const duplexModeRef = useRef<boolean>(duplexMode);
  const hoverCallbackRef = useRef(onHoverModule);
  const swapMaterialsRef = useRef<() => void>();

  useEffect(() => {
    colorModeRef.current = colorMode;
    swapMaterialsRef.current?.();
  }, [colorMode]);

  useEffect(() => {
    duplexModeRef.current = duplexMode;
  }, [duplexMode]);

  useEffect(() => {
    hoverCallbackRef.current = onHoverModule;
  }, [onHoverModule]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || typeof window === 'undefined') return;

    const isJsdom =
      typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');
    if (isJsdom) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      onContextLost?.();
      return;
    }

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 300);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.maxWidth = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      onContextLost?.();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();

    // Baked HDRI Room Environment Reflections (Apple Keynote metallic specular clarity with near-zero GPU cost!)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 80);
    camera.position.set(0.25, 1.45, 7.2);

    // Clean, ultra-cheap 2-light key + hemisphere setup backed by IBL reflections
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
    keyLight.position.set(4.5, 6.8, 5.2);
    scene.add(keyLight);

    // Disposal registry
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      materials.push(m);
      return m;
    };
    const trackTex = <T extends THREE.Texture>(t: T): T => {
      textures.push(t);
      return t;
    };

    // High-DPI Textures
    const qrTex = trackTex(createQrPlacardTexture(maxAniso));
    const phoneTex = trackTex(createPhoneScreenTexture(maxAniso));
    const oledTex = trackTex(createPrinterOledTexture(maxAniso));
    const bwFrontTex = trackTex(createDocumentTexture(false, 'SIDE 1 • DOC.PDF', maxAniso));
    const bwBackTex = trackTex(createDocumentTexture(false, 'SIDE 2 • DUPLEX', maxAniso));
    const colorFrontTex = trackTex(createDocumentTexture(true, 'SIDE 1 • COLOR.PDF', maxAniso));
    const colorBackTex = trackTex(createDocumentTexture(true, 'SIDE 2 • DUPLEX 4C', maxAniso));

    // Shared High-Craft Studio Materials
    const cobaltAnodizedMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x245bdb,
        metalness: 0.45,
        roughness: 0.24,
        envMapIntensity: 1.35,
      })
    );
    const titaniumMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.78,
        roughness: 0.22,
        envMapIntensity: 1.45,
      })
    );
    const darkChamberMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x090f1d,
        metalness: 0.35,
        roughness: 0.42,
      })
    );
    const chromeRollerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.92,
        roughness: 0.14,
        envMapIntensity: 1.6,
      })
    );
    const emeraldGlowMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    const cyanGlowMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0x00d2ff })
    );

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    // ---------------------------------------------------------
    // 1. Analytic Clean Spatial Studio Floor
    // ---------------------------------------------------------
    const floorUniforms = {
      uTime: { value: 0 },
      uScrollProgress: { value: 0 },
      uMouseWorld: { value: new THREE.Vector2(0, 0) },
    };
    const floorMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(24, 24, 1, 1)),
      trackMat(
        new THREE.ShaderMaterial({
          vertexShader: cleanFloorVertexShader,
          fragmentShader: cleanFloorFragmentShader,
          uniforms: floorUniforms,
          transparent: true,
          depthWrite: false,
        })
      )
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -1.45;
    scene.add(floorMesh);

    // ---------------------------------------------------------
    // 2. Sculpted PrintFlow Counter Hardware Assembly (Win32 Spooler)
    // ---------------------------------------------------------
    const printerSpoolerGroup = new THREE.Group();
    printerSpoolerGroup.position.set(0.45, -0.35, -0.04);
    printerSpoolerGroup.userData.moduleKey = 'win32_spooler';
    stageGroup.add(printerSpoolerGroup);

    // Extruded beveled upper housing
    const bodyShape = createRoundedRectShape(2.45, 0.78, 0.14);
    const bodyGeo = trackGeo(
      new THREE.ExtrudeGeometry(bodyShape, {
        depth: 1.38,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.06,
        bevelSegments: 4,
      })
    );
    bodyGeo.center();
    const printerBody = new THREE.Mesh(bodyGeo, cobaltAnodizedMat);
    printerBody.userData.moduleKey = 'win32_spooler';
    printerSpoolerGroup.add(printerBody);

    // Sleek Titanium Side Flanges
    const cheekShape = createRoundedRectShape(0.12, 0.88, 0.04);
    const cheekGeo = trackGeo(
      new THREE.ExtrudeGeometry(cheekShape, {
        depth: 1.52,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.025,
        bevelSegments: 3,
      })
    );
    cheekGeo.center();

    const leftCheek = new THREE.Mesh(cheekGeo, titaniumMat);
    leftCheek.position.set(-1.32, 0.02, 0);
    leftCheek.userData.moduleKey = 'win32_spooler';
    printerSpoolerGroup.add(leftCheek);

    const rightCheek = new THREE.Mesh(cheekGeo, titaniumMat);
    rightCheek.position.set(1.32, 0.02, 0);
    rightCheek.userData.moduleKey = 'win32_spooler';
    printerSpoolerGroup.add(rightCheek);

    // Crisp Front Dark Feed & Output Chamber
    const frontChamber = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.04, 0.34, 0.24)),
      darkChamberMat
    );
    frontChamber.position.set(0, -0.06, 0.68);
    frontChamber.userData.moduleKey = 'win32_spooler';
    printerSpoolerGroup.add(frontChamber);

    // Precision Spinning Chrome Feed Roller visible inside aperture
    const rollerMesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 1.88, 20)),
      chromeRollerMat
    );
    rollerMesh.rotation.z = Math.PI / 2;
    rollerMesh.position.set(0, -0.04, 0.72);
    printerSpoolerGroup.add(rollerMesh);

    // Bright Emerald Status LED + Cyan Laser Feed Strip
    const ledBeacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.052, 16, 16)), emeraldGlowMat);
    ledBeacon.position.set(-0.84, 0.22, 0.77);
    printerSpoolerGroup.add(ledBeacon);

    const laserGuideStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 0.025, 0.03)), cyanGlowMat);
    laserGuideStrip.position.set(0.14, 0.22, 0.77);
    printerSpoolerGroup.add(laserGuideStrip);

    // Slanted Top OLED Status Screen displaying live "COUNTER SPOOLER: READY"
    const oledBezel = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.32, 0.42, 0.06)),
      darkChamberMat
    );
    oledBezel.position.set(-0.42, 0.47, 0.26);
    oledBezel.rotation.x = -0.68;
    oledBezel.userData.moduleKey = 'win32_spooler';
    printerSpoolerGroup.add(oledBezel);

    const oledScreen = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.22, 0.35)),
      trackMat(new THREE.MeshBasicMaterial({ map: oledTex }))
    );
    oledScreen.position.set(0, 0, 0.033);
    oledBezel.add(oledScreen);

    // Brushed Output Tray Shelf
    const outputTray = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.94, 0.06, 0.96)),
      titaniumMat
    );
    outputTray.position.set(0, -0.34, 1.06);
    outputTray.rotation.x = 0.08;
    printerSpoolerGroup.add(outputTray);

    // Top Intake Aperture Ring (glowing cyan slot above machine)
    const intakeSlotBezel = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.48, 0.06, 0.22)),
      darkChamberMat
    );
    intakeSlotBezel.position.set(0.38, 0.44, -0.18);
    printerSpoolerGroup.add(intakeSlotBezel);

    // ---------------------------------------------------------
    // 3. Crisp High-DPI Document Sheets (Hovering Duplex Splitter + Output Feed)
    // ---------------------------------------------------------
    const documentStackGroup = new THREE.Group();
    documentStackGroup.position.set(0.62, 0.95, -0.18);
    documentStackGroup.userData.moduleKey = 'poisha_duplex';
    stageGroup.add(documentStackGroup);

    const frontSheetMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: colorModeRef.current ? colorFrontTex : bwFrontTex,
        roughness: 0.38,
        metalness: 0.05,
        side: THREE.DoubleSide,
      })
    );
    const backSheetMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: colorModeRef.current ? colorBackTex : bwBackTex,
        roughness: 0.38,
        metalness: 0.05,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      })
    );
    const emergingSheetMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: colorModeRef.current ? colorFrontTex : bwFrontTex,
        roughness: 0.35,
        metalness: 0.04,
        side: THREE.DoubleSide,
      })
    );

    swapMaterialsRef.current = () => {
      const isColor = colorModeRef.current;
      frontSheetMat.map = isColor ? colorFrontTex : bwFrontTex;
      backSheetMat.map = isColor ? colorBackTex : bwBackTex;
      emergingSheetMat.map = isColor ? colorFrontTex : bwFrontTex;
      frontSheetMat.needsUpdate = true;
      backSheetMat.needsUpdate = true;
      emergingSheetMat.needsUpdate = true;
    };

    const a4Geo = trackGeo(createNormalizedRoundedPlane(1.06, 1.38, 0.055));

    const frontSheetMesh = new THREE.Mesh(a4Geo, frontSheetMat);
    frontSheetMesh.userData.moduleKey = 'poisha_duplex';
    documentStackGroup.add(frontSheetMesh);

    const backSheetMesh = new THREE.Mesh(a4Geo, backSheetMat);
    backSheetMesh.position.set(0.2, 0.1, -0.24);
    backSheetMesh.userData.moduleKey = 'poisha_duplex';
    documentStackGroup.add(backSheetMesh);

    // Sweeping Cyan Verification Laser Plane across Front Sheet
    const scannerBar = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.24, 0.045)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x00d2ff,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    scannerBar.position.set(0, 0, 0.04);
    documentStackGroup.add(scannerBar);

    // Output Emerging Sheet sliding smoothly forward on lower shelf
    const outputSheetMesh = new THREE.Mesh(a4Geo, emergingSheetMat);
    outputSheetMesh.rotation.x = -Math.PI / 2 + 0.09;
    outputSheetMesh.scale.set(0.95, 0.72, 1);
    outputSheetMesh.position.set(0, -0.27, 1.04);
    outputSheetMesh.userData.moduleKey = 'win32_spooler';
    printerSpoolerGroup.add(outputSheetMesh);

    // ---------------------------------------------------------
    // 4. Counter QR Stand + Floating Smartphone + Volumetric Scan Beam + Fiber Curve
    // ---------------------------------------------------------
    const qrPrismGroup = new THREE.Group();
    qrPrismGroup.position.set(-1.52, -0.32, 0.74);
    qrPrismGroup.userData.moduleKey = 'qr_intake';
    stageGroup.add(qrPrismGroup);

    // Pedestal base for QR placard
    const qrBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.4, 0.46, 0.1, 32)),
      titaniumMat
    );
    qrBase.position.y = -0.52;
    qrBase.userData.moduleKey = 'qr_intake';
    qrPrismGroup.add(qrBase);

    // Acrylic beveled card stand
    const qrStandShape = createRoundedRectShape(0.84, 1.04, 0.07);
    const qrStandGeo = trackGeo(
      new THREE.ExtrudeGeometry(qrStandShape, {
        depth: 0.05,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 3,
      })
    );
    qrStandGeo.center();
    const qrAcrylicMesh = new THREE.Mesh(qrStandGeo, cobaltAnodizedMat);
    qrAcrylicMesh.rotation.x = -0.14;
    qrAcrylicMesh.userData.moduleKey = 'qr_intake';
    qrPrismGroup.add(qrAcrylicMesh);

    // Crisp Readable QR Sticker Face
    const qrFaceMesh = new THREE.Mesh(
      trackGeo(createNormalizedRoundedPlane(0.76, 0.96, 0.04)),
      trackMat(new THREE.MeshBasicMaterial({ map: qrTex }))
    );
    qrFaceMesh.position.set(0, 0, 0.045);
    qrFaceMesh.userData.moduleKey = 'qr_intake';
    qrAcrylicMesh.add(qrFaceMesh);

    // Floating Smartphone Scanning the QR Counter
    const phoneGroup = new THREE.Group();
    phoneGroup.position.set(-0.22, 0.78, 0.72);
    phoneGroup.rotation.set(0.38, -0.36, 0.14);
    qrPrismGroup.add(phoneGroup);

    const phoneShape = createRoundedRectShape(0.44, 0.86, 0.055);
    const phoneBodyGeo = trackGeo(
      new THREE.ExtrudeGeometry(phoneShape, {
        depth: 0.04,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 2,
      })
    );
    phoneBodyGeo.center();
    const phoneBody = new THREE.Mesh(phoneBodyGeo, titaniumMat);
    phoneGroup.add(phoneBody);

    const phoneScreen = new THREE.Mesh(
      trackGeo(createNormalizedRoundedPlane(0.39, 0.78, 0.04)),
      trackMat(new THREE.MeshBasicMaterial({ map: phoneTex }))
    );
    phoneScreen.position.z = 0.032;
    phoneGroup.add(phoneScreen);

    // Optical Laser Cone scanning down from phone toward QR placard
    const scanConeMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x00d2ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const scanCone = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.42, 0.85, 24, 1, true)),
      scanConeMat
    );
    scanCone.position.set(-0.12, 0.34, 0.42);
    scanCone.rotation.set(-0.42, 0, -0.2);
    qrPrismGroup.add(scanCone);

    // Subtle volumetric scan ring around QR stand
    const qrRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.54, 0.012, 12, 48)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x00d2ff,
          transparent: true,
          opacity: 0.6,
        })
      )
    );
    qrRing.rotation.x = Math.PI / 2;
    qrRing.position.y = -0.44;
    qrPrismGroup.add(qrRing);

    // Luminous Fiber-Optic Spline Curve connecting QR -> Floating Sheet -> Printer Aperture
    const dataCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-1.52, 0.45, 0.8),
      new THREE.Vector3(-0.35, 1.58, 0.25),
      new THREE.Vector3(0.58, 0.92, -0.15)
    );
    const dataTube = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(dataCurve, 36, 0.014, 8, false)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x00d2ff,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    stageGroup.add(dataTube);

    const dataPacketPulse = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.052, 14, 14)),
      trackMat(new THREE.MeshBasicMaterial({ color: 0x10b981 }))
    );
    stageGroup.add(dataPacketPulse);

    // ---------------------------------------------------------
    // 5. Crisp 520-Particle Zero-Trace Ephemeral Shredder Field
    // ---------------------------------------------------------
    const PARTICLE_COUNT = 520;
    const pPos = new Float32Array(PARTICLE_COUNT * 3);
    const pDir = new Float32Array(PARTICLE_COUNT * 3);
    const pSeed = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pPos[i * 3] = 0.25 + (Math.random() - 0.5) * 2.1;
      pPos[i * 3 + 1] = -0.75 + (Math.random() - 0.5) * 0.4;
      pPos[i * 3 + 2] = 0.85 + (Math.random() - 0.5) * 1.1;

      const angle = Math.random() * Math.PI * 2;
      const radial = 0.25 + Math.random() * 0.95;
      pDir[i * 3] = Math.cos(angle) * radial;
      pDir[i * 3 + 1] = 0.35 + Math.random() * 1.2;
      pDir[i * 3 + 2] = Math.sin(angle) * radial;

      pSeed[i] = Math.random();
    }

    const particleGeo = trackGeo(new THREE.BufferGeometry());
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    particleGeo.setAttribute('aRandomDir', new THREE.BufferAttribute(pDir, 3));
    particleGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));

    const shredUniforms = {
      uTime: { value: 0 },
      uShredProgress: { value: 0 },
      uPixelRatio: { value: dpr },
    };
    const shredPoints = new THREE.Points(
      particleGeo,
      trackMat(
        new THREE.ShaderMaterial({
          vertexShader: shredParticleVertexShader,
          fragmentShader: shredParticleFragmentShader,
          uniforms: shredUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    stageGroup.add(shredPoints);

    // Pre-compile all materials & shaders BEFORE animation starts -> ZERO first-frame stall!
    renderer.compile(scene, camera);

    // ---------------------------------------------------------
    // Throttled Pointer Parallax & Raycast Inspection
    // ---------------------------------------------------------
    const pointerNdc = new THREE.Vector2(0, 0);
    const smoothMouse = new THREE.Vector2(0, 0);
    const raycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1.45);
    const floorHit = new THREE.Vector3();
    let lastHoveredModule: HardwareModuleKey = null;
    let lastRaycastCheck = 0;

    const interactiveRoots = [qrPrismGroup, documentStackGroup, printerSpoolerGroup];

    const onPointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerLeave = () => {
      pointerNdc.set(0, 0);
      if (lastHoveredModule !== null) {
        lastHoveredModule = null;
        hoverCallbackRef.current?.(null);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    renderer.domElement.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 300);
      const h = Math.max(container.clientHeight, 260);
      const nextDpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(nextDpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      shredUniforms.uPixelRatio.value = nextDpr;
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', handleResize);

    let isVisible = true;
    const visibilityObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isVisible = entries[0]?.isIntersecting ?? true;
            },
            { threshold: 0.02 }
          )
        : null;
    visibilityObserver?.observe(container);

    // Frame-rate independent smooth animation state
    let animFrameId = 0;
    let prevNow = performance.now();
    const startClock = prevNow;
    let smoothedScroll = scrollProgressRef.current;
    let smoothedDuplex = duplexModeRef.current ? 1 : 0;
    const lookTarget = new THREE.Vector3(0, 0.05, 0);
    const camGoal = new THREE.Vector3();
    const lookGoal = new THREE.Vector3();

    const animate = (now: number) => {
      animFrameId = requestAnimationFrame(animate);
      if (!isVisible || document.hidden) {
        prevNow = now;
        return;
      }

      // Clamped delta time avoids velocity spikes after tab switch or hiccups
      const dt = Math.min((now - prevNow) * 0.001, 0.05);
      prevNow = now;
      const t = (now - startClock) * 0.001;

      smoothedScroll = THREE.MathUtils.damp(smoothedScroll, clamp01(scrollProgressRef.current), 7.5, dt);
      smoothedDuplex = THREE.MathUtils.damp(smoothedDuplex, duplexModeRef.current ? 1 : 0, 8.5, dt);
      smoothMouse.x = THREE.MathUtils.damp(smoothMouse.x, pointerNdc.x, 6.0, dt);
      smoothMouse.y = THREE.MathUtils.damp(smoothMouse.y, pointerNdc.y, 6.0, dt);

      // Chapter transition curves along scrollProgress [0 -> 1]
      const ch1 = smoothstep(0.1, 0.36, smoothedScroll) * (1 - smoothstep(0.46, 0.62, smoothedScroll));
      const ch2 = smoothstep(0.42, 0.66, smoothedScroll) * (1 - smoothstep(0.75, 0.9, smoothedScroll));
      const ch3 = smoothstep(0.72, 0.96, smoothedScroll);

      // Floor uniforms
      floorUniforms.uTime.value = t;
      floorUniforms.uScrollProgress.value = smoothedScroll;

      // 1. Self-playing continuous 4.5s Story Loop ABOVE THE FOLD
      // Phase 0..0.3: QR Scan -> Phase 0.3..0.65: Paper glides down into intake -> Phase 0.65..1: Output paper glides out!
      const cycle = (t * 0.24) % 1;
      const scanWave = Math.sin(t * 2.2) * 0.56;
      scannerBar.position.y = scanWave;

      // QR Totem + Smartphone kinetic bob & pulse + Traveling data sphere
      qrPrismGroup.rotation.y = 0.24 + Math.sin(t * 0.65) * 0.1 + ch1 * 0.22;
      phoneGroup.position.y = 0.74 + Math.sin(t * 1.4) * 0.045;
      phoneGroup.rotation.z = 0.12 + Math.sin(t * 0.9) * 0.04;
      scanConeMat.opacity = 0.12 + 0.09 * Math.sin(t * 3.5);
      const ringScale = 1 + 0.1 * Math.sin(t * 2.8);
      qrRing.scale.set(ringScale, ringScale, 1);

      const pulseT = (t * 0.55) % 1;
      dataCurve.getPoint(pulseT, dataPacketPulse.position);

      // 2. Document Sheet Duplex Fan & Intake Glide
      const duplexSpread = Math.max(smoothedDuplex, ch2);
      documentStackGroup.position.y = 0.98 + Math.sin(t * 1.4) * 0.045 - ch3 * 0.36;
      documentStackGroup.position.x = 0.48 + ch2 * 0.16;

      backSheetMesh.visible = duplexSpread > 0.02;
      backSheetMat.opacity = 0.95 * duplexSpread;
      backSheetMesh.position.x = THREE.MathUtils.lerp(0.02, 0.36 + ch2 * 0.24, duplexSpread);
      backSheetMesh.position.y = THREE.MathUtils.lerp(0.02, 0.09, duplexSpread);
      backSheetMesh.position.z = THREE.MathUtils.lerp(-0.04, -0.32 - ch2 * 0.18, duplexSpread);
      backSheetMesh.rotation.y = THREE.MathUtils.lerp(0, -0.2 - ch2 * 0.14, duplexSpread);
      frontSheetMesh.rotation.y = ch2 * 0.12 + smoothMouse.x * 0.07;

      // 3. Printer Hardware Rollers & Emerging Sheet Animation
      rollerMesh.rotation.x += dt * (2.6 + ch3 * 5.0);
      outputSheetMesh.position.z = 0.72 + Math.sin(cycle * Math.PI) * 0.56;

      // Laser bar sweeping gently inside aperture
      laserGuideStrip.position.x = 0.14 + Math.sin(t * 3.2) * 0.24;

      // Shredder field
      shredUniforms.uTime.value = t;
      shredUniforms.uShredProgress.value = ch3;

      // 4. Aspect-Adaptive Cinema Camera Splines (guarantees full hardware visibility on portrait & wide screens!)
      const aspectFit = camera.aspect < 1.15 ? 1.18 / Math.max(camera.aspect, 0.68) : 1.0;
      const camX = THREE.MathUtils.lerp(0.22, -1.35, ch1) + ch2 * 1.45 + ch3 * 0.28;
      const camY = THREE.MathUtils.lerp(1.48, 0.88, ch1) + ch2 * 0.38 - ch3 * 0.42;
      const baseZ = 6.2 - ch1 * 1.05 - ch2 * 0.75 - ch3 * 0.9;
      const camZ = baseZ * aspectFit;

      camGoal.set(
        camX + smoothMouse.x * 0.42,
        camY + smoothMouse.y * 0.26,
        camZ
      );
      camera.position.lerp(camGoal, 1 - Math.exp(-6.5 * dt));

      lookGoal.set(
        -0.12 - ch1 * 0.95 + ch2 * 0.45 + ch3 * 0.22,
        0.08 - ch1 * 0.12 + ch2 * 0.42 - ch3 * 0.35,
        0.12 + ch3 * 0.32
      );
      lookTarget.lerp(lookGoal, 1 - Math.exp(-7.0 * dt));
      camera.lookAt(lookTarget);

      // Gentle master turntable parallax
      stageGroup.rotation.y = smoothMouse.x * 0.1 - smoothedScroll * 0.22;

      // Throttled Raycasting every 75ms to prevent idle CPU churn
      if (now - lastRaycastCheck > 75) {
        lastRaycastCheck = now;
        raycaster.setFromCamera(smoothMouse, camera);
        if (raycaster.ray.intersectPlane(floorPlane, floorHit)) {
          floorUniforms.uMouseWorld.value.set(floorHit.x, floorHit.z);
        }

        const hits = raycaster.intersectObjects(interactiveRoots, true);
        const hitModule: HardwareModuleKey =
          (hits[0]?.object?.userData?.moduleKey as HardwareModuleKey) ?? null;
        if (hitModule !== lastHoveredModule) {
          lastHoveredModule = hitModule;
          hoverCallbackRef.current?.(hitModule);
        }
      }

      renderer.render(scene, camera);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();

      envTarget.dispose();
      textures.forEach((tx) => tx.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [scrollProgressRef, onContextLost]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full relative cursor-grab active:cursor-grabbing ${className}`}
      aria-label="Interactive 3D PrintFlow Automation Diorama"
    />
  );
};

export default PrintPipelineCanvas;
