import StatusBadge from '@/components/StatusBadge'
import Field from '@/components/resume/Field'
import type { ResumeDetail } from '@/types/resume'

export default function BasicInfoCard({
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">基本信息</h2>
        <StatusBadge status={item.parse_status} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="姓名">
          <input
            value={effective.name || ''}
            onChange={(e) => setField('name', e.target.value || null)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="工作年限">
          <input
            value={effective.work_years ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim()
              if (!v) setField('work_years', null)
              else setField('work_years', Number(v))
            }}
            inputMode="numeric"
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="国家">
          <input
            value={effective.country || ''}
            onChange={(e) => setField('country', e.target.value || null)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="城市">
          <input
            value={effective.city || ''}
            onChange={(e) => setField('city', e.target.value || null)}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>
    </div>
  )
}

