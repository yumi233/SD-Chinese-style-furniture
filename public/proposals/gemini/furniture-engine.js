/**
 * 木生 · 构形场 (Musheng Structura)
 * 纯代码式中式当代家具图形生成与参数化 Dither / ASCII 渲染引擎
 * 离线运行，零外部依赖
 */

(function (global) {
  "use strict";

  // Bayer 4x4 抖动阈值矩阵 (标准化 0 - 1)
  const BAYER_4X4 = [
    [0 / 16, 8 / 16, 2 / 16, 10 / 16],
    [12 / 16, 4 / 16, 14 / 16, 6 / 16],
    [3 / 16, 11 / 16, 1 / 16, 9 / 16],
    [15 / 16, 7 / 16, 13 / 16, 5 / 16]
  ];

  // ASCII 亮度字符集（从暗到亮或从亮到暗映射）
  const ASCII_RAMP = " .`-_':,;^=+/\"|)\\<>)iv%xcl*#$@";
  const ASCII_SHORT = " .:-=+*#%@";

  /**
   * 基础调色板与材质配置
   */
  const PALETTES = {
    song: {
      name: "宋韵极简",
      primaryWood: "#3A342E",
      secondaryWood: "#534B42",
      highlightWood: "#7E7366",
      cushion: "#D8D2C6",
      cushionShadow: "#B2ABA0",
      accent: "#8B9582",
      bgGradStart: "#F5F3EF",
      bgGradEnd: "#EAE5DC",
      wireframe: "rgba(58, 52, 46, 0.45)"
    },
    ming: {
      name: "明式骨相",
      primaryWood: "#4A2511",
      secondaryWood: "#693619",
      highlightWood: "#98572A",
      cushion: "#E7DFD3",
      cushionShadow: "#C5BCAD",
      accent: "#B85D3B",
      bgGradStart: "#F7F5F0",
      bgGradEnd: "#EBE3D5",
      wireframe: "rgba(74, 37, 17, 0.45)"
    },
    contemporary: {
      name: "新中式轻悬",
      primaryWood: "#1E2024",
      secondaryWood: "#32363D",
      highlightWood: "#5C626E",
      cushion: "#EAEBED",
      cushionShadow: "#C0C4CC",
      accent: "#4B7BE5",
      bgGradStart: "#F8FAFC",
      bgGradEnd: "#E8EDF5",
      wireframe: "rgba(30, 32, 36, 0.45)"
    },
    zen: {
      name: "数字禅意",
      primaryWood: "#262624",
      secondaryWood: "#3E3D3A",
      highlightWood: "#65635E",
      cushion: "#A39E93",
      cushionShadow: "#7F7B72",
      accent: "#A2845E",
      bgGradStart: "#F3F2EF",
      bgGradEnd: "#E3E1DA",
      wireframe: "rgba(38, 38, 36, 0.45)"
    }
  };

  /**
   * 家具渲染主类
   */
  class FurnitureRenderer {
    constructor() {
      // 离线工作画布，用于快速后处理滤镜
      this.offscreenCanvas = document.createElement("canvas");
      this.offCtx = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
    }

    /**
     * 绘制指定家具模型并应用后处理滤镜
     * @param {HTMLCanvasElement} canvas 目标画布
     * @param {Object} options 渲染选项
     */
    render(canvas, options = {}) {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const width = canvas.width;
      const height = canvas.height;

      // 同步离线画布尺寸
      if (this.offscreenCanvas.width !== width || this.offscreenCanvas.height !== height) {
        this.offscreenCanvas.width = width;
        this.offscreenCanvas.height = height;
      }

      const styleKey = options.style || "ming";
      const palette = PALETTES[styleKey] || PALETTES.ming;
      const type = options.type || "armchair";
      const mode = options.mode || "solid"; // solid, dither, ascii, wireframe, blueprint

      // 1. 在离线画布上绘制高品质基础矢量图形
      this.drawBaseFurniture(this.offCtx, width, height, type, palette, options);

      // 2. 根据模式决定是否应用参数化着色器处理
      if (mode === "solid") {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(this.offscreenCanvas, 0, 0);
      } else if (mode === "dither") {
        this.applyDitherFilter(ctx, this.offscreenCanvas, width, height, options.ditherParams);
      } else if (mode === "ascii") {
        this.applyAsciiFilter(ctx, this.offscreenCanvas, width, height, options.asciiParams);
      } else if (mode === "wireframe" || mode === "blueprint") {
        this.drawBlueprint(ctx, width, height, type, palette, options);
      }
    }

    /**
     * 基础家具光影与构件矢量绘制
     */
    drawBaseFurniture(ctx, w, h, type, palette, options) {
      ctx.save();
      ctx.clearRect(0, 0, w, h);

      // 背景微渐变与轻量级工作室漫反射地平线
      const bgGrad = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.1, w / 2, h * 0.5, w * 0.75);
      bgGrad.addColorStop(0, palette.bgGradStart);
      bgGrad.addColorStop(1, palette.bgGradEnd);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 极轻量级工作室柔光地平面
      const floorGrad = ctx.createLinearGradient(0, h * 0.62, 0, h);
      floorGrad.addColorStop(0, "rgba(0, 0, 0, 0.02)");
      floorGrad.addColorStop(1, "rgba(0, 0, 0, 0.07)");
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, h * 0.62, w, h * 0.38);

      // 空间透视基准参考线（淡白与极轻灰）
      ctx.strokeStyle = "rgba(0,0,0,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.62);
      ctx.lineTo(w, h * 0.62);
      ctx.stroke();

      // 根据家具类型绘制具体构件
      switch (type) {
        case "table":
          this.drawConsoleTable(ctx, w, h, palette, options);
          break;
        case "daybed":
          this.drawDaybed(ctx, w, h, palette, options);
          break;
        case "shelf":
          this.drawCurioShelf(ctx, w, h, palette, options);
          break;
        case "armchair":
        default:
          this.drawArmchair(ctx, w, h, palette, options);
          break;
      }

      ctx.restore();
    }

    /**
     * 绘制圈椅（Horseshoe Armchair）
     */
    drawArmchair(ctx, w, h, palette, options) {
      const cx = w * 0.5;
      const cy = h * 0.52;
      const scale = Math.min(w, h) / 600;

      // 局部定制参数（可通过选项改变，用于版本演进展示）
      const armThinness = options.armThinness || 1.0; // 扶手纤薄度 (1.0 = 标准, 0.6 = 极薄收窄)
      const seatFabricColor = options.cushionColor || palette.cushion;
      const woodColor = options.woodColor || palette.primaryWood;
      const highlightWood = palette.highlightWood;
      const secondaryWood = palette.secondaryWood;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // 1. 投影（三层椭圆漫反射）
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 160, 150, 42, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 20, 22, 0.12)";
      ctx.filter = "blur(8px)";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 156, 120, 30, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 20, 22, 0.18)";
      ctx.filter = "blur(4px)";
      ctx.fill();
      ctx.restore();

      // 2. 后腿上截（延伸为靠背立柱）
      ctx.strokeStyle = secondaryWood;
      ctx.lineWidth = 10 * armThinness;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-75, 20);
      ctx.bezierCurveTo(-76, -40, -68, -100, -60, -150);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(75, 20);
      ctx.bezierCurveTo(76, -40, 68, -100, 60, -150);
      ctx.stroke();

      // 3. 靠背板 (Back Splat) - 中式 S 形曲线背板，现代流线镂空
      const splatGrad = ctx.createLinearGradient(-35, -160, 35, 20);
      splatGrad.addColorStop(0, highlightWood);
      splatGrad.addColorStop(0.5, woodColor);
      splatGrad.addColorStop(1, secondaryWood);

      ctx.fillStyle = splatGrad;
      ctx.beginPath();
      ctx.moveTo(-28, -150);
      ctx.bezierCurveTo(-18, -120, -18, -70, -26, 20);
      ctx.lineTo(26, 20);
      ctx.bezierCurveTo(18, -70, 18, -120, 28, -150);
      ctx.closePath();
      ctx.fill();

      // 背板极简内刻开光纹（当代宋韵几何线）
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -65, 16, 0, Math.PI * 2);
      ctx.stroke();

      // 4. 后腿下截
      ctx.strokeStyle = secondaryWood;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(-70, 20);
      ctx.lineTo(-84, 150);
      ctx.moveTo(70, 20);
      ctx.lineTo(84, 150);
      ctx.stroke();

      // 5. 座面椅盘 (Seat Frame)
      // 坐垫厚度与立体斜切面
      ctx.fillStyle = secondaryWood;
      ctx.beginPath();
      ctx.roundRect(-98, 12, 196, 20, 4);
      ctx.fill();

      // 软包坐垫 (Cushion)
      const cushionGrad = ctx.createLinearGradient(0, -8, 0, 16);
      cushionGrad.addColorStop(0, seatFabricColor);
      cushionGrad.addColorStop(1, palette.cushionShadow);
      ctx.fillStyle = cushionGrad;
      ctx.beginPath();
      ctx.roundRect(-92, -6, 184, 22, 6);
      ctx.fill();

      // 坐垫微缝线细节
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // 6. 前腿与券口牙子 (Legs and Apron)
      ctx.strokeStyle = woodColor;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-82, 20);
      ctx.lineTo(-94, 155);
      ctx.moveTo(82, 20);
      ctx.lineTo(94, 155);
      ctx.stroke();

      // 牙板弧形券口
      ctx.fillStyle = secondaryWood;
      ctx.beginPath();
      ctx.moveTo(-82, 28);
      ctx.quadraticCurveTo(0, 46, 82, 28);
      ctx.lineTo(82, 36);
      ctx.quadraticCurveTo(0, 54, -82, 36);
      ctx.closePath();
      ctx.fill();

      // 步步高管脚枨 (Stretchers)
      ctx.strokeStyle = woodColor;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-88, 125);
      ctx.lineTo(88, 125); // 前枨
      ctx.moveTo(-86, 105);
      ctx.lineTo(-76, 95); // 侧枨左
      ctx.moveTo(86, 105);
      ctx.lineTo(76, 95); // 侧枨右
      ctx.stroke();

      // 7. 鹅脖与联帮棍 (Side Handrest Posts)
      ctx.strokeStyle = woodColor;
      ctx.lineWidth = 8 * armThinness;
      ctx.beginPath();
      // 鹅脖 (前)
      ctx.moveTo(-78, 15);
      ctx.bezierCurveTo(-90, -10, -96, -45, -92, -75);
      ctx.moveTo(78, 15);
      ctx.bezierCurveTo(90, -10, 96, -45, 92, -75);
      // 联帮棍 (中侧)
      ctx.moveTo(-86, 18);
      ctx.bezierCurveTo(-105, -20, -110, -50, -100, -85);
      ctx.moveTo(86, 18);
      ctx.bezierCurveTo(105, -20, 110, -50, 100, -85);
      ctx.stroke();

      // 8. 月牙月弓月圈（搭脑与月牙形连续扶手 - Crest Rail）
      // 这是圈椅的灵魂构件：五接月牙榫卯形成的舒缓大圆弧
      const railThickness = 14 * armThinness;
      const railGrad = ctx.createLinearGradient(-130, -170, 130, -60);
      railGrad.addColorStop(0, secondaryWood);
      railGrad.addColorStop(0.2, highlightWood);
      railGrad.addColorStop(0.5, woodColor);
      railGrad.addColorStop(0.8, highlightWood);
      railGrad.addColorStop(1, secondaryWood);

      ctx.strokeStyle = railGrad;
      ctx.lineWidth = railThickness;
      ctx.lineCap = "round";
      ctx.beginPath();
      // 从左扶手端头鳝鱼头回钩，经搭脑至右扶手端头
      ctx.moveTo(-122, -62);
      ctx.bezierCurveTo(-128, -76, -118, -125, -65, -162);
      ctx.bezierCurveTo(-25, -178, 25, -178, 65, -162);
      ctx.bezierCurveTo(118, -125, 128, -76, 122, -62);
      ctx.stroke();

      // 扶手端头卷云纹修饰
      ctx.fillStyle = highlightWood;
      ctx.beginPath();
      ctx.arc(-123, -62, railThickness * 0.45, 0, Math.PI * 2);
      ctx.arc(123, -62, railThickness * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // 极精细的高光棱线
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-60, -164);
      ctx.bezierCurveTo(-20, -179, 20, -179, 60, -164);
      ctx.stroke();

      ctx.restore();
    }

    /**
     * 绘制平头案 / 极简条案 (Contemporary Scholar's Table)
     */
    drawConsoleTable(ctx, w, h, palette, options) {
      const cx = w * 0.5;
      const cy = h * 0.53;
      const scale = Math.min(w, h) / 600;
      const woodColor = options.woodColor || palette.primaryWood;
      const highlightWood = palette.highlightWood;
      const secondaryWood = palette.secondaryWood;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // 投影
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 140, 210, 48, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 20, 22, 0.12)";
      ctx.filter = "blur(8px)";
      ctx.fill();
      ctx.restore();

      // 案腿（四足带有侧脚撇出）
      ctx.strokeStyle = secondaryWood;
      ctx.lineWidth = 14;
      ctx.lineCap = "square";
      // 后腿
      ctx.beginPath();
      ctx.moveTo(-160, -15);
      ctx.lineTo(-175, 130);
      ctx.moveTo(160, -15);
      ctx.lineTo(175, 130);
      ctx.stroke();

      // 侧拉枨
      ctx.strokeStyle = woodColor;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-165, 80);
      ctx.lineTo(-155, 60);
      ctx.moveTo(165, 80);
      ctx.lineTo(155, 60);
      ctx.stroke();

      // 前腿
      ctx.strokeStyle = woodColor;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(-175, -10);
      ctx.lineTo(-195, 140);
      ctx.moveTo(175, -10);
      ctx.lineTo(195, 140);
      ctx.stroke();

      // 牙条与牙头 (Apron & Spandrels)
      ctx.fillStyle = secondaryWood;
      ctx.beginPath();
      ctx.moveTo(-180, -8);
      ctx.lineTo(180, -8);
      ctx.lineTo(180, 14);
      ctx.quadraticCurveTo(150, 18, 140, 36);
      ctx.lineTo(-140, 36);
      ctx.quadraticCurveTo(-150, 18, -180, 14);
      ctx.closePath();
      ctx.fill();

      // 案面冰盘沿 (Ice-plate edge tabletop)
      const topGrad = ctx.createLinearGradient(0, -32, 0, -8);
      topGrad.addColorStop(0, highlightWood);
      topGrad.addColorStop(0.5, woodColor);
      topGrad.addColorStop(1, secondaryWood);

      ctx.fillStyle = topGrad;
      ctx.beginPath();
      // 上宽下微收的攒边打槽冰盘沿
      ctx.moveTo(-215, -30);
      ctx.lineTo(215, -30);
      ctx.lineTo(208, -8);
      ctx.lineTo(-208, -8);
      ctx.closePath();
      ctx.fill();

      // 面心板高光缝隙
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-205, -28);
      ctx.lineTo(205, -28);
      ctx.stroke();

      ctx.restore();
    }

    /**
     * 绘制罗汉榻 (Contemporary Daybed)
     */
    drawDaybed(ctx, w, h, palette, options) {
      const cx = w * 0.5;
      const cy = h * 0.52;
      const scale = Math.min(w, h) / 600;
      const woodColor = options.woodColor || palette.primaryWood;
      const highlightWood = palette.highlightWood;
      const secondaryWood = palette.secondaryWood;
      const cushionColor = options.cushionColor || palette.cushion;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // 投影
      ctx.beginPath();
      ctx.ellipse(0, 130, 230, 45, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 20, 22, 0.14)";
      ctx.filter = "blur(10px)";
      ctx.fill();

      // 后围板
      ctx.fillStyle = secondaryWood;
      ctx.beginPath();
      ctx.roundRect(-190, -110, 380, 75, 4);
      ctx.fill();

      // 侧围板左右
      ctx.fillStyle = woodColor;
      ctx.beginPath();
      ctx.moveTo(-210, -75);
      ctx.lineTo(-170, -100);
      ctx.lineTo(-170, -25);
      ctx.lineTo(-210, -10);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(210, -75);
      ctx.lineTo(170, -100);
      ctx.lineTo(170, -25);
      ctx.lineTo(210, -10);
      ctx.closePath();
      ctx.fill();

      // 榻面与软垫
      ctx.fillStyle = cushionColor;
      ctx.beginPath();
      ctx.roundRect(-215, -25, 430, 45, 6);
      ctx.fill();

      // 束腰与牙板
      ctx.fillStyle = secondaryWood;
      ctx.fillRect(-210, 20, 420, 18);

      // 抱肩榫鼓腿膨牙与内翻马蹄足
      ctx.strokeStyle = woodColor;
      ctx.lineWidth = 18;
      ctx.beginPath();
      // 左马蹄足
      ctx.moveTo(-195, 30);
      ctx.bezierCurveTo(-225, 65, -225, 105, -200, 125);
      // 右马蹄足
      ctx.moveTo(195, 30);
      ctx.bezierCurveTo(225, 65, 225, 105, 200, 125);
      ctx.stroke();

      // 榻上极简茶几/小炕案
      ctx.fillStyle = highlightWood;
      ctx.beginPath();
      ctx.roundRect(-45, -55, 90, 30, 2);
      ctx.fill();

      ctx.restore();
    }

    /**
     * 绘制博古架 (Lattice Shelf)
     */
    drawCurioShelf(ctx, w, h, palette, options) {
      const cx = w * 0.5;
      const cy = h * 0.52;
      const scale = Math.min(w, h) / 600;
      const woodColor = options.woodColor || palette.primaryWood;
      const highlightWood = palette.highlightWood;
      const secondaryWood = palette.secondaryWood;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // 投影
      ctx.beginPath();
      ctx.ellipse(0, 160, 170, 32, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 20, 22, 0.12)";
      ctx.filter = "blur(8px)";
      ctx.fill();

      // 外框架立柱
      ctx.strokeStyle = woodColor;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-140, -170);
      ctx.lineTo(-140, 155);
      ctx.moveTo(140, -170);
      ctx.lineTo(140, 155);
      ctx.stroke();

      // 顶顶顶板与底框
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(-150, -170);
      ctx.lineTo(150, -170);
      ctx.moveTo(-150, 135);
      ctx.lineTo(150, 135);
      ctx.stroke();

      // 错落开光隔板 (Asymmetric Ming lattice)
      ctx.lineWidth = 8;
      ctx.strokeStyle = secondaryWood;
      ctx.beginPath();
      // 第一层
      ctx.moveTo(-140, -95);
      ctx.lineTo(10, -95);
      // 中垂板
      ctx.moveTo(10, -170);
      ctx.lineTo(10, 0);
      // 第二层
      ctx.moveTo(-60, -20);
      ctx.lineTo(140, -20);
      // 竖隔板
      ctx.moveTo(-60, -95);
      ctx.lineTo(-60, 60);
      // 第三层
      ctx.moveTo(-140, 60);
      ctx.lineTo(50, 60);
      ctx.stroke();

      // 摆件装饰（极简宋瓷小瓶与数字立方块）
      ctx.fillStyle = palette.accent;
      ctx.beginPath();
      ctx.arc(80, -35, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = highlightWood;
      ctx.fillRect(-115, -125, 24, 28);

      ctx.restore();
    }

    /**
     * 矢量结构工程图模式 (Blueprint / Wireframe)
     */
    drawBlueprint(ctx, w, h, type, palette, options) {
      ctx.save();
      ctx.clearRect(0, 0, w, h);

      // 深色工业蓝图背景
      ctx.fillStyle = "#10141A";
      ctx.fillRect(0, 0, w, h);

      // 坐标精密网格
      ctx.strokeStyle = "rgba(75, 123, 229, 0.12)";
      ctx.lineWidth = 1;
      const step = 24;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 结构透视主线
      ctx.strokeStyle = "#4B7BE5";
      ctx.lineWidth = 1.5;

      const cx = w * 0.5;
      const cy = h * 0.52;
      const scale = Math.min(w, h) / 600;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // 圈椅结构拓扑线
      ctx.strokeRect(-100, 10, 200, 24);
      ctx.strokeRect(-75, -150, 150, 160);

      // 榫卯接合点标记 (Mortise-Tenon Nodes)
      const nodes = [
        [-122, -62], [122, -62], [-65, -162], [65, -162],
        [-82, 20], [82, 20], [-94, 155], [94, 155], [0, -170]
      ];
      ctx.fillStyle = "#00F5D4";
      nodes.forEach(([nx, ny]) => {
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // 标注尺寸线
      ctx.strokeStyle = "rgba(0, 245, 212, 0.6)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(-160, -170);
      ctx.lineTo(-160, 155);
      ctx.moveTo(-170, -170);
      ctx.lineTo(-150, -170);
      ctx.moveTo(-170, 155);
      ctx.lineTo(-150, 155);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#00F5D4";
      ctx.font = "11px monospace";
      ctx.fillText("H: 920mm", -225, 0);
      ctx.fillText("W: 640mm", -30, 185);

      ctx.restore();
      ctx.restore();
    }

    /**
     * 吸收指定方案 5.2：Bayer 4x4 参数化抖动滤镜 (Dither Shader)
     * - 切片像素块 (pixelBlock: 2px - 10px)
     * - Bayer 矩阵阈值算法
     * - 级数量化 (quantization: 2 - 8)
     * - 纵向遮罩 (mask: 默认 88)
     */
    applyDitherFilter(targetCtx, sourceCanvas, w, h, params = {}) {
      const p = Object.assign({
        pixelSize: 4,        // 像素块大小 (2-10)
        quantLevels: 4,      // 色阶量化层级 (2-8)
        contrast: 1.25,      // 明暗对比度
        verticalMask: 88,    // 纵向遮罩强度 (88 推荐值)
        monochrome: false    // 是否纯单色点阵
      }, params);

      const blockSize = Math.max(2, Math.floor(p.pixelSize));
      const offW = Math.ceil(w / blockSize);
      const offH = Math.ceil(h / blockSize);

      // 临时降采样画布获取像素块
      const smallCanvas = document.createElement("canvas");
      smallCanvas.width = offW;
      smallCanvas.height = offH;
      const sCtx = smallCanvas.getContext("2d", { willReadFrequently: true });
      sCtx.drawImage(sourceCanvas, 0, 0, offW, offH);

      const imgData = sCtx.getImageData(0, 0, offW, offH);
      const data = imgData.data;

      targetCtx.save();
      targetCtx.imageSmoothingEnabled = false;
      targetCtx.clearRect(0, 0, w, h);

      const levels = Math.max(2, p.quantLevels);
      const maskWeight = p.verticalMask / 100; // 0.88

      for (let y = 0; y < offH; y++) {
        const bayerY = y % 4;
        // 纵向扫描条带微调
        const scanlineFactor = (y % 2 === 0) ? 1.0 : (1.0 - (maskWeight * 0.18));

        for (let x = 0; x < offW; x++) {
          const idx = (y * offW + x) * 4;
          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];
          const a = data[idx + 3];

          if (a < 10) continue;

          // 计算感知亮度 (Rec. 601)
          let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          // 对比度变换
          lum = (lum - 0.5) * p.contrast + 0.5;
          lum = Math.max(0, Math.min(1, lum)) * scanlineFactor;

          const bayerX = x % 4;
          const threshold = BAYER_4X4[bayerY][bayerX];

          // 结合阈值进行阶梯量化
          const rawLevel = lum * (levels - 1) + (threshold - 0.5);
          const quantized = Math.max(0, Math.min(levels - 1, Math.round(rawLevel))) / (levels - 1);

          if (p.monochrome) {
            const val = Math.round(quantized * 255);
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
          } else {
            // 保留原有色相倾向，同时压缩明度阶层
            const factor = quantized / Math.max(0.01, lum);
            data[idx] = Math.min(255, Math.round(r * factor));
            data[idx + 1] = Math.min(255, Math.round(g * factor));
            data[idx + 2] = Math.min(255, Math.round(b * factor));
          }
        }
      }

      sCtx.putImageData(imgData, 0, 0);

      // 缩放回原始分辨率，保持锋利锐利的数字像素感
      targetCtx.drawImage(smallCanvas, 0, 0, offW, offH, 0, 0, w, h);

      // 叠加纵向细条纹遮罩，让纹理更具数码切片质感 (90% mask)
      if (p.verticalMask > 0) {
        targetCtx.fillStyle = `rgba(0, 0, 0, ${0.06 * maskWeight})`;
        for (let y = 0; y < h; y += 4) {
          targetCtx.fillRect(0, y, w, 1);
        }
      }

      targetCtx.restore();
    }

    /**
     * 吸收指定方案 5.2：ASCII 参数化字符采样滤镜
     * - 网格切分 (cellSize: 6-18px)
     * - 字符密度映射
     * - 对比度与明暗偏好
     * - 纵向遮罩 (mask: 默认 90)
     */
    applyAsciiFilter(targetCtx, sourceCanvas, w, h, params = {}) {
      const p = Object.assign({
        cellSize: 8,         // 网格字号大小 (6-16)
        contrast: 1.35,      // 明暗对比
        invert: false,       // 是否反转亮度
        scanlineMask: 90,    // 纵向遮罩强度 (90 推荐值)
        charSet: ASCII_RAMP, // 字符集
        textColor: "#1D2129",// 字符颜色
        bgColor: "#F7F6F3"   // 背景底色
      }, params);

      const cellSize = Math.max(6, Math.floor(p.cellSize));
      const cols = Math.floor(w / cellSize);
      const rows = Math.floor(h / cellSize);

      // 获取源图像像素采样
      const sCtx = this.offCtx;
      const imgData = sCtx.getImageData(0, 0, w, h);
      const data = imgData.data;

      targetCtx.save();
      targetCtx.fillStyle = p.bgColor;
      targetCtx.fillRect(0, 0, w, h);

      targetCtx.font = `bold ${cellSize}px "SF Mono", "Fira Code", monospace`;
      targetCtx.textAlign = "center";
      targetCtx.textBaseline = "middle";

      const ramp = p.charSet || ASCII_RAMP;
      const rampLen = ramp.length;

      for (let r = 0; r < rows; r++) {
        const py = Math.floor((r + 0.5) * cellSize);
        for (let c = 0; c < cols; c++) {
          const px = Math.floor((c + 0.5) * cellSize);
          const idx = (py * w + px) * 4;

          let red = data[idx];
          let green = data[idx + 1];
          let blue = data[idx + 2];

          // 灰度与对比度
          let lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
          lum = (lum - 0.5) * p.contrast + 0.5;
          lum = Math.max(0, Math.min(1, lum));

          if (p.invert) lum = 1.0 - lum;

          const charIndex = Math.min(rampLen - 1, Math.floor((1.0 - lum) * rampLen));
          const ch = ramp[charIndex];

          if (ch && ch !== " ") {
            // 根据原图像略带微量原色着色
            targetCtx.fillStyle = p.textColor;
            targetCtx.fillText(ch, px, py);
          }
        }
      }

      // 叠加纵向 ASCII 扫描线遮罩
      if (p.scanlineMask > 0) {
        const maskAlpha = (p.scanlineMask / 100) * 0.08;
        targetCtx.fillStyle = `rgba(0, 0, 0, ${maskAlpha})`;
        for (let y = 0; y < h; y += 3) {
          targetCtx.fillRect(0, y, w, 1);
        }
      }

      targetCtx.restore();
    }
  }

  // 挂载至全局
  global.FurnitureRenderer = FurnitureRenderer;
  global.PALETTES = PALETTES;

})(typeof window !== "undefined" ? window : this);
