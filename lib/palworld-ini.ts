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
 * 必須考慮雙引號內的逗號不能被當成分隔符(例如 ServerDescription="Hi, there")。
 */
function splitOptionSettings(inner: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i]

        if (ch === '"') {
            inQuotes = !inQuotes
            current += ch
            continue
        }

        if (ch === ',' && !inQuotes) {
            parts.push(current)
            current = ''
            continue
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
    return value.toFixed(6)
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
    options?: string[]
    description?: string
}

/**
 * 開放可編輯的欄位白名單。刻意只列出遊戲倍率/難度相關項目,
 * 不開放 ServerName / 密碼 / port 這些欄位——那些已經由 docker-compose.yml
 * 的環境變數管理,兩邊同時管會互相覆蓋、造成混亂。
 */
export const EDITABLE_FIELDS: EditableField[] = [
    { key: 'ExpRate', label: '經驗值倍率', type: 'float' },
    { key: 'PalCaptureRate', label: '帕魯捕獲率', type: 'float' },
    { key: 'PalSpawnNumRate', label: '帕魯出現數量倍率', type: 'float' },
    { key: 'WorkSpeedRate', label: '工作速度倍率', type: 'float' },
    { key: 'CollectionDropRate', label: '採集掉落倍率', type: 'float' },
    { key: 'EnemyDropItemRate', label: '打怪掉落倍率', type: 'float' },
    {
        key: 'PalEggDefaultHatchingTime',
        label: '孵蛋時間(小時)',
        type: 'float',
    },
    {
        key: 'PlayerStaminaDecreaceRate',
        label: '玩家體力消耗倍率',
        type: 'float',
    },
    {
        key: 'PlayerStomachDecreaceRate',
        label: '玩家肚子餓速度倍率',
        type: 'float',
    },
    {
        key: 'DeathPenalty',
        label: '死亡懲罰',
        type: 'enum',
        options: ['None', 'Item', 'ItemAndEquipment', 'All'],
    },
]

export function getEditableFieldsWithValues(settings: PalworldSettingsMap) {
    return EDITABLE_FIELDS.map((field) => ({
        ...field,
        value: settings.values[field.key] ?? null,
    }))
}
