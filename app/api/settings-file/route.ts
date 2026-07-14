import { promises as fs } from 'node:fs'
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
        // 寫入前先備份一份目前的檔案,萬一新內容有問題還能手動救回來
        await fs.writeFile(`${INI_PATH}.bak`, content, 'utf-8')
        await fs.writeFile(INI_PATH, newContent, 'utf-8')
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
