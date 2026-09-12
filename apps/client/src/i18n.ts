import type { ErrorCode } from "@kitchen/shared";

export type Language = "en" | "zh";

export const DEFAULT_LANGUAGE: Language = "en";

let activeLanguage: Language = DEFAULT_LANGUAGE;

export function text(language: Language, english: string, chinese: string) {
  return language === "zh" ? chinese : english;
}

export function setActiveLanguage(language: Language) {
  activeLanguage = language;
}

export function activeText(english: string, chinese: string) {
  return text(activeLanguage, english, chinese);
}

const englishCommandErrors: Record<ErrorCode, string> = {
  UNSUPPORTED_PROTOCOL: "Please refresh this page to use the current version.",
  INVALID_REQUEST: "That request is invalid. Please try again.",
  ROOM_NOT_FOUND: "Kitchen not found. The server may have restarted.",
  ROOM_FULL: "This kitchen is already full.",
  PLAYER_NOT_FOUND: "That chef could not be found.",
  PLAYER_NOT_ENROLLED: "Please enroll this chef's face first.",
  NOT_AUTHORIZED: "This action is not available on this device.",
  PRESENCE_STALE: "Identity expired. Please face the camera again.",
  CONTROL_LEASE_MOVED: "This chef is active on another computer.",
  REVISION_CONFLICT: "The kitchen changed. Please try again.",
  ITEM_NOT_AVAILABLE: "That item is no longer available.",
  HANDS_FULL: "Put down the item you are carrying first.",
  INVALID_ITEM_STATE: "That item is not ready for this action.",
  INVALID_STATION: "This action belongs at another station.",
  RATE_LIMITED: "You're moving too quickly. Please wait a moment.",
  INTERNAL_ERROR:
    "The kitchen could not process that action. Please try again.",
};

