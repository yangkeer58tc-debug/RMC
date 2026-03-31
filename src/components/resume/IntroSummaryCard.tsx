import type { ResumeDetail } from '@/types/resume'

export default function IntroSummaryCard({
  item,
  effective,
  setField,
}: {
  item: ResumeDetail
  effective: ResumeDetail
  setField: <K extends keyof ResumeDetail>(key: K, value: ResumeDetail[K]) => void
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">自我介绍摘要（原语言）</h2>
        <button
          type="button"
          onClick={async () => {
            const text = effective.intro_summary_original || ''
            if (!text) return
            await navigator.clipboard.writeText(text)
          }}
          className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
        >
          复制
        </button>
      </div>
      <textarea
        value={effective.intro_summary_original || ''}
        onChange={(e) => setField('intro_summary_original', e.target.value || null)}
        rows={6}
        className="mt-3 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
      />
      {item.intro_language ? (
        <div className="mt-2 text-xs text-zinc-500">语言识别：{item.intro_language}</div>
      ) : null}
    </div>
  )
}

