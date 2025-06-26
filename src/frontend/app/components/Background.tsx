import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { useRef, useState, useMemo, createRef, useEffect } from "react";
import * as THREE from "three";

// import { OrbitControls, Stars } from '@react-three/drei'
import { Mesh, Group, Line as ThreeLine, BufferAttribute } from "three";

const POINT_NO = 1000;
// const RANDOM_CHAIN_INTERVAL_RANGE = [5000, 20000]
const CHAIN_RANGE: [number, number] = [4, 50];
const LINE_AGE = 10;
const LINE_FADE_RATE = 0.3;
const LINE_SPEED = 2;
const Y_VELOCITY_RANGE: [number, number] = [-0.0005, 0.0005];
const X_VELOCITY_RANGE: [number, number] = [-0.0005, 0.0005];
const Z_POS_RANGE: [number, number] = [-2, 4];

type BackgroundPointVel = {
  velocity: [number, number];
  meshRef: React.RefObject<Mesh | null>;
  position: [number, number, number];
};

type LineData = {
  from: React.RefObject<Mesh | null>;
  to: React.RefObject<Mesh | null>;
  progress: number;
  opacity: number;
  age: number;
};

type BackgroundContentProps = {
  pointsRef: React.RefObject<BackgroundPointVel[]>;
  lines: LineData[];
  setLines: React.Dispatch<React.SetStateAction<LineData[]>>;
};

type BackgroundPointProps = {
  position: [number, number, number];
  meshRef: React.RefObject<Mesh | null>;
  opacity: number;
};

function randomInRange([min, max]: [number, number]) {
  return ((Math.random() * (max - min) + min) * 10000) / 10000;
}

const BUCKET_SIZE = 1;

const buckets = new Map<string, BackgroundPointVel[]>();

function getBucketKey(x: number, y: number, z: number) {
  const bx = Math.floor(x / BUCKET_SIZE);
  const by = Math.floor(y / BUCKET_SIZE);
  const bz = Math.floor(z / BUCKET_SIZE);
  return `${bx},${by},${bz}`;
}

