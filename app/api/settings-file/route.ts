import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import {
    EDITABLE_FIELDS,
    getEditableFieldsWithValues,
    parsePalworldSettingsIni,
    serializePalworldSettingsIni,
} from '@/lib/palworld-ini'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 掛載進容器的 PalWorldSettings.ini 路徑,透過 docker-compose.yml 的環境變數指定
const INI_PATH = process.env.PALWORLD_INI_PATH || '/config/PalWorldSettings.ini'

// 待套用的設定佇列。dashboard 把要改的值寫進這個檔案,palworld 容器下次開機時
// 由 palworld-hook/apply-pending.sh 在 PalServer 啟動前套進 ini——這樣就算遊戲
// 引擎在關機時把記憶體舊值回寫蓋掉直接寫進 ini 的修改,開機 hook 還是會補回來,
// 徹底避開「寫入 vs 引擎回寫」的時序競爭。
const PENDING_PATH = path.join(path.dirname(INI_PATH), 'pending-settings.txt')

const EDITABLE_FIELD_MAP = new Map(EDITABLE_FIELDS.map((f) => [f.key, f]))

// 驗證單一欄位的值合法(同時也是給 apply-pending.sh 的第一道防線:確保寫進
// pending 檔的值是乾淨的數字/列舉字串,不會有能注入 sed 或破壞 ini 結構的字元)
function isValidValue(key: string, value: string): boolean {
    const field = EDITABLE_FIELD_MAP.get(key)
    if (!field) return false
    if (field.type === 'enum') {
        return (field.options ?? []).includes(value)
    }
    // float / int:只允許數字(可含小數點與負號)
    return /^-?\d+(\.\d+)?$/.test(value)
}

// 選配的第二道密碼:就算 dashboard 主密碼外洩,寫入設定這個動作還多一層防護
// 沒有設定這個環境變數的話,就不會要求(等於只靠 dashboard 本身的登入)
const SETTINGS_EDITOR_PASSWORD = process.env.SETTINGS_EDITOR_PASSWORD || ''

export async function GET() {
    try {
        const content = await fs.readFile(INI_PATH, 'utf-8')
        const parsed = parsePalworldSettingsIni(content)
        const fields = getEditableFieldsWithValues(parsed)

        return NextResponse.json({ fields })
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : '讀取 PalWorldSettings.ini 失敗,確認伺服器是否已經開機過至少一次(檔案要開機後才會產生)',
            },
            { status: 500 },
        )
    }
}

export async function POST(request: NextRequest) {
    if (SETTINGS_EDITOR_PASSWORD) {
        const providedPassword =
            request.headers.get('x-settings-password') ?? ''
        if (providedPassword !== SETTINGS_EDITOR_PASSWORD) {
            return NextResponse.json(
                { error: '設定編輯密碼錯誤' },
                { status: 401 },
            )
        }
    }

    let updates: Record<string, string>
    try {
        const body = await request.json()
        updates = (body?.updates ?? {}) as Record<string, string>
    } catch {
        return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
    }

    const allowedKeys = new Set(EDITABLE_FIELDS.map((field) => field.key))
    const invalidKeys = Object.keys(updates).filter(
        (key) => !allowedKeys.has(key),
    )
    if (invalidKeys.length > 0) {
        return NextResponse.json(
            { error: `不允許修改這些欄位: ${invalidKeys.join(', ')}` },
            { status: 400 },
        )
    }

    const badValues = Object.entries(updates).filter(
        ([key, value]) => !isValidValue(key, value),
    )
    if (badValues.length > 0) {
        return NextResponse.json(
            {
                error: `這些欄位的值格式不正確: ${badValues
                    .map(([key]) => key)
                    .join(', ')}`,
            },
            { status: 400 },
        )
    }

    let content: string
    try {
        content = await fs.readFile(INI_PATH, 'utf-8')
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : '讀取設定檔失敗',
            },
            { status: 500 },
        )
    }

    let parsed: ReturnType<typeof parsePalworldSettingsIni>
    try {
        parsed = parsePalworldSettingsIni(content)
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : '設定檔格式解析失敗',
            },
            { status: 500 },
        )
    }

    for (const [key, value] of Object.entries(updates)) {
        parsed.values[key] = value
    }

    const newContent = serializePalworldSettingsIni(parsed)

    try {
        // 1. 直接寫進 ini:讓頁面重新載入時能立刻看到新值(即使伺服器還開著、
        //    這份寫入之後可能被引擎關機回寫蓋掉,也會由開機 hook 補回來)
        // 寫入前先備份一份目前的檔案,萬一新內容有問題還能手動救回來
        await fs.writeFile(`${INI_PATH}.bak`, content, 'utf-8')
        await fs.writeFile(INI_PATH, newContent, 'utf-8')

        // 2. 把這批更新併進 pending 佇列:這才是真正保證會生效的機制——
        //    palworld 容器下次開機時,hook 會在 PalServer 啟動前把它套進 ini
        await mergePendingUpdates(updates)
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : '寫入設定檔失敗',
            },
            { status: 500 },
        )
    }

    return NextResponse.json({ success: true })
}

// 讀出現有 pending 檔(可能有先前尚未套用的更新)、併入這次的更新、寫回。
// 檔案格式:每行一個 key=value,已驗證過的乾淨值。
async function mergePendingUpdates(updates: Record<string, string>) {
    const pending = new Map<string, string>()

    try {
        const existing = await fs.readFile(PENDING_PATH, 'utf-8')
        for (const line of existing.split('\n')) {
            const idx = line.indexOf('=')
            if (idx === -1) continue
            const key = line.slice(0, idx).trim()
            if (key) pending.set(key, line.slice(idx + 1).trim())
        }
    } catch {
        // 沒有現存 pending 檔屬正常情況,忽略
    }

    for (const [key, value] of Object.entries(updates)) {
        pending.set(key, value)
    }

    const body =
        Array.from(pending.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join('\n') + '\n'
    await fs.writeFile(PENDING_PATH, body, 'utf-8')
}