const englishServerMessages: Record<string, string> = {
  "请求格式无效。": "The request format is invalid.",
  "请刷新到当前版本。": "Please refresh this page to use the current version.",
  "缺少请求或设备 ID。": "The request or device ID is missing.",
  "设备 ID 无效。": "The device ID is invalid.",
  "请求过于频繁。": "You're moving too quickly. Please wait a moment.",
  "请先用当前设备加入房间。": "Join the kitchen from this device first.",
  "同一个请求 ID 不能用于不同操作。":
    "The same request ID cannot be used for different actions.",
  "服务器暂时无法处理请求。":
    "The kitchen server could not process that request. Please try again.",
  "请先退出当前房间。": "Leave the current kitchen first.",
  "游戏中工位固定，请移动到另一台电脑。":
    "Stations are locked during the game. Move to the other computer.",
  "本轮尚未开始或已经结束。":
    "This round has not started or has already ended.",
  "携带物与玩家身份不一致，请重新同步。":
    "The carried item no longer matches this chef. Please resync.",
  "请到对应工位操作。": "Use the matching station for this action.",
  "先放下手中的物品。": "Put down the item you are carrying first.",
  "请先拿起对应工具。": "Pick up the correct tool first.",
  "未知食材。": "Unknown ingredient.",
  "物品已不在这里。": "That item is no longer here.",
  "物品已被拿走或不在当前工位。":
    "The item was taken or is no longer at this station.",
  "只能在这里放置食材。": "Only ingredients can be placed here.",
  "这里已经有食材了。": "There is already an ingredient here.",
  "只有番茄需要清洗。": "Only tomatoes need washing.",
  "请把食材直接放进烤箱。": "Put the ingredient directly into the oven.",
  "这里只有番茄和香肠需要切。": "Only tomato and sausage need chopping here.",
  "这里只能放置番茄、香肠、芝士或面团。":
    "Only tomato, sausage, cheese, or dough can be placed here.",
  "番茄需要先洗净。": "Wash the tomato first.",
  "手中没有可归还的工具。": "You are not carrying a tool that can be returned.",
  "工具需放回原工位。": "Return the tool to its original station.",
  "水已经用完了。": "The water has run out.",
  "先把番茄放进水池。": "Place the tomato in the sink first.",
  "请先打开水龙头。": "Turn on the faucet first.",
  "清洗区域无效。": "The washing area is invalid.",
  "请在菜板切菜。": "Chop on a cutting board.",
  "请放入可以切的食材。": "Place an ingredient that can be chopped.",
  "已经切好了，请归还菜刀。": "Chopping is complete. Return the knife.",
  "请在菜板擦拭。": "Wipe at a cutting-board station.",
  "先拿走菜板上的食材。": "Remove the ingredient from the board first.",
  "请拿起尚未展开的面饼。": "Pick up dough that has not been stretched yet.",
  "请在菜板上展开面团。": "Stretch the dough on a cutting board.",
  "请把尚未展开的面团放到菜板上。":
    "Place unstretched dough on the cutting board first.",
  "垃圾桶在菜板工位。": "The bin is at a cutting-board station.",
  "只能丢弃食材。": "Only ingredients can be discarded.",
  "手中没有食材。": "You are not carrying an ingredient.",
  "这份食材已经加入了。": "That ingredient has already been added.",
  "番茄需洗净切碎，香肠需切碎，面饼需双手展开。":
    "Wash and chop the tomato, chop the sausage, and stretch the dough with both hands.",
  "番茄需洗净切碎，香肠和芝士需切碎，面饼需双手展开。":
    "Wash and chop the tomato, chop the sausage and cheese, and stretch the dough with both hands.",
  "等 Pizza 烤好后再取出。":
    "Wait until the pizza is ready before taking it out.",
  "先用隔热手套将 Pizza 取到托盘。":
    "Use the oven mitt to move the pizza to the tray first.",
  "未知厨房动作。": "Unknown kitchen action.",
  "房间不存在，可能已随服务器重启关闭。":
    "Kitchen not found. The server may have restarted.",
  "服务器未开启手动测试模式。":
    "Manual test mode is not enabled on this server.",
  "请输入四位房间码。": "Enter a four-letter kitchen code.",
  "房间最多连接四台电脑。": "A kitchen can connect up to four computers.",
  "未知工位。": "Unknown station.",
  "这个工位已经有电脑加入。":
    "Another computer has already joined this station.",
  "游戏开始后不能添加玩家。": "Chefs cannot be added after the game starts.",
  "最多四位厨师。": "A kitchen can have up to four chefs.",
  "请输入 1–20 字的名字和有效颜色。":
    "Enter a name from 1 to 20 characters and a valid color.",
  "名字和颜色不能重复。": "Chef names and colors must be unique.",
  "请在准备室录脸。": "Enroll faces in the lobby.",
  "找不到这位厨师。": "That chef could not be found.",
  "人脸模型版本不匹配。": "The face-model version does not match.",
  "人脸模板必须是归一化的 512 维向量。":
    "The face template must be a normalized 512-dimensional vector.",
  "只有房主可以开始或重开。": "Only the host can start or restart the game.",
  "当前不能开始新一轮。": "A new round cannot start right now.",
  "正式模式需要四位厨师；测试模式可单人体验。":
    "Standard mode requires four chefs; manual test mode supports solo play.",
  "请先为房间内每台电脑分配工位。":
    "Assign a station to every connected computer first.",
  "请完成四位厨师录脸并连接四台工位。":
    "Enroll four chefs and connect all four stations first.",
  "无效身份依据。": "Invalid identity evidence.",
  "无效识别置信度。": "Invalid recognition confidence.",
  "清除身份时不能包含玩家。": "A cleared identity cannot include a chef.",
  "未识别到房间内玩家。": "No chef in this kitchen was recognized.",
  "此房间未开启手动身份。": "Manual identity is not enabled for this kitchen.",
  "请先录脸。": "Enroll this chef's face first.",
  "当前电脑的控制身份已经变化。":
    "The chef controlled by this computer has changed.",
  "动作 ID 或版本号无效。": "The action ID or version is invalid.",
  "同一个动作 ID 不能用于不同操作。":
    "The same action ID cannot be used for different actions.",
  "电脑绑定的工位已变化。": "This computer's assigned station changed.",
  "身份已过期，请重新面对摄像头。":
    "Identity expired. Please face the camera again.",
  "这位厨师已移动到另一台电脑。": "This chef moved to another computer.",
  "控制身份已变化，请重新确认当前玩家。":
    "The controlled chef changed. Please confirm the current chef again.",
  "厨房状态已更新，请重试。": "The kitchen changed. Please try again.",
  "厨房动作格式无效。": "The kitchen action format is invalid.",
  "操作太快，请稍候。": "You're moving too quickly. Please wait a moment.",
};

export function commandErrorText(
  language: Language,
  code: ErrorCode,
  chineseMessage: string,
) {
  return language === "zh"
    ? chineseMessage
    : (englishServerMessages[chineseMessage] ?? englishCommandErrors[code]);
}

export function activeCommandErrorText(
  code: ErrorCode,
  chineseMessage: string,
) {
  return commandErrorText(activeLanguage, code, chineseMessage);
}

const chineseRuntimeMessages: Record<string, string> = {
  "operation has timed out": "厨房响应超时，请重试。",
  "Cannot normalize an empty or zero embedding.": "无法处理空的人脸特征。",
  "Embeddings must have matching non-zero dimensions.": "人脸特征维度不匹配。",
  "Embeddings must have equal non-zero dimensions.": "人脸特征维度必须一致。",
  "Face detector is not initialized.": "人脸检测器尚未完成初始化。",
  "Face recognition provider is not initialized.":
    "人脸识别模型尚未完成初始化。",
  "The face embedding model returned no output.": "人脸特征模型没有返回结果。",
  "Face alignment landmarks are unavailable.": "无法取得人脸对齐特征点。",
};

export function runtimeErrorText(language: Language, message: string) {
  return language === "zh"
    ? (chineseRuntimeMessages[message] ?? message)
    : message;
}
