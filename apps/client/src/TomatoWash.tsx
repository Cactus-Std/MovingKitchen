import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Item } from "@kitchen/shared";
import type { PoseSample } from "./input/contracts";
import { text, type Language } from "./i18n";
export function TomatoWash({
  item,
  waterOn,
  pose,
  onWash,
  language = "zh",
}: {
  item: Item;
  waterOn: boolean;
  pose: MutableRefObject<PoseSample | null>;
  onWash: (patches: number[]) => Promise<void>;
  language?: Language;
}) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({ item, waterOn, onWash });
  latest.current = { item, waterOn, onWash };
  useEffect(() => {
    const host = container.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.z = 5;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(3, 4, 5);
    scene.add(light);
    const tomato = new THREE.Group();
    tomato.position.x = -0.38;
    scene.add(tomato);
    const fruit = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xd93632, roughness: 0.65 }),
    );
    fruit.scale.y = 0.92;
    tomato.add(fruit);
    const stem = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.25, 6),
      new THREE.MeshStandardMaterial({ color: 0x3d8e45 }),
    );
    stem.position.y = 1.08;
    stem.rotation.z = Math.PI;
    tomato.add(stem);
    const dirt = Array.from({ length: 48 }, (_, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 48),
        theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const normal = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.13, 10),
        new THREE.MeshBasicMaterial({
          color: 0x62584b,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.position.copy(normal).multiplyScalar(1.16);
      mesh.lookAt(normal.clone().multiplyScalar(2.3));
      tomato.add(mesh);
      return { mesh, normal, dwell: 0 };
    });
    const resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    let raf = 0,
      previous = performance.now(),
      sentAt = 0,
      busy = false,
      dead = false;
    let lastPose: PoseSample | null = null;
    const frame = (now: number) => {
      if (dead) return;
      const dt = Math.min(50, now - previous);
      previous = now;
      const p = pose.current;
      if (
        p &&
        p.cursor &&
        p !== lastPose &&
        p.cursor.x >= 0.517 &&
        p.cursor.y >= 0.472 &&
        p.cursor.y <= 0.768
      ) {
        if (lastPose?.cursor) {
          tomato.rotation.y += (p.cursor.x - lastPose.cursor.x) * 18;
          tomato.rotation.x += (p.cursor.y - lastPose.cursor.y) * 18;
        }
        lastPose = p;
      } else if (p !== lastPose) lastPose = p;
      tomato.updateMatrixWorld(true);
      const patches: number[] = [];
      dirt.forEach((spot, i) => {
        const washed = latest.current.item.washedPatches.includes(i);
        spot.mesh.visible = !washed;
        if (washed) return;
        const normal = spot.normal.clone().applyQuaternion(tomato.quaternion),
          position = spot.mesh
            .getWorldPosition(new THREE.Vector3())
            .project(camera);
        const x = (position.x + 1) / 2;
        if (
          latest.current.waterOn &&
          normal.z > 0.15 &&
          x >= 0.32 &&
          x <= 0.55
        ) {
          spot.dwell += dt;
          if (spot.dwell >= 180) patches.push(i);
        } else spot.dwell = 0;
      });
      if (patches.length && !busy && now - sentAt >= 220) {
        busy = true;
        sentAt = now;
        void latest.current.onWash(patches.slice(0, 8)).finally(() => {
          busy = false;
        });
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [item.id, pose]);
  return (
    <div
      className="tomato-canvas"
      ref={container}
      aria-label={text(
        language,
        `Tomato cleanliness ${item.cleanliness}%`,
        `番茄清洁度 ${item.cleanliness}%`,
      )}
    />
  );
}
