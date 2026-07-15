'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useServer } from '@/lib/server-context'
import type { EditableField } from '@/lib/palworld-ini'

type FieldWithValue = EditableField & { value: string | null }

/**
 * 這個頁面刻意用最基本的 HTML input/select + Tailwind class 寫,
 * 沒有直接套用專案裡 components/ui/* 的 Radix 元件,
 * 是因為那些元件的實際 props 介面沒有一併確認過,貿然套用容易寫出編譯不過的程式碼。
 * 你可以照現有的視覺風格,把下面的 <input>/<select>/<button> 換成
 * components/ui 底下對應的元件,功能邏輯(useState / handleSave)不用動。
 */
export default function SettingsPage() {
    const { config, isConfigured, apiCall } = useServer()

    const [fields, setFields] = useState<FieldWithValue[]>([])
    const [draft, setDraft] = useState<Record<string, string>>({})
    const [settingsPassword, setSettingsPassword] = useState('')
    const [isLoadingFields, setIsLoadingFields] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const loadFields = async () => {
        setIsLoadingFields(true)
        setLoadError(null)

        try {
            const response = await fetch('/api/settings-file', {
                cache: 'no-store',
            })
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || '讀取設定失敗')
            }

            const loadedFields = data.fields as FieldWithValue[]
            setFields(loadedFields)

            const nextDraft: Record<string, string> = {}
            for (const field of loadedFields) {
                if (field.value !== null) {
                    nextDraft[field.key] = field.value
                }
            }
            setDraft(nextDraft)
        } catch (error) {
            setLoadError(
                error instanceof Error ? error.message : '讀取設定失敗',
            )
        } finally {
            setIsLoadingFields(false)
        }
    }

    useEffect(() => {
        void loadFields()
    }, [])

    const handleFieldChange = (key: string, rawValue: string) => {
        setDraft((prev) => ({ ...prev, [key]: rawValue }))
    }

    const handleSave = async () => {
        setIsSaving(true)

        try {
            // 只送出跟載入時不一樣的欄位,避免整批覆蓋
            const updates: Record<string, string> = {}
            for (const field of fields) {
                const currentValue = draft[field.key]
                if (
                    currentValue !== undefined &&
                    currentValue !== field.value
                ) {
                    updates[field.key] =
                        field.type === 'float'
                            ? formatFloatInput(currentValue)
                            : currentValue
                }
            }

            if (Object.keys(updates).length === 0) {
                toast.info('沒有變更,不需要儲存')
                return
            }

            // Palworld 伺服器行程關機的那一刻,會把它記憶體裡目前的設定值
            // 回寫進 PalWorldSettings.ini——如果我們是「先寫新值、才叫它關機」,
            // 關機那瞬間就會用記憶體裡的舊值把我們剛寫的新值蓋掉。
            // 所以正確順序是:先關機、輪詢確認真的斷線了,才能寫入新值。
            // 用輪詢偵測「真的斷線」而不是固定秒數瞎等,是因為 docker 的
            // restart: unless-stopped 會在行程死掉後自動重建 container,
            // 這個重建時機不受我們控制,固定等待秒數容易猜錯(猜短了,
            // 新行程可能已經把舊設定讀進記憶體,我們才寫入就晚了一步)。
            // 輪詢把這個空檔壓到最短,但無法保證 100% 消除競爭——
            // 真的要完全消除,只能靠手動 docker compose stop → 存檔 → start。
            if (isConfigured) {
                try {
                    const waittime = 5
                    await apiCall('shutdown', 'POST', {
                        waittime,
                        message: `設定更新,伺服器將在 ${waittime} 秒後關閉套用新設定`,
                    })
                    toast.info('等待伺服器關閉...')

                    const pollIntervalMs = 1000
                    const maxWaitMs = (waittime + 30) * 1000
                    const startedAt = Date.now()
                    let confirmedOffline = false

                    while (Date.now() - startedAt < maxWaitMs) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, pollIntervalMs),
                        )
                        try {
                            await apiCall('metrics')
                        } catch {
                            confirmedOffline = true
                            break
                        }
                    }

                    if (!confirmedOffline) {
                        toast.warning(
                            '等待伺服器關閉逾時,仍會嘗試寫入設定,但可能被之後的重啟覆蓋',
                        )
                    }
                } catch (shutdownError) {
                    toast.warning(
                        '呼叫關機 API 失敗,將直接嘗試寫入設定——如果伺服器目前是開著的,這次修改可能會在下次關機時被蓋掉: ' +
                            (shutdownError instanceof Error
                                ? shutdownError.message
                                : String(shutdownError)),
                    )
                }
            }

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            }
            if (settingsPassword) {
                headers['x-settings-password'] = settingsPassword
            }

            const response = await fetch('/api/settings-file', {
                method: 'POST',
                headers,
                body: JSON.stringify({ updates }),
            })
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || '儲存失敗')
            }

            // docker-compose.yml 設定了 restart: unless-stopped,伺服器行程
            // 結束後 Docker 會自動重建容器,讀到我們剛寫入的新 ini。
            toast.success(
                '設定已寫入,伺服器即將自動重新啟動套用新設定(約需數十秒到 1 分鐘)',
            )

            await loadFields()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '儲存失敗')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="mx-auto max-w-2xl p-6">
            <h1 className="mb-1 text-xl font-semibold">Server Settings</h1>
            <p className="mb-6 text-sm text-muted-foreground">
                直接編輯 PalWorldSettings.ini
                裡的遊戲倍率設定,儲存後會自動重啟伺服器套用。
            </p>

            {config && (
                <p className="mb-4 text-xs text-muted-foreground">
                    目前連線目標:{config.serverIp}:{config.restApiPort}
                </p>
            )}

            {loadError && (
                <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {loadError}
                </div>
            )}

            {isLoadingFields ? (
                <p className="text-sm text-muted-foreground">讀取中...</p>
            ) : (
                <div className="space-y-4">
                    {fields.map((field) => (
                        <div
                            key={field.key}
                            className="flex items-center justify-between gap-4"
                        >
                            <label htmlFor={field.key} className="text-sm">
                                {field.label}
                                <span className="ml-1 text-xs text-muted-foreground">
                                    ({field.key})
                                </span>
                            </label>

                            {field.type === 'enum' ? (
                                <select
                                    id={field.key}
                                    className="rounded-md border px-2 py-1 text-sm"
                                    value={draft[field.key] ?? ''}
                                    onChange={(e) =>
                                        handleFieldChange(
                                            field.key,
                                            e.target.value,
                                        )
                                    }
                                >
                                    {field.options?.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    id={field.key}
                                    type="text"
                                    inputMode="decimal"
                                    className="w-32 rounded-md border px-2 py-1 text-sm"
                                    value={draft[field.key] ?? ''}
                                    onChange={(e) =>
                                        handleFieldChange(
                                            field.key,
                                            e.target.value,
                                        )
                                    }
                                />
                            )}
                        </div>
                    ))}

                    <div className="pt-4">
                        <label
                            htmlFor="settings-password"
                            className="mb-1 block text-sm"
                        >
                            設定編輯密碼(選配,伺服器若沒設定
                            SETTINGS_EDITOR_PASSWORD 可留空)
                        </label>
                        <input
                            id="settings-password"
                            type="password"
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            value={settingsPassword}
                            onChange={(e) =>
                                setSettingsPassword(e.target.value)
                            }
                        />
                    </div>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                    >
                        {isSaving ? '儲存中...' : '儲存並重啟套用'}
                    </button>
                </div>
            )}
        </div>
    )
}

function formatFloatInput(rawValue: string): string {
    const parsed = Number.parseFloat(rawValue)
    if (Number.isNaN(parsed)) {
        return rawValue
    }
    return parsed.toFixed(6)
}
