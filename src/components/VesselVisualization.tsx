// src/components/VesselVisualization.tsx
import React, { useState, useRef } from "react";

interface Vessel {
  id: string;
  type: "Cold Plunge" | "Hot Tub";
  name: string;
  length_ft: number;
  width_ft: number;
  waterDepth_ft: number;
  wallHeight_ft: number;
  hasBench: boolean;
  benchLength_ft: number;
  benchDepth_ft: number;
  benchHeight_ft: number;
  hasSteps: boolean;
  stepsWidth_ft: number;
  stepsCount: number;
  stepRiser_ft: number;
  stepTread_ft: number;
  eps_wall_thickness_ft: number;
  eps_floor_thickness_ft: number;
  // New properties for multiple elements
  benches?: BenchElement[];
  steps?: StepsElement[];
}

type Rotation = "N" | "E" | "S" | "W";

interface BenchElement {
  id: string;
  x: number; // feet from left
  y: number; // feet from top
  length_ft: number;
  depth_ft: number;
  height_ft: number;
  rotation: Rotation;
}

interface StepsElement {
  id: string;
  x: number; // feet from left
  y: number; // feet from top
  width_ft: number;
  count: number;
  tread_ft: number;
  riser_ft: number;
  rotation: Rotation;
  autoSize?: boolean;
}

interface VesselVisualizationProps {
  vessel: Vessel;
  constructionType: "EPS" | "Stainless Steel";
  onVesselUpdate: (updates: Partial<Vessel>) => void;
}

type ElementType = "bench" | "steps";

interface SelectedElement {
  type: ElementType;
  id: string;
}

