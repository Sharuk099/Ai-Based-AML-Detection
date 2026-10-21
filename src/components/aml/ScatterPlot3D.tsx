// @ts-nocheck -- strict index checks relaxed for numeric ML code
import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import * as THREE from "three";
import {
  RotateCcw,
  Camera,
  Download,
  Printer,
  ShieldAlert,
  Sliders,
  Filter,
  Eye,
  Crosshair,
  Sparkles,
  Info,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Search,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface ScatterPoint {
  id: string;
  rowIndex: number;
  fromAccount: string;
  toAccount: string;
  amount: number;
  riskScore: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW" | "NORMAL";
  typology: string;
  velocity: number;
  timestamp?: string;
  isOutlier: boolean;
  outlierScore: number; // 0 to 100
  outlierReason: string;
  isNormal: boolean;
  // 3D coordinates in range [-80, 80]
  x: number;
  y: number;
  z: number;
}

interface ScatterPlot3DProps {
  records?: any[];
  currencySymbol?: string;
  onSelectRecord?: (record: any) => void;
  onJumpToTab?: (tab: string) => void;
}

// ---------------------------------------------------------------------------
// 3D SCENE SUB-COMPONENTS
// ---------------------------------------------------------------------------

// 3D Bounding Wireframe & Axes with Tick Labels
function AxesAndGrid({
  xLabel = "Transaction Amount",
  yLabel = "AML Risk Score",
  zLabel = "Velocity / Frequency",
  currencySymbol = "$",
  minAmt = 0,
  maxAmt = 100000,
}: {
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  currencySymbol?: string;
  minAmt?: number;
  maxAmt?: number;
}) {
  const boxSize = 160; // [-80, 80]
  const half = boxSize / 2;

  return (
    <group>
      {/* 1. Floor Grid (Y = -80) */}
      <gridHelper args={[boxSize, 16, 0x334155, 0x1e293b]} position={[0, -half, 0]} />

      {/* 2. Coordinate Axis Lines */}
      {/* X Axis: Left to Right (Amount) - Bright Cyan/Red */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geo) => {
            geo.setFromPoints([
              new THREE.Vector3(-half, -half, -half),
              new THREE.Vector3(half, -half, -half),
            ]);
          }}
        />
        <lineBasicMaterial attach="material" color="#38bdf8" linewidth={2} />
      </line>

      {/* Y Axis: Bottom to Top (Risk Score) - Ruby/Rose */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geo) => {
            geo.setFromPoints([
              new THREE.Vector3(-half, -half, -half),
              new THREE.Vector3(-half, half, -half),
            ]);
          }}
        />
        <lineBasicMaterial attach="material" color="#f43f5e" linewidth={2} />
      </line>

      {/* Z Axis: Front to Back (Velocity / Frequency) - Emerald */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geo) => {
            geo.setFromPoints([
              new THREE.Vector3(-half, -half, -half),
              new THREE.Vector3(-half, -half, half),
            ]);
          }}
        />
        <lineBasicMaterial attach="material" color="#10b981" linewidth={2} />
      </line>

      {/* 3. Subtle Back & Side Wall Wireframe Grids */}
      <gridHelper
        args={[boxSize, 16, 0x1e293b, 0x0f172a]}
        position={[0, 0, -half]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <gridHelper
        args={[boxSize, 16, 0x1e293b, 0x0f172a]}
        position={[-half, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      />

      {/* 4. Axis Labels */}
      {/* X Axis Label (Amount) */}
      <Text
        position={[0, -half - 12, -half]}
        fontSize={6.5}
        color="#38bdf8"
        anchorX="center"
        anchorY="top"
        font="monospace"
        fontWeight="bold"
      >
        {`X: ${xLabel} (${currencySymbol})`}
      </Text>
      <Text
        position={[-half, -half - 6, -half]}
        fontSize={4.5}
        color="#94a3b8"
        anchorX="center"
        anchorY="top"
      >
        {`${currencySymbol}${minAmt < 1000 ? minAmt : (minAmt / 1000).toFixed(0) + "k"}`}
      </Text>
      <Text
        position={[half, -half - 6, -half]}
        fontSize={4.5}
        color="#94a3b8"
        anchorX="center"
        anchorY="top"
      >
        {`${currencySymbol}${maxAmt >= 1e6 ? (maxAmt / 1e6).toFixed(1) + "M" : (maxAmt / 1000).toFixed(0) + "k"}`}
      </Text>

      {/* Y Axis Label (Risk Score) */}
      <Text
        position={[-half - 16, 0, -half]}
        rotation={[0, 0, Math.PI / 2]}
        fontSize={6.5}
        color="#f43f5e"
        anchorX="center"
        anchorY="bottom"
        font="monospace"
        fontWeight="bold"
      >
        {`Y: ${yLabel} (0% → 100%)`}
      </Text>
      <Text
        position={[-half - 6, -half, -half]}
        fontSize={4.5}
        color="#10b981"
        anchorX="right"
        anchorY="middle"
      >
        0% Normal
      </Text>
      <Text
        position={[-half - 6, 0, -half]}
        fontSize={4.5}
        color="#f59e0b"
        anchorX="right"
        anchorY="middle"
      >
        50% Suspicious
      </Text>
      <Text
        position={[-half - 6, half, -half]}
        fontSize={4.5}
        color="#ef4444"
        anchorX="right"
        anchorY="middle"
      >
        100% Critical Alert
      </Text>

      {/* Z Axis Label (Velocity) */}
      <Text
        position={[-half - 10, -half, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={6.5}
        color="#10b981"
        anchorX="center"
        anchorY="top"
        font="monospace"
        fontWeight="bold"
      >
        {`Z: ${zLabel}`}
      </Text>
      <Text
        position={[-half - 4, -half, -half]}
        fontSize={4.5}
        color="#94a3b8"
        anchorX="right"
        anchorY="middle"
      >
        Low (1x)
      </Text>
      <Text
        position={[-half - 4, -half, half]}
        fontSize={4.5}
        color="#94a3b8"
        anchorX="right"
        anchorY="middle"
      >
        High Velocity
      </Text>

      {/* Critical Anomaly Zone Threshold Indicator Plane (Y = 32, i.e. Risk >= 70%) */}
      <group position={[0, 32, 0]}>
        <line>
          <bufferGeometry
            attach="geometry"
            onUpdate={(geo) => {
              geo.setFromPoints([
                new THREE.Vector3(-half, 0, -half),
                new THREE.Vector3(half, 0, -half),
                new THREE.Vector3(half, 0, half),
                new THREE.Vector3(-half, 0, half),
                new THREE.Vector3(-half, 0, -half),
              ]);
            }}
          />
          <lineDashedMaterial
            attach="material"
            color="#ef4444"
            dashSize={4}
            gapSize={3}
            linewidth={1}
            transparent
            opacity={0.4}
          />
        </line>
        <Text
          position={[half - 4, 3, half - 4]}
          fontSize={4}
          color="#f87171"
          anchorX="right"
          anchorY="bottom"
        >
          ▲ AML Alert Threshold (70%)
        </Text>
      </group>
    </group>
  );
}

// Single Animated Outlier Beacon Halo
function OutlierHalo({ point }: { point: ScatterPoint }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.x += delta * 1.5;
      ringRef.current.rotation.y += delta * 2.0;
    }
  });

  return (
    <group position={[point.x, point.y, point.z]}>
      {/* Rotating Wireframe Halo */}
      <mesh ref={ringRef}>
        <torusGeometry args={[point.isOutlier ? 4.8 : 3.6, 0.25, 8, 24]} />
        <meshBasicMaterial
          color={point.riskScore >= 0.7 ? "#ef4444" : "#f59e0b"}
          wireframe
          transparent
          opacity={0.8}
        />
      </mesh>
      {/* Vertical Warning Drop Line to Floor */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(geo) => {
            geo.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -80 - point.y, 0)]);
          }}
        />
        <lineDashedMaterial
          attach="material"
          color={point.riskScore >= 0.7 ? "#ef4444" : "#f59e0b"}
          dashSize={3}
          gapSize={3}
          transparent
          opacity={0.35}
        />
      </line>
    </group>
  );
}

