"use client";

import { useEffect, useRef } from "react";

interface Stop {
  name: string;
  x: number;
  y: number;
}

interface Route {
  name: string;
  color: string;
  stops: Stop[];
}

interface StopAnimation {
  speedX: number;
  speedY: number;
  amplitudeX: number;
  amplitudeY: number;
  phaseX: number;
  phaseY: number;
}

function generateStopAnimations(routes: Route[]): StopAnimation[][] {
  return routes.map((route, routeIndex) =>
    route.stops.map((_, stopIndex) => ({
      speedX: 1.2 + Math.sin(routeIndex * 2.3 + stopIndex * 1.7) * 0.5,
      speedY: 1.0 + Math.cos(routeIndex * 1.9 + stopIndex * 2.1) * 0.45,
      amplitudeX: 14 + Math.sin(routeIndex * 3.1 + stopIndex * 2.5) * 8,
      amplitudeY: 12 + Math.cos(routeIndex * 2.7 + stopIndex * 1.3) * 6,
      phaseX: (routeIndex * 1.5 + stopIndex * 2.3) % (Math.PI * 2),
      phaseY: (routeIndex * 2.1 + stopIndex * 1.8) % (Math.PI * 2),
    })),
  );
}

const ROUTES: Route[] = [
  {
    name: "Alpine Classic",
    color: "#ef4444",
    stops: [
      { name: "München", x: 0.08, y: 0.22 },
      { name: "Innsbruck", x: 0.18, y: 0.12 },
      { name: "Zürich", x: 0.3, y: 0.08 },
      { name: "Milano", x: 0.42, y: 0.18 },
      { name: "Nice", x: 0.35, y: 0.32 },
    ],
  },
  {
    name: "North Sea Tour",
    color: "#ef4444",
    stops: [
      { name: "Hamburg", x: 0.55, y: 0.1 },
      { name: "Amsterdam", x: 0.68, y: 0.06 },
      { name: "Brussels", x: 0.8, y: 0.14 },
      { name: "London", x: 0.92, y: 0.24 },
    ],
  },
  {
    name: "Rhine Valley",
    color: "#ef4444",
    stops: [
      { name: "Frankfurt", x: 0.1, y: 0.52 },
      { name: "Köln", x: 0.22, y: 0.44 },
      { name: "Düsseldorf", x: 0.34, y: 0.52 },
      { name: "Stuttgart", x: 0.46, y: 0.42 },
      { name: "Basel", x: 0.54, y: 0.35 },
    ],
  },
  {
    name: "Mediterranean",
    color: "#ef4444",
    stops: [
      { name: "Barcelona", x: 0.62, y: 0.42 },
      { name: "Marseille", x: 0.74, y: 0.48 },
      { name: "Monaco", x: 0.84, y: 0.4 },
      { name: "Rome", x: 0.92, y: 0.52 },
    ],
  },
  {
    name: "Eastern Express",
    color: "#ef4444",
    stops: [
      { name: "Berlin", x: 0.12, y: 0.75 },
      { name: "Dresden", x: 0.26, y: 0.82 },
      { name: "Prague", x: 0.42, y: 0.78 },
      { name: "Vienna", x: 0.56, y: 0.72 },
      { name: "Budapest", x: 0.68, y: 0.65 },
    ],
  },
  {
    name: "Iberian Coast",
    color: "#ef4444",
    stops: [
      { name: "Madrid", x: 0.76, y: 0.75 },
      { name: "Lisbon", x: 0.86, y: 0.68 },
      { name: "Porto", x: 0.94, y: 0.82 },
    ],
  },
];

