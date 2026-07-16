'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useServer } from '@/lib/server-context'
import { buildPalworldProxyHeaders } from '@/lib/palworld'
import type { EditableField } from '@/lib/palworld-ini'

type FieldWithValue = EditableField & { value: string | null }

/**
 * 這個頁面刻意用最基本的 HTML input/select + Tailwind class 寫,
 * 沒有直接套用專案裡 components/ui/* 的 Radix 元件,
 * 是因為那些元件的實際 props 介面沒有一併確認過,貿然套用容易寫出編譯不過的程式碼。
 * 你可以照現有的視覺風格,把下面的 <input>/<select>/<button> 換成
 * components/ui 底下對應的元件,功能邏輯(useState / handleSave)不用動。
 */
export function SettingsEditor() {
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
                headers: config ? buildPalworldProxyHeaders(config) : {},
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
                    // float 統一顯示成 2 位小數(ini 裡是 1.500000,顯示成 1.50)
                    nextDraft[field.key] =
                        field.type === 'float'
                            ? formatFloatInput(field.value)
                            : field.value
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
            // 只送出跟載入時不一樣的欄位,避免整批覆蓋。
            // float 兩邊都先正規化成 2 位小數再比,避免 1.50 vs 1.500000
            // 這種「格式不同、數值相同」被誤判成有變更。
            const normalize = (field: FieldWithValue, v: string) =>
                field.type === 'float' ? formatFloatInput(v) : v
            const updates: Record<string, string> = {}
            for (const field of fields) {
                const currentValue = draft[field.key]
                if (currentValue === undefined) continue
                const newVal = normalize(field, currentValue)
                const origVal = normalize(field, field.value ?? '')
                if (newVal !== origVal) {
                    updates[field.key] = newVal
                }
            }

            if (Object.keys(updates).length === 0) {
                toast.info('沒有變更,不需要儲存')
                return
            }

            // 1. 寫入設定:API 除了直接寫 ini(讓頁面重載能立刻看到新值),
            //    也會把這批更新併進 pending 佇列。真正保證生效的是 pending——
            //    palworld 容器下次開機時,hook 會在 PalServer 啟動前把它套進 ini。
            //    因此不論關機/重啟的時序如何,設定都不會被引擎回寫蓋掉(競爭消失)。
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            }
            if (config) {
                Object.assign(headers, buildPalworldProxyHeaders(config))
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

            // 2. 觸發重啟,讓開機 hook 把 pending 套進 ini。單純呼叫官方 shutdown
            //    即可——不用再輪詢等待,因為生效與否已經不取決於時序了。
            if (isConfigured) {
                try {
                    await apiCall('shutdown', 'POST', {
                        waittime: 5,
                        message: '設定更新,伺服器將在 5 秒後重啟套用新設定',
                    })
                    toast.success(
                        '設定已排入,伺服器重啟後自動套用(約數十秒到 1 分鐘)',
                    )
                } catch (shutdownError) {
                    toast.warning(
                        '設定已排入,但呼叫重啟 API 失敗,請手動重啟伺服器讓新設定生效: ' +
                            (shutdownError instanceof Error
                                ? shutdownError.message
                                : String(shutdownError)),
                    )
                }
            } else {
                toast.warning(
                    '設定已排入,但目前未連線,請手動重啟伺服器讓新設定生效',
                )
            }

            await loadFields()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '儲存失敗')
        } finally {
            setIsSaving(false)
        }
    }

    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
    const groupsInitialized = useRef(false)

    useEffect(() => {
        if (groupsInitialized.current || fields.length === 0) return
        groupsInitialized.current = true
        const groups = [...new Set(fields.map((field) => field.group))]
        setOpenGroups(
            Object.fromEntries(groups.map((group) => [group, group === groups[0]])),
        )
    }, [fields])

    const toggleGroup = (group: string) => {
        setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))
    }

    const fieldGroups = fields.reduce<
        Array<{ group: string; fields: FieldWithValue[] }>
    >((acc, field) => {
        const last = acc[acc.length - 1]
        if (last?.group === field.group) {
            last.fields.push(field)
        } else {
            acc.push({ group: field.group, fields: [field] })
        }
        return acc
    }, [])

    return (
        <div className="mx-auto max-w-2xl p-6">
            <h1 className="mb-1 text-xl font-semibold">Server Settings</h1>
            <p className="mb-6 text-sm text-muted-foreground">
                直接編輯 PalWorldSettings.ini
                裡的遊戲倍率設定,儲存後會自動重啟伺服器套用。
            </p>
            <p className="mb-6 text-sm text-muted-foreground">
                <a
                    className="text-primary"
                    href="https://palworld-server-docker.loef.dev/getting-started/configuration/game-settings"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    https://palworld-server-docker.loef.dev/getting-started/configuration/game-settings
                </a>
            </p>

            {loadError && (
                <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {loadError}
                </div>
            )}

            {isLoadingFields ? (
                <p className="text-sm text-muted-foreground">讀取中...</p>
            ) : (
                <div className="space-y-2">
                    {fieldGroups.map(({ group, fields: groupFields }) => (
                        <div
                            key={group}
                            className="rounded-md border border-border/60 px-3 py-2"
                        >
                            <button
                                type="button"
                                onClick={() => toggleGroup(group)}
                                aria-expanded={openGroups[group] ?? false}
                                className="flex w-full cursor-pointer items-center gap-2 py-1 text-left text-sm font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                                <ChevronDown
                                    className={`size-4 shrink-0 transition-transform ${openGroups[group] ? 'rotate-180' : ''}`}
                                />
                                {group}
                                <span className="text-xs font-normal normal-case tracking-normal">
                                    ({groupFields.length})
                                </span>
                            </button>
                            {openGroups[group] && (
                                <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                                {groupFields.map((field) => (
                                    <div
                                        key={field.key}
                                        className="flex items-center justify-between gap-4 py-1"
                                    >
                                        <label
                                            htmlFor={field.key}
                                            className="text-sm"
                                        >
                                            {field.label}
                                            <span className="ml-1 text-xs text-muted-foreground">
                                                ({field.key}, 預設 {field.default})
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
                                                    <option
                                                        key={option}
                                                        value={option}
                                                    >
                                                        {option}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : field.type === 'bool' ? (
                                            <select
                                                id={field.key}
                                                className="rounded-md border px-2 py-1 text-sm"
                                                value={
                                                    draft[field.key] ?? 'False'
                                                }
                                                onChange={(e) =>
                                                    handleFieldChange(
                                                        field.key,
                                                        e.target.value,
                                                    )
                                                }
                                            >
                                                <option value="True">
                                                    開啟 (True)
                                                </option>
                                                <option value="False">
                                                    關閉 (False)
                                                </option>
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
                                </div>
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
    return parsed.toFixed(2)
}
