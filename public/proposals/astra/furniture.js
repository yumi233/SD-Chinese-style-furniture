/* Local procedural furniture and brightness-sampled digital treatments. No assets. */
(function () {
  "use strict";
  const palette = { blue: ["#345be7", "#1c389c", "#6a86ff"], wood: ["#b68b58", "#765634", "#d6b27f"] };
  function drawSource(canvas, design = {}) {
    canvas.width = 1000; canvas.height = 760;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    c.clearRect(0, 0, 1000, 760);
    const colors = palette[design.material === "wood" ? "wood" : "blue"];
    const type = design.type || "chair";
    const thin = design.thin || false;
    const spread = design.spread || 1;
    const project = (x, y, z) => [500 + x * .92 * spread - z * .68, 560 - y * .92 + x * .24 * spread + z * .32];
    const poly = (points, fill) => {
      c.beginPath(); points.forEach((point, i) => { const p = project(...point); i ? c.lineTo(...p) : c.moveTo(...p); }); c.closePath(); c.fillStyle = fill; c.fill();
    };
    const beam = (x, y, z, w, h, d) => {
      poly([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]], colors[1]);
      poly([[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]], colors[0]);
      poly([[x+w,y,z],[x+w,y,z+d],[x+w,y+h,z+d],[x+w,y+h,z]], colors[1]);
      poly([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]], colors[2]);
      poly([[x,y,z],[x,y,z+d],[x,y+h,z+d],[x,y+h,z]], colors[0]);
    };
    const tube = (points, width, color) => {
      c.beginPath(); const p = points.map(a => project(...a)); c.moveTo(...p[0]);
      for (let i = 1; i < p.length - 1; i++) c.quadraticCurveTo(...p[i], (p[i][0] + p[i+1][0])/2, (p[i][1]+p[i+1][1])/2);
      c.lineTo(...p[p.length-1]); c.lineWidth = width; c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = color; c.stroke();
    };
    // The shadow is sparse linework, so the furniture remains a digital drawing.
    c.save(); c.translate(505, 600); c.scale(1, .25); c.strokeStyle = "#c3c9d9"; c.lineWidth = 1;
    for (let r = 50; r < 280; r += 20) { c.beginPath(); c.ellipse(0, 0, r, r * .8, 0, 0, Math.PI * 2); c.stroke(); } c.restore();
    if (type === "table") {
      for (const x of [-205, 178]) for (const z of [-80, 75]) beam(x, 0, z, thin ? 15 : 24, 250, 24);
      beam(-218, 235, -100, 440, thin ? 15 : 28, 220);
      beam(-196, 192, 70, 380, 16, 12);
    } else if (type === "cabinet") {
      for (const x of [-192, 170]) for (const z of [-65, 70]) beam(x, 0, z, 18, 100, 20);
      beam(-220, 100, -88, 440, thin ? 185 : 220, 190);
      for (let x = -202; x < 210; x += thin ? 16 : 24) beam(x, 114, 103, 5, thin ? 154 : 190, 3);
      beam(-220, thin ? 285 : 320, -88, 440, 12, 190);
    } else {
      const leg = thin ? 15 : 23;
      beam(-122, 0, -102, leg, 420, 22); beam(105, 0, -102, leg, 420, 22);
      tube([[-109, 390, -92],[-70, 432,-126],[0,440,-132],[75,432,-125],[116,390,-90]], thin ? 18 : 28, colors[1]);
      for (const x of [-122,105]) beam(x, 0, 105, leg, 230, 22);
      beam(-130, 210, -106, 264, thin ? 17 : 27, 240);
      beam(-108, 100, 106, 210, 12, 10);
      beam(-122, 100, -80, 12, 12, 198);
      beam(106, 100, -80, 12, 12, 198);
      beam(-20, 238, -105, thin ? 30 : 48, 152, 13);
      tube([[-120,330,120],[-148,365,50],[-148,403,-44],[-120,426,-105],[-60,450,-140],[10,454,-145],[82,438,-125],[137,405,-65],[150,363,45],[128,330,120]], thin ? 15 : 27, colors[0]);
      tube([[-120,335,120],[-142,370,50],[-143,407,-44],[-117,430,-105],[-60,454,-140],[10,458,-145],[82,442,-125],[132,409,-65],[145,367,45],[128,335,120]], thin ? 4 : 7, colors[2]);
      beam(-122, 230, 100, 13, 106, 16); beam(114, 230, 100, 13, 106, 16);
    }
    return canvas;
  }
  const bayer = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
  function render(canvas, design = {}, options = {}) {
    const width = canvas.width, height = canvas.height;
    const c = canvas.getContext("2d"); c.clearRect(0,0,width,height);
    const source = document.createElement("canvas"); drawSource(source, design);
    const scale = Math.min(width/1000, height/760) * (options.zoom || 1);
    const x = (width - 1000 * scale)/2 + (options.panX || 0);
    const y = (height - 760 * scale)/2 + (options.panY || 0);
    c.save(); c.translate(x,y); c.scale(scale,scale);
    const mode = options.mode || "solid";
    if (mode === "solid") { c.drawImage(source,0,0); c.restore(); return; }
    const s = source.getContext("2d"); const data = s.getImageData(0,0,1000,760).data;
    const step = Math.max(3, Number(options.grain || 5));
    const intensity = Number(options.intensity ?? 70)/100;
    const mask = Number(options.mask ?? (mode === "ascii" ? 90 : 88))/100;
    const texture = Number(options.texture || 2);
    const chars = ".,:;+=*#%@";
    if (mode === "ascii") { c.font = `${options.fontSize || step + 2}px ui-monospace, monospace`; c.textBaseline = "middle"; }
    for (let py = 0; py < 760; py += step) {
      for (let px = 0; px < 1000; px += step) {
        const i = (py * 1000 + px)*4; if (data[i+3] < 120) continue;
        const lum = (data[i]*.2126 + data[i+1]*.7152 + data[i+2]*.0722)/255;
        const strength = Math.max(0, Math.min(1, (.8 - lum) * (1 + intensity * 2)));
        // Fade is vertical but never removes the entire silhouette on mobile.
        c.globalAlpha = Math.max(.24, 1 - mask * Math.pow(py/760, 2));
        if (mode === "ascii") {
          const sampled = options.sample === "light" ? 1 - strength : strength;
          c.fillStyle = design.material === "wood" ? "#775431" : "#244be8";
          c.fillText(chars[Math.min(chars.length-1, Math.floor(sampled * chars.length))], px, py);
        } else {
          const threshold = (bayer[Math.floor(py/step/texture)%4][Math.floor(px/step/texture)%4] + .5)/16;
          const levels = Math.max(2, Math.round(6 - intensity*4));
          const value = Math.max(0, Math.min(1, Math.floor(strength * levels + threshold)/levels));
          c.fillStyle = design.material === "wood" ? `rgb(${155-value*70},${122-value*65},${90-value*60})` : `rgb(${140-value*110},${163-value*110},${244-value*30})`;
          c.fillRect(px,py,Math.max(1,step-1),Math.max(1,step-1));
        }
      }
    }
    c.restore(); c.globalAlpha = 1;
  }
  window.Furniture = { render, drawSource };
})();