const STOP_ANIMATIONS = generateStopAnimations(ROUTES);

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animationFrameRef = useRef<number>(0);
  const hoveredRouteRef = useRef<number | null>(null);
  const hoveredStopRef = useRef<{ route: number; stop: number } | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });

  const isDraggingRef = useRef(false);
  const dragStopRef = useRef<{ route: number; stop: number } | null>(null);

  const stopOffsetsRef = useRef<{ x: number; y: number }[][]>(
    ROUTES.map((route) => route.stops.map(() => ({ x: 0, y: 0 }))),
  );

  const stopVelocitiesRef = useRef<{ vx: number; vy: number }[][]>(
    ROUTES.map((route) => route.stops.map(() => ({ vx: 0, vy: 0 }))),
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dimensionsRef.current = { width: canvas.width, height: canvas.height };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const newMouse = { x: e.clientX, y: e.clientY };

      if (isDraggingRef.current && dragStopRef.current !== null) {
        const dx = newMouse.x - mouseRef.current.x;
        const dy = newMouse.y - mouseRef.current.y;
        const { route, stop } = dragStopRef.current;
        stopOffsetsRef.current[route][stop].x += dx;
        stopOffsetsRef.current[route][stop].y += dy;

        stopVelocitiesRef.current[route][stop].vx = dx * 0.2;
        stopVelocitiesRef.current[route][stop].vy = dy * 0.2;
      }

      mouseRef.current = newMouse;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        const newMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };

        if (isDraggingRef.current && dragStopRef.current !== null) {
          const dx = newMouse.x - mouseRef.current.x;
          const dy = newMouse.y - mouseRef.current.y;
          const { route, stop } = dragStopRef.current;
          stopOffsetsRef.current[route][stop].x += dx;
          stopOffsetsRef.current[route][stop].y += dy;

          stopVelocitiesRef.current[route][stop].vx = dx * 0.8;
          stopVelocitiesRef.current[route][stop].vy = dy * 0.8;
        }

        mouseRef.current = newMouse;
      }
    };

    const handleMouseDown = () => {
      if (hoveredStopRef.current !== null) {
        isDraggingRef.current = true;
        dragStopRef.current = { ...hoveredStopRef.current };
        canvas.style.cursor = "grabbing";
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      dragStopRef.current = null;
      canvas.style.cursor = hoveredStopRef.current ? "grab" : "default";
    };

    const handleTouchStart = () => {
      if (hoveredStopRef.current !== null) {
        isDraggingRef.current = true;
        dragStopRef.current = { ...hoveredStopRef.current };
      }
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
      dragStopRef.current = null;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchend", handleTouchEnd);

    const animate = () => {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;
      const time = Date.now() / 1000;
      const { width, height } = dimensionsRef.current;

      for (let r = 0; r < ROUTES.length; r++) {
        for (let s = 0; s < ROUTES[r].stops.length; s++) {
          const vel = stopVelocitiesRef.current[r][s];
          const offset = stopOffsetsRef.current[r][s];

          offset.x += vel.vx;
          offset.y += vel.vy;

          vel.vx *= 0.85;
          vel.vy *= 0.85;

          if (Math.abs(vel.vx) < 0.01) vel.vx = 0;
          if (Math.abs(vel.vy) < 0.01) vel.vy = 0;
        }
      }

      if (!isDraggingRef.current) {
        canvas.style.cursor = hoveredStopRef.current ? "grab" : "default";
      }

      hoveredStopRef.current = null;
      hoveredRouteRef.current = null;

      for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex++) {
        const route = ROUTES[routeIndex];

        for (let stopIndex = 0; stopIndex < route.stops.length; stopIndex++) {
          const stop = route.stops[stopIndex];
          const stopOffset = stopOffsetsRef.current[routeIndex][stopIndex];
          const anim = STOP_ANIMATIONS[routeIndex][stopIndex];

          const floatX =
            Math.sin(time * anim.speedX + anim.phaseX) * anim.amplitudeX;
          const floatY =
            Math.cos(time * anim.speedY + anim.phaseY) * anim.amplitudeY;

          const x = stop.x * width + floatX + stopOffset.x;
          const y = stop.y * height + floatY + stopOffset.y;

          const dx = mouse.x - x;
          const dy = mouse.y - y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 30) {
            hoveredStopRef.current = { route: routeIndex, stop: stopIndex };
            hoveredRouteRef.current = routeIndex;
            break;
          }
        }
        if (hoveredRouteRef.current !== null) break;
      }

      ROUTES.forEach((route, routeIndex) => {
        const isHovered = hoveredRouteRef.current === routeIndex;

        const routeStops = route.stops.map((stop, stopIndex) => {
          const stopOffset = stopOffsetsRef.current[routeIndex][stopIndex];
          const anim = STOP_ANIMATIONS[routeIndex][stopIndex];

          const floatX =
            Math.sin(time * anim.speedX + anim.phaseX) * anim.amplitudeX;
          const floatY =
            Math.cos(time * anim.speedY + anim.phaseY) * anim.amplitudeY;

          return {
            x: stop.x * width + floatX + stopOffset.x,
            y: stop.y * height + floatY + stopOffset.y,
          };
        });

        if (routeStops.length > 1) {
          ctx.beginPath();
          ctx.moveTo(routeStops[0].x, routeStops[0].y);

          for (let i = 1; i < routeStops.length; i++) {
            ctx.lineTo(routeStops[i].x, routeStops[i].y);
          }

          ctx.strokeStyle = isHovered ? route.color : `${route.color}50`;
          ctx.lineWidth = isHovered ? 3 : 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();

          for (let i = 0; i < routeStops.length - 1; i++) {
            const start = routeStops[i];
            const end = routeStops[i + 1];

            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            const pulseProgress = (time * 0.5 + i * 0.4 + routeIndex * 0.2) % 1;
            const pulseX = start.x + dx * pulseProgress;
            const pulseY = start.y + dy * pulseProgress;

            const dotSize = isHovered
              ? 6 + Math.sin(pulseProgress * Math.PI) * 2
              : 3 + Math.sin(pulseProgress * Math.PI) * 1;
            ctx.beginPath();
            ctx.arc(pulseX, pulseY, dotSize, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? route.color : `${route.color}40`;
            ctx.fill();

            ctx.save();
            ctx.translate(pulseX, pulseY);
            ctx.rotate(angle);
            ctx.beginPath();
            const arrowSize = isHovered ? 8 : 5;
            ctx.moveTo(arrowSize, 0);
            ctx.lineTo(arrowSize - 6, -3);
            ctx.lineTo(arrowSize - 6, 3);
            ctx.closePath();
            ctx.fillStyle = isHovered ? route.color : `${route.color}35`;
            ctx.fill();
            ctx.restore();

            const numArrows = Math.floor(length / 60);
            for (let j = 1; j <= numArrows; j++) {
              const progress = j / (numArrows + 1);
              const arrowX = start.x + dx * progress;
              const arrowY = start.y + dy * progress;

              ctx.save();
              ctx.translate(arrowX, arrowY);
              ctx.rotate(angle);
              ctx.beginPath();
              ctx.moveTo(5, 0);
              ctx.lineTo(-3, -4);
              ctx.lineTo(-3, 4);
              ctx.closePath();
              ctx.fillStyle = isHovered
                ? `${route.color}70`
                : `${route.color}20`;
              ctx.fill();
              ctx.restore();
            }
          }
        }

        route.stops.forEach((stop, stopIndex) => {
          const stopOffset = stopOffsetsRef.current[routeIndex][stopIndex];
          const anim = STOP_ANIMATIONS[routeIndex][stopIndex];

          const floatX =
            Math.sin(time * anim.speedX + anim.phaseX) * anim.amplitudeX;
          const floatY =
            Math.cos(time * anim.speedY + anim.phaseY) * anim.amplitudeY;

          const x = stop.x * width + floatX + stopOffset.x;
          const y = stop.y * height + floatY + stopOffset.y;
          const isStopHovered =
            hoveredStopRef.current?.route === routeIndex &&
            hoveredStopRef.current?.stop === stopIndex;

          if (isStopHovered) {
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, 50);
            gradient.addColorStop(0, `${route.color}40`);
            gradient.addColorStop(1, `${route.color}00`);
            ctx.beginPath();
            ctx.arc(x, y, 50, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
          }

          const radius = isStopHovered ? 12 : isHovered ? 10 : 8;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isHovered ? route.color : `${route.color}70`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
          ctx.fillStyle = isStopHovered
            ? "#ffffff"
            : isHovered
              ? "#1a1a1a"
              : "#0a0a0a";
          ctx.fill();

          const fontSize = isStopHovered ? 13 : isHovered ? 12 : 10;
          ctx.font = `${isStopHovered || isHovered ? "600 " : "500 "}${fontSize}px var(--font-raleway), system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          ctx.fillText(stop.name, x + 1, y + radius + 5);

          ctx.fillStyle = isStopHovered
            ? "#ffffff"
            : isHovered
              ? "rgba(255, 255, 255, 0.95)"
              : "rgba(255, 255, 255, 0.6)";
          ctx.fillText(stop.name, x, y + radius + 4);
        });

        if (isHovered && routeStops.length > 0) {
          const firstStop = routeStops[0];
          ctx.font = "bold 14px var(--font-raleway), system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";

          const textWidth = ctx.measureText(route.name).width;
          ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
          ctx.fillRect(firstStop.x - 5, firstStop.y - 38, textWidth + 10, 22);

          ctx.fillStyle = route.color;
          ctx.fillText(route.name, firstStop.x, firstStop.y - 20);
        }
      });

      if (hoveredRouteRef.current === null) {
        ctx.font = "11px var(--font-raleway), system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fillText(
          "Hover over routes to explore",
          canvas.width / 2,
          canvas.height - 30,
        );
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
      style={{ background: "transparent" }}
    />
  );
}
