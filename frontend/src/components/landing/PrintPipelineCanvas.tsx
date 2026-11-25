import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

export interface PrintPipelineCanvasProps {
  activeChapter: number;
  colorMode: boolean;
  duplexMode: boolean;
  onContextLost?: () => void;
  className?: string;
}

interface ChapterCameraPreset {
  camX: number;
  camY: number;
  baseZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  stageYaw: number;
  ch1Focus: number;
  ch2Focus: number;
  ch3Focus: number;
}

const CHAPTER_PRESETS: Record<number, ChapterCameraPreset> = {
  0: { camX: 0.12, camY: 1.48, baseZ: 6.4, lookX: -0.04, lookY: 0.08, lookZ: 0.12, stageYaw: 0.0, ch1Focus: 0, ch2Focus: 0, ch3Focus: 0 },
  1: { camX: -0.72, camY: 1.02, baseZ: 5.9, lookX: -0.36, lookY: 0.04, lookZ: 0.35, stageYaw: -0.1, ch1Focus: 1, ch2Focus: 0, ch3Focus: 0 },
  2: { camX: 1.28, camY: 1.68, baseZ: 5.65, lookX: 0.18, lookY: 0.58, lookZ: -0.05, stageYaw: -0.24, ch1Focus: 0, ch2Focus: 1, ch3Focus: 0 },
  3: { camX: 0.36, camY: 1.02, baseZ: 5.5, lookX: 0.06, lookY: -0.24, lookZ: 0.45, stageYaw: -0.32, ch1Focus: 0, ch2Focus: 0, ch3Focus: 1 },
};

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
  const geo = new THREE.ShapeGeometry(shape, 8);
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

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 512, 640);

  ctx.fillStyle = '#245BDB';
  ctx.fillRect(0, 0, 512, 112);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PRINTFLOW', 256, 58);
  ctx.fillStyle = '#93C5FD';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('SCAN COUNTER QR', 256, 90);

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

  ctx.fillStyle = '#0F172A';
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      if ((row < 6 && col < 6) || (row < 6 && col > 9) || (row > 9 && col < 6)) continue;
      if ((row * 7 + col * 13) % 3 === 0) {
        ctx.fillRect(originX + col * cell + 2, originY + row * cell + 2, cell - 4, cell - 4);
      }
    }
  }

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

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 512, 680);

  ctx.fillStyle = isColor ? '#245BDB' : '#1E293B';
  ctx.fillRect(0, 0, 512, 18);

  ctx.fillStyle = isColor ? '#E0F2FE' : '#F1F5F9';
  ctx.fillRect(42, 46, 210, 42);
  ctx.fillStyle = isColor ? '#0284C7' : '#334155';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(sideTitle, 56, 74);

  ctx.fillStyle = '#ECFDF5';
  ctx.fillRect(310, 46, 160, 42);
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('VERIFIED ✓', 390, 74);

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

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  [44, 78, 62, 92, 54].forEach((barH, idx) => {
    ctx.fillRect(72 + idx * 42, 224 - barH, 24, barH);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText('A4 Print Specification', 42, 294);

  [410, 380, 428, 320, 405, 360, 260].forEach((w, idx) => {
    ctx.fillStyle = idx === 2 && isColor ? '#00D2FF' : idx % 3 === 0 ? '#64748B' : '#CBD5E1';
    ctx.fillRect(42, 324 + idx * 32, w, 13);
  });

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

  ctx.strokeStyle = '#00D2FF';
  ctx.lineWidth = 6;
  ctx.strokeRect(36, 96, 184, 184);
  ctx.fillStyle = 'rgba(0, 210, 255, 0.14)';
  ctx.fillRect(36, 96, 184, 184);

  ctx.fillStyle = '#10B981';
  ctx.fillRect(42, 184, 172, 6);

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
  activeChapter,
  colorMode,
  duplexMode,
  onContextLost,
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const swapMaterialsRef = useRef<() => void>();
  const colorModeRef = useRef<boolean>(colorMode);
  const animStateRef = useRef({
    camX: CHAPTER_PRESETS[0].camX,
    camY: CHAPTER_PRESETS[0].camY,
    baseZ: CHAPTER_PRESETS[0].baseZ,
    lookX: CHAPTER_PRESETS[0].lookX,
    lookY: CHAPTER_PRESETS[0].lookY,
    lookZ: CHAPTER_PRESETS[0].lookZ,
    stageYaw: CHAPTER_PRESETS[0].stageYaw,
    ch1Focus: 0,
    ch2Focus: 0,
    ch3Focus: 0,
    duplexAmt: duplexMode ? 1 : 0,
  });

  // Drive discrete crisp GSAP transitions ONLY when chapter/duplex changes
  useEffect(() => {
    const preset = CHAPTER_PRESETS[activeChapter] || CHAPTER_PRESETS[0];
    gsap.to(animStateRef.current, {
      camX: preset.camX,
      camY: preset.camY,
      baseZ: preset.baseZ,
      lookX: preset.lookX,
      lookY: preset.lookY,
      lookZ: preset.lookZ,
      stageYaw: preset.stageYaw,
      ch1Focus: preset.ch1Focus,
      ch2Focus: preset.ch2Focus,
      ch3Focus: preset.ch3Focus,
      duration: 0.72,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  }, [activeChapter]);

  useEffect(() => {
    gsap.to(animStateRef.current, {
      duplexAmt: duplexMode ? 1 : 0,
      duration: 0.45,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }, [duplexMode]);

  useEffect(() => {
    colorModeRef.current = colorMode;
    swapMaterialsRef.current?.();
  }, [colorMode]);

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
    const height = Math.max(container.clientHeight, 260);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
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
    scene.fog = new THREE.FogExp2(0x070b14, 0.042);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    let isDesktopWide = width >= 1000 && width / height >= 1.2;
    if (isDesktopWide) {
      camera.setViewOffset(width, height, -Math.round(width * 0.185), 0, width, height);
    }
    camera.updateProjectionMatrix();

    // Lightweight 3-light studio rig (zero expensive PMREM / RoomEnvironment bake!)
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x0b1222, 1.35);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.05);
    keyLight.position.set(4.5, 6.8, 5.2);
    scene.add(keyLight);

    const rimCyanLight = new THREE.DirectionalLight(0x38bdf8, 1.25);
    rimCyanLight.position.set(-4.2, 3.0, -3.5);
    scene.add(rimCyanLight);

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

    const qrTex = trackTex(createQrPlacardTexture(maxAniso));
    const phoneTex = trackTex(createPhoneScreenTexture(maxAniso));
    const oledTex = trackTex(createPrinterOledTexture(maxAniso));
    const bwFrontTex = trackTex(createDocumentTexture(false, 'SIDE 1 • DOC.PDF', maxAniso));
    const bwBackTex = trackTex(createDocumentTexture(false, 'SIDE 2 • DUPLEX', maxAniso));
    const colorFrontTex = trackTex(createDocumentTexture(true, 'SIDE 1 • COLOR.PDF', maxAniso));
    const colorBackTex = trackTex(createDocumentTexture(true, 'SIDE 2 • DUPLEX 4C', maxAniso));

    const cobaltAnodizedMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x245bdb, metalness: 0.3, roughness: 0.34 })
    );
    const titaniumMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.55, roughness: 0.3 })
    );
    const darkChamberMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x090f1d, metalness: 0.25, roughness: 0.45 })
    );
    const chromeRollerMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.78, roughness: 0.2 })
    );
    const emeraldGlowMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x10b981 }));
    const cyanGlowMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x00d2ff }));

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    // 1. Wide circular polar floor grid — fades smoothly via fog into obsidian with zero hard cutoff
    const floorGrid = new THREE.PolarGridHelper(4.8, 12, 6, 64, 0x245bdb, 0x101c36);
    floorGrid.position.set(0.05, -1.25, 0.25);
    const gridMat = floorGrid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.34;
    materials.push(gridMat);
    geometries.push(floorGrid.geometry);
    stageGroup.add(floorGrid);

    const floorHalo = new THREE.Mesh(
      trackGeo(new THREE.RingGeometry(1.75, 1.82, 48)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x00d2ff,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
        })
      )
    );
    floorHalo.rotation.x = -Math.PI / 2;
    floorHalo.position.set(0.1, -1.24, 0.25);
    stageGroup.add(floorHalo);

    // 2. Sculpted PrintFlow Counter Hardware (bevelSegments: 2 for fast build)
    const printerSpoolerGroup = new THREE.Group();
    printerSpoolerGroup.position.set(0.45, -0.35, -0.04);
    stageGroup.add(printerSpoolerGroup);

    const bodyShape = createRoundedRectShape(2.45, 0.78, 0.14);
    const bodyGeo = trackGeo(
      new THREE.ExtrudeGeometry(bodyShape, {
        depth: 1.38,
        bevelEnabled: true,
        bevelThickness: 0.055,
        bevelSize: 0.055,
        bevelSegments: 2,
      })
    );
    bodyGeo.center();
    printerSpoolerGroup.add(new THREE.Mesh(bodyGeo, cobaltAnodizedMat));

    const cheekShape = createRoundedRectShape(0.12, 0.88, 0.04);
    const cheekGeo = trackGeo(
      new THREE.ExtrudeGeometry(cheekShape, {
        depth: 1.52,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 2,
      })
    );
    cheekGeo.center();

    const leftCheek = new THREE.Mesh(cheekGeo, titaniumMat);
    leftCheek.position.set(-1.32, 0.02, 0);
    printerSpoolerGroup.add(leftCheek);

    const rightCheek = new THREE.Mesh(cheekGeo, titaniumMat);
    rightCheek.position.set(1.32, 0.02, 0);
    printerSpoolerGroup.add(rightCheek);

    const frontChamber = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.04, 0.34, 0.24)),
      darkChamberMat
    );
    frontChamber.position.set(0, -0.06, 0.68);
    printerSpoolerGroup.add(frontChamber);

    const rollerMesh = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 1.88, 16)),
      chromeRollerMat
    );
    rollerMesh.rotation.z = Math.PI / 2;
    rollerMesh.position.set(0, -0.04, 0.72);
    printerSpoolerGroup.add(rollerMesh);

    const ledBeacon = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.052, 12, 12)), emeraldGlowMat);
    ledBeacon.position.set(-0.84, 0.22, 0.77);
    printerSpoolerGroup.add(ledBeacon);

    const laserGuideStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 0.025, 0.03)), cyanGlowMat);
    laserGuideStrip.position.set(0.14, 0.22, 0.77);
    printerSpoolerGroup.add(laserGuideStrip);

    const oledBezel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.32, 0.42, 0.06)), darkChamberMat);
    oledBezel.position.set(-0.42, 0.47, 0.26);
    oledBezel.rotation.x = -0.68;
    printerSpoolerGroup.add(oledBezel);

    const oledScreen = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.22, 0.35)),
      trackMat(new THREE.MeshBasicMaterial({ map: oledTex }))
    );
    oledScreen.position.set(0, 0, 0.033);
    oledBezel.add(oledScreen);

    const outputTray = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.94, 0.06, 0.96)), titaniumMat);
    outputTray.position.set(0, -0.34, 1.06);
    outputTray.rotation.x = 0.08;
    printerSpoolerGroup.add(outputTray);

    const intakeSlot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.48, 0.06, 0.22)), darkChamberMat);
    intakeSlot.position.set(0.18, 0.44, -0.18);
    printerSpoolerGroup.add(intakeSlot);

    // 3. Document Stack + Duplex Morph + Verification Scan Bar
    const documentStackGroup = new THREE.Group();
    documentStackGroup.position.set(0.54, 0.96, -0.16);
    stageGroup.add(documentStackGroup);

    const frontSheetMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: colorModeRef.current ? colorFrontTex : bwFrontTex,
        roughness: 0.42,
        metalness: 0.04,
        side: THREE.DoubleSide,
      })
    );
    const backSheetMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: colorModeRef.current ? colorBackTex : bwBackTex,
        roughness: 0.42,
        metalness: 0.04,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      })
    );
    const emergingSheetMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: colorModeRef.current ? colorFrontTex : bwFrontTex,
        roughness: 0.38,
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
    documentStackGroup.add(frontSheetMesh);

    const backSheetMesh = new THREE.Mesh(a4Geo, backSheetMat);
    backSheetMesh.position.set(0.2, 0.1, -0.24);
    documentStackGroup.add(backSheetMesh);

    const scannerBar = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(1.22, 0.04)),
      trackMat(
        new THREE.MeshBasicMaterial({
          color: 0x00d2ff,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      )
    );
    scannerBar.position.set(0, 0, 0.04);
    documentStackGroup.add(scannerBar);

    const outputSheetMesh = new THREE.Mesh(a4Geo, emergingSheetMat);
    outputSheetMesh.rotation.x = -Math.PI / 2 + 0.09;
    outputSheetMesh.scale.set(0.95, 0.72, 1);
    outputSheetMesh.position.set(0, -0.27, 1.04);
    printerSpoolerGroup.add(outputSheetMesh);

    // 4. Counter QR Stand + Smartphone Scan Pyramid + Fiber Telemetry Curve
    const qrPrismGroup = new THREE.Group();
    qrPrismGroup.position.set(-1.48, -0.32, 0.74);
    stageGroup.add(qrPrismGroup);

    const qrBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.4, 0.46, 0.1, 24)), titaniumMat);
    qrBase.position.y = -0.52;
    qrPrismGroup.add(qrBase);

    const qrStandShape = createRoundedRectShape(0.84, 1.04, 0.07);
    const qrStandGeo = trackGeo(
      new THREE.ExtrudeGeometry(qrStandShape, {
        depth: 0.05,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 2,
      })
    );
    qrStandGeo.center();
    const qrAcrylicMesh = new THREE.Mesh(qrStandGeo, cobaltAnodizedMat);
    qrAcrylicMesh.rotation.x = -0.14;
    qrPrismGroup.add(qrAcrylicMesh);

    const qrFaceMesh = new THREE.Mesh(
      trackGeo(createNormalizedRoundedPlane(0.76, 0.96, 0.04)),
      trackMat(new THREE.MeshBasicMaterial({ map: qrTex }))
    );
    qrFaceMesh.position.set(0, 0, 0.045);
    qrAcrylicMesh.add(qrFaceMesh);

    const phoneGroup = new THREE.Group();
    phoneGroup.position.set(-0.22, 0.76, 0.7);
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
    phoneGroup.add(new THREE.Mesh(phoneBodyGeo, titaniumMat));

    const phoneScreen = new THREE.Mesh(
      trackGeo(createNormalizedRoundedPlane(0.39, 0.78, 0.04)),
      trackMat(new THREE.MeshBasicMaterial({ map: phoneTex }))
    );
    phoneScreen.position.z = 0.032;
    phoneGroup.add(phoneScreen);

    const scanConeMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x00d2ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const scanCone = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.42, 0.84, 18, 1, true)),
      scanConeMat
    );
    scanCone.position.set(-0.12, 0.34, 0.42);
    scanCone.rotation.set(-0.42, 0, -0.2);
    qrPrismGroup.add(scanCone);

    const qrRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.54, 0.012, 10, 36)),
      trackMat(new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.55 }))
    );
    qrRing.rotation.x = Math.PI / 2;
    qrRing.position.y = -0.44;
    qrPrismGroup.add(qrRing);

    const dataCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-1.48, 0.45, 0.78),
      new THREE.Vector3(-0.35, 1.56, 0.25),
      new THREE.Vector3(0.55, 0.92, -0.15)
    );
    const dataTube = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(dataCurve, 28, 0.014, 6, false)),
      trackMat(new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.42 }))
    );
    stageGroup.add(dataTube);

    const dataPacketPulse = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.05, 10, 10)),
      emeraldGlowMat
    );
    stageGroup.add(dataPacketPulse);

    // 5. Ultra-light native PointsMaterial shred burst (zero mid-scroll GLSL shader compile hitch!)
    const PARTICLE_COUNT = 180;
    const pBase = new Float32Array(PARTICLE_COUNT * 3);
    const pPos = new Float32Array(PARTICLE_COUNT * 3);
    const pDir = new Float32Array(PARTICLE_COUNT * 3);
    const pCol = new Float32Array(PARTICLE_COUNT * 3);
    const colPaper = new THREE.Color(0xf1f5f9);
    const colCyan = new THREE.Color(0x00d2ff);
    const colEmerald = new THREE.Color(0x10b981);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const bx = 0.42 + (Math.random() - 0.5) * 1.8;
      const by = -0.65 + (Math.random() - 0.5) * 0.35;
      const bz = 0.88 + (Math.random() - 0.5) * 0.9;
      pBase[i * 3] = bx;
      pBase[i * 3 + 1] = by;
      pBase[i * 3 + 2] = bz;
      pPos[i * 3] = bx;
      pPos[i * 3 + 1] = by;
      pPos[i * 3 + 2] = bz;

      const angle = Math.random() * Math.PI * 2;
      const radial = 0.25 + Math.random() * 0.9;
      pDir[i * 3] = Math.cos(angle) * radial;
      pDir[i * 3 + 1] = 0.35 + Math.random() * 1.1;
      pDir[i * 3 + 2] = Math.sin(angle) * radial;

      const c = i % 3 === 0 ? colCyan : i % 3 === 1 ? colEmerald : colPaper;
      pCol[i * 3] = c.r;
      pCol[i * 3 + 1] = c.g;
      pCol[i * 3 + 2] = c.b;
    }

    const particleGeo = trackGeo(new THREE.BufferGeometry());
    const posAttr = new THREE.BufferAttribute(pPos, 3);
    particleGeo.setAttribute('position', posAttr);
    particleGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));

    const shredPointsMat = trackMat(
      new THREE.PointsMaterial({
        size: 0.065,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
    );
    const shredPoints = new THREE.Points(particleGeo, shredPointsMat);
    stageGroup.add(shredPoints);

    // Lightweight Pointer Parallax (NO raycasting, NO React state!)
    const pointerNdc = new THREE.Vector2(0, 0);
    const smoothMouse = new THREE.Vector2(0, 0);

    const onPointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = Math.max(-1, Math.min(1, ((ev.clientX - rect.left) / rect.width) * 2 - 1));
      pointerNdc.y = Math.max(-1, Math.min(1, -((ev.clientY - rect.top) / rect.height) * 2 + 1));
    };

    const onPointerLeave = () => {
      pointerNdc.set(0, 0);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    renderer.domElement.addEventListener('pointerleave', onPointerLeave, { passive: true });

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 300);
      const h = Math.max(container.clientHeight, 260);
      const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(nextDpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      isDesktopWide = w >= 1000 && camera.aspect >= 1.2;
      if (isDesktopWide) {
        camera.setViewOffset(w, h, -Math.round(w * 0.185), 0, w, h);
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(container);
    window.addEventListener('resize', handleResize);

    // Pause animation loop completely whenever offscreen or document hidden
    let isVisible = true;
    let animFrameId = 0;
    let prevNow = performance.now();
    const startClock = prevNow;

    const tick = (now: number) => {
      if (!isVisible || document.hidden) {
        animFrameId = 0;
        return;
      }

      animFrameId = requestAnimationFrame(tick);

      const dt = Math.min((now - prevNow) * 0.001, 0.05);
      prevNow = now;
      const t = (now - startClock) * 0.001;
      const st = animStateRef.current;

      smoothMouse.x = THREE.MathUtils.damp(smoothMouse.x, pointerNdc.x, 5.5, dt);
      smoothMouse.y = THREE.MathUtils.damp(smoothMouse.y, pointerNdc.y, 5.5, dt);

      // Gentle ambient story motion
      scannerBar.position.y = Math.sin(t * 2.1) * 0.55;
      qrPrismGroup.rotation.y = 0.24 + Math.sin(t * 0.65) * 0.08 + st.ch1Focus * 0.18;
      phoneGroup.position.y = 0.76 + Math.sin(t * 1.4) * 0.04;
      scanConeMat.opacity = 0.12 + 0.08 * Math.sin(t * 3.2);
      const ringScale = 1 + 0.08 * Math.sin(t * 2.6);
      qrRing.scale.set(ringScale, ringScale, 1);

      const pulseT = (t * 0.52) % 1;
      dataCurve.getPoint(pulseT, dataPacketPulse.position);

      const duplexSpread = Math.max(st.duplexAmt, st.ch2Focus);
      documentStackGroup.position.y = 0.96 + Math.sin(t * 1.35) * 0.04 - st.ch3Focus * 0.34;
      documentStackGroup.position.x = 0.54 + st.ch2Focus * 0.14;

      backSheetMesh.visible = duplexSpread > 0.02;
      backSheetMat.opacity = 0.95 * duplexSpread;
      backSheetMesh.position.x = THREE.MathUtils.lerp(0.02, 0.36 + st.ch2Focus * 0.24, duplexSpread);
      backSheetMesh.position.y = THREE.MathUtils.lerp(0.02, 0.09, duplexSpread);
      backSheetMesh.position.z = THREE.MathUtils.lerp(-0.04, -0.32 - st.ch2Focus * 0.18, duplexSpread);
      backSheetMesh.rotation.y = THREE.MathUtils.lerp(0, -0.2 - st.ch2Focus * 0.14, duplexSpread);
      frontSheetMesh.rotation.y = st.ch2Focus * 0.12 + smoothMouse.x * 0.06;

      rollerMesh.rotation.x += dt * (2.4 + st.ch3Focus * 4.2);
      const cycle = (t * 0.24) % 1;
      outputSheetMesh.position.z = 0.72 + Math.sin(cycle * Math.PI) * 0.54;
      laserGuideStrip.position.x = 0.14 + Math.sin(t * 3.0) * 0.22;

      shredPointsMat.opacity = st.ch3Focus * 0.85;
      if (st.ch3Focus > 0.02) {
        const wave = 0.3 + 0.7 * ((t * 0.45) % 1);
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          pPos[i * 3] = pBase[i * 3] + pDir[i * 3] * st.ch3Focus * wave;
          pPos[i * 3 + 1] = pBase[i * 3 + 1] + pDir[i * 3 + 1] * st.ch3Focus * wave;
          pPos[i * 3 + 2] = pBase[i * 3 + 2] + pDir[i * 3 + 2] * st.ch3Focus * wave;
        }
        posAttr.needsUpdate = true;
      }

      const aspectFit = isDesktopWide
        ? camera.aspect < 1.68
          ? 1.68 / camera.aspect
          : 1.0
        : camera.aspect < 1.15
          ? 1.18 / Math.max(camera.aspect, 0.68)
          : 1.0;
      camera.position.set(
        st.camX + smoothMouse.x * 0.38,
        st.camY + smoothMouse.y * 0.24,
        st.baseZ * aspectFit
      );
      camera.lookAt(st.lookX, st.lookY, st.lookZ);
      stageGroup.rotation.y = st.stageYaw + smoothMouse.x * 0.08;

      renderer.render(scene, camera);
    };

    const resumeIfVisible = () => {
      if (isVisible && !document.hidden && animFrameId === 0) {
        prevNow = performance.now();
        animFrameId = requestAnimationFrame(tick);
      }
    };

    const visibilityObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isVisible = entries[0]?.isIntersecting ?? true;
              if (isVisible) resumeIfVisible();
            },
            { threshold: 0.02 }
          )
        : null;
    visibilityObserver?.observe(container);
    document.addEventListener('visibilitychange', resumeIfVisible);

    animFrameId = requestAnimationFrame(tick);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      gsap.killTweensOf(animStateRef.current);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', resumeIfVisible);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();

      textures.forEach((tx) => tx.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onContextLost]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full relative cursor-grab active:cursor-grabbing ${className}`}
      aria-label="Interactive 3D PrintFlow Automation Diorama"
    />
  );
};

export default PrintPipelineCanvas;
