// @ts-nocheck -- strict index checks relaxed for numeric ML code
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Layers,
  Repeat,
  Zap,
  ShieldAlert,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  Info,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectCls, Chip } from "./ui";

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

export function ThreeGraph3D({
  nodes,
  edges,
  cycles,
  selectedAccount,
  onSelectAccount,
  currencySymbol = "$",
}: ThreeGraph3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Layout & Display Controls
  const [layoutMode, setLayoutMode] = useState<"spheres" | "flow" | "force">("spheres");
  const [filterMode, setFilterMode] = useState<"all" | "crime" | "mule" | "loop" | "normal">("all");
  const [densityLimit, setDensityLimit] = useState<string>("100");
  const [particleSpeed, setParticleSpeed] = useState<"normal" | "fast" | "off">("normal");
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

  // Filtered nodes and edges for 3D clarity
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

    // Always keep selected account in view
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

  // Compute 3D Positions for Nodes
  const nodePositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    const count = activeNodes.length;
    if (count === 0) return map;

    if (layoutMode === "spheres") {
      // Clean 3D Concentric Orbits
      const innerNodes: Graph3DNode[] = [];
      const midNodes: Graph3DNode[] = [];
      const outerNodes: Graph3DNode[] = [];

      activeNodes.forEach((n) => {
        if (loopAccounts.has(n.account)) innerNodes.push(n);
        else if (muleAccounts.has(n.account) || (n.typologyFlags && n.typologyFlags.length > 0))
          midNodes.push(n);
        else outerNodes.push(n);
      });

      // Sphere 1: Inner Core (Circular Loops - Red) Radius 60
      innerNodes.forEach((n, i) => {
        const phi = Math.acos(-1 + (2 * i) / Math.max(innerNodes.length, 1));
        const theta = Math.sqrt(innerNodes.length * Math.PI) * phi;
        const r = 60;
        map.set(
          n.account,
          new THREE.Vector3(
            r * Math.cos(theta) * Math.sin(phi),
            r * Math.sin(theta) * Math.sin(phi),
            r * Math.cos(phi),
          ),
        );
      });

      // Sphere 2: Mid Shell (Mules & Conduit Aggregators - Amber) Radius 150
      midNodes.forEach((n, i) => {
        const phi = Math.acos(-1 + (2 * i) / Math.max(midNodes.length, 1));
        const theta = Math.sqrt(midNodes.length * Math.PI) * phi;
        const r = 150;
        map.set(
          n.account,
          new THREE.Vector3(
            r * Math.cos(theta) * Math.sin(phi),
            r * Math.sin(theta) * Math.sin(phi),
            r * Math.cos(phi),
          ),
        );
      });

      // Sphere 3: Outer Shell (Normal & Standard Accounts - Cyan) Radius 260
      outerNodes.forEach((n, i) => {
        const phi = Math.acos(-1 + (2 * i) / Math.max(outerNodes.length, 1));
        const theta = Math.sqrt(outerNodes.length * Math.PI) * phi;
        const r = 260;
        map.set(
          n.account,
          new THREE.Vector3(
            r * Math.cos(theta) * Math.sin(phi),
            r * Math.sin(theta) * Math.sin(phi),
            r * Math.cos(phi),
          ),
        );
      });
    } else if (layoutMode === "flow") {
      // 3D Corridor: Senders (Left) -> Mules / Rings (Center) -> Sinks (Right)
      activeNodes.forEach((n, i) => {
        let x = 0;
        if (n.out_count > 0 && n.in_count === 0) x = -240;
        else if (n.in_count > 0 && n.out_count === 0) x = 240;
        else if (n.passthrough >= 0.85 && n.passthrough <= 1.15) x = 0;
        else if (n.out_count > n.in_count) x = -110;
        else x = 110;

        const y = ((i % 14) - 7) * 28 + (i % 3) * 6;
        const z = (Math.floor(i / 14) - 4) * 45;
        map.set(n.account, new THREE.Vector3(x, y, z));
      });
    } else {
      // 3D Force Repulsion Relaxation
      activeNodes.forEach((n, i) => {
        const phi = Math.acos(-1 + (2 * i) / count);
        const theta = Math.sqrt(count * Math.PI) * phi;
        const r = 140 + (i % 3) * 50;
        map.set(
          n.account,
          new THREE.Vector3(
            r * Math.cos(theta) * Math.sin(phi),
            r * Math.sin(theta) * Math.sin(phi),
            r * Math.cos(phi),
          ),
        );
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
    scene.background = new THREE.Color(0x07090e);
    scene.fog = new THREE.FogExp2(0x07090e, 0.0018);

    // Camera
    const camera = new THREE.PerspectiveCamera(48, width / height, 1, 3000);
    camera.position.set(0, 120, 480);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;
    container.replaceChildren(renderer.domElement);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 60;
    controls.maxDistance = 1200;
    controls.maxPolarAngle = Math.PI - 0.05;
    controlsRef.current = controls;

    // Lighting (Warm Key, Cool Fill, Center Glow)
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    keyLight.position.set(200, 300, 250);
    scene.add(keyLight);

    const fillLight = new THREE.HemisphereLight(0x38bdf8, 0x020617, 1.4);
    scene.add(fillLight);

    const centerPointLight = new THREE.PointLight(0x38bdf8, 1.5, 600);
    centerPointLight.position.set(0, 0, 0);
    scene.add(centerPointLight);

    // Ground Grid Helper for Spatial Grounding
    const grid = new THREE.GridHelper(800, 40, 0x1e293b, 0x0f172a);
    grid.position.y = -180;
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

      let color = 0x06b6d4; // cyan / normal
      let emissive = 0x083344;
      let radius = 7.5;

      if (inLoop) {
        color = 0xef4444; // crimson loop
        emissive = 0x7f1d1d;
        radius = 11;
      } else if (isMule) {
        color = 0xf59e0b; // amber mule
        emissive = 0x78350f;
        radius = 9.5;
      } else if (node.isCrime || (node.typologyFlags && node.typologyFlags.length > 0)) {
        color = 0xf97316; // orange risk
        emissive = 0x7c2d12;
        radius = 9;
      }

      if (isSelected) {
        radius += 4;
        emissive = 0xffffff;
      }

      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: inLoop || isSelected ? 0.7 : 0.35,
        roughness: 0.25,
        metalness: 0.3,
      });

      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.scale.setScalar(radius);
      mesh.position.copy(pos);
      mesh.userData = { account: node.account, nodeData: node };

      scene.add(mesh);
      nodeMeshes.set(node.account, mesh);

      // Outer halo ring for High-Risk and Circular Ring accounts
      if (inLoop || isSelected) {
        const ringGeo = new THREE.RingGeometry(radius * 1.3, radius * 1.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: inLoop ? 0xef4444 : 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.lookAt(camera.position);
        mesh.add(ring);
      }
    });

    // 3D Bezier Curves for Transfer Edges
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

      // Midpoint arching upward/outward
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const dist = p1.distanceTo(p2);
      mid.y += Math.min(dist * 0.22, 50);

      const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
      const points = curve.getPoints(24);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);

      let lineColor = 0x334155; // subtle slate
      let opacity = 0.25;

      if (isLoopEdge) {
        lineColor = 0xef4444; // crimson
        opacity = 0.85;
      } else if (isConnectedToSelected) {
        lineColor = e.source === selectedAccount ? 0xf59e0b : 0x38bdf8;
        opacity = 0.95;
      } else if (isMuleEdge) {
        lineColor = 0xf59e0b;
        opacity = 0.55;
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

    // Animated 3D Flow Particles Traveling Along Directed Vectors
    const particleCount = edgeCurves.length * 3;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const particleProgress = new Float32Array(particleCount);

    let pIdx = 0;
    edgeCurves.forEach(({ curve, edge }) => {
      const isLoop = loopAccounts.has(edge.source) && loopAccounts.has(edge.target);
      for (let k = 0; k < 3; k++) {
        const initT = k / 3 + Math.random() * 0.2;
        particleProgress[pIdx] = initT % 1.0;
        const pt = curve.getPoint(particleProgress[pIdx]);
        particlePositions[pIdx * 3] = pt.x;
        particlePositions[pIdx * 3 + 1] = pt.y;
        particlePositions[pIdx * 3 + 2] = pt.z;

        if (isLoop) {
          particleColors[pIdx * 3] = 1.0;
          particleColors[pIdx * 3 + 1] = 0.2;
          particleColors[pIdx * 3 + 2] = 0.2;
        } else {
          particleColors[pIdx * 3] = 0.2;
          particleColors[pIdx * 3 + 1] = 0.8;
          particleColors[pIdx * 3 + 2] = 1.0;
        }
        pIdx++;
      }
    });

    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
    particleProgressRef.current = particleProgress;

    const particleMat = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
    particlesRef.current = particles;

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
        // click background clears selection
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

    // Render Animation Loop
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      controls.update();

      // Animate Particles
      if (particleSpeed !== "off" && particlesRef.current && particleProgressRef.current) {
        const speed = particleSpeed === "fast" ? 0.45 : 0.22;
        const posAttr = particlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const prog = particleProgressRef.current;

        let idx = 0;
        edgeCurves.forEach(({ curve }) => {
          for (let k = 0; k < 3; k++) {
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

    // Cleanup
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
    loopAccounts,
    muleAccounts,
    onSelectAccount,
  ]);

  // Focus Camera on Selected Account
  const focusOnAccount = useCallback(
    (acc: string) => {
      const pos = nodePositions.get(acc);
      if (!pos || !controlsRef.current || !cameraRef.current) return;

      const camera = cameraRef.current;
      const controls = controlsRef.current;

      controls.target.copy(pos);
      camera.position.set(pos.x + 30, pos.y + 40, pos.z + 120);
      controls.update();
    },
    [nodePositions],
  );

  useEffect(() => {
    if (selectedAccount) {
      focusOnAccount(selectedAccount);
    }
  }, [selectedAccount, focusOnAccount]);

  // Reset Camera
  const resetCamera = () => {
    if (!controlsRef.current || !cameraRef.current) return;
    cameraRef.current.position.set(0, 120, 480);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
    onSelectAccount(null);
  };

  return (
    <div className="relative w-full h-[620px] rounded-lg overflow-hidden border border-border/80 bg-[#07090e] select-none">
      {/* 3D WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Left Floating Legend */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-3 rounded-md bg-black/80 border border-white/10 px-3 py-1.5 text-[11px] font-mono text-muted-foreground backdrop-blur-md shadow-lg pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive shadow-sm" />
          <span className="text-foreground font-semibold">Circular Loop Ring</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm" />
          <span className="text-foreground font-semibold">Pass-Through Mule</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-sm" />
          <span className="text-foreground font-semibold">Normal / Cleared</span>
        </div>
        <span className="text-muted-foreground/60 border-l border-white/10 pl-2">
          {activeNodes.length} Nodes · {activeEdges.length} Links
        </span>
      </div>

      {/* Top Right Quick Actions */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-black/80 border border-white/10 p-1 rounded-md backdrop-blur-md">
        <Button
          size="sm"
          variant="ghost"
          onClick={resetCamera}
          className="h-7 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground"
          title="Reset Camera View"
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset View
        </Button>
      </div>

      {/* Interactive Hover HUD Tooltip */}
      {hoveredNode && tooltipPos && (
        <div
          className="absolute z-30 pointer-events-none rounded-md bg-black/90 border border-border px-3 py-2 text-xs font-mono text-foreground shadow-2xl backdrop-blur-md"
          style={{
            left: Math.min(tooltipPos.x + 12, (mountRef.current?.clientWidth || 800) - 230),
            top: Math.max(tooltipPos.y - 45, 12),
          }}
        >
          <div className="font-bold flex items-center gap-1.5">
            <span>{hoveredNode.account}</span>
            {loopAccounts.has(hoveredNode.account) ? (
              <span className="rounded bg-destructive/20 text-destructive text-[10px] px-1.5 py-0.2">
                RING LOOP
              </span>
            ) : muleAccounts.has(hoveredNode.account) ? (
              <span className="rounded bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0.2">
                MULE
              </span>
            ) : (
              <span className="rounded bg-success/20 text-success text-[10px] px-1.5 py-0.2">
                NORMAL
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground space-y-0.5">
            <div>
              Volume: {currencySymbol}
              {Math.round(
                hoveredNode.totalVolume || hoveredNode.in_total + hoveredNode.out_total,
              ).toLocaleString()}
            </div>
            <div>
              In/Out Degree: {hoveredNode.in_count} in / {hoveredNode.out_count} out
            </div>
            <div>Passthrough: {(hoveredNode.passthrough * 100).toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Selected Account Sticky Inspector Pill */}
      {selectedAccount && (
        <div className="absolute top-12 left-3 z-10 flex items-center gap-2 rounded-md bg-black/90 border border-primary/40 px-3 py-1.5 text-xs font-mono backdrop-blur-md shadow-lg">
          <span className="text-muted-foreground">Inspecting:</span>
          <span className="text-primary font-bold">{selectedAccount}</span>
          <button
            onClick={() => onSelectAccount(null)}
            className="ml-2 text-muted-foreground hover:text-foreground text-[10px] bg-white/10 rounded px-1"
          >
            ✕ Clear Focus
          </button>
        </div>
      )}

      {/* ERGONOMIC COLLAPSIBLE BOTTOM DOCK (Three.js Skill Directive: Zero Viewport Occlusion) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[95%] max-w-[860px]">
        {/* Toggle Bar */}
        <div className="flex justify-center -mb-px">
          <button
            onClick={() => setIsControlsCollapsed(!isControlsCollapsed)}
            className="flex items-center gap-1.5 rounded-t-md bg-black/90 border-t border-x border-white/15 px-3 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground backdrop-blur-md transition-colors"
          >
            {isControlsCollapsed ? (
              <>
                <ChevronUp className="h-3 w-3 text-primary" />
                <span>Show 3D Graph Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                <span>Hide Controls (Zen View)</span>
              </>
            )}
          </button>
        </div>

        {/* Dock Panel */}
        {!isControlsCollapsed && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/90 border border-white/15 px-4 py-2.5 backdrop-blur-md shadow-2xl text-xs font-mono">
            {/* 3D Layout Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">3D Layout:</span>
              <select
                className={selectCls + " h-7 text-xs font-mono font-semibold bg-background"}
                value={layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as any)}
              >
                <option value="spheres">🌌 3D Concentric Orbits (Clean)</option>
                <option value="flow">➡️ 3D Conduit Pipeline</option>
                <option value="force">⚡ 3D Dynamic Force Cluster</option>
              </select>
            </div>

            {/* Crime Typology Filter */}
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
                <option value="50">Top 50 (High Clarity)</option>
                <option value="100">Top 100</option>
                <option value="250">Top 250</option>
                <option value="9999">All Available</option>
              </select>
            </div>

            {/* Particle Flow Speed */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px]">Flow:</span>
              <Button
                size="sm"
                variant={particleSpeed === "normal" ? "default" : "outline"}
                onClick={() => setParticleSpeed("normal")}
                className={`h-6 px-2 text-[10px] font-mono ${particleSpeed === "normal" ? "bg-primary text-primary-foreground font-bold" : ""}`}
              >
                Normal
              </Button>
              <Button
                size="sm"
                variant={particleSpeed === "fast" ? "default" : "outline"}
                onClick={() => setParticleSpeed("fast")}
                className={`h-6 px-2 text-[10px] font-mono ${particleSpeed === "fast" ? "bg-primary text-primary-foreground font-bold" : ""}`}
              >
                Fast
              </Button>
              <Button
                size="sm"
                variant={particleSpeed === "off" ? "default" : "outline"}
                onClick={() => setParticleSpeed("off")}
                className={`h-6 px-2 text-[10px] font-mono ${particleSpeed === "off" ? "bg-primary text-primary-foreground font-bold" : ""}`}
              >
                Off
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
