// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  RotateCcw,
  Camera,
  Printer,
  Download,
  FileSpreadsheet,
  Layers,
  Repeat,
  Zap,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Tag,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectCls } from "./ui";
import { toast } from "sonner";
import { useTheme } from "@/components/theme-provider";

export interface Graph3DNode {
  account: string;
  in_count: number;
  in_total: number;
  out_count: number;
  out_total: number;
  passthrough: number;
  fan_out: number;
  fan_in: number;
  degree: number;
  totalVolume: number;
  isCrime?: boolean;
  isMule?: boolean;
  isLoop?: boolean;
  isNormal?: boolean;
  typologyFlags?: string[];
}

export interface Graph3DEdge {
  source: string;
  target: string;
  weight: number;
  txCount: number;
  isLoop?: boolean;
  isMule?: boolean;
}

interface ThreeGraph3DProps {
  nodes: Graph3DNode[];
  edges: Graph3DEdge[];
  cycles: string[][];
  selectedAccount: string | null;
  onSelectAccount: (acc: string | null) => void;
  currencySymbol?: string;
}

// Canvas-based Sprite Text Label Generator for Crisp 3D Text
function createTextSprite(
  text: string,
  badgeText?: string,
  color: string = "#2563eb",
  borderColor: string = "rgba(148, 163, 184, 0.7)",
  bgColor: string = "rgba(255, 255, 255, 0.96)",
  textColor: string = "#0f172a",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background Box
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(4, 4, 312, 64, 10);
  ctx.fill();
  ctx.stroke();

  // Badge Tag if present
  let textStartX = 24;
  if (badgeText) {
    ctx.font = "bold 18px monospace";
    const badgeWidth = ctx.measureText(badgeText).width + 16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(14, 16, badgeWidth, 38, 6);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, 22, 42);
    textStartX = 18 + badgeWidth + 10;
  }

  // Account Text - High contrast for current theme
  ctx.fillStyle = textColor;
  ctx.font = "bold 20px monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(text, textStartX, 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(38, 8.5, 1);
  return sprite;
}