// Render All 3D Scatter Points with Interaction
function PointsLayer({
  points,
  selectedPoint,
  hoveredPoint,
  onHover,
  onSelect,
}: {
  points: ScatterPoint[];
  selectedPoint: ScatterPoint | null;
  hoveredPoint: ScatterPoint | null;
  onHover: (p: ScatterPoint | null) => void;
  onSelect: (p: ScatterPoint) => void;
}) {
  return (
    <group>
      {points.map((p) => {
        const isSelected = selectedPoint?.id === p.id;
        const isHovered = hoveredPoint?.id === p.id;

        // Size determination: Outliers are larger and prominent
        let radius = p.isOutlier ? 3.4 : 1.8;
        if (isSelected) radius = 5.0;
        else if (isHovered) radius = 4.0;

        // Color determination: Clear contrast between AML crimes & normal transactions
        let color = "#10b981"; // Emerald for normal
        let emissive = "#064e3b";
        let emissiveIntensity = 0.2;

        if (p.riskScore >= 0.75 || p.isOutlier) {
          color = "#ef4444"; // Crimson for high risk AML alert
          emissive = "#b91c1c";
          emissiveIntensity = 0.8;
        } else if (p.riskScore >= 0.45) {
          color = "#f59e0b"; // Amber for medium risk
          emissive = "#d97706";
          emissiveIntensity = 0.5;
        } else if (p.isNormal) {
          color = "#10b981";
          emissive = "#047857";
          emissiveIntensity = 0.2;
        }

        if (isSelected) {
          color = "#38bdf8"; // Cyan focus
          emissive = "#0284c7";
          emissiveIntensity = 1.0;
        }

        return (
          <group key={p.id} position={[p.x, p.y, p.z]}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onSelect(p);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHover(p);
              }}
              onPointerOut={() => onHover(null)}
            >
              <sphereGeometry args={[radius, 16, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={emissiveIntensity}
                roughness={0.2}
                metalness={0.4}
              />
            </mesh>

            {/* If selected or hovered, show an interactive 3D text badge */}
            {(isSelected || isHovered) && (
              <Html
                position={[0, radius + 2, 0]}
                center
                distanceFactor={180}
                style={{ pointerEvents: "none" }}
              >
                <div className="bg-slate-900/95 border border-primary/60 text-white rounded px-2.5 py-1 text-[11px] font-mono shadow-xl whitespace-nowrap backdrop-blur-md">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        p.riskScore >= 0.7
                          ? "bg-red-500"
                          : p.riskScore >= 0.4
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                    />
                    <span>{p.typology || "Transaction"}</span>
                    <span className="text-primary font-mono">
                      {(p.riskScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    ID: {p.id} · Amt: {p.amount.toLocaleString()}
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {/* Render Halos for all flagged Outliers */}
      {points
        .filter((p) => p.isOutlier)
        .map((p) => (
          <OutlierHalo key={`halo-${p.id}`} point={p} />
        ))}
    </group>
  );
}

// Camera View Controller Component
function CameraController({
  viewMode,
  controlsRef,
}: {
  viewMode: "iso" | "front" | "side" | "top";
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    if (!controlsRef.current) return;

    if (viewMode === "iso") {
      camera.position.set(130, 95, 145);
      controlsRef.current.target.set(0, 0, 0);
    } else if (viewMode === "front") {
      // Amount (X) vs Risk Score (Y)
      camera.position.set(0, 0, 220);
      controlsRef.current.target.set(0, 0, 0);
    } else if (viewMode === "side") {
      // Velocity (Z) vs Risk Score (Y)
      camera.position.set(220, 0, 0);
      controlsRef.current.target.set(0, 0, 0);
    } else if (viewMode === "top") {
      // Amount (X) vs Velocity (Z)
      camera.position.set(0, 230, 0);
      controlsRef.current.target.set(0, 0, 0);
    }

    controlsRef.current.update();
  }, [viewMode, camera, controlsRef]);

  return null;
}

// ---------------------------------------------------------------------------
// MAIN 3D SCATTER PLOT COMPONENT
// ---------------------------------------------------------------------------

export function ScatterPlot3D({
  records = [],
  currencySymbol = "$",
  onSelectRecord,
  onJumpToTab,
}: ScatterPlot3DProps) {
  // State for camera preset
  const [viewMode, setViewMode] = useState<"iso" | "front" | "side" | "top">("iso");

  // State for filters
  const [filterMode, setFilterMode] = useState<"all" | "outliers" | "high_risk" | "normal">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [minRiskThreshold, setMinRiskThreshold] = useState<number>(0);
  const [selectedTypology, setSelectedTypology] = useState<string>("ALL");

  // Interaction State
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPoint | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<ScatterPoint | null>(null);
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);

  // Three.js References
  const controlsRef = useRef<any>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Compute 3D Scatter Points and Outliers from records
  const { allPoints, stats } = useMemo(() => {
    if (!records || records.length === 0) {
      return { allPoints: [], stats: { minAmt: 0, maxAmt: 1000, outlierCount: 0 } };
    }

    // Extract amounts and calculate min/max
    const amounts = records.map((r) => Number(r["amount"] || 0));
    const minAmt = Math.min(...amounts, 0);
    const maxAmt = Math.max(...amounts, 1000);

    // Compute Log scale helper for Amount (X axis) to prevent extreme skew
    const logMin = Math.log10(Math.max(1, minAmt));
    const logMax = Math.log10(Math.max(10, maxAmt));

    // Calculate mean and std deviation for amount outlier detection
    const meanAmt = amounts.reduce((a, b) => a + b, 0) / (amounts.length || 1);
    const stdAmt =
      Math.sqrt(
        amounts.reduce((sum, val) => sum + Math.pow(val - meanAmt, 2), 0) / (amounts.length || 1),
      ) || 1;

    // Detect sender velocity (transaction count per sender)
    const senderCounts: Record<string, number> = {};
    records.forEach((r) => {
      const sender = String(r["from_account"] || "");
      if (sender) senderCounts[sender] = (senderCounts[sender] || 0) + 1;
    });

    const maxVelocity = Math.max(...Object.values(senderCounts), 1);

    const points: ScatterPoint[] = records.map((r, idx) => {
      const amt = Number(r["amount"] || 0);
      const risk = Number(r["_risk_score"] ?? r["risk_score"] ?? 0);
      const sender = String(r["from_account"] || "ACC-UNKNOWN");
      const receiver = String(r["to_account"] || "ACC-UNKNOWN");
      const vel = senderCounts[sender] || 1;
      const typology =
        r["_crime_typology"] ||
        r["_predicted_class"] ||
        r["typology"] ||
        (risk >= 0.7 ? "Suspicious Flow" : "Normal Transaction");
      const isNormal =
        r["_is_normal"] === true ||
        typology.toLowerCase().includes("normal") ||
        typology.toLowerCase().includes("cleared") ||
        risk < 0.25;

      // 1. Compute 3D Coordinates [-80, 80]
      // X Axis: Amount (Log Scaled for intuitive banking view)
      const amtLog = Math.log10(Math.max(1, amt));
      const normX = logMax > logMin ? (amtLog - logMin) / (logMax - logMin) : 0.5;
      const x = -80 + normX * 160;

      // Y Axis: AML Risk Score (0.0 to 1.0 mapped to [-80, 80])
      const y = -80 + risk * 160;

      // Z Axis: Velocity / Frequency (mapped to [-80, 80])
      const normZ = maxVelocity > 1 ? (vel - 1) / (maxVelocity - 1) : 0;
      const z = -80 + normZ * 160;

      // 2. Outlier Analysis
      const zScoreAmt = (amt - meanAmt) / stdAmt;
      const isAmountOutlier = zScoreAmt > 2.0 || amt > meanAmt * 3;
      const isHighRisk = risk >= 0.7;
      const isLoop = /cycle|ring|circular|layering/i.test(typology);
      const isMule = /mule|funnel|passthrough/i.test(typology);
      const isStructuring = /structuring|smurfing/i.test(typology);

      let isOutlier = false;
      let outlierScore = 0;
      let outlierReason = "";

      if (isHighRisk && isAmountOutlier) {
        isOutlier = true;
        outlierScore = 95;
        outlierReason = `Critical Outlier: Extreme Amount (${currencySymbol}${amt.toLocaleString()}) combined with ${Math.round(risk * 100)}% AML Risk Score.`;
      } else if (isLoop) {
        isOutlier = true;
        outlierScore = 90;
        outlierReason = `Topological Outlier: Part of detected circular layering ring.`;
      } else if (isHighRisk && vel > 3) {
        isOutlier = true;
        outlierScore = 85;
        outlierReason = `Velocity Outlier: High frequency rapid flow (${vel} transactions) with elevated risk.`;
      } else if (isStructuring) {
        isOutlier = true;
        outlierScore = 80;
        outlierReason = `Behavioral Outlier: Just-below-threshold structuring pattern identified.`;
      } else if (isHighRisk) {
        isOutlier = true;
        outlierScore = 75;
        outlierReason = `Model Alert: High probability crime prediction (${(risk * 100).toFixed(0)}%).`;
      } else if (isAmountOutlier) {
        isOutlier = true;
        outlierScore = 60;
        outlierReason = `Statistical Outlier: Amount is +${zScoreAmt.toFixed(1)}σ above dataset average.`;
      }

      return {
        id: String(r["_row_id"] || `TX-${idx + 1}`),
        rowIndex: idx,
        fromAccount: sender,
        toAccount: receiver,
        amount: amt,
        riskScore: risk,
        riskLevel: isHighRisk ? "HIGH" : risk >= 0.45 ? "MEDIUM" : "NORMAL",
        typology,
        velocity: vel,
        timestamp: r["timestamp"] ? String(r["timestamp"]) : undefined,
        isOutlier,
        outlierScore,
        outlierReason,
        isNormal,
        x,
        y,
        z,
      };
    });

    const outlierCount = points.filter((p) => p.isOutlier).length;

    return {
      allPoints: points,
      stats: { minAmt, maxAmt, outlierCount },
    };
  }, [records, currencySymbol]);

  // Unique typologies for filter dropdown
  const typologies = useMemo(() => {
    const set = new Set<string>();
    allPoints.forEach((p) => {
      if (p.typology) set.add(p.typology);
    });
    return Array.from(set).sort();
  }, [allPoints]);

  // Filtered Points based on investigator controls
  const filteredPoints = useMemo(() => {
    return allPoints.filter((p) => {
      // 1. Filter Mode
      if (filterMode === "outliers" && !p.isOutlier) return false;
      if (filterMode === "high_risk" && p.riskScore < 0.7) return false;
      if (filterMode === "normal" && !p.isNormal && p.riskScore >= 0.4) return false;

      // 2. Risk threshold
      if (p.riskScore * 100 < minRiskThreshold) return false;

      // 3. Typology filter
      if (selectedTypology !== "ALL" && p.typology !== selectedTypology) return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = p.id.toLowerCase().includes(q);
        const matchesSender = p.fromAccount.toLowerCase().includes(q);
        const matchesReceiver = p.toAccount.toLowerCase().includes(q);
        const matchesTypology = p.typology.toLowerCase().includes(q);
        if (!matchesId && !matchesSender && !matchesReceiver && !matchesTypology) {
          return false;
        }
      }

      return true;
    });
  }, [allPoints, filterMode, minRiskThreshold, selectedTypology, searchQuery]);

  // Priority outliers for list display
  const topOutliers = useMemo(() => {
    return [...allPoints]
      .filter((p) => p.isOutlier)
      .sort((a, b) => b.outlierScore - a.outlierScore || b.riskScore - a.riskScore)
      .slice(0, 10);
  }, [allPoints]);

  // Point Selection
  const handleSelectPoint = (point: ScatterPoint) => {
    setSelectedPoint(point);
    if (onSelectRecord) {
      const originalRecord = records[point.rowIndex] || {
        _row_id: point.id,
        amount: point.amount,
        from_account: point.fromAccount,
        to_account: point.toAccount,
        _risk_score: point.riskScore,
        _crime_typology: point.typology,
      };
      onSelectRecord(originalRecord);
    }
  };

  // 1. SAVE SCATTER AS PNG IMAGE (Direct Clean Download)
  const handleSavePng = () => {
    try {
      const canvas = canvasContainerRef.current?.querySelector("canvas");
      if (!canvas) {
        toast.error("WebGL canvas not found");
        return;
      }
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `AML_3D_Scatter_Plot_${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("3D Scatter Plot image saved successfully!");
    } catch (e) {
      console.error("Save image failed", e);
      toast.error("Failed to export image snapshot");
    }
  };

  // 2. EXPORT OUTLIERS CSV
  const handleExportCsv = () => {
    try {
      const outliers = allPoints.filter((p) => p.isOutlier);
      if (outliers.length === 0) {
        toast.info("No outliers detected to export");
        return;
      }

      const headers = [
        "tx_id",
        "from_account",
        "to_account",
        "amount",
        "risk_score_pct",
        "risk_level",
        "typology",
        "velocity",
        "outlier_score",
        "outlier_reason",
      ];

      const rows = outliers.map((p) => [
        `"${p.id}"`,
        `"${p.fromAccount}"`,
        `"${p.toAccount}"`,
        p.amount,
        (p.riskScore * 100).toFixed(1),
        `"${p.riskLevel}"`,
        `"${p.typology}"`,
        p.velocity,
        p.outlierScore,
        `"${p.outlierReason.replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `AML_Outlier_Transactions_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported ${outliers.length} AML outlier transactions to CSV!`);
    } catch (e) {
      console.error("Export CSV failed", e);
      toast.error("Failed to export outliers CSV");
    }
  };

  // 3. PRINT SCATTER DOSSIER (Robust Multi-Method: Hidden iframe + HTML Download Fallback)
  const handlePrintDossier = () => {
    try {
      let canvasDataUrl = "";
      const canvas = canvasContainerRef.current?.querySelector("canvas");
      if (canvas) {
        try {
          canvasDataUrl = canvas.toDataURL("image/png");
        } catch (err) {
          console.warn("Canvas export skipped:", err);
        }
      }

      const outliers = allPoints.filter((p) => p.isOutlier).slice(0, 25);
      const outlierRows = outliers
        .map(
          (p) => `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:bold;">${p.id}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${p.fromAccount}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${p.toAccount}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">${currencySymbol}${p.amount.toLocaleString()}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#b91c1c;font-weight:bold;">${p.typology}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#b91c1c;">${(p.riskScore * 100).toFixed(0)}%</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569;">${p.outlierReason}</td>
        </tr>`,
        )
        .join("");

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AML 3D Scatter Plot Outlier Intelligence Dossier</title>
  <style>
    @page { size: letter; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
    h1 { font-size: 18px; text-transform: uppercase; margin: 0 0 4px 0; }
    .tag { display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; }
    .kpi-val { font-size: 18px; font-weight: bold; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; font-family: monospace; font-size: 11px; margin-top: 16px; }
    th { background: #f1f5f9; padding: 8px 10px; text-align: left; border-bottom: 2px solid #cbd5e1; }
    @media print { .no-print { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print" style="background:#0284c7;color:white;padding:12px 20px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
    <b>AML 3D Scatter Plot Intelligence Dossier Ready</b>
    <button onclick="window.print()" style="background:white;color:#0284c7;border:none;padding:8px 16px;border-radius:4px;font-weight:bold;cursor:pointer;">Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <h1>AML 3D Scatter Plot & Outlier Intelligence Dossier</h1>
      <div style="font-size:12px;color:#475569;">Financial Crime Machine Learning & Statistical Outlier Inspection</div>
      <div class="tag">CONFIDENTIAL · COMPLIANCE EVIDENCE</div>
    </div>
    <div style="font-size:11px;font-family:monospace;color:#64748b;text-align:right;">
      Date: ${new Date().toLocaleDateString()}<br>
      Total Plotted: ${allPoints.length.toLocaleString()}<br>
      Outliers Flagged: ${stats.outlierCount}
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi">
      <div style="font-size:11px;color:#64748b;">TOTAL AUDITED</div>
      <div class="kpi-val">${allPoints.length.toLocaleString()}</div>
    </div>
    <div class="kpi">
      <div style="font-size:11px;color:#64748b;">AML OUTLIERS</div>
      <div class="kpi-val" style="color:#b91c1c;">${stats.outlierCount}</div>
    </div>
    <div class="kpi">
      <div style="font-size:11px;color:#64748b;">HIGH RISK (&gt;70%)</div>
      <div class="kpi-val" style="color:#b91c1c;">${allPoints.filter((p) => p.riskScore >= 0.7).length}</div>
    </div>
    <div class="kpi">
      <div style="font-size:11px;color:#64748b;">VERIFIED NORMAL</div>
      <div class="kpi-val" style="color:#15803d;">${allPoints.filter((p) => p.isNormal).length}</div>
    </div>
  </div>

  ${
    canvasDataUrl
      ? `<div style="text-align:center;margin:16px 0;border:1px solid #e2e8f0;padding:8px;border-radius:6px;background:#020617;">
           <img src="${canvasDataUrl}" style="max-width:100%;height:auto;max-height:340px;border-radius:4px;" />
           <div style="font-size:10px;color:#94a3b8;margin-top:4px;">3D Scatter Projection: Amount (X) × Risk Probability (Y) × Velocity (Z)</div>
         </div>`
      : ""
  }

  <h3 style="font-size:13px;text-transform:uppercase;margin:20px 0 8px 0;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">
    Priority AML Outliers Identified (Statistical + Typology Anomalies)
  </h3>
  <table>
    <thead>
      <tr>
        <th>Tx ID</th>
        <th>From Account</th>
        <th>To Account</th>
        <th style="text-align:right;">Amount</th>
        <th>Typology</th>
        <th style="text-align:right;">Risk</th>
        <th>Outlier Factor</th>
      </tr>
    </thead>
    <tbody>
      ${outlierRows}
    </tbody>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;

      // Hidden iframe print attempt
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            toast.success("Print dialog opened!");
          } catch (err) {
            console.warn("Iframe print blocked, falling back to download", err);
            downloadHtmlReport(html);
          } finally {
            setTimeout(() => {
              if (document.body.contains(iframe)) document.body.removeChild(iframe);
            }, 3000);
          }
        }, 300);
        return;
      }
      downloadHtmlReport(html);
    } catch (e) {
      console.error("Print dossier failed", e);
      toast.error("Failed to generate print dossier");
    }
  };

  const downloadHtmlReport = (html: string) => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `AML_3D_Scatter_Report_${Date.now()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Printable 3D Scatter Report downloaded!");
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Actions Strip */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>3D Multi-Dimensional Transaction Scatter Plot</span>
            </h2>
            <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[10px] font-mono text-primary font-bold">
              React-Three-Fiber WebGL
            </span>
            <span className="rounded bg-destructive/10 border border-destructive/30 px-2 py-0.5 text-[10px] font-mono text-destructive font-bold">
              {stats.outlierCount} Outliers Identified
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Rotate (Left-click drag), Zoom (Wheel/Pinch), and Pan (Right-click drag) to inspect
            transactions in 3D coordinate space. Outliers are flagged with animated glowing beacons.
          </p>
        </div>

        {/* Action Buttons: Save PNG, Export CSV, Print */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSavePng}
            className="h-8 text-xs font-medium border-border/80 hover:bg-primary/10 hover:text-primary"
            title="Download PNG screenshot of 3D scatter plot"
          >
            <Download className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Save Plot (PNG)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            className="h-8 text-xs font-medium border-border/80 hover:bg-primary/10 hover:text-primary"
            title="Export detected outliers to CSV file"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Export Outliers CSV
          </Button>

          <Button
            size="sm"
            onClick={handlePrintDossier}
            className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            title="Generate printable PDF/HTML investigation dossier"
          >
            <Printer className="mr-1.5 h-3.5 w-3.5 fill-current" />
            Print / Save Dossier
          </Button>
        </div>
      </div>

      {/* 2. Controls & Filters Ribbon */}
      <div className="bg-card border border-border rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* View Filter Modes */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            <div className="flex rounded-md bg-muted/60 p-0.5 font-mono text-[11px]">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-2.5 py-1 rounded transition-all ${
                  filterMode === "all"
                    ? "bg-card text-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({allPoints.length})
              </button>
              <button
                onClick={() => setFilterMode("outliers")}
                className={`px-2.5 py-1 rounded transition-all ${
                  filterMode === "outliers"
                    ? "bg-destructive text-destructive-foreground font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ★ Outliers Only ({stats.outlierCount})
              </button>
              <button
                onClick={() => setFilterMode("high_risk")}
                className={`px-2.5 py-1 rounded transition-all ${
                  filterMode === "high_risk"
                    ? "bg-amber-600 text-white font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                High Risk ({allPoints.filter((p) => p.riskScore >= 0.7).length})
              </button>
              <button
                onClick={() => setFilterMode("normal")}
                className={`px-2.5 py-1 rounded transition-all ${
                  filterMode === "normal"
                    ? "bg-emerald-600 text-white font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Normal ({allPoints.filter((p) => p.isNormal).length})
              </button>
            </div>
          </div>

          {/* Camera View Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Camera className="h-3 w-3" /> Camera:
            </span>
            <div className="flex rounded-md bg-muted/60 p-0.5 font-mono text-[11px]">
              <button
                onClick={() => setViewMode("iso")}
                className={`px-2 py-1 rounded transition-all ${
                  viewMode === "iso"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="3D Isometric Perspective"
              >
                3D Perspective
              </button>
              <button
                onClick={() => setViewMode("front")}
                className={`px-2 py-1 rounded transition-all ${
                  viewMode === "front"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Front View: Amount (X) vs Risk Score (Y)"
              >
                Amount vs Risk
              </button>
              <button
                onClick={() => setViewMode("side")}
                className={`px-2 py-1 rounded transition-all ${
                  viewMode === "side"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Side View: Velocity (Z) vs Risk Score (Y)"
              >
                Velocity vs Risk
              </button>
              <button
                onClick={() => setViewMode("top")}
                className={`px-2 py-1 rounded transition-all ${
                  viewMode === "top"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Top View: Amount (X) vs Velocity (Z)"
              >
                Amount vs Velocity
              </button>
            </div>
          </div>
        </div>

        {/* Second Row: Typology Dropdown, Risk Slider, Account Search */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/50 text-xs">
          {/* Typology Filter */}
          <div>
            <label className="text-[10px] uppercase font-mono text-muted-foreground block mb-1">
              Typology Filter
            </label>
            <select
              value={selectedTypology}
              onChange={(e) => setSelectedTypology(e.target.value)}
              className="w-full h-8 px-2 rounded border border-border bg-background text-foreground text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Typologies ({allPoints.length})</option>
              {typologies.map((t) => (
                <option key={t} value={t}>
                  {t} ({allPoints.filter((p) => p.typology === t).length})
                </option>
              ))}
            </select>
          </div>

          {/* Min Risk Score Threshold */}
          <div>
            <div className="flex justify-between items-center mb-1 text-[10px] font-mono text-muted-foreground">
              <span>MIN RISK THRESHOLD:</span>
              <span className="font-bold text-foreground">{minRiskThreshold}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={minRiskThreshold}
              onChange={(e) => setMinRiskThreshold(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          {/* Search Account or Tx ID */}
          <div>
            <label className="text-[10px] uppercase font-mono text-muted-foreground block mb-1">
              Search Tx ID / Account
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter by account or TX ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. The 3D Canvas Viewport */}
      <div
        ref={canvasContainerRef}
        className="relative w-full h-[620px] bg-slate-950 rounded-xl overflow-hidden border border-border/80 shadow-2xl"
      >
        <Canvas
          gl={{
            preserveDrawingBuffer: true,
            antialias: true,
            powerPreference: "high-performance",
          }}
          camera={{ position: [130, 95, 145], fov: 45 }}
        >
          {/* Lighting Rig */}
          <ambientLight intensity={0.8} />
          <directionalLight position={[100, 150, 80]} intensity={1.2} />
          <pointLight position={[-40, 80, -40]} intensity={2.0} color="#f43f5e" distance={300} />
          <pointLight position={[60, -40, 60]} intensity={1.5} color="#38bdf8" distance={300} />

          {/* Orbit Controls for Rotating, Zooming, Panning */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.06}
            maxDistance={500}
            minDistance={40}
          />

          {/* Camera View Mode Synchronization */}
          <CameraController viewMode={viewMode} controlsRef={controlsRef} />

          {/* 3D Coordinate System, Grids, and Ticks */}
          <AxesAndGrid
            xLabel="Transaction Amount"
            yLabel="AML Risk Score"
            zLabel="Velocity / Frequency"
            currencySymbol={currencySymbol}
            minAmt={stats.minAmt}
            maxAmt={stats.maxAmt}
          />

          {/* Scatter Points & Outlier Halos */}
          <PointsLayer
            points={filteredPoints}
            selectedPoint={selectedPoint}
            hoveredPoint={hoveredPoint}
            onHover={setHoveredPoint}
            onSelect={handleSelectPoint}
          />
        </Canvas>

        {/* On-Canvas Overlay: Interactive Legend */}
        <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 backdrop-blur-md text-xs font-mono text-slate-300 shadow-lg pointer-events-auto">
          <div className="font-bold text-white text-[11px] mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>3D SPATIAL ENCODING</span>
          </div>
          <div className="space-y-1 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
              <span className="text-white font-medium">Critical AML Alert (&gt;75% / Outlier)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
              <span className="text-slate-300">Suspicious Anomaly (45%–75%)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span className="text-slate-300">Verified Normal Flow (&lt;25%)</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
              <span className="h-2.5 w-2.5 rounded-full border border-red-500 bg-transparent animate-spin" />
              <span className="text-red-400 font-bold">Halo: Active Outlier Beacon</span>
            </div>
          </div>
        </div>

        {/* On-Canvas Overlay: Coordinate Indicator */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 rounded px-2.5 py-1 text-[10px] font-mono text-slate-400 backdrop-blur-md">
          <span>X: Amount (Log)</span>
          <span className="mx-2">·</span>
          <span>Y: AML Risk Score</span>
          <span className="mx-2">·</span>
          <span>Z: Frequency / Velocity</span>
        </div>

        {/* On-Canvas Overlay: Points Count */}
        <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-800 rounded px-2.5 py-1 text-[11px] font-mono text-white backdrop-blur-md">
          <span className="text-primary font-bold">{filteredPoints.length}</span> /{" "}
          <span>{allPoints.length}</span> points shown
        </div>

        {/* Floating Selected Outlier Dossier Popover (Bottom-Right) */}
        {selectedPoint && (
          <div className="absolute bottom-3 right-3 max-w-sm w-full bg-slate-900/95 border border-primary/60 rounded-xl p-4 shadow-2xl backdrop-blur-md text-white text-xs space-y-3 font-mono animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      selectedPoint.riskScore >= 0.7
                        ? "bg-destructive text-destructive-foreground"
                        : selectedPoint.riskScore >= 0.45
                          ? "bg-amber-600 text-white"
                          : "bg-emerald-600 text-white"
                    }`}
                  >
                    {selectedPoint.riskLevel}
                  </span>
                  <span className="font-bold text-sm text-foreground text-white">
                    {selectedPoint.id}
                  </span>
                </div>
                <div className="text-[11px] text-red-400 font-bold mt-0.5">
                  {selectedPoint.typology}
                </div>
              </div>
              <button
                onClick={() => setSelectedPoint(null)}
                className="text-slate-400 hover:text-white p-1"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Outlier Alert Explanation */}
            {selectedPoint.isOutlier && (
              <div className="bg-destructive/15 border border-destructive/40 rounded p-2 text-[11px] text-red-300">
                <div className="font-bold flex items-center gap-1.5 mb-1 text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Outlier Detection Factor ({selectedPoint.outlierScore}/100)</span>
                </div>
                <div>{selectedPoint.outlierReason}</div>
              </div>
            )}

            {/* Key Dimensions */}
            <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/60 p-2 rounded border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">
                  Transaction Amount:
                </span>
                <span className="font-bold text-primary text-sm">
                  {currencySymbol}
                  {selectedPoint.amount.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">
                  AML Risk Probability:
                </span>
                <span className="font-bold text-red-400 text-sm">
                  {(selectedPoint.riskScore * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">From Account:</span>
                <span className="font-bold text-white truncate block">
                  {selectedPoint.fromAccount}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px] uppercase">To Account:</span>
                <span className="font-bold text-white truncate block">
                  {selectedPoint.toAccount}
                </span>
              </div>
            </div>

            {/* Jump Navigation Buttons */}
            <div className="flex items-center gap-2 pt-1">
              {onJumpToTab && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onJumpToTab("results")}
                    className="flex-1 h-7 text-[10px] font-mono border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    View in Results
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onJumpToTab("explain")}
                    className="flex-1 h-7 text-[10px] font-mono bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                  >
                    Inspect XAI & Report
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. Top Outliers Quick Inspector Strip */}
      {topOutliers.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
              <Crosshair className="h-3.5 w-3.5 text-primary" />
              <span>Priority AML Outliers Identified</span>
              <span className="text-[10px] text-muted-foreground font-normal">
                (Click any transaction outlier below to focus in 3D)
              </span>
            </h3>
            <span className="text-[10px] font-mono text-muted-foreground">
              Ranked by Multidimensional Anomaly Score
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {topOutliers.map((p) => {
              const isSelected = selectedPoint?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPoint(p)}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? "bg-primary/10 border-primary shadow-sm"
                      : "bg-background border-border/70 hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      {p.id}
                    </span>
                    <span className="font-mono font-bold text-primary">
                      {currencySymbol}
                      {p.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-red-500 font-medium truncate mb-1">
                    {p.typology}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span>
                      {p.fromAccount} → {p.toAccount}
                    </span>
                    <span className="font-bold text-red-500">
                      {(p.riskScore * 100).toFixed(0)}% Risk
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
