(function () {
  "use strict";

  const PAPER = "#f3f0e5";
  const INK = "#191c18";
  const ORANGE = "#e0522b";
  const LIME = "#c8f05a";

  const MATERIALS = {
    ming: {
      top: "#d7a46b",
      left: "#a76d3f",
      right: "#81502f",
      edge: "#3d2a1f",
      accent: "#e0522b"
    },
    modern: {
      top: "#d8c39e",
      left: "#baa179",
      right: "#8f795b",
      edge: "#3f3930",
      accent: "#c8f05a"
    },
    song: {
      top: "#b88459",
      left: "#8f5e3c",
      right: "#68422e",
      edge: "#30241e",
      accent: "#e0522b"
    },
    zen: {
      top: "#dfcda8",
      left: "#bdab89",
      right: "#92846a",
      edge: "#3e3c32",
      accent: "#b8d957"
    }
  };

  const TYPES = {
    chair: { label: "扶手椅", width: 620, depth: 560, height: 940 },
    table: { label: "桌案", width: 940, depth: 560, height: 800 },
    cabinet: { label: "立柜", width: 720, depth: 420, height: 1180 },
    stool: { label: "坐凳", width: 500, depth: 500, height: 620 }
  };

  const STYLE_LABELS = {
    ming: "明式",
    modern: "新中式",
    song: "宋韵",
    zen: "禅意"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fillPoly(ctx, points, fill, stroke, lineWidth) {
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point[0], point[1]);
      } else {
        ctx.lineTo(point[0], point[1]);
      }
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1.5;
      ctx.stroke();
    }
  }

  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash(dash || []);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawPaper(ctx, width, height, seed) {
    const rand = mulberry32(seed || 1);
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, "#f8f5eb");
    wash.addColorStop(0.58, PAPER);
    wash.addColorStop(1, "#e8e4d7");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 22; i += 1) {
      const x = rand() * width;
      const y = rand() * height;
      ctx.fillStyle = i % 3 === 0 ? "rgba(224,82,43,0.06)" : "rgba(25,28,24,0.035)";
      ctx.beginPath();
      ctx.arc(x, y, 16 + rand() * 80, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    for (let x = 48; x < width; x += 48) {
      line(ctx, x, 0, x, height, "rgba(25,28,24,0.045)", 1);
    }
    for (let y = 48; y < height; y += 48) {
      line(ctx, 0, y, width, y, "rgba(25,28,24,0.045)", 1);
    }
    for (let x = 0; x < width; x += 192) {
      line(ctx, x, 0, x, height, "rgba(25,28,24,0.095)", 1);
    }
    for (let y = 0; y < height; y += 192) {
      line(ctx, 0, y, width, y, "rgba(25,28,24,0.095)", 1);
    }

    const vignette = ctx.createRadialGradient(
      width * 0.48,
      height * 0.42,
      width * 0.1,
      width * 0.5,
      height * 0.5,
      width * 0.72
    );
    vignette.addColorStop(0, "rgba(255,255,255,0.06)");
    vignette.addColorStop(1, "rgba(38,34,25,0.1)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function drawRegistration(ctx, width, height, label) {
    const pad = 42;
    const arm = 22;
    ctx.save();
    ctx.strokeStyle = "rgba(25,28,24,0.46)";
    ctx.lineWidth = 1;
    [
      [pad, pad, 1, 1],
      [width - pad, pad, -1, 1],
      [pad, height - pad, 1, -1],
      [width - pad, height - pad, -1, -1]
    ].forEach(([x, y, dx, dy]) => {
      line(ctx, x, y, x + arm * dx, y, "rgba(25,28,24,0.46)", 1);
      line(ctx, x, y, x, y + arm * dy, "rgba(25,28,24,0.46)", 1);
    });
    ctx.fillStyle = "rgba(25,28,24,0.56)";
    ctx.font = '600 16px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText(label, pad, pad - 16);
    ctx.textAlign = "right";
    ctx.fillText("木生 / 构序系统", width - pad, height - pad + 28);
    ctx.restore();
  }

  function drawGround(ctx, width, height, type) {
    const cx = width * 0.53;
    const cy = height * 0.76;
    const scale = type === "table" || type === "cabinet" ? 0.88 : 0.98;
    const base = 260 * scale;
    const shadow = ctx.createRadialGradient(cx, cy + 12, 20, cx, cy + 12, base * 1.2);
    shadow.addColorStop(0, "rgba(25,28,24,0.24)");
    shadow.addColorStop(0.55, "rgba(25,28,24,0.09)");
    shadow.addColorStop(1, "rgba(25,28,24,0)");
    ctx.fillStyle = shadow;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, base, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.45;
    const isoTriangle = [
      [cx - 280, cy + 40],
      [cx + 260, cy + 40],
      [cx + 45, cy - 96]
    ];
    fillPoly(ctx, isoTriangle, null, "rgba(25,28,24,0.18)", 1);
    line(ctx, cx - 230, cy + 4, cx + 204, cy + 4, "rgba(25,28,24,0.17)", 1, [4, 8]);
    line(ctx, cx - 112, cy + 4, cx + 40, cy - 82, "rgba(25,28,24,0.15)", 1, [4, 8]);
    line(ctx, cx + 114, cy + 4, cx - 28, cy - 82, "rgba(25,28,24,0.15)", 1, [4, 8]);
    ctx.restore();
  }

  function makeProjector(width, height, type, seed) {
    const rand = mulberry32(seed);
    const typeScale = type === "cabinet" ? 0.82 : type === "table" ? 0.73 : type === "stool" ? 1.03 : 0.88;
    const wobble = (rand() - 0.5) * 12;
    const scale = Math.min(width, height) * 0.00058 * typeScale;
    const ox = width * 0.46 + wobble;
    const oy = height * (type === "table" ? 0.6 : type === "cabinet" ? 0.62 : 0.63);
    return {
      scale,
      point(point) {
        return [
          ox + (point[0] - point[1]) * 0.866 * scale,
          oy + (point[0] + point[1]) * 0.5 * scale - point[2] * scale
        ];
      }
    };
  }

  function makeBox(projector, spec) {
    const p = projector.point;
    const x0 = spec.x;
    const y0 = spec.y;
    const z0 = spec.z;
    const x1 = x0 + spec.w;
    const y1 = y0 + spec.d;
    const z1 = z0 + spec.h;
    const a = p([x0, y0, z1]);
    const b = p([x1, y0, z1]);
    const c = p([x1, y1, z1]);
    const d = p([x0, y1, z1]);
    const e = p([x0, y0, z0]);
    const f = p([x1, y0, z0]);
    const g = p([x1, y1, z0]);
    const h = p([x0, y1, z0]);
    return {
      depth: x0 + y0 + spec.w * 0.5 + spec.d * 0.5,
      draw(ctx, material) {
        fillPoly(ctx, [a, b, c, d], spec.top || material.top, material.edge, 1.25);
        fillPoly(ctx, [b, f, g, c], spec.right || material.right, material.edge, 1.25);
        fillPoly(ctx, [d, c, g, h], spec.left || material.left, material.edge, 1.25);

        if (spec.grain !== false) {
          ctx.save();
          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = "#fff4dd";
          ctx.lineWidth = 1;
          for (let i = 1; i < 4; i += 1) {
            const t = i / 4;
            const left = [
              a[0] + (d[0] - a[0]) * t,
              a[1] + (d[1] - a[1]) * t
            ];
            const right = [
              b[0] + (c[0] - b[0]) * t,
              b[1] + (c[1] - b[1]) * t
            ];
            line(ctx, left[0], left[1], right[0], right[1], "rgba(255,244,221,0.32)", 1);
          }
          ctx.restore();
        }

        if (spec.accent) {
          const inset = 0.24;
          const marker = [
            a[0] + (b[0] - a[0]) * 0.76,
            a[1] + (b[1] - a[1]) * 0.76
          ];
          ctx.fillStyle = material.accent;
          ctx.fillRect(marker[0] - 5, marker[1] + 4, 10, 3);
        }
      }
    };
  }

  function buildChair(projector, version) {
    const boxes = [];
    const leg = 42;
    const seatH = 430;
    const armW = version > 1 ? 24 : 40;
    const backLean = version > 2 ? 22 : 0;
    const positions = [
      [12, 18],
      [620 - leg - 12, 18],
      [12, 560 - leg - 18],
      [620 - leg - 12, 560 - leg - 18]
    ];

    positions.slice(0, 2).forEach(([x, y]) => {
      boxes.push(
        makeBox(projector, {
          x,
          y,
          z: seatH,
          w: leg,
          d: leg,
          h: 470 + backLean,
          top: "#b37d4c",
          accent: x < 100
        })
      );
    });
    positions.slice(2).forEach(([x, y]) => {
      boxes.push(makeBox(projector, { x, y, z: 0, w: leg, d: leg, h: seatH }));
    });

    if (version > 1) {
      [-20, 178, 376, 574].forEach((x) => {
        boxes.push(
          makeBox(projector, {
            x: 30 + x,
            y: 34,
            z: seatH + 120,
            w: 24,
            d: 24,
            h: 300,
            grain: false
          })
        );
      });
    }

    boxes.push(
      makeBox(projector, {
        x: 12,
        y: 18,
        z: seatH + 450 + backLean,
        w: 596,
        d: 48,
        h: 66,
        top: "#c18a55",
        accent: true
      })
    );

    boxes.push(
      makeBox(projector, {
        x: 24,
        y: 20,
        z: 0,
        w: 24,
        d: 24,
        h: seatH,
        grain: false
      })
    );
    boxes.push(
      makeBox(projector, {
        x: 572,
        y: 20,
        z: 0,
        w: 24,
        d: 24,
        h: seatH,
        grain: false
      })
    );

    boxes.push(
      makeBox(projector, {
        x: 8,
        y: 4,
        z: seatH,
        w: 604,
        d: 552,
        h: 56,
        top: "#d7a46b",
        accent: false
      })
    );

    if (version < 3) {
      [24, 564 - armW].forEach((x) => {
        boxes.push(
          makeBox(projector, {
            x,
            y: 36,
            z: seatH + 180,
            w: armW,
            d: 356,
            h: 30,
            grain: false,
            accent: true
          })
        );
        boxes.push(
          makeBox(projector, {
            x: x + (x < 100 ? 5 : -5),
            y: 360,
            z: seatH,
            w: Math.max(20, armW - 10),
            d: Math.max(20, armW - 10),
            h: 210,
            grain: false
          })
        );
      });
    }

    if (version > 2) {
      boxes.push(
        makeBox(projector, {
          x: 64,
          y: 24,
          z: seatH + 92,
          w: 492,
          d: 18,
          h: 50,
          grain: false
        })
      );
    }

    return boxes.sort((a, b) => a.depth - b.depth);
  }

  function buildTable(projector, version) {
    const boxes = [];
    const leg = 54;
    const tableH = 720;
    const positions = [
      [34, 30],
      [906 - leg, 30],
      [34, 520 - leg],
      [906 - leg, 520 - leg]
    ];
    positions.forEach(([x, y], index) => {
      boxes.push(
        makeBox(projector, {
          x,
          y,
          z: 0,
          w: leg,
          d: leg,
          h: tableH,
          top: index < 2 ? "#b8814e" : undefined
        })
      );
    });
    boxes.push(
      makeBox(projector, {
        x: 42,
        y: 54,
        z: 160,
        w: 854,
        d: 30,
        h: 28,
        grain: false
      })
    );
    boxes.push(
      makeBox(projector, {
        x: 0,
        y: 0,
        z: tableH,
        w: 940,
        d: 560,
        h: 66,
        top: "#d9a56a",
        accent: version > 1
      })
    );
    if (version > 1) {
      boxes.push(
        makeBox(projector, {
          x: 86,
          y: 92,
          z: 500,
          w: 768,
          d: 368,
          h: 18,
          grain: false
        })
      );
    }
    return boxes.sort((a, b) => a.depth - b.depth);
  }

  function buildCabinet(projector, version) {
    const boxes = [];
    const leg = 46;
    [
      [20, 24],
      [674, 24],
      [20, 350],
      [674, 350]
    ].forEach(([x, y]) => {
      boxes.push(makeBox(projector, { x, y, z: 0, w: leg, d: leg, h: 160 }));
    });
    boxes.push(
      makeBox(projector, {
        x: 0,
        y: 0,
        z: 160,
        w: 720,
        d: 420,
        h: 990,
        top: "#ca9762"
      })
    );
    boxes.push(
      makeBox(projector, {
        x: 24,
        y: 12,
        z: 210,
        w: 320,
        d: 26,
        h: 862,
        grain: false
      })
    );
    boxes.push(
      makeBox(projector, {
        x: 376,
        y: 12,
        z: 210,
        w: 320,
        d: 26,
        h: 862,
        grain: false
      })
    );
    boxes.push(
      makeBox(projector, {
        x: 326,
        y: 4,
        z: 580,
        w: 68,
        d: 36,
        h: 34,
        grain: false,
        accent: version > 1
      })
    );
    if (version > 1) {
      boxes.push(
        makeBox(projector, {
          x: 44,
          y: 34,
          z: 1040,
          w: 632,
          d: 20,
          h: 34,
          grain: false
        })
      );
    }
    return boxes.sort((a, b) => a.depth - b.depth);
  }

  function buildStool(projector, version) {
    const boxes = [];
    const leg = 38;
    const h = 540;
    [
      [48, 52],
      [414, 52],
      [48, 410],
      [414, 410]
    ].forEach(([x, y]) => {
      boxes.push(makeBox(projector, { x, y, z: 0, w: leg, d: leg, h }));
    });
    boxes.push(
      makeBox(projector, {
        x: 0,
        y: 0,
        z: h,
        w: 500,
        d: 500,
        h: 62,
        top: "#d8a66a",
        accent: true
      })
    );
    if (version > 1) {
      boxes.push(
        makeBox(projector, {
          x: 48,
          y: 420,
          z: 180,
          w: 404,
          d: 22,
          h: 24,
          grain: false
        })
      );
    }
    return boxes.sort((a, b) => a.depth - b.depth);
  }

  function drawFurniture(ctx, width, height, opts) {
    const type = TYPES[opts.type] ? opts.type : "chair";
    const material = MATERIALS[opts.style] || MATERIALS.ming;
    const projector = makeProjector(width, height, type, opts.seed || 1);
    const version = Number(opts.version) || 1;
    let boxes = [];
    if (type === "chair") {
      boxes = buildChair(projector, version);
    } else if (type === "table") {
      boxes = buildTable(projector, version);
    } else if (type === "cabinet") {
      boxes = buildCabinet(projector, version);
    } else {
      boxes = buildStool(projector, version);
    }
    boxes.forEach((box) => box.draw(ctx, material));

    const p = projector.point;
    if (type === "chair") {
      const top = p([310, 42, 520 + (version > 2 ? 22 : 0)]);
      ctx.save();
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(top[0], top[1] + 46, 6, 0, Math.PI * 2);
      ctx.stroke();
      line(ctx, top[0] + 14, top[1] + 46, top[0] + 78, top[1] + 46, ORANGE, 1.5);
      ctx.fillStyle = ORANGE;
      ctx.font = '600 15px "Avenir Next", "PingFang SC", sans-serif';
      ctx.fillText(version > 1 ? "扶手减薄 42%" : "连续曲面", top[0] + 84, top[1] + 51);
      ctx.restore();
    }
  }

  function drawDimensions(ctx, width, height, opts) {
    const type = TYPES[opts.type] || TYPES.chair;
    const data = `${type.width} × ${type.depth} × ${type.height}`;
    ctx.save();
    ctx.fillStyle = "rgba(25,28,24,0.58)";
    ctx.font = '500 15px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText(data, 58, height - 66);
    ctx.fillStyle = "rgba(25,28,24,0.42)";
    ctx.fillText(`${STYLE_LABELS[opts.style] || "明式"} / ${type.label} / V${String(opts.version || 1).padStart(2, "0")}`, 58, height - 42);
    ctx.restore();
  }

  function drawBase(canvas, opts) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    drawPaper(ctx, width, height, (opts.seed || 1) + 47);
    drawGround(ctx, width, height, opts.type);
    drawFurniture(ctx, width, height, opts);
    drawRegistration(ctx, width, height, `构序记录 / ${String(opts.version || 1).padStart(2, "0")}`);
    drawDimensions(ctx, width, height, opts);
    return ctx;
  }

  function pixelAt(data, width, height, x, y) {
    const safeX = Math.max(0, Math.min(width - 1, x));
    const safeY = Math.max(0, Math.min(height - 1, y));
    const index = (safeY * width + safeX) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  }

  function luminance(rgb) {
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  }

  function saturation(rgb) {
    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    return max === 0 ? 0 : (max - min) / max;
  }

  function applyVerticalMask(ctx, width, height, mask, color) {
    const amount = clamp(mask / 100, 0, 1);
    if (amount <= 0) {
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(243,240,229,0)");
    gradient.addColorStop(0.5, `rgba(243,240,229,${0.04 * amount})`);
    gradient.addColorStop(1, `rgba(${color || "34,33,27"},${0.45 * amount})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function applyASCII(source, target, opts) {
    const width = target.width;
    const height = target.height;
    const sourceCtx = source.getContext("2d", { willReadFrequently: true });
    const data = sourceCtx.getImageData(0, 0, width, height).data;
    const ctx = target.getContext("2d");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 0.16;
    ctx.drawImage(source, 0, 0);
    ctx.globalAlpha = 1;

    const cell = clamp(Number(opts.grid) || 14, 6, 24);
    const ramp = [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];
    const contrast = clamp((Number(opts.contrast) || 62) / 100, 0.25, 1);
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(7, cell)}px "SFMono-Regular", "Menlo", monospace`;

    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const sample = pixelAt(data, width, height, x + Math.floor(cell / 2), y + Math.floor(cell / 2));
        let lum = luminance(sample);
        const chroma = saturation(sample);
        if (lum > 0.88 && chroma < 0.18) {
          continue;
        }
        lum = clamp(0.5 + (lum - 0.5) * (0.45 + contrast * 1.35), 0, 1);
        const darkness = clamp((0.97 - lum) / 0.86, 0, 1);
        const lev = clamp(Math.floor(Math.pow(darkness, 0.52) * (ramp.length - 1) + 0.2), 0, ramp.length - 1);
        const char = ramp[lev];
        if (!char.trim()) {
          continue;
        }
        const signal = lum < 0.23 && chroma > 0.18 && (x + y) % 97 < 22;
        ctx.fillStyle = signal ? ORANGE : `rgba(25,28,24,${0.62 + (1 - lum) * 0.36})`;
        ctx.fillText(char, x, y + cell / 2);
      }
    }
    applyVerticalMask(ctx, width, height, opts.mask, "31,29,24");
  }

  function applyDither(source, target, opts) {
    const width = target.width;
    const height = target.height;
    const sourceCtx = source.getContext("2d", { willReadFrequently: true });
    const data = sourceCtx.getImageData(0, 0, width, height).data;
    const ctx = target.getContext("2d");
    const block = clamp(Number(opts.grid) || 8, 4, 18);
    const contrast = clamp((Number(opts.contrast) || 66) / 100, 0.25, 1);
    const palette = opts.style === "modern"
      ? ["#f3f0e5", "#d9d5c8", "#b5a681", "#7f745c", "#1b1d19"]
      : ["#f3f0e5", "#e2d2b7", "#c28b58", "#a8532d", "#1b1d19"];
    const bayer = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5]
    ];

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    for (let y = 0; y < height; y += block) {
      for (let x = 0; x < width; x += block) {
        const sample = pixelAt(data, width, height, x + Math.floor(block / 2), y + Math.floor(block / 2));
        let lum = luminance(sample);
        if (lum > 0.955) {
          continue;
        }
        lum = clamp(0.5 + (lum - 0.5) * (0.65 + contrast * 1.6), 0, 1);
        const threshold = (bayer[(y / block) % 4 | 0][(x / block) % 4 | 0] + 0.5) / 16 - 0.5;
        const index = clamp(
          Math.round((1 - lum) * (palette.length - 1) + threshold * 0.72),
          0,
          palette.length - 1
        );
        ctx.fillStyle = palette[index];
        ctx.fillRect(x, y, block, block);
      }
    }
    applyVerticalMask(ctx, width, height, opts.mask, "27,26,21");

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 10]);
    line(ctx, width * 0.56, 72, width * 0.56, height - 58, "rgba(224,82,43,0.36)", 1, [4, 10]);
    ctx.restore();
  }

  function render(canvas, options) {
    if (!canvas) {
      return;
    }
    const opts = Object.assign(
      {
        type: "chair",
        style: "ming",
        seed: 28,
        version: 1,
        effect: "paper",
        grid: 9,
        contrast: 62,
        mask: 90
      },
      options || {}
    );
    const source = document.createElement("canvas");
    source.width = canvas.width;
    source.height = canvas.height;
    drawBase(source, opts);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (opts.effect === "ascii") {
      applyASCII(source, canvas, opts);
      return;
    }
    if (opts.effect === "dither") {
      applyDither(source, canvas, opts);
      return;
    }
    ctx.drawImage(source, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = INK;
    for (let y = 0; y < canvas.height; y += 8) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
    ctx.restore();
  }

  function exportSheet(canvas, options) {
    const opts = Object.assign(
      {
        title: "无界明椅",
        prompt: "一把适合小户型的明式扶手椅，白蜡木，靠背轻巧",
        material: "白蜡木",
        score: 89,
        type: "chair",
        style: "ming",
        seed: 28,
        version: 2,
        effect: "paper"
      },
      options || {}
    );
    const width = 1600;
    const height = 1100;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f7f4ea";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = INK;
    ctx.font = '700 34px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText("木生", 72, 90);
    ctx.font = '600 15px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillStyle = "rgba(25,28,24,0.56)";
    ctx.fillText("设计评审 / 01", 72, 120);
    line(ctx, 72, 146, width - 72, 146, "rgba(25,28,24,0.26)", 1);

    const preview = document.createElement("canvas");
    preview.width = 1200;
    preview.height = 900;
    render(preview, opts);
    ctx.drawImage(preview, 72, 184, 970, 727);

    const right = 1080;
    ctx.fillStyle = INK;
    ctx.font = '700 44px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText(opts.title, right, 230);
    ctx.font = '400 20px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillStyle = "rgba(25,28,24,0.72)";
    wrapText(ctx, opts.prompt, right, 276, 430, 32, 3);

    ctx.fillStyle = INK;
    ctx.font = '700 112px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText(String(opts.score), right, 545);
    ctx.font = '600 15px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillStyle = "rgba(25,28,24,0.55)";
    ctx.fillText("综合评分", right + 4, 578);

    line(ctx, right, 636, width - 72, 636, "rgba(25,28,24,0.22)", 1);
    const facts = [
      ["材质", opts.material],
      ["风格", STYLE_LABELS[opts.style] || "明式"],
      ["版本", `V${String(opts.version).padStart(2, "0")}`],
      ["输出", "效果图 / 评审 / 参数"]
    ];
    facts.forEach(([key, value], index) => {
      const y = 684 + index * 62;
      ctx.fillStyle = "rgba(25,28,24,0.5)";
      ctx.font = '500 15px "Avenir Next", "PingFang SC", sans-serif';
      ctx.fillText(key, right, y);
      ctx.fillStyle = INK;
      ctx.font = '600 19px "Avenir Next", "PingFang SC", sans-serif';
      ctx.fillText(value, right + 104, y);
    });

    ctx.fillStyle = ORANGE;
    ctx.fillRect(72, 968, 12, 52);
    ctx.fillStyle = INK;
    ctx.font = '500 17px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText("由木生构序台生成 · 设计会话可继续追溯", 104, 1000);
    return canvas;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    let current = "";
    let row = 0;
    for (const char of text) {
      const next = current + char;
      if (ctx.measureText(next).width > maxWidth && current) {
        ctx.fillText(current, x, y + row * lineHeight);
        current = char;
        row += 1;
        if (row >= maxLines) {
          return;
        }
      } else {
        current = next;
      }
    }
    ctx.fillText(current, x, y + row * lineHeight);
  }

  window.MushengScene = {
    MATERIALS,
    ORANGE,
    TYPES,
    STYLE_LABELS,
    render,
    exportSheet
  };
})();
