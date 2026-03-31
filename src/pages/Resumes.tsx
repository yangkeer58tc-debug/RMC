import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import TopBar from '@/components/TopBar'
import StatusBadge from '@/components/StatusBadge'
import { listResumes } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { ResumeListItem } from '@/types/resume'

export default function ResumesPage() {
  const [items, setItems] = useState<ResumeListItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('')
  const [minWorkYears, setMinWorkYears] = useState('')
  const [maxWorkYears, setMaxWorkYears] = useState('')

  const params = useMemo(
    () => ({ q, country, city, status, minWorkYears, maxWorkYears }),
    [q, country, city, status, minWorkYears, maxWorkYears],
  )

  const load = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const data = await listResumes(params)
      setItems(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setBusy(false)
    }
  }, [params])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-screen bg-zinc-50">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">简历列表</h1>
            <p className="mt-1 text-sm text-zinc-600">支持按姓名、国家/城市、工作年限与状态筛选。</p>
          </div>
          <button
            type="button"
            onClick={load}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              busy ? 'bg-zinc-200 text-zinc-500' : 'bg-zinc-900 text-white hover:bg-zinc-800',
            )}
            disabled={busy}
          >
            {busy ? '刷新中…' : '刷新'}
          </button>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="姓名/邮箱/电话/WhatsApp"
              className="md:col-span-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="国家"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="城市"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
            <input
              value={minWorkYears}
              onChange={(e) => setMinWorkYears(e.target.value)}
              placeholder="最小年限"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
            <input
              value={maxWorkYears}
              onChange={(e) => setMaxWorkYears(e.target.value)}
              placeholder="最大年限"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">全部状态</option>
                <option value="processing">解析中</option>
                <option value="success">已入库</option>
                <option value="failed">失败</option>
              </select>
              <button
                type="button"
                onClick={load}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                disabled={busy}
              >
                应用筛选
              </button>
              <button
                type="button"
                onClick={() => {
                  setQ('')
                  setCountry('')
                  setCity('')
                  setStatus('')
                  setMinWorkYears('')
                  setMaxWorkYears('')
                }}
                className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
              >
                重置
              </button>
            </div>
            <div className="text-xs text-zinc-500">最多显示 200 条</div>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="grid grid-cols-12 gap-0 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700">
            <div className="col-span-3">姓名</div>
            <div className="col-span-2">国家/城市</div>
            <div className="col-span-3">联系方式</div>
            <div className="col-span-1">年限</div>
            <div className="col-span-2">状态</div>
            <div className="col-span-1 text-right">操作</div>
          </div>
          {items.length ? (
            items.map((it) => (
              <div
                key={it.id}
                className="grid grid-cols-12 gap-0 border-b border-zinc-100 px-4 py-3 text-sm text-zinc-800 last:border-b-0"
              >
                <div className="col-span-3 truncate font-medium text-zinc-900">
                  {it.name || '未命名'}
                </div>
                <div className="col-span-2 truncate text-zinc-700">
                  {[it.country, it.city].filter(Boolean).join(' / ') || '-'}
                </div>
                <div className="col-span-3 truncate text-zinc-700">
                  {[it.email, it.phone, it.whatsapp].filter(Boolean).join(' · ') || '-'}
                </div>
                <div className="col-span-1 text-zinc-700">{it.work_years ?? '-'}</div>
                <div className="col-span-2 flex items-center gap-2">
                  <StatusBadge status={it.parse_status} />
                  {it.parse_status === 'failed' && it.parse_error ? (
                    <span className="truncate text-xs text-red-700">{it.parse_error}</span>
                  ) : null}
                </div>
                <div className="col-span-1 text-right">
                  <Link
                    to={`/resumes/${it.id}`}
                    className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    查看
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-zinc-600">
              暂无简历记录，去「导入」页添加。
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