function updateBuckets(points: BackgroundPointVel[]) {
  buckets.clear();
  for (const p of points) {
    const [x, y, z] = p.position;
    const key = getBucketKey(x, y, z);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  console.log(buckets);
}

function getNearbyPoints(
  x: number,
  y: number,
  z: number
): BackgroundPointVel[] {
  const results: BackgroundPointVel[] = [];
  const bx = Math.floor(x / BUCKET_SIZE);
  const by = Math.floor(y / BUCKET_SIZE);
  const bz = Math.floor(z / BUCKET_SIZE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${bx + dx},${by + dy},${bz + dz}`;
        if (buckets.has(key)) results.push(...buckets.get(key)!);
      }
    }
  }
  return results;
}

function getNearestPoint(
  x: number,
  y: number,
  z: number,
  visited: Set<BackgroundPointVel> = new Set()
): BackgroundPointVel | null {
  const candidates = getNearbyPoints(x, y, z).filter((p) => !visited.has(p));

  let closest: BackgroundPointVel | null = null;
  let closestDist = Infinity;

  for (const p of candidates) {
    const dx = p.position[0] - x;
    const dy = p.position[1] - y;
    const dz = p.position[2] - z;
    const dist = dx * dx + dy * dy + dz * dz;

    if (dist < closestDist) {
      closestDist = dist;
      closest = p;
    }
  }

  return closest;
}

function animateChain(
  chain: BackgroundPointVel[],
  setLines: React.Dispatch<React.SetStateAction<LineData[]>>
) {
  chain.forEach((point, i) => {
    if (i === chain.length - 1) return;

    const current = point;
    const next = chain[i + 1];

    setTimeout(() => {
      setLines((prev) => [
        ...prev,
        {
          from: current.meshRef,
          to: next.meshRef,
          progress: 0,
          opacity: 1,
          age: 0,
        },
      ]);
    }, i * 150);
  });
}

function BackgroundPoint({ position, meshRef, opacity }: BackgroundPointProps) {
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.01, 18, 10]} />
      <meshBasicMaterial color="#FFFFFF" opacity={opacity} />
    </mesh>
  );
}

export function AnimatedLine({ from, to, progress, opacity }: LineData) {
  const lineRef = useRef<ThreeLine>(null!);
  const [line] = useState(() => {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: "white",
      transparent: true,
    });
    return new THREE.Line(geometry, material);
  });

  useFrame(() => {
    if (!from.current || !to.current) return;

    const start = from.current.position;
    const end = to.current.position;
    const interpolated = start.clone().lerp(end, progress);

    const positions = new Float32Array([
      start.x,
      start.y,
      start.z,
      interpolated.x,
      interpolated.y,
      interpolated.z,
    ]);

    line.geometry.setAttribute("position", new BufferAttribute(positions, 3));
    line.geometry.attributes.position.needsUpdate = true;
    line.material.opacity = opacity;
  });

  return <primitive object={line} ref={lineRef} />;
}
function BackgroundContent({
  pointsRef,
  lines,
  setLines,
}: BackgroundContentProps) {
  const { viewport } = useThree();
  const groupRef = useRef<Group>(null!);
  // const linesRef = useRef<LineData[]>([]);
  const currentLineIndexRef = useRef(0);

  const x_range: [number, number] = [-viewport.width / 2, viewport.width / 2];
  const y_range: [number, number] = [-viewport.height / 2, viewport.height / 2];
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOpacity((prev) => {
        if (prev >= 1) {
          clearInterval(interval);
          return 1;
        }
        return prev + 0.01;
      });
    }, 16);

    return () => clearInterval(interval);
  }, []);
  const points = useMemo<BackgroundPointVel[]>(() => {
    const vels: [number, number][] = [];
    for (let i = 0; i < POINT_NO; i++) {
      vels.push([
        randomInRange(X_VELOCITY_RANGE),
        randomInRange(Y_VELOCITY_RANGE),
      ]);
    }

    return vels.map((v) => ({
      velocity: v,
      meshRef: createRef(),
      position: [
        randomInRange(x_range),
        randomInRange(y_range),
        randomInRange(Z_POS_RANGE),
      ],
    })) satisfies BackgroundPointVel[];
  }, []);

  pointsRef.current = points;

  const backgroundMeshRef = useRef(null);

  useFrame(() => {
    if (groupRef.current) {
      if (typeof window !== "undefined") {
        groupRef.current.position.y = window.scrollY * 0.0001;
      }
    }
  });

  useFrame(() => {
    let pos;
    const { width, height } = viewport;
    for (const point of points) {
      const mesh = point.meshRef.current;
      if (!mesh) continue;
      mesh.position.x += point.velocity[0];
      mesh.position.y += point.velocity[1];
      pos = mesh.position;
      point.position = [pos.x, pos.y, pos.z];
      if (pos.x < -width / 2 || pos.x > width / 2) {
        point.velocity[0] *= -1;
      }
      if (pos.y < -height / 2 || pos.y > height / 2) {
        point.velocity[1] *= -1;
      }
    }
  });

  useFrame((_, delta) => {
    setLines((prevLines) => {
      const newLines = [...prevLines];

      const currentIndex = currentLineIndexRef.current;
      if (
        currentIndex < newLines.length &&
        newLines[currentIndex].progress >= 1
      ) {
        currentLineIndexRef.current += 1;
      }

      for (let i = 0; i < newLines.length; i++) {
        const line = newLines[i];

        if (i === currentLineIndexRef.current && line.progress < 1) {
          line.progress = Math.min(1, line.progress + delta * LINE_SPEED);
        }
        if (line.progress >= 1) {
          line.age += delta;

          if (line.age >= LINE_AGE) {
            line.opacity = Math.max(0, line.opacity - delta * LINE_FADE_RATE);
          }
        }
      }

      return newLines.filter((line) => line.opacity > 0);
    });
  });

  return (
    <group ref={groupRef}>
      <mesh ref={backgroundMeshRef} position={[0, 0, -3]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial color="black" />
      </mesh>

      {lines.map((line, i) => (
        <AnimatedLine key={i} {...line} />
      ))}
      {points.map((point, index) => (
        <BackgroundPoint
          key={index}
          meshRef={point.meshRef}
          position={point.position}
          opacity={opacity}
        />
      ))}
    </group>
  );
}

function Background() {
  const pointsRef = useRef<BackgroundPointVel[]>([]);
  const [lines, setLines] = useState<LineData[]>([]);

  function buildChain(
    current: BackgroundPointVel,
    visited: Set<BackgroundPointVel>,
    chain: BackgroundPointVel[],
    depth: number = 0,
    maxDepth = 20
  ) {
    if (!current || visited.has(current) || depth > maxDepth) return;

    visited.add(current);
    chain.push(current);

    const [x, y, z] = current.position;

    updateBuckets(pointsRef.current.filter((p) => !visited.has(p)));

    const next = getNearestPoint(x, y, z, visited);
    if (next)
      buildChain(next, visited, chain, depth + 1, randomInRange(CHAIN_RANGE));
  }

  function triggerAnimationFromClick(clickPos: THREE.Vector3) {
    const visited = new Set<BackgroundPointVel>();
    const chain: BackgroundPointVel[] = [];

    updateBuckets(pointsRef.current);
    console.log(clickPos);
    const start = getNearestPoint(clickPos.x, clickPos.y, clickPos.z);

    if (!start) return;

    buildChain(start, visited, chain);

    animateChain(chain, setLines);
  }
  // setInterval(() => {
  //   const visited = new Set<BackgroundPointVel>();
  //   const chain: BackgroundPointVel[] = [];
  //   updateBuckets(pointsRef.current);
  //   const start = pointsRef.current[Math.floor(Math.random() * pointsRef.current.length)]
  //   if (!start) return;
  //   buildChain(start, visited, chain);
  //   animateChain(chain, setLines);
  // }, 20000)
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 75 }}
      style={{ pointerEvents: "auto", zIndex: 0 }}
    >
      <mesh
        position={[0, 0, 0.1]}
        renderOrder={-1}
        onPointerDown={(e) => triggerAnimationFromClick(e.point)}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <BackgroundContent
        pointsRef={pointsRef}
        lines={lines}
        setLines={setLines}
      />
    </Canvas>
  );
}

export default Background;
