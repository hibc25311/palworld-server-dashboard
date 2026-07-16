/**
 * PalWorldSettings.ini 讀寫模組
 *
 * 這個檔案的實際格式(已對照官方 docker image 的預設檔驗證過)長這樣,永遠只有兩行:
 *
 *   [/Script/Pal.PalGameWorldSettings]
 *   OptionSettings=(Difficulty=None,ExpRate=1.000000,...,ServerName="My Server",...)
 *
 * 重點:
 * - 所有設定值都塞在同一行的 OptionSettings=(...) 括號裡,用逗號分隔
 * - 字串值會用雙引號包起來(裡面可能包含逗號),所以不能單純用 split(',')
 * - 布林值是 True/False(注意大寫開頭),數值型是像 1.000000 這種固定小數
 * - 有些欄位名稱其實是官方的拼字錯誤(例如 PlayerStaminaDecreaceRate,
 *   不是 Decrease),必須照抄錯字,遊戲才吃得到這個設定
 *
 * 參考來源:
 * https://palworld.wiki.gg/wiki/PalWorldSettings.ini
 * https://github.com/hmes98318/palworld-docker/blob/main/DefaultPalWorldSettings.ini
 */

const INI_HEADER = '[/Script/Pal.PalGameWorldSettings]'

export interface PalworldSettingsMap {
    /** 保留原始欄位順序,寫回檔案時維持不變,減少 diff / 避免破壞未知欄位 */
    order: string[]
    /** key -> 原始字串值(含引號、大小寫等,未經轉型) */
    values: Record<string, string>
}

/**
 * 把 OptionSettings=(...) 括號裡的內容,依逗號切開成一個個 Key=Value片段。
 * 分隔用的逗號不能出現在:
 *  - 雙引號內(例如 ServerDescription="Hi, there")
 *  - 巢狀括號內(例如 CrossplayPlatforms=(Steam,Xbox,PS5)——這整組是一個值)
 * 兩者都要略過,否則會把單一欄位拆成多段、re-serialize 時寫壞檔案。
 */
function splitOptionSettings(inner: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    let depth = 0

    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i]

        if (ch === '"') {
            inQuotes = !inQuotes
            current += ch
            continue
        }

        if (!inQuotes) {
            if (ch === '(') {
                depth++
            } else if (ch === ')') {
                depth--
            } else if (ch === ',' && depth === 0) {
                parts.push(current)
                current = ''
                continue
            }
        }

        current += ch
    }

    if (current.length > 0) {
        parts.push(current)
    }

    return parts
}

export function parsePalworldSettingsIni(content: string): PalworldSettingsMap {
    const match = content.match(/OptionSettings=\(([\s\S]*)\)\s*$/m)

    if (!match) {
        throw new Error(
            '在檔案裡找不到 OptionSettings=(...) 區塊,檔案格式可能不正確',
        )
    }

    const inner = match[1]
    const parts = splitOptionSettings(inner)

    const order: string[] = []
    const values: Record<string, string> = {}

    for (const part of parts) {
        const idx = part.indexOf('=')
        if (idx === -1) {
            continue
        }

        const key = part.slice(0, idx).trim()
        const value = part.slice(idx + 1)

        order.push(key)
        values[key] = value
    }

    return { order, values }
}

export function serializePalworldSettingsIni(
    settings: PalworldSettingsMap,
): string {
    const body = settings.order
        .map((key) => `${key}=${settings.values[key]}`)
        .join(',')
    return `${INI_HEADER}\nOptionSettings=(${body})\n`
}

/** 數值型欄位存回檔案時,沿用遊戲原本的固定小數格式,避免格式不一致造成解析問題 */
export function formatFloatValue(value: number): string {
    return value.toFixed(2)
}

export function formatBoolValue(value: boolean): string {
    return value ? 'True' : 'False'
}

export type EditableFieldType = 'float' | 'int' | 'bool' | 'enum'

export interface EditableField {
    /** 對應 ini 檔案裡實際的欄位名稱,注意有些是官方拼字錯誤,不要「修正」它 */
    key: string
    label: string
    type: EditableFieldType
    /** UI 分組標題(倍率 / 傷害 / 生存 …),同組欄位排在一起顯示 */
    group: string
    /** 官方預設值,顯示在欄位旁當參考(不是目前值) */
    default: string
    options?: string[]
    description?: string
}

/**
 * 開放可編輯的欄位白名單。刻意只列出遊戲玩法相關項目,
 * 不開放 ServerName / 密碼 / port / RCON / BanList 這些欄位——那些已經由
 * docker-compose.full.yml 的環境變數 / .env 管理,兩邊同時管會互相覆蓋、造成混亂。
 * key 必須完全對應 ini 裡的實際欄位名(含官方拼字錯誤,例如 Decreace,別「修正」)。
 */