const VesselVisualization: React.FC<VesselVisualizationProps> = ({
  vessel,
  constructionType,
  onVesselUpdate,
}) => {
  // Migrate old format to new format
  const [benches, setBenches] = useState<BenchElement[]>(() => {
    if (vessel.benches && vessel.benches.length > 0) {
      return vessel.benches;
    }
    if (vessel.hasBench) {
      return [{
        id: "bench-1",
        x: (vessel.length_ft - vessel.benchLength_ft) / 2,
        y: vessel.width_ft - vessel.benchDepth_ft - 0.5,
        length_ft: vessel.benchLength_ft,
        depth_ft: vessel.benchDepth_ft,
        height_ft: vessel.benchHeight_ft,
        rotation: "N" as Rotation,
      }];
    }
    return [];
  });

  const [steps, setSteps] = useState<StepsElement[]>(() => {
    if (vessel.steps && vessel.steps.length > 0) {
      return vessel.steps;
    }
    if (vessel.hasSteps) {
      return [{
        id: "steps-1",
        x: 0.5,
        y: vessel.width_ft - vessel.stepsCount * vessel.stepTread_ft - 0.5,
        width_ft: vessel.stepsWidth_ft,
        count: vessel.stepsCount,
        tread_ft: vessel.stepTread_ft,
        riser_ft: vessel.stepRiser_ft,
        rotation: "N" as Rotation,
        autoSize: false,
      }];
    }
    return [];
  });

  const [viewMode, setViewMode] = useState<"plan" | "elevation-front" | "elevation-side">("plan");
  const [dragging, setDragging] = useState<SelectedElement | null>(null);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // SVG dimensions and scaling
  const padding = 80;
  const maxScale = 40;
  const L = Math.max(0, vessel.length_ft);
  const W = Math.max(0, vessel.width_ft);
  const H = Math.max(0, vessel.wallHeight_ft);

  // Calculate scale to fit in viewport
  const scale = viewMode === "plan"
    ? Math.min(500 / L, 400 / W, maxScale)
    : viewMode === "elevation-front"
    ? Math.min(500 / L, 300 / H, maxScale)
    : Math.min(500 / W, 300 / H, maxScale);

  const svgW = viewMode === "plan" ? L * scale + padding * 2 : viewMode === "elevation-front" ? L * scale + padding * 2 : W * scale + padding * 2;
  const svgH = viewMode === "plan" ? W * scale + padding * 2 : H * scale + padding * 2;

  // Wall thickness
  const wallThickness_ft = constructionType === "EPS" ? vessel.eps_wall_thickness_ft : 0.083; // 1" SS
  const floorThickness_ft = constructionType === "EPS" ? vessel.eps_floor_thickness_ft : 0.083;

  // Convert SVG coordinates to feet
  const svgToFeet = (svgX: number, svgY: number): { x: number; y: number } => {
    return {
      x: (svgX - padding) / scale,
      y: (svgY - padding) / scale,
    };
  };

  // Auto-size steps calculation
  const calculateAutoSizeSteps = (rotation: Rotation): Partial<StepsElement> => {
    const wallH = vessel.wallHeight_ft;

    // Ideal tread and riser dimensions (building code compliant)
    const idealRiser = 0.58; // ~7 inches
    const idealTread = 1.0; // 12 inches

    // Calculate number of steps (including top of vessel as first tread)
    const stepCount = Math.ceil(wallH / idealRiser);
    const actualRiser = wallH / stepCount;

    // Width based on which wall it's touching
    let width_ft: number;
    if (rotation === "N" || rotation === "S") {
      width_ft = L * 0.33; // 1/3 of length
    } else {
      width_ft = W * 0.33; // 1/3 of width
    }

    return {
      count: stepCount,
      riser_ft: actualRiser,
      tread_ft: idealTread,
      width_ft: width_ft,
    };
  };

  // Get element dimensions based on rotation
  const getRotatedDimensions = (element: BenchElement | StepsElement, rotation: Rotation) => {
    if ("length_ft" in element) {
      // Bench
      return rotation === "N" || rotation === "S"
        ? { width: element.length_ft, depth: element.depth_ft }
        : { width: element.depth_ft, depth: element.length_ft };
    } else {
      // Steps
      const totalDepth = element.count * element.tread_ft;
      return rotation === "N" || rotation === "S"
        ? { width: element.width_ft, depth: totalDepth }
        : { width: totalDepth, depth: element.width_ft };
    }
  };

  // Handle drag start
  const handleMouseDown = (type: ElementType, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const selected = { type, id };
    setDragging(selected);
    setSelectedElement(selected);
  };

  // Handle dragging
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const pos = svgToFeet(svgX, svgY);

    if (viewMode === "plan") {
      // Plan view dragging (XY plane)
      if (dragging.type === "bench") {
        setBenches(prev => prev.map(b => {
          if (b.id === dragging.id) {
            const dims = getRotatedDimensions(b, b.rotation);
            const clampedX = Math.max(0, Math.min(pos.x, L - dims.width));
            const clampedY = Math.max(0, Math.min(pos.y, W - dims.depth));
            return { ...b, x: clampedX, y: clampedY };
          }
          return b;
        }));
      } else if (dragging.type === "steps") {
        setSteps(prev => prev.map(s => {
          if (s.id === dragging.id) {
            const dims = getRotatedDimensions(s, s.rotation);
            const clampedX = Math.max(0, Math.min(pos.x, L - dims.width));
            const clampedY = Math.max(0, Math.min(pos.y, W - dims.depth));
            return { ...s, x: clampedX, y: clampedY };
          }
          return s;
        }));
      }
    } else if (viewMode === "elevation-front") {
      // Front elevation dragging (X and height)
      if (dragging.type === "bench") {
        setBenches(prev => prev.map(b => {
          if (b.id === dragging.id) {
            const visible = b.rotation === "N" || b.rotation === "S";
            const width = visible ? b.length_ft : b.depth_ft;
            const clampedX = Math.max(0, Math.min(pos.x, L - width));
            const clampedHeight = Math.max(0.5, Math.min(pos.y, H - 0.5));
            return { ...b, x: clampedX, height_ft: clampedHeight };
          }
          return b;
        }));
      } else if (dragging.type === "steps") {
        setSteps(prev => prev.map(s => {
          if (s.id === dragging.id) {
            const visible = s.rotation === "N" || s.rotation === "S";
            const width = visible ? s.width_ft : s.count * s.tread_ft;
            const clampedX = Math.max(0, Math.min(pos.x, L - width));
            return { ...s, x: clampedX };
          }
          return s;
        }));
      }
    } else if (viewMode === "elevation-side") {
      // Side elevation dragging (Y and height)
      if (dragging.type === "bench") {
        setBenches(prev => prev.map(b => {
          if (b.id === dragging.id) {
            const visible = b.rotation === "E" || b.rotation === "W";
            const width = visible ? b.depth_ft : b.length_ft;
            const clampedY = Math.max(0, Math.min(pos.x, W - width));
            const clampedHeight = Math.max(0.5, Math.min(pos.y, H - 0.5));
            return { ...b, y: clampedY, height_ft: clampedHeight };
          }
          return b;
        }));
      } else if (dragging.type === "steps") {
        setSteps(prev => prev.map(s => {
          if (s.id === dragging.id) {
            const visible = s.rotation === "E" || s.rotation === "W";
            const width = visible ? s.width_ft : s.count * s.tread_ft;
            const clampedY = Math.max(0, Math.min(pos.x, W - width));
            return { ...s, y: clampedY };
          }
          return s;
        }));
      }
    }
  };

  // Handle drag end
  const handleMouseUp = () => {
    setDragging(null);
    // Sync back to vessel
    syncToVessel();
  };

  // Sync local state back to vessel
  const syncToVessel = () => {
    onVesselUpdate({
      benches,
      steps,
      hasBench: benches.length > 0,
      hasSteps: steps.length > 0,
    });
  };

  // Rotate element
  const rotateElement = () => {
    if (!selectedElement) return;
    const rotations: Rotation[] = ["N", "E", "S", "W"];

    if (selectedElement.type === "bench") {
      setBenches(prev => prev.map(b => {
        if (b.id === selectedElement.id) {
          const currentIndex = rotations.indexOf(b.rotation);
          const nextRotation = rotations[(currentIndex + 1) % 4];
          return { ...b, rotation: nextRotation };
        }
        return b;
      }));
    } else if (selectedElement.type === "steps") {
      setSteps(prev => prev.map(s => {
        if (s.id === selectedElement.id) {
          const currentIndex = rotations.indexOf(s.rotation);
          const nextRotation = rotations[(currentIndex + 1) % 4];

          // If autoSize is enabled, recalculate dimensions for new rotation
          if (s.autoSize) {
            const autoSized = calculateAutoSizeSteps(nextRotation);
            return { ...s, ...autoSized, rotation: nextRotation };
          }

          return { ...s, rotation: nextRotation };
        }
        return s;
      }));
    }
    syncToVessel();
  };

  // Duplicate element
  const duplicateElement = () => {
    if (!selectedElement) return;

    if (selectedElement.type === "bench") {
      const bench = benches.find(b => b.id === selectedElement.id);
      if (bench) {
        const newBench: BenchElement = {
          ...bench,
          id: `bench-${Date.now()}`,
          x: Math.min(bench.x + 1, L - bench.length_ft),
          y: Math.min(bench.y + 1, W - bench.depth_ft),
        };
        setBenches(prev => [...prev, newBench]);
        setSelectedElement({ type: "bench", id: newBench.id });
      }
    } else if (selectedElement.type === "steps") {
      const step = steps.find(s => s.id === selectedElement.id);
      if (step) {
        const newSteps: StepsElement = {
          ...step,
          id: `steps-${Date.now()}`,
          x: Math.min(step.x + 1, L - step.width_ft),
          y: Math.min(step.y + 1, W - step.count * step.tread_ft),
          autoSize: false, // Duplicated steps don't auto-size by default
        };
        setSteps(prev => [...prev, newSteps]);
        setSelectedElement({ type: "steps", id: newSteps.id });
      }
    }
    syncToVessel();
  };

  // Delete element
  const deleteElement = () => {
    if (!selectedElement) return;

    if (selectedElement.type === "bench") {
      setBenches(prev => prev.filter(b => b.id !== selectedElement.id));
    } else if (selectedElement.type === "steps") {
      setSteps(prev => prev.filter(s => s.id !== selectedElement.id));
    }
    setSelectedElement(null);
    syncToVessel();
  };

  // Toggle auto-size for steps
  const toggleAutoSize = () => {
    if (!selectedElement || selectedElement.type !== "steps") return;

    setSteps(prev => prev.map(s => {
      if (s.id === selectedElement.id) {
        if (!s.autoSize) {
          // Enabling auto-size: calculate and apply
          const autoSized = calculateAutoSizeSteps(s.rotation);
          return { ...s, ...autoSized, autoSize: true };
        } else {
          // Disabling auto-size: keep current values
          return { ...s, autoSize: false };
        }
      }
      return s;
    }));
    syncToVessel();
  };

  // Update selected element properties
  const updateSelectedElement = (updates: Partial<BenchElement> | Partial<StepsElement>) => {
    if (!selectedElement) return;

    if (selectedElement.type === "bench") {
      setBenches(prev => prev.map(b => b.id === selectedElement.id ? { ...b, ...updates } : b));
    } else if (selectedElement.type === "steps") {
      setSteps(prev => prev.map(s => {
        if (s.id === selectedElement.id) {
          // Disable auto-size when manually editing
          return { ...s, ...updates, autoSize: false };
        }
        return s;
      }));
    }
    syncToVessel();
  };

  // Render bench in plan view
  const renderBenchPlan = (bench: BenchElement, isSelected: boolean) => {
    const dims = getRotatedDimensions(bench, bench.rotation);

    return (
      <g
        key={bench.id}
        onMouseDown={(e) => handleMouseDown("bench", bench.id, e)}
        style={{ cursor: dragging?.id === bench.id ? "grabbing" : "grab" }}
        className={isSelected ? "opacity-100" : "opacity-80"}
      >
        <rect
          x={padding + bench.x * scale}
          y={padding + bench.y * scale}
          width={dims.width * scale}
          height={dims.depth * scale}
          fill="#fbbf24"
          stroke={isSelected ? "#dc2626" : "#f59e0b"}
          strokeWidth={isSelected ? "3" : "2"}
          opacity="0.8"
        />
        <text
          x={padding + bench.x * scale + (dims.width * scale) / 2}
          y={padding + bench.y * scale + (dims.depth * scale) / 2 - 8}
          textAnchor="middle"
          fontSize="11"
          fill="#78350f"
          fontWeight="600"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          Bench
        </text>
        <text
          x={padding + bench.x * scale + (dims.width * scale) / 2}
          y={padding + bench.y * scale + (dims.depth * scale) / 2 + 4}
          textAnchor="middle"
          fontSize="9"
          fill="#78350f"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {dims.width.toFixed(1)}'×{dims.depth.toFixed(1)}'×{bench.height_ft.toFixed(1)}'H
        </text>
        <text
          x={padding + bench.x * scale + (dims.width * scale) / 2}
          y={padding + bench.y * scale + (dims.depth * scale) / 2 + 14}
          textAnchor="middle"
          fontSize="9"
          fill="#78350f"
          fontWeight="700"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {bench.rotation}
        </text>
      </g>
    );
  };

  // Render steps in plan view
  const renderStepsPlan = (step: StepsElement, isSelected: boolean) => {
    const dims = getRotatedDimensions(step, step.rotation);
    const isVertical = step.rotation === "N" || step.rotation === "S";
    const isDescending = step.rotation === "S" || step.rotation === "W";

    return (
      <g
        key={step.id}
        onMouseDown={(e) => handleMouseDown("steps", step.id, e)}
        style={{ cursor: dragging?.id === step.id ? "grabbing" : "grab" }}
        className={isSelected ? "opacity-100" : "opacity-80"}
      >
        {Array.from({ length: step.count }).map((_, idx) => {
          const progress = isDescending ? step.count - idx - 1 : idx;

          return (
            <rect
              key={idx}
              x={padding + step.x * scale + (isVertical ? 0 : progress * step.tread_ft * scale)}
              y={padding + step.y * scale + (isVertical ? progress * step.tread_ft * scale : 0)}
              width={isVertical ? step.width_ft * scale : step.tread_ft * scale}
              height={isVertical ? step.tread_ft * scale : step.width_ft * scale}
              fill="#86efac"
              stroke={isSelected ? "#dc2626" : "#22c55e"}
              strokeWidth={isSelected ? "2" : "1"}
              opacity={0.85 - idx * 0.08}
            />
          );
        })}
        <text
          x={padding + step.x * scale + (dims.width * scale) / 2}
          y={padding + step.y * scale + (dims.depth * scale) / 2 - 6}
          textAnchor="middle"
          fontSize="11"
          fill="#166534"
          fontWeight="600"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          Steps ({step.count}) {step.rotation}
        </text>
        <text
          x={padding + step.x * scale + (dims.width * scale) / 2}
          y={padding + step.y * scale + (dims.depth * scale) / 2 + 6}
          textAnchor="middle"
          fontSize="9"
          fill="#166534"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          W:{step.width_ft.toFixed(1)}' T:{step.tread_ft.toFixed(1)}' R:{(step.riser_ft * 12).toFixed(1)}"
        </text>
      </g>
    );
  };

  // Render steps in elevation - proper notched profile
  const renderStepsElevation = (step: StepsElement, view: "front" | "side", isSelected: boolean) => {
    // Determine orientation
    const isFacingView = view === "front"
      ? (step.rotation === "N" || step.rotation === "S")
      : (step.rotation === "E" || step.rotation === "W");

    const isDescending = step.rotation === "S" || step.rotation === "W";

    if (!isFacingView) {
      // Show as solid block from side
      const width = view === "front" ? step.width_ft : step.count * step.tread_ft;
      const xPos = view === "front" ? step.x : step.y;

      return (
        <g
          key={step.id}
          onMouseDown={(e) => handleMouseDown("steps", step.id, e)}
          style={{ cursor: dragging?.id === step.id ? "grabbing" : "grab" }}
        >
          <rect
            x={padding + xPos * scale}
            y={padding + H * scale - step.count * step.riser_ft * scale}
            width={width * scale}
            height={step.count * step.riser_ft * scale}
            fill="#86efac"
            stroke={isSelected ? "#dc2626" : "#22c55e"}
            strokeWidth={isSelected ? "3" : "1.5"}
            opacity={0.8}
          />
          {/* Dimension annotation */}
          <text
            x={padding + xPos * scale + (width * scale) / 2}
            y={padding + H * scale - (step.count * step.riser_ft * scale) / 2}
            textAnchor="middle"
            fontSize="10"
            fill="#166534"
            fontWeight="600"
            dominantBaseline="middle"
            pointerEvents="none"
          >
            {width.toFixed(1)}'W × {(step.count * step.riser_ft).toFixed(1)}'H
          </text>
        </g>
      );
    }

    // Show proper notched steps profile
    const points: string[] = [];
    const startX = padding + (view === "front" ? step.x : step.y) * scale;
    const baseY = padding + H * scale;

    if (isDescending) {
      // Descending stairs (going down into vessel)
      // Start at top right
      points.push(`${startX + step.count * step.tread_ft * scale},${padding}`);

      // Build descending profile
      for (let i = step.count - 1; i >= 0; i--) {
        const currentHeight = padding + (step.count - i - 1) * step.riser_ft * scale;
        const currentDepth = i * step.tread_ft * scale;

        // Down to tread
        points.push(`${startX + (i + 1) * step.tread_ft * scale},${currentHeight}`);
        // In to riser
        points.push(`${startX + currentDepth},${currentHeight}`);
      }

      // Complete polygon
      points.push(`${startX},${baseY}`);
      points.push(`${startX + step.count * step.tread_ft * scale},${baseY}`);
    } else {
      // Ascending stairs (standard)
      points.push(`${startX},${baseY}`);

      for (let i = 0; i < step.count; i++) {
        const currentHeight = baseY - (i + 1) * step.riser_ft * scale;
        const currentDepth = (i + 1) * step.tread_ft * scale;

        points.push(`${startX + (i === 0 ? 0 : i * step.tread_ft * scale)},${currentHeight}`);
        points.push(`${startX + currentDepth},${currentHeight}`);
      }

      points.push(`${startX + step.count * step.tread_ft * scale},${baseY}`);
    }

    return (
      <g
        key={step.id}
        onMouseDown={(e) => handleMouseDown("steps", step.id, e)}
        style={{ cursor: dragging?.id === step.id ? "grabbing" : "grab" }}
      >
        <polygon
          points={points.join(" ")}
          fill="#86efac"
          stroke={isSelected ? "#dc2626" : "#22c55e"}
          strokeWidth={isSelected ? "3" : "2"}
          opacity={0.8}
        />
        {/* Dimension annotations */}
        <text
          x={startX + (step.count * step.tread_ft * scale) / 2}
          y={padding + H * scale - (step.count * step.riser_ft * scale) / 2}
          textAnchor="middle"
          fontSize="10"
          fill="#166534"
          fontWeight="600"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {step.count}× {step.tread_ft.toFixed(1)}'T × {(step.riser_ft * 12).toFixed(1)}"R
        </text>
      </g>
    );
  };

  // Render bench in elevation
  const renderBenchElevation = (bench: BenchElement, view: "front" | "side", isSelected: boolean) => {
    const visible = view === "front"
      ? (bench.rotation === "N" || bench.rotation === "S")
      : (bench.rotation === "E" || bench.rotation === "W");

    const width = view === "front"
      ? (visible ? bench.length_ft : bench.depth_ft)
      : (visible ? bench.depth_ft : bench.length_ft);

    const xPos = view === "front" ? bench.x : bench.y;

    return (
      <g
        key={bench.id}
        onMouseDown={(e) => handleMouseDown("bench", bench.id, e)}
        style={{ cursor: dragging?.id === bench.id ? "grabbing" : "grab" }}
      >
        <rect
          x={padding + xPos * scale}
          y={padding + H * scale - bench.height_ft * scale}
          width={width * scale}
          height={bench.height_ft * scale}
          fill="#fbbf24"
          stroke={isSelected ? "#dc2626" : "#f59e0b"}
          strokeWidth={isSelected ? "3" : "2"}
          opacity={0.8}
        />
        {/* Dimension annotation */}
        <text
          x={padding + xPos * scale + (width * scale) / 2}
          y={padding + H * scale - bench.height_ft * scale / 2}
          textAnchor="middle"
          fontSize="10"
          fill="#78350f"
          fontWeight="600"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {width.toFixed(1)}'W × {bench.height_ft.toFixed(1)}'H
        </text>
      </g>
    );
  };

  // Render plan view
  const renderPlanView = () => {
    return (
      <g>
        {/* Outer vessel boundary (with wall thickness) */}
        <rect
          x={padding - wallThickness_ft * scale}
          y={padding - wallThickness_ft * scale}
          width={(L + wallThickness_ft * 2) * scale}
          height={(W + wallThickness_ft * 2) * scale}
          fill="#9ca3af"
          stroke="#6b7280"
          strokeWidth="2"
        />

        {/* Inner vessel (water area) */}
        <rect
          x={padding}
          y={padding}
          width={L * scale}
          height={W * scale}
          fill="#dbeafe"
          stroke="#2563eb"
          strokeWidth="2"
        />

        {/* Wall thickness labels */}
        {constructionType === "EPS" && (
          <text
            x={padding - wallThickness_ft * scale / 2}
            y={padding + W * scale / 2}
            textAnchor="middle"
            fontSize="9"
            fill="#374151"
            fontWeight="600"
            transform={`rotate(-90, ${padding - wallThickness_ft * scale / 2}, ${padding + W * scale / 2})`}
          >
            {(wallThickness_ft * 12).toFixed(1)}" EPS
          </text>
        )}

        {/* Render all benches */}
        {benches.map(bench => renderBenchPlan(bench, selectedElement?.type === "bench" && selectedElement.id === bench.id))}

        {/* Render all steps */}
        {steps.map(step => renderStepsPlan(step, selectedElement?.type === "steps" && selectedElement.id === step.id))}

        {/* Water depth annotation */}
        <g>
          <circle
            cx={padding + L * scale / 2}
            cy={padding + W * scale / 2}
            r="40"
            fill="white"
            fillOpacity="0.9"
            stroke="#1e40af"
            strokeWidth="2"
          />
          <text
            x={padding + L * scale / 2}
            y={padding + W * scale / 2 - 8}
            textAnchor="middle"
            fontSize="11"
            fill="#1e40af"
            fontWeight="600"
          >
            Water Depth
          </text>
          <text
            x={padding + L * scale / 2}
            y={padding + W * scale / 2 + 8}
            textAnchor="middle"
            fontSize="16"
            fill="#1e40af"
            fontWeight="700"
          >
            {vessel.waterDepth_ft.toFixed(1)}'
          </text>
        </g>

        {/* Dimension lines */}
        {renderDimensionLines()}
      </g>
    );
  };

  // Render front elevation (looking at length)
  const renderFrontElevation = () => {
    const waterLevel = H - vessel.waterDepth_ft;

    return (
      <g>
        {/* Floor */}
        <rect
          x={padding}
          y={padding + H * scale}
          width={L * scale}
          height={floorThickness_ft * scale}
          fill="#6b7280"
          stroke="#374151"
          strokeWidth="1"
        />

        {/* Left wall */}
        <rect
          x={padding - wallThickness_ft * scale}
          y={padding}
          width={wallThickness_ft * scale}
          height={H * scale}
          fill="#9ca3af"
          stroke="#6b7280"
          strokeWidth="1"
        />

        {/* Right wall */}
        <rect
          x={padding + L * scale}
          y={padding}
          width={wallThickness_ft * scale}
          height={H * scale}
          fill="#9ca3af"
          stroke="#6b7280"
          strokeWidth="1"
        />

        {/* Water */}
        <rect
          x={padding}
          y={padding + waterLevel * scale}
          width={L * scale}
          height={vessel.waterDepth_ft * scale}
          fill="#bfdbfe"
          stroke="#3b82f6"
          strokeWidth="2"
          fillOpacity="0.6"
        />

        {/* Water line */}
        <line
          x1={padding}
          y1={padding + waterLevel * scale}
          x2={padding + L * scale}
          y2={padding + waterLevel * scale}
          stroke="#1e40af"
          strokeWidth="2"
          strokeDasharray="5,5"
        />

        {/* Water depth dimension */}
        <line
          x1={padding + L * scale + 30}
          y1={padding + waterLevel * scale}
          x2={padding + L * scale + 30}
          y2={padding + H * scale}
          stroke="#1e40af"
          strokeWidth="2"
          markerStart="url(#arrowhead)"
          markerEnd="url(#arrowhead)"
        />
        <text
          x={padding + L * scale + 45}
          y={padding + waterLevel * scale + (vessel.waterDepth_ft * scale) / 2}
          fontSize="12"
          fill="#1e40af"
          fontWeight="600"
          dominantBaseline="middle"
        >
          {vessel.waterDepth_ft.toFixed(1)}' depth
        </text>

        {/* Render steps with proper profile */}
        {steps.map(step => renderStepsElevation(step, "front", selectedElement?.type === "steps" && selectedElement.id === step.id))}

        {/* Render benches */}
        {benches.map(bench => renderBenchElevation(bench, "front", selectedElement?.type === "bench" && selectedElement.id === bench.id))}

        {/* Wall thickness label */}
        <text
          x={padding - wallThickness_ft * scale / 2}
          y={padding + H * scale / 2}
          textAnchor="middle"
          fontSize="9"
          fill="#374151"
          fontWeight="600"
          transform={`rotate(-90, ${padding - wallThickness_ft * scale / 2}, ${padding + H * scale / 2})`}
        >
          {constructionType === "EPS" ? `${(wallThickness_ft * 12).toFixed(1)}" EPS` : "1\" SS"}
        </text>

        {/* Dimension lines for elevation */}
        {renderElevationDimensions("front")}
      </g>
    );
  };

  // Render side elevation (looking at width)
  const renderSideElevation = () => {
    const waterLevel = H - vessel.waterDepth_ft;

    return (
      <g>
        {/* Floor */}
        <rect
          x={padding}
          y={padding + H * scale}
          width={W * scale}
          height={floorThickness_ft * scale}
          fill="#6b7280"
          stroke="#374151"
          strokeWidth="1"
        />

        {/* Left wall */}
        <rect
          x={padding - wallThickness_ft * scale}
          y={padding}
          width={wallThickness_ft * scale}
          height={H * scale}
          fill="#9ca3af"
          stroke="#6b7280"
          strokeWidth="1"
        />

        {/* Right wall */}
        <rect
          x={padding + W * scale}
          y={padding}
          width={wallThickness_ft * scale}
          height={H * scale}
          fill="#9ca3af"
          stroke="#6b7280"
          strokeWidth="1"
        />

        {/* Water */}
        <rect
          x={padding}
          y={padding + waterLevel * scale}
          width={W * scale}
          height={vessel.waterDepth_ft * scale}
          fill="#bfdbfe"
          stroke="#3b82f6"
          strokeWidth="2"
          fillOpacity="0.6"
        />

        {/* Water line */}
        <line
          x1={padding}
          y1={padding + waterLevel * scale}
          x2={padding + W * scale}
          y2={padding + waterLevel * scale}
          stroke="#1e40af"
          strokeWidth="2"
          strokeDasharray="5,5"
        />

        {/* Water depth dimension */}
        <line
          x1={padding + W * scale + 30}
          y1={padding + waterLevel * scale}
          x2={padding + W * scale + 30}
          y2={padding + H * scale}
          stroke="#1e40af"
          strokeWidth="2"
          markerStart="url(#arrowhead)"
          markerEnd="url(#arrowhead)"
        />
        <text
          x={padding + W * scale + 45}
          y={padding + waterLevel * scale + (vessel.waterDepth_ft * scale) / 2}
          fontSize="12"
          fill="#1e40af"
          fontWeight="600"
          dominantBaseline="middle"
        >
          {vessel.waterDepth_ft.toFixed(1)}' depth
        </text>

        {/* Render benches */}
        {benches.map(bench => renderBenchElevation(bench, "side", selectedElement?.type === "bench" && selectedElement.id === bench.id))}

        {/* Render steps with proper profile */}
        {steps.map(step => renderStepsElevation(step, "side", selectedElement?.type === "steps" && selectedElement.id === step.id))}

        {/* Dimension lines for elevation */}
        {renderElevationDimensions("side")}
      </g>
    );
  };

  // Render dimension lines for plan view
  const renderDimensionLines = () => {
    return (
      <>
        {/* Length dimension (top) */}
        <line
          x1={padding}
          y1={padding - 30}
          x2={padding + L * scale}
          y2={padding - 30}
          stroke="#374151"
          strokeWidth="1.5"
          markerStart="url(#arrowhead)"
          markerEnd="url(#arrowhead)"
        />
        <text
          x={padding + (L * scale) / 2}
          y={padding - 35}
          textAnchor="middle"
          fontSize="13"
          fill="#374151"
          fontWeight="700"
        >
          {L.toFixed(1)}'
        </text>

        {/* Width dimension (right) */}
        <line
          x1={padding + L * scale + 30}
          y1={padding}
          x2={padding + L * scale + 30}
          y2={padding + W * scale}
          stroke="#374151"
          strokeWidth="1.5"
          markerStart="url(#arrowhead)"
          markerEnd="url(#arrowhead)"
        />
        <text
          x={padding + L * scale + 50}
          y={padding + (W * scale) / 2}
          textAnchor="middle"
          fontSize="13"
          fill="#374151"
          fontWeight="700"
          transform={`rotate(90, ${padding + L * scale + 50}, ${padding + (W * scale) / 2})`}
        >
          {W.toFixed(1)}'
        </text>
      </>
    );
  };

  // Render dimension lines for elevation views
  const renderElevationDimensions = (view: "front" | "side") => {
    const width = view === "front" ? L : W;

    return (
      <>
        {/* Horizontal dimension */}
        <line
          x1={padding}
          y1={padding + H * scale + 40}
          x2={padding + width * scale}
          y2={padding + H * scale + 40}
          stroke="#374151"
          strokeWidth="1.5"
          markerStart="url(#arrowhead)"
          markerEnd="url(#arrowhead)"
        />
        <text
          x={padding + (width * scale) / 2}
          y={padding + H * scale + 55}
          textAnchor="middle"
          fontSize="13"
          fill="#374151"
          fontWeight="700"
        >
          {width.toFixed(1)}'
        </text>

        {/* Height dimension */}
        <line
          x1={padding - 40}
          y1={padding}
          x2={padding - 40}
          y2={padding + H * scale}
          stroke="#374151"
          strokeWidth="1.5"
          markerStart="url(#arrowhead)"
          markerEnd="url(#arrowhead)"
        />
        <text
          x={padding - 55}
          y={padding + (H * scale) / 2}
          textAnchor="middle"
          fontSize="13"
          fill="#374151"
          fontWeight="700"
          transform={`rotate(-90, ${padding - 55}, ${padding + (H * scale) / 2})`}
        >
          {H.toFixed(1)}' height
        </text>
      </>
    );
  };

  const getSelectedObject = (): BenchElement | StepsElement | null => {
    if (!selectedElement) return null;
    if (selectedElement.type === "bench") {
      return benches.find(b => b.id === selectedElement.id) || null;
    }
    return steps.find(s => s.id === selectedElement.id) || null;
  };

  const selectedObj = getSelectedObject();
  const selectedStep = selectedElement?.type === "steps" ? steps.find(s => s.id === selectedElement.id) : null;

  return (
    <div className="vessel-visualization" style={{ marginBottom: 24 }}>
      {/* View mode selector */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => setViewMode("plan")}
          className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
            viewMode === "plan"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          }`}
        >
          Plan View
        </button>
        <button
          onClick={() => setViewMode("elevation-front")}
          className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
            viewMode === "elevation-front"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          }`}
        >
          Front Elevation
        </button>
        <button
          onClick={() => setViewMode("elevation-side")}
          className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
            viewMode === "elevation-side"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          }`}
        >
          Side Elevation
        </button>

        {/* Element controls */}
        {selectedElement && (
          <>
            <button
              onClick={rotateElement}
              className="px-4 py-2 rounded font-semibold text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              title="Rotate 90° clockwise"
            >
              🔄 Rotate
            </button>
            <button
              onClick={duplicateElement}
              className="px-4 py-2 rounded font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition-colors"
              title="Duplicate element"
            >
              ➕ Duplicate
            </button>
            <button
              onClick={deleteElement}
              className="px-4 py-2 rounded font-semibold text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
              title="Delete element"
            >
              🗑️ Delete
            </button>
            {selectedElement.type === "steps" && (
              <button
                onClick={toggleAutoSize}
                className={`px-4 py-2 rounded font-semibold text-sm transition-colors ${
                  selectedStep?.autoSize
                    ? "bg-orange-600 text-white hover:bg-orange-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
                title="Auto-size steps based on vessel height"
              >
                {selectedStep?.autoSize ? "🔓 Manual" : "⚙️ Auto-Size"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Instructions */}
      {(benches.length > 0 || steps.length > 0) && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
          💡 Click to select. Drag to reposition in any view. Use Rotate (N/E/S/W), Duplicate, or Auto-Size for steps.
        </div>
      )}

      {/* SVG Container */}
      <div style={{ background: "#f9fafb", padding: 16, borderRadius: 8, overflow: "auto" }}>
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 4 }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Define arrowhead marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <polygon points="0 0, 10 5, 0 10" fill="#374151" />
            </marker>
          </defs>

          {viewMode === "plan" && renderPlanView()}
          {viewMode === "elevation-front" && renderFrontElevation()}
          {viewMode === "elevation-side" && renderSideElevation()}
        </svg>
      </div>

      {/* Dimension editor for selected element */}
      {selectedElement && selectedObj && (
        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="font-semibold text-sm mb-3 text-yellow-900 dark:text-yellow-100 flex justify-between items-center">
            <span>
              {selectedElement.type === "bench" ? "Bench" : "Steps"} - {selectedObj && "rotation" in selectedObj ? selectedObj.rotation : "N"}
              {selectedStep?.autoSize && <span className="ml-2 text-xs bg-orange-200 dark:bg-orange-800 px-2 py-0.5 rounded">AUTO-SIZED</span>}
            </span>
          </div>

          {selectedElement.type === "bench" && "length_ft" in selectedObj && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Length (ft)
                </label>
                <input
                  type="number"
                  value={selectedObj.length_ft}
                  onChange={(e) => updateSelectedElement({ length_ft: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Depth (ft)
                </label>
                <input
                  type="number"
                  value={selectedObj.depth_ft}
                  onChange={(e) => updateSelectedElement({ depth_ft: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Height (ft)
                </label>
                <input
                  type="number"
                  value={selectedObj.height_ft}
                  onChange={(e) => updateSelectedElement({ height_ft: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
                  step="0.1"
                />
              </div>
            </div>
          )}

          {selectedElement.type === "steps" && "width_ft" in selectedObj && (
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Width (ft)
                </label>
                <input
                  type="number"
                  value={selectedObj.width_ft}
                  onChange={(e) => updateSelectedElement({ width_ft: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
                  step="0.1"
                  disabled={selectedStep?.autoSize}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Count
                </label>
                <input
                  type="number"
                  value={selectedObj.count}
                  onChange={(e) => updateSelectedElement({ count: parseInt(e.target.value) || 1 })}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
                  step="1"
                  min="1"
                  disabled={selectedStep?.autoSize}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Tread (ft)
                </label>
                <input
                  type="number"
                  value={selectedObj.tread_ft}
                  onChange={(e) => updateSelectedElement({ tread_ft: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
                  step="0.1"
                  disabled={selectedStep?.autoSize}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Riser (ft)
                </label>
                <input
                  type="number"
                  value={selectedObj.riser_ft}
                  onChange={(e) => updateSelectedElement({ riser_ft: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
                  step="0.1"
                  disabled={selectedStep?.autoSize}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VesselVisualization;
