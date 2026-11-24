const catalog = require("./designCatalog.json");
const { reviewScriptConverter } = require("./reviewLocale");

const simplify = reviewScriptConverter("cn");
const SPACE_DIRECTION = "Render the requested tea space as an architectural interior. Show the seating layout, circulation, light and enclosure in their spatial context.";
const SPACE_REVIEW = "Evaluate the tea space using visible circulation clearances, light, enclosure and sightlines. Omit productPresentation for this interior.";
const room = /茶室|茶馆|茶空间|茶屋|茶舍|茶客厅|品茶空间|品茗空间|茶亭|(?:喝茶|品茶|泡茶)的(?:屋子|房间)|tea ?(?:room|house)|tea space/i;
const furniture = /茶家具|家具|椅|桌|茶几|边几|长案|茶案|凳|柜|榻|茶台|茶盘|茶岛|书架|屏风|bench|chair|desk|stool|table|shelf|cabinet|daybed/i;
const individual = /(?:一[张把件款套组]|单品|白底|产品照|product shot|single piece).{0,18}(?:椅|桌|凳|几|柜|家具|茶台|chair|table)|(?:chair|table|stool|bench) for (?:a |the )?tea ?room/i;
const roomDesign = /(?:一[间座处]|整个|整间|全景|改造|规划).{0,12}(?:茶室|茶馆|茶空间)|(?:茶室|茶馆|茶空间).{0,8}(?:布局|空间设计|室内设计|平面|动线|全景)|(?:layout|interior|floor plan) (?:of |for )?(?:a |the )?tea ?room|tea ?room (?:layout|interior|floor plan)/i;
const productInRoom = /(?:为|给|用于|放在).{0,14}(?:茶室|茶馆).{0,12}(?:设计|做|添置|用的).{0,16}(?:椅|桌|凳|柜|几|茶台|茶岛|茶盘)|(?:chair|table|stool|cabinet|bench) (?:in|for) (?:a |the )?tea ?room/i;
const wholeRoom = /(?:设计|画|渲染|改造|规划|呈现).{0,10}(?:茶室|茶馆|茶空间)(?:的)?[，。、：: ]|(?:tea ?room|teahouse) with (?:a |an |the )?/i;
const genericChair = /椅|\bchair\b/i;
const genericTable = /茶桌|茶案|茶台|tea table/i;

const formHints = {
  seat: /椅|连坐|并坐|双座|长凳|双人座|中间搁杯|\b(?:chair|seat|bench)\b/i,
  table: /桌|书案|茶案|边几|茶几|茶台|茶盘|茶岛|\b(?:desk|table|station)\b/i,
  stool: /矮凳|茶凳|圆凳|\bstool\b/i,
  storage: /柜|茶罐|茶饼|\bcabinet\b/i,
  bed: /榻|平台床|\bdaybed\b/i,
};

function designReferences(input) {
  const text = simplify(String(input || "").slice(0, 12000).normalize("NFKC").toLowerCase());
  const positive = text.replace(/(?:不要|避开|避免|排除|不含|不做|不需要|without |exclude )[^，。；,;.\n]{1,36}/gi, " ");
  const useContext = /(?:茶室|茶馆)(?:里|内|中)?(?:冲泡用|用来冲泡|用来烧水)/.test(positive);
  const isSpace = !useContext && room.test(positive) && !productInRoom.test(positive) && (wholeRoom.test(positive) || roomDesign.test(positive) || (!individual.test(positive) && !furniture.test(positive)));
  const kind = isSpace ? "space" : "product";
  if (/不要(?:检索|案例|参考库)|不用(?:案例|资料库|参考库)|不使用参考库|no (?:catalog|case references)|without references/i.test(text)) return { kind, matches: [] };
  const wanted = Object.entries(formHints).filter(([, pattern]) => pattern.test(positive)).map(([name]) => name);
  const ranked = catalog.filter(row => row.kind === kind &&
    (isSpace || !wanted.length || !row.forms.length || row.forms.some(form => wanted.includes(form)))).map(row => {
    const keys = row.keywords.filter(term => /^[a-z ]+$/.test(term)
      ? new RegExp("\\b" + term + "\\b", "i").test(positive) : positive.includes(term));
    let score = keys.reduce((sum, key) => sum + (key === "茶室" || key === "teahouse" ? 1 : key.length + 2), 0);
    if (positive.includes(row.title.toLowerCase())) score += 20;
    if (!score && row.id === "craft-03" && genericChair.test(positive)) score = 1;
    if (!score && row.id === "zhiji" && genericTable.test(positive)) score = 1;
    if (!score && row.id === "seed-06" && isSpace) score = 1;
    return { row, score };
  }).filter(entry => entry.score).sort((a, b) => b.score - a.score);
  const matches = ranked.slice(0, 2).map(({ row }) => row);
  return { kind, matches };
}

function referenceNotes(matches) {
  if (!matches.length) return "";
  return ["Optional design observations. User requirements, edits and user images take priority. Adapt relevant principles only. Source names and URLs are attribution, never render or visit them.",
    ...matches.map(row => row.title + " (" + row.source + ") — " + row.principle)].join("\n");
}

module.exports = { designReferences, referenceNotes, SPACE_DIRECTION, SPACE_REVIEW };
