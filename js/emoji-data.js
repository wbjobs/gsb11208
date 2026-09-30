/* Emoji 测试数据集：基础 / 变体选择符 / 肤色修饰符 / ZWJ 序列 / 旗帜序列 */
const EMOJI_DATA = [
  // ---------- 基础 emoji ----------
  { seq: "\u{1F600}", name: "露齿笑脸", en: "grinning face", cat: "base" },
  { seq: "\u{1F602}", name: "笑哭", en: "face with tears of joy", cat: "base" },
  { seq: "\u{1F44D}", name: "点赞", en: "thumbs up", cat: "base" },
  { seq: "\u{1F525}", name: "火焰", en: "fire", cat: "base" },
  { seq: "\u{1F389}", name: "庆祝彩带", en: "party popper", cat: "base" },
  { seq: "\u{2B50}",  name: "星星", en: "star", cat: "base" },
  { seq: "\u{1F355}", name: "披萨", en: "pizza", cat: "base" },
  { seq: "\u{1F680}", name: "火箭", en: "rocket", cat: "base" },

  // ---------- 变体选择符 VS15(U+FE0E 文本样式) / VS16(U+FE0F 表情样式) ----------
  { seq: "\u{2764}",         name: "红心（无选择符）", en: "heavy black heart", cat: "variant", variant: "default", baseName: "红心" },
  { seq: "\u{2764}\u{FE0F}", name: "红心 + VS16（应为彩色表情）", en: "heart emoji presentation", cat: "variant", variant: "emoji", baseName: "红心" },
  { seq: "\u{2764}\u{FE0E}", name: "红心 + VS15（应为文本样式）", en: "heart text presentation", cat: "variant", variant: "text", baseName: "红心" },
  { seq: "\u{2708}\u{FE0F}", name: "飞机 + VS16", en: "airplane emoji presentation", cat: "variant", variant: "emoji", baseName: "飞机" },
  { seq: "\u{2708}\u{FE0E}", name: "飞机 + VS15", en: "airplane text presentation", cat: "variant", variant: "text", baseName: "飞机" },
  { seq: "\u{2600}\u{FE0F}", name: "太阳 + VS16", en: "sun emoji presentation", cat: "variant", variant: "emoji", baseName: "太阳" },
  { seq: "\u{2600}\u{FE0E}", name: "太阳 + VS15", en: "sun text presentation", cat: "variant", variant: "text", baseName: "太阳" },
  { seq: "\u{25B6}\u{FE0F}", name: "播放键 + VS16", en: "play button emoji presentation", cat: "variant", variant: "emoji", baseName: "播放键" },
  { seq: "\u{263A}\u{FE0E}", name: "笑脸符号 + VS15", en: "smiling face text presentation", cat: "variant", variant: "text", baseName: "笑脸符号" },

  // ---------- 肤色修饰符 Fitzpatrick U+1F3FB–U+1F3FF ----------
  { seq: "\u{1F44B}",           name: "挥手（默认肤色）", en: "waving hand", cat: "skin", base: "\u{1F44B}", tone: "", toneName: "默认" },
  { seq: "\u{1F44B}\u{1F3FB}", name: "挥手 · 浅肤色", en: "waving hand light skin tone", cat: "skin", base: "\u{1F44B}", tone: "\u{1F3FB}", toneName: "浅肤色" },
  { seq: "\u{1F44B}\u{1F3FC}", name: "挥手 · 中浅肤色", en: "waving hand medium-light skin tone", cat: "skin", base: "\u{1F44B}", tone: "\u{1F3FC}", toneName: "中浅肤色" },
  { seq: "\u{1F44B}\u{1F3FD}", name: "挥手 · 中等肤色", en: "waving hand medium skin tone", cat: "skin", base: "\u{1F44B}", tone: "\u{1F3FD}", toneName: "中等肤色" },
  { seq: "\u{1F44B}\u{1F3FE}", name: "挥手 · 中深肤色", en: "waving hand medium-dark skin tone", cat: "skin", base: "\u{1F44B}", tone: "\u{1F3FE}", toneName: "中深肤色" },
  { seq: "\u{1F44B}\u{1F3FF}", name: "挥手 · 深肤色", en: "waving hand dark skin tone", cat: "skin", base: "\u{1F44B}", tone: "\u{1F3FF}", toneName: "深肤色" },
  { seq: "\u{1F9D1}\u{1F3FD}", name: "成年人 · 中等肤色", en: "person medium skin tone", cat: "skin", base: "\u{1F9D1}", tone: "\u{1F3FD}", toneName: "中等肤色" },
  { seq: "\u{1F44D}\u{1F3FE}", name: "点赞 · 中深肤色", en: "thumbs up medium-dark skin tone", cat: "skin", base: "\u{1F44D}", tone: "\u{1F3FE}", toneName: "中深肤色" },

  // ---------- ZWJ 序列（U+200D 连接） ----------
  { seq: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", name: "家庭：一家四口", en: "family man woman girl boy", cat: "zwj" },
  { seq: "\u{1F3F3}\u{FE0F}\u200D\u{1F308}", name: "彩虹旗", en: "rainbow flag", cat: "zwj" },
  { seq: "\u{1F469}\u200D\u{1F4BB}", name: "女程序员", en: "woman technologist", cat: "zwj" },
  { seq: "\u{1F9D1}\u200D\u{1F91D}\u200D\u{1F9D1}", name: "握手的人", en: "people holding hands", cat: "zwj" },
  { seq: "\u{1F43B}\u200D\u{2744}\u{FE0F}", name: "北极熊", en: "polar bear", cat: "zwj" },
  { seq: "\u{1F468}\u200D\u{1F9B0}", name: "红发男人", en: "man red hair", cat: "zwj" },
  { seq: "\u{1F469}\u200D\u{2764}\u{FE0F}\u200D\u{1F48B}\u200D\u{1F468}", name: "亲吻：女人与男人", en: "kiss woman man", cat: "zwj" },
  { seq: "\u{1F441}\u{FE0F}\u200D\u{1F5E8}\u{FE0F}", name: "对话框中的眼睛", en: "eye in speech bubble", cat: "zwj" },

  // ---------- 旗帜序列（区域指示符 / Tag 序列） ----------
  { seq: "\u{1F1E8}\u{1F1F3}", name: "旗帜：中国", en: "flag China", cat: "flag", code: "CN" },
  { seq: "\u{1F1FA}\u{1F1F8}", name: "旗帜：美国", en: "flag United States", cat: "flag", code: "US" },
  { seq: "\u{1F1EF}\u{1F1F5}", name: "旗帜：日本", en: "flag Japan", cat: "flag", code: "JP" },
  { seq: "\u{1F1EC}\u{1F1E7}", name: "旗帜：英国", en: "flag United Kingdom", cat: "flag", code: "GB" },
  { seq: "\u{1F1E9}\u{1F1EA}", name: "旗帜：德国", en: "flag Germany", cat: "flag", code: "DE" },
  { seq: "\u{1F1EB}\u{1F1F7}", name: "旗帜：法国", en: "flag France", cat: "flag", code: "FR" },
  { seq: "\u{1F1E7}\u{1F1F7}", name: "旗帜：巴西", en: "flag Brazil", cat: "flag", code: "BR" },
  { seq: "\u{1F1EE}\u{1F1F3}", name: "旗帜：印度", en: "flag India", cat: "flag", code: "IN" },
  { seq: "\u{1F1F0}\u{1F1F7}", name: "旗帜：韩国", en: "flag South Korea", cat: "flag", code: "KR" },
  { seq: "\u{1F1EA}\u{1F1FA}", name: "旗帜：欧盟", en: "flag European Union", cat: "flag", code: "EU" },
  { seq: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", name: "旗帜：英格兰（Tag 序列）", en: "flag England tag sequence", cat: "flag", code: "GB-ENG", tag: true },
];

const CATEGORIES = [
  { id: "all",     label: "全部" },
  { id: "base",    label: "基础" },
  { id: "variant", label: "变体选择符" },
  { id: "skin",    label: "肤色修饰" },
  { id: "zwj",     label: "ZWJ 序列" },
  { id: "flag",    label: "旗帜序列" },
];

/* 能力探针：每个类别取代表项做整体环境评估 */
const CAPABILITY_PROBES = [
  { key: "color",  label: "彩色 Emoji 字体", seq: "\u{1F600}", kind: "colored" },
  { key: "vs16",   label: "VS16 表情样式",   seq: "\u{2764}\u{FE0F}", kind: "colored" },
  { key: "vs15",   label: "VS15 文本样式",   seq: "\u{2764}\u{FE0E}", kind: "mono" },
  { key: "zwj",    label: "ZWJ 序列合并",    seq: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", kind: "joined" },
  { key: "skin",   label: "肤色修饰符",      seq: "\u{1F44B}\u{1F3FD}", kind: "skin" },
  { key: "flag",   label: "旗帜（区域指示符）", seq: "\u{1F1E8}\u{1F1F3}", kind: "flag" },
  { key: "tag",    label: "Tag 序列旗帜",    seq: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", kind: "tagflag" },
];
