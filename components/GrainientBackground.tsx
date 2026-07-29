"use client";

// Fixed, full-viewport wrapper around Grainient — sits behind every page
// in the app (mounted once in the root layout) rather than a fixed
// 1080x1080 box, since the ask was a whole-project background rather than
// a single panel's decoration. Settings match the requested "background
// use" preset exactly.
import Grainient from "./Grainient";

export default function GrainientBackground() {
  return (
    <div className="grainient-bg" aria-hidden="true">
      <Grainient
        color1="#c4c7d2"
        color2="#dcdcdc"
        color3="#ababab"
        timeSpeed={1.35}
        colorBalance={-0.01}
        warpStrength={1.5}
        warpFrequency={5}
        warpSpeed={2}
        warpAmplitude={50}
        blendAngle={0}
        blendSoftness={0.44}
        rotationAmount={500}
        noiseScale={0.3}
        grainAmount={0.1}
        grainScale={4.4}
        grainAnimated={false}
        contrast={1.5}
        gamma={1}
        saturation={1}
        centerX={0}
        centerY={0}
        zoom={0.9}
      />
    </div>
  );
}