export const EDITABLE_FIELDS: EditableField[] = [
    // 倍率(核心)
    {
        group: '倍率',
        key: 'ExpRate',
        label: '經驗值倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '倍率',
        key: 'PalCaptureRate',
        label: '帕魯捕獲率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '倍率',
        key: 'PalSpawnNumRate',
        label: '帕魯出現數量倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '倍率',
        key: 'WorkSpeedRate',
        label: '工作速度倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '倍率',
        key: 'CollectionDropRate',
        label: '採集掉落倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '倍率',
        key: 'EnemyDropItemRate',
        label: '打怪掉落倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '倍率',
        key: 'PalEggDefaultHatchingTime',
        label: '孵蛋時間(小時)',
        type: 'float',
        default: '1.00',
    },

    // 時間流速
    {
        group: '時間',
        key: 'DayTimeSpeedRate',
        label: '白天時間流速',
        type: 'float',
        default: '1.00',
    },
    {
        group: '時間',
        key: 'NightTimeSpeedRate',
        label: '夜晚時間流速',
        type: 'float',
        default: '1.00',
    },

    // 傷害倍率
    {
        group: '傷害',
        key: 'PalDamageRateAttack',
        label: '帕魯攻擊倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '傷害',
        key: 'PalDamageRateDefense',
        label: '帕魯受傷倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '傷害',
        key: 'PlayerDamageRateAttack',
        label: '玩家攻擊倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '傷害',
        key: 'PlayerDamageRateDefense',
        label: '玩家受傷倍率',
        type: 'float',
        default: '1.00',
    },

    // 生存
    {
        group: '生存',
        key: 'PlayerStaminaDecreaceRate',
        label: '玩家體力消耗倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'PlayerStomachDecreaceRate',
        label: '玩家肚子餓速度倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'PlayerAutoHPRegeneRate',
        label: '玩家自動回血倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'PlayerAutoHpRegeneRateInSleep',
        label: '玩家睡眠回血倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'PalStomachDecreaceRate',
        label: '帕魯肚子餓速度倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'PalStaminaDecreaceRate',
        label: '帕魯體力消耗倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'PalAutoHPRegeneRate',
        label: '帕魯自動回血倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'PalAutoHpRegeneRateInSleep',
        label: '帕魯睡眠回血倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'ItemWeightRate',
        label: '物品重量倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '生存',
        key: 'DropItemAliveMaxHours',
        label: '掉落物存在時數',
        type: 'float',
        default: '1.00',
    },

    // 裝備/物品
    {
        group: '裝備/物品',
        key: 'EquipmentDurabilityDamageRate',
        label: '裝備耐久消耗倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '裝備/物品',
        key: 'ItemCorruptionMultiplier',
        label: '物品腐敗速度倍率',
        type: 'float',
        default: '1.00',
    },

    // 牧場
    {
        group: '牧場',
        key: 'MonsterFarmActionSpeedRate',
        label: '牧場工作速度倍率',
        type: 'float',
        default: '1.00',
    },

    // 建築/採集
    {
        group: '建築/採集',
        key: 'BuildObjectHpRate',
        label: '建築耐久倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '建築/採集',
        key: 'BuildObjectDeteriorationDamageRate',
        label: '建築劣化速度倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '建築/採集',
        key: 'CollectionObjectRespawnSpeedRate',
        label: '採集物重生速度倍率',
        type: 'float',
        default: '1.00',
    },
    {
        group: '建築/採集',
        key: 'bBuildAreaLimit',
        label: '建築區域限制',
        type: 'bool',
        default: 'False',
    },

    // 容量上限(整數)
    {
        group: '容量上限',
        key: 'BaseCampMaxNum',
        label: '據點數量上限',
        type: 'int',
        default: '128',
    },
    {
        group: '容量上限',
        key: 'BaseCampWorkerMaxNum',
        label: '據點工人上限',
        type: 'int',
        default: '15',
    },
    {
        group: '容量上限',
        key: 'BaseCampMaxNumInGuild',
        label: '公會據點上限',
        type: 'int',
        default: '4',
    },
    {
        group: '容量上限',
        key: 'GuildPlayerMaxNum',
        label: '公會人數上限',
        type: 'int',
        default: '20',
    },
    {
        group: '容量上限',
        key: 'DropItemMaxNum',
        label: '地上掉落物上限',
        type: 'int',
        default: '3000',
    },
    {
        group: '容量上限',
        key: 'MaxBuildingLimitNum',
        label: '單據點建築上限(0=無限)',
        type: 'int',
        default: '0',
    },
]

export function getEditableFieldsWithValues(settings: PalworldSettingsMap) {
    return EDITABLE_FIELDS.map((field) => ({
        ...field,
        value: settings.values[field.key] ?? null,
    }))
}