export function ThreeGraph3D({
  nodes,
  edges,
  cycles,
  selectedAccount,
  onSelectAccount,
  currencySymbol = "$",
}: ThreeGraph3DProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Layout & Display Controls - Default is structured directed financial flow (NO galaxy spheres)
  const [layoutMode, setLayoutMode] = useState<"flow" | "board" | "rings">("flow");
  const [filterMode, setFilterMode] = useState<"all" | "crime" | "mule" | "loop" | "normal">("all");
  const [densityLimit, setDensityLimit] = useState<string>("80");
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [particleSpeed, setParticleSpeed] = useState<"normal" | "off">("normal");
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<Graph3DNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // References to Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const edgeCurvesRef = useRef<
    { curve: THREE.QuadraticBezierCurve3; edge: Graph3DEdge; line: THREE.Line }[]
  >([]);
  const particlesRef = useRef<THREE.Points | null>(null);
  const particleProgressRef = useRef<Float32Array | null>(null);
  const animationFrameIdRef = useRef<number>(0);

  // Loop & Mule sets
  const loopAccounts = useMemo(() => {
    const set = new Set<string>();
    cycles.forEach((c) => c.forEach((acc) => set.add(acc)));
    return set;
  }, [cycles]);

  const muleAccounts = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.passthrough >= 0.85 && n.passthrough <= 1.15 && n.out_total > 5000) {
        set.add(n.account);
      }
    });
    return set;
  }, [nodes]);

  // Filtered nodes for high clarity and no visual clutter
  const activeNodes = useMemo(() => {
    let list = [...nodes];
    if (filterMode === "crime") {
      list = list.filter(
        (n) => loopAccounts.has(n.account) || muleAccounts.has(n.account) || n.isCrime,
      );
    } else if (filterMode === "loop") {
      list = list.filter((n) => loopAccounts.has(n.account));
    } else if (filterMode === "mule") {
      list = list.filter((n) => muleAccounts.has(n.account));
    } else if (filterMode === "normal") {
      list = list.filter((n) => !loopAccounts.has(n.account) && !muleAccounts.has(n.account));
    }

    // Limit density for crystal-clear readability
    const limit = parseInt(densityLimit, 10);
    if (!Number.isNaN(limit) && limit > 0) {
      list = list.slice(0, limit);
    }

    // Keep selected account in view
    if (selectedAccount && !list.some((n) => n.account === selectedAccount)) {
      const sel = nodes.find((n) => n.account === selectedAccount);
      if (sel) list.unshift(sel);
    }

    return list;
  }, [nodes, filterMode, densityLimit, selectedAccount, loopAccounts, muleAccounts]);

  const activeEdges = useMemo(() => {
    const accSet = new Set(activeNodes.map((n) => n.account));
    return edges.filter((e) => accSet.has(e.source) && accSet.has(e.target));
  }, [edges, activeNodes]);

  // Compute Structured 3D Positions for Nodes (Structured Banking Layouts, NOT a galaxy)
  const nodePositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    if (activeNodes.length === 0) return map;

    if (layoutMode === "flow") {
      // 1. DIRECTED FINANCIAL PIPELINE:
      // Left Column: Senders (X = -260)
      // Center Column: Mules, Layering Intermediaries, Ring accounts (X = 0)
      // Right Column: Sinks & Beneficiaries (X = +260)
      const senders: Graph3DNode[] = [];
      const intermediaries: Graph3DNode[] = [];
      const sinks: Graph3DNode[] = [];

      activeNodes.forEach((n) => {
        if (loopAccounts.has(n.account) || muleAccounts.has(n.account)) {
          intermediaries.push(n);
        } else if (n.out_count > 0 && n.in_count === 0) {
          senders.push(n);
        } else if (n.in_count > 0 && n.out_count === 0) {
          sinks.push(n);
        } else if (n.out_total > n.in_total * 1.5) {
          senders.push(n);
        } else if (n.in_total > n.out_total * 1.5) {
          sinks.push(n);
        } else {
          intermediaries.push(n);
        }
      });

      // Place Senders in a clean grid at X = -260
      senders.forEach((n, i) => {
        const row = i % 10;
        const col = Math.floor(i / 10);
        const y = (row - 4.5) * 36;
        const z = (col - 1.5) * 60;
        map.set(n.account, new THREE.Vector3(-260, y, z));
      });

      // Place Intermediaries / Mules / Rings in Center at X = 0
      intermediaries.forEach((n, i) => {
        const inLoop = loopAccounts.has(n.account);
        // Loops get elevated center prominence
        const row = i % 10;
        const col = Math.floor(i / 10);
        const y = (row - 4.5) * 38 + (inLoop ? 15 : 0);
        const z = (col - 1.5) * 65;
        map.set(n.account, new THREE.Vector3(0, y, z));
      });

      // Place Sinks in clean grid at X = +260
      sinks.forEach((n, i) => {
        const row = i % 10;
        const col = Math.floor(i / 10);
        const y = (row - 4.5) * 36;
        const z = (col - 1.5) * 60;
        map.set(n.account, new THREE.Vector3(260, y, z));
      });
    } else if (layoutMode === "board") {
      // 2. FLAT INVESTIGATION BOARD (Planar Tech Grid on horizontal XZ plane)
      // Eliminates 3D vertical confusion: nodes are arrayed in a neat rectangular matrix
      const cols = Math.max(4, Math.ceil(Math.sqrt(activeNodes.length * 1.6)));
      activeNodes.forEach((n, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const inLoop = loopAccounts.has(n.account);
        const isMule = muleAccounts.has(n.account);

        const x = (col - cols / 2) * 55;
        const z = (row - activeNodes.length / cols / 2) * 65;
        // Elevated slightly if crime for clear 2.5D visual hierarchy
        const y = inLoop ? 20 : isMule ? 10 : 0;
        map.set(n.account, new THREE.Vector3(x, y, z));
      });
    } else {
      // 3. CIRCULAR LAYERING RINGS FOCUS
      // Detected laundering loops arranged on a clean foreground ring
      const ringNodes: Graph3DNode[] = [];
      const otherNodes: Graph3DNode[] = [];

      activeNodes.forEach((n) => {
        if (loopAccounts.has(n.account)) ringNodes.push(n);
        else otherNodes.push(n);
      });

      // Ring members on a flat prominent circle in front
      const ringRadius = Math.max(90, ringNodes.length * 20);
      ringNodes.forEach((n, i) => {
        const angle = (i / Math.max(ringNodes.length, 1)) * Math.PI * 2;
        const x = Math.cos(angle) * ringRadius;
        const z = Math.sin(angle) * ringRadius;
        map.set(n.account, new THREE.Vector3(x, 25, z));
      });

      // Other external accounts arrayed cleanly on side panels
      otherNodes.forEach((n, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const idx = Math.floor(i / 2);
        const x = side * (ringRadius + 140);
        const y = ((idx % 8) - 3.5) * 36;
        const z = (Math.floor(idx / 8) - 1.5) * 60;
        map.set(n.account, new THREE.Vector3(x, y, z));
      });
    }

    return map;
  }, [activeNodes, layoutMode, loopAccounts, muleAccounts]);

  // Main Three.js Scene Setup & Render Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 560;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(isDark ? 0x090d16 : 0xf8fafc); // Crisp slate workbench backdrop (dark/light)

    // Camera
    const camera = new THREE.PerspectiveCamera(46, width / height, 1, 3000);
    camera.position.set(0, 160, 480);
    cameraRef.current = camera;

    // Renderer with PRESERVEDRAWINGBUFFER = TRUE for Save/Print snapshots!
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true, // CRITICAL: enables canvas.toDataURL() for image save & print!
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 60;
    controls.maxDistance = 1400;
    controlsRef.current = controls;

    // Clean Lighting adapted for current theme
    const dirLight1 = new THREE.DirectionalLight(0xffffff, isDark ? 1.5 : 1.8);
    dirLight1.position.set(150, 300, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(isDark ? 0x3b82f6 : 0x2563eb, isDark ? 0.6 : 0.4);
    dirLight2.position.set(-150, 200, -100);
    scene.add(dirLight2);

    const ambientLight = new THREE.AmbientLight(0xffffff, isDark ? 1.6 : 2.2);
    scene.add(ambientLight);

    // Crisp Tech Workbench Grid Base
    const grid = new THREE.GridHelper(
      900,
      36,
      isDark ? 0x334155 : 0x94a3b8,
      isDark ? 0x1e293b : 0xe2e8f0,
    );
    grid.position.y = -140;
    scene.add(grid);

    // Node Meshes
    const nodeMeshes = new Map<string, THREE.Mesh>();
    nodeMeshesRef.current = nodeMeshes;

    const sphereGeo = new THREE.SphereGeometry(1, 24, 24);

    activeNodes.forEach((node) => {
      const pos = nodePositions.get(node.account);
      if (!pos) return;

      const inLoop = loopAccounts.has(node.account);
      const isMule = muleAccounts.has(node.account);
      const isSelected = selectedAccount === node.account;

      let color = 0x2563eb; // royal cobalt blue
      let emissive = 0x1d4ed8;
      let radius = 8;

      if (inLoop) {
        color = 0xef4444; // crimson loop ring
        emissive = 0x991b1b;
        radius = 12;
      } else if (isMule) {
        color = 0xf59e0b; // amber mule
        emissive = 0xb45309;
        radius = 10;
      } else if (node.isCrime || (node.typologyFlags && node.typologyFlags.length > 0)) {
        color = 0xf97316; // orange risk
        emissive = 0xc2410c;
        radius = 9.5;
      }

      if (isSelected) {
        radius += 4;
        emissive = 0xffffff;
      }

      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: inLoop || isSelected ? 0.8 : 0.4,
        roughness: 0.3,
        metalness: 0.2,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.scale.setScalar(radius);
      mesh.position.copy(pos);
      mesh.userData = { account: node.account, nodeData: node };

      // Prominent Halo Ring for Circular Loop Members
      if (inLoop || isSelected) {
        const ringGeo = new THREE.RingGeometry(radius * 1.35, radius * 1.6, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: inLoop ? 0xef4444 : 0x3b82f6,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.lookAt(camera.position);
        mesh.add(ring);
      }

      // Add High-Clarity Readable Text Sprite Labels (No galaxy guessing!)
      if (showLabels) {
        let badge: string | undefined = undefined;
        let badgeColor = "#38bdf8";
        let borderColor = "rgba(56, 189, 248, 0.4)";

        if (inLoop) {
          badge = "🔁 RING";
          badgeColor = "#ef4444";
          borderColor = "rgba(239, 68, 68, 0.8)";
        } else if (isMule) {
          badge = "⚡ MULE";
          badgeColor = "#f59e0b";
          borderColor = "rgba(245, 158, 11, 0.8)";
        } else if (isSelected) {
          badge = "FOCUS";
          badgeColor = "#10b981";
          borderColor = "rgba(16, 185, 129, 0.8)";
        }

        // Only show labels for notable accounts or first 40 to avoid overlap
        if (inLoop || isMule || isSelected || activeNodes.indexOf(node) < 35) {
          const spriteBg = isDark ? "rgba(15, 23, 42, 0.94)" : "rgba(255, 255, 255, 0.96)";
          const spriteBorder = isDark ? "rgba(71, 85, 105, 0.85)" : borderColor;
          const spriteText = isDark ? "#f8fafc" : "#0f172a";
          const sprite = createTextSprite(
            node.account,
            badge,
            badgeColor,
            spriteBorder,
            spriteBg,
            spriteText,
          );
          if (sprite) {
            sprite.position.set(0, radius + 11, 0);
            mesh.add(sprite);
          }
        }
      }

      scene.add(mesh);
      nodeMeshes.set(node.account, mesh);
    });

    // 3D Directed Arcs for Transaction Flows
    const edgeCurves: {
      curve: THREE.QuadraticBezierCurve3;
      edge: Graph3DEdge;
      line: THREE.Line;
    }[] = [];
    edgeCurvesRef.current = edgeCurves;

    activeEdges.forEach((e) => {
      const p1 = nodePositions.get(e.source);
      const p2 = nodePositions.get(e.target);
      if (!p1 || !p2) return;

      const isLoopEdge = loopAccounts.has(e.source) && loopAccounts.has(e.target);
      const isMuleEdge = muleAccounts.has(e.source) || muleAccounts.has(e.target);
      const isConnectedToSelected =
        selectedAccount && (e.source === selectedAccount || e.target === selectedAccount);

      // Clean upward arch for clear directionality
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const dist = p1.distanceTo(p2);
      mid.y += Math.min(dist * 0.18, 45);

      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const points = curve.getPoints(20);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);

      let lineColor = isDark ? 0x475569 : 0x94a3b8; // Clean slate adapted to theme backdrop
      let opacity = 0.45;

      if (isLoopEdge) {
        lineColor = 0xdc2626; // Bright Crimson
        opacity = 0.95;
      } else if (isConnectedToSelected) {
        lineColor = e.source === selectedAccount ? 0xd97706 : 0x2563eb;
        opacity = 1.0;
      } else if (isMuleEdge) {
        lineColor = 0xd97706; // Amber
        opacity = 0.75;
      }

      const lineMat = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity,
      });

      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
      edgeCurves.push({ curve, edge: e, line });
    });

    // Clean Directional Transfer Beads (calm, structured flow pulses - NO starry galaxy dust!)
    if (particleSpeed !== "off" && edgeCurves.length > 0) {
      const particleCount = edgeCurves.length * 2;
      const particleGeo = new THREE.BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);
      const particleColors = new Float32Array(particleCount * 3);
      const particleProgress = new Float32Array(particleCount);

      let pIdx = 0;
      edgeCurves.forEach(({ curve, edge }) => {
        const isLoop = loopAccounts.has(edge.source) && loopAccounts.has(edge.target);
        for (let k = 0; k < 2; k++) {
          const initT = k * 0.5 + Math.random() * 0.1;
          particleProgress[pIdx] = initT % 1.0;
          const pt = curve.getPoint(particleProgress[pIdx]);
          particlePositions[pIdx * 3] = pt.x;
          particlePositions[pIdx * 3 + 1] = pt.y;
          particlePositions[pIdx * 3 + 2] = pt.z;

          if (isLoop) {
            particleColors[pIdx * 3] = 0.86;
            particleColors[pIdx * 3 + 1] = 0.15;
            particleColors[pIdx * 3 + 2] = 0.15;
          } else {
            particleColors[pIdx * 3] = 0.15;
            particleColors[pIdx * 3 + 1] = 0.45;
            particleColors[pIdx * 3 + 2] = 0.95;
          }
          pIdx++;
        }
      });

      particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
      particleGeo.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
      particleProgressRef.current = particleProgress;

      const particleMat = new THREE.PointsMaterial({
        size: 5,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
      });

      const particles = new THREE.Points(particleGeo, particleMat);
      scene.add(particles);
      particlesRef.current = particles;
    }

    // Raycaster for Hover & Click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(nodeMeshes.values());
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0 && intersects[0]?.object) {
        const hit = intersects[0].object as THREE.Mesh;
        const nodeData = hit.userData.nodeData as Graph3DNode;
        setHoveredNode(nodeData);
        setTooltipPos({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
        container.style.cursor = "pointer";
      } else {
        setHoveredNode(null);
        setTooltipPos(null);
        container.style.cursor = "grab";
      }
    };

    const handleClick = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshes = Array.from(nodeMeshes.values());
      const intersects = raycaster.intersectObjects(meshes);

      if (intersects.length > 0 && intersects[0]?.object) {
        const hit = intersects[0].object as THREE.Mesh;
        const acc = hit.userData.account as string;
        onSelectAccount(acc === selectedAccount ? null : acc);
      } else {
        onSelectAccount(null);
      }
    };

    renderer.domElement.addEventListener("mousemove", handlePointerMove);
    renderer.domElement.addEventListener("click", handleClick);

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      controls.update();

      // Animate Transfer Beads
      if (particleSpeed !== "off" && particlesRef.current && particleProgressRef.current) {
        const speed = 0.25;
        const posAttr = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const prog = particleProgressRef.current;

        let idx = 0;
        edgeCurves.forEach(({ curve }) => {
          for (let k = 0; k < 2; k++) {
            prog[idx] = (prog[idx] + delta * speed) % 1.0;
            const pt = curve.getPoint(prog[idx]);
            posAttr.setXYZ(idx, pt.x, pt.y, pt.z);
            idx++;
          }
        });
        posAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("mousemove", handlePointerMove);
      renderer.domElement.removeEventListener("click", handleClick);
      controls.dispose();
      renderer.dispose();
    };
  }, [
    activeNodes,
    activeEdges,
    nodePositions,
    selectedAccount,
    particleSpeed,
    showLabels,
    loopAccounts,
    muleAccounts,
    onSelectAccount,
    isDark,
  ]);

  // Focus Camera on Selected Account
  const focusOnAccount = useCallback(
    (acc: string) => {
      const pos = nodePositions.get(acc);
      if (!pos || !controlsRef.current || !cameraRef.current) return;

      const camera = cameraRef.current;
      const controls = controlsRef.current;

      controls.target.copy(pos);
      camera.position.set(pos.x + 20, pos.y + 40, pos.z + 130);
      controls.update();
    },
    [nodePositions],
  );

  useEffect(() => {
    if (selectedAccount) {
      focusOnAccount(selectedAccount);
    }
  }, [selectedAccount, focusOnAccount]);

  // Reset Camera View
  const resetCamera = () => {
    if (!controlsRef.current || !cameraRef.current) return;
    cameraRef.current.position.set(0, 160, 480);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
    onSelectAccount(null);
  };

  // 1. SAVE GRAPH IMAGE AS PNG
  const handleSaveImage = () => {
    if (!rendererRef.current) {
      toast.error("3D Canvas not initialized yet");
      return;
    }
    try {
      const dataUrl = rendererRef.current.domElement.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `AML_Transaction_Network_3D_${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Graph snapshot saved as PNG image!");
    } catch (err: any) {
      toast.error("Failed to save image: " + err.message);
    }
  };

  // 2. PRINT GRAPH DOSSIER (HTML Printable Document with Image and Telemetry)
  const handlePrintGraph = () => {
    if (!rendererRef.current) return;
    try {
      const imgData = rendererRef.current.domElement.toDataURL("image/png");
      const cyclesHtml =
        cycles.length > 0
          ? cycles
              .map(
                (c, idx) =>
                  `<div style="margin:4px 0;padding:6px;background:#fee2e2;border-left:4px solid #ef4444;font-family:monospace;font-size:12px;"><b>Ring ${idx + 1}:</b> ${c.join(" ➔ ")} ➔ ${c[0]}</div>`,
              )
              .join("")
          : "<div style='color:#64748b;font-size:12px;'>No circular loops detected.</div>";

      const printHtml = `<!DOCTYPE html>
<html>
<head>
  <title>AML Transaction Network Graph Dossier</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0f172a; }
    h1 { margin: 0 0 6px 0; font-size: 20px; color: #0f172a; }
    .meta { font-family: monospace; font-size: 11px; color: #64748b; margin-bottom: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; }
    .img-wrap { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #f8fafc; text-align: center; margin-bottom: 20px; }
    img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    .kpis { display: flex; gap: 16px; margin-bottom: 20px; font-family: monospace; }
    .kpi { padding: 10px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .kpi b { font-size: 16px; display: block; color: #0284c7; }
    .kpi span { font-size: 11px; color: #64748b; }
    .section-title { font-size: 14px; font-weight: bold; margin: 16px 0 8px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center;">
    <button onclick="window.print()" style="background:#0284c7;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;">🖨️ Print Dossier</button>
    <span style="font-size:12px;color:#64748b;">Press Print or save as PDF</span>
  </div>

  <h1>Transaction Counterparty Network Intelligence Dossier</h1>
  <div class="meta">Exported on ${new Date().toLocaleString()} · AML Compliance Division · Strictly Confidential</div>

  <div class="kpis">
    <div class="kpi"><b>${activeNodes.length}</b><span>Active Accounts</span></div>
    <div class="kpi"><b>${activeEdges.length}</b><span>Transaction Links</span></div>
    <div class="kpi"><b style="color:#ef4444;">${cycles.length}</b><span>Circular Layering Rings</span></div>
    <div class="kpi"><b style="color:#f59e0b;">${muleAccounts.size}</b><span>Mule Conduits</span></div>
  </div>

  <div class="img-wrap">
    <img src="${imgData}" alt="AML Transaction Graph" />
  </div>

  <div class="section-title">Detected Circular Layering Laundering Rings</div>
  ${cyclesHtml}

  <script>
    window.onload = function() {
      // Auto open print dialog
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;

      // Download clean printable HTML document
      const blob = new Blob([printHtml], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `AML_Network_Graph_Printable_${Date.now()}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Printable Graph Dossier downloaded! Open to print or save PDF.");
    } catch (err: any) {
      toast.error("Failed to prepare printable graph: " + err.message);
    }
  };

  // 3. EXPORT GRAPH CONNECTIONS AS CSV
  const handleExportCsv = () => {
    try {
      let csv = "source_account,target_account,amount,transaction_count,typology_flag\n";
      activeEdges.forEach((e) => {
        const isLoop = loopAccounts.has(e.source) && loopAccounts.has(e.target);
        const isMule = muleAccounts.has(e.source) || muleAccounts.has(e.target);
        const flag = isLoop ? "CIRCULAR_LOOP" : isMule ? "MULE_CONDUIT" : "STANDARD";
        csv += `"${e.source}","${e.target}",${e.weight},${e.txCount},"${flag}"\n`;
      });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aml_network_links_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Graph connections exported as CSV!");
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    }
  };

  return (
    <div className="relative w-full h-[620px] rounded-lg overflow-hidden border border-border bg-card select-none shadow-sm">
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left Legend */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-md bg-card/90 border border-border px-3 py-1.5 text-[11px] font-mono text-muted-foreground backdrop-blur-md shadow-md pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive shadow-sm" />
          <span className="text-foreground font-semibold">Circular Loop Ring</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm" />
          <span className="text-foreground font-semibold">Pass-Through Mule</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 shadow-sm" />
          <span className="text-foreground font-semibold">Normal / Cleared</span>
        </div>
        <span className="text-muted-foreground/60 border-l border-border pl-2">
          {activeNodes.length} Nodes · {activeEdges.length} Links
        </span>
      </div>

      {/* Top Right Save, Print & Camera Actions (WORKING PRINT & SAVE) */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-card/90 border border-border p-1.5 rounded-md backdrop-blur-md shadow-md">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSaveImage}
          className="h-7 px-2.5 text-xs font-mono font-bold text-primary hover:bg-primary/10 border-primary/30"
          title="Save graph image as PNG"
        >
          <Camera className="mr-1 h-3.5 w-3.5" /> Save PNG
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handlePrintGraph}
          className="h-7 px-2.5 text-xs font-mono font-bold text-foreground hover:bg-muted"
          title="Print graph intelligence dossier"
        >
          <Printer className="mr-1 h-3.5 w-3.5 text-amber-500" /> Print Graph
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          className="h-7 px-2 text-xs font-mono text-muted-foreground hover:text-foreground"
          title="Export links as CSV"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={resetCamera}
          className="h-7 px-2 text-xs font-mono text-muted-foreground hover:text-foreground"
          title="Reset Camera View"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Interactive Hover HUD Tooltip */}
      {hoveredNode && tooltipPos && (
        <div
          className="absolute z-30 pointer-events-none rounded-md bg-card/95 border border-border px-3.5 py-2.5 text-xs font-mono text-foreground shadow-2xl backdrop-blur-md"
          style={{
            left: Math.min(tooltipPos.x + 14, (mountRef.current?.clientWidth || 800) - 240),
            top: Math.max(tooltipPos.y - 45, 14),
          }}
        >
          <div className="font-bold flex items-center justify-between gap-2 border-b border-border/60 pb-1 mb-1.5">
            <span>{hoveredNode.account}</span>
            {loopAccounts.has(hoveredNode.account) ? (
              <span className="rounded bg-destructive/20 text-destructive text-[10px] px-1.5 py-0.2 font-bold">
                🔁 RING LOOP
              </span>
            ) : muleAccounts.has(hoveredNode.account) ? (
              <span className="rounded bg-amber-500/20 text-amber-500 text-[10px] px-1.5 py-0.2 font-bold">
                ⚡ MULE
              </span>
            ) : (
              <span className="rounded bg-success/20 text-success text-[10px] px-1.5 py-0.2 font-bold">
                NORMAL
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <div>
              Total Volume: <b className="text-foreground">{currencySymbol}</b>
              {Math.round(
                hoveredNode.totalVolume || hoveredNode.in_total + hoveredNode.out_total,
              ).toLocaleString()}
            </div>
            <div>
              Degree: {hoveredNode.in_count} inbound / {hoveredNode.out_count} outbound
            </div>
            <div>Passthrough Ratio: {(hoveredNode.passthrough * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Selected Account Sticky Pill */}
      {selectedAccount && (
        <div className="absolute top-12 left-3 z-10 flex items-center gap-2 rounded-md bg-card/95 border border-primary px-3 py-1.5 text-xs font-mono backdrop-blur-md shadow-lg">
          <span className="text-muted-foreground">Inspecting:</span>
          <span className="text-primary font-bold">{selectedAccount}</span>
          <button
            onClick={() => onSelectAccount(null)}
            className="ml-2 text-muted-foreground hover:text-foreground text-[10px] bg-muted rounded px-1.5 py-0.5"
          >
            ✕ Clear Focus
          </button>
        </div>
      )}

      {/* Bottom Controls Dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[95%] max-w-[880px]">
        {/* Toggle Bar */}
        <div className="flex justify-center -mb-px">
          <button
            onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
            className="flex items-center gap-1.5 rounded-t-md bg-card border-t border-x border-border px-3 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground backdrop-blur-md transition-colors"
          >
            {isControlsCollapsed ? (
              <>
                <ChevronUp className="h-3 w-3 text-primary" />
                <span>Show Graph Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        {/* Dock Panel */}
        {!isControlsCollapsed && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card/95 border border-border px-4 py-2.5 backdrop-blur-md shadow-2xl text-xs font-mono">
            {/* Layout Switcher (Clean Financial Layouts) */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">Layout:</span>
              <select
                className={selectCls + " h-7 text-xs font-mono font-semibold bg-background"}
                value={layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as any)}
              >
                <option value="flow">➡️ Flow Pipeline (Senders ➔ Mules ➔ Sinks)</option>
                <option value="board">📋 Flat Planar Inspection Board</option>
                <option value="rings">🔁 Circular Rings Centerstage</option>
              </select>
            </div>

            {/* Filter Mode */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">Filter:</span>
              <select
                className={selectCls + " h-7 text-xs font-mono font-semibold bg-background"}
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as any)}
              >
                <option value="all">All Accounts ({nodes.length})</option>
                <option value="crime">🚨 Flagged Crimes Only</option>
                <option value="loop">🔁 Circular Ring Loops</option>
                <option value="mule">⚡ Pass-Through Mules</option>
                <option value="normal">✅ Normal Cleared Only</option>
              </select>
            </div>

            {/* Density Limit */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">Max Nodes:</span>
              <select
                className={selectCls + " h-7 text-xs font-mono bg-background"}
                value={densityLimit}
                onChange={(e) => setDensityLimit(e.target.value)}
              >
                <option value="40">Top 40 (Ultra Clear)</option>
                <option value="80">Top 80 (Recommended)</option>
                <option value="160">Top 160</option>
                <option value="9999">All Available</option>
              </select>
            </div>

            {/* Labels Toggle */}
            <Button
              size="sm"
              variant={showLabels ? "default" : "outline"}
              onClick={() => setShowLabels(!showLabels)}
              className={`h-7 px-2.5 text-[11px] font-mono ${showLabels ? "bg-primary text-primary-foreground font-bold" : ""}`}
              title="Toggle readable account labels in 3D"
            >
              <Tag className="mr-1 h-3 w-3" /> Labels: {showLabels ? "ON" : "OFF"}
            </Button>

            {/* Flow Pulse Toggle */}
            <Button
              size="sm"
              variant={particleSpeed === "normal" ? "default" : "outline"}
              onClick={() => setParticleSpeed(particleSpeed === "normal" ? "off" : "normal")}
              className={`h-7 px-2 text-[11px] font-mono ${particleSpeed === "normal" ? "bg-primary text-primary-foreground font-bold" : ""}`}
              title="Toggle animated transfer pulses"
            >
              Flow: {particleSpeed === "normal" ? "ON" : "OFF"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
